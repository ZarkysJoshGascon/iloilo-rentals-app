// src/lib/avatars.js
// ============================================================
// Shared avatar color + initials helpers.
// ============================================================

export const AVATAR_COLORS = [
  ['bg-blue-100',    'text-blue-700',    'dark:bg-blue-900/40',    'dark:text-blue-300'],
  ['bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-900/40', 'dark:text-emerald-300'],
  ['bg-orange-100',  'text-orange-700',  'dark:bg-orange-900/40',  'dark:text-orange-300'],
  ['bg-purple-100',  'text-purple-700',  'dark:bg-purple-900/40',  'dark:text-purple-300'],
  ['bg-rose-100',    'text-rose-700',    'dark:bg-rose-900/40',    'dark:text-rose-300'],
  ['bg-cyan-100',    'text-cyan-700',    'dark:bg-cyan-900/40',    'dark:text-cyan-300'],
  ['bg-amber-100',   'text-amber-700',   'dark:bg-amber-900/40',   'dark:text-amber-300'],
  ['bg-indigo-100',  'text-indigo-700',  'dark:bg-indigo-900/40',  'dark:text-indigo-300'],
]

export function initials(name) {
  if (!name) return '?'
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  )
}

export function avatarColor(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash = hash & hash
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}