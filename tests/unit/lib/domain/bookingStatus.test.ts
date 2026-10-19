import { describe, expect, it } from 'vitest'
import { deriveBookingStatus } from '@/lib/domain/bookingStatus'

// Local times, as the browser in Manila sees them.
const on = (day: string, h = 10) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, h)
}
const stay = { check_in: '2026-10-19', check_out: '2026-10-22', payment_status: 'unpaid' }

describe('deriveBookingStatus', () => {
  it('is upcoming before the check-in day', () => {
    expect(deriveBookingStatus(stay, on('2026-10-18', 23))).toBe('upcoming')
  })

  it('is in-house from the check-in day through the check-out day', () => {
    expect(deriveBookingStatus(stay, on('2026-10-19', 0))).toBe('in-house')
    expect(deriveBookingStatus(stay, on('2026-10-21'))).toBe('in-house')
    expect(deriveBookingStatus(stay, on('2026-10-22', 23))).toBe('in-house')
  })

  it('stops being in-house once the check-out is confirmed', () => {
    const left = { ...stay, checked_out_at: '2026-10-22T02:00:00Z' }
    expect(deriveBookingStatus(left, on('2026-10-22'))).toBe('needs-attention')
    expect(deriveBookingStatus({ ...left, payment_status: 'paid' }, on('2026-10-22'))).toBe('checked-out')
  })

  it('needs attention after the stay if it isn\'t paid', () => {
    expect(deriveBookingStatus(stay, on('2026-10-23'))).toBe('needs-attention')
  })

  it('is checked out after the stay once paid', () => {
    expect(deriveBookingStatus({ ...stay, payment_status: 'paid' }, on('2026-10-23'))).toBe('checked-out')
  })

  it('is completed whenever it is marked done, whatever the dates', () => {
    expect(deriveBookingStatus({ ...stay, completed_at: '2026-10-22T05:00:00Z' }, on('2026-10-20'))).toBe('completed')
  })

  it('treats a booking without dates as upcoming', () => {
    expect(deriveBookingStatus({ check_in: null, check_out: null }, on('2026-10-20'))).toBe('upcoming')
  })

  it('uses the current time when none is given', () => {
    expect(deriveBookingStatus({ check_in: '2099-01-01', check_out: '2099-01-03' })).toBe('upcoming')
  })
})
