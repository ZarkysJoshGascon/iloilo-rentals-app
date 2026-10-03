// src/hooks/useDebouncedRealtime.js
import { useEffect, useId, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to Supabase postgres_changes with a debounce on the callback.
 *
 * - Channel name is derived from React's useId() so multiple mounts of
 *   the same component don't collide (dev StrictMode, multiple tabs).
 * - Burst events collapse into a single refetch via debounce.
 * - Cleans up the timer + channel on unmount.
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
  const reactId = useId().replace(/:/g, '')

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled || !table) return

    const channelName = `rt-${table}-${filter || 'all'}-${reactId}`

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
  }, [table, filter, debounceMs, enabled, reactId])
}