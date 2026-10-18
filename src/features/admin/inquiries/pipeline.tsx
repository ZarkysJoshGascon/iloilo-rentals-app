// src/features/admin/inquiries/pipeline.tsx
// The sales pipeline shared by the two inquiry pages (List Property and
// Interior Design): the stages an inquiry moves through, the kanban board
// with arrow-shaped lane headers (drag a card to another stage; on phones,
// press and hold first), photo covers and a photo viewer, the stat strip,
// the Board/List switch, the stage filter and the stage path in the detail
// panel. The stage is stored in each inquiry's `status` column, the next
// follow-up in `follow_up_on`. Notes and the stage history are in activity.tsx.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor,
  pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  CalendarClock, Check, ChevronLeft, ChevronRight, CircleX, ExternalLink, ImageOff, Kanban, Layers, MessageSquare,
  Inbox, MessagesSquare, Phone, PhoneOutgoing, Rows3, Send, Trophy, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsPhone } from '@/hooks/useIsPhone'
import { InitialsAvatar } from '@/components/crm/Panel'
import { StatStrip, StatTile } from '@/components/crm/StatStrip'
import { StatusTabs } from '@/components/crm/StatusTabs'
import type { CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Each stage: an icon for its arrow, and its name in font colour (as on the
// other CRM pages) wherever an inquiry's stage is shown as text.
export const STAGES = [
  { id: 'new',       label: 'New',       icon: Inbox,          hint: 'Waiting for a first reply',    className: 'text-blue-600 dark:text-blue-400' },
  { id: 'contacted', label: 'Contacted', icon: PhoneOutgoing,  hint: 'Reached out, waiting to talk', className: 'text-amber-600 dark:text-amber-400' },
  { id: 'discussed', label: 'Discussed', icon: MessagesSquare, hint: 'Talked through their needs',   className: 'text-violet-600 dark:text-violet-400' },
  { id: 'proposal',  label: 'Proposal',  icon: Send,           hint: 'Offer or quote sent',          className: 'text-cyan-700 dark:text-cyan-400' },
  { id: 'won',       label: 'Won',       icon: Trophy,         hint: 'Signed on',                    className: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'lost',      label: 'Lost',      icon: CircleX,        hint: "Didn't go ahead",              className: 'text-red-600 dark:text-red-400' },
]
type Stage = (typeof STAGES)[number]
export const STAGE_BY_ID: Record<string, Stage> = Object.fromEntries(STAGES.map((s) => [s.id, s]))
const ALL_STAGE_IDS = STAGES.map((s) => s.id)
export const OPEN_STAGES = ['contacted', 'discussed', 'proposal']
// The steps before an outcome, shown as the path in the detail panel.
const PATH_STAGES = ['new', ...OPEN_STAGES]
export const STAGE_RANK = Object.fromEntries(STAGES.map((s, i) => [s.id, i]))
export const STAGE_TABS = [{ id: 'all', label: 'All' }, ...STAGES.map(({ id, label }) => ({ id, label }))]

/** An inquiry's stage. Rows marked "closed" before Won/Lost existed count as won. */
export function stageOf(inquiry) {
  const s = inquiry?.status === 'closed' ? 'won' : inquiry?.status
  return STAGE_BY_ID[s] ? s : 'new'
}

export function isDecided(stage) {
  return stage === 'won' || stage === 'lost'
}

/** A date as YYYY-MM-DD in this browser's time zone, `offsetDays` from today. */
export function localDay(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** An inquiry still in play whose follow-up date is today or past. */
export function isFollowUpDue(inquiry) {
  return !!inquiry?.follow_up_on && !isDecided(stageOf(inquiry)) && inquiry.follow_up_on <= localDay()
}

/**
 * The stages a filter shows: 'all', one stage, 'open' (being worked on) or
 * 'due' (follow-up due, any stage before Won/Lost).
 */
export function stagesFor(filter) {
  if (filter === 'open') return OPEN_STAGES
  if (filter === 'due') return PATH_STAGES
  if (STAGE_BY_ID[filter]) return [filter]
  return ALL_STAGE_IDS
}

/** Whether an inquiry passes the stage filter. */
export function matchesFilter(inquiry, filter) {
  if (!stagesFor(filter).includes(stageOf(inquiry))) return false
  return filter !== 'due' || isFollowUpDue(inquiry)
}

export function filterLabel(filter) {
  if (filter === 'open') return 'In progress'
  if (filter === 'due') return 'Follow-up due'
  return STAGE_BY_ID[filter]?.label || filter
}

/** The fields to save when an inquiry moves to `stage`. */
export function stagePatch(inquiry, stage) {
  const patch: Record<string, string | null> = { status: stage }
  if ((OPEN_STAGES.includes(stage) || stage === 'won') && !inquiry.contacted_at) {
    patch.contacted_at = new Date().toISOString()
  }
  // closed_at is when it was won or lost; moving it back on clears it.
  patch.closed_at = isDecided(stage) ? new Date().toISOString() : null
  // A decided inquiry needs no follow-up.
  if (isDecided(stage)) patch.follow_up_on = null
  return patch
}

type StageTextProps = {
  stage: string
  className?: string
}

export function StageText({ stage, className }: StageTextProps) {
  const s = STAGE_BY_ID[stage] || STAGE_BY_ID.new
  return <span className={cn('text-[11.5px] font-semibold whitespace-nowrap', s.className, className)}>{s.label}</span>
}

/** For a field the sender left empty. */
export function NotProvided({ children = 'Not provided' }: { children?: ReactNode }) {
  return <span className="italic">{children}</span>
}

export function timeAgo(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function isWithinDays(iso, days) {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && Date.now() - t <= days * 86_400_000
}

function photosOf(images): { url: string }[] {
  return Array.isArray(images) ? images.filter((img) => img && typeof img.url === 'string') : []
}

type PipelineSummaryProps = {
  inquiries: any[]
  icon: LucideIcon
  allLabel: string
  active: string
  onSelect: (filter: string) => void
}

// KPI strip as on the Dashboard; each tile filters the board or list below.
export function PipelineSummary({ inquiries, icon, allLabel, active, onSelect }: PipelineSummaryProps) {
  const stats = useMemo(() => {
    const count = (ids) => inquiries.filter((i) => ids.includes(stageOf(i))).length
    return {
      total:    inquiries.length,
      thisWeek: inquiries.filter((i) => isWithinDays(i.created_at, 7)).length,
      new:      count(['new']),
      open:     count(OPEN_STAGES),
      won:      count(['won']),
      lost:     count(['lost']),
      due:      inquiries.filter(isFollowUpDue).length,
      upcoming: inquiries.filter((i) => i.follow_up_on && !isDecided(stageOf(i)) && !isFollowUpDue(i)).length,
    }
  }, [inquiries])
  const decided = stats.won + stats.lost
  const pick = (id) => onSelect(active === id ? 'all' : id)

  return (
    <StatStrip cols={5}>
      {/* Full width on phones, so the other four pair up. */}
      <StatTile icon={icon} label={allLabel} value={stats.total} sub={`${stats.thisWeek} in the last 7 days`} active={active === 'all'} onClick={() => onSelect('all')} className="max-sm:col-span-2" />
      <StatTile
        icon={Inbox}
        label="New"
        value={stats.new}
        sub={stats.new > 0 ? 'Waiting for a reply' : 'All caught up'}
        attention={stats.new > 0}
        active={active === 'new'}
        onClick={() => pick('new')}
      />
      <StatTile icon={MessageSquare} label="In progress" value={stats.open} sub="Being worked on" active={active === 'open'} onClick={() => pick('open')} />
      <StatTile
        icon={CalendarClock}
        label="Follow-ups"
        value={stats.due}
        sub={stats.due > 0 ? 'Today or overdue' : stats.upcoming > 0 ? `${stats.upcoming} coming up` : 'None scheduled'}
        attention={stats.due > 0}
        active={active === 'due'}
        onClick={() => pick('due')}
      />
      <StatTile
        icon={Trophy}
        label="Won"
        value={stats.won}
        sub={decided > 0 ? `${Math.round((stats.won / decided) * 100)}% win rate` : 'None decided yet'}
        active={active === 'won'}
        onClick={() => pick('won')}
      />
    </StatStrip>
  )
}

const VIEW_TABS = [
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'list',  label: 'List',  icon: Rows3 },
]

/** Board or list, remembered per page in this browser. */
export function usePipelineView(storageKey: string) {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'list' ? 'list' : 'board' } catch { return 'board' }
  })
  const change = useCallback((v) => {
    setView(v)
    try { localStorage.setItem(storageKey, v) } catch { /* private mode */ }
  }, [storageKey])
  return [view, change] as const
}

