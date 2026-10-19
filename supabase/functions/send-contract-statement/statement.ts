// supabase/functions/send-contract-statement/statement.ts
// The owner's statement for one contract term: reading its data, building
// the Excel file, emailing it, and keeping copies. Used by this function (the
// CRM's Download / Email buttons and the owner portal) and by the nightly
// contract-closeout function.

import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import ExcelJS from 'npm:exceljs@4.4.0'
import {
  BILLS, buildStatementWorkbook, computeMonth, computeTotals, enumerateMonths, formatDateText, imageInfo, monthLabel, round2,
} from './workbook.js'

const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL            = Deno.env.get('FROM_EMAIL')     || 'onboarding@resend.dev'
const FROM_NAME             = Deno.env.get('FROM_NAME')      || 'Iloilo Rentals'
const DEFAULT_REPLY_TO      = Deno.env.get('REPLY_TO_EMAIL') || null
const BRAND_COLOR           = Deno.env.get('BRAND_COLOR')    || '#2d568e'
// Google Drive copies (optional): the Apps Script web app in drive-copy.gs.
const DRIVE_UPLOAD_URL      = Deno.env.get('DRIVE_UPLOAD_URL')    || ''
const DRIVE_UPLOAD_SECRET   = Deno.env.get('DRIVE_UPLOAD_SECRET') || ''

// Same split as src/lib/domain/accounting.js.
export const OWNER_SPLIT_PCT = 75
const COMPANY_SPLIT_PCT = 25

if (!RESEND_API_KEY)        throw new Error('RESEND_API_KEY is required')

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatMoney(n: number): string {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Today's date in Manila, whatever the server's clock. */
export function manilaToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
}

// Times as they read in Iloilo, whatever the server's clock.
function manilaDateTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function manilaTime(ts: string | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
}

// "Bath towel ×2, Bedsheet ×1" from a cleaning's item list.
function itemsText(raw: any): string {
  return (Array.isArray(raw) ? raw : [])
    .filter((x: any) => x && typeof x.name === 'string' && x.name.trim())
    .map((x: any) => `${x.name.trim().slice(0, 60)} ×${Number(x.quantity) || 0}`)
    .join(', ')
}

