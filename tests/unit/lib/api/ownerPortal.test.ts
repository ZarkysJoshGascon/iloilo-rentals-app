import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const { supabase, rpcResult } = await import('../../supabaseMock')
const { fetchOwnerOverview, fetchOwnerContract, checkIsOwner } = await import('@/lib/api/ownerPortal')

const dbContract = {
  id: 'c1', contract_code: 'CT-0001', unit_id: 'u1', effective_date: '2026-03-01', expiry_date: '2027-02-28',
  superseded_by: null, unit_code: '9S', building: 'Saint Honore', unit_type: 'Studio', marketing_title: null,
  nights_booked: '108', days_elapsed: 234, upcoming_bookings: '7', next_check_in: '2026-10-23',
}

describe('fetchOwnerOverview', () => {
  it('shapes the owner\'s contracts and monthly figures for the overview', async () => {
    supabase.rpc.mockReturnValue(rpcResult({
      data: {
        owners: [{ id: 'o1', name: 'Maria Santos' }],
        contracts: [dbContract],
        months: [{ contract_id: 'c1', month: '2026-10-01', gross: '35000', total_expenses: 6500, net: 28500, owner_share: 21375, pm_share: null }],
      },
      error: null,
    }))
    const overview = await fetchOwnerOverview()
    expect(supabase.rpc).toHaveBeenCalledWith('owner_portal_overview')
    expect(overview.owners).toEqual([{ id: 'o1', name: 'Maria Santos' }])
    expect(overview.contracts[0]).toEqual({
      id: 'c1', contract_code: 'CT-0001', unit_id: 'u1', effective_date: '2026-03-01', expiry_date: '2027-02-28', superseded_by: null,
      previous_expiry_dates: [], records_cleared_at: null,
      units: { unit_code: '9S', building: 'Saint Honore', unit_type: 'Studio', marketing_title: null },
      nightsBooked: 108, daysElapsed: 234, upcomingBookings: 7, nextCheckIn: '2026-10-23',
    })
    expect(overview.months).toEqual([{ contractId: 'c1', month: '2026-10', gross: 35000, expenses: 6500, net: 28500, ownerShare: 21375, pmShare: 0 }])
  })

  it('is empty, not broken, for an account with no units', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: null }))
    expect(await fetchOwnerOverview()).toEqual({ owners: [], contracts: [], months: [] })
  })

  it('passes a database error on', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { message: 'Not signed in' } }))
    await expect(fetchOwnerOverview()).rejects.toEqual({ message: 'Not signed in' })
  })
})

describe('fetchOwnerContract', () => {
  it('asks for the one contract and shapes its months, bookings, cleanings and expenses', async () => {
    supabase.rpc.mockReturnValue(rpcResult({
      data: {
        contract: { ...dbContract, previous_expiry_dates: ['2026-12-31'], records_cleared_at: '2026-10-18T17:00:00Z' },
        months: [{
          month: '2026-10-01', gross: 35000, booking_comm: 1750, affiliate_comm: 250, housekeeping: 3000, laundry: 1500,
          electricity: 0, internet: 0, water: 0, marketing: 0, custom_total: 0, total_expenses: 6500, net: 28500,
          owner_share: 21375, company_share: 7125, pm_share: 0, pm_name: null,
        }],
        bookings: [{ id: 'b1', booking_code: 'BK-1' }],
        cleanings: [
          { id: 'cl1', cleaning_code: 'CL-1', booking_code: 'BK-1', guest_name: 'Ana Reyes' },
          { id: 'cl2', cleaning_code: 'CL-2', booking_code: null, guest_name: null },
        ],
        expenses: [{ month: '2026-09-01', electricity: 2100, electricity_image: 'c1/elec.jpg', custom_items: [] }],
      },
      error: null,
    }))
    const detail = await fetchOwnerContract('c1')
    expect(supabase.rpc).toHaveBeenCalledWith('owner_contract_detail', { p_contract_id: 'c1' })
    expect(detail.contract.previous_expiry_dates).toEqual(['2026-12-31'])
    // The portal says when a term's records were archived; it needs this kept.
    expect(detail.contract.records_cleared_at).toBe('2026-10-18T17:00:00Z')
    expect(detail.months[0]).toMatchObject({ month: '2026-10', gross: 35000, totalExpenses: 6500, ownerShare: 21375, companyKeeps: 7125, pmShare: 0, pmName: null, other: 0 })
    expect(detail.bookings).toEqual([{ id: 'b1', booking_code: 'BK-1' }])
    // Shaped like the CRM's cleanings (booking nested) for the shared calendar.
    expect(detail.cleanings[0].bookings).toEqual({ booking_code: 'BK-1', guest_name: 'Ana Reyes' })
    expect(detail.cleanings[1].bookings).toBeNull()
    expect(detail.expenses[0]).toMatchObject({ month: '2026-09', electricity_image: 'c1/elec.jpg' })
  })

  it('passes "not your contract" on', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { code: '42501', message: 'Contract not found' } }))
    await expect(fetchOwnerContract('someone-elses')).rejects.toMatchObject({ code: '42501' })
  })
})

describe('checkIsOwner', () => {
  it('is true only when the database says so', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: true, error: null }))
    expect(await checkIsOwner()).toBe(true)
    supabase.rpc.mockReturnValue(rpcResult({ data: false, error: null }))
    expect(await checkIsOwner()).toBe(false)
  })

  it('is false, not an error, when the check fails', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { message: 'down' } }))
    expect(await checkIsOwner()).toBe(false)
  })
})