type ViewToggleProps = {
  value: string
  onChange: (view: string) => void
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return <StatusTabs tabs={VIEW_TABS} value={value} onChange={onChange} label="Show inquiries as" />
}

// ── Arrows ────────────────────────────────────────────────────────
// Stage headers are arrows that lock into each other: each one's point sits
// in the next one's notch, with a thin gap between them. They're white with
// a hairline outline, black text and a bare icon; only the one you're on
// (the stage you filtered to, the open inquiry's stage, the lane you're
// dropping on) fills with the logo blue.

const ARROW_GAP = 3

/** The arrow outline: a notch on the left (not the first) and a point on the right (not the last). */
function arrowClip(first: boolean, last: boolean, depth: number) {
  const right = last ? '100% 0, 100% 100%' : `calc(100% - ${depth}px) 0, 100% 50%, calc(100% - ${depth}px) 100%`
  const left = first ? '0 100%' : `0 100%, ${depth}px 50%`
  return `polygon(0 0, ${right}, ${left})`
}

// The arrow's element is filled with the outline colour; this sits 1px inside
// it with the same shape, so the outline shows as a hairline around it.
// (A CSS border would be cut off by the clip.)
type ArrowFillProps = {
  clip: string
  first: boolean
  last: boolean
  on: boolean
  hover?: boolean
}

