import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('@/test/supabaseMock'))

const {
  getTierInfo, nextTierInfo, computeSpecialistCommission, computeAffiliateCommission,
  computeCommissionAtRate, SPECIALIST_FLAT_RATE,
} = await import('./commissions')

describe('affiliate tiers', () => {
  it.each([
    [0, 'Bronze', 6],
    [19, 'Bronze', 6],
    [20, 'Silver', 8],
    [49, 'Silver', 8],
    [50, 'Gold', 10],
    [99, 'Gold', 10],
    [100, 'Platinum', 12],
    [5000, 'Platinum', 12],
  ])('%i completed bookings → %s at %i%%', (count, tier, rate) => {
    expect(getTierInfo(count)).toMatchObject({ tier, rate })
  })

  it('treats a missing or bad count as Bronze', () => {
    expect(getTierInfo(undefined).tier).toBe('Bronze')
    expect(getTierInfo('abc').tier).toBe('Bronze')
  })

  it('names the next tier, and none after Platinum', () => {
    expect(nextTierInfo(0).tier).toBe('Silver')
    expect(nextTierInfo(20).tier).toBe('Gold')
    expect(nextTierInfo(99).tier).toBe('Platinum')
    expect(nextTierInfo(100)).toBeNull()
  })
})

describe('commission amounts', () => {
  it('pays specialists a flat 10%', () => {
    expect(SPECIALIST_FLAT_RATE).toBe(10)
    expect(computeSpecialistCommission(12_345)).toBe(1234.5)
  })

  it('pays affiliates by their tier', () => {
    expect(computeAffiliateCommission(10_000, 0)).toBe(600)    // Bronze 6%
    expect(computeAffiliateCommission(10_000, 25)).toBe(800)   // Silver 8%
    expect(computeAffiliateCommission(10_000, 60)).toBe(1000)  // Gold 10%
    expect(computeAffiliateCommission(10_000, 150)).toBe(1200) // Platinum 12%
  })

  it('uses the rate saved on the booking', () => {
    expect(computeCommissionAtRate(9_999, 8)).toBe(799.92)
  })

  it('rounds to the centavo', () => {
    expect(computeCommissionAtRate(333.33, 10)).toBe(33.33)
    expect(computeSpecialistCommission(0.05)).toBe(0.01)
  })

  it('is 0 for a zero, negative or missing total, or no rate', () => {
    expect(computeSpecialistCommission(0)).toBe(0)
    expect(computeSpecialistCommission(-500)).toBe(0)
    expect(computeAffiliateCommission(undefined, 10)).toBe(0)
    expect(computeCommissionAtRate(1000, 0)).toBe(0)
    expect(computeCommissionAtRate(1000, null)).toBe(0)
    expect(computeCommissionAtRate(1000, 'abc')).toBe(0)
  })
})
