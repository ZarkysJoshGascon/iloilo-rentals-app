// supabase/functions/send-contract-statement/workbook.js
// Builds the owner's Excel statement for one contract term. Plain JS with
// ExcelJS passed in, so the same code runs in the Edge Function (Deno,
// npm:exceljs) and in a local Node check.
//
// Sheets
//   Summary         term totals, how the split works, and one line per month
//   Month by month  every booking, cleaning and expense of each month, then
//                   that month's computation as live formulas (gross → each
//                   expense → net → owner / company / PM), each with a note
//   All bookings · All cleanings · All expenses   flat lists to sort and filter
//
// Guest names and contact details are left out on purpose.

const MONEY = '"₱"#,##0.00;[Red]-"₱"#,##0.00'
const DATE = 'mmm d, yyyy'
const PERCENT = '0%'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3))

const BILLS = [
  { key: 'electricity', label: 'Electricity' },
  { key: 'internet', label: 'Internet' },
  { key: 'water', label: 'Water' },
  { key: 'marketing', label: 'Marketing' },
]

// ── small helpers ───────────────────────────────────────────
function toDate(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateText(iso) {
  const d = toDate(iso)
  if (!d) return '—'
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export function monthLabel(key, long = false) {
  const [y, m] = key.split('-').map(Number)
  return `${(long ? MONTH_NAMES : MONTH_SHORT)[m - 1]} ${y}`
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
  return rows.reduce((t, r) => t + (Number(key ? r[key] : r) || 0), 0)
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * A month's figures from its rows, rounded the way the CRM rounds them.
 * month: { bookings, cleanings, bills: {electricity, internet, water, marketing}, other: [{amount}], pm: {name, pct} | null }
 */
export function computeMonth(month, { ownerSplitPct, companySplitPct }) {
  const gross = round2(sum(month.bookings, 'amount'))
  const bookingComm = round2(sum(month.bookings, 'bookerComm'))
  const affiliateComm = round2(sum(month.bookings, 'affiliateComm'))
  const counted = month.cleanings.filter((c) => c.counted !== false)
  const housekeeping = round2(sum(counted, 'housekeeping'))
  const laundry = round2(sum(counted, 'laundry'))
  const bills = Object.fromEntries(BILLS.map((b) => [b.key, round2(month.bills?.[b.key])]))
  const otherTotal = round2(sum(month.other, 'amount'))
  const totalExpenses = round2(
    bookingComm + affiliateComm + housekeeping + laundry +
    bills.electricity + bills.internet + bills.water + bills.marketing + otherTotal,
  )
  const net = round2(gross - totalExpenses)
  const ownerShare = round2(net * (ownerSplitPct / 100))
  const companyShare = round2(net * (companySplitPct / 100))
  const pmShare = month.pm ? round2(companyShare * (month.pm.pct / 100)) : 0
  return {
    gross, bookingComm, affiliateComm, housekeeping, laundry, ...bills, otherTotal,
    totalExpenses, net, ownerShare, companyShare, pmShare, companyKeeps: round2(companyShare - pmShare),
  }
}

const TOTAL_KEYS = [
  'gross', 'bookingComm', 'affiliateComm', 'housekeeping', 'laundry',
  'electricity', 'internet', 'water', 'marketing', 'otherTotal',
  'totalExpenses', 'net', 'ownerShare', 'companyShare', 'pmShare', 'companyKeeps',
]

/** Term totals: the sum of the months, plus stay counts and occupancy. */
export function computeTotals({ months, start, end }) {
  const totals = {}
  for (const k of TOTAL_KEYS) totals[k] = round2(sum(months.map((m) => m.figures), k))
  const live = months.flatMap((m) => m.bookings)
  totals.bookings = live.length
  totals.cancelled = sum(months.map((m) => m.cancelled.length))
  totals.cleanings = sum(months.map((m) => m.cleanings.length))
  totals.nights = live.reduce((t, b) => t + nightsWithin(b.checkIn, b.checkOut, start, end), 0)
  const s = toDate(start)
  const e = toDate(end)
  const days = s && e && e >= s ? Math.round((e - s) / 86_400_000) + 1 : 0
  totals.days = days
  totals.occupancy = days > 0 ? Math.min(1, totals.nights / days) : 0
  totals.pmMonths = months.filter((m) => m.pm).length
  return totals
}

// ── styling ─────────────────────────────────────────────────
function argb(hex) {
  return `FF${String(hex || '#2d568e').replace('#', '').toUpperCase()}`
}

// A pale tint of the brand colour for table heads.
function tint(hex, amount = 0.88) {
  const h = String(hex || '#2d568e').replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const mixed = c.map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0'))
  return `FF${mixed.join('').toUpperCase()}`
}

function fillRow(row, from, to, fg, font) {
  for (let col = from; col <= to; col++) {
    const cell = row.getCell(col)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fg } }
    if (font) cell.font = font
  }
}

const THIN = { style: 'thin', color: { argb: 'FF9CA3AF' } }

function topBorder(row, from, to) {
  for (let col = from; col <= to; col++) row.getCell(col).border = { top: THIN }
}

function money(cell) {
  cell.numFmt = MONEY
}

function formula(cell, expr, result) {
  cell.value = { formula: expr, result: round2(result) }
  money(cell)
}

// ── Summary ─────────────────────────────────────────────────
function addSummarySheet(wb, data, brand) {
  const { contract, months, totals, preparedOn, ownerSplitPct, companySplitPct } = data
  const ws = wb.addWorksheet('Summary')
  ws.columns = [
    { width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ]

  const title = ws.addRow(['Iloilo Rentals · Contract statement'])
  title.font = { bold: true, size: 15, color: { argb: argb(brand) } }
  ws.addRow([])

  const info = (label, value) => {
    const r = ws.addRow([label, value])
    r.getCell(1).font = { bold: true }
  }
  info('Contract', contract.code || '—')
  info('Unit', [contract.unitCode, contract.building].filter(Boolean).join(' · ') || '—')
  info('Owner', contract.ownerName || '—')
  info('Term', `${formatDateText(contract.start)} – ${formatDateText(contract.end)}`)
  info('Prepared on', formatDateText(preparedOn))
  ws.addRow([])

  // How the money is split, in words.
  const head = (label) => {
    const r = ws.addRow([label])
    fillRow(r, 1, 2, argb(brand), { bold: true, color: { argb: 'FFFFFFFF' } })
  }
  head('How each month is computed')
  const pmPct = months.find((m) => m.pm)?.pm.pct
  for (const line of [
    'Gross income = the total of every booking that checked in that month.',
    'Expenses = booking and affiliate commissions, housekeeping, laundry, bills and other expenses.',
    'Net income = gross income − expenses.',
    `Owner share = ${ownerSplitPct}% of net income. Company share = ${companySplitPct}% of net income.`,
    pmPct != null
      ? `In months a property manager (PM) looks after the unit, the PM is paid ${pmPct}% of the company share, from the company's part.`
      : 'No property manager was assigned during this term.',
    'Cancelled bookings are listed but not counted.',
  ]) {
    ws.addRow([line]).getCell(1).alignment = { wrapText: false }
  }
  ws.addRow([])

  head('Term totals')
  const amount = (label, value, opts = {}) => {
    const r = ws.addRow([label, round2(value)])
    money(r.getCell(2))
    if (opts.bold) r.font = { bold: true }
    if (opts.indent) r.getCell(1).alignment = { indent: 1 }
    if (opts.border) topBorder(r, 1, 2)
    if (opts.brand) r.getCell(2).font = { bold: true, color: { argb: argb(brand) } }
    return r
  }
  amount('Gross income', totals.gross, { bold: true })
  amount('Booking commission', totals.bookingComm, { indent: true })
  amount('Affiliate commission', totals.affiliateComm, { indent: true })
  amount('Housekeeping', totals.housekeeping, { indent: true })
  amount('Laundry', totals.laundry, { indent: true })
  amount('Electricity', totals.electricity, { indent: true })
  amount('Internet', totals.internet, { indent: true })
  amount('Water', totals.water, { indent: true })
  amount('Marketing', totals.marketing, { indent: true })
  amount('Other expenses', totals.otherTotal, { indent: true })
  amount('Total expenses', totals.totalExpenses, { bold: true, border: true })
  amount('Net income', totals.net, { bold: true })
  amount(`Owner share (${ownerSplitPct}%)`, totals.ownerShare, { bold: true, brand: true })
  amount(`Company share (${companySplitPct}%)`, totals.companyShare)
  if (totals.pmShare) {
    amount('PM share (paid from the company share)', totals.pmShare, { indent: true })
    amount('Company keeps', totals.companyKeeps, { indent: true })
  }
  ws.addRow([])

  head('Stays')
  ws.addRow(['Bookings counted', totals.bookings])
  if (totals.cancelled) ws.addRow(['Cancelled bookings (not counted)', totals.cancelled])
  ws.addRow(['Cleanings', totals.cleanings])
  ws.addRow(['Nights booked', totals.nights])
  const occ = ws.addRow(['Occupancy', totals.occupancy])
  occ.getCell(2).numFmt = PERCENT
  ws.addRow([])

  // One line per month, with a totals row of formulas.
  head('Month by month')
  const header = ws.addRow(['Month', 'Gross income', 'Expenses', 'Net income', `Owner (${ownerSplitPct}%)`, `Company (${companySplitPct}%)`, 'PM share', 'Company keeps', 'Bookings'])
  fillRow(header, 1, 9, tint(brand), { bold: true })
  const first = header.number + 1
  for (const m of months) {
    const f = m.figures
    const r = ws.addRow([monthLabel(m.month), f.gross, f.totalExpenses, f.net, f.ownerShare, f.companyShare, f.pmShare, f.companyKeeps, m.bookings.length])
    for (let col = 2; col <= 8; col++) money(r.getCell(col))
  }
  const last = first + months.length - 1
  const t = ws.addRow(['Total'])
  const cols = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
  const keys = ['gross', 'totalExpenses', 'net', 'ownerShare', 'companyShare', 'pmShare', 'companyKeeps']
  cols.forEach((col, i) => {
    const cell = t.getCell(i + 2)
    const result = i < keys.length ? totals[keys[i]] : totals.bookings
    if (months.length) cell.value = { formula: `SUM(${col}${first}:${col}${last})`, result }
    else cell.value = result
    if (i < keys.length) money(cell)
  })
  t.font = { bold: true }
  topBorder(t, 1, 9)
}

// ── Month by month ──────────────────────────────────────────
function addLedgerSheet(wb, data, brand) {
  const { months, ownerSplitPct, companySplitPct } = data
  const ws = wb.addWorksheet('Month by month', { views: [{ state: 'frozen', ySplit: 0 }] })
  ws.columns = [
    { width: 34 }, { width: 14 }, { width: 14 }, { width: 9 }, { width: 12 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 34 },
  ]
  // Columns: A label/code · B date · C date · D nights · E guests/status ·
  //          F amount · G booking comm. / laundry · H affiliate comm. · I how it's computed
  const noteFont = { italic: true, color: { argb: 'FF4B5563' } }

  const groupHead = (title, cols) => {
    const label = ws.addRow([title])
    label.font = { bold: true, color: { argb: argb(brand) } }
    if (cols) {
      const h = ws.addRow(cols)
      fillRow(h, 1, 8, tint(brand), { bold: true })
    }
  }
  const emptyLine = (text) => {
    const r = ws.addRow([text])
    r.getCell(1).font = noteFont
  }
  const subtotal = (label, first, last, moneyCols, results) => {
    const r = ws.addRow([label])
    moneyCols.forEach((col, i) => {
      const cell = r.getCell(col)
      if (last >= first) formula(cell, `SUM(${'ABCDEFGHI'[col - 1]}${first}:${'ABCDEFGHI'[col - 1]}${last})`, results[i])
      else { cell.value = 0; money(cell) }
    })
    r.font = { bold: true }
    topBorder(r, 1, 8)
    return r
  }

  if (months.length === 0) {
    emptyLine('No months in this term.')
    return
  }

  for (const m of months) {
    const f = m.figures

    // Month banner
    const banner = ws.addRow([monthLabel(m.month, true)])
    fillRow(banner, 1, 9, argb(brand), { bold: true, size: 13, color: { argb: 'FFFFFFFF' } })
    banner.height = 22

    // Bookings
    groupHead('Bookings', ['Booking', 'Check-in', 'Check-out', 'Nights', 'Guests', 'Amount', 'Booking comm.', 'Affiliate comm.'])
    const bFirst = ws.rowCount + 1
    for (const b of m.bookings) {
      const r = ws.addRow([b.code, toDate(b.checkIn), toDate(b.checkOut), b.nights, b.guests, b.amount, b.bookerComm, b.affiliateComm])
      r.getCell(2).numFmt = DATE
      r.getCell(3).numFmt = DATE
      for (const col of [6, 7, 8]) money(r.getCell(col))
    }
    const bLast = ws.rowCount
    if (m.bookings.length === 0) emptyLine('No bookings checked in this month.')
    const bookingsTotal = subtotal('Bookings total', bFirst, m.bookings.length ? bLast : bFirst - 1, [6, 7, 8], [f.gross, f.bookingComm, f.affiliateComm])
    for (const b of m.cancelled) {
      const r = ws.addRow([b.code, toDate(b.checkIn), toDate(b.checkOut), b.nights, 'Cancelled', b.amount])
      r.getCell(2).numFmt = DATE
      r.getCell(3).numFmt = DATE
      money(r.getCell(6))
      r.font = noteFont
      r.getCell(9).value = 'Cancelled, not counted'
    }
    ws.addRow([])

    // Cleanings
    groupHead('Cleanings', ['Cleaning', 'Date', 'Type', '', 'Status', 'Housekeeping', 'Laundry'])
    const cFirst = ws.rowCount + 1
    const counted = m.cleanings.filter((c) => c.counted !== false)
    for (const c of counted) {
      const r = ws.addRow([c.code, toDate(c.date), c.type, '', c.status, c.housekeeping, c.laundry])
      r.getCell(2).numFmt = DATE
      money(r.getCell(6))
      money(r.getCell(7))
    }
    const cLast = ws.rowCount
    if (counted.length === 0) emptyLine('No cleanings this month.')
    const cleaningsTotal = subtotal('Cleanings total', cFirst, counted.length ? cLast : cFirst - 1, [6, 7], [f.housekeeping, f.laundry])
    for (const c of m.cleanings.filter((x) => x.counted === false)) {
      const r = ws.addRow([c.code, toDate(c.date), c.type, '', c.status, c.housekeeping, c.laundry])
      r.getCell(2).numFmt = DATE
      money(r.getCell(6))
      money(r.getCell(7))
      r.font = noteFont
      r.getCell(9).value = 'Cancelled, not counted'
    }
    ws.addRow([])

    // Bills and other expenses
    groupHead('Bills and other expenses', ['Item', '', '', '', '', 'Amount'])
    const xFirst = ws.rowCount + 1
    const billRows = {}
    for (const b of BILLS) {
      const r = ws.addRow([b.label, '', '', '', '', f[b.key]])
      money(r.getCell(6))
      billRows[b.key] = r.number
    }
    const otherFirst = ws.rowCount + 1
    for (const o of m.other) {
      const r = ws.addRow([o.name, '', '', '', '', o.amount])
      money(r.getCell(6))
    }
    const otherLast = ws.rowCount
    const xLast = ws.rowCount
    subtotal('Bills and other total', xFirst, xLast, [6], [
      f.electricity + f.internet + f.water + f.marketing + f.otherTotal,
    ])
    ws.addRow([])

    // The month's computation, as formulas over the rows above.
    groupHead(`${monthLabel(m.month, true)} computation`)
    const line = (label, expr, result, note, opts = {}) => {
      const r = ws.addRow([label])
      formula(r.getCell(6), expr, result)
      r.getCell(9).value = note
      r.getCell(9).font = noteFont
      if (opts.indent) r.getCell(1).alignment = { indent: 1 }
      if (opts.bold) { r.getCell(1).font = { bold: true }; r.getCell(6).font = { bold: true } }
      if (opts.border) topBorder(r, 1, 8)
      if (opts.brand) r.getCell(6).font = { bold: true, color: { argb: argb(brand) } }
      return r
    }
    const gross = line('Gross income', `F${bookingsTotal.number}`, f.gross, 'Bookings total', { bold: true })
    const e1 = line('Booking commission', `G${bookingsTotal.number}`, f.bookingComm, 'From the bookings', { indent: true })
    const e2 = line('Affiliate commission', `H${bookingsTotal.number}`, f.affiliateComm, 'From the bookings', { indent: true })
    const e3 = line('Housekeeping', `F${cleaningsTotal.number}`, f.housekeeping, 'From the cleanings', { indent: true })
    const e4 = line('Laundry', `G${cleaningsTotal.number}`, f.laundry, 'From the cleanings', { indent: true })
    const billLines = BILLS.map((b) => line(b.label, `F${billRows[b.key]}`, f[b.key], 'Bill', { indent: true }))
    const otherExpr = otherLast >= otherFirst ? `SUM(F${otherFirst}:F${otherLast})` : '0'
    const e9 = line('Other expenses', otherExpr, f.otherTotal, m.other.length ? 'Items listed above' : 'None this month', { indent: true })
    const expenseCells = [e1, e2, e3, e4, ...billLines, e9].map((r) => `F${r.number}`).join(',')
    const total = line('Total expenses', `SUM(${expenseCells})`, f.totalExpenses, 'Sum of the expenses above', { bold: true, border: true })
    const net = line('Net income', `F${gross.number}-F${total.number}`, f.net, 'Gross income − total expenses', { bold: true })
    line(`Owner share (${ownerSplitPct}%)`, `ROUND(F${net.number}*${ownerSplitPct}%,2)`, f.ownerShare, `Net income × ${ownerSplitPct}%`, { bold: true, brand: true })
    const company = line(`Company share (${companySplitPct}%)`, `ROUND(F${net.number}*${companySplitPct}%,2)`, f.companyShare, `Net income × ${companySplitPct}%`)
    if (m.pm) {
      const pm = line(
        `PM share${m.pm.name ? ` · ${m.pm.name}` : ''} (${m.pm.pct}% of company share)`,
        `ROUND(F${company.number}*${m.pm.pct}%,2)`,
        f.pmShare,
        `Company share × ${m.pm.pct}%, paid from the company share`,
        { indent: true },
      )
      line('Company keeps', `F${company.number}-F${pm.number}`, f.companyKeeps, 'Company share − PM share', { indent: true })
    } else {
      const r = ws.addRow(['No property manager this month'])
      r.getCell(1).font = noteFont
      r.getCell(1).alignment = { indent: 1 }
    }
    ws.addRow([])
    ws.addRow([])
  }
}

// ── Flat lists ──────────────────────────────────────────────
function addTable(wb, name, brand, columns, rows, totalsRow) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 14, style: c.style || {} }))
  fillRow(ws.getRow(1), 1, columns.length, argb(brand), { bold: true, color: { argb: 'FFFFFFFF' } })
  for (const r of rows) ws.addRow(r)
  if (rows.length === 0) {
    ws.addRow({ [columns[0].key]: 'Nothing in this term' }).font = { italic: true }
  } else if (totalsRow) {
    const t = ws.addRow(totalsRow)
    t.font = { bold: true }
    topBorder(t, 1, columns.length)
  }
}