function ArrowFill({ clip, first, last, on, hover = false }: ArrowFillProps) {
  return (
    <span
      aria-hidden
      style={{ clipPath: clip }}
      className={cn(
        'absolute inset-px -z-10 transition-colors duration-150',
        on ? 'bg-brand-solid' : 'bg-card',
        // Opaque tints, so the outline colour underneath doesn't show through.
        !on && hover && 'group-hover:bg-[color-mix(in_oklab,var(--brand)_7%,var(--card))] group-focus-visible:bg-[color-mix(in_oklab,var(--brand)_12%,var(--card))]',
        first && 'rounded-l-[5px]',
        last && 'rounded-r-[5px]',
      )}
    />
  )
}

/** Classes for an arrow's own element: its outline colour and text colour. */
function arrowShell(on: boolean, first: boolean, last: boolean) {
  return cn(
    'relative isolate transition-colors duration-150',
    on ? 'bg-brand-solid text-white' : 'bg-border text-foreground',
    first && 'rounded-l-md',
    last && 'rounded-r-md',
  )
}

type ArrowStripItem = {
  id: string
  label: string
  icon?: LucideIcon
  count?: number
  on: boolean
  done?: boolean
  title?: string
  pressed?: boolean
  current?: boolean
}

type ArrowStripProps = {
  items: ArrowStripItem[]
  onSelect: (id: string) => void
  label: string
  minSegment?: number
  /** Hide the icons on phones, where every pixel goes to the labels. */
  compactOnPhone?: boolean
}

