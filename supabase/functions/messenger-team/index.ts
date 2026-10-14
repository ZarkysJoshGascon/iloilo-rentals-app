// supabase/functions/messenger-team/index.ts
// The 8am team update on Messenger (see _shared/messenger.ts).
//
//   { mode: 'send' }                     the 8am job: message everyone connected
//   { mode: 'preview' }                  today's message for every person, nothing sent
//   { mode: 'list' }                     CRM: who can receive updates and their status
//   { mode: 'link', role, staff_id }     CRM: a personal m.me link for one person
//   { mode: 'email', role, staff_id }    CRM: email one person their link
//   { mode: 'email', staff: true }       CRM: email every booker and housekeeper not yet connected
//   { mode: 'disconnect', role, staff_id }
//
// The 8am job (messenger-daily-update) sends the service-role key; everyone
// else must be a CRM admin. Reading the key's role is only safe because
// Supabase checks its signature first: keep this function deployed WITH JWT
// verification (never --no-verify-jwt).
//
// Secrets: MESSENGER_PAGE_TOKEN (the Facebook Page's access token), and
// MESSENGER_PAGE_ID when the token can't read the Page's ID itself.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  type Person, type Role, LINK_TTL_MS, WINDOW_MS,
  buildMessage, linkUrl, loadDay, loadPeople, manilaToday, messengerConfigured, preparePage, sendText,
} from '../_shared/messenger.ts'
import { EMAIL_RE, emailConfigured, sendLinkEmail } from './linkEmail.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const ROLES = new Set(['admin', 'specialist', 'housekeeper'])
// No 0/O or 1/I, so a code typed by hand ("connect K7M2QX9D") is unambiguous.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function jwtRole(token: string) {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const pad = part + '='.repeat((4 - (part.length % 4)) % 4)
    return JSON.parse(atob(pad.replace(/-/g, '+').replace(/_/g, '/')))?.role ?? null
  } catch {
    return null
  }
}

const key = (role: string, id: string) => `${role}:${id}`

