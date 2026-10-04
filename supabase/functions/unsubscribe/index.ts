// supabase/functions/unsubscribe/index.ts
// Public endpoint. Validates the unsubscribe token against a matching
// email_logs row before writing to email_opt_outs.
//
// The token is generated per-recipient in send-promo-campaign and stored
// on the log row. Only requests that present the correct token for the
// given email can opt that email out.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOKEN_RE = /^[a-z0-9]{16,64}$/i

function sanitize(input: unknown, max: number): string {
  if (input == null) return ''
  return String(input)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max)
}

// Constant-time-ish comparison to avoid leaking via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  try {
    const body = await req.json().catch(() => ({}))
    const email = sanitize(body.email, 254).toLowerCase()
    const token = sanitize(body.token, 64)

    if (!email || !token) {
      return json({ error: 'Missing email or token' }, 400)
    }
    if (!EMAIL_RE.test(email)) {
      return json({ error: 'Invalid email address' }, 400)
    }
    if (!TOKEN_RE.test(token)) {
      return json({ error: 'Invalid token format' }, 400)
    }

    // Find the most recent log row for this email that carries the token.
    // We don't require it to be a specific campaign — any historical
    // email we sent to this address is a valid "you received this" proof.
    const { data: logRow, error: lookupErr } = await supabase
      .from('email_logs')
      .select('id, unsubscribe_token')
      .eq('guest_email', email)
      .eq('unsubscribe_token', token)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lookupErr) {
      console.error('unsubscribe lookup failed:', lookupErr)
      return json({ error: 'Lookup failed' }, 500)
    }

    if (!logRow) {
      // Don't reveal whether the email exists. Same message either way.
      return json({ error: 'This unsubscribe link is invalid or has expired.' }, 403)
    }

    // Final belt-and-suspenders check (in case DB collation surprises us).
    if (!safeEqual(logRow.unsubscribe_token || '', token)) {
      return json({ error: 'This unsubscribe link is invalid or has expired.' }, 403)
    }

    // Idempotent upsert. onConflict target is the unique email column.
    const { error: insertErr } = await supabase
      .from('email_opt_outs')
      .upsert(
        { email, reason: 'user_unsubscribe' },
        { onConflict: 'email', ignoreDuplicates: true },
      )

    if (insertErr && !insertErr.message.toLowerCase().includes('duplicate')) {
      console.error('opt-out insert failed:', insertErr)
      return json({ error: 'Failed to save your preference' }, 500)
    }

    return json({ ok: true })
  } catch (err) {
    console.error('unsubscribe error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}