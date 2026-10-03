// src/lib/email.js
// ============================================================
// Client-side email helpers for the CRM.
//
// Everything email-related that lives in the browser is here:
//   · the booking-confirmation "shape" (subject pattern, times,
//     disclaimer) so the modal preview matches what the server sends
//   · formatters (date, money, nights)
//   · the send function that calls the Edge Function
//   · the history fetcher for the modal's History tab
//
// The actual HTML template lives in the Edge Function source
// (supabase/functions/send-booking-confirmation/index.ts).
// That's the source of truth — this file only mirrors the strings
// the modal needs to render the preview.
// ============================================================

import { supabase } from './supabase'

// ------------------------------------------------------------
// Constants — keep in sync with the Edge Function
// ------------------------------------------------------------
export const BOOKING_CONFIRMATION = {
  key: 'booking_confirmation',
  name: 'Booking Confirmation',
  subjectPrefix: 'Your booking is confirmed —',
  checkInTime:   '3:00 PM',
  checkOutTime:  '11:00 AM',
  signoff1:      'Warm regards,',
  signoff2:      'Iloilo Rentals',
  disclaimer:    'This email confirms your reservation and is not an official receipt.',
}

// ------------------------------------------------------------
// Formatters — identical logic to the server so preview === reality
// ------------------------------------------------------------
export function formatDateLong(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export function formatMoney(n) {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn + 'T00:00:00Z').getTime()
  const b = new Date(checkOut + 'T00:00:00Z').getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

// ------------------------------------------------------------
// Send — the only way to send a booking confirmation
// ------------------------------------------------------------
/**
 * Ask the Edge Function to render + send the booking confirmation
 * for a specific booking. The client sends ONLY the booking_id.
 * Everything else (subject, body, amounts) is built server-side,
 * so nothing can be tampered with from the browser.
 */
export async function sendBookingConfirmation(bookingId) {
  if (!bookingId) throw new Error('Missing booking id')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-booking-confirmation`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ booking_id: bookingId }),
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Send failed (${res.status})`)
  return data
}

// ------------------------------------------------------------
// History — for the modal's History tab
// ------------------------------------------------------------
/**
 * Recent booking-confirmation emails for a specific booking.
 * Filters to template_key = 'booking_confirmation' so the modal
 * doesn't show unrelated emails (e.g. future promo blasts).
 */
export async function listBookingConfirmations(bookingId) {
  if (!bookingId) return []
  const { data, error } = await supabase
    .from('email_logs')
    .select('id, subject, guest_email, status, sent_at, created_at, sent_by_email, error_message')
    .eq('booking_id', bookingId)
    .eq('template_key', BOOKING_CONFIRMATION.key)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

/**
 * All emails for a booking (any template). Useful if you later
 * add other per-booking emails and want one unified history view.
 */
export async function listAllEmailsForBooking(bookingId) {
  if (!bookingId) return []
  const { data, error } = await supabase
    .from('email_logs')
    .select('id, subject, guest_email, status, sent_at, created_at, sent_by_email, error_message, template_key')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}