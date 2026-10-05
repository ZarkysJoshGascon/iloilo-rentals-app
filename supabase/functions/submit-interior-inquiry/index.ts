// supabase/functions/submit-interior-inquiry/index.ts
// Public endpoint for interior design inquiries.
// Validates, rate-limits by IP, writes via service role.
// Turnstile has been removed. Honeypot + rate-limiting remain.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[\d\s+()\-.]{0,40}$/
const HONEYPOT_FIELD = 'website_url'

// ------------------------------------------------------------
// Sanitizers
// ------------------------------------------------------------
function sanitizeText(input: unknown, max: number, allowNewlines = false): string {
  if (input == null) return ''
  let s = String(input)
  s = s.replace(
    allowNewlines
      ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
      : /[\u0000-\u001F\u007F]/g,
    '',
  )
  if (!allowNewlines) s = s.replace(/\s+/g, ' ')
  return s.trim().slice(0, max)
}

function sanitizeChoice(input: unknown, allowed: string[]): string | null {
  const s = String(input || '').trim()
  return allowed.includes(s) ? s : null
}

// ------------------------------------------------------------
// Magic byte sniffing
// ------------------------------------------------------------
async function sniffMime(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-11' } })
    if (!res.ok && res.status !== 206) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    const hex = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hex.startsWith('ffd8ff')) return 'image/jpeg'
    if (hex.startsWith('89504e470d0a1a0a')) return 'image/png'
    if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp'
    return null
  } catch (err) {
    console.error('sniffMime failed:', err)
    return null
  }
}

// ------------------------------------------------------------
// IP hashing
// ------------------------------------------------------------
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + '|interior-inquiry-salt-v1')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  try {
    const p = await req.json().catch(() => ({}))

    // Honeypot
    const honeypot = sanitizeText(p[HONEYPOT_FIELD], 200)
    if (honeypot) {
      console.log('Honeypot triggered')
      return json({ ok: true, id: 'ignored' })
    }

    // Rate limit
    const xForwardedFor = req.headers.get('x-forwarded-for') || ''
    const remoteIp = xForwardedFor.split(',')[0].trim() || null

    if (remoteIp) {
      const ipHash = await hashIp(remoteIp)
      const { data: allowed } = await supabase.rpc('check_inquiry_rate_limit', {
        p_ip_hash: ipHash,
        p_max: 5,
        p_window_minutes: 60,
      })
      if (allowed === false) {
        return json({ error: 'Too many submissions. Please try again in an hour.' }, 429)
      }
    }

    // Validate fields
    const clientName    = sanitizeText(p.client_name, 120)
    const clientEmail   = sanitizeText(p.client_email, 254).toLowerCase()
    const clientPhone   = sanitizeText(p.client_phone, 40)
    const propertyAddress = sanitizeText(p.property_address, 300)
    const message       = sanitizeText(p.message, 2000, true)

    if (!clientName)                 return json({ error: 'Your name is required' }, 400)
    if (!clientEmail)                return json({ error: 'Email is required' }, 400)
    if (!EMAIL_RE.test(clientEmail)) return json({ error: 'Please enter a valid email' }, 400)
    if (clientPhone && !PHONE_RE.test(clientPhone)) return json({ error: 'Invalid phone number' }, 400)
    if (message.length < 10)         return json({ error: 'Message is too short' }, 400)

    const propertyType = sanitizeChoice(p.property_type, [
      'Condo', 'House', 'Apartment', 'Office', 'Commercial', 'Other',
    ])
    const serviceType = sanitizeChoice(p.service_type, [
      'full_design', 'consultation', 'renovation', 'furnishing', 'not_sure',
    ])
    const roomScope = sanitizeChoice(p.room_scope, [
      'studio', '1br', '2br', '3br_plus', 'whole_house', 'multiple_rooms',
    ])
    const budgetRange = sanitizeChoice(p.budget_range, [
      'under_50k', '50k_150k', '150k_300k', '300k_500k', 'over_500k', 'not_sure',
    ])
    const timeline = sanitizeChoice(p.timeline, [
      'asap', '1_3_months', '3_6_months', 'exploring',
    ])

    // Images
    const rawImages = Array.isArray(p.images) ? p.images : []
    if (rawImages.length > 5) return json({ error: 'Too many images' }, 400)

    const validImages: { path: string; url: string }[] = []
    for (const img of rawImages) {
      const url = typeof img?.url === 'string' ? img.url : ''
      const path = typeof img?.path === 'string' ? img.path : ''
      if (!url || !path) continue
      if (!url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/interior-design-images/`)) {
        return json({ error: 'Image URL must be from our storage' }, 400)
      }
      const mime = await sniffMime(url)
      if (!mime) return json({ error: 'One of your images is not a valid JPEG, PNG, or WebP' }, 400)
      validImages.push({ path, url })
    }

    // Insert
    const { data: inserted, error } = await supabase
      .from('interior_design_inquiries')
      .insert({
        client_name:      clientName,
        client_email:     clientEmail,
        client_phone:     clientPhone || null,
        property_type:    propertyType,
        property_address: propertyAddress || null,
        service_type:     serviceType,
        room_scope:       roomScope,
        budget_range:     budgetRange,
        timeline,
        message,
        images:           validImages,
        user_agent:       sanitizeText(req.headers.get('user-agent'), 300) || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Insert failed:', error)
      return json({ error: 'Failed to save your inquiry' }, 500)
    }

    // Log IP hash
    if (remoteIp) {
      const ipHash = await hashIp(remoteIp)
      await supabase.from('inquiry_rate_limit').insert({ ip_hash: ipHash })
      if (Math.random() < 0.01) {
        supabase.rpc('cleanup_inquiry_rate_limit').catch(() => {})
      }
    }

    return json({ ok: true, id: inserted.id })

  } catch (err) {
    console.error('submit-interior-inquiry error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}