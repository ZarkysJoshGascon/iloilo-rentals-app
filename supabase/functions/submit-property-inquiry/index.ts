// supabase/functions/submit-property-inquiry/index.ts
// Website endpoint for the List Property form. Needs a Google sign-in: the
// reply email is the account's verified one, not whatever the browser sends.
// Validates input server-side, rate-limits by IP and by account, then writes
// to property_inquiries via service role.
// Turnstile has been removed. Honeypot + rate-limiting remain.
//
// Deploy with --no-verify-jwt; the sign-in is checked here.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { signedInGoogleUser } from '../_shared/visitor.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[\d\s+()\-.]{0,40}$/
const HONEYPOT_FIELD = 'website_url'
const IMAGE_PATH_RE = /^\d{4}-\d{2}\/[a-z0-9]{4,40}\.(jpe?g|png|webp)$/

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

function sanitizeInt(input: unknown, min: number, max: number): number | null {
  if (input === '' || input == null) return null
  const n = Number.parseInt(String(input), 10)
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, min), max)
}

function sanitizeMoney(input: unknown, min: number, max: number): number | null {
  if (input === '' || input == null) return null
  const n = Number(input)
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, min), max)
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
// IP hashing (never store raw IPs)
// ------------------------------------------------------------
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + '|inquiry-salt-v1')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
const MAX_BODY_BYTES = 1_500_000  // 1.5 MB — plenty for a JSON form + image refs
// One Google account can send this many inquiries a day.
const MAX_PER_ACCOUNT_PER_DAY = 5

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  // ✅ FIX: reject oversized bodies before parsing JSON.
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: 'Request body too large' }, 413)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  })
  try {
    // ─── 0. Signed in with Google ─────────────────────────────
    const user = await signedInGoogleUser(req, supabase)
    if (!user) {
      return json({ error: 'Please sign in with Google to send your inquiry.' }, 401)
    }

    const p = await req.json().catch(() => ({}))

    // ─── 1. Honeypot check ────────────────────────────────────
    const honeypot = sanitizeText(p[HONEYPOT_FIELD], 200)
    if (honeypot) {
      console.log('Honeypot triggered — dropping submission')
      return json({ ok: true, id: 'ignored' })
    }

    // ─── 2. IP rate limiting ──────────────────────────────────
    const xForwardedFor = req.headers.get('x-forwarded-for') || ''
    const remoteIp = xForwardedFor.split(',')[0].trim() || null

    if (remoteIp) {
      const ipHash = await hashIp(remoteIp)
      const { data: allowed, error: limitError } = await supabase.rpc('check_inquiry_rate_limit', {
        p_ip_hash: ipHash,
        p_max: 5,
        p_window_minutes: 60,
      })
      // If the count can't be checked, refuse rather than let it through.
      if (limitError) {
        console.error('rate limit check failed:', limitError)
        return json({ error: 'Please try again in a moment.' }, 503)
      }
      if (allowed === false) {
        return json({
          error: 'Too many submissions. Please try again in an hour.',
        }, 429)
      }
    }

    // ─── 2b. Account rate limiting ────────────────────────────
    // Counted in the same table as the IPs, under a hash of the account id.
    const accountHash = await hashIp('account:' + user.id)
    {
      const { data: allowed, error: limitError } = await supabase.rpc('check_inquiry_rate_limit', {
        p_ip_hash: accountHash,
        p_max: MAX_PER_ACCOUNT_PER_DAY,
        p_window_minutes: 24 * 60,
      })
      if (limitError) {
        console.error('account rate limit check failed:', limitError)
        return json({ error: 'Please try again in a moment.' }, 503)
      }
      if (allowed === false) {
        return json({
          error: `You've sent ${MAX_PER_ACCOUNT_PER_DAY} inquiries today. Please try again tomorrow.`,
        }, 429)
      }
    }

    // ─── 3. Validate and sanitize every field ─────────────────
    const ownerName  = sanitizeText(p.owner_name, 120)
    // The reply goes to the signed-in Google account, never a typed address.
    const ownerEmail = sanitizeText(user.email, 254).toLowerCase()
    const ownerPhone = sanitizeText(p.owner_phone, 40)
    const message    = sanitizeText(p.message, 2000, true)

    if (!ownerName)                            return json({ error: 'Your name is required' }, 400)
    if (!ownerEmail)                           return json({ error: 'Email is required' }, 400)
    if (!EMAIL_RE.test(ownerEmail))            return json({ error: 'Please enter a valid email' }, 400)
    if (ownerPhone && !PHONE_RE.test(ownerPhone)) return json({ error: 'Invalid phone number' }, 400)
    if (message.length < 10)                   return json({ error: 'Message is too short' }, 400)

    const inquiryType = sanitizeChoice(p.inquiry_type, ['manage', 'sell', 'both']) || 'manage'
    const propertyType = sanitizeChoice(p.property_type, [
      'Studio', '1-Bedroom', '2-Bedroom', '3-Bedroom',
      'Executive Studio', 'Penthouse', 'Commercial', 'Other',
    ])
    const building   = sanitizeText(p.building, 120)
    const location   = sanitizeText(p.location, 200)
    const bedrooms   = sanitizeInt(p.bedrooms, 0, 20)
    const bathrooms  = sanitizeInt(p.bathrooms, 0, 20)
    const sqm        = sanitizeInt(p.square_meters, 0, 10000)
    const nightly    = sanitizeMoney(p.price_per_night, 0, 1_000_000)

    // ─── 4. Validate uploaded images ──────────────────────────
    const rawImages = Array.isArray(p.images) ? p.images : []
    if (rawImages.length > 5) return json({ error: 'Too many images' }, 400)

    const validImages: { path: string; url: string }[] = []
    for (const img of rawImages) {
      const url = typeof img?.url === 'string' ? img.url : ''
      const path = typeof img?.path === 'string' ? img.path : ''

      if (!url || !path) continue
      // The path is what the form uploaded (YYYY-MM/<random>.jpg) and the URL
      // must be exactly that file's link, so a stored path can't point at
      // anyone else's image.
      if (!IMAGE_PATH_RE.test(path) || url !== `${SUPABASE_URL}/storage/v1/object/public/property-inquiry-images/${path}`) {
        return json({ error: 'Image URL must be from our storage' }, 400)
      }

      const mime = await sniffMime(url)
      if (!mime) {
        return json({ error: 'One of your images is not a valid JPEG, PNG, or WebP' }, 400)
      }

      validImages.push({ path, url })
    }

    // ─── 5. Insert ─────────────────────────────────────────────
    const { data: inserted, error } = await supabase
      .from('property_inquiries')
      .insert({
        owner_name:      ownerName,
        owner_email:     ownerEmail,
        owner_phone:     ownerPhone || null,
        property_type:   propertyType,
        building:        building || null,
        location:        location || null,
        bedrooms,
        bathrooms,
        square_meters:   sqm,
        price_per_night: nightly,
        inquiry_type:    inquiryType,
        message,
        images:          validImages,
        user_agent:      sanitizeText(req.headers.get('user-agent'), 300) || null,
        submitted_by:    user.id,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Insert failed:', error)
      return json({ error: 'Failed to save your inquiry' }, 500)
    }

    // ─── 6. Log the IP and account hashes for rate limiting ───
    await supabase.from('inquiry_rate_limit').insert({ ip_hash: accountHash })
    if (remoteIp) {
      const ipHash = await hashIp(remoteIp)
      await supabase.from('inquiry_rate_limit').insert({ ip_hash: ipHash })
    }
    if (Math.random() < 0.01) {
      supabase.rpc('cleanup_inquiry_rate_limit').catch(() => {})
    }

    return json({ ok: true, id: inserted.id })

  } catch (err) {
    console.error('submit-property-inquiry error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}