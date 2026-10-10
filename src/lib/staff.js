// src/lib/staff.js
// ============================================================
// Shared staff-creation API for TeamPage.
//
//   • searchProfiles(query)  →  autocomplete source for the email combobox
//   • roleMeta                →  per-role prefix, table, label
//   • createStaffMember(...)  →  one canonical create path for all four roles
//   • validateStaffEmail(...) →  pre-flight check for the form
// ============================================================

import { supabase } from './supabase'

export const STAFF_ROLES = {
  specialists: {
    table: 'specialists',
    codePrefix: 'BS',
    label: 'Booking Specialist',
    labelShort: 'Specialist',
  },
  affiliates: {
    table: 'affiliates',
    codePrefix: 'AF',
    label: 'Affiliate',
    labelShort: 'Affiliate',
  },
  housekeepers: {
    table: 'housekeepers',
    codePrefix: 'HK',
    label: 'Housekeeper',
    labelShort: 'Housekeeper',
  },
  property_managers: {
    table: 'property_managers',
    codePrefix: 'PM',
    label: 'Property Manager',
    labelShort: 'PM',
  },
}

export function roleMeta(role) {
  return STAFF_ROLES[role] || null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─────────────────────────────────────────────────────────────
// searchProfiles
// ─────────────────────────────────────────────────────────────
export async function searchProfiles(query, { signal, limit = 10 } = {}) {
  const q = (query || '').trim()
  if (q.length < 2) return []
  try {
    const { data, error } = await supabase.rpc('search_profiles', {
      p_query: q,
      p_limit: limit,
    }, signal ? { signal } : undefined)
    if (error) throw error
    return (data || []).map((r) => ({
      id: r.id,
      email: r.email,
      full_name: r.full_name || '',
      avatar_url: r.avatar_url || null,
    }))
  } catch (err) {
    if (err?.name === 'AbortError') return []
    console.error('searchProfiles failed:', err)
    return []
  }
}

// ─────────────────────────────────────────────────────────────
// isEmailRegistered — does this email exist in profiles?
// ─────────────────────────────────────────────────────────────
export async function isEmailRegistered(email, { signal } = {}) {
  const e = (email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(e)) return { registered: false, profile: null }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .eq('email', e)
      .maybeSingle()
    if (signal?.aborted) return { registered: false, profile: null }
    if (error) throw error
    return { registered: !!data, profile: data || null }
  } catch (err) {
    if (err?.name === 'AbortError') return { registered: false, profile: null }
    console.error('isEmailRegistered failed:', err)
    return { registered: false, profile: null }
  }
}

// ─────────────────────────────────────────────────────────────
// isEmailAlreadyInRole — has this email already been assigned
// to the given role? (Different role = allowed.)
// ─────────────────────────────────────────────────────────────
export async function isEmailAlreadyInRole(role, email, excludeId = null, { signal } = {}) {
  const meta = roleMeta(role)
  if (!meta) return false
  const e = (email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(e)) return false
  try {
    let q = supabase
      .from(meta.table)
      .select('id, code, name')
      .ilike('email', e)
      .limit(1)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, error } = await q
    if (signal?.aborted) return false
    if (error) throw error
    return (data && data[0]) || null
  } catch (err) {
    if (err?.name === 'AbortError') return false
    console.error('isEmailAlreadyInRole failed:', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// validateStaffEmail — full pre-flight for the form
//   Returns { ok: true, profile } or { ok: false, reason, message }
// ─────────────────────────────────────────────────────────────
export async function validateStaffEmail(role, email, excludeId = null, { signal } = {}) {
  const e = (email || '').trim().toLowerCase()
  if (!e) return { ok: false, reason: 'empty', message: 'Email is required' }
  if (!EMAIL_RE.test(e)) return { ok: false, reason: 'invalid', message: 'Enter a valid email address' }

  const reg = await isEmailRegistered(e, { signal })
  if (signal?.aborted) return { ok: false, reason: 'aborted', message: 'Cancelled' }
  if (!reg.registered) {
    return {
      ok: false,
      reason: 'not_registered',
      message: 'No account found. Ask them to log in at Iloilo Rentals first, then come back.',
    }
  }

  const existing = await isEmailAlreadyInRole(role, e, excludeId, { signal })
  if (signal?.aborted) return { ok: false, reason: 'aborted', message: 'Cancelled' }
  if (existing) {
    const meta = roleMeta(role)
    return {
      ok: false,
      reason: 'duplicate_role',
      message: `This email is already a ${meta.label} (${existing.code}).`,
      conflict: existing,
    }
  }

  return { ok: true, profile: reg.profile }
}

// ─────────────────────────────────────────────────────────────
// createStaffMember
//   Client omits `code` — Postgres generates it via DEFAULT.
//   On unique-constraint violation for code, retry up to 3 times.
// ─────────────────────────────────────────────────────────────
export async function createStaffMember(role, payload) {
  const meta = roleMeta(role)
  if (!meta) throw new Error('Unknown role')

  const email = (payload.email || '').trim().toLowerCase()
  if (!email) throw new Error('Email is required')

  // NEVER send `code` — the DB default handles it.
  const body = {
    name: payload.name?.trim() || null,
    email,
    phone: payload.phone?.trim() || null,
    notes: payload.notes?.trim() || null,
    photo_url: payload.photo_url || null,
    status: payload.status || 'active',
  }

  // Retry on code collision (extremely rare; ~1 in 32^6 per attempt)
  const MAX_ATTEMPTS = 3
  let lastErr = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from(meta.table)
      .insert(body)
      .select('*')
      .single()
    if (!error) return data

    // If the failure was a code collision, retry. Otherwise bubble up.
    const msg = String(error.message || '')
    const isCodeCollision =
      error.code === '23505' &&
      (msg.includes('code') || msg.includes(meta.table))

    if (!isCodeCollision) throw error
    lastErr = error
    console.warn(`createStaffMember: code collision on attempt ${attempt}, retrying…`)
  }

  throw lastErr || new Error('Failed to create staff member')
}

// ─────────────────────────────────────────────────────────────
// updateStaffMember — NEVER sends code
// ─────────────────────────────────────────────────────────────
export async function updateStaffMember(role, id, payload) {
  const meta = roleMeta(role)
  if (!meta) throw new Error('Unknown role')

  const body = {}
  if (payload.name !== undefined)      body.name      = payload.name?.trim() || null
  if (payload.email !== undefined)     body.email     = (payload.email || '').trim().toLowerCase() || null
  if (payload.phone !== undefined)     body.phone     = payload.phone?.trim() || null
  if (payload.notes !== undefined)     body.notes     = payload.notes?.trim() || null
  if (payload.photo_url !== undefined) body.photo_url = payload.photo_url || null
  if (payload.status !== undefined)    body.status    = payload.status

  const { data, error } = await supabase
    .from(meta.table)
    .update(body)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ─────────────────────────────────────────────────────────────
// linkStaffOnLogin — call once per browser session per user
// ─────────────────────────────────────────────────────────────
export async function linkStaffOnLogin() {
  try {
    const { data, error } = await supabase.rpc('link_staff_on_login')
    if (error) throw error
    return data || null
  } catch (err) {
    console.error('linkStaffOnLogin failed:', err)
    return null
  }
}