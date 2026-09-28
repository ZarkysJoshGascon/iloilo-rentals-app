// src/lib/bookings.js
import { supabase } from './supabase'

// Columns callers are allowed to write. Anything else is dropped.
const BOOKING_WRITABLE_COLUMNS = [
  'unit_id',
  'guest_name', 'guest_email', 'guest_contact', 'guests',
  'check_in', 'check_out',
  'total_amount',
  'booker_code', 'booker_name', 'booker_commission',
  'affiliate_code', 'affiliate_name', 'affiliate_commission',
  'affiliate_notes',
  'notes',
  'transactions',
  'completed_at',
  'deleted_at',
]

function pickWritable(patch) {
  const out = {}
  for (const k of BOOKING_WRITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) out[k] = patch[k]
  }
  return out
}

export async function listBookings() {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      units:unit_id (
        id, unit_code, building, unit_type,
        owners:owner_id ( name, email, phone )
      )
    `)
    .is('deleted_at', null)
    .order('check_in', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getBooking(id) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      units:unit_id (
        id, unit_code, building, unit_type,
        owners:owner_id ( name, email, phone )
      )
    `)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createBooking(payload) {
  const clean = pickWritable(payload)
  const { data, error } = await supabase
    .from('bookings')
    .insert(clean)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBooking(id, patch) {
  const clean = pickWritable(patch)
  if (Object.keys(clean).length === 0) {
    throw new Error('updateBooking: no writable fields in patch')
  }
  const { data, error } = await supabase
    .from('bookings')
    .update(clean)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Soft delete — preserves commission history and audit trail.
export async function deleteBooking(id) {
  const { error } = await supabase
    .from('bookings')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Admin-only hard delete — kept explicit so it can't be called accidentally.
export async function hardDeleteBooking(id) {
  const { error } = await supabase.from('bookings').delete().eq('id', id)
  if (error) throw error
}

export function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  const inDate = new Date(checkIn)
  const outDate = new Date(checkOut)
  return Math.max(0, Math.ceil((outDate - inDate) / 86400000))
}

export function sumTransactions(transactions) {
  if (!Array.isArray(transactions)) return 0
  return transactions.reduce((sum, t) => {
    const amt = Number(t?.amount)
    return sum + (Number.isFinite(amt) ? amt : 0)
  }, 0)
}