// "₱1,500.00 · GCash · Oct 2, 2026; ..." from a booking's payments (no reference numbers).
function paymentsText(raw: any): string {
  return (Array.isArray(raw) ? raw : [])
    .filter((t: any) => Number(t?.amount) > 0)
    .map((t: any) => [
      `₱${Number(t.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      typeof t.method === 'string' && t.method.trim() ? t.method.trim().slice(0, 40) : '',
      t.date ? formatDateText(t.date) : '',
    ].filter(Boolean).join(' · '))
    .join('; ')
}

const sentence = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '')
const ratePct = (r: any) => (r == null || r === '' ? '' : `${Number(r)}%`)

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime()
  const b = new Date(`${checkOut}T00:00:00Z`).getTime()
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0
}

// ---------------------------------------------------------------
// Receipt photos, for the Receipts sheet. They are put in the file as they
// were uploaded (the CRM stores new ones as JPEGs of at most 1600 px, about
// 300 KB), with limits so the file can still be emailed: Resend takes up to
// 40 MB, and attachments grow by a third when encoded.
// ---------------------------------------------------------------
const RECEIPTS_BUCKET = 'expense-proofs'
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024
const RECEIPTS_MAX_BYTES = 20 * 1024 * 1024
const SEE_PORTAL = 'It can be viewed in the owner portal.'

async function attachReceiptPhotos(storage: any, months: any[]) {
  const receipts = months.flatMap((m) => m.receipts)
  let total = 0
  for (let i = 0; i < receipts.length; i += 6) {
    const batch = receipts.slice(i, i + 6)
    if (total >= RECEIPTS_MAX_BYTES) {
      for (const r of batch) r.note = `Left out to keep the file small enough to email. ${SEE_PORTAL}`
      continue
    }
    const files = await Promise.all(batch.map((r: any) => storage.from(RECEIPTS_BUCKET).download(r.path).catch((error: any) => ({ error }))))
    for (let j = 0; j < batch.length; j++) {
      const r = batch[j]
      const blob = files[j]?.data
      if (!blob) { r.note = 'The photo could not be found.'; continue }
      if (blob.size > RECEIPT_MAX_BYTES) { r.note = `The photo is too large to include. ${SEE_PORTAL}`; continue }
      if (total + blob.size > RECEIPTS_MAX_BYTES) { r.note = `Left out to keep the file small enough to email. ${SEE_PORTAL}`; continue }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const info = imageInfo(bytes)
      if (!info) { r.note = `Excel can't show this photo's format. ${SEE_PORTAL}`; continue }
      r.image = { buffer: bytes, ...info }
      total += bytes.length
    }
  }
}

// ---------------------------------------------------------------
// Data for one contract term, read as the admin (RLS applies).
// Every booking, cleaning and expense is grouped by month and the month's
// figures are worked out from those rows, so the owner can trace every
// peso. Each month is then compared with the Accounting page's figures
// (contract_monthly_breakdown); any difference comes back as a warning.
// ---------------------------------------------------------------
const DEFAULT_PM_PCT = 35

// `storage` reads the receipt photos: the service client, since the caller's
// right to this contract has been checked before this runs.
export async function loadStatement(db: any, contract: any, storage: any) {
  const start = contract.effective_date
  const end = contract.expiry_date || todayISO()

  const [breakdownRes, bookingsRes, cleaningsRes, manualRes, pmRes] = await Promise.all([
    db.rpc('contract_monthly_breakdown', { p_contract_id: contract.id }),
    db.from('bookings')
      .select(`booking_code, guest_name, check_in, check_out, guests, total_amount, amount_paid, balance, payment_status, transactions,
        booker_name, booker_code, booker_rate, booker_commission, affiliate_name, affiliate_code, affiliate_rate, affiliate_commission,
        cancelled_at, cancelled_reason, completed_at, created_at, checked_out_at, late_checkout_at`)
      .eq('unit_id', contract.unit_id)
      .is('deleted_at', null)
      .gte('check_in', start)
      .lte('check_in', end)
      .order('check_in', { ascending: true }),
    db.from('cleanings')
      .select(`cleaning_code, scheduled_date, type, status, payment_amount, laundry_payment_amount,
        submitted_at, completed_at, paid_at, laundry_paid_at, guest_left_at,
        laundry_used_items, laundry_replaced_items, amenities_used_items, amenities_replaced_items,
        bookings:booking_id ( booking_code, guest_name )`)
      .eq('unit_id', contract.unit_id)
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date', { ascending: true }),
    db.from('contract_monthly_expenses')
      .select('month, electricity, electricity_image, internet, internet_image, water, water_image, marketing, marketing_image, custom_items')
      .eq('contract_id', contract.id),
    db.from('pm_contracts')
      .select('pm_id, pm_share_of_company_pct, effective_date')
      .eq('unit_id', contract.unit_id)
      .order('effective_date', { ascending: false }),
  ])

  if (breakdownRes.error) throw new Error(`Accounting figures: ${breakdownRes.error.message}`)
  if (bookingsRes.error) throw new Error(`Bookings: ${bookingsRes.error.message}`)
  if (cleaningsRes.error) throw new Error(`Cleanings: ${cleaningsRes.error.message}`)
  if (manualRes.error) throw new Error(`Expenses: ${manualRes.error.message}`)
  // PM percentages are an optional extra.

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
        .map((x: any) => ({ name: x.name.slice(0, 80), amount: Number(x.amount) || 0, receipt: typeof x.image === 'string' && x.image ? x.image : null })),
      pm: hasPm ? { name: crm.pm_name || null, pct: pmPctFor(crm.pm_id || null) } : null,
    }
    month.figures = computeMonth(month, split)
    // Each bill or expense with a photo; the photos are fetched below.
    month.receipts = [
      ...BILLS.filter((b: any) => manual[`${b.key}_image`])
        .map((b: any) => ({ item: b.label, amount: month.figures[b.key], ref: b.key, path: manual[`${b.key}_image`] })),
      ...month.other.flatMap((o: any, i: number) => (o.receipt ? [{ item: o.name, amount: o.amount, ref: `other:${i}`, path: o.receipt }] : [])),
    ]

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
  await attachReceiptPhotos(storage, months)
  const receiptPhotos = months.reduce((n: number, m: any) => n + m.receipts.filter((r: any) => r.image).length, 0)

  // Every booking and cleaning of the term in full, for the detail sheets.
  // Guest names are shown, as in the owner portal; guest emails and phone
  // numbers, staff notes and payment reference numbers are not.
  const bookingDetails = (bookingsRes.data || []).map((b: any) => {
    const amount = Number(b.total_amount || 0)
    const cancelled = !!b.cancelled_at
    const bookerComm = cancelled ? 0 : Number(b.booker_commission || 0)
    const affiliateComm = cancelled ? 0 : Number(b.affiliate_commission || 0)
    return {
      code: b.booking_code || '—',
      guest: b.guest_name || '',
      guests: Number(b.guests || 1),
      checkIn: b.check_in,
      checkOut: b.check_out,
      nights: nightsBetween(b.check_in, b.check_out),
      checkoutTime: b.late_checkout_at ? `${manilaTime(b.late_checkout_at)} (late)` : '11:00 AM',
      checkedOut: manilaDateTime(b.checked_out_at),
      amount,
      paid: Number(b.amount_paid || 0),
      balance: Number(b.balance || 0),
      paymentStatus: sentence(b.payment_status),
      payments: paymentsText(b.transactions),
      booker: b.booker_name || b.booker_code || '',
      bookerRate: ratePct(b.booker_rate),
      bookerComm,
      affiliate: b.affiliate_name || b.affiliate_code || '',
      affiliateRate: ratePct(b.affiliate_rate),
      affiliateComm,
      afterCommissions: cancelled ? 0 : round2(amount - bookerComm - affiliateComm),
      status: cancelled ? 'Cancelled, not counted' : b.completed_at ? 'Done' : 'Counted',
      cancelledOn: cancelled ? manilaDateTime(b.cancelled_at) : '',
      cancelReason: b.cancelled_reason || '',
      doneOn: manilaDateTime(b.completed_at),
      bookedOn: manilaDateTime(b.created_at),
      counted: !cancelled,
    }
  })

  const cleaningDetails = (cleaningsRes.data || []).map((c: any) => {
    const housekeeping = Number(c.payment_amount || 0)
    const laundry = Number(c.laundry_payment_amount || 0)
    return {
      code: c.cleaning_code || '—',
      date: c.scheduled_date,
      type: sentence(c.type) || '—',
      status: sentence(c.status) || '—',
      booking: c.bookings?.booking_code || 'Standalone',
      guest: c.bookings?.guest_name || '',
      guestLeft: manilaDateTime(c.guest_left_at),
      submitted: manilaDateTime(c.submitted_at),
      completed: manilaDateTime(c.completed_at),
      housekeeping,
      housekeepingPaid: manilaDateTime(c.paid_at),
      laundry,
      laundryPaid: manilaDateTime(c.laundry_paid_at),
      total: round2(housekeeping + laundry),
      laundryUsed: itemsText(c.laundry_used_items),
      laundryReplaced: itemsText(c.laundry_replaced_items),
      amenitiesUsed: itemsText(c.amenities_used_items),
      amenitiesReplaced: itemsText(c.amenities_replaced_items),
      counted: c.status !== 'cancelled',
    }
  })

  return {
    contract: {
      code: contract.contract_code,
      unitCode: contract.units?.unit_code,
      building: contract.units?.building,
      ownerName: contract.owners?.name,
      start,
      end,
      previousEnds: Array.isArray(contract.previous_expiry_dates) ? contract.previous_expiry_dates : [],
    },
    months,
    totals,
    receiptPhotos,
    bookingDetails,
    cleaningDetails,
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
            month by month, with how each month's net income and your share were worked out${data.receiptPhotos ? ', and photos of the receipts' : ''}.
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
    `The attached Excel file lists every booking, cleaning and expense month by month, with how each month was worked out${data.receiptPhotos ? ', and photos of the receipts' : ''}.`,
    'If anything looks off or you have questions, just reply to this email.',
    '',
    'Warm regards,',
    'The Iloilo Rentals Team',
  ].join('\n')
}

// ---------------------------------------------------------------
// Building, emailing and keeping a statement
// ---------------------------------------------------------------
export const CONTRACT_SELECT =
  'id, contract_code, unit_id, effective_date, expiry_date, previous_expiry_dates, records_cleared_at, records_archive_path, ' +
  'units:unit_id ( unit_code, building ), owners:owner_id ( id, name, email )'

const STATEMENT_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const KEPT_BUCKET = 'contract-statements'

const safeName = (s: string) => String(s || '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

/** The statement as an Excel file: its data (totals, warnings), bytes, base64 and file name. */
export async function buildStatementFile(db: any, contract: any, storage: any) {
  const data = await loadStatement(db, contract, storage)
  const workbook = buildStatementWorkbook(ExcelJS, data)
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer() as ArrayBuffer)
  const filename = `Statement-${safeName(contract.units?.unit_code || 'unit')}-${safeName(contract.contract_code || contract.id)}.xlsx`
  return { data, bytes, base64: encodeBase64(bytes), filename }
}

/** Emails a built statement to the owner through Resend. */
export async function emailStatement(to: string, built: { data: any; base64: string; filename: string }) {
  const { data } = built
  const subject = `Your statement for ${data.contract.unitCode || 'your unit'} · ${formatDateText(data.contract.start)} – ${formatDateText(data.contract.end)}`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html: renderHtml(data),
      text: renderText(data),
      attachments: [{ filename: built.filename, content: built.base64 }],
      ...(DEFAULT_REPLY_TO ? { reply_to: DEFAULT_REPLY_TO } : {}),
    }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) console.error('Resend error:', out)
  return res.ok
    ? { ok: true as const, id: (out?.id as string) || null }
    : { ok: false as const, error: (out?.message as string) || `HTTP ${res.status}` }
}

/**
 * Keeps a copy of a built statement in the private contract-statements
 * bucket, as <contract id>/<date> <label> <file name>, and in Google Drive's
 * "Contracts" folder (one folder per unit) once the Drive script is set up.
 * The bucket copy must succeed; the Drive copy is best effort.
 */
export async function keepStatementCopy(storage: any, contract: any, built: { bytes: Uint8Array; base64: string; filename: string }, label: 'Sent' | 'Final') {
  const name = `${manilaToday()} ${label} ${built.filename}`
  const path = `${contract.id}/${name}`
  const { error } = await storage.from(KEPT_BUCKET).upload(path, built.bytes, { contentType: STATEMENT_MIME, upsert: true })
  if (error) throw new Error(`Could not keep a copy of the statement: ${error.message}`)

  let driveUrl: string | null = null
  if (DRIVE_UPLOAD_URL && DRIVE_UPLOAD_SECRET) {
    try {
      const res = await fetch(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: DRIVE_UPLOAD_SECRET, folder: contract.units?.unit_code || 'Other', filename: name, file: built.base64 }),
      })
      const out = await res.json().catch(() => null)
      if (out?.ok && out.url) driveUrl = out.url
      else console.error('Google Drive copy failed:', res.status, out?.error || '')
    } catch (err) {
      console.error('Google Drive copy failed:', err)
    }
  }
  return { path, driveUrl }
}

/** A kept copy, as base64 and its file name (for downloads once the records are cleared). */
export async function readKeptCopy(storage: any, path: string) {
  const { data, error } = await storage.from(KEPT_BUCKET).download(path)
  if (error || !data) throw new Error('The kept copy of this statement could not be found.')
  return { base64: encodeBase64(new Uint8Array(await data.arrayBuffer())), filename: path.split('/').pop()! }
}
