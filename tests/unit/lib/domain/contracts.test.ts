import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deriveContractStatus, canExtendContract, canRenewContract, dayAfterISO, termEndISO,
  contractTerms, currentContractForUnit, findContractForBooking, findGoverningContract,
} from '@/lib/domain/contracts'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T04:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('deriveContractStatus', () => {
  it.each([
    [{ effective_date: '2026-01-01', expiry_date: '2027-06-30' }, 'active'],
    [{ effective_date: '2026-01-01', expiry_date: '2026-12-18' }, 'expiring'], // 60 days left
    [{ effective_date: '2026-01-01', expiry_date: '2026-12-19' }, 'active'],   // 61 days left
    [{ effective_date: '2026-01-01', expiry_date: '2026-10-19' }, 'expiring'], // ends today
    [{ effective_date: '2025-01-01', expiry_date: '2026-10-18' }, 'expired'],
    [{ effective_date: '2025-01-01', expiry_date: '2026-01-01', superseded_by: 'c2' }, 'renewed'],
    [{ effective_date: null, expiry_date: '2027-01-01' }, 'incomplete'],
    [{ effective_date: '2026-01-01', expiry_date: null }, 'active'],
    [null, 'inactive'],
  ])('%o → %s', (contract, status) => {
    expect(deriveContractStatus(contract)).toBe(status)
  })

  it("goes by the Manila date: just after midnight, yesterday's contract has ended", () => {
    vi.setSystemTime(new Date('2026-10-19T16:30:00Z')) // 12:30 AM on Oct 20 in Manila, still Oct 19 in UTC
    expect(deriveContractStatus({ effective_date: '2025-01-01', expiry_date: '2026-10-19' })).toBe('expired')
    expect(deriveContractStatus({ effective_date: '2026-01-01', expiry_date: '2026-10-20' })).toBe('expiring')
  })

  it('can extend a running contract but not an ended or renewed one', () => {
    expect(canExtendContract({ effective_date: '2026-01-01', expiry_date: '2026-12-01' })).toBe(true)
    expect(canExtendContract({ effective_date: '2026-01-01', expiry_date: null })).toBe(false)
    expect(canExtendContract({ effective_date: '2025-01-01', expiry_date: '2026-01-01' })).toBe(false)
  })

  it('can renew only an ended contract that has not been renewed', () => {
    expect(canRenewContract({ effective_date: '2025-01-01', expiry_date: '2026-01-01' })).toBe(true)
    expect(canRenewContract({ effective_date: '2025-01-01', expiry_date: '2026-01-01', superseded_by: 'x' })).toBe(false)
  })
})

describe('term dates', () => {
  it('gives the day after', () => {
    expect(dayAfterISO('2026-12-31')).toBe('2027-01-01')
    expect(dayAfterISO('2028-02-28')).toBe('2028-02-29')
  })
  it('ends a 12-month term the day before its anniversary', () => {
    expect(termEndISO('2026-10-19', 12)).toBe('2027-10-18')
    expect(termEndISO('2026-01-01', 6)).toBe('2026-06-30')
  })
})

describe('contract chains and lookups', () => {
  const contracts = [
    { id: 'a', unit_id: 'u1', effective_date: '2024-01-01', expiry_date: '2024-12-31', superseded_by: 'b' },
    { id: 'b', unit_id: 'u1', effective_date: '2025-01-01', expiry_date: '2025-12-31', superseded_by: 'c' },
    { id: 'c', unit_id: 'u1', effective_date: '2026-01-01', expiry_date: '2026-12-31', superseded_by: null },
    { id: 'z', unit_id: 'u2', effective_date: '2026-01-01', expiry_date: '2026-12-31', superseded_by: null },
  ]

  it('lists every term of a renewal chain, oldest first, from any link', () => {
    expect(contractTerms(contracts[1], contracts).map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(contractTerms(contracts[3], contracts).map((c) => c.id)).toEqual(['z'])
  })

  it('does not loop forever on a broken chain', () => {
    const loop = [
      { id: 'p', superseded_by: 'q' },
      { id: 'q', superseded_by: 'p' },
    ]
    expect(contractTerms(loop[0], loop).length).toBeLessThanOrEqual(2)
  })

  it('finds the unit\'s current contract', () => {
    expect(currentContractForUnit({ id: 'u1' }, contracts).id).toBe('c')
    expect(currentContractForUnit({ id: 'u1', current_contract_id: 'c' }, contracts).id).toBe('c')
    expect(currentContractForUnit({ id: 'nope' }, contracts)).toBeNull()
  })

  it('finds the contract that covers a booking\'s check-in', () => {
    expect(findContractForBooking({ unit_id: 'u1', check_in: '2025-06-15' }, contracts).id).toBe('b')
    expect(findContractForBooking({ unit_id: 'u1', check_in: '2030-01-01' }, contracts)).toBeNull()
    expect(findContractForBooking({ unit_id: 'u2' }, contracts)).toBeNull()
  })

  it('finds the contract in force today', () => {
    expect(findGoverningContract({ id: 'u1' }, contracts).id).toBe('c')
    expect(findGoverningContract({ id: 'u3' }, contracts)).toBeNull()
  })

  it('goes by the Manila date for the contract in force', () => {
    const turnover = [
      { id: 'old', unit_id: 'u5', effective_date: '2025-10-20', expiry_date: '2026-10-19' },
      { id: 'new', unit_id: 'u5', effective_date: '2026-10-20', expiry_date: '2027-10-19' },
    ]
    vi.setSystemTime(new Date('2026-10-19T16:30:00Z')) // 12:30 AM on Oct 20 in Manila
    expect(findGoverningContract({ id: 'u5' }, turnover).id).toBe('new')
  })
})
