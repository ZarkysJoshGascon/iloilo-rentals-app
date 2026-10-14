// supabase/functions/_shared/messenger.ts
// The 8am team update on Messenger: what each person's message says, and
// how it reaches them. Used by messenger-team (the 8am job and the CRM)
// and messenger-webhook (replies such as "today").
//
// Facebook's rules: a Page may only message someone within 24 hours of
// their last message to it, so each update ends with a "Got it" button.

const GRAPH = 'https://graph.facebook.com/v23.0'
const PAGE_TOKEN = (Deno.env.get('MESSENGER_PAGE_TOKEN') || '').trim()
const PAGE_ID = (Deno.env.get('MESSENGER_PAGE_ID') || '').trim()

// Messenger cuts text messages at 2,000 characters.
const MAX_TEXT = 1900
export const WINDOW_MS = 24 * 60 * 60 * 1000
export const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const ACK_PAYLOAD = 'ACK'

export type Role = 'admin' | 'specialist' | 'housekeeper'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'CRM admin',
  specialist: 'booking specialist',
  housekeeper: 'housekeeper',
}

export type Person = {
  role: Role
  staff_id: string
  name: string
  code: string | null
  email: string | null
}

export function messengerConfigured() {
  return !!PAGE_TOKEN
}

// ── Facebook ─────────────────────────────────────────────────
async function graph(path: string, init: RequestInit = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(PAGE_TOKEN)}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Facebook returned ${res.status}`)
  }
  return data
}

// RESPONSE answers something they just sent; UPDATE is the 8am message.
export async function sendText(
  psid: string,
  text: string,
  { type = 'RESPONSE', ack = false }: { type?: 'RESPONSE' | 'UPDATE'; ack?: boolean } = {},
) {
  const parts = splitText(text)
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1
    await graph('/me/messages', {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: type,
        message: {
          text: parts[i],
          ...(ack && last
            ? { quick_replies: [{ content_type: 'text', title: 'Got it', payload: ACK_PAYLOAD }] }
            : {}),
        },
      }),
    })
  }
}

// A personal link opens a chat with the Page and passes the code to
// messenger-webhook. That needs the Page subscribed to the webhook and its
// Get Started button on, so preparePage (re)does both before links go out.
export async function preparePage() {
  await step('subscribe the Page to messages', () =>
    graph('/me/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_referrals', { method: 'POST' }))
  await step('turn on the Get Started button', () =>
    graph('/me/messenger_profile', {
      method: 'POST',
      body: JSON.stringify({ get_started: { payload: 'GET_STARTED' } }),
    }))
}

export async function linkUrl(code: string) {
  return `https://m.me/${await pageId()}?ref=team_${code}`
}

async function step(what: string, run: () => Promise<unknown>) {
  try {
    await run()
  } catch (err) {
    throw new Error(`Couldn't ${what}: ${(err as Error)?.message || err}`)
  }
}

// m.me links work with the Page's numeric ID. Reading it from Facebook can
// need the pages_read_engagement permission, so the MESSENGER_PAGE_ID
// secret, when set, saves asking.
async function pageId() {
  if (PAGE_ID) return PAGE_ID
  try {
    const me = await graph('/me?fields=id')
    if (me?.id) return String(me.id)
  } catch { /* fall through to the message below */ }
  throw new Error(
    "Facebook won't share the Page's ID with this token. Add it in Supabase as the MESSENGER_PAGE_ID secret " +
    "(the Meta app's Messenger API Settings shows it under the Page's name).",
  )
}

