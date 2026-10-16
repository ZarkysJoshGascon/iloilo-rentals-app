// supabase/functions/submit-contact-message/index.ts
// Public endpoint for the Contact page. Like the inquiry forms: a honeypot
// field, a rate limit per IP (stored only as a hash), every field checked
// and cleaned here, then saved to contact_messages with the service role.
// Visitors can no longer write to that table directly.
//
// Deploy with --no-verify-jwt (visitors aren't signed in).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HONEYPOT_FIELD = 'website_url'
const MAX_BODY_BYTES = 20_000 // a name, an email and a message
const LIMITS = { name: 120, email: 254, message: 5000 }
const MIN_MESSAGE = 2

// Control characters out, spaces collapsed (newlines kept in the message), trimmed and capped.
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

// Never store raw IPs; a separate salt keeps these counts apart from the inquiry forms'.
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + '|contact-salt-v1')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Message is too long' }, 413)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'Message is too long' }, 413)
    let p: any = {}
    try { p = JSON.parse(raw) } catch { return json({ error: 'Invalid request' }, 400) }

    // Bots fill in the hidden field; tell them it worked and keep nothing.
    if (sanitizeText(p?.[HONEYPOT_FIELD], 200)) return json({ ok: true })

    const remoteIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
    const ipHash = remoteIp ? await hashIp(remoteIp) : null
    if (ipHash) {
      const { data: allowed } = await supabase.rpc('check_inquiry_rate_limit', {
        p_ip_hash: ipHash,
        p_max: 5,
        p_window_minutes: 60,
      })
      if (allowed === false) return json({ error: 'Too many messages. Please try again in an hour.' }, 429)
    }

    const name = sanitizeText(p?.name, LIMITS.name)
    const email = sanitizeText(p?.email, LIMITS.email).toLowerCase()
    const message = sanitizeText(p?.message, LIMITS.message, true)
    if (!name) return json({ error: 'Your name is required' }, 400)
    if (!email) return json({ error: 'Email is required' }, 400)
    if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email' }, 400)
    if (message.length < MIN_MESSAGE) return json({ error: 'Please write a message' }, 400)

    const { error } = await supabase.from('contact_messages').insert({ name, email, message })
    if (error) {
      console.error('contact insert failed:', error)
      return json({ error: 'Could not send your message' }, 500)
    }

    if (ipHash) {
      await supabase.from('inquiry_rate_limit').insert({ ip_hash: ipHash })
      if (Math.random() < 0.01) supabase.rpc('cleanup_inquiry_rate_limit').catch(() => {})
    }
    return json({ ok: true })
  } catch (err) {
    console.error('submit-contact-message error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
