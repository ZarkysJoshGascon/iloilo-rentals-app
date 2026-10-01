// src/lib/accountingRpc.js
import { supabase } from './supabase'

/**
 * Fetch bulk lifetime figures for many contracts in one RPC call.
 * Returns a Map<contract_id, { gross, expenses, net, owner, company, monthsCount }>
 */
export async function fetchContractsLifetime(contractIds) {
  const ids = (contractIds || []).filter(Boolean)
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase.rpc('contracts_lifetime_bulk', {
    p_contract_ids: ids,
  })

  if (error) {
    console.error('contracts_lifetime_bulk RPC failed:', error)
    throw error
  }

  const map = new Map()
  for (const row of (data || [])) {
    map.set(row.contract_id, {
      gross: Number(row.gross) || 0,
      expenses: Number(row.expenses) || 0,
      net: Number(row.net) || 0,
      owner: Number(row.owner_share) || 0,
      company: Number(row.company_share) || 0,
      monthsCount: Number(row.months_count) || 0,
    })
  }
  return map
}