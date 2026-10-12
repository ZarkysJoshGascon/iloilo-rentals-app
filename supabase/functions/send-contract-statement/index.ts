// supabase/functions/send-contract-statement/index.ts
// Admin-only. Builds an Excel statement for one contract term and either
// returns it (mode "download", to check it first) or emails it to the
// contract's owner through Resend (mode "send", only once the contract has
// ended). Each send is recorded in contract_statements.
//
// The file lists every booking, cleaning and expense month by month and
// works each month out from those rows (data read as the signed-in admin).
// Each month is checked against the Accounting page's figures
// (contract_monthly_breakdown): a download returns any differences as
// warnings, and a send stops on them unless the admin confirms (force).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import ExcelJS from 'npm:exceljs@4.4.0'
import { corsHeaders } from '../_shared/cors.ts'
import {
  buildStatementWorkbook, computeMonth, computeTotals, enumerateMonths, formatDateText, monthLabel, round2,
} from './workbook.js'

const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const FROM_EMAIL            = Deno.env.get('FROM_EMAIL')     || 'onboarding@resend.dev'
const FROM_NAME             = Deno.env.get('FROM_NAME')      || 'Iloilo Rentals'
const DEFAULT_REPLY_TO      = Deno.env.get('REPLY_TO_EMAIL') || null
const BRAND_COLOR           = Deno.env.get('BRAND_COLOR')    || '#2d568e'

// Same split as src/lib/accounting.js.
const OWNER_SPLIT_PCT = 75
const COMPANY_SPLIT_PCT = 25

if (!RESEND_API_KEY)        throw new Error('RESEND_API_KEY is required')
if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_ANON_KEY)     throw new Error('SUPABASE_ANON_KEY is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatMoney(n: number): string {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime()
  const b = new Date(`${checkOut}T00:00:00Z`).getTime()
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0
}

// ---------------------------------------------------------------
// Data for one contract term, read as the admin (RLS applies).
// Every booking, cleaning and expense is grouped by month and the month's
// figures are worked out from those rows, so the owner can trace every
// peso. Each month is then compared with the Accounting page's figures
// (contract_monthly_breakdown); any difference comes back as a warning.
// ---------------------------------------------------------------
const DEFAULT_PM_PCT = 35