/** A row of arrow buttons, e.g. All ⟩ New ⟩ Contacted ⟩ … */
function ArrowStrip({ items, onSelect, label, minSegment = 0, compactOnPhone = false }: ArrowStripProps) {
  const depth = 10
  return (
    <div role="group" aria-label={label} data-no-scroll-indicator className="flex w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item, i) => {
        const first = i === 0
        const last = i === items.length - 1
        const clip = arrowClip(first, last, depth)
        const Icon = item.done ? Check : item.icon
        const style: CSSProperties = {
          clipPath: clip,
          marginLeft: first ? 0 : -(depth - ARROW_GAP),
          paddingLeft: first ? 10 : depth + 5,
          paddingRight: last ? 10 : depth + 3,
          minWidth: minSegment,
          // Each arrow starts at its label's width (so none is cut short) and
          // they share what's left; on a narrow screen the row scrolls.
          flex: '1 0 auto',
        }
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            title={item.title}
            aria-pressed={item.pressed}
            aria-current={item.current ? 'step' : undefined}
            style={style}
            className={cn(
              'group inline-flex items-center justify-center gap-1.5 h-9 md:h-8 text-[12px] font-semibold whitespace-nowrap outline-none',
              arrowShell(item.on, first, last),
              // Steps already done read in the logo blue (phones hide their tick).
              !item.on && item.done && 'text-brand',
            )}
          >
            <ArrowFill clip={clip} first={first} last={last} on={item.on} hover />
            {Icon && <Icon size={13} aria-hidden className={cn('flex-shrink-0', compactOnPhone && 'max-md:hidden')} />}
            <span className="truncate group-focus-visible:underline underline-offset-2">{item.label}</span>
            {item.count != null && <span className="tabular-nums">{item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

type StageFilterProps = {
  value: string
  onChange: (filter: string) => void
  counts: Record<string, number>
}

/** The list view's stage filter: All ⟩ New ⟩ Contacted ⟩ … with counts. */
export function StageFilter({ value, onChange, counts }: StageFilterProps) {
  const items: ArrowStripItem[] = [
    { id: 'all', label: 'All', icon: Layers, count: counts.all ?? 0, on: value === 'all', pressed: value === 'all' },
    ...STAGES.map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon,
      count: counts[s.id] ?? 0,
      on: value === s.id,
      pressed: value === s.id,
      title: s.hint,
    })),
  ]
  return (
    <ArrowStrip
      items={items}
      onSelect={(id) => onChange(id === value ? 'all' : id)}
      label="Filter inquiries by stage"
      minSegment={72}
    />
  )
}

type StagePathProps = {
  inquiry: any
  onMove: (inquiry: any, stage: string) => void
}

/**
 * The detail panel's stage path: the current step filled with the logo blue,
 * steps already done ticked in blue; then Won / Lost. One click moves the inquiry.
 */
export function StagePath({ inquiry, onMove }: StagePathProps) {
  const stage = stageOf(inquiry)
  const decided = stage === 'won' || stage === 'lost'
  const at = decided ? PATH_STAGES.length : PATH_STAGES.indexOf(stage)
  const items: ArrowStripItem[] = PATH_STAGES.map((id, i) => ({
    id,
    label: STAGE_BY_ID[id].label,
    icon: STAGE_BY_ID[id].icon,
    on: i === at,
    done: i < at,
    current: i === at,
    title: i === at ? `Now: ${STAGE_BY_ID[id].hint}` : `Move to ${STAGE_BY_ID[id].label}`,
  }))
  const outcome = (id: 'won' | 'lost') => {
    const on = stage === id
    const Icon = on ? Check : STAGE_BY_ID[id].icon
    const tone = id === 'won'
      ? on ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20'
      : on ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20'
    return (
      <button
        type="button"
        onClick={() => onMove(inquiry, id)}
        aria-pressed={on}
        className={cn('inline-flex items-center justify-center gap-1.5 h-9 md:h-8 rounded-md border text-[12px] font-semibold transition-colors', tone)}
      >
        <Icon size={13} aria-hidden />
        {on ? STAGE_BY_ID[id].label : `Mark as ${id}`}
      </button>
    )
  }
  return (
    <div className="space-y-2">
      <ArrowStrip items={items} onSelect={(id) => onMove(inquiry, id)} label="Stage" minSegment={56} compactOnPhone />
      <div className="grid grid-cols-2 gap-2">
        {outcome('won')}
        {outcome('lost')}
      </div>
    </div>
  )
}

// ── Photos ────────────────────────────────────────────────────────

type PhotoThumbProps = {
  images: any
}

/** A list row's first photo (with the count when there are more), or an empty frame. */
export function PhotoThumb({ images }: PhotoThumbProps) {
  const photos = photosOf(images)
  const [failed, setFailed] = useState(false)
  if (photos.length === 0 || failed) {
    return (
      <span
        title={failed ? 'Photo unavailable' : 'No photos sent'}
        className="h-10 w-10 flex-shrink-0 rounded-md border border-dashed border-border inline-flex items-center justify-center text-foreground"
      >
        <ImageOff size={14} role="img" aria-label={failed ? 'Photo unavailable' : 'No photos sent'} />
      </span>
    )
  }
  return (
    <span className="relative h-10 w-10 flex-shrink-0 rounded-md overflow-hidden border border-border">
      <img src={photos[0].url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      {photos.length > 1 && (
        <span className="absolute bottom-0 right-0 px-1 rounded-tl bg-black/65 text-white text-[9px] font-semibold tabular-nums leading-[14px]">
          {photos.length}
        </span>
      )}
    </span>
  )
}

type CardCoverProps = {
  images: any
}

// A card's first photo across its top, or a short empty frame.
function CardCover({ images }: CardCoverProps) {
  const photos = photosOf(images)
  const [failed, setFailed] = useState(false)
  if (photos.length === 0 || failed) {
    return (
      <div className="-mx-3 -mt-3 mb-2.5 h-12 flex items-center justify-center gap-1.5 border-b border-dashed border-border text-[11px] text-foreground">
        <ImageOff size={13} aria-hidden />
        {failed ? 'Photo unavailable' : 'No photos sent'}
      </div>
    )
  }
  return (
    <div className="relative -mx-3 -mt-3 mb-2.5 h-28 overflow-hidden rounded-t-[5px] border-b border-border">
      <img src={photos[0].url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      {photos.length > 1 && (
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-semibold tabular-nums">
          {photos.length} photos
        </span>
      )}
    </div>
  )
}

type PhotoGalleryProps = {
  images: any
  empty?: string
}

/** The detail panel's photos: a grid that opens a full-screen viewer. */
export function PhotoGallery({ images, empty = 'No photos sent' }: PhotoGalleryProps) {
  const photos = photosOf(images)
  const [open, setOpen] = useState<number | null>(null)
  if (photos.length === 0) {
    return (
      <div className="m-3 h-24 rounded-md border border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-[11px] text-foreground">
        <ImageOff size={16} aria-hidden />
        {empty}
      </div>
    )
  }
  return (
    <div className="p-3">
      <div className="grid grid-cols-3 gap-2">
        {photos.map((img, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setOpen(idx)}
            aria-label={`Open photo ${idx + 1} of ${photos.length}`}
            className="relative aspect-square rounded-md overflow-hidden border border-border bg-card hover:opacity-90 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <img
              src={img.url}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
            />
          </button>
        ))}
      </div>
      <AnimatePresence>
        {open != null && <PhotoViewer key="viewer" photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  )
}

type PhotoViewerProps = {
  photos: { url: string }[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}

// Full screen, one photo at a time: arrows or swipe to step, Esc to close.
function PhotoViewer({ photos, index, onIndex, onClose }: PhotoViewerProps) {
  const count = photos.length
  const url = photos[index]?.url
  const step = useCallback((d: number) => onIndex((index + d + count) % count), [index, count, onIndex])
  const closeRef = useRef<HTMLButtonElement>(null)
  const swipeFrom = useRef<number | null>(null)
  // A swipe ends with a click, which would otherwise close the viewer.
  const swiped = useRef(false)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && count > 1) step(1)
      else if (e.key === 'ArrowLeft' && count > 1) step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count, step, onClose])

  const onPointerDown = (e: ReactPointerEvent) => { swipeFrom.current = e.clientX }
  const onPointerUp = (e: ReactPointerEvent) => {
    const from = swipeFrom.current
    swipeFrom.current = null
    if (from == null || count < 2) return
    const dx = e.clientX - from
    if (Math.abs(dx) > 50) {
      swiped.current = true
      step(dx < 0 ? 1 : -1)
    }
  }
  const onAreaClick = (e: ReactMouseEvent) => {
    if (!swiped.current) return
    swiped.current = false
    e.stopPropagation()
  }

  const navButton = 'absolute top-1/2 -translate-y-1/2 h-12 w-12 inline-flex items-center justify-center rounded-md text-white hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white/60'

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${count}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={onClose}
    >
      <div className="flex-shrink-0 flex items-center justify-between h-14 px-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="pl-1 text-[13px] font-semibold tabular-nums">{index + 1} / {count}</span>
        <div className="flex items-center gap-1">
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-semibold hover:bg-white/10"
          >
            <ExternalLink size={14} aria-hidden /> Open original
          </a>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            <X size={18} />
          </button>
        </div>
      </div>
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-4 pb-4 md:px-16 touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onAreaClick}
      >
        <motion.img
          key={url}
          src={url}
          alt=""
          draggable={false}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full object-contain rounded-md select-none"
        />
        {count > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); step(-1) }} aria-label="Previous photo" className={cn(navButton, 'left-1 md:left-3')}>
              <ChevronLeft size={28} />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); step(1) }} aria-label="Next photo" className={cn(navButton, 'right-1 md:right-3')}>
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}