// A fresh one-time code for one person; their previous link stops working.
async function issueLink(db: any, role: string, staffId: string) {
  const code = newCode()
  const now = new Date().toISOString()
  const { error } = await db.from('messenger_contacts').upsert(
    { role, staff_id: staffId, link_code: code, link_created_at: now, updated_at: now },
    { onConflict: 'role,staff_id' },
  )
  if (error) throw error
  return { code, url: await linkUrl(code) }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing auth token' }, 401)

    const fromJob = jwtRole(token) === 'service_role'
    if (!fromJob) {
      const { data: { user } } = await db.auth.getUser(token)
      if (!user) return json({ error: 'Invalid session' }, 401)
      const { data: adminRow } = await db.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
      if (!adminRow) return json({ error: 'Not an admin' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const mode = String(body?.mode || '')
    if (fromJob && mode !== 'send' && mode !== 'preview') return json({ error: 'Not allowed' }, 403)

    const people = await loadPeople(db)
    const byKey = new Map(people.map((p) => [key(p.role, p.staff_id), p]))

    if (mode === 'preview') {
      const day = await loadDay(db, manilaToday())
      return json({
        date: day.date,
        messages: people.map((p) => ({ role: p.role, staff_id: p.staff_id, name: p.name, code: p.code, text: buildMessage(day, p) })),
      })
    }

    if (mode === 'send') {
      if (!messengerConfigured()) return json({ ok: true, skipped: 'Messenger is not set up yet' })
      const { data: contacts, error } = await db.from('messenger_contacts').select('*').not('psid', 'is', null)
      if (error) throw error
      const day = await loadDay(db, manilaToday())
      const result = { sent: 0, waiting: 0, failed: 0 }
      for (const c of contacts || []) {
        const person = byKey.get(key(c.role, c.staff_id))
        if (!person) continue // no longer active, or lost CRM access
        const now = new Date().toISOString()
        if (!c.last_message_at || Date.now() - Date.parse(c.last_message_at) > WINDOW_MS) {
          result.waiting++
          await db.from('messenger_contacts').update({
            last_send_error: 'Not sent: they have not written to the Page in the last 24 hours',
            updated_at: now,
          }).eq('id', c.id)
          continue
        }
        try {
          await sendText(c.psid, buildMessage(day, person), { type: 'UPDATE', ack: true })
          result.sent++
          await db.from('messenger_contacts').update({ last_sent_at: now, last_send_error: null, updated_at: now }).eq('id', c.id)
        } catch (err) {
          result.failed++
          await db.from('messenger_contacts').update({
            last_send_error: String((err as Error)?.message || err).slice(0, 300),
            updated_at: now,
          }).eq('id', c.id)
        }
      }
      return json({ ok: true, date: day.date, ...result })
    }

    if (mode === 'list') {
      const { data: contacts, error } = await db.from('messenger_contacts').select('*')
      if (error) throw error
      const byContact = new Map((contacts || []).map((c: any) => [key(c.role, c.staff_id), c]))
      return json({
        configured: messengerConfigured(),
        email_configured: emailConfigured(),
        people: people.map((p) => {
          const c: any = byContact.get(key(p.role, p.staff_id))
          const linkLive = !!c?.link_code && !!c.link_created_at && Date.now() - Date.parse(c.link_created_at) < LINK_TTL_MS
          return {
            ...p,
            connected: !!c?.psid,
            link_pending: !c?.psid && linkLive,
            link_code: linkLive ? c.link_code : null,
            connected_at: c?.connected_at ?? null,
            last_message_at: c?.last_message_at ?? null,
            last_ack_at: c?.last_ack_at ?? null,
            last_sent_at: c?.last_sent_at ?? null,
            last_send_error: c?.last_send_error ?? null,
          }
        }),
      })
    }

    if (mode === 'email') {
      if (!messengerConfigured()) return json({ error: 'Messenger is not set up yet. Add the Facebook Page token first.' }, 409)
      if (!emailConfigured()) return json({ error: 'Email sending is not set up (RESEND_API_KEY).' }, 409)
      const { data: contacts, error } = await db.from('messenger_contacts').select('role, staff_id, psid')
      if (error) throw error
      const connected = new Set((contacts || []).filter((c: any) => c.psid).map((c: any) => key(c.role, c.staff_id)))

      let targets: Person[]
      if (body?.staff === true) {
        // Admins aren't included: they can copy their own link in the CRM.
        targets = people.filter((p) => p.role !== 'admin' && !connected.has(key(p.role, p.staff_id)))
      } else {
        const one = byKey.get(key(String(body?.role || ''), String(body?.staff_id || '')))
        if (!one) return json({ error: 'That person is not active on the team' }, 404)
        if (connected.has(key(one.role, one.staff_id))) return json({ error: `${one.name} is already connected` }, 409)
        targets = [one]
      }

      await preparePage()
      const sent: string[] = []
      const skipped: { name: string; reason: string }[] = []
      for (const p of targets) {
        const email = (p.email || '').trim()
        if (!EMAIL_RE.test(email)) {
          skipped.push({ name: p.name, reason: 'no email on file' })
          continue
        }
        try {
          const { code, url } = await issueLink(db, p.role, p.staff_id)
          await sendLinkEmail({ ...p, email }, url, code)
          sent.push(p.name)
        } catch (err) {
          skipped.push({ name: p.name, reason: String((err as Error)?.message || err).slice(0, 200) })
        }
        // The email service accepts about two a second.
        if (targets.length > 1) await new Promise((r) => setTimeout(r, 600))
      }
      return json({ sent, skipped })
    }

    const role = String(body?.role || '') as Role
    const staffId = String(body?.staff_id || '')
    if (!ROLES.has(role) || !staffId) return json({ error: 'role and staff_id are required' }, 400)
    const person: Person | undefined = byKey.get(key(role, staffId))

    if (mode === 'link') {
      if (!person) return json({ error: 'That person is not active on the team' }, 404)
      if (!messengerConfigured()) return json({ error: 'Messenger is not set up yet. Add the Facebook Page token first.' }, 409)
      await preparePage()
      return json(await issueLink(db, role, staffId))
    }

    if (mode === 'disconnect') {
      const { error } = await db.from('messenger_contacts').delete().eq('role', role).eq('staff_id', staffId)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'Unknown mode' }, 400)
  } catch (err) {
    console.error('messenger-team failed:', err)
    return json({ error: String((err as Error)?.message || err) }, 500)
  }
})
