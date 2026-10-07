// src/lib/accounting.js
// ============================================================
// Contract accounting computations
// ============================================================
// Split model: every contract is 75/25 (owner/company).
// When a Property Manager is active for a month, they take 35%
// of the company's 25% (= 8.75% of net), and the company keeps
// the remaining 65% (= 16.25% of net). Owner stays at 75%.
// Bookings and cleanings are only counted if their date falls
// within [contract.effective_date, contract.expiry_date].
// ============================================================

export const OWNER_SPLIT_PCT = 75
export const COMPANY_SPLIT_PCT = 25
export const PM_SHARE_OF_COMPANY_PCT = 35

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
    if (out.length > 240) break
  }
  return out
}

// ------------------------------------------------------------
// Contract range check
// ------------------------------------------------------------
function withinContractRange(contract, dateStr) {
  if (!dateStr) return false
  if (contract?.effective_date && dateStr < contract.effective_date) return false
  if (contract?.expiry_date && dateStr > contract.expiry_date) return false
  return true
}

// ------------------------------------------------------------
// Monthly statement
// ------------------------------------------------------------
export function computeMonthlyStatement({
  contract,
  bookings,
  cleanings,
  monthlyExpenses,
  month,
}) {
  const start = monthStart(month)
  const end = monthEnd(month)

  const inMonth = (dateStr) => {
    if (!dateStr) return false
    const d = new Date(dateStr + 'T00:00:00Z')
    return d >= start && d < end
  }

  const monthBookings = (bookings || []).filter(
    (b) => inMonth(b.check_in) && withinContractRange(contract, b.check_in)
  )
  const monthCleanings = (cleanings || []).filter(
    (c) => inMonth(c.scheduled_date) && withinContractRange(contract, c.scheduled_date)
  )

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

  const customItems = Array.isArray(manual.custom_items)
    ? manual.custom_items
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({
          id: typeof x.id === 'string' && x.id ? x.id : `ci_${Math.random().toString(36).slice(2, 10)}`,
          name: typeof x.name === 'string' ? x.name.slice(0, 80) : '',
          amount: Number(x.amount) || 0,
          image: typeof x.image === 'string' ? x.image : null,
        }))
        .filter((x) => x.name.length > 0)
    : []
  const customTotal = customItems.reduce((s, x) => s + (Number(x.amount) || 0), 0)

  const totalExpenses =
    bookingCommission + affiliateCommission + housekeeping + laundry +
    electricity + internet + water + marketing + customTotal

  const netProfit = grossRevenue - totalExpenses

  const ownerShare = Math.round(netProfit * (OWNER_SPLIT_PCT / 100) * 100) / 100
  const companyShare = Math.round(netProfit * (COMPANY_SPLIT_PCT / 100) * 100) / 100

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
    customItems,
    customTotal,
    totalExpenses,
    netProfit,
    ownerShare,
    companyShare,
    pmShare: 0,
    pmId: null,
    pmName: null,
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
    acc.owner += s.ownerShare
    acc.company += s.companyShare
    acc.pm += Number(s.pmShare || 0)
    return acc
  }, { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, pm: 0 })

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