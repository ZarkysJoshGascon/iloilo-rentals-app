// supabase/functions/contract-closeout/index.ts
// Runs every night at 01:00 Manila (pg_cron, see the migration
// 20261019000005_contract_closeout.sql). For each contract that has ended,
// from CLOSEOUT_FROM on:
//
//   1. Not emailed yet: builds the statement and emails it to the owner,
//      then keeps a copy (contract-statements bucket, and Google Drive when
//      set up). Held instead, with the reason logged for an admin, when its
//      figures differ from the Accounting page or the owner has no email.
//   2. Emailed CLEAR_AFTER_DAYS ago or more: keeps a final copy (made now,
//      so it matches what goes), deletes the cleanings' photos, then the
//      term's bookings and cleanings (closeout_delete_records). While a
//      balance is owed, a cleaning isn't approved or staff pay isn't paid, it
//      waits and says why on the contract (closeout_note).
//
// An admin can call it with any body to see what it would do; only the
// nightly job acts ({ "dry": true } makes the job just report too).
// Keep it deployed WITH JWT verification: the job's service-role key is
// trusted because Supabase checks its signature before this code runs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  CONTRACT_SELECT, EMAIL_RE, buildStatementFile, emailStatement, keepStatementCopy, manilaToday,
} from '../send-contract-statement/statement.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

// Contracts that ended before this are left as they were.
const CLOSEOUT_FROM = '2026-10-19'
const CLEAR_AFTER_DAYS = 30
const DAY_MS = 86_400_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// The token's role, read without checking it: the gateway already has.
function tokenRole(token: string): string | null {
  try {
    const part = token.split('.')[1]
    const pad = part + '='.repeat((4 - (part.length % 4)) % 4)
    return JSON.parse(atob(pad.replace(/-/g, '+').replace(/_/g, '/'))).role || null
  } catch {
    return null
  }
}

// When a term is over: midnight in Manila after its last day.
const termOver = (expiry: string) => Date.parse(`${expiry}T16:00:00Z`)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Report = {
  dry: boolean
  sent: unknown[]
  held: unknown[]
  cleared: unknown[]
  waiting: unknown[]
  errors: unknown[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing auth token' }, 401)

  const nightly = tokenRole(token) === 'service_role'
  if (!nightly) {
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json({ error: 'Invalid session' }, 401)
    const { data: adminRow } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!adminRow) return json({ error: 'Not allowed' }, 403)
  }
  const body = await req.json().catch(() => ({}))
  const dry = !nightly || body?.dry === true

  const report: Report = { dry, sent: [], held: [], cleared: [], waiting: [], errors: [] }

  const { data: contracts, error } = await admin
    .from('contracts')
    .select(CONTRACT_SELECT)
    .gte('expiry_date', CLOSEOUT_FROM)
    .lt('expiry_date', manilaToday())
    .is('records_cleared_at', null)
  if (error) return json({ error: `Failed to load contracts: ${error.message}` }, 500)

  for (const contract of contracts || []) {
    const code = contract.contract_code || contract.id
    try {
      const { data: rows, error: rowsErr } = await admin
        .from('contract_statements')
        .select('id, status, sent_at')
        .eq('contract_id', contract.id)
        .order('created_at', { ascending: false })
      if (rowsErr) throw rowsErr
      // A statement emailed after the term was over covers all of it.
      const sent = (rows || []).find((r) => r.status === 'sent' && r.sent_at && Date.parse(r.sent_at) >= termOver(contract.expiry_date))

      if (!sent) await sendStatement(admin, contract, rows || [], report)
      else if (Date.now() - Date.parse(sent.sent_at) >= CLEAR_AFTER_DAYS * DAY_MS) await clearRecords(admin, contract, report)
    } catch (err) {
      console.error(`contract-closeout ${code}:`, err)
      report.errors.push({ contract: code, error: (err as Error)?.message || String(err) })
    }
  }

  return json(report)
})

