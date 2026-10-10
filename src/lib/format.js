// src/lib/format.js
// ============================================================
// Shared formatting helpers. Single source of truth for money,
// date, and number formatting across the entire application.
// ============================================================

const PHP_LOCALE = 'en-PH'

export function formatMoney(n, { decimals = 2 } = {}) {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return '₱0'
  return `₱${v.toLocaleString(PHP_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })}`
}

export function formatMoneyCompact(n) {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return '₱0'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `₱${Math.round(v / 1_000)}k`
  return `₱${Math.round(v)}`
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(PHP_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDateShort(iso) {
  if (!iso) return '—'
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(PHP_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(PHP_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgo(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const diffMs = Date.now() - then
  if (diffMs < 0) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

// ------------------------------------------------------------
// Date-only helpers (UTC-safe)
// ------------------------------------------------------------
export function todayISO() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

export function isoAddDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diffDaysISO(a, b) {
  const da = new Date(`${a}T00:00:00Z`)
  const db = new Date(`${b}T00:00:00Z`)
  return Math.round((db - da) / 86_400_000)
}