// Long days go out as several messages, split between entries.
export function splitText(text: string, max = MAX_TEXT): string[] {
  if (text.length <= max) return [text]
  const blocks: string[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('  ') && blocks.length) blocks[blocks.length - 1] += '\n' + line
    else blocks.push(line)
  }
  const parts: string[] = []
  let cur = ''
  for (const block of blocks) {
    const next = cur ? `${cur}\n${block}` : block
    if (next.length > max && cur) {
      parts.push(cur.trim())
      cur = block.slice(0, max)
    } else {
      cur = next.slice(0, max)
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

// ── Who can receive updates ──────────────────────────────────
// Active booking specialists and housekeepers, and everyone with CRM access.
export async function loadPeople(db: any): Promise<Person[]> {
  const [s, h, a] = await Promise.all([
    db.from('specialists').select('id, code, name, email, status').order('name'),
    db.from('housekeepers').select('id, code, name, email, status').order('name'),
    db.from('admin_users').select('user_id'),
  ])
  if (s.error) throw s.error
  if (h.error) throw h.error
  if (a.error) throw a.error

  const adminIds = (a.data || []).map((r: any) => r.user_id)
  let profiles: any[] = []
  if (adminIds.length) {
    const p = await db.from('profiles').select('id, email, full_name').in('id', adminIds)
    if (p.error) throw p.error
    profiles = p.data || []
  }

  const active = (r: any) => !r.status || r.status === 'active'
  return [
    ...profiles
      .map((p: any) => ({ role: 'admin' as Role, staff_id: p.id, name: p.full_name || p.email || 'Admin', code: null, email: p.email || null }))
      .sort((x, y) => x.name.localeCompare(y.name)),
    ...(s.data || []).filter(active)
      .map((r: any) => ({ role: 'specialist' as Role, staff_id: r.id, name: r.name || r.code, code: r.code, email: r.email || null })),
    ...(h.data || []).filter(active)
      .map((r: any) => ({ role: 'housekeeper' as Role, staff_id: r.id, name: r.name || r.code, code: r.code, email: r.email || null })),
  ]
}

// ── What happens today ───────────────────────────────────────
// Manila is UTC+8 all year.
export function manilaToday(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function loadDay(db: any, date: string) {
  const [b, c] = await Promise.all([
    db.from('bookings')
      .select('id, guest_name, guest_contact, guests, check_in, check_out, balance, booker_code, booker_name, unit_id, units:unit_id ( unit_code, building )')
      .is('deleted_at', null)
      .is('cancelled_at', null)
      .or(`check_in.eq.${date},check_out.eq.${date}`)
      .order('check_in'),
    db.from('cleanings')
      .select('id, type, status, notes, housekeeper_id, unit_id, units:unit_id ( unit_code, building ), housekeepers:housekeeper_id ( code, name )')
      .eq('scheduled_date', date)
      .neq('status', 'cancelled'),
  ])
  if (b.error) throw b.error
  if (c.error) throw c.error
  const bookings = b.data || []
  const cleanings = (c.data || []).sort((x: any, y: any) => unitLabel(x.units).localeCompare(unitLabel(y.units)))
  return {
    date,
    checkIns: bookings.filter((x: any) => x.check_in === date),
    checkOuts: bookings.filter((x: any) => x.check_out === date),
    cleanings,
  }
}

export type Day = Awaited<ReturnType<typeof loadDay>>

// ── The message ──────────────────────────────────────────────
function unitLabel(u: any) {
  if (!u?.unit_code) return 'Unit not set'
  const b = (u.building || '').trim()
  return b && !u.unit_code.toLowerCase().includes(b.toLowerCase()) ? `${u.unit_code} (${b})` : u.unit_code
}

function dayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function peso(n: number) {
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
}

function nights(a: string, b: string) {
  const n = Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
  return `${n} night${n === 1 ? '' : 's'}`
}

function guestsLabel(n: number | null) {
  return n ? `${n} guest${n === 1 ? '' : 's'}` : ''
}

function bookerLabel(b: any) {
  const who = b.booker_name || b.booker_code
  return who ? `Booked by ${who}` : 'No booker set'
}

function balanceLabel(b: any) {
  const due = Number(b.balance)
  return Number.isFinite(due) && due > 0 ? `${peso(due)} balance` : 'Paid'
}

export function firstName(name: string) {
  return (name || '').trim().split(/\s+/)[0] || 'team'
}

const lines = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' · ')

const FOOTER = 'Tap "Got it" so tomorrow\'s update reaches you.'

export function buildMessage(day: Day, person: Person) {
  const when = dayLabel(day.date)
  const hi = `Good morning, ${firstName(person.name)}!`
  const cleaningUnits = new Set(day.cleanings.map((c: any) => c.unit_id))

  if (person.role === 'specialist') {
    const mine = (b: any) => (b.booker_code || '').trim().toUpperCase() === (person.code || '').trim().toUpperCase()
    const ins = day.checkIns.filter(mine)
    const outs = day.checkOuts.filter(mine)
    if (!ins.length && !outs.length) {
      return `${hi} None of your guests check in or out today, ${when}.\n\n${FOOTER}`
    }
    const out = [`${hi} Your guests today, ${when}.`]
    if (ins.length) {
      out.push('', `CHECKING IN (${ins.length})`)
      for (const b of ins) {
        out.push(`• ${lines(b.guest_name || 'Guest', b.guest_contact)}`)
        out.push(`  ${lines(unitLabel(b.units), guestsLabel(b.guests), `out ${dayLabel(b.check_out)}`)}`)
        out.push(`  ${Number(b.balance) > 0 ? `${peso(Number(b.balance))} balance to collect` : 'Paid in full'}`)
      }
    }
    if (outs.length) {
      out.push('', `CHECKING OUT (${outs.length})`)
      for (const b of outs) {
        out.push(`• ${lines(b.guest_name || 'Guest', b.guest_contact)}`)
        out.push(`  ${lines(unitLabel(b.units), Number(b.balance) > 0 && `${peso(Number(b.balance))} still unpaid`)}`)
      }
    }
    out.push('', FOOTER)
    return out.join('\n')
  }

  if (person.role === 'housekeeper') {
    const mine = day.cleanings.filter((c: any) => c.housekeeper_id === person.staff_id)
    if (!mine.length) {
      return `${hi} No cleanings are assigned to you today, ${when}.\n\n${FOOTER}`
    }
    const out = [`${hi} Your cleanings today, ${when}.`, '']
    for (const c of mine) {
      const leaving = day.checkOuts.some((b: any) => b.unit_id === c.unit_id)
      const arriving = day.checkIns.some((b: any) => b.unit_id === c.unit_id)
      out.push(`• ${lines(unitLabel(c.units), cap(c.type) + ' clean')}`)
      const when2 = lines(leaving && 'Guest checks out today', arriving && 'Next guest arrives today')
      if (when2) out.push(`  ${when2}`)
      if (c.notes?.trim()) out.push(`  Note: ${c.notes.trim().replace(/\s+/g, ' ').slice(0, 200)}`)
    }
    out.push('', FOOTER)
    return out.join('\n')
  }

  // Admins: everything.
  const out = [`${hi} Here's today, ${when}.`, '']
  out.push(`CHECK-INS (${day.checkIns.length})`)
  if (!day.checkIns.length) out.push('None')
  for (const b of day.checkIns) {
    out.push(`• ${lines(b.guest_name || 'Guest', unitLabel(b.units))}`)
    out.push(`  ${lines(guestsLabel(b.guests), `${nights(b.check_in, b.check_out)}, out ${dayLabel(b.check_out)}`)}`)
    out.push(`  ${lines(bookerLabel(b), balanceLabel(b))}`)
  }
  out.push('', `CHECK-OUTS (${day.checkOuts.length})`)
  if (!day.checkOuts.length) out.push('None')
  for (const b of day.checkOuts) {
    out.push(`• ${lines(b.guest_name || 'Guest', unitLabel(b.units))}`)
    out.push(`  ${lines(bookerLabel(b), Number(b.balance) > 0 && `${peso(Number(b.balance))} unpaid`, !cleaningUnits.has(b.unit_id) && 'No cleaning scheduled')}`)
  }
  out.push('', `CLEANINGS (${day.cleanings.length})`)
  if (!day.cleanings.length) out.push('None')
  for (const c of day.cleanings) {
    out.push(`• ${lines(unitLabel(c.units), `${cap(c.type)} clean`, c.housekeepers?.name || 'NOT ASSIGNED')}`)
  }
  out.push('', FOOTER)
  return out.join('\n')
}

function cap(s: string | null) {
  return s ? s[0].toUpperCase() + s.slice(1) : 'Cleaning'
}

// What their 8am message covers, for the welcome message and the email.
export function roleSummary(role: Role) {
  return role === 'specialist'
    ? 'the check-ins and check-outs of guests you booked'
    : role === 'housekeeper'
      ? 'the cleanings assigned to you'
      : "all of the day's check-ins, check-outs and cleanings"
}

export function welcomeMessage(person: Person) {
  return [
    `Hi ${firstName(person.name)}! You're connected to Iloilo Rentals daily updates as a ${ROLE_LABEL[person.role]}.`,
    '',
    `Every day at 8am you'll get ${roleSummary(person.role)}.`,
    '',
    'Tap "Got it" on each update. Facebook only lets us message you within 24 hours of your last reply, so if you skip a day the next update won\'t arrive until you write to us again.',
    '',
    'Type "today" anytime for today\'s list, or "stop" to stop the updates.',
  ].join('\n')
}

// For people who message the team Page without being connected, including
// Facebook's app reviewers.
export function introMessage() {
  return [
    "Hi! This is the Iloilo Rentals team Page. Every morning at 8am it sends our booking specialists, housekeepers and admins their list for the day: check-ins, check-outs and cleanings.",
    '',
    'On the team? Open the link your admin sent you, or type the code from it, like: connect ABCD234XYZ',
    '',
    'Type "demo" to see a sample update.',
  ].join('\n')
}

export function helpMessage() {
  return 'Type "today" for today\'s list, "demo" for a sample update, or "stop" to stop the updates.'
}

// A made-up day in the admin layout.
export function demoMessage() {
  const date = manilaToday()
  const plus = (n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
  const s1 = { unit_code: 'S1 408', building: 'Avida Storeys 1' }
  const t1 = { unit_code: 'T1 1524', building: 'Avida Tower 1' }
  const day = {
    date,
    checkIns: [
      { guest_name: 'Maria Santos', guest_contact: '0917 000 0000', guests: 2, check_in: date, check_out: plus(2), balance: 2500, booker_name: 'Ana', unit_id: 's1', units: s1 },
    ],
    checkOuts: [
      { guest_name: 'John Reyes', guests: 3, check_in: plus(-3), check_out: date, balance: 0, booker_name: 'Leo', unit_id: 't1', units: t1 },
    ],
    cleanings: [
      { type: 'basic', unit_id: 't1', units: t1, housekeepers: { name: 'Rosa' } },
      { type: 'deep', unit_id: 's1', units: s1, housekeepers: null },
    ],
  } as unknown as Day
  const sample = buildMessage(day, { role: 'admin', staff_id: 'demo', name: 'team', code: null, email: null })
    .replace(FOOTER, 'Team members get a list like this every day at 8am, each with only their own part.')
  return `Here's a sample update with made-up names:\n\n${sample}`
}
