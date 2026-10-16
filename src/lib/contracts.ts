// src/lib/contracts.ts
// ============================================================
// Contract status helpers. Single source of truth for what
// "active", "expiring", "expired" and "renewed" mean across the CRM.
//
// Lifecycle:
//   active  → expiring (within EXPIRING_SOON_DAYS) → expired
//   - While active or expiring, a contract can be EXTENDED: same contract,
//     later expiry date.
//   - Once expired it is "For renewal" until the owner agrees; RENEWING
//     creates the next contract (a new term) and the old one points to it
//     through superseded_by, which makes it "renewed".
// ============================================================

export const EXPIRING_SOON_DAYS = 60

export const CONTRACT_STATUS_TEXT = {
  active:     { label: 'Active',      className: 'text-emerald-600 dark:text-emerald-400' },
  expiring:   { label: 'Expiring',    className: 'text-amber-600 dark:text-amber-400' },
  expired:    { label: 'For renewal', className: 'text-red-600 dark:text-red-400' },
  renewed:    { label: 'Renewed',     className: 'text-foreground' },
  incomplete: { label: 'Incomplete',  className: 'text-foreground' },
  inactive:   { label: 'Inactive',    className: 'text-foreground' },
}

/**
 * Derive a contract's status from its renewal link and effective/expiry dates.
 * Always uses UTC midnight to avoid timezone drift.
 */
export function deriveContractStatus(contract) {
  if (!contract) return 'inactive'
  if (contract.superseded_by) return 'renewed'
  if (!contract.effective_date) return 'incomplete'

  const exp = contract.expiry_date
    ? new Date(`${contract.expiry_date}T00:00:00Z`)
    : null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  if (!exp) return 'active'
  if (exp < today) return 'expired'

  const daysLeft = Math.round((exp.getTime() - today.getTime()) / 86_400_000)
  return daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'active'
}

/** A running contract (not yet ended) can be extended. */
export function canExtendContract(contract) {
  const s = deriveContractStatus(contract)
  return (s === 'active' || s === 'expiring') && !!contract?.expiry_date
}

/** An ended contract that hasn't been renewed yet can be renewed. */
export function canRenewContract(contract) {
  return deriveContractStatus(contract) === 'expired'
}

// ── Date helpers for terms (ISO yyyy-mm-dd, UTC) ────────────
export function dayAfterISO(iso) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Last day of a term of `months` months that starts on `startIso`. */
export function termEndISO(startIso, months) {
  const d = new Date(`${startIso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Every term of the contract's chain of renewals, oldest first, e.g.
 * [first contract, its renewal, the renewal after that]. A contract that
 * was never renewed (and renews nothing) is a chain of one.
 */
export function contractTerms(contract, contracts) {
  if (!contract) return []
  const list = contracts || []
  const byId = new Map(list.map((c) => [c.id, c]))
  const previousOf = new Map()
  for (const c of list) if (c.superseded_by) previousOf.set(c.superseded_by, c)

  const seen = new Set([contract.id])
  let first = byId.get(contract.id) || contract
  while (previousOf.has(first.id) && !seen.has(previousOf.get(first.id).id)) {
    first = previousOf.get(first.id)
    seen.add(first.id)
  }

  const chain = [first]
  const inChain = new Set([first.id])
  let cur = first
  while (cur.superseded_by && byId.has(cur.superseded_by) && !inChain.has(cur.superseded_by)) {
    cur = byId.get(cur.superseded_by)
    chain.push(cur)
    inChain.add(cur.id)
  }
  return chain
}

/**
 * The contract a unit is on now: the one the unit points at, otherwise the
 * latest term that hasn't been renewed.
 */
export function currentContractForUnit(unit, contracts) {
  if (!unit) return null
  const own = (contracts || []).filter((c) => c.unit_id === unit.id)
  if (unit.current_contract_id) {
    const c = own.find((x) => x.id === unit.current_contract_id)
    if (c && !c.superseded_by) return c
  }
  return (
    own
      .filter((c) => !c.superseded_by)
      .sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))[0] ||
    own.sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))[0] ||
    null
  )
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
