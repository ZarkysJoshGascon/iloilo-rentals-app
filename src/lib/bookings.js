import { supabase } from './supabase'

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
    .single()
  if (error) throw error
  return data
}

export async function createBooking(payload) {
  const { data, error } = await supabase
    .from('bookings')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBooking(id, patch) {
  const { data, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBooking(id) {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)
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