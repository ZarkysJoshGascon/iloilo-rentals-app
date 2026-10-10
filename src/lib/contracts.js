// src/lib/contracts.js
// ============================================================
// Contract status helpers. Single source of truth for what
// "active", "expiring", "expired" mean across the CRM.
// ============================================================

export const EXPIRING_SOON_DAYS = 60

export const CONTRACT_STATUS_TEXT = {
  active:     { label: 'Active',     className: 'text-emerald-600 dark:text-emerald-400' },
  expiring:   { label: 'Expiring',   className: 'text-amber-600 dark:text-amber-400' },
  expired:    { label: 'Expired',    className: 'text-red-600 dark:text-red-400' },
  incomplete: { label: 'Incomplete', className: 'text-gray-500 dark:text-gray-400' },
  inactive:   { label: 'Inactive',   className: 'text-gray-500 dark:text-gray-400' },
}

/**
 * Derive a contract's status from its effective/expiry dates.
 * Always uses UTC midnight to avoid timezone drift.
 */
export function deriveContractStatus(contract) {
  if (!contract) return 'inactive'
  if (!contract.effective_date) return 'incomplete'

  const exp = contract.expiry_date
    ? new Date(`${contract.expiry_date}T00:00:00Z`)
    : null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  if (!exp) return 'active'
  if (exp < today) return 'expired'

  const daysLeft = Math.round((exp - today) / 86_400_000)
  return daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'active'
}

/**
 * Find the contract that governs a booking at a given check-in date.
 * Picks the most recent effective_date if multiple candidates overlap.
 */
export function findContractForBooking(booking, contracts) {
  if (!booking?.unit_id || !booking?.check_in) return null
  const candidates = (contracts || []).filter(
    (c) =>
      c.unit_id === booking.unit_id &&
      c.effective_date &&
      c.effective_date <= booking.check_in &&
      (!c.expiry_date || c.expiry_date >= booking.check_in),
  )
  if (candidates.length === 0) return null
  return candidates.sort((a, b) =>
    (b.effective_date || '').localeCompare(a.effective_date || ''),
  )[0]
}

/**
 * Find the currently-active contract for a unit.
 */
export function findGoverningContract(unit, contracts) {
  if (!unit) return null
  const todayStr = new Date().toISOString().slice(0, 10)
  const isActive = (c) => {
    if (!c?.effective_date) return false
    if (c.effective_date > todayStr) return false
    if (c.expiry_date && c.expiry_date < todayStr) return false
    return true
  }
  if (unit.current_contract_id) {
    const c = contracts.find((x) => x.id === unit.current_contract_id)
    if (c && isActive(c)) return c
  }
  return (
    contracts
      .filter((x) => x.unit_id === unit.id && isActive(x))
      .sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))[0] || null
  )
}