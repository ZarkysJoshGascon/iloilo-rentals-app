// src/admin/shell/useContractAlerts.ts
// Contracts that need renewing, for the CRM's warning bar and sidebar badge:
// those expiring within CONTRACT_ALERT_DAYS, and those already expired on a
// unit that's still active (it can't take bookings until it's renewed).
// This replaced the old daily renewal email (send-renewal-digest, now removed).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDebouncedRealtime } from '@/hooks/useDebouncedRealtime'

export const CONTRACT_ALERT_DAYS = 30
export const CONTRACT_URGENT_DAYS = 7

export function useContractAlerts() {
  const [state, setState] = useState({ loading: true, items: [] })

  const load = useCallback(async () => {
    // v_expiring: contracts (not superseded) ending within 90 days or already ended.
    const { data, error } = await supabase
      .from('v_expiring')
      .select('contract_id, unit_id, unit_code, building, owner_name, expiry_date, days_until_expiry')
    if (error) {
      console.error('Contract alerts failed to load:', error)
      setState({ loading: false, items: [] })
      return
    }

    const rows = (data || []).filter((r) => r.days_until_expiry <= CONTRACT_ALERT_DAYS)

    // Expired contracts only matter while their unit is still active.
    const expiredUnitIds = [...new Set(rows.filter((r) => r.days_until_expiry < 0).map((r) => r.unit_id))]
    let activeUnits = new Set()
    if (expiredUnitIds.length > 0) {
      const { data: units, error: unitsError } = await supabase.from('units').select('id, status').in('id', expiredUnitIds)
      if (unitsError) console.error('Contract alerts: unit lookup failed:', unitsError)
      activeUnits = new Set((units || []).filter((u) => u.status === 'ACTIVE').map((u) => u.id))
    }

    const items = rows
      .filter((r) => r.days_until_expiry >= 0 || activeUnits.has(r.unit_id))
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry)
      .map((r) => ({
        id: r.contract_id,
        unitCode: r.unit_code,
        building: r.building,
        owner: r.owner_name,
        expiry: r.expiry_date,
        days: r.days_until_expiry,
      }))

    setState({ loading: false, items })
  }, [])

  useEffect(() => { load() }, [load])
  useDebouncedRealtime({ table: 'contracts', onChange: load, debounceMs: 2000 })

  const expired = state.items.filter((c) => c.days < 0).length
  const urgent = state.items.filter((c) => c.days >= 0 && c.days <= CONTRACT_URGENT_DAYS).length
  const soon = state.items.length - expired - urgent

  return { ...state, expired, urgent, soon, total: state.items.length }
}