// ── Board ─────────────────────────────────────────────────────────

type PipelineCardProps = {
  name: string
  createdAt: string
  stage: string
  images: any
  title: ReactNode
  subtitle?: ReactNode
  tag?: ReactNode
  hasPhone?: boolean
  /** Under the rest, e.g. the latest note and the follow-up date. */
  footer?: ReactNode
}

/** What a board card shows: the first photo, who, what, a mark when there's a phone number, then `footer`. */
export function PipelineCard({ name, createdAt, stage, images, title, subtitle, tag, hasPhone, footer }: PipelineCardProps) {
  // A new inquiry nobody has answered for a day turns its age amber.
  const overdue = stage === 'new' && !isWithinDays(createdAt, 1)
  return (
    <>
      <CardCover images={images} />
      <div className="flex items-center gap-2 min-w-0">
        <InitialsAvatar name={name} size="sm" />
        <p className="flex-1 min-w-0 text-[13px] font-semibold text-foreground truncate">{name}</p>
        <span
          title={overdue ? 'Waiting over a day for a first reply' : undefined}
          className={cn(
            'text-[11px] tabular-nums flex-shrink-0',
            overdue ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-foreground',
          )}
        >
          {timeAgo(createdAt)}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-foreground truncate">{title}</p>
      {subtitle && <p className="text-[11px] text-foreground truncate">{subtitle}</p>}
      {(tag || hasPhone) && (
        <div className="mt-2 flex items-center gap-2 text-foreground">
          <span className="flex-1 min-w-0 text-[11px] font-semibold truncate">{tag}</span>
          {hasPhone && <Phone size={12} role="img" aria-label="Has a phone number" className="flex-shrink-0" />}
        </div>
      )}
      {footer}
    </>
  )
}

