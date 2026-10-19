// src/lib/api/email.ts
// ============================================================
// Client-side email helpers for the CRM.
// ============================================================

import { supabase } from '@/lib/supabase'

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
// Formatters
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
// Send booking confirmation
// ------------------------------------------------------------
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
// History
// ------------------------------------------------------------
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

  const map = new Map()
  for (const b of data || []) {
    const email = (b.guest_email || '').trim().toLowerCase()
    if (!email) continue
    if (!map.has(email)) {
      map.set(email, {
        email,
        name: b.guest_name || '',
        last_check_out: b.check_out,
        // A booking belongs to one unit; untyped selects read embeds as arrays.
        last_unit: (b.units as unknown as { unit_code?: string } | null)?.unit_code || '',
        last_building: (b.units as unknown as { building?: string } | null)?.building || '',
      })
    }
  }
  return [...map.values()]
}

export async function listPastGuestsFiltered(windowMonths = null) {
  const all = await listPastGuests()
  if (!windowMonths) return all

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - windowMonths)
  const cutoffISO = cutoff.toISOString().slice(0, 10)

  return all.filter((g) => (g.last_check_out || '') >= cutoffISO)
}

export async function listCampaigns(limit = 50) {
  const { data, error } = await supabase
    .from('email_campaigns')
    .select('id, name, subject, recipient_count, sent_count, failed_count, status, created_at, sent_at, created_by_email')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

// One endpoint, three modes: 'preview' returns the email's HTML, 'test' sends
// one copy to the signed-in admin, 'send' sends the campaign.
async function callPromoFunction(payload, mode, failLabel) {
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
      body: JSON.stringify({ ...payload, mode }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `${failLabel} (${res.status})`)
  return data
}

export function previewPromo(payload) {
  return callPromoFunction(payload, 'preview', 'Preview failed')
}

export function sendPromoTest(payload) {
  return callPromoFunction(payload, 'test', 'Test send failed')
}

export function sendPromoCampaign(payload) {
  return callPromoFunction(payload, 'send', 'Send failed')
}

// A sent campaign: the email as the first recipient got it, and every
// recipient with how their copy went.
export async function getCampaignDetails(campaignId) {
  const [campaign, logs] = await Promise.all([
    supabase.from('email_campaigns').select('id, body_html, reply_to').eq('id', campaignId).maybeSingle(),
    supabase.from('email_logs')
      .select('id, guest_name, guest_email, status, error_message, sent_at')
      .eq('campaign_id', campaignId)
      .order('guest_name', { ascending: true })
      .limit(600),
  ])
  if (campaign.error) throw campaign.error
  if (logs.error) throw logs.error
  return {
    html: campaign.data?.body_html || '',
    replyTo: campaign.data?.reply_to || null,
    recipients: logs.data || [],
  }
}

export async function uploadCampaignImage(file) {
  if (!file) throw new Error('No file')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP images are allowed')
  }

  // ✅ FIX #34 — Pass maxH so tall images don't blow up the email layout.
  const resized = await resizeImage(file, 1200, 0.85, 1800)

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

// ✅ FIX #34 — maxH is optional and caps both dimensions.
async function resizeImage(file, maxW, quality, maxH = null): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('Failed to load image'))
    i.src = URL.createObjectURL(file)
  })

  let scale = Math.min(1, maxW / img.width)
  if (maxH) scale = Math.min(scale, maxH / img.height)

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
// ------------------------------------------------------------
// Owner statements (send-contract-statement Edge Function)
// ------------------------------------------------------------
async function callStatementFunction(contractId, mode, extra = {}) {
  if (!contractId) throw new Error('Missing contract id')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contract-statement`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ contract_id: contractId, mode, ...extra }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 404 && !data?.error) throw new Error('The statement function is not deployed yet.')
    const err: Error & { code?: string | null; warnings?: string[] } = new Error(data?.error || `Request failed (${res.status})`)
    err.code = data?.code || null
    err.warnings = Array.isArray(data?.warnings) ? data.warnings : []
    throw err
  }
  return data
}

/** Builds the Excel statement and saves it in the browser, to check before sending. */
export async function downloadContractStatement(contractId) {
  const { filename, file, warnings } = await callStatementFunction(contractId, 'download')
  const bytes = Uint8Array.from(atob(file), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'statement.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { filename, warnings: warnings || [] }
}

/** Emails the Excel statement to the contract's owner (ended contracts only). */
export function sendContractStatement(contractId, { force = false } = {}) {
  return callStatementFunction(contractId, 'send', force ? { force: true } : {})
}

/** Past statement emails for a contract, newest first (empty if the table isn't there yet). */
export async function listContractStatements(contractId) {
  if (!contractId) return []
  const { data, error } = await supabase
    .from('contract_statements')
    .select('id, sent_to, status, sent_at, created_at, error_message, sent_by_email')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) {
    console.warn('Statement history unavailable:', error.message)
    return []
  }
  return data || []
}
