import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const { supabase, rpcResult } = await import('../../supabaseMock')
const { logAudit } = await import('@/lib/api/auditLog')

describe('logAudit', () => {
  it('records the action through the database function, which adds who did it', async () => {
    await logAudit('update', 'bookings', 'b1', { field: 'guest_name' })
    expect(supabase.rpc).toHaveBeenCalledWith('log_audit', {
      p_action: 'update', p_table_name: 'bookings', p_record_id: 'b1', p_details: { field: 'guest_name' },
    })
  })

  it('trims long names, and sends no record id or empty details when there are none', async () => {
    await logAudit('x'.repeat(300), 't'.repeat(150), '', 'not an object')
    expect(supabase.rpc).toHaveBeenCalledWith('log_audit', {
      p_action: 'x'.repeat(200), p_table_name: 't'.repeat(100), p_record_id: null, p_details: {},
    })
  })

  it('never stops what the user was doing: a refusal is only reported', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: { code: '42501', message: 'permission denied' } }))
    await expect(logAudit('delete', 'bookings', 'b1')).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith('Audit log RPC error:', expect.objectContaining({ code: '42501' }))
  })

  it('never stops what the user was doing: nor is a dropped connection', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockImplementation(() => { throw new TypeError('Failed to fetch') })
    await expect(logAudit('delete', 'bookings', 'b1')).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith('Audit log exception:', expect.any(TypeError))
  })
})
