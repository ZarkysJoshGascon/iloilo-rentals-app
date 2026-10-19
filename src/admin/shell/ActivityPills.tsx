// src/admin/shell/ActivityPills.tsx
// A small pill at the bottom of the CRM for every change anyone makes: an add,
// an edit, a status picked from a dropdown, a photo uploaded, a submission. It
// reads the same work log as the dashboard's "Work done today" (a trigger on the
// CRM tables writes one row per change), so no page has to announce its own
// changes. New website inquiries already get their own notice at the top, so
// they're left out here.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { describeEntry, type Described, type Person, type WorkEntry } from '@/admin/dashboard/workLog'

const MAX_STACK = 3
const AUTO_DISMISS_MS = 5000
const EASE = [0.16, 1, 0.3, 1] as const
const INQUIRY_TABLES = new Set(['property_inquiries', 'interior_design_inquiries'])

// The verb in status colours: green for something added, red for something
// removed or cancelled, blue for an edit.
const TONES = {
  add: 'text-emerald-600 dark:text-emerald-400',
  edit: 'text-blue-600 dark:text-blue-400',
  remove: 'text-red-600 dark:text-red-400',
}

type Pill = Described & { key: string; name: string; tone: keyof typeof TONES; detail: string }

function toneOf(entry: WorkEntry, d: Described): keyof typeof TONES {
  if (entry.action === 'INSERT') return 'add'
  if (entry.action === 'DELETE' || d.verb === 'deleted' || d.verb === 'cancelled') return 'remove'
  return 'edit'
}

// The first change, else where it happened ("Status: Ready → Completed", "S1 408").
function detailOf(d: Described) {
  const c = d.changes[0]
  if (c) return c.note ? `${c.label} ${c.note}` : c.list ? `${c.label} updated` : `${c.label}: ${c.from} → ${c.to}`
  return d.context[0] || ''
}

function initialsOf(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

type PillAvatarProps = {
  name: string
  src: string | null
}

function PillAvatar({ name, src }: PillAvatarProps) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-7 h-7 rounded-full object-cover ring-1 ring-border flex-shrink-0" />
  }
  return (
    <span className="w-7 h-7 rounded-full bg-card ring-1 ring-border text-foreground flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
      {initialsOf(name)}
    </span>
  )
}

type ActivityPillsProps = {
  userId?: string | null
  /** Distance from the bottom of the screen (clears the phone's nav bar). */
  bottom: string
}

export function ActivityPills({ userId, bottom }: ActivityPillsProps) {
  const navigate = useNavigate()
  const [pills, setPills] = useState<Pill[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const people = useRef<Record<string, Person>>({})
  const channelId = useId().replace(/:/g, '')

  const dismiss = useCallback((key: string) => {
    clearTimeout(timers.current.get(key))
    timers.current.delete(key)
    setPills((prev) => prev.filter((p) => p.key !== key))
  }, [])

  const startTimer = useCallback((key: string) => {
    clearTimeout(timers.current.get(key))
    timers.current.set(key, setTimeout(() => dismiss(key), AUTO_DISMISS_MS))
  }, [dismiss])

  useEffect(() => {
    const map = timers.current
    const channel = supabase
      .channel(`activity-pills-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, async (payload) => {
        const entry = payload.new as WorkEntry
        if (!['INSERT', 'UPDATE', 'DELETE'].includes(entry?.action)) return
        if (!entry.user_id && INQUIRY_TABLES.has(entry.table_name)) return

        if (entry.user_id && !people.current[entry.user_id]) {
          const { data } = await supabase.from('profiles').select('id, full_name, email, avatar_url').eq('id', entry.user_id).maybeSingle()
          if (data) {
            people.current[data.id] = { id: data.id, name: data.full_name || data.email?.split('@')[0] || 'Someone', avatar: data.avatar_url || null }
          }
        }

        const d = describeEntry(entry, people.current)
        const pill: Pill = {
          ...d,
          key: entry.id,
          name: d.actor,
          actor: entry.user_id && entry.user_id === userId ? 'You' : d.actor,
          tone: toneOf(entry, d),
          detail: detailOf(d),
        }
        setPills((prev) => [...prev.filter((p) => p.key !== pill.key), pill].slice(-MAX_STACK))
        startTimer(pill.key)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      for (const t of map.values()) clearTimeout(t)
      map.clear()
    }
  }, [channelId, userId, startTimer])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9000] flex flex-col items-center gap-2 pointer-events-none w-max max-w-[94vw]"
      style={{ bottom }}
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {pills.map((p) => (
          <motion.div
            key={p.key}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="pointer-events-auto max-w-full"
            onMouseEnter={() => clearTimeout(timers.current.get(p.key))}
            onMouseLeave={() => startTimer(p.key)}
          >
            <div className="flex items-center gap-1 pl-1.5 pr-1 py-1.5 rounded-full bg-card border border-border shadow-lg max-w-[94vw] sm:max-w-[560px]">
              <button
                type="button"
                disabled={!p.href}
                onClick={() => { dismiss(p.key); if (p.href) navigate(p.href) }}
                className="flex items-center gap-2.5 min-w-0 pr-1.5 text-left disabled:cursor-default"
                title={p.href ? 'Open it' : undefined}
              >
                <PillAvatar name={p.name} src={p.avatar} />
                <span className="text-[12.5px] text-foreground truncate min-w-0">
                  <span className="font-semibold">{p.actor}</span>{' '}
                  <span className={cn('font-semibold', TONES[p.tone])}>{p.verb}</span>{' '}
                  {p.noun}
                  {p.label && <span className="font-semibold"> {p.label}</span>}
                  {p.detail && <span className="text-foreground/75"> · {p.detail}</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={() => dismiss(p.key)}
                aria-label="Dismiss"
                className="w-6 h-6 rounded-full flex items-center justify-center text-foreground hover:bg-muted transition-colors flex-shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
