// supabase/functions/messenger-webhook/index.ts
// Facebook calls this for every message to the Iloilo Rentals Page.
//
// It only acts for the team:
//   • someone opens their personal link (or types "connect CODE")  → connected
//   • a connected person writes anything                          → 24-hour window renewed
//       "Got it" → noted   "today" → today's list   "stop" → disconnected
//       "demo" → a made-up sample   "help" → the commands
// Anyone else who writes to the team Page (MESSENGER_PAGE_ID) is told what it
// is and can type "demo"; on any other Page they're left for the inbox.
//
// Public endpoint: deploy with --no-verify-jwt. Every POST must carry
// Facebook's signature (X-Hub-Signature-256, made with the app secret).
//
// Secrets: MESSENGER_PAGE_TOKEN, MESSENGER_APP_SECRET, MESSENGER_VERIFY_TOKEN
// (any long random string, also typed into the Meta app's webhook settings).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ACK_PAYLOAD, LINK_TTL_MS,
  buildMessage, demoMessage, helpMessage, introMessage, loadDay, loadPeople, manilaToday, sendText, welcomeMessage,
} from '../_shared/messenger.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
// Trimmed: a space pasted along with a secret would otherwise break the match.
const APP_SECRET            = (Deno.env.get('MESSENGER_APP_SECRET') || '').trim()
const VERIFY_TOKEN          = (Deno.env.get('MESSENGER_VERIFY_TOKEN') || '').trim()
const TEAM_PAGE_ID          = (Deno.env.get('MESSENGER_PAGE_ID') || '').trim()

// Personal links carry ref=team_<code>; the code can also be typed: "connect <code>".
const REF_RE = /^team_([A-Z2-9]{10})$/i
const TYPED_RE = /^connect\s+([A-Z2-9]{10})$/i

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function validSignature(raw: string, header: string | null) {
  if (!APP_SECRET || !header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
  return safeEqual(hex, header.slice(7).toLowerCase())
}

async function personFor(db: any, row: any) {
  const people = await loadPeople(db)
  return people.find((p) => p.role === row.role && p.staff_id === row.staff_id) || null
}

async function connect(db: any, psid: string, code: string) {
  const { data: row } = await db.from('messenger_contacts').select('*').eq('link_code', code).maybeSingle()
  const expired = !row?.link_created_at || Date.now() - Date.parse(row.link_created_at) > LINK_TTL_MS
  const person = row && !expired ? await personFor(db, row) : null
  if (!person) {
    // Usually someone opening their own link again, e.g. on their phone after
    // the computer. Messenger is the same account on both, so nothing to do.
    const now = new Date().toISOString()
    const { data: mine } = await db.from('messenger_contacts')
      .update({ last_message_at: now, updated_at: now })
      .eq('psid', psid)
      .select('id')
    await sendText(psid, mine?.length
      ? 'You\'re already connected, on this phone and anywhere else you use Messenger. Your update comes every day at 8am; type "today" for today\'s list.'
      : 'That link has expired or was already used. Ask an admin for a new one in the CRM (Team → Daily updates).')
    return
  }
  const now = new Date().toISOString()
  const { error } = await db.from('messenger_contacts').update({
    psid,
    link_code: null,
    connected_at: now,
    last_message_at: now,
    last_send_error: null,
    updated_at: now,
  }).eq('id', row.id)
  if (error) throw error
  await sendText(psid, welcomeMessage(person), { ack: true })
}

async function handleEvent(db: any, ev: any) {
  const psid = ev?.sender?.id
  if (!psid || ev.message?.is_echo) return
  if (!ev.message && !ev.postback && !ev.referral) return // reads, deliveries, reactions

  const text = String(ev.message?.text || '').trim()
  const ref = String(ev.postback?.referral?.ref ?? ev.referral?.ref ?? '')
  const code = REF_RE.exec(ref)?.[1] ?? TYPED_RE.exec(text)?.[1] ?? null
  // Shows in the function's logs (Supabase → Edge Functions → messenger-webhook
  // → Logs), so "nothing happened" can be told apart from "Facebook never sent it".
  console.log(JSON.stringify({
    event: ev.message ? 'message' : ev.postback ? 'postback' : 'referral',
    psid,
    team_code: !!code,
  }))
  if (code) {
    await connect(db, psid, code.toUpperCase())
    return
  }

  const word = text.toLowerCase()
  const { data: rows } = await db.from('messenger_contacts').select('*').eq('psid', psid)
  if (!rows?.length) {
    // The team Page has no guests, so anyone else who writes (Facebook's
    // reviewers included) is told what it is. On any other Page they're left
    // for the inbox.
    if (!TEAM_PAGE_ID || String(ev.recipient?.id || '') !== TEAM_PAGE_ID) return
    await sendText(psid, word === 'demo' ? demoMessage() : introMessage())
    return
  }

  const now = new Date().toISOString()
  const ack = ev.message?.quick_reply?.payload === ACK_PAYLOAD
  await db.from('messenger_contacts')
    .update({ last_message_at: now, ...(ack ? { last_ack_at: now } : {}), updated_at: now })
    .eq('psid', psid)

  if (ack) {
    await sendText(psid, 'Noted. Your next update comes tomorrow at 8am.')
    return
  }

  if (word === 'demo' || word === 'help') {
    await sendText(psid, word === 'demo' ? demoMessage() : helpMessage())
    return
  }

  if (word === 'today' || word === 'update') {
    const day = await loadDay(db, manilaToday())
    for (const row of rows) {
      const person = await personFor(db, row)
      if (person) await sendText(psid, buildMessage(day, person), { ack: true })
    }
    return
  }

  if (word === 'stop') {
    await db.from('messenger_contacts')
      .update({ psid: null, connected_at: null, last_message_at: null, last_ack_at: null, updated_at: now })
      .eq('psid', psid)
    await sendText(psid, "Done. You won't get daily updates anymore. Ask an admin for a new link if you want them back.")
  }
  // Anything else is a normal chat with whoever answers the Page inbox.
}

serve(async (req) => {
  const url = new URL(req.url)

  // Facebook's one-time check when the webhook is saved in the Meta app.
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe'
      && !!VERIFY_TOKEN
      && safeEqual(url.searchParams.get('hub.verify_token') || '', VERIFY_TOKEN)
    return ok
      ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 })
      : new Response('Forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const raw = await req.text()
  if (raw.length > 256_000) return new Response('Too large', { status: 413 })
  if (!(await validSignature(raw, req.headers.get('x-hub-signature-256')))) {
    return new Response('Bad signature', { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return new Response('Bad JSON', { status: 400 }) }
  if (body?.object !== 'page') return new Response('Ignored', { status: 200 })

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      try {
        await handleEvent(db, ev)
      } catch (err) {
        // Answer 200 anyway, or Facebook keeps resending the same event.
        console.error('messenger-webhook event failed:', err)
      }
    }
  }
  return new Response('EVENT_RECEIVED', { status: 200 })
})
