import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/lib/supabase', () => import('../supabaseMock'))

const { supabase } = await import('../supabaseMock')
const { useDebouncedRealtime } = await import('@/hooks/useDebouncedRealtime')

const lastChannel = () => supabase.channel.mock.results.at(-1)!.value

describe('useDebouncedRealtime', () => {
  it('listens to every change on the table, filtered when asked', () => {
    renderHook(() => useDebouncedRealtime({ table: 'cleanings', filter: 'unit_id=eq.u1', onChange: vi.fn() }))
    expect(supabase.channel).toHaveBeenCalledWith(expect.stringMatching(/^rt-cleanings-unit_id=eq\.u1-/))
    expect(lastChannel().on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cleanings', filter: 'unit_id=eq.u1' },
      expect.any(Function),
    )
    expect(lastChannel().subscribe).toHaveBeenCalled()
  })

  it('turns a burst of changes into one call, after the quiet period', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    renderHook(() => useDebouncedRealtime({ table: 'bookings', onChange, debounceMs: 1_500 }))
    const channel = lastChannel()

    await channel.emit('bookings', {})
    await vi.advanceTimersByTimeAsync(1_000)
    await channel.emit('bookings', {})
    await vi.advanceTimersByTimeAsync(1_000)
    await channel.emit('bookings', {})
    await vi.advanceTimersByTimeAsync(1_499)
    expect(onChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('calls the latest callback, without subscribing again', async () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useDebouncedRealtime({ table: 'bookings', onChange: cb, debounceMs: 100 }), { initialProps: { cb: first } })
    rerender({ cb: second })
    await lastChannel().emit('bookings', {})
    await vi.advanceTimersByTimeAsync(100)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(supabase.channel).toHaveBeenCalledTimes(1)
  })

  it('stops listening, and drops a pending call, when the page closes', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { unmount } = renderHook(() => useDebouncedRealtime({ table: 'bookings', onChange, debounceMs: 100 }))
    const channel = lastChannel()
    await channel.emit('bookings', {})
    unmount()
    await vi.advanceTimersByTimeAsync(500)
    expect(onChange).not.toHaveBeenCalled()
    expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('does nothing while turned off', () => {
    renderHook(() => useDebouncedRealtime({ table: 'bookings', onChange: vi.fn(), enabled: false }))
    expect(supabase.channel).not.toHaveBeenCalled()
  })
})