/**
 * data: {
 *   contract: { code, unitCode, building, ownerName, start, end },
 *   months: [{ month, bookings, cancelled, cleanings, bills, other, pm, figures }],
 *   totals, preparedOn, ownerSplitPct, companySplitPct, brandColor
 * }
 */
export function buildStatementWorkbook(ExcelJS, data) {
  const brand = data.brandColor || '#2d568e'
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Iloilo Rentals'
  wb.created = toDate(data.preparedOn) || new Date()
  wb.calcProperties = { fullCalcOnLoad: true }

  addSummarySheet(wb, data, brand)
  addLedgerSheet(wb, data, brand)

  const moneyCol = (header, key, width = 15) => ({ header, key, width, style: { numFmt: MONEY } })
  const dateCol = (header, key) => ({ header, key, width: 14, style: { numFmt: DATE } })

  const bookings = data.months.flatMap((m) => [
    ...m.bookings.map((b) => ({ ...b, status: 'Counted' })),
    ...m.cancelled.map((b) => ({ ...b, status: 'Cancelled, not counted', bookerComm: null, affiliateComm: null })),
  ])
  addTable(
    wb, 'All bookings', brand,
    [
      { header: 'Booking', key: 'code', width: 16 },
      dateCol('Check-in', 'checkIn'),
      dateCol('Check-out', 'checkOut'),
      { header: 'Nights', key: 'nights', width: 9 },
      { header: 'Guests', key: 'guests', width: 9 },
      moneyCol('Amount', 'amount'),
      moneyCol('Booking comm.', 'bookerComm'),
      moneyCol('Affiliate comm.', 'affiliateComm'),
      { header: 'Status', key: 'status', width: 22 },
    ],
    bookings.map((b) => ({ ...b, checkIn: toDate(b.checkIn), checkOut: toDate(b.checkOut) })),
    {
      code: 'Total counted',
      nights: sum(data.months.flatMap((m) => m.bookings), 'nights'),
      amount: data.totals.gross,
      bookerComm: data.totals.bookingComm,
      affiliateComm: data.totals.affiliateComm,
    },
  )

  const cleanings = data.months.flatMap((m) => m.cleanings)
  addTable(
    wb, 'All cleanings', brand,
    [
      { header: 'Cleaning', key: 'code', width: 16 },
      dateCol('Date', 'date'),
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      moneyCol('Housekeeping', 'housekeeping'),
      moneyCol('Laundry', 'laundry'),
      { header: 'Counted', key: 'countedLabel', width: 12 },
    ],
    cleanings.map((c) => ({ ...c, date: toDate(c.date), countedLabel: c.counted === false ? 'No' : 'Yes' })),
    { code: 'Total counted', housekeeping: data.totals.housekeeping, laundry: data.totals.laundry },
  )

  const expenses = data.months.flatMap((m) => [
    ...BILLS.filter((b) => m.figures[b.key]).map((b) => ({ month: monthLabel(m.month), category: 'Bill', name: b.label, amount: m.figures[b.key] })),
    ...m.other.map((o) => ({ month: monthLabel(m.month), category: 'Other', name: o.name, amount: o.amount })),
  ])
  addTable(
    wb, 'All expenses', brand,
    [
      { header: 'Month', key: 'month', width: 12 },
      { header: 'Category', key: 'category', width: 12 },
      { header: 'Item', key: 'name', width: 32 },
      moneyCol('Amount', 'amount'),
    ],
    expenses,
    {
      month: 'Total',
      amount: round2(data.totals.electricity + data.totals.internet + data.totals.water + data.totals.marketing + data.totals.otherTotal),
    },
  )

  return wb
}