// 1. Email the statement, or hold it with the reason.
async function sendStatement(admin: any, contract: any, rows: any[], report: Report) {
  const code = contract.contract_code || contract.id
  const to = String(contract.owners?.email || '').trim().toLowerCase()

  const hold = async (reason: string, totals: unknown = null) => {
    report.held.push({ contract: code, reason })
    if (report.dry) return
    // One held entry at a time: refreshed each night rather than added again.
    if (rows[0]?.status === 'held') {
      await admin.from('contract_statements').update({ error_message: reason, totals, created_at: new Date().toISOString() }).eq('id', rows[0].id)
    } else {
      await admin.from('contract_statements').insert({
        contract_id: contract.id, sent_to: to, status: 'held', automatic: true, error_message: reason, totals,
        sent_by_email: 'Nightly close-out',
      })
    }
  }

  if (!EMAIL_RE.test(to)) {
    return hold('The owner has no email address. Add one in Registry, then email the statement from the contract.')
  }
  const built = await buildStatementFile(admin, contract, admin.storage)
  const warnings = built.data.warnings || []
  if (warnings.length > 0) {
    const months = new Set(warnings.map((w: any) => w.month)).size
    return hold(`Its figures differ from the Accounting page for ${plural(months, 'month')}. Download it to check, then email it from the contract.`, built.data.totals)
  }

  if (report.dry) {
    report.sent.push({ contract: code, to })
    return
  }

  const { data: logRow, error: logErr } = await admin
    .from('contract_statements')
    .insert({
      contract_id: contract.id, sent_to: to, status: 'queued', automatic: true, totals: built.data.totals,
      sent_by_email: 'Nightly close-out',
    })
    .select('id')
    .single()
  if (logErr) throw logErr

  const result = await emailStatement(to, built)
  if (!result.ok) {
    await admin.from('contract_statements').update({ status: 'failed', error_message: result.error }).eq('id', logRow.id)
    throw new Error(`Email failed: ${result.error}`)
  }

  let kept: { path: string | null; driveUrl: string | null } = { path: null, driveUrl: null }
  try {
    kept = await keepStatementCopy(admin.storage, contract, built, 'Sent')
  } catch (err) {
    console.error(err) // the email has gone; the final copy is kept before anything is cleared
  }
  await admin.from('contract_statements').update({
    status: 'sent', resend_id: result.id, sent_at: new Date().toISOString(), file_path: kept.path, drive_url: kept.driveUrl,
  }).eq('id', logRow.id)
  report.sent.push({ contract: code, to })
}

// 2. Clear the term's bookings and cleanings, or say what they wait for.
async function clearRecords(admin: any, contract: any, report: Report) {
  const code = contract.contract_code || contract.id
  const { data: scope, error } = await admin.rpc('closeout_scope', { p_contract_id: contract.id })
  if (error) throw error

  const unfinished = [
    scope.unpaid_bookings > 0 && `${plural(scope.unpaid_bookings, 'booking')} with a balance still owed`,
    scope.open_cleanings > 0 && `${plural(scope.open_cleanings, 'cleaning')} not yet approved`,
    scope.unpaid_cleanings > 0 && `${plural(scope.unpaid_cleanings, 'cleaning')} with housekeeping or laundry pay not yet paid`,
  ].filter(Boolean)
  if (unfinished.length > 0) {
    const note = `Bookings and cleanings are kept until these are settled: ${unfinished.join('; ')}.`
    report.waiting.push({ contract: code, note })
    if (!report.dry) await admin.rpc('closeout_set_note', { p_contract_id: contract.id, p_note: note })
    return
  }

  if (report.dry) {
    report.cleared.push({ contract: code, bookings: scope.bookings.length, cleanings: scope.cleanings.length })
    return
  }

  // A final copy first, made now so it matches exactly what is deleted.
  const built = await buildStatementFile(admin, contract, admin.storage)
  const kept = await keepStatementCopy(admin.storage, contract, built, 'Final')
  // Then the photos (while the cleanings still say where they are), then the rows.
  const photos = await deleteCleaningPhotos(admin, scope.cleanings)
  const { data: counts, error: delErr } = await admin.rpc('closeout_delete_records', {
    p_contract_id: contract.id, p_archive_path: kept.path, p_archive_drive_url: kept.driveUrl, p_photos: photos,
  })
  if (delErr) throw delErr
  report.cleared.push({ contract: code, ...counts, photos })
}

// Every photo the cleanings point to: their photo lists and single photos.
const PHOTO_COLUMNS = ['photos_before', 'photos_after', 'photos_report', 'amenities_used_photo', 'amenities_replaced_photo', 'laundry_used_photo', 'laundry_replaced_photo']

async function deleteCleaningPhotos(admin: any, cleaningIds: string[]) {
  let removed = 0
  for (let i = 0; i < cleaningIds.length; i += 100) {
    const { data: rows, error } = await admin.from('cleanings').select(PHOTO_COLUMNS.join(', ')).in('id', cleaningIds.slice(i, i + 100))
    if (error) throw error
    const paths: string[] = []
    for (const row of rows || []) {
      for (const column of PHOTO_COLUMNS) {
        for (const photo of [row[column]].flat()) {
          if (photo && typeof photo.path === 'string' && photo.path) paths.push(photo.path)
        }
      }
    }
    for (let j = 0; j < paths.length; j += 100) {
      const { error: rmErr } = await admin.storage.from('cleaning-photos').remove(paths.slice(j, j + 100))
      if (rmErr) throw new Error(`Deleting cleaning photos failed: ${rmErr.message}`)
    }
    removed += paths.length
  }
  return removed
}
