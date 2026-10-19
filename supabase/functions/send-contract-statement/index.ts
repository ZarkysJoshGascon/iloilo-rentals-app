// supabase/functions/send-contract-statement/index.ts
// Builds the Excel statement for one contract term (statement.ts) and either
// returns it (mode "download": admins, and owners for their own contracts) or
// emails it to the contract's owner through Resend (mode "send": admins, once
// the contract has ended). Each send is recorded in contract_statements, with
// a copy kept (contract-statements bucket, and Google Drive when set up).
// The nightly contract-closeout function sends statements automatically;
// once it has cleared a term's records, downloads return the final copy it
// kept.
//
// The file lists every booking, cleaning and expense month by month and
// works each month out from those rows (data read as the signed-in admin).
// Each month is checked against the Accounting page's figures
// (contract_monthly_breakdown): a download returns any differences as
// warnings, and a send stops on them unless the admin confirms (force).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  CONTRACT_SELECT, EMAIL_RE, buildStatementFile, emailStatement, keepStatementCopy, readKeptCopy, todayISO,
} from './statement.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_ANON_KEY)     throw new Error('SUPABASE_ANON_KEY is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------
// Handler
// ---------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > 16_384) return json({ error: 'Request body too large' }, 413)

  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE!, { auth: { persistSession: false } })

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing auth token' }, 401)

    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid session' }, 401)

    const body = await req.json().catch(() => ({}))
    const contractId = typeof body.contract_id === 'string' ? body.contract_id : null
    const mode = body.mode === 'send' ? 'send' : 'download'
    const force = body.force === true
    if (!contractId) return json({ error: 'contract_id is required' }, 400)

    const { data: adminRow } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()

    // Owners (owner portal) may download the statement of their own contract,
    // but not email it. Their reads use the service client once ownership is
    // confirmed, since the tables are admin-only.
    let isOwnerOfContract = false
    if (!adminRow) {
      const { data: owned } = await admin
        .from('contracts')
        .select('id, owners:owner_id!inner ( user_id )')
        .eq('id', contractId)
        .eq('owners.user_id', user.id)
        .maybeSingle()
      isOwnerOfContract = !!owned
      if (!isOwnerOfContract) return json({ error: 'Not allowed' }, 403)
      if (mode !== 'download') return json({ error: 'Only the statement download is available to owners' }, 403)
    }

    // Admins read as themselves, exactly like the CRM.
    const db = isOwnerOfContract
      ? admin
      : createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        })

    const { data: contract, error: cErr } = await db
      .from('contracts')
      .select(CONTRACT_SELECT)
      .eq('id', contractId)
      .maybeSingle()
    if (cErr) return json({ error: `Failed to load contract: ${cErr.message}` }, 500)
    if (!contract) return json({ error: 'Contract not found' }, 404)
    if (!contract.effective_date) return json({ error: 'This contract has no start date' }, 400)

    // Once the term's records are cleared (contract-closeout), the statement
    // can't be rebuilt: the final copy kept at that moment is served instead.
    if (contract.records_cleared_at) {
      if (mode === 'send') return json({ error: "This contract's records were cleared. Download the kept copy and forward it instead." }, 400)
      if (!contract.records_archive_path) return json({ error: 'No copy of this statement was kept.' }, 404)
      const kept = await readKeptCopy(admin.storage, contract.records_archive_path)
      return json({ ok: true, filename: kept.filename, file: kept.base64, totals: null, warnings: [], archived: true })
    }

    const ownerEmail = String(contract.owners?.email || '').trim().toLowerCase()
    if (mode === 'send') {
      if (!contract.expiry_date || contract.expiry_date >= todayISO()) {
        return json({ error: 'The statement can be emailed once the contract has ended.' }, 400)
      }
      if (!EMAIL_RE.test(ownerEmail)) return json({ error: 'The owner has no valid email address.' }, 400)

      // Guard against double clicks.
      const since = new Date(Date.now() - 60_000).toISOString()
      const { data: recent } = await admin
        .from('contract_statements')
        .select('id')
        .eq('contract_id', contract.id)
        .in('status', ['queued', 'sent'])
        .gte('created_at', since)
        .limit(1)
      if (recent && recent.length > 0) return json({ error: 'A statement was just sent. Please wait a minute.' }, 429)
    }

    const built = await buildStatementFile(db, contract, admin.storage)
    const { data } = built

    // Don't email figures that disagree with Accounting unless the admin says so.
    if (mode === 'send' && data.warnings.length > 0 && !force) {
      return json({
        error: 'The statement differs from the Accounting page for some months.',
        code: 'mismatch',
        warnings: data.warnings,
      }, 409)
    }

    if (mode === 'download') {
      return json({ ok: true, filename: built.filename, file: built.base64, totals: data.totals, warnings: data.warnings })
    }

    const { data: logRow, error: logErr } = await admin
      .from('contract_statements')
      .insert({
        contract_id: contract.id,
        sent_to: ownerEmail,
        status: 'queued',
        totals: data.totals,
        sent_by: user.id,
        sent_by_email: user.email,
      })
      .select('id')
      .single()
    if (logErr) {
      console.error('statement log insert failed:', logErr)
      return json({ error: 'Could not record the send. Has the contract_statements migration been run?' }, 500)
    }

    const sent = await emailStatement(ownerEmail, built)
    if (!sent.ok) {
      await admin.from('contract_statements').update({ status: 'failed', error_message: sent.error }).eq('id', logRow.id)
      return json({ error: sent.error || 'Failed to send email' }, 502)
    }

    // Keep a copy of what the owner received. The email has gone either way.
    let kept: { path: string | null; driveUrl: string | null } = { path: null, driveUrl: null }
    try {
      kept = await keepStatementCopy(admin.storage, contract, built, 'Sent')
    } catch (err) {
      console.error(err)
    }

    const sentAt = new Date().toISOString()
    await admin.from('contract_statements').update({
      status: 'sent',
      resend_id: sent.id,
      sent_at: sentAt,
      file_path: kept.path,
      drive_url: kept.driveUrl,
    }).eq('id', logRow.id)

    return json({ ok: true, to: ownerEmail, sent_at: sentAt, filename: built.filename, totals: data.totals })
  } catch (err) {
    console.error('send-contract-statement error:', err)
    return json({ error: (err as Error)?.message || 'Internal server error' }, 500)
  }
})
