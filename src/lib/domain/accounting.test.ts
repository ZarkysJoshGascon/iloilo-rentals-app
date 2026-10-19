import { describe, expect, it } from 'vitest'
import {
  computeMonthlyStatement, computeLifetime, monthKey, monthStart, monthEnd, monthRangeFromDates,
  OWNER_SPLIT_PCT, COMPANY_SPLIT_PCT, formatMoney, formatMoneyCompact,
} from './accounting'

const contract = { id: 'c1', effective_date: '2026-01-15', expiry_date: '2026-12-31' }

function booking(check_in, total_amount, extra = {}) {
  return { id: `b-${check_in}`, check_in, total_amount, booker_commission: 0, affiliate_commission: 0, ...extra }
}
function cleaning(scheduled_date, payment_amount, laundry_payment_amount = 0) {
  return { id: `c-${scheduled_date}`, scheduled_date, payment_amount, laundry_payment_amount }
}

describe('month helpers', () => {
  it('turns dates into YYYY-MM keys and back', () => {
    expect(monthKey('2026-10-19T12:00:00Z')).toBe('2026-10')
    expect(monthStart('2026-10').toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(monthEnd('2026-12').toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
  it('lists every month between two dates, across a year end', () => {
    expect(monthRangeFromDates('2026-11-20', '2027-02-03')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
  it('gives nothing for bad dates', () => {
    expect(monthRangeFromDates('nope', '2026-01-01')).toEqual([])
  })
})

describe('computeMonthlyStatement', () => {
  it('splits net profit 75% owner / 25% company', () => {
    expect(OWNER_SPLIT_PCT + COMPANY_SPLIT_PCT).toBe(100)
    const s = computeMonthlyStatement({
      contract,
      bookings: [booking('2026-03-05', 10_000, { booker_commission: 1_000 })],
      cleanings: [cleaning('2026-03-08', 500, 200)],
      monthlyExpenses: [{ month: '2026-03-01', electricity: 1_000, internet: 1_500, water: 300, marketing: 0 }],
      month: '2026-03',
    })
    expect(s.grossRevenue).toBe(10_000)
    expect(s.totalExpenses).toBe(1_000 + 500 + 200 + 1_000 + 1_500 + 300)
    expect(s.netProfit).toBe(5_500)
    expect(s.ownerShare).toBe(4_125)
    expect(s.companyShare).toBe(1_375)
  })

  it('counts a booking in the month it checks in, not the month it ends', () => {
    const bookings = [booking('2026-03-30', 6_000)]
    expect(computeMonthlyStatement({ contract, bookings, cleanings: [], monthlyExpenses: [], month: '2026-03' }).grossRevenue).toBe(6_000)
    expect(computeMonthlyStatement({ contract, bookings, cleanings: [], monthlyExpenses: [], month: '2026-04' }).grossRevenue).toBe(0)
  })

  it('leaves out bookings and cleanings outside the contract dates', () => {
    const s = computeMonthlyStatement({
      contract,
      bookings: [booking('2026-01-10', 9_000), booking('2026-01-20', 4_000)],
      cleanings: [cleaning('2026-01-12', 700), cleaning('2026-01-22', 300)],
      monthlyExpenses: [],
      month: '2026-01',
    })
    expect(s.grossRevenue).toBe(4_000)
    expect(s.housekeeping).toBe(300)
  })

  it('adds both commissions, housekeeping and laundry pay to the expenses', () => {
    const s = computeMonthlyStatement({
      contract,
      bookings: [booking('2026-05-01', 20_000, { booker_commission: 2_000, affiliate_commission: 1_200 })],
      cleanings: [cleaning('2026-05-04', 600, 150), cleaning('2026-05-20', 600, 0)],
      monthlyExpenses: [],
      month: '2026-05',
    })
    expect(s.bookingCommission).toBe(2_000)
    expect(s.affiliateCommission).toBe(1_200)
    expect(s.housekeeping).toBe(1_200)
    expect(s.laundry).toBe(150)
    expect(s.totalExpenses).toBe(4_550)
  })

  it('includes other expense items with a name, and ignores blank ones', () => {
    const s = computeMonthlyStatement({
      contract,
      bookings: [],
      cleanings: [],
      monthlyExpenses: [{ month: '2026-06-01', custom_items: [{ name: 'Aircon repair', amount: 2_500 }, { name: '', amount: 999 }, null] }],
      month: '2026-06',
    })
    expect(s.customItems).toHaveLength(1)
    expect(s.customTotal).toBe(2_500)
    expect(s.netProfit).toBe(-2_500)
  })

  it('shows a loss split the same way', () => {
    const s = computeMonthlyStatement({
      contract,
      bookings: [],
      cleanings: [],
      monthlyExpenses: [{ month: '2026-07-01', electricity: 1_000 }],
      month: '2026-07',
    })
    expect(s.ownerShare).toBe(-750)
    expect(s.companyShare).toBe(-250)
  })

  it('is all zeros for an empty month', () => {
    const s = computeMonthlyStatement({ contract, bookings: [], cleanings: [], monthlyExpenses: [], month: '2026-08' })
    expect(s).toMatchObject({ grossRevenue: 0, totalExpenses: 0, netProfit: 0, ownerShare: 0, companyShare: 0 })
  })
})

describe('computeLifetime', () => {
  it('adds the months up and averages net profit per month', () => {
    const months = ['2026-03', '2026-04'].map((month) => computeMonthlyStatement({
      contract,
      bookings: [booking(`${month}-10`, 10_000)],
      cleanings: [],
      monthlyExpenses: [],
      month,
    }))
    const life = computeLifetime(months)
    expect(life.gross).toBe(20_000)
    expect(life.owner).toBe(15_000)
    expect(life.monthlyAvg).toBe(10_000)
    expect(life.monthsWithActivity).toBe(2)
  })
})

describe('money formatting', () => {
  it('shows pesos', () => {
    expect(formatMoney(1234.5)).toBe('₱1,234.5')
    expect(formatMoney(null)).toBe('₱0')
    expect(formatMoneyCompact(2_500_000)).toBe('₱2.5M')
    expect(formatMoneyCompact(45_600)).toBe('₱46k')
  })
})