/** Lane-shaped placeholders while the board loads. */
export function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex-1 min-w-[244px] max-md:flex-none max-md:w-[84vw] max-md:max-w-[320px] space-y-2">
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ))}
    </div>
  )
}

const CARD_SHELL = 'block w-full text-left rounded-md border bg-card p-3 overflow-hidden select-none [-webkit-touch-callout:none]'

// Under the pointer first (precise with a mouse or finger), else the most overlapped lane.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

type KanbanBoardProps = {
  items: any[]
  /** The lanes to show, in order (stage ids). */
  stages: string[]
  selectedId: any
  onOpen: (id: any) => void
  onMove: (item: any, stage: string) => void
  renderCard: (item: any) => ReactNode
  nameOf: (item: any) => string
}

export function KanbanBoard({ items, stages, selectedId, onOpen, onMove, renderCard, nameOf }: KanbanBoardProps) {
  const phone = useIsPhone()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold to pick a card up, so a quick swipe still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  )
  const [activeId, setActiveId] = useState(null)
  // A drag ends with a mouseup over the card, which would also open it.
  const justDragged = useRef(false)

  const lanes = useMemo(() => {
    const byStage = Object.fromEntries(stages.map((s) => [s, []]))
    for (const item of items) byStage[stageOf(item)]?.push(item)
    return byStage
  }, [items, stages])
  const active = activeId == null ? null : items.find((i) => i.id === activeId) || null
  const opened = selectedId == null ? null : items.find((i) => i.id === selectedId) || null
  const openedStage = opened ? stageOf(opened) : null

  const itemName = (id) => {
    const item = items.find((i) => i.id === id)
    return item ? nameOf(item) : 'inquiry'
  }
  const stageName = (id) => STAGE_BY_ID[id]?.label || 'a stage'
  const announcements = {
    onDragStart: ({ active: a }) => `Picked up ${itemName(a.id)}.`,
    onDragOver: ({ over }) => (over ? `Over ${stageName(over.id)}.` : 'Not over a stage.'),
    onDragEnd: ({ active: a, over }) => (over ? `Moved ${itemName(a.id)} to ${stageName(over.id)}.` : `Put ${itemName(a.id)} back.`),
    onDragCancel: ({ active: a }) => `Put ${itemName(a.id)} back.`,
  }

  const onDragStart = ({ active: a }: DragStartEvent) => {
    justDragged.current = true
    setActiveId(a.id)
  }
  const finish = () => {
    setActiveId(null)
    setTimeout(() => { justDragged.current = false }, 0)
  }
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    finish()
    const item = items.find((i) => i.id === a.id)
    if (item && over && over.id !== stageOf(item)) onMove(item, String(over.id))
  }

  // Lanes scroll inside themselves, leaving room for the app header, the
  // lane arrows and (on phones) the bottom tabs.
  const laneHeight = `calc(100dvh - ${phone ? 310 : 250}px)`

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
      accessibility={{ announcements }}
    >
      <div
        className={cn(
          'flex overflow-x-auto pb-2 max-md:-mx-4 max-md:px-4 max-md:scroll-px-4',
          // Snap lane by lane on phones, but not mid-drag, where it fights the auto-scroll.
          !active && 'max-md:snap-x max-md:snap-mandatory',
        )}
      >
        {stages.map((id, i) => (
          <Lane
            key={id}
            stage={STAGE_BY_ID[id]}
            count={lanes[id].length}
            first={i === 0}
            last={i === stages.length - 1}
            current={!active && openedStage === id}
            dragging={!!active}
            maxHeight={laneHeight}
          >
            {lanes[id].map((item) => (
              <DraggableCard
                key={item.id}
                id={item.id}
                selected={selectedId === item.id}
                onOpen={() => { if (!justDragged.current) onOpen(item.id) }}
              >
                {renderCard(item)}
              </DraggableCard>
            ))}
          </Lane>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className={cn(CARD_SHELL, 'border-brand/50 shadow-xl rotate-[1.5deg] cursor-grabbing')}>
            {renderCard(active)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// Lanes sit LANE_GAP apart; each lane's arrow reaches across the gap so its
// point sits in the next arrow's notch.
const LANE_GAP = 12
const LANE_ARROW = 14
// Arrow text lines up with the text on the cards below (lane and card padding).
const LANE_TEXT_INSET = 20

type LaneProps = {
  stage: Stage
  count: number
  first: boolean
  last: boolean
  /** Holds the inquiry open in the detail panel. */
  current: boolean
  dragging: boolean
  maxHeight: string
  children: ReactNode
}

function Lane({ stage, count, first, last, current, dragging, maxHeight, children }: LaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const on = isOver || current
  const clip = arrowClip(first, last, LANE_ARROW)
  const reach = last ? 0 : LANE_GAP + LANE_ARROW - ARROW_GAP
  const arrowStyle: CSSProperties = {
    clipPath: clip,
    marginRight: -reach,
    paddingLeft: LANE_TEXT_INSET,
    paddingRight: reach + LANE_TEXT_INSET,
  }
  const Icon = stage.icon
  return (
    <section
      aria-label={`${stage.label}: ${count}`}
      className={cn(
        'flex flex-col min-w-0 md:flex-1 md:min-w-[244px] max-md:flex-none max-md:w-[84vw] max-md:max-w-[320px] max-md:snap-start',
        !last && 'pr-3',
      )}
    >
      <header
        style={arrowStyle}
        className={cn('h-[52px] flex flex-col justify-center', arrowShell(on, first, last))}
      >
        <ArrowFill clip={clip} first={first} last={last} on={on} />
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 min-w-0 text-[13px] font-semibold">
            <Icon size={14} aria-hidden className="flex-shrink-0" />
            <span className="truncate">{stage.label}</span>
          </h3>
          <span className="text-[13px] font-semibold tabular-nums">{count}</span>
        </div>
        <p className="text-[11px] truncate">{stage.hint}</p>
      </header>
      <div
        ref={setNodeRef}
        style={{ maxHeight }}
        className={cn(
          'mt-2 flex-1 min-h-[180px] overflow-y-auto overscroll-contain rounded-md border p-2 space-y-2 transition-colors duration-150',
          isOver
            ? 'border-brand bg-brand/10'
            : dragging
              ? 'border-dashed border-brand/50 bg-brand/[0.04]'
              : 'border-border bg-brand/[0.03] dark:bg-white/[0.03]',
        )}
      >
        {children}
        {count === 0 && (
          <p className="py-8 text-center text-[11px] text-foreground">{dragging ? 'Drop here' : 'Nothing here yet'}</p>
        )}
      </div>
    </section>
  )
}

type DraggableCardProps = {
  id: any
  selected: boolean
  onOpen: () => void
  children: ReactNode
}

function DraggableCard({ id, selected, onOpen, children }: DraggableCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id })
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      onClick={onOpen}
      data-selected={selected || undefined}
      className={cn(
        CARD_SHELL,
        'shadow-sm cursor-grab touch-manipulation transition-[border-color,box-shadow,opacity] duration-150',
        'outline-none focus-visible:ring-2 focus-visible:ring-brand/40 hover:shadow-md',
        selected ? 'border-brand ring-1 ring-brand' : 'border-border hover:border-brand/40',
        isDragging && 'opacity-40',
      )}
    >
      {children}
    </button>
  )
}
