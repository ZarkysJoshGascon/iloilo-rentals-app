// src/lib/commissions.js
import { supabase } from './supabase'

// ============================================================
// TIER LADDER
//   Everyone starts at Bronze. No "Unranked" state.
//   Bronze 6% · Silver 8% · Gold 10% · Platinum 12%
//   Specialist is always flat 10% — not tier-based.
// ============================================================
export const TIER_LADDER = [
  { tier: 'Bronze',   min: 0,   max: 19,       rate: 6,  badge: 'bg-amber-700 text-white' },
  { tier: 'Silver',   min: 20,  max: 49,       rate: 8,  badge: 'bg-slate-400 text-white' },
  { tier: 'Gold',     min: 50,  max: 99,       rate: 10, badge: 'bg-amber-500 text-white' },
  { tier: 'Platinum', min: 100, max: Infinity, rate: 12, badge: 'bg-cyan-600 text-white' },
]

export const SPECIALIST_FLAT_RATE = 10  // %

export function getTierInfo(count) {
  const c = Number(count) || 0
  for (const t of TIER_LADDER) {
    if (c >= t.min && c <= t.max) return t
  }
  return TIER_LADDER[0]
}

export function nextTierInfo(count) {
  const c = Number(count) || 0
  for (const t of TIER_LADDER) {
    if (c < t.min) return t
  }
  return null
}

// ============================================================
// CALCULATORS
// ============================================================

export function computeSpecialistCommission(totalAmount) {
  const total = Number(totalAmount) || 0
  if (total <= 0) return 0
  return Math.round(total * (SPECIALIST_FLAT_RATE / 100) * 100) / 100
}

export function computeAffiliateCommission(totalAmount, completedCount) {
  const total = Number(totalAmount) || 0
  if (total <= 0) return 0
  const info = getTierInfo(completedCount)
  if (info.rate <= 0) return 0
  return Math.round(total * (info.rate / 100) * 100) / 100
}

// Compute from an explicit rate percentage (used after snapshot).
export function computeCommissionAtRate(totalAmount, ratePercent) {
  const total = Number(totalAmount) || 0
  const rate = Number(ratePercent)
  if (total <= 0 || !Number.isFinite(rate) || rate <= 0) return 0
  return Math.round(total * (rate / 100) * 100) / 100
}

// ============================================================
// LIVE COUNTS FROM DB
// ============================================================
export async function fetchAffiliateCompletedCount(code) {
  if (!code) return 0
  const { data, error } = await supabase.rpc('affiliate_completed_count', { p_code: code })
  if (error) {
    console.error('affiliate_completed_count failed:', error)
    return 0
  }
  return Number(data) || 0
}

export async function fetchSpecialistCompletedCount(code) {
  if (!code) return 0
  const { data, error } = await supabase.rpc('specialist_completed_count', { p_code: code })
  if (error) {
    console.error('specialist_completed_count failed:', error)
    return 0
  }
  return Number(data) || 0
}

// Bulk fetch — one RPC for all codes at once.
// Returns { specialists: {}, affiliates: {} }.
export async function fetchTeamCompletedCounts() {
  const { data, error } = await supabase.rpc('team_completed_counts')

  if (error) {
    console.error('team_completed_counts failed:', error)
    return { specialists: {}, affiliates: {} }
  }

  const specialists = {}
  const affiliates = {}
  for (const row of data || []) {
    const bucket = row.kind === 'specialist' ? specialists : affiliates
    bucket[row.code] = Number(row.cnt) || 0
  }
  return { specialists, affiliates }
}

/**
 * Bulk affiliate counts for a given list of codes.
 * Uses the single bulk RPC and filters locally — replaces the
 * old N parallel RPC fan-out.
 */
export async function fetchAffiliateCounts(codes) {
  const wanted = (codes || []).filter(Boolean)
  if (wanted.length === 0) return {}

  const { affiliates } = await fetchTeamCompletedCounts()
  const out = {}
  for (const code of wanted) out[code] = affiliates[code] || 0
  return out
}

export async function fetchSpecialistCounts(codes) {
  const wanted = (codes || []).filter(Boolean)
  if (wanted.length === 0) return {}

  const { specialists } = await fetchTeamCompletedCounts()
  const out = {}
  for (const code of wanted) out[code] = specialists[code] || 0
  return out
}

// ============================================================
// FORMATTING
// ============================================================
export function formatMoney(n) {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatRatePercent(rate) {
  const r = Number(rate) || 0
  return `${r}%`
}