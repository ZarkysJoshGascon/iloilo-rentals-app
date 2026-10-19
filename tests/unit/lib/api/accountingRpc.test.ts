import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const { supabase, rpcResult } = await import('../../supabaseMock')
const { fetchContractsLifetime, fetchContractMonthlyBreakdown } = await import('@/lib/api/accountingRpc')

const quietly = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('fetchContractsLifetime', () => {
  it('asks once for every contract and maps the figures by contract', async () => {
    supabase.rpc.mockReturnValue(rpcResult({
      data: [
        { contract_id: 'c1', gross: '120000.5', expenses: 30000, net: 90000.5, owner_share: 67500.38, company_share: 22500.12, pm_share: 0, months_count: 9 },
        { contract_id: 'c2', gross: null, expenses: null, net: null, owner_share: null, company_share: null, pm_share: null, months_count: null },
      ],
      error: null,
    }))
    const map = await fetchContractsLifetime(['c1', null, 'c2'])
    expect(supabase.rpc).toHaveBeenCalledWith('contracts_lifetime_bulk', { p_contract_ids: ['c1', 'c2'] })
    expect(map.get('c1')).toEqual({ gross: 120000.5, expenses: 30000, net: 90000.5, owner: 67500.38, company: 22500.12, pm: 0, monthsCount: 9 })
    expect(map.get('c2')).toEqual({ gross: 0, expenses: 0, net: 0, owner: 0, company: 0, pm: 0, monthsCount: 0 })
  })

  it('asks nothing for no contracts', async () => {
    expect((await fetchContractsLifetime([])).size).toBe(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('passes a database error on', async () => {
    quietly()
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { message: 'timeout' } }))
    await expect(fetchContractsLifetime(['c1'])).rejects.toEqual({ message: 'timeout' })
  })
})

describe('fetchContractMonthlyBreakdown', () => {
  it('turns each database month into the app\'s month statement', async () => {
    supabase.rpc.mockReturnValue(rpcResult({
      data: [{
        month: '2026-03-01', gross: '35000', booking_comm: 1750, affiliate_comm: 250, housekeeping: 3000, laundry: 1500,
        electricity: 2100, internet: 1699, water: 410, marketing: 0, custom_total: 800, total_expenses: 11509,
        net: 23491, owner_share: 17618.25, company_share: 5872.75, pm_share: 2055.46, pm_id: 'pm1', pm_name: 'Leo',
      }],
      error: null,
    }))
    const [march] = await fetchContractMonthlyBreakdown('c1')
    expect(supabase.rpc).toHaveBeenCalledWith('contract_monthly_breakdown', { p_contract_id: 'c1' })
    expect(march).toMatchObject({
      month: '2026-03', grossRevenue: 35000, bookingCommission: 1750, affiliateCommission: 250,
      housekeeping: 3000, laundry: 1500, customTotal: 800, totalExpenses: 11509, netProfit: 23491,
      ownerShare: 17618.25, companyShare: 5872.75, pmShare: 2055.46, pmId: 'pm1', pmName: 'Leo',
      bookingsList: [], cleaningsList: [], manualRow: null, customItems: [],
    })
  })

  it('reads a month given as a date, and gives no PM as null', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: [{ month: new Date('2026-04-01T00:00:00Z'), gross: 0 }], error: null }))
    const [april] = await fetchContractMonthlyBreakdown('c1')
    expect(april).toMatchObject({ month: '2026-04', grossRevenue: 0, pmId: null, pmName: null })
  })

  it('asks nothing without a contract, and passes errors on', async () => {
    expect(await fetchContractMonthlyBreakdown(null)).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
    quietly()
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { message: 'denied' } }))
    await expect(fetchContractMonthlyBreakdown('c1')).rejects.toEqual({ message: 'denied' })
  })
})
