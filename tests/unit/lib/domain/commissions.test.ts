import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const { supabase, rpcResult } = await import('../../supabaseMock')
const {
  getTierInfo, nextTierInfo, computeSpecialistCommission, computeAffiliateCommission,
  computeCommissionAtRate, SPECIALIST_FLAT_RATE, TIER_LADDER,
  fetchAffiliateCompletedCount, fetchSpecialistCompletedCount, fetchTeamCompletedCounts,
  fetchAffiliateCounts, fetchSpecialistCounts, formatMoney, formatRatePercent,
} = await import('@/lib/domain/commissions')

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

describe('the tier ladder', () => {
  it('climbs without gaps or overlaps, and rates only go up', () => {
    for (let i = 1; i < TIER_LADDER.length; i++) {
      expect(TIER_LADDER[i].min, TIER_LADDER[i].tier).toBe(TIER_LADDER[i - 1].max + 1)
      expect(TIER_LADDER[i].rate).toBeGreaterThan(TIER_LADDER[i - 1].rate)
    }
    expect(TIER_LADDER[0].min).toBe(0)
    expect(TIER_LADDER.at(-1)!.max).toBe(Infinity)
  })
})

describe('completed-booking counts from the database', () => {
  // The silenced errors are expected here; the functions log and carry on.
  const quietly = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('asks for one person\'s count by code', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: 12, error: null }))
    expect(await fetchAffiliateCompletedCount('AF-1')).toBe(12)
    expect(supabase.rpc).toHaveBeenCalledWith('affiliate_completed_count', { p_code: 'AF-1' })
    supabase.rpc.mockReturnValue(rpcResult({ data: '7', error: null }))
    expect(await fetchSpecialistCompletedCount('SP-1')).toBe(7)
    expect(supabase.rpc).toHaveBeenLastCalledWith('specialist_completed_count', { p_code: 'SP-1' })
  })

  it('is 0 without a code (and asks nothing), or when the database fails', async () => {
    quietly()
    expect(await fetchAffiliateCompletedCount('')).toBe(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { message: 'down' } }))
    expect(await fetchAffiliateCompletedCount('AF-1')).toBe(0)
    expect(await fetchSpecialistCompletedCount('SP-1')).toBe(0)
  })

  it('splits the bulk answer into specialists and affiliates', async () => {
    supabase.rpc.mockReturnValue(rpcResult({
      data: [
        { kind: 'specialist', code: 'SP-1', cnt: '4' },
        { kind: 'affiliate', code: 'AF-1', cnt: 21 },
        { kind: 'affiliate', code: 'AF-2', cnt: null },
      ],
      error: null,
    }))
    expect(await fetchTeamCompletedCounts()).toEqual({ specialists: { 'SP-1': 4 }, affiliates: { 'AF-1': 21, 'AF-2': 0 } })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('gives empty counts when the bulk query fails', async () => {
    quietly()
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { message: 'down' } }))
    expect(await fetchTeamCompletedCounts()).toEqual({ specialists: {}, affiliates: {} })
  })

  it('answers for exactly the codes asked, 0 for unknown ones, in one query', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: [{ kind: 'affiliate', code: 'AF-1', cnt: 3 }, { kind: 'specialist', code: 'SP-9', cnt: 8 }], error: null }))
    expect(await fetchAffiliateCounts(['AF-1', 'AF-404', '', null])).toEqual({ 'AF-1': 3, 'AF-404': 0 })
    expect(await fetchSpecialistCounts(['SP-9'])).toEqual({ 'SP-9': 8 })
    expect(await fetchAffiliateCounts([])).toEqual({})
    expect(supabase.rpc).toHaveBeenCalledTimes(2) // the empty list asked nothing
  })
})

describe('formatting', () => {
  it('shows pesos with up to two decimals, and rates as percentages', () => {
    expect(formatMoney(1500)).toBe('₱1,500')
    expect(formatMoney(799.92)).toBe('₱799.92')
    expect(formatMoney(undefined)).toBe('₱0')
    expect(formatRatePercent(8)).toBe('8%')
    expect(formatRatePercent('abc')).toBe('0%')
  })
})