async function loadStatement(db: any, contract: any) {
  const start = contract.effective_date
  const end = contract.expiry_date || todayISO()

  const [breakdownRes, bookingsRes, cleaningsRes, manualRes, extensionsRes, pmRes] = await Promise.all([
    db.rpc('contract_monthly_breakdown', { p_contract_id: contract.id }),
    db.from('bookings')
      .select('booking_code, check_in, check_out, guests, total_amount, booker_commission, affiliate_commission, cancelled_at')
      .eq('unit_id', contract.unit_id)
      .is('deleted_at', null)
      .gte('check_in', start)
      .lte('check_in', end)
      .order('check_in', { ascending: true }),
    db.from('cleanings')
      .select('cleaning_code, scheduled_date, type, status, payment_amount, laundry_payment_amount')
      .eq('unit_id', contract.unit_id)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date', { ascending: true }),
    db.from('contract_monthly_expenses')
      .select('month, electricity, internet, water, marketing, custom_items')
      .eq('contract_id', contract.id),
    db.from('contract_extensions')
      .select('previous_expiry, new_expiry, created_at')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: true }),
    db.from('pm_contracts')
      .select('pm_id, pm_share_of_company_pct, effective_date')
      .eq('unit_id', contract.unit_id)
      .order('effective_date', { ascending: false }),
  ])

  if (breakdownRes.error) throw new Error(`Accounting figures: ${breakdownRes.error.message}`)
  if (bookingsRes.error) throw new Error(`Bookings: ${bookingsRes.error.message}`)
  if (cleaningsRes.error) throw new Error(`Cleanings: ${cleaningsRes.error.message}`)
  if (manualRes.error) throw new Error(`Expenses: ${manualRes.error.message}`)
  // Extension history and PM percentages are optional extras.

  const monthOf = (iso: string) => String(iso || '').slice(0, 7)

  const crmByMonth = new Map<string, any>()
  for (const r of breakdownRes.data || []) {
    const key = typeof r.month === 'string' ? r.month.slice(0, 7) : new Date(r.month).toISOString().slice(0, 7)
    crmByMonth.set(key, r)
  }
  const manualByMonth = new Map<string, any>()
  for (const r of manualRes.data || []) manualByMonth.set(monthOf(r.month), r)

  const pmPctFor = (pmId: string | null) => {
    if (pmRes.error) return DEFAULT_PM_PCT
    const row = (pmRes.data || []).find((p: any) => !pmId || p.pm_id === pmId)
    const pct = Number(row?.pm_share_of_company_pct)
    return Number.isFinite(pct) && pct > 0 ? pct : DEFAULT_PM_PCT
  }

  const toBooking = (b: any) => ({
    code: b.booking_code || '—',
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: nightsBetween(b.check_in, b.check_out),
    guests: Number(b.guests || 1),
    amount: Number(b.total_amount || 0),
    bookerComm: Number(b.booker_commission || 0),
    affiliateComm: Number(b.affiliate_commission || 0),
  })

  const split = { ownerSplitPct: OWNER_SPLIT_PCT, companySplitPct: COMPANY_SPLIT_PCT }
  const warnings: any[] = []

  const months = enumerateMonths(start, end).map((key: string) => {
    const monthBookings = (bookingsRes.data || []).filter((b: any) => monthOf(b.check_in) === key)
    const manual = manualByMonth.get(key) || {}
    const crm = crmByMonth.get(key) || null

    // The PM for the month is the one Accounting used.
    const hasPm = !!crm && (!!crm.pm_id || !!crm.pm_name || Number(crm.pm_share) !== 0)
    const month: any = {
      month: key,
      bookings: monthBookings.filter((b: any) => !b.cancelled_at).map(toBooking),
      cancelled: monthBookings.filter((b: any) => b.cancelled_at).map(toBooking),
      cleanings: (cleaningsRes.data || [])
        .filter((c: any) => monthOf(c.scheduled_date) === key)
        .map((c: any) => ({
          code: c.cleaning_code || '—',
          date: c.scheduled_date,
          type: c.type || '—',
          status: c.status || '—',
          housekeeping: Number(c.payment_amount || 0),
          laundry: Number(c.laundry_payment_amount || 0),
          counted: c.status !== 'cancelled',
        })),
      bills: {
        electricity: Number(manual.electricity || 0),
        internet: Number(manual.internet || 0),
        water: Number(manual.water || 0),
        marketing: Number(manual.marketing || 0),
      },
      other: (Array.isArray(manual.custom_items) ? manual.custom_items : [])
        .filter((x: any) => x && typeof x.name === 'string' && x.name.trim())
        .map((x: any) => ({ name: x.name.slice(0, 80), amount: Number(x.amount) || 0 })),
      pm: hasPm ? { name: crm.pm_name || null, pct: pmPctFor(crm.pm_id || null) } : null,
    }
    month.figures = computeMonth(month, split)

    // Does the sheet agree with the Accounting page for this month?
    const f = month.figures
    const checks: [string, number, number][] = [
      ['Gross income', f.gross, Number(crm?.gross) || 0],
      ['Total expenses', f.totalExpenses, Number(crm?.total_expenses) || 0],
      ['Net income', f.net, Number(crm?.net) || 0],
      ['PM share', f.pmShare, Number(crm?.pm_share) || 0],
    ]
    for (const [label, sheet, accounting] of checks) {
      if (Math.abs(sheet - accounting) >= 0.5) {
        warnings.push({ month: monthLabel(key), label, sheet: round2(sheet), accounting: round2(accounting) })
      }
    }
    return month
  })

  const totals = computeTotals({ months, start, end })

  return {
    contract: {
      code: contract.contract_code,
      unitCode: contract.units?.unit_code,
      building: contract.units?.building,
      ownerName: contract.owners?.name,
      start,
      end,
      extensions: extensionsRes.error ? [] : (extensionsRes.data || []),
    },
    months,
    totals,
    warnings,
    preparedOn: todayISO(),
    ownerSplitPct: OWNER_SPLIT_PCT,
    companySplitPct: COMPANY_SPLIT_PCT,
    brandColor: BRAND_COLOR,
  }
}

