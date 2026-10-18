// src/admin/inquiries/activity.tsx
// What happened with each inquiry, shared by the two inquiry pages. Moving an
// inquiry to another stage asks how it went: a quick pick (Messenger, Call,
// In person, …; for Lost, why), a note, and when to follow up. The detail
// panel's timeline lists every move and note with who wrote it and takes new
// notes; board cards show the latest note and the follow-up date.
// Rows are in inquiry_activities (src/lib/api/inquiryActivity.ts); the follow-up
// date is the inquiry's own follow_up_on.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  Banknote, CalendarClock, Handshake, Hourglass, Inbox, Loader2, Mail, MapPin, MessageCircle,
  MessageCircleOff, MessageSquareText, PenLine, Phone, Smartphone, StickyNote, ThumbsUp, Undo2,
  User, Users, Video, Wallet, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useIsPhone } from '@/hooks/useIsPhone'
import { listActivities, addActivity, deleteActivity, activityInquiryId } from '@/lib/api/inquiryActivity'
import { STAGE_BY_ID, isDecided, localDay, stageOf, stagePatch, timeAgo } from './pipeline'
import type { Dispatch, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, SetStateAction } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { ActivityEntry, InquiryBoard } from '@/lib/api/inquiryActivity'
import { DatePicker } from '@/components/crm/DatePicker'

const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'
const LABEL = 'block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground'
const TEXTAREA = 'w-full text-xs rounded-md resize-none bg-card border border-border px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30'
const PRIMARY_BUTTON = 'inline-flex items-center justify-center gap-1.5 h-9 md:h-8 px-3 rounded-md bg-brand-solid text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity'

// ── Quick picks ───────────────────────────────────────────────────
// How they were reached, how it closed, or why it didn't. Saved as the row's
// `tag`, so new ones can be added here without touching the database.

type Tag = { label: string; icon: LucideIcon }

const TAGS: Record<string, Tag> = {
  messenger:     { label: 'Messenger',           icon: MessageCircle },
  call:          { label: 'Call',                icon: Phone },
  text:          { label: 'Text',                icon: MessageSquareText },
  viber:         { label: 'Viber',               icon: Smartphone },
  email:         { label: 'Email',               icon: Mail },
  in_person:     { label: 'In person',           icon: Handshake },
  video:         { label: 'Video call',          icon: Video },
  site_visit:    { label: 'Site visit',          icon: MapPin },
  signed:        { label: 'Signed',              icon: PenLine },
  deposit:       { label: 'Paid a deposit',      icon: Banknote },
  verbal:        { label: 'Said yes',            icon: ThumbsUp },
  no_reply:      { label: 'No reply',            icon: MessageCircleOff },
  other_company: { label: 'Chose someone else',  icon: Users },
  price:         { label: 'Price',               icon: Wallet },
  not_ready:     { label: 'Not ready yet',       icon: Hourglass },
  on_their_own:  { label: 'Doing it themselves', icon: User },
}

type MovePrompt = {
  question: string | null
  tags: string[]
  placeholder: Record<InquiryBoard, string>
}

// What the note dialog asks for each stage an inquiry moves to.
const MOVE_PROMPTS: Record<string, MovePrompt> = {
  new: {
    question: null,
    tags: [],
    placeholder: {
      property: 'e.g. They asked us to check back next month',
      interior: 'e.g. They asked us to check back next month',
    },
  },
  contacted: {
    question: 'How did you reach them?',
    tags: ['messenger', 'call', 'text', 'viber', 'email'],
    placeholder: {
      property: 'e.g. Messaged the owner on Messenger, waiting for a reply',
      interior: 'e.g. Messaged them on Messenger, waiting for a reply',
    },
  },
  discussed: {
    question: 'How did you talk?',
    tags: ['in_person', 'call', 'video', 'messenger', 'site_visit'],
    placeholder: {
      property: 'e.g. Met the owner at Coffee Break to go over Iloilo Rentals services',
      interior: 'e.g. Met at Coffee Break to talk through the design and budget',
    },
  },
  proposal: {
    question: 'How did you send it?',
    tags: ['email', 'messenger', 'viber', 'in_person'],
    placeholder: {
      property: 'e.g. Sent the management proposal with our rates',
      interior: 'e.g. Sent the design proposal and quotation',
    },
  },
  won: {
    question: 'How did it close?',
    tags: ['signed', 'deposit', 'verbal'],
    placeholder: {
      property: 'e.g. Signed the management contract, starts Nov 1',
      interior: 'e.g. Approved the design, down payment paid',
    },
  },
  lost: {
    question: "Why didn't it go ahead?",
    tags: ['no_reply', 'other_company', 'price', 'not_ready', 'on_their_own'],
    placeholder: {
      property: 'e.g. Decided to rent it out on their own',
      interior: 'e.g. Went with a contractor they already know',
    },
  },
}

