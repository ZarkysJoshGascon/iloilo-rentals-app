// src/hooks/useDebouncedRealtime.js
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to Supabase postgres_changes with a debounce on the callback.
 * - Each hook instance uses a unique channel name to avoid the Supabase
 *   "same-name channel replaces previous" footgun (breaks multi-tab).
 * - The callback is debounced, so a burst of events (e.g. bulk import)
 *   collapses into a single refetch.
 * - Cleans up the timer and channel on unmount.
 *
 * Usage:
 *   useDebouncedRealtime({ table: 'bookings', onChange: fetchData, debounceMs: 1500 })
 *   useDebouncedRealtime({ table: 'cleanings', filter: `unit_id=eq.${unitId}`, onChange: fetchData })
 */
export function useDebouncedRealtime({
  table,
  filter,
  onChange,
  debounceMs = 1500,
  enabled = true,
}) {
  const timerRef = useRef(null)
  const onChangeRef = useRef(onChange)

  // Keep the latest onChange accessible without re-subscribing.
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled || !table) return

    const suffix = Math.random().toString(36).slice(2, 8)
    const channelName = `rt-${table}-${filter || 'all'}-${suffix}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => {
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => {
            onChangeRef.current?.()
          }, debounceMs)
        },
      )
      .subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [table, filter, debounceMs, enabled])
}