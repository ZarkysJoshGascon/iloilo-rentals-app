import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const { supabase, queryBuilder } = await import('../../supabaseMock')
const { renewContract, daysUntil, formatDate } = await import('@/lib/api/registry')

describe('renewContract', () => {
  it('starts the new contract, marks the old one renewed, and makes the new one the unit\'s current', async () => {
    const calls: { table: string; b: any }[] = []
    supabase.from.mockImplementation((table: string) => {
      const result = table === 'units' && calls.filter((c) => c.table === 'units').length === 0
        ? { data: { current_contract_id: 'old' }, error: null }
        : table === 'contracts' && calls.filter((c) => c.table === 'contracts').length === 0
          ? { data: { id: 'new', unit_id: 'u1' }, error: null }
          : { data: {}, error: null }
      const b = queryBuilder(result)
      calls.push({ table, b })
      return b
    })

    const created = await renewContract('u1', { effective_date: '2027-01-01', expiry_date: '2027-12-31' })

    expect(created).toEqual({ id: 'new', unit_id: 'u1' })
    const [, insert, supersede, unitUpdate] = calls
    expect(insert.b.insert).toHaveBeenCalledWith(expect.objectContaining({ unit_id: 'u1', effective_date: '2027-01-01' }))
    expect(supersede.b.update).toHaveBeenCalledWith(expect.objectContaining({ superseded_by: 'new' }))
    expect(supersede.b.eq).toHaveBeenCalledWith('id', 'old')
    expect(unitUpdate.b.update).toHaveBeenCalledWith(expect.objectContaining({ current_contract_id: 'new', status: 'ACTIVE' }))
  })

  it('stops before creating anything if the unit can\'t be read', async () => {
    supabase.from.mockReturnValueOnce(queryBuilder({ data: null, error: new Error('unit not found') }))
    await expect(renewContract('u1', {})).rejects.toThrow('unit not found')
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })
})

describe('daysUntil', () => {
  it('counts whole days from today in Manila, past dates negative', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T15:00:00Z')) // 11 PM Oct 20 in Manila
    expect(daysUntil('2026-10-20')).toBe(0)
    expect(daysUntil('2026-10-21')).toBe(1)
    expect(daysUntil('2026-12-19')).toBe(60)
    expect(daysUntil('2026-10-18')).toBe(-2)
    expect(daysUntil(null)).toBeNull()
  })

  it('formats a date for the registry', () => {
    expect(formatDate('2026-10-20')).toBe('Oct 20, 2026')
    expect(formatDate(null)).toBe('—')
  })
})