// A note added from the timeline, any time.
const NOTE_TAGS = ['messenger', 'call', 'text', 'viber', 'email', 'in_person']
const NOTE_PLACEHOLDER = "Add a note, e.g. Called, they'll decide by Friday"

function chipClass(on: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 h-9 md:h-7 px-2.5 rounded-md border text-[12px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50',
    on ? 'border-brand-solid bg-brand-solid text-white' : 'border-border text-foreground hover:border-brand/40 hover:bg-brand/[0.05]',
  )
}

type TagPickerProps = {
  tags: string[]
  value: string | null
  onChange: (tag: string | null) => void
  label: string
}

/** One-tap answers; tapping the chosen one again clears it. */
function TagPicker({ tags, value, onChange, label }: TagPickerProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {tags.map((id) => {
        const tag = TAGS[id]
        const on = value === id
        const Icon = tag.icon
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onChange(on ? null : id)} className={chipClass(on)}>
            <Icon size={13} aria-hidden className="flex-shrink-0" />
            {tag.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Follow-up date ────────────────────────────────────────────────

function fmtDay(day: string) {
  const d = new Date(`${day}T00:00:00`)
  if (Number.isNaN(d.getTime())) return day
  const thisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }) })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const FOLLOW_UP_PICKS = [
  { label: 'Tomorrow',  days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
]

type FollowUpPickerProps = {
  value: string | null
  onChange: (day: string | null) => void
  disabled?: boolean
}

/** Tomorrow / In 3 days / Next week, or any date; × clears it. */
function FollowUpPicker({ value, onChange, disabled = false }: FollowUpPickerProps) {
  const picked = FOLLOW_UP_PICKS.some((p) => localDay(p.days) === value)
  return (
    <div role="group" aria-label="Follow up on" className="flex flex-wrap items-center gap-1.5">
      {FOLLOW_UP_PICKS.map((p) => {
        const day = localDay(p.days)
        const on = value === day
        return (
          <button key={p.days} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange(on ? null : day)} className={chipClass(on)}>
            {p.label}
          </button>
        )
      })}
      {/* The date and its × wrap together. */}
      <span className="inline-flex items-center gap-1">
        <DatePicker
          value={value || ''}
          disabled={disabled}
          onChange={(v) => onChange(v || null)}
          ariaLabel="Follow-up date"
          placeholder="Pick a day"
          size="sm"
          clearable={false}
          className="w-[140px]"
        />
        {value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label="No follow-up"
            title="No follow-up"
            className="h-9 w-9 md:h-7 md:w-7 inline-flex items-center justify-center rounded-md text-foreground hover:bg-muted disabled:opacity-50"
          >
            <X size={14} />
          </button>
        )}
      </span>
    </div>
  )
}

type FollowUpTextProps = {
  day: string | null | undefined
  /** Just the date ("Today", "Overdue", "Thu, Oct 17"), for narrow columns. */
  short?: boolean
  className?: string
}

/** When to follow up: amber on the day, red once it's past. */
export function FollowUpText({ day, short = false, className }: FollowUpTextProps) {
  if (!day) return null
  const today = localDay()
  let label: string
  let tone = ''
  if (day < today) {
    label = short ? 'Overdue' : `Overdue · ${fmtDay(day)}`
    tone = 'text-red-600 dark:text-red-400'
  } else if (day === today) {
    label = short ? 'Today' : 'Follow up today'
    tone = 'text-amber-600 dark:text-amber-400'
  } else if (day === localDay(1)) {
    label = short ? 'Tomorrow' : 'Follow up tomorrow'
  } else {
    label = short ? fmtDay(day) : `Follow up ${fmtDay(day)}`
  }
  return (
    <span title={`Follow up ${fmtDay(day)}`} className={cn('inline-flex items-center gap-1 min-w-0 text-[11px] font-semibold text-foreground', className)}>
      <CalendarClock size={12} aria-hidden className="flex-shrink-0" />
      <span className={cn('truncate', tone)}>{label}</span>
    </span>
  )
}