// ---------------------------------------------------------------
// Email
// ---------------------------------------------------------------
function renderHtml(data: any): string {
  const { contract, totals } = data
  const firstName = String(contract.ownerName || 'there').split(' ')[0]
  const period = `${formatDateText(contract.start)} – ${formatDateText(contract.end)}`
  const unitLine = [contract.unitCode, contract.building].filter(Boolean).join(' · ')
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:9px 0;font-size:13px;color:#3f3f46;border-bottom:1px solid #f1f3f6;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;font-size:${strong ? '15px' : '13px'};text-align:right;color:${strong ? BRAND_COLOR : '#0a0a0a'};
                 font-weight:${strong ? '700' : '600'};border-bottom:1px solid #f1f3f6;">${escapeHtml(value)}</td>
    </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your contract statement</title></head>
<body style="margin:0;padding:0;background:#eef1f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <tr><td style="background:${BRAND_COLOR};padding:28px 36px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">Contract statement</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;margin-top:8px;">${escapeHtml(unitLine || 'Your unit')}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">${escapeHtml(period)}</div>
        </td></tr>
        <tr><td style="padding:32px 36px 8px 36px;">
          <p style="margin:0 0 14px 0;font-size:14px;color:#0a0a0a;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin:0 0 24px 0;font-size:14px;line-height:1.7;color:#3f3f46;">
            Your contract ${escapeHtml(contract.code || '')} for ${escapeHtml(unitLine || 'your unit')} has ended.
            Here is a summary of the term. The attached Excel file lists every booking, cleaning and expense
            month by month, with how each month's net income and your share were worked out.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${row('Gross income', formatMoney(totals.gross))}
            ${row('Total expenses', formatMoney(totals.totalExpenses))}
            ${row('Net income', formatMoney(totals.net))}
            ${row(`Your share (${OWNER_SPLIT_PCT}%)`, formatMoney(totals.ownerShare), true)}
            ${row('Bookings · nights', `${totals.bookings} · ${totals.nights}`)}
          </table>
          <p style="margin:24px 0 0 0;font-size:14px;line-height:1.7;color:#3f3f46;">
            If anything looks off or you have questions, just reply to this email.
          </p>
          <p style="margin:24px 0 32px 0;font-size:14px;line-height:1.7;color:#0a0a0a;">
            Warm regards,<br><strong style="color:${BRAND_COLOR};">The Iloilo Rentals Team</strong>
          </p>
        </td></tr>
        <tr><td style="padding:18px 36px;background:#fbfbfc;border-top:1px solid #f1f3f6;text-align:center;
                       font-size:11px;color:#71717a;">
          Iloilo Rentals · Connecting You to the Best Rentals in Iloilo
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function renderText(data: any): string {
  const { contract, totals } = data
  const firstName = String(contract.ownerName || 'there').split(' ')[0]
  const unitLine = [contract.unitCode, contract.building].filter(Boolean).join(' · ')
  return [
    `Hi ${firstName},`,
    '',
    `Your contract ${contract.code || ''} for ${unitLine || 'your unit'} has ended.`,
    `Term: ${formatDateText(contract.start)} – ${formatDateText(contract.end)}`,
    '',
    `  Gross income:       ${formatMoney(totals.gross)}`,
    `  Total expenses:     ${formatMoney(totals.totalExpenses)}`,
    `  Net income:         ${formatMoney(totals.net)}`,
    `  Your share (${OWNER_SPLIT_PCT}%):  ${formatMoney(totals.ownerShare)}`,
    `  Bookings · nights:  ${totals.bookings} · ${totals.nights}`,
    '',
    'The attached Excel file lists every booking, cleaning and expense month by month, with how each month was worked out.',
    'If anything looks off or you have questions, just reply to this email.',
    '',
    'Warm regards,',
    'The Iloilo Rentals Team',
  ].join('\n')
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

    const { data: adminRow } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!adminRow) return json({ error: 'Not an admin' }, 403)

    // Reads run as the admin, exactly like the CRM.
    const db = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const body = await req.json().catch(() => ({}))
    const contractId = typeof body.contract_id === 'string' ? body.contract_id : null
    const mode = body.mode === 'send' ? 'send' : 'download'
    const force = body.force === true
    if (!contractId) return json({ error: 'contract_id is required' }, 400)

    const { data: contract, error: cErr } = await db
      .from('contracts')
      .select('id, contract_code, unit_id, effective_date, expiry_date, units:unit_id ( unit_code, building ), owners:owner_id ( id, name, email )')
      .eq('id', contractId)
      .maybeSingle()
    if (cErr) return json({ error: `Failed to load contract: ${cErr.message}` }, 500)
    if (!contract) return json({ error: 'Contract not found' }, 404)
    if (!contract.effective_date) return json({ error: 'This contract has no start date' }, 400)

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

    const data = await loadStatement(db, contract)

    // Don't email figures that disagree with Accounting unless the admin says so.
    if (mode === 'send' && data.warnings.length > 0 && !force) {
      return json({
        error: 'The statement differs from the Accounting page for some months.',
        code: 'mismatch',
        warnings: data.warnings,
      }, 409)
    }

    const workbook = buildStatementWorkbook(ExcelJS, data)
    const buffer = await workbook.xlsx.writeBuffer()
    const file = encodeBase64(new Uint8Array(buffer as ArrayBuffer))
    const safe = (s: string) => String(s || '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const filename = `Statement-${safe(contract.units?.unit_code || 'unit')}-${safe(contract.contract_code || contract.id)}.xlsx`

    if (mode === 'download') {
      return json({ ok: true, filename, file, totals: data.totals, warnings: data.warnings })
    }

    const subject = `Your statement for ${contract.units?.unit_code || 'your unit'} · ${formatDateText(data.contract.start)} – ${formatDateText(data.contract.end)}`

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

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [ownerEmail],
        subject,
        html: renderHtml(data),
        text: renderText(data),
        attachments: [{ filename, content: file }],
        ...(DEFAULT_REPLY_TO ? { reply_to: DEFAULT_REPLY_TO } : {}),
      }),
    })
    const resendData = await resendRes.json().catch(() => ({}))

    if (!resendRes.ok) {
      await admin.from('contract_statements').update({
        status: 'failed',
        error_message: resendData?.message || `HTTP ${resendRes.status}`,
      }).eq('id', logRow.id)
      console.error('Resend error:', resendData)
      return json({ error: resendData?.message || 'Failed to send email' }, 502)
    }

    const sentAt = new Date().toISOString()
    await admin.from('contract_statements').update({
      status: 'sent',
      resend_id: resendData?.id || null,
      sent_at: sentAt,
    }).eq('id', logRow.id)

    return json({ ok: true, to: ownerEmail, sent_at: sentAt, filename, totals: data.totals })
  } catch (err) {
    console.error('send-contract-statement error:', err)
    return json({ error: (err as Error)?.message || 'Internal server error' }, 500)
  }
})
