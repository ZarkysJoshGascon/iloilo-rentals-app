// src/lib/commissions.js
import { supabase } from './supabase'

// ============================================================
// TIER LADDER
//   Rates: Bronze 6%, Silver 8%, Gold 10%, Platinum 12%
//   Specialist is always flat 10% — not tier-based.
// ============================================================
export const TIER_LADDER = [
  { tier: 'Unranked', min: 0,   max: 19,       rate: 0,  badge: 'bg-gray-500 text-white' },
  { tier: 'Bronze',   min: 20,  max: 49,       rate: 6,  badge: 'bg-amber-700 text-white' },
  { tier: 'Silver',   min: 50,  max: 79,       rate: 8,  badge: 'bg-slate-400 text-white' },
  { tier: 'Gold',     min: 80,  max: 99,       rate: 10, badge: 'bg-amber-500 text-white' },
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

// Booking specialist: always flat 10%
export function computeSpecialistCommission(totalAmount) {
  const total = Number(totalAmount) || 0
  if (total <= 0) return 0
  return Math.round(total * (SPECIALIST_FLAT_RATE / 100) * 100) / 100
}

// Affiliate: tier rate × total
export function computeAffiliateCommission(totalAmount, completedCount) {
  const total = Number(totalAmount) || 0
  if (total <= 0) return 0
  const info = getTierInfo(completedCount)
  if (info.rate <= 0) return 0
  return Math.round(total * (info.rate / 100) * 100) / 100
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

// Fetch counts for a whole list in parallel
export async function fetchAffiliateCounts(codes) {
  const map = {}
  await Promise.all(
    (codes || []).filter(Boolean).map(async (code) => {
      map[code] = await fetchAffiliateCompletedCount(code)
    })
  )
  return map
}

export async function fetchSpecialistCounts(codes) {
  const map = {}
  await Promise.all(
    (codes || []).filter(Boolean).map(async (code) => {
      map[code] = await fetchSpecialistCompletedCount(code)
    })
  )
  return map
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