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

// ============================================================
// PROMO CAMPAIGNS
// ============================================================

/**
 * Fetch past guests eligible to receive campaigns.
 * Rule: check_out < today, not soft-deleted, deduped by email.
 * Returns one row per unique guest (keeping the most recent booking).
 */
export async function listPastGuests() {
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, guest_name, guest_email, check_in, check_out,
      unit_id, units:unit_id ( id, unit_code, building )
    `)
    .lt('check_out', today)
    .is('deleted_at', null)
    .not('guest_email', 'is', null)
    .order('check_out', { ascending: false })
    .limit(2000)

  if (error) throw error

  // Dedupe by email — keep the most recent booking per guest
  const map = new Map()
  for (const b of data || []) {
    const email = (b.guest_email || '').trim().toLowerCase()
    if (!email) continue
    if (!map.has(email)) {
      map.set(email, {
        email,
        name: b.guest_name || '',
        last_check_out: b.check_out,
        last_unit: b.units?.unit_code || '',
        last_building: b.units?.building || '',
      })
    }
  }
  return [...map.values()]
}

/**
 * Fetch past guests filtered by how recently they stayed.
 * windowMonths: null = all time; a number = only guests whose
 * last stay was within that many months.
 */
export async function listPastGuestsFiltered(windowMonths = null) {
  const all = await listPastGuests()
  if (!windowMonths) return all

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - windowMonths)
  const cutoffISO = cutoff.toISOString().slice(0, 10)

  return all.filter((g) => (g.last_check_out || '') >= cutoffISO)
}

/**
 * Fetch the campaigns history (most recent first).
 */
export async function listCampaigns(limit = 50) {
  const { data, error } = await supabase
    .from('email_campaigns')
    .select('id, name, subject, recipient_count, sent_count, failed_count, status, created_at, sent_at, created_by_email')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/**
 * Send a test version of a promo email to the current admin.
 * The Edge Function detects the mode and sends only to your admin email.
 */
export async function sendPromoTest(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-promo-campaign`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...payload, mode: 'test' }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Test send failed (${res.status})`)
  return data
}

/**
 * Send a promo campaign to a list of recipients.
 * recipients: [{ email, name }]
 */
export async function sendPromoCampaign(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-promo-campaign`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...payload, mode: 'send' }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Send failed (${res.status})`)
  return data
}

/**
 * Upload a hero image for a campaign.
 * Images are auto-resized to 1200px wide (good for retina displays)
 * and stored in the 'email-assets' Supabase Storage bucket.
 */
export async function uploadCampaignImage(file) {
  if (!file) throw new Error('No file')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP images are allowed')
  }

  const resized = await resizeImage(file, 1200, 0.85)

  const rand = crypto.getRandomValues(new Uint8Array(8))
    .reduce((s, b) => s + b.toString(36).padStart(2, '0'), '')
    .slice(0, 12)
  const path = `campaigns/${new Date().toISOString().slice(0, 7)}/${rand}.jpg`

  const { error: upErr } = await supabase.storage
    .from('email-assets')
    .upload(path, resized, {
      cacheControl: '31536000',
      upsert: false,
      contentType: 'image/jpeg',
    })
  if (upErr) throw upErr

  const { data } = supabase.storage.from('email-assets').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

// Internal — resize an image on the client before uploading
async function resizeImage(file, maxW, quality) {
  const img = await new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('Failed to load image'))
    i.src = URL.createObjectURL(file)
  })
  const scale = Math.min(1, maxW / img.width)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  URL.revokeObjectURL(img.src)

  return new Promise((res, rej) => {
    canvas.toBlob(
      (blob) => (blob ? res(blob) : rej(new Error('Resize failed'))),
      'image/jpeg',
      quality,
    )
  })
}
