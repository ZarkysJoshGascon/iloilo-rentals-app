// src/components/admin/team/MessengerUpdatesPanel.tsx
// People → Team → Daily updates: the 8am Messenger update. Each person gets
// a personal link; opening it connects their Messenger to the Facebook Page
// (messenger-webhook), and from then on they get their own list every
// morning (messenger-team, mode "send"). Facebook only lets the Page message
// someone within 24 hours of their last message, so a person who skips the
// "Got it" button shows as Paused until they write to the Page again.
import { Fragment, useCallback, useEffect, useState } from 'react'
import { Copy, Eye, Loader2, Mail, MessageCircle, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Panel, PanelHeader, SectionLabel, InitialsAvatar } from '@/components/admin/_shared/Panel'

const DAY_MS = 24 * 60 * 60 * 1000

const GROUPS = [
  { role: 'admin', title: 'CRM admins · everything' },
  { role: 'specialist', title: 'Booking specialists · their guests' },
  { role: 'housekeeper', title: 'Housekeepers · their cleanings' },
]

async function callMessenger(body) {
  const { data, error } = await supabase.functions.invoke('messenger-team', { body })
  if (error) {
    let message = error.message
    try { message = (await error.context?.json())?.error || message } catch { /* keep the generic one */ }
    throw new Error(message)
  }
  return data
}

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function statusOf(p) {
  if (p.connected) {
    const fresh = p.last_message_at && Date.now() - new Date(p.last_message_at).getTime() < DAY_MS
    if (!fresh) {
      return {
        label: 'Paused',
        tone: 'text-amber-600 dark:text-amber-400',
        sub: 'No reply in 24 hours. Updates resume when they write to the Page',
      }
    }
    return {
      label: 'Connected',
      tone: 'text-emerald-600 dark:text-emerald-400',
      sub: p.last_ack_at ? `Tapped Got it ${when(p.last_ack_at)}` : `Connected ${when(p.connected_at)}`,
    }
  }
  if (p.link_pending) {
    return { label: 'Link sent', tone: 'text-amber-600 dark:text-amber-400', sub: 'Waiting for them to open it' }
  }
  return { label: 'Not connected', tone: 'text-foreground', sub: '' }
}

type MessengerUpdatesPanelProps = {
  onCount?: (n: number) => void
}

