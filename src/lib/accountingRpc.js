// src/lib/accountingRpc.js
import { supabase } from './supabase'

/**
 * Bulk lifetime figures for many contracts in one RPC call.
 * Returns Map<contract_id, { gross, expenses, net, owner, company, monthsCount }>
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
      gross:       Number(row.gross) || 0,
      expenses:    Number(row.expenses) || 0,
      net:         Number(row.net) || 0,
      owner:       Number(row.owner_share) || 0,
      company:     Number(row.company_share) || 0,
      monthsCount: Number(row.months_count) || 0,
    })
  }
  return map
}

/**
 * Per-month breakdown for a single contract.
 * Single source of truth for the graph, the calendar, and the monthly panel.
 * Returns an array of statements shaped like the old computeMonthlyStatement output,
 * minus the bookingsList/cleaningsList/manualRow fields (the caller merges those in).
 */
export async function fetchContractMonthlyBreakdown(contractId) {
  if (!contractId) return []

  const { data, error } = await supabase.rpc('contract_monthly_breakdown', {
    p_contract_id: contractId,
  })

  if (error) {
    console.error('contract_monthly_breakdown RPC failed:', error)
    throw error
  }

  return (data || []).map((r) => {
    // r.month is a date ('YYYY-MM-DD'); the rest of the app uses 'YYYY-MM'
    const monthKey = typeof r.month === 'string'
      ? r.month.slice(0, 7)
      : new Date(r.month).toISOString().slice(0, 7)

    const gross          = Number(r.gross) || 0
    const bookingComm    = Number(r.booking_comm) || 0
    const affiliateComm  = Number(r.affiliate_comm) || 0
    const housekeeping   = Number(r.housekeeping) || 0
    const laundry        = Number(r.laundry) || 0
    const electricity    = Number(r.electricity) || 0
    const internet       = Number(r.internet) || 0
    const water          = Number(r.water) || 0
    const marketing      = Number(r.marketing) || 0
    const customTotal    = Number(r.custom_total) || 0
    const totalExpenses  = Number(r.total_expenses) || 0
    const netProfit      = Number(r.net) || 0
    const ownerShare     = Number(r.owner_share) || 0
    const companyShare   = Number(r.company_share) || 0

    return {
      month:               monthKey,
      grossRevenue:        gross,
      bookingCommission:   bookingComm,
      affiliateCommission: affiliateComm,
      housekeeping,
      laundry,
      electricity,
      internet,
      water,
      marketing,
      customTotal,
      totalExpenses,
      netProfit,
      ownerShare,
      companyShare,
      // Filled in by the caller from its local bookings / cleanings / monthlyExpenses
      bookingsList:  [],
      cleaningsList: [],
      manualRow:     null,
      customItems:   [],
    }
  })
}