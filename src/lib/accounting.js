// src/lib/accounting.js
// ============================================================
// Contract accounting computations
// ============================================================
// Split is derived from contract.classification.
// Only 75/25 and 85/15 are configured; others return null.
// ============================================================

export const CLASSIFICATION_SPLIT = {
  '75/25': { owner: 75, company: 25 },
  '85/15': { owner: 85, company: 15 },
}

export function getContractSplit(classification) {
  return CLASSIFICATION_SPLIT[classification] || null
}
// ------------------------------------------------------------
// Date helpers
// ------------------------------------------------------------
export function monthKey(date) {
  const d = new Date(date)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthKeyToDate(key) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1))
}

export function monthStart(key) {
  return monthKeyToDate(key)
}

export function monthEnd(key) {
  const d = monthKeyToDate(key)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

export function monthLabel(key) {
  return monthKeyToDate(key).toLocaleDateString('en-PH', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Every month between two dates inclusive, oldest → newest.
// Handles null bounds: falls back to today.
export function monthRangeFromDates(startDate, endDate) {
  const today = new Date()
  const s = startDate ? new Date(startDate) : new Date(today.getUTCFullYear(), 0, 1)
  const e = endDate ? new Date(endDate) : today

  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return []

  const start = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1))
  const end = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 1))

  const out = []
  let cur = new Date(start)
  while (cur <= end) {
    out.push(monthKey(cur))
    cur = new Date(cur)
    cur.setUTCMonth(cur.getUTCMonth() + 1)
    // safety cap
    if (out.length > 240) break
  }
  return out
}

// ------------------------------------------------------------
// Monthly statement
// ------------------------------------------------------------
export function computeMonthlyStatement({
  contract,
  bookings,          // all non-deleted bookings for the unit
  cleanings,         // all cleanings for the unit
  monthlyExpenses,   // all contract_monthly_expenses rows for this contract
  month,
}) {
  const start = monthStart(month)
  const end = monthEnd(month)

  const inMonth = (dateStr) => {
    if (!dateStr) return false
    const d = new Date(dateStr + 'T00:00:00Z')
    return d >= start && d < end
  }

  const monthBookings = (bookings || []).filter((b) => inMonth(b.check_in))
  const monthCleanings = (cleanings || []).filter((c) => inMonth(c.scheduled_date))

  const grossRevenue = monthBookings.reduce((s, b) => s + Number(b.total_amount || 0), 0)

  const bookingCommission = monthBookings.reduce((s, b) => s + Number(b.booker_commission || 0), 0)
  const affiliateCommission = monthBookings.reduce((s, b) => s + Number(b.affiliate_commission || 0), 0)
  const housekeeping = monthCleanings.reduce((s, c) => s + Number(c.payment_amount || 0), 0)
  const laundry = monthCleanings.reduce((s, c) => s + Number(c.laundry_payment_amount || 0), 0)

  const manual = (monthlyExpenses || []).find((e) => e.month?.startsWith(month)) || {}
  const electricity = Number(manual.electricity || 0)
  const internet = Number(manual.internet || 0)
  const water = Number(manual.water || 0)
  const marketing = Number(manual.marketing || 0)

  const totalExpenses =
    bookingCommission + affiliateCommission + housekeeping + laundry +
    electricity + internet + water + marketing

  const netProfit = grossRevenue - totalExpenses
  const split = getContractSplit(contract?.classification)
  const ownerShare = split ? Math.round(netProfit * (split.owner / 100) * 100) / 100 : null
  const companyShare = split ? Math.round(netProfit * (split.company / 100) * 100) / 100 : null

  return {
    month,
    grossRevenue,
    bookingCommission,
    affiliateCommission,
    housekeeping,
    laundry,
    electricity,
    internet,
    water,
    marketing,
    totalExpenses,
    netProfit,
    ownerShare,
    companyShare,
    split,
    bookingsList: monthBookings,
    cleaningsList: monthCleanings,
    manualRow: manual,
  }
}

// ------------------------------------------------------------
// Lifetime totals across all statements
// ------------------------------------------------------------
export function computeLifetime(statements) {
  const agg = statements.reduce((acc, s) => {
    acc.gross += s.grossRevenue
    acc.expenses += s.totalExpenses
    acc.net += s.netProfit
    if (s.ownerShare != null) acc.owner += s.ownerShare
    if (s.companyShare != null) acc.company += s.companyShare
    if (s.ownerShare != null) acc.hasSplit = true
    return acc
  }, { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, hasSplit: false })

  const monthsWithActivity = statements.filter((s) => s.grossRevenue > 0 || s.totalExpenses > 0).length
  const activeMonths = statements.length
  const monthlyAvg = activeMonths > 0 ? agg.net / activeMonths : 0

  return {
    ...agg,
    activeMonths,
    monthsWithActivity,
    monthlyAvg,
  }
}

// ------------------------------------------------------------
// Formatting
// ------------------------------------------------------------
export function formatMoney(n) {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatMoneyCompact(n) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `₱${Math.round(v / 1_000)}k`
  return `₱${Math.round(v)}`
}
export function getClassificationLabel(contract) {
  if (!contract) return '—'
  if (!contract.expiry_date) return 'Fixed'
  return contract.classification || '—'
}