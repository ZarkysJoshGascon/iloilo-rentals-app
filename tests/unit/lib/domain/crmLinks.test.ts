import { describe, expect, it } from 'vitest'
import { crmLink, findContractForCleaning } from '@/lib/domain/crmLinks'
import { makeBooking, makeCleaning, makeContract } from '../../factories'

describe('crmLink', () => {
  it('opens a contract in Contracts or in Accounting', () => {
    expect(crmLink.contract('c1')).toBe('/admin?tab=contracts&contract=c1')
    expect(crmLink.accounting('c1')).toBe('/admin?tab=accounting&contract=c1')
  })

  it('opens Accounting on the month a booking checks in, with it picked', () => {
    const booking = makeBooking({ id: 'b1', check_in: '2026-03-30', check_out: '2026-04-02' })
    expect(crmLink.accountingBooking('c1', booking)).toBe('/admin?tab=accounting&contract=c1&month=2026-03&booking=b1')
  })

  it('opens Accounting on the month of a cleaning, with it picked', () => {
    const cleaning = makeCleaning({ id: 'cl1', scheduled_date: '2026-04-02' })
    expect(crmLink.accountingCleaning('c1', cleaning)).toBe('/admin?tab=accounting&contract=c1&month=2026-04&cleaning=cl1')
  })

  it('opens a booking or a cleaning on its own page', () => {
    expect(crmLink.booking('b1')).toBe('/admin?tab=bookings&booking=b1')
    expect(crmLink.cleaning('cl1')).toBe('/admin?tab=housekeeping&cleaning=cl1')
  })
})

describe('findContractForCleaning', () => {
  const earlier = makeContract({ id: 'old', unit_id: 'u1', effective_date: '2025-01-01', expiry_date: '2025-12-31', superseded_by: 'new' })
  const current = makeContract({ id: 'new', unit_id: 'u1', effective_date: '2026-01-01', expiry_date: '2026-12-31' })
  const contracts = [earlier, current]

  it('is the unit\'s contract on the day of the cleaning', () => {
    expect(findContractForCleaning(makeCleaning({ unit_id: 'u1', scheduled_date: '2025-06-01' }), contracts)?.id).toBe('old')
    expect(findContractForCleaning(makeCleaning({ unit_id: 'u1', scheduled_date: '2026-06-01' }), contracts)?.id).toBe('new')
  })

  it('is none outside every contract, or without a unit or a date', () => {
    expect(findContractForCleaning(makeCleaning({ unit_id: 'u1', scheduled_date: '2030-01-01' }), contracts)).toBeNull()
    expect(findContractForCleaning(makeCleaning({ unit_id: null }), contracts)).toBeNull()
    expect(findContractForCleaning(makeCleaning({ scheduled_date: null }), contracts)).toBeNull()
    expect(findContractForCleaning(null, contracts)).toBeNull()
  })
})
