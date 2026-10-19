import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const {
  stayMoment, checkoutDue, guestState, hasGuestLeft, arrivalOn, sameDayArrival,
  latestCheckout, nextBookingAfter, TURNOVER_CHECKOUT,
} = await import('@/lib/domain/stay')
const { STAY_TIMES } = await import('@/lib/utils')

// Local times, as the browser in Manila sees them.
const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).getTime()
}

describe('stayMoment and checkoutDue', () => {
  it('puts a stay time on a day', () => {
    expect(stayMoment('2026-10-19', STAY_TIMES.checkIn)?.getTime()).toBe(at('2026-10-19', 15))
    expect(stayMoment('', STAY_TIMES.checkIn)).toBeNull()
  })
  it('is 11 AM on the check-out day, or the late check-out', () => {
    expect(checkoutDue({ check_out: '2026-10-22' })?.getTime()).toBe(at('2026-10-22', 11))
    const late = new Date(at('2026-10-22', 13)).toISOString()
    expect(checkoutDue({ check_out: '2026-10-22', late_checkout_at: late })?.toISOString()).toBe(late)
  })
})

describe('guestState', () => {
  const stay = { check_out: '2026-10-22' }

  it('is staying before the check-out time', () => {
    expect(guestState(stay, at('2026-10-22', 10, 59)).kind).toBe('staying')
  })
  it('is unconfirmed after 11 AM on the day if nobody confirmed', () => {
    expect(guestState(stay, at('2026-10-22', 11, 1)).kind).toBe('unconfirmed')
  })
  it('counts the guest as gone the next day even unconfirmed', () => {
    const s = guestState(stay, at('2026-10-23', 9))
    expect(s).toMatchObject({ kind: 'left', confirmed: false })
  })
  it('uses the confirmed check-out time', () => {
    const when = new Date(at('2026-10-22', 9, 30)).toISOString()
    const s = guestState({ ...stay, checked_out_at: when }, at('2026-10-22', 8))
    expect(s).toMatchObject({ kind: 'left', confirmed: true })
    expect(hasGuestLeft({ ...stay, checked_out_at: when })).toBe(true)
  })
  it('respects a late check-out', () => {
    const late = { ...stay, late_checkout_at: new Date(at('2026-10-22', 13)).toISOString() }
    expect(guestState(late, at('2026-10-22', 12)).kind).toBe('staying')
    expect(guestState(late, at('2026-10-22', 13, 30)).kind).toBe('unconfirmed')
  })
  it('is none without a check-out date', () => {
    expect(guestState({}, Date.now()).kind).toBe('none')
  })
})

describe('turnovers', () => {
  const a = { id: 'a', unit_id: 'u1', check_in: '2026-10-19', check_out: '2026-10-22' }
  const b = { id: 'b', unit_id: 'u1', check_in: '2026-10-22', check_out: '2026-10-25' }
  const c = { id: 'c', unit_id: 'u1', check_in: '2026-10-28', check_out: '2026-10-30' }
  const otherUnit = { id: 'd', unit_id: 'u2', check_in: '2026-10-22', check_out: '2026-10-24' }
  const cancelled = { id: 'e', unit_id: 'u1', check_in: '2026-10-22', check_out: '2026-10-23', cancelled_at: '2026-10-01' }

  it('finds the guest arriving on the same day in the same unit', () => {
    expect(sameDayArrival(a, [a, b, c, otherUnit])?.id).toBe('b')
    expect(arrivalOn(a, '2026-10-24', [a, b, c])).toBeNull()
  })
  it('ignores cancelled and deleted bookings', () => {
    expect(sameDayArrival(a, [a, cancelled])).toBeNull()
    expect(sameDayArrival(a, [a, { ...b, deleted_at: '2026-10-01' }])).toBeNull()
  })
  it('allows a late check-out until 1 PM on a turnover day, else until the end of the day', () => {
    expect(TURNOVER_CHECKOUT.hour).toBe(13)
    expect(latestCheckout(a, [a, b])?.getTime()).toBe(at('2026-10-22', 13))
    expect(latestCheckout(a, [a, c])?.getTime()).toBe(at('2026-10-22', 23, 59))
  })
  it('finds the next booking after a stay (the furthest it can be extended)', () => {
    expect(nextBookingAfter(a, [c, b, a, otherUnit])?.id).toBe('b')
    expect(nextBookingAfter(b, [a, b, c])?.id).toBe('c')
    expect(nextBookingAfter(c, [a, b, c])).toBeNull()
  })
})