export default function MessengerUpdatesPanel({ onCount }: MessengerUpdatesPanelProps) {
  const [state, setState] = useState(null) // { configured, people }
  const [busy, setBusy] = useState(null)   // what is running: "all", or "copy:"/"email:"/"drop:"/"view:" + row key
  const [preview, setPreview] = useState(null) // { date, messages }
  const [open, setOpen] = useState(null)   // key of the row showing its message

  const load = useCallback(async () => {
    try {
      const data = await callMessenger({ mode: 'list' })
      setState(data)
      onCount?.(data.people.filter((p) => p.connected).length)
    } catch (err) {
      toast.error(err?.message || 'Could not load daily updates')
      setState({ configured: false, people: [] })
    }
  }, [onCount])

  useEffect(() => { load() }, [load])

  const copyLink = async (p) => {
    const k = `${p.role}:${p.staff_id}`
    setBusy(`copy:${k}`)
    try {
      const { url, code } = await callMessenger({ mode: 'link', role: p.role, staff_id: p.staff_id })
      try {
        await navigator.clipboard.writeText(url)
        toast.success(
          `Link copied. Send it to ${p.name}; it works for 7 days. If it doesn't connect them, they can message the Page "connect ${code}".`,
          { duration: 8000 },
        )
      } catch {
        window.prompt(`Send this link to ${p.name}:`, url)
      }
      await load()
    } catch (err) {
      toast.error(err?.message || 'Could not make a link')
    } finally {
      setBusy(null)
    }
  }

  const emailOne = async (p) => {
    if (!window.confirm(`Email ${p.name} their Messenger link at ${p.email}?`)) return
    const k = `${p.role}:${p.staff_id}`
    setBusy(`email:${k}`)
    try {
      const { sent, skipped } = await callMessenger({ mode: 'email', role: p.role, staff_id: p.staff_id })
      if (sent?.length) toast.success(`Link emailed to ${p.name}`)
      else toast.error(`Not sent: ${skipped?.[0]?.reason || 'unknown error'}`)
      await load()
    } catch (err) {
      toast.error(err?.message || 'Could not send the email')
    } finally {
      setBusy(null)
    }
  }

  // Every booker and housekeeper who isn't connected yet. Admins copy their own.
  const emailStaff = async () => {
    const waiting = (state?.people || []).filter((p) => p.role !== 'admin' && !p.connected)
    const withEmail = waiting.filter((p) => p.email)
    const noEmail = waiting.filter((p) => !p.email)
    if (!withEmail.length) {
      toast(noEmail.length ? 'Nobody left to email: the rest have no email on file' : 'Every booker and housekeeper is connected')
      return
    }
    const lines = [
      `Email a Messenger link to ${withEmail.length} ${withEmail.length === 1 ? 'person' : 'people'} who aren't connected yet?`,
      '',
      withEmail.map((p) => `${p.name} (${p.email})`).join('\n'),
    ]
    if (noEmail.length) lines.push('', `No email on file, skipped: ${noEmail.map((p) => p.name).join(', ')}`)
    if (!window.confirm(lines.join('\n'))) return
    setBusy('all')
    try {
      const { sent, skipped } = await callMessenger({ mode: 'email', staff: true })
      const failed = (skipped || []).filter((s) => s.reason !== 'no email on file')
      if (sent?.length) toast.success(`Emailed ${sent.length} ${sent.length === 1 ? 'link' : 'links'}`)
      if (failed.length) {
        toast.error(`Not sent to ${failed.map((s) => `${s.name} (${s.reason})`).join(', ')}`, { duration: 10000 })
      }
      await load()
    } catch (err) {
      toast.error(err?.message || 'Could not send the emails')
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (p) => {
    if (!window.confirm(`Stop daily updates for ${p.name}?\n\nThey'll need a new link to connect again.`)) return
    const k = `${p.role}:${p.staff_id}`
    setBusy(`drop:${k}`)
    try {
      await callMessenger({ mode: 'disconnect', role: p.role, staff_id: p.staff_id })
      toast.success(`${p.name} won't get daily updates`)
      await load()
    } catch (err) {
      toast.error(err?.message || 'Could not disconnect')
    } finally {
      setBusy(null)
    }
  }

  const togglePreview = async (p) => {
    const k = `${p.role}:${p.staff_id}`
    if (open === k) { setOpen(null); return }
    if (!preview) {
      setBusy(`view:${k}`)
      try {
        setPreview(await callMessenger({ mode: 'preview' }))
      } catch (err) {
        toast.error(err?.message || 'Could not build the preview')
        setBusy(null)
        return
      }
      setBusy(null)
    }
    setOpen(k)
  }

  const people = state?.people
  const connected = people?.filter((p) => p.connected).length

  return (
    <div className="max-w-3xl">
      <Panel>
        <PanelHeader
          icon={MessageCircle}
          title="Daily updates"
          subtitle="Every day at 8am on Messenger, each person gets their own list for the day"
          count={connected}
          action={state?.configured && state?.email_configured && (
            <button
              type="button"
              onClick={emailStaff}
              disabled={!!busy}
              title="Email a link to every booking specialist and housekeeper who isn't connected"
              className="h-8 px-3 rounded-md border border-border text-[12px] font-semibold text-foreground hover:bg-muted/60 disabled:opacity-50 inline-flex items-center gap-1.5 flex-shrink-0"
            >
              {busy === 'all' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Email staff
            </button>
          )}
        />

        {state && !state.configured && (
          <p className="px-5 py-3 border-b border-border text-[12px] text-amber-600 dark:text-amber-400 leading-relaxed">
            Messenger isn't connected to the Facebook Page yet, so links can't be made. You can still preview what each person would get today.
          </p>
        )}

        {people === undefined ? (
          <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-foreground" /></div>
        ) : people.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-foreground">Nobody on the team yet.</p>
        ) : (
          GROUPS.map((g) => {
            const rows = people.filter((p) => p.role === g.role)
            if (!rows.length) return null
            return (
              <Fragment key={g.role}>
                <SectionLabel title={g.title} count={rows.length} />
                <ul>
                  {rows.map((p) => {
                    const k = `${p.role}:${p.staff_id}`
                    const s = statusOf(p)
                    const message = open === k && preview?.messages.find((m) => m.role === p.role && m.staff_id === p.staff_id)
                    return (
                      <li key={k} className="border-b border-border last:border-0">
                        <div className="flex items-center gap-3 px-5 py-3">
                          <InitialsAvatar name={p.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground truncate">{p.name}</p>
                            <p className="text-[11.5px] text-foreground truncate">{p.code || p.email}</p>
                          </div>
                          <div className="text-right flex-shrink-0 max-w-[45%]">
                            <p className={`text-[11.5px] font-semibold ${s.tone}`}>{s.label}</p>
                            {s.sub && <p className="text-[11px] text-foreground truncate">{s.sub}</p>}
                            {p.connected && p.last_send_error && (
                              <p className="text-[11px] text-red-600 dark:text-red-400 truncate" title={p.last_send_error}>{p.last_send_error}</p>
                            )}
                          </div>
                          <div className="flex items-center flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => togglePreview(p)}
                              disabled={busy === `view:${k}`}
                              title="Preview today's message"
                              aria-label={`Preview today's message for ${p.name}`}
                              aria-expanded={open === k}
                              className="p-2 rounded-md text-foreground hover:bg-muted/60 disabled:opacity-40"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => copyLink(p)}
                              disabled={!!busy || !state.configured}
                              title={p.connected ? 'Copy a new link (to reconnect on another account)' : 'Copy their personal link'}
                              aria-label={`Copy Messenger link for ${p.name}`}
                              className="p-2 rounded-md text-foreground hover:bg-muted/60 disabled:opacity-40"
                            >
                              {busy === `copy:${k}` ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}
                            </button>
                            {!p.connected && (
                              <button
                                type="button"
                                onClick={() => emailOne(p)}
                                disabled={!!busy || !state.configured || !state.email_configured || !p.email}
                                title={p.email ? `Email their link to ${p.email}` : 'No email on file'}
                                aria-label={`Email Messenger link to ${p.name}`}
                                className="p-2 rounded-md text-foreground hover:bg-muted/60 disabled:opacity-40"
                              >
                                {busy === `email:${k}` ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                              </button>
                            )}
                            {(p.connected || p.link_pending) && (
                              <button
                                type="button"
                                onClick={() => disconnect(p)}
                                disabled={!!busy}
                                title="Stop their updates"
                                aria-label={`Stop daily updates for ${p.name}`}
                                className="p-2 rounded-md text-foreground hover:text-red-600 hover:bg-muted/60 disabled:opacity-40"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                        {message && (
                          <pre className="mx-5 mb-3 px-4 py-3 rounded-md border border-border bg-card text-[12px] leading-relaxed text-foreground whitespace-pre-wrap font-sans">
                            {message.text}
                          </pre>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Fragment>
            )
          })
        )}

        <p className="px-5 py-3 text-[11.5px] text-foreground border-t border-border leading-relaxed">
          Email or copy someone's link. When they open it and tap Get Started, they're connected.
          Facebook only lets the Page message people who wrote to it in the last 24 hours, so each update has a
          "Got it" button that keeps the next one coming. Anyone can type "today" to the Page for today's list.
        </p>
      </Panel>
    </div>
  )
}