// ── Data ──────────────────────────────────────────────────────────

/**
 * One board's timeline rows, kept live across admins. `byInquiry` maps an
 * inquiry's id to its rows, newest first.
 */
export function useInquiryActivity(board: InquiryBoard) {
  const [rows, setRows] = useState<any[]>([])

  const load = useCallback(async () => {
    try {
      setRows(await listActivities(board))
    } catch (err) {
      console.error('Failed to load inquiry activity:', err)
    }
  }, [board])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel(`inquiry-activity-${board}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inquiry_activities' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [board, load])

  const byInquiry = useMemo(() => {
    const map = new Map<any, any[]>()
    for (const row of rows) {
      const id = activityInquiryId(board, row)
      if (id == null) continue
      const list = map.get(id)
      if (list) list.push(row)
      else map.set(id, [row])
    }
    return map
  }, [rows, board])

  const add = useCallback(async (inquiryId, entry: ActivityEntry) => {
    const row = await addActivity(board, inquiryId, entry)
    setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]))
    return row
  }, [board])

  const remove = useCallback(async (id) => {
    await deleteActivity(id)
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return { byInquiry, add, remove }
}

/** The newest row that says something (a note or a quick pick). */
function latestNote(entries?: any[]) {
  return entries?.find((e) => e.body || TAGS[e.tag]) || null
}

/** An inquiry's notes as text, so the search box finds them. */
export function activitySearchText(entries?: any[]) {
  if (!entries?.length) return ''
  return entries.map((e) => [e.body, TAGS[e.tag]?.label].filter(Boolean).join(' ')).join(' ').toLowerCase()
}

// ── Board card ────────────────────────────────────────────────────

type CardActivityProps = {
  entries?: any[]
  followUp?: string | null
  stage: string
}

/** A board card's last lines: the latest note, and when to follow up. */
export function CardActivity({ entries, followUp, stage }: CardActivityProps) {
  const note = latestNote(entries)
  const day = isDecided(stage) ? null : followUp
  if (!note && !day) return null
  const tag = note ? TAGS[note.tag] : null
  return (
    <div className="mt-2 pt-2 border-t border-border space-y-1 text-foreground">
      {note && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug min-w-0">
          <MessageSquareText size={12} aria-hidden className="mt-[2px] flex-shrink-0" />
          <span className="line-clamp-2 break-words min-w-0">
            {tag && <span className="font-semibold">{tag.label}</span>}
            {tag && note.body && ' · '}
            {note.body}
          </span>
        </p>
      )}
      {day && <FollowUpText day={day} />}
    </div>
  )
}

// ── Moving to another stage ───────────────────────────────────────

type NoteResult = { tag: string | null; body: string; followUp: string | null }

type StageNoteDialogProps = {
  board: InquiryBoard
  name: string
  from: string
  to: string
  followUp: string | null
  /** Resolves false when saving failed (the dialog stays open). */
  onSave: (note: NoteResult) => Promise<boolean>
  onSkip: () => void
  onUndo: () => void
}

function StageNoteDialog({ board, name, from, to, followUp: startFollowUp, onSave, onSkip, onUndo }: StageNoteDialogProps) {
  const phone = useIsPhone()
  const prompt = MOVE_PROMPTS[to] || MOVE_PROMPTS.new
  const stage = STAGE_BY_ID[to]
  const Icon = stage.icon
  const [tag, setTag] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [followUp, setFollowUp] = useState<string | null>(startFollowUp)
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Type straight away on a computer; on a phone the keyboard would hide the quick picks.
  useEffect(() => {
    if (!phone) bodyRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  const save = async () => {
    if (saving) return
    setSaving(true)
    const ok = await onSave({ tag, body: body.trim(), followUp })
    if (!ok) setSaving(false)
  }
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" tabIndex={-1} aria-label="Skip the note" onClick={onSkip} className="absolute inset-0 bg-black/50 cursor-default" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-note-title"
        onKeyDown={onKeyDown}
        className="relative w-full sm:max-w-[30rem] max-h-[92dvh] flex flex-col bg-card border border-border rounded-t-lg sm:rounded-lg overflow-hidden"
        style={{ boxShadow: SOFT_SHADOW, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex-shrink-0 flex items-start gap-3 px-5 py-4 border-b border-border">
          <Icon size={18} aria-hidden className="mt-0.5 flex-shrink-0 text-foreground" />
          <div className="min-w-0 flex-1">
            <h3 id="stage-note-title" className="text-sm font-bold text-foreground">
              Moved to <span className={stage.className}>{stage.label}</span>
            </h3>
            <p className="text-[12px] text-foreground truncate">{name} · was {STAGE_BY_ID[from]?.label || 'New'}</p>
          </div>
          <button type="button" onClick={onSkip} aria-label="Close without a note" className="p-1 rounded hover:bg-muted text-foreground flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {prompt.question && (
            <div>
              <p className={LABEL}>{prompt.question}</p>
              <TagPicker tags={prompt.tags} value={tag} onChange={setTag} label={prompt.question} />
            </div>
          )}
          <div>
            <label htmlFor="stage-note-body" className={LABEL}>Note</label>
            <textarea
              id="stage-note-body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={prompt.placeholder[board]}
              className={TEXTAREA}
            />
          </div>
          {!isDecided(to) && (
            <div>
              <p className={LABEL}>Follow up</p>
              <FollowUpPicker value={followUp} onChange={setFollowUp} />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            onClick={onUndo}
            className="mr-auto -ml-2 inline-flex items-center gap-1.5 h-9 md:h-8 px-2 rounded-md text-[12px] font-semibold text-foreground hover:bg-muted"
          >
            <Undo2 size={14} aria-hidden /> Undo move
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="h-9 md:h-8 px-3 rounded-md border border-border text-[12px] font-semibold text-foreground hover:bg-muted"
          >
            Skip
          </button>
          <button type="button" onClick={save} disabled={saving} title="Save (Ctrl+Enter)" className={PRIMARY_BUTTON}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

type StageMoveOptions = {
  board: InquiryBoard
  setItems: Dispatch<SetStateAction<any[]>>
  /** Saves fields on the inquiry and returns the saved row. */
  save: (id: any, patch: Record<string, unknown>) => Promise<any>
  addActivity: (inquiryId: any, entry: ActivityEntry) => Promise<any>
  nameOf: (item: any) => string
}

type PendingMove = {
  id: any
  name: string
  from: string
  to: string
  before: Record<string, unknown>
  patch: Record<string, unknown>
  followUp: string | null
}

/**
 * Moves an inquiry to another stage: the card moves at once and the change
 * is saved (if that fails the card goes back). Then `stageDialog` asks how
 * it went. Saving or skipping adds the move to the inquiry's timeline; Undo
 * puts it back as if it never moved.
 */
export function useStageMove({ board, setItems, save, addActivity, nameOf }: StageMoveOptions) {
  const [pending, setPending] = useState<PendingMove | null>(null)
  const nameRef = useRef(nameOf)
  nameRef.current = nameOf

  const apply = useCallback((id, fields) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...fields } : i)))
  }, [setItems])

  const moveStage = useCallback(async (item, stage: string) => {
    const from = stageOf(item)
    if (from === stage) return
    const patch = stagePatch(item, stage)
    const before = {
      status: item.status,
      contacted_at: item.contacted_at ?? null,
      closed_at: item.closed_at ?? null,
      follow_up_on: item.follow_up_on ?? null,
    }
    apply(item.id, patch)
    try {
      apply(item.id, await save(item.id, patch))
    } catch (err) {
      console.error(err)
      apply(item.id, before)
      toast.error('Could not move the inquiry')
      return
    }
    setPending({
      id: item.id,
      name: nameRef.current(item),
      from,
      to: stage,
      before,
      patch,
      followUp: isDecided(stage) ? null : item.follow_up_on ?? null,
    })
  }, [apply, save])

  const undo = useCallback(async () => {
    const p = pending
    if (!p) return
    setPending(null)
    apply(p.id, p.before)
    try {
      apply(p.id, await save(p.id, p.before))
    } catch (err) {
      console.error(err)
      apply(p.id, p.patch)
      toast.error('Could not undo')
    }
  }, [pending, apply, save])

  // The move goes on the timeline without a note.
  const skip = useCallback(() => {
    const p = pending
    if (!p) return
    setPending(null)
    addActivity(p.id, { kind: 'stage', stage: p.to, from_stage: p.from }).catch((err) => {
      console.error(err)
      toast.error('Could not add the move to the timeline')
    })
  }, [pending, addActivity])

  const saveNote = useCallback(async (note: NoteResult) => {
    const p = pending
    if (!p) return true
    try {
      await addActivity(p.id, { kind: 'stage', stage: p.to, from_stage: p.from, tag: note.tag, body: note.body })
    } catch (err) {
      console.error(err)
      toast.error('Could not save the note. Try again.')
      return false
    }
    if (note.followUp !== p.followUp) {
      try {
        apply(p.id, await save(p.id, { follow_up_on: note.followUp }))
      } catch (err) {
        console.error(err)
        toast.error('Note saved, but the follow-up date could not be set')
      }
    }
    setPending(null)
    return true
  }, [pending, addActivity, apply, save])

  const stageDialog = pending ? (
    <StageNoteDialog
      key={`${pending.id}-${pending.to}`}
      board={board}
      name={pending.name}
      from={pending.from}
      to={pending.to}
      followUp={pending.followUp}
      onSave={saveNote}
      onSkip={skip}
      onUndo={undo}
    />
  ) : null

  return { moveStage, stageDialog }
}

// ── Detail panel ──────────────────────────────────────────────────

type ContactActionsProps = {
  phone?: string | null
  email?: string | null
  /** Called with the note type that matches, so the next note is ready to log. */
  onPick: (tag: string) => void
}

/** Call, text or email them. */
export function ContactActions({ phone, email, onPick }: ContactActionsProps) {
  const tel = phone ? phone.replace(/[^\d+]/g, '') : ''
  const actions = [
    { tag: 'call',  label: 'Call',  icon: Phone,             href: tel ? `tel:${tel}` : null,       missing: 'No phone number' },
    { tag: 'text',  label: 'Text',  icon: MessageSquareText, href: tel ? `sms:${tel}` : null,       missing: 'No phone number' },
    { tag: 'email', label: 'Email', icon: Mail,              href: email ? `mailto:${email}` : null, missing: 'No email' },
  ]
  const base = 'inline-flex items-center justify-center gap-1.5 h-9 md:h-8 rounded-md border border-border text-[12px] font-semibold text-foreground'
  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map((a) => {
        const Icon = a.icon
        return a.href ? (
          <a key={a.tag} href={a.href} onClick={() => onPick(a.tag)} className={cn(base, 'hover:border-brand/40 hover:bg-brand/[0.05]')}>
            <Icon size={13} aria-hidden /> {a.label}
          </a>
        ) : (
          <span key={a.tag} aria-disabled="true" title={a.missing} className={cn(base, 'opacity-40 cursor-not-allowed')}>
            <Icon size={13} aria-hidden /> {a.label}
          </span>
        )
      })}
    </div>
  )
}

type ActivityPanelProps = {
  inquiry: any
  entries?: any[]
  /** The note type picked for the next note (lifted so ContactActions can set it). */
  tag: string | null
  onTag: (tag: string | null) => void
  onAdd: (entry: ActivityEntry) => Promise<any>
  onRemove: (id: any) => Promise<void>
  /** Saves the follow-up date; rejects if it couldn't. */
  onFollowUp: (day: string | null) => Promise<any>
  /** The timeline's first entry, e.g. "Sent the List your property form". */
  receivedLabel: string
}

/** The detail panel's Activity: follow-up date, a new note, then the timeline, newest first. */
export function ActivityPanel({ inquiry, entries = [], tag, onTag, onAdd, onRemove, onFollowUp, receivedLabel }: ActivityPanelProps) {
  const stage = stageOf(inquiry)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingFollowUp, setSavingFollowUp] = useState(false)
  const canAdd = !!body.trim() || !!tag

  useEffect(() => { setBody('') }, [inquiry.id])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!canAdd || saving) return
    setSaving(true)
    try {
      await onAdd({ kind: 'note', stage, tag, body })
      setBody('')
      onTag(null)
    } catch (err) {
      console.error(err)
      toast.error('Could not add the note')
    } finally {
      setSaving(false)
    }
  }

  const changeFollowUp = async (day: string | null) => {
    setSavingFollowUp(true)
    try {
      await onFollowUp(day)
      toast.success(day ? `Follow up ${fmtDay(day)}` : 'Follow-up cleared')
    } catch {
      // onFollowUp has already said it failed.
    } finally {
      setSavingFollowUp(false)
    }
  }

  const remove = async (entry) => {
    if (!window.confirm('Delete this from the timeline?')) return
    try {
      await onRemove(entry.id)
    } catch (err) {
      console.error(err)
      toast.error('Could not delete it')
    }
  }

  return (
    <div>
      {!isDecided(stage) && (
        <div className="p-3 border-b border-border flex items-center gap-x-3 gap-y-2 flex-wrap">
          <span className="text-[11px] font-semibold text-foreground min-w-[72px]">Follow up</span>
          <FollowUpPicker value={inquiry.follow_up_on || null} onChange={changeFollowUp} disabled={savingFollowUp} />
        </div>
      )}

      <form onSubmit={submit} className="p-3 border-b border-border space-y-2">
        <TagPicker tags={NOTE_TAGS} value={tag} onChange={onTag} label="How you were in touch" />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              submit()
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={NOTE_PLACEHOLDER}
          aria-label="Note"
          className={TEXTAREA}
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-foreground max-md:hidden">Ctrl+Enter to add</span>
          <button type="submit" disabled={!canAdd || saving} className={cn(PRIMARY_BUTTON, 'ml-auto')}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Add note
          </button>
        </div>
      </form>

      <ol aria-label="Timeline" className="p-3">
        {entries.map((entry) => {
          const moved = entry.kind === 'stage' ? STAGE_BY_ID[entry.stage] : null
          const how = TAGS[entry.tag]
          return (
            <TimelineItem
              key={entry.id}
              icon={moved ? moved.icon : StickyNote}
              title={(
                <>
                  {moved ? <>Moved to <span className={moved.className}>{moved.label}</span></> : 'Note'}
                  {how && <span className="font-normal"> · {how.label}</span>}
                </>
              )}
              body={entry.body}
              at={entry.created_at}
              author={entry.author_name || 'Someone on the team'}
              onRemove={() => remove(entry)}
            />
          )
        })}
        {inquiry.admin_notes && <TimelineItem icon={StickyNote} title="Earlier notes" body={inquiry.admin_notes} />}
        <TimelineItem icon={Inbox} title={receivedLabel} at={inquiry.created_at} />
      </ol>
    </div>
  )
}

type TimelineItemProps = {
  icon: LucideIcon
  title: ReactNode
  body?: string | null
  at?: string | null
  author?: string | null
  onRemove?: () => void
}

function TimelineItem({ icon: Icon, title, body, at, author, onRemove }: TimelineItemProps) {
  return (
    <li className="group relative flex gap-3 pb-4 last:pb-0">
      {/* The line down to the next entry. */}
      <span aria-hidden className="absolute left-[7px] top-6 bottom-1 w-px bg-border group-last:hidden" />
      <Icon size={15} aria-hidden className="relative mt-0.5 flex-shrink-0 text-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="flex-1 min-w-0 text-[12px] font-semibold text-foreground">{title}</p>
          {at && (
            <time dateTime={at} title={fmtDateTime(at)} className="text-[11px] tabular-nums text-foreground flex-shrink-0">
              {timeAgo(at)}
            </time>
          )}
        </div>
        {body && <p className="mt-0.5 text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">{body}</p>}
        {(author || onRemove) && (
          <div className="mt-1 flex items-center gap-3 text-[11px] text-foreground">
            {author && <span className="truncate">{author}</span>}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="font-semibold text-red-600 dark:text-red-400 hover:underline underline-offset-2 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
