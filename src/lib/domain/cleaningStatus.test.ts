import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('@/test/supabaseMock'))

const { canCleaningTransition, getEffectiveStatus, isPendingEvaluation, VALID_CLEANING_TRANSITIONS } = await import('./cleaningStatus')

describe('cleaning status changes', () => {
  it.each([
    ['scheduled', 'ready'],
    ['scheduled', 'cancelled'],
    ['ready', 'submitted'],
    ['ready', 'cancelled'],
    ['submitted', 'completed'],
    ['submitted', 'ready'], // sent back to the housekeeper
  ])('allows %s → %s', (from, to) => {
    expect(canCleaningTransition(from, to)).toBe(true)
  })

  it.each([
    ['scheduled', 'completed'],  // can't skip the photos and the review
    ['scheduled', 'submitted'],
    ['ready', 'completed'],      // can't approve what wasn't submitted
    ['completed', 'ready'],      // nothing moves back from completed
    ['completed', 'cancelled'],
    ['cancelled', 'scheduled'],  // or from cancelled
  ])('refuses %s → %s', (from, to) => {
    expect(canCleaningTransition(from, to)).toBe(false)
  })

  it('allows staying put, and refuses unknown statuses', () => {
    expect(canCleaningTransition('ready', 'ready')).toBe(true)
    expect(canCleaningTransition('mystery', 'ready')).toBe(false)
  })

  it('ends at completed and cancelled', () => {
    expect(VALID_CLEANING_TRANSITIONS.completed).toEqual([])
    expect(VALID_CLEANING_TRANSITIONS.cancelled).toEqual([])
  })
})

describe('getEffectiveStatus (what Housekeeping shows)', () => {
  const past = { check_out: '2020-01-02', checked_out_at: '2020-01-02T03:00:00Z' }
  const future = { check_out: '2099-01-02' }

  it('shows completed, cancelled and submitted as they are', () => {
    expect(getEffectiveStatus({ status: 'completed', bookings: future })).toBe('completed')
    expect(getEffectiveStatus({ status: 'cancelled', bookings: future })).toBe('cancelled')
    expect(getEffectiveStatus({ status: 'submitted', bookings: future })).toBe('to-be-evaluated')
  })

  it('is scheduled until the guest leaves, then ready', () => {
    expect(getEffectiveStatus({ status: 'scheduled', bookings: future })).toBe('scheduled')
    expect(getEffectiveStatus({ status: 'scheduled', bookings: past })).toBe('ready')
  })

  it('is ready when there is no booking to wait for', () => {
    expect(getEffectiveStatus({ status: 'scheduled', bookings: null })).toBe('ready')
  })

  it('flags only submitted cleanings for review', () => {
    expect(isPendingEvaluation({ status: 'submitted' })).toBe(true)
    expect(isPendingEvaluation({ status: 'ready' })).toBe(false)
  })
})
