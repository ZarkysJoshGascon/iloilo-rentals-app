// supabase/functions/send-contract-statement/workbook.js
// Builds the owner's Excel statement for one contract term. Plain JS with
// ExcelJS passed in, so the same code runs in the Edge Function (Deno,
// npm:exceljs) and in a local Node check.
//
// Sheets: Summary · Monthly · Bookings · Cleanings · Other expenses.
// Guest names and contact details are left out on purpose, and so is the
// property manager's cut, which is internal to the company share.

const MONEY = '"₱"#,##0.00'
const DATE = 'mmm d, yyyy'
const PERCENT = '0%'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDate(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateText(iso) {
  const d = toDate(iso)
  if (!d) return '—'
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** 'YYYY-MM' keys from the month of `start` to the month of `end`. */
export function enumerateMonths(start, end) {
  const s = toDate(start)
  const e = toDate(end)
  if (!s || !e || e < s) return []
  const out = []
  const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1))
  const last = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 1)
  for (let i = 0; i < 480 && cur.getTime() <= last; i++) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`)
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

/** Nights of a stay that fall inside [start, end] (end inclusive). */
export function nightsWithin(checkIn, checkOut, start, end) {
  const ci = toDate(checkIn)
  const co = toDate(checkOut)
  const s = toDate(start)
  const e = toDate(end)
  if (!ci || !co || !s || !e) return 0
  const endExclusive = new Date(e.getTime() + 86_400_000)
  const from = ci > s ? ci : s
  const to = co < endExclusive ? co : endExclusive
  return to > from ? Math.round((to - from) / 86_400_000) : 0
}

function sum(rows, key) {
  return rows.reduce((t, r) => t + (Number(r[key]) || 0), 0)
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/** Totals for the Summary sheet and the email. */
export function computeTotals({ months, bookings, start, end, ownerSplitPct, companySplitPct }) {
  const keys = [
    'gross', 'bookingComm', 'affiliateComm', 'housekeeping', 'laundry',
    'electricity', 'internet', 'water', 'marketing', 'other', 'totalExpenses', 'net',
  ]
  const totals = {}
  for (const k of keys) totals[k] = round2(sum(months, k))
  totals.ownerShare = round2(totals.net * (ownerSplitPct / 100))
  totals.companyShare = round2(totals.net * (companySplitPct / 100))
  totals.bookings = bookings.length
  totals.nights = bookings.reduce((t, b) => t + nightsWithin(b.checkIn, b.checkOut, start, end), 0)
  const s = toDate(start)
  const e = toDate(end)
  const days = s && e && e >= s ? Math.round((e - s) / 86_400_000) + 1 : 0
  totals.days = days
  totals.occupancy = days > 0 ? Math.min(1, totals.nights / days) : 0
  return totals
}

// ── styling helpers ─────────────────────────────────────────
function argb(hex) {
  return `FF${String(hex || '#2d568e').replace('#', '').toUpperCase()}`
}

function styleHeaderRow(row, brand) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(brand) } }
    cell.alignment = { vertical: 'middle' }
  })
  row.height = 20
}

function styleTotalRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true }
    cell.border = { top: { style: 'thin', color: { argb: 'FF999999' } } }
  })
}

// A table sheet: header row, data rows, optional totals row.
function addTable(wb, name, brand, columns, rows, totalsRow) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 14, style: c.style || {} }))
  styleHeaderRow(ws.getRow(1), brand)
  for (const r of rows) ws.addRow(r)
  if (rows.length === 0) {
    const empty = ws.addRow({ [columns[0].key]: 'Nothing in this term' })
    empty.font = { italic: true }
  } else if (totalsRow) {
    styleTotalRow(ws.addRow(totalsRow))
  }
  return ws
}

/**
 * data: {
 *   contract: { code, unitCode, building, ownerName, start, end, extensions: [{ previous_expiry, new_expiry }] },
 *   months: [{ month, bookings, nights, gross, bookingComm, affiliateComm, housekeeping, laundry,
 *              electricity, internet, water, marketing, other, totalExpenses, net }],
 *   bookings: [{ code, checkIn, checkOut, nights, guests, amount, bookerComm, affiliateComm }],
 *   cleanings: [{ code, date, type, status, housekeeping, laundry }],
 *   otherExpenses: [{ month, name, amount }],
 *   totals: computeTotals(...), preparedOn, ownerSplitPct, companySplitPct, brandColor
 * }
 */
export function buildStatementWorkbook(ExcelJS, data) {
  const { contract, months, bookings, cleanings, otherExpenses, totals, preparedOn, ownerSplitPct, companySplitPct } = data
  const brand = data.brandColor || '#2d568e'

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Iloilo Rentals'
  wb.created = toDate(preparedOn) || new Date()

  // ── Summary ──────────────────────────────────────────────
  const ws = wb.addWorksheet('Summary')
  ws.columns = [{ width: 30 }, { width: 26 }]

  const title = ws.addRow(['Iloilo Rentals · Contract statement'])
  title.font = { bold: true, size: 15, color: { argb: argb(brand) } }
  ws.addRow([])

  const info = (label, value) => {
    const r = ws.addRow([label, value])
    r.getCell(1).font = { bold: true }
    return r
  }
  info('Contract', contract.code || '—')
  info('Unit', [contract.unitCode, contract.building].filter(Boolean).join(' · ') || '—')
  info('Owner', contract.ownerName || '—')
  info('Term', `${formatDateText(contract.start)} – ${formatDateText(contract.end)}`)
  if (contract.extensions?.length) {
    info('Extended', `${contract.extensions.length}× (first ended ${formatDateText(contract.extensions[0].previous_expiry)})`)
  }
  info('Prepared on', formatDateText(preparedOn))
  ws.addRow([])

  const section = (label) => {
    const r = ws.addRow([label, ''])
    styleHeaderRow(r, brand)
  }
  const money = (label, value, bold = false) => {
    const r = ws.addRow([label, value])
    r.getCell(2).numFmt = MONEY
    if (bold) r.font = { bold: true }
    return r
  }

  section('Income')
  money('Gross revenue', totals.gross, true)
  ws.addRow([])

  section('Expenses')
  money('Booking commission', totals.bookingComm)
  money('Affiliate commission', totals.affiliateComm)
  money('Housekeeping', totals.housekeeping)
  money('Laundry', totals.laundry)
  money('Electricity', totals.electricity)
  money('Internet', totals.internet)
  money('Water', totals.water)
  money('Marketing', totals.marketing)
  money('Other expenses', totals.other)
  styleTotalRow(money('Total expenses', totals.totalExpenses, true))
  ws.addRow([])

  section('Result')
  money('Net profit', totals.net, true)
  const ownerRow = money(`Owner share (${ownerSplitPct}%)`, totals.ownerShare, true)
  ownerRow.getCell(2).font = { bold: true, color: { argb: argb(brand) } }
  money(`Company share (${companySplitPct}%)`, totals.companyShare)
  ws.addRow([])

  section('Stays')
  ws.addRow(['Bookings', totals.bookings])
  ws.addRow(['Nights booked', totals.nights])
  const occ = ws.addRow(['Occupancy', totals.occupancy])
  occ.getCell(2).numFmt = PERCENT
  ws.getColumn(2).alignment = { horizontal: 'right' }

  // ── Monthly ──────────────────────────────────────────────
  const moneyCol = (header, key, width = 15) => ({ header, key, width, style: { numFmt: MONEY } })
  addTable(
    wb,
    'Monthly',
    brand,
    [
      { header: 'Month', key: 'label', width: 12 },
      { header: 'Bookings', key: 'bookings', width: 10 },
      { header: 'Nights', key: 'nights', width: 9 },
      moneyCol('Gross', 'gross'),
      moneyCol('Booking comm.', 'bookingComm'),
      moneyCol('Affiliate comm.', 'affiliateComm'),
      moneyCol('Housekeeping', 'housekeeping'),
      moneyCol('Laundry', 'laundry'),
      moneyCol('Electricity', 'electricity'),
      moneyCol('Internet', 'internet'),
      moneyCol('Water', 'water'),
      moneyCol('Marketing', 'marketing'),
      moneyCol('Other', 'other'),
      moneyCol('Total expenses', 'totalExpenses', 16),
      moneyCol('Net', 'net'),
      moneyCol(`Owner share (${ownerSplitPct}%)`, 'ownerShare', 18),
    ],
    months.map((m) => ({ ...m, label: monthLabel(m.month), ownerShare: round2(m.net * (ownerSplitPct / 100)) })),
    {
      label: 'Total',
      bookings: sum(months, 'bookings'),
      nights: sum(months, 'nights'),
      gross: totals.gross,
      bookingComm: totals.bookingComm,
      affiliateComm: totals.affiliateComm,
      housekeeping: totals.housekeeping,
      laundry: totals.laundry,
      electricity: totals.electricity,
      internet: totals.internet,
      water: totals.water,
      marketing: totals.marketing,
      other: totals.other,
      totalExpenses: totals.totalExpenses,
      net: totals.net,
      ownerShare: totals.ownerShare,
    },
  )

  // ── Bookings ─────────────────────────────────────────────
  addTable(
    wb,
    'Bookings',
    brand,
    [
      { header: 'Booking', key: 'code', width: 16 },
      { header: 'Check-in', key: 'checkIn', width: 14, style: { numFmt: DATE } },
      { header: 'Check-out', key: 'checkOut', width: 14, style: { numFmt: DATE } },
      { header: 'Nights', key: 'nights', width: 9 },
      { header: 'Guests', key: 'guests', width: 9 },
      moneyCol('Amount', 'amount'),
      moneyCol('Booking comm.', 'bookerComm'),
      moneyCol('Affiliate comm.', 'affiliateComm'),
    ],
    bookings.map((b) => ({ ...b, checkIn: toDate(b.checkIn), checkOut: toDate(b.checkOut) })),
    {
      code: 'Total',
      nights: sum(bookings, 'nights'),
      amount: round2(sum(bookings, 'amount')),
      bookerComm: round2(sum(bookings, 'bookerComm')),
      affiliateComm: round2(sum(bookings, 'affiliateComm')),
    },
  )

  // ── Cleanings ────────────────────────────────────────────
  addTable(
    wb,
    'Cleanings',
    brand,
    [
      { header: 'Cleaning', key: 'code', width: 16 },
      { header: 'Date', key: 'date', width: 14, style: { numFmt: DATE } },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      moneyCol('Housekeeping', 'housekeeping'),
      moneyCol('Laundry', 'laundry'),
    ],
    cleanings.map((c) => ({ ...c, date: toDate(c.date) })),
    {
      code: 'Total',
      housekeeping: round2(sum(cleanings, 'housekeeping')),
      laundry: round2(sum(cleanings, 'laundry')),
    },
  )

  // ── Other expenses ───────────────────────────────────────
  addTable(
    wb,
    'Other expenses',
    brand,
    [
      { header: 'Month', key: 'label', width: 12 },
      { header: 'Item', key: 'name', width: 32 },
      moneyCol('Amount', 'amount'),
    ],
    otherExpenses.map((x) => ({ ...x, label: monthLabel(x.month) })),
    { label: 'Total', amount: round2(sum(otherExpenses, 'amount')) },
  )

  return wb
}
