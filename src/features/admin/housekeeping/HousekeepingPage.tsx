// src/features/admin/housekeeping/HousekeepingPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2,
  Sparkles, AlertTriangle, Camera,
  ChevronRight, ChevronLeft, Clock,
  Image as ImageIcon, Shirt, Wallet, Send, Coffee,
  ZoomIn, RotateCcw, CheckCircle2, Lock,
  Calendar as CalendarIcon, Copy, DoorOpen, FileText, TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/api/auditLog'
import { cn, sanitizeText, sanitizeMoney, sanitizeDateOnly, CLEANING_WINDOW, STAY_TIMES } from '@/lib/utils'
import {
  listCleanings, createCleaning, updateCleaning, deleteCleaning,
  addPhotosToCleaning, removePhotoFromCleaning,
  uploadCleaningPhoto, deleteCleaningPhoto,
  parseInventory, approveAndPayCleaning, updateLaundryPayment,
  getSignedUrl, getSignedUrls,
  purgeCleaningPhotos,
} from '@/lib/api/cleanings'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { SortHeader, nextSort, ResultsBar, SearchKeyHint, useListShortcuts, CARD_ON_PHONE, MobileSort, useSidePanelMotion, useListCap } from '@/components/crm/listTools'
import { Panel, PanelHeader, InitialsAvatar } from '@/components/crm/Panel'
import { QueueColumn, QueueRow, WithDot, useNow, useLocalToday, formatSpan, formatClock, localISODate } from '@/components/crm/WorkQueue'
import { stayMoment, guestState, hasGuestLeft } from '@/lib/domain/stay'
import { StatStrip, StatTile } from '@/components/crm/StatStrip'
import { StatusTabs } from '@/components/crm/StatusTabs'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Code } from '@/components/common/Code'
import { crmLink, findContractForCleaning } from '@/lib/domain/crmLinks'
import { DatePicker } from '@/components/crm/DatePicker'

const BRAND = 'var(--brand-solid)'
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'

// Cleaning status is a state machine. Prevents moving backward
// from "completed" or skipping the submit → approve flow.
const VALID_CLEANING_TRANSITIONS = {
  scheduled: ['ready', 'cancelled'],
  ready:     ['submitted', 'cancelled'],
  submitted: ['completed', 'ready'],
  completed: [],
  cancelled: [],
}

function canCleaningTransition(from, to) {
  if (from === to) return true
  const allowed = VALID_CLEANING_TRANSITIONS[from] || []
  return allowed.includes(to)
}

async function defensivePhotoCleanup(cleanings) {
  const candidates = (cleanings || []).filter((c) => {
    if (c.status !== 'completed') return false
    const hasArr =
      (Array.isArray(c.photos_before) && c.photos_before.length > 0) ||
      (Array.isArray(c.photos_after)  && c.photos_after.length  > 0) ||
      (Array.isArray(c.photos_report) && c.photos_report.length > 0)
    const hasSingle =
      c.amenities_used_photo ||
      c.amenities_replaced_photo ||
      c.laundry_used_photo ||
      c.laundry_replaced_photo
    return hasArr || hasSingle
  })

  if (candidates.length === 0) return

  console.warn(`defensivePhotoCleanup: ${candidates.length} completed cleaning(s) still hold photos. Purging…`)

  for (const c of candidates) {
    try {
      await purgeCleaningPhotos(c.id)
      logAudit('DEFENSIVE_PURGE_CLEANING_PHOTOS', 'cleanings', c.id, {}).catch(() => {})
    } catch (err) {
      console.warn(`Failed to purge photos for ${c.cleaning_code}:`, err)
    }
  }
}

function getEffectiveStatus(cleaning) {
  if (cleaning.status === 'completed') return 'completed'
  if (cleaning.status === 'cancelled') return 'cancelled'
  if (cleaning.status === 'submitted') return 'to-be-evaluated'
  if (!cleaning.bookings?.check_out) return 'ready'
  // Ready once the guest has left: confirmed in Bookings, or their check-out day is over.
  return hasGuestLeft(cleaning.bookings) ? 'ready' : 'scheduled'
}

function isPendingEvaluation(cleaning) {
  return cleaning.status === 'submitted'
}

const TYPE_TEXT = {
  basic: { label: 'Basic', className: 'text-blue-600 dark:text-blue-400' },
  deep:  { label: 'Deep',  className: 'text-purple-600 dark:text-purple-400' },
}

const STATUS_TEXT = {
  scheduled:         { label: 'Scheduled',        className: 'text-amber-600 dark:text-amber-400' },
  ready:             { label: 'Ready',            className: 'text-blue-600 dark:text-blue-400' },
  'to-be-evaluated': { label: 'To Be Evaluated',  className: 'text-fuchsia-600 dark:text-fuchsia-400' },
  completed:         { label: 'Completed',        className: 'text-emerald-600 dark:text-emerald-400' },
  cancelled:         { label: 'Cancelled',        className: 'text-red-600 dark:text-red-400' },
}

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'ready', label: 'Ready' },
  { id: 'to-be-evaluated', label: 'To be evaluated' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

const PHOTO_LIMITS = { before: 15, after: 15, report: 10 }
const MAX_NOTE_LEN = 2000
const MAX_METHOD_LEN = 60
const MAX_REFERENCE_LEN = 100

// Sortable columns: the value each one sorts by, and the direction a fresh
// click starts in. Unassigned cleanings sort first by housekeeper.
const CLEANING_STATUS_ORDER = ['to-be-evaluated', 'ready', 'scheduled', 'completed', 'cancelled']
const CLEANING_SORT_VALUE = {
  code:        (c) => c.cleaning_code || '',
  booking:     (c) => c.bookings?.booking_code || '',
  type:        (c) => c.type || '',
  housekeeper: (c) => c.housekeepers?.name || '',
  scheduled:   (c) => c.scheduled_date || '',
  status:      (c) => CLEANING_STATUS_ORDER.indexOf(getEffectiveStatus(c)),
}
const CLEANING_SORT_DEFAULT_DIR = { scheduled: 'desc' }

const ROW_GRID = `grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_150px] gap-4 items-center ${CARD_ON_PHONE}`
const PANEL_WIDTH = 480

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function computeNightsFromBooking(booking) {
  if (!booking?.check_in || !booking?.check_out) return 0
  const a = new Date(booking.check_in); a.setHours(0, 0, 0, 0)
  const b = new Date(booking.check_out); b.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}
function formatMoney(n) {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function timeAgo(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const diffMs = Date.now() - then
  if (diffMs < 0) return 'just now'
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

type WorkerAvatarProps = {
  name: any
  photo_url: any
  size?: string
}

// Plain initials on white, as on the Dashboard.
function WorkerAvatar({ name, photo_url, size = 'md' }: WorkerAvatarProps) {
  return <InitialsAvatar name={name} photoUrl={photo_url} size={['xs', 'sm', 'lg'].includes(size) ? size : 'md'} />
}

function useSignedUrls(photos) {
  const paths = useMemo(
    () => (photos || []).map((p) => p?.path).filter(Boolean),
    [photos],
  )
  const key = paths.join('|')
  const [map, setMap] = useState({})

  useEffect(() => {
    let cancelled = false
    if (paths.length === 0) { setMap({}); return }
    getSignedUrls(paths)
      .then((m) => { if (!cancelled) setMap(m) })
      .catch((err) => {
        console.error('Signed URL fetch failed:', err)
        if (!cancelled) toast.error('Failed to load photos')
      })
    return () => { cancelled = true }
  }, [key])

  return map
}

function useSignedUrl(photo) {
  const path = photo?.path || null
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!path) { setUrl(null); return }
    getSignedUrl(path)
      .then((u) => { if (!cancelled) setUrl(u) })
      .catch((err) => {
        console.error('Signed URL fetch failed:', err)
        if (!cancelled) toast.error('Failed to load photo')
      })
    return () => { cancelled = true }
  }, [path])

  return url
}

type PhotoLightboxProps = {
  photos: any
  initialIndex: any
  onClose: () => void
}

function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex || 0)
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)

  const paths = useMemo(() => (photos || []).map((p) => p?.path).filter(Boolean), [photos])
  const total = paths.length

  useEffect(() => {
    let cancelled = false
    if (paths.length === 0) { setUrls({}); setLoading(false); return }
    setLoading(true)
    getSignedUrls(paths)
      .then((m) => { if (!cancelled) { setUrls(m); setLoading(false) } })
      .catch((err) => {
        console.error('Lightbox URL fetch failed:', err)
        if (!cancelled) { setLoading(false); toast.error('Failed to load photos') }
      })
    return () => { cancelled = true }
  }, [paths.join('|')])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % total)
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + total) % total)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [total, onClose])

  if (total === 0) return null

  const currentPath = paths[index]
  const currentUrl = urls[currentPath]

  const goPrev = () => setIndex((i) => (i - 1 + total) % total)
  const goNext = () => setIndex((i) => (i + 1) % total)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[10001] bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      {total > 1 && (
        <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-semibold tabular-nums">
          {index + 1} / {total}
        </div>
      )}

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Previous photo"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Next photo"
        >
          <ChevronRight size={24} />
        </button>
      )}

      <div
        className="relative max-w-[92vw] max-h-[88vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !currentUrl ? (
          <div className="w-[60vw] max-w-[600px] aspect-[4/3] rounded-lg bg-white/5 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
          </div>
        ) : (
          <motion.img
            key={currentPath}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            src={currentUrl}
            alt=""
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
          />
        )}
      </div>

      {total > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[90vw] flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-white/10 backdrop-blur-sm overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {paths.map((p, i) => {
            const thumbUrl = urls[p]
            return (
              <button
                key={p}
                type="button"
                onClick={() => setIndex(i)}
                className={cn(
                  'flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-colors',
                  i === index ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                )}
              >
                {thumbUrl ? (
                  <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/10" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

type TypeTextProps = {
  type: any
}

function TypeText({ type }: TypeTextProps) {
  const config = TYPE_TEXT[type] || TYPE_TEXT.basic
  return <span className={cn('text-[12px] font-semibold capitalize', config.className)}>{config.label}</span>
}

type StatusTextProps = {
  cleaning: any
}

function StatusText({ cleaning }: StatusTextProps) {
  const effective = getEffectiveStatus(cleaning)
  const config = STATUS_TEXT[effective] || STATUS_TEXT.scheduled
  return <span className={cn('text-[12px] font-semibold', config.className)}>{config.label}</span>
}

type SummaryCardsProps = {
  cleanings: any
  active: string
  onSelect: (...args: any[]) => any
}

// KPI strip as on the Dashboard. The tiles follow a cleaning's stages
// (guest still in → guest left → submitted) and filter the list below.
function SummaryCards({ cleanings, active, onSelect }: SummaryCardsProps) {
  const stats = useMemo(() => {
    let scheduled = 0, ready = 0, toBeEvaluated = 0
    for (const c of cleanings) {
      const s = getEffectiveStatus(c)
      if (s === 'scheduled') scheduled++
      else if (s === 'ready') ready++
      else if (s === 'to-be-evaluated') toBeEvaluated++
    }
    return { total: cleanings.length, scheduled, ready, toBeEvaluated }
  }, [cleanings])

  const pick = (id) => onSelect(active === id ? 'all' : id)

  return (
    <StatStrip cols={4}>
      <StatTile icon={Sparkles} label="Total cleanings" value={stats.total} sub="All cleanings" active={active === 'all'} onClick={() => onSelect('all')} />
      <StatTile icon={Clock} label="Scheduled" value={stats.scheduled} sub="Guest still in the unit" active={active === 'scheduled'} onClick={() => pick('scheduled')} />
      <StatTile icon={DoorOpen} label="Ready to clean" value={stats.ready} sub="Guest has left" active={active === 'ready'} onClick={() => pick('ready')} />
      <StatTile
        icon={AlertTriangle}
        label="To be evaluated"
        value={stats.toBeEvaluated}
        sub={stats.toBeEvaluated > 0 ? 'Waiting for your review' : 'All reviewed'}
        attention={stats.toBeEvaluated > 0}
        active={active === 'to-be-evaluated'}
        onClick={() => pick('to-be-evaluated')}
      />
    </StatStrip>
  )
}

type QueueVariant = 'overdue' | 'due' | 'pending' | 'completed'

function formatDayShort(d) {
  if (!d) return '—'
  const date = new Date(`${String(d).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function photoCount(cleaning) {
  const n = (a) => (Array.isArray(a) ? a.length : 0)
  return n(cleaning.photos_before) + n(cleaning.photos_after) + n(cleaning.photos_report)
}

const clockOf = (d: Date) => formatClock(d.getHours(), d.getMinutes())

/** The next guest checking in to a cleaning's unit after its guest leaves. */
type Arrival = { code: string; at: Date }

// When the unit started waiting to be cleaned: when the guest left (confirmed
// in Bookings, or their check-out day is over), or for a cleaning without a
// booking, its day at check-out time. Null while the guest is still in.
function waitingSince(cleaning, now: number): Date | null {
  if (!cleaning.bookings?.check_out) return stayMoment(cleaning.scheduled_date, STAY_TIMES.checkOut)
  const state = guestState(cleaning.bookings, now)
  return state.kind === 'left' ? state.at : null
}

// Overdue once the guest has left and the cleaning's day is over with the
// unit still not cleaned. On its own day it stays in Due today until the
// housekeeper submits, even past the next guest's check-in (shown in red).
// A check-out nobody has confirmed doesn't count yet.
function isOverdue(cleaning, now: number, today: string) {
  if (!waitingSince(cleaning, now)) return false
  const day = cleaning.scheduled_date || String(cleaning.bookings?.check_out || '').slice(0, 10)
  return !!day && day < today
}

// Due today: still in, waiting for confirmation, ready since this morning, first by urgency.
const DUE_ORDER = { left: 0, unconfirmed: 1, staying: 2, none: 3 }

// The big value at the start of a row: how long the unit has waited since
// the guest left, how long until they leave, how long it has waited for
// review, or when it was done.
function queueLead(cleaning, variant: QueueVariant, now: number, arrival: Arrival | null) {
  if (variant === 'overdue') {
    const since = waitingSince(cleaning, now)
    return {
      lead: since ? formatSpan(now - since.getTime()) : '—',
      caption: cleaning.bookings ? 'since guest left' : 'late',
      tone: 'text-red-600 dark:text-red-400',
    }
  }
  if (variant === 'due') {
    if (!cleaning.bookings?.check_out) return { lead: 'Today', caption: 'no booking', tone: '' }
    const state = guestState(cleaning.bookings, now)
    if (state.kind === 'staying') {
      return {
        lead: formatSpan(state.due.getTime() - now),
        caption: cleaning.bookings.late_checkout_at ? 'to late check-out' : 'to check-out',
        tone: STATUS_TEXT.scheduled.className,
      }
    }
    if (state.kind === 'unconfirmed') return { lead: clockOf(state.due), caption: 'not confirmed', tone: STATUS_TEXT.scheduled.className }
    if (state.kind === 'left') {
      const nextGuestDue = !!arrival && arrival.at.getTime() <= now
      return {
        lead: formatSpan(now - state.at.getTime()),
        caption: 'since guest left',
        tone: nextGuestDue ? 'text-red-600 dark:text-red-400' : STATUS_TEXT.ready.className,
      }
    }
    return { lead: 'Today', caption: '', tone: '' }
  }
  if (variant === 'pending') {
    const t = Date.parse(cleaning.submitted_at)
    return { lead: Number.isFinite(t) ? formatSpan(now - t) : '—', caption: 'waiting', tone: STATUS_TEXT['to-be-evaluated'].className }
  }
  return { lead: formatDayShort(cleaning.completed_at), caption: timeAgo(cleaning.completed_at) || 'done', tone: '' }
}

type CleaningQueueRowProps = {
  cleaning: any
  variant: QueueVariant
  now: number
  today: string
  arrival: Arrival | null
  onClick: () => void
}

function CleaningQueueRow({ cleaning, variant, now, today, arrival, onClick }: CleaningQueueRowProps) {
  const booking = cleaning.bookings
  const housekeeper = cleaning.housekeepers
  const unit = cleaning.units
  const nights = computeNightsFromBooking(booking)
  const { lead, caption, tone } = queueLead(cleaning, variant, now, arrival)
  const place = [unit?.unit_code, unit?.building].filter(Boolean).join(' · ') || 'No unit'
  const stillIn = !!booking && !waitingSince(cleaning, now)
  const late = booking?.late_checkout_at ? new Date(booking.late_checkout_at) : null
  const arrivesToday = arrival && localISODate(arrival.at) === today

  let asideSub = null
  if (variant === 'overdue') asideSub = arrivesToday ? `Next guest ${clockOf(arrival.at)}` : `Due ${formatDayShort(cleaning.scheduled_date)}`
  else if (variant === 'due') asideSub = arrivesToday ? `Next guest ${clockOf(arrival.at)}` : null
  else if (variant === 'pending') {
    const photos = photoCount(cleaning)
    asideSub = photos > 0 ? `${photos} photo${photos === 1 ? '' : 's'}` : 'No photos'
  } else if (variant === 'completed' && Number(cleaning.payment_amount) > 0) {
    asideSub = formatMoney(cleaning.payment_amount)
  }

  return (
    <QueueRow
      lead={lead}
      leadCaption={caption}
      leadTone={tone}
      label={`Open ${place}, ${cleaning.cleaning_code || 'cleaning'}: ${lead} ${caption}`}
      title={(
        <>
          {place}
          {cleaning.cleaning_code && <span className="ml-2 inline-flex align-middle"><Code value={cleaning.cleaning_code} label="Cleaning code" className="text-[11px]" /></span>}
        </>
      )}
      subtitle={(
        <>
          {housekeeper?.name ? (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <WorkerAvatar name={housekeeper.name} photo_url={housekeeper.photo_url} size="xs" />
              <span className="truncate">{housekeeper.name}</span>
            </span>
          ) : (
            <span className="font-semibold text-amber-600 dark:text-amber-400">Unassigned</span>
          )}
          {booking?.guest_name && <WithDot>{booking.guest_name}</WithDot>}
          {nights > 0 && <WithDot>{nights} night{nights === 1 ? '' : 's'}</WithDot>}
          {stillIn && late && <WithDot><span className="font-semibold">Late check-out {clockOf(late)}</span></WithDot>}
        </>
      )}
      aside={<TypeText type={cleaning.type} />}
      asideSub={asideSub}
      onClick={onClick}
    />
  )
}

type QueueCardProps = {
  /** Cleanings not yet submitted, completed or cancelled. */
  open: any[]
  /** The next guest arriving in each open cleaning's unit, by cleaning id. */
  arrivals: Map<any, Arrival>
  pendingEvaluation: any[]
  completed: any[]
  today: string
  loading: boolean
  onRowClick: (cleaning: any) => void
}

// The 2×2 grid's dividers: a line under the top two, one between the columns.
const QUEUE_CELL = 'border-b border-border last:border-b-0 lg:odd:border-r lg:[&:nth-last-child(-n+2)]:border-b-0'

// What needs doing, most urgent first.
function QueueCard({ open, arrivals, pendingEvaluation, completed, today, loading, onRowClick }: QueueCardProps) {
  // Refreshed every minute: countdowns tick and cleanings turn overdue on time.
  const now = useNow()
  const { overdue, dueToday } = useMemo(() => {
    const overdue = []
    const dueToday = []
    for (const c of open) {
      if (isOverdue(c, now, today)) overdue.push(c)
      else if (c.scheduled_date === today || String(c.bookings?.check_out || '').slice(0, 10) === today) dueToday.push(c)
    }
    // Longest waiting first.
    overdue.sort((a, b) => (waitingSince(a, now)?.getTime() ?? 0) - (waitingSince(b, now)?.getTime() ?? 0))
    const rank = (c) => (c.bookings?.check_out ? DUE_ORDER[guestState(c.bookings, now).kind] : DUE_ORDER.none)
    dueToday.sort((a, b) => rank(a) - rank(b) || String(a.cleaning_code || '').localeCompare(String(b.cleaning_code || '')))
    return { overdue, dueToday }
  }, [open, arrivals, now, today])
  const rows = (list: any[], variant: QueueVariant) =>
    list.map((c) => (
      <CleaningQueueRow key={c.id} cleaning={c} variant={variant} now={now} today={today} arrival={arrivals.get(c.id) || null} onClick={() => onRowClick(c)} />
    ))
  const summary = loading
    ? 'Loading…'
    : `${overdue.length} overdue · ${dueToday.length} due today · ${pendingEvaluation.length} to review`

  return (
    <Panel>
      <PanelHeader icon={Sparkles} title="Work queue" subtitle={summary} />
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <QueueColumn
          className={QUEUE_CELL}
          icon={Clock}
          title="Overdue"
          hint="Not cleaned by the end of its day"
          count={loading ? null : overdue.length}
          countTone="text-red-600 dark:text-red-400"
          loading={loading}
          emptyIcon={CheckCircle2}
          emptyTitle="Nothing overdue"
          emptyText="Every unit the guests have left is clean."
        >
          {rows(overdue, 'overdue')}
        </QueueColumn>
        <QueueColumn
          className={QUEUE_CELL}
          icon={Sparkles}
          title="Due today"
          hint="Clock starts at the confirmed check-out"
          count={loading ? null : dueToday.length}
          loading={loading}
          emptyIcon={CalendarIcon}
          emptyTitle="No cleanings today"
          emptyText="Nothing is scheduled for today."
        >
          {rows(dueToday, 'due')}
        </QueueColumn>
        <QueueColumn
          className={QUEUE_CELL}
          icon={AlertTriangle}
          title="To be evaluated"
          hint="Submitted, waiting for your review"
          count={loading ? null : pendingEvaluation.length}
          countTone={STATUS_TEXT['to-be-evaluated'].className}
          loading={loading}
          emptyIcon={CheckCircle2}
          emptyTitle="All reviewed"
          emptyText="Nothing is waiting for you."
        >
          {rows(pendingEvaluation, 'pending')}
        </QueueColumn>
        <QueueColumn
          className={QUEUE_CELL}
          icon={CheckCircle2}
          title="Completed"
          hint="Approved and paid, newest first"
          count={loading ? null : completed.length}
          loading={loading}
          emptyTitle="None completed yet"
        >
          {rows(completed, 'completed')}
        </QueueColumn>
      </div>
    </Panel>
  )
}

type DetailSectionProps = {
  title: any
  action?: any
  children: ReactNode
}

function DetailSection({ title, action, children }: DetailSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</h4>
        {action}
      </div>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

type ReadOnlyPhotoGridProps = {
  photos: any
  label: string
  onOpenPhoto: any
}

// ─────────────────────────────────────────────────────────────
// Status pills — same shape as Inquiries / Campaigns
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// READ-ONLY PHOTO VIEWS (for completed cleanings)
// ─────────────────────────────────────────────────────────────

function ReadOnlyPhotoGrid({ photos, label, onOpenPhoto }: ReadOnlyPhotoGridProps) {
  const safePhotos = Array.isArray(photos) ? photos : []
  const signedUrls = useSignedUrls(safePhotos)

  if (safePhotos.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card py-4 text-center">
        <ImageIcon size={14} className="text-foreground mx-auto mb-1" />
        <p className="text-[11px] text-foreground italic">No {label.toLowerCase()} photos</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">{label}</p>
        <span className="text-[10px] text-foreground tabular-nums">{safePhotos.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {safePhotos.map((p, i) => {
          const src = signedUrls[p.path]
          return (
            <button
              key={p.path || i}
              type="button"
              onClick={() => src && onOpenPhoto?.(safePhotos, i)}
              disabled={!src}
              className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted cursor-zoom-in disabled:cursor-default group"
            >
              {src ? (
                <>
                  <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                  </div>
                </>
              ) : (
                <Skeleton className="w-full h-full rounded-none" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type ReadOnlySinglePhotoProps = {
  photo: any
  label: string
  onOpenPhoto: any
}

function ReadOnlySinglePhoto({ photo, label, onOpenPhoto }: ReadOnlySinglePhotoProps) {
  const signedUrl = useSignedUrl(photo)

  if (!photo) {
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">{label}</p>
        <div className="w-full aspect-video rounded-md border border-dashed border-border bg-card flex items-center justify-center">
          <ImageIcon size={14} className="text-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">{label}</p>
      <button
        type="button"
        onClick={() => signedUrl && onOpenPhoto?.([photo], 0)}
        disabled={!signedUrl}
        className="w-full aspect-video rounded-md overflow-hidden border border-border bg-muted cursor-zoom-in disabled:cursor-default group"
      >
        {signedUrl ? (
          <>
            <img src={signedUrl} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </>
        ) : (
          <Skeleton className="w-full h-full rounded-none" />
        )}
      </button>
    </div>
  )
}

type ReadOnlyItemsListProps = {
  items: any
  emptyLabel?: string
}

function ReadOnlyItemsList({ items, emptyLabel = 'No items' }: ReadOnlyItemsListProps) {
  const parsed = parseInventory(items)
  if (parsed.length === 0) {
    return <p className="text-[11px] italic text-foreground text-center py-1">{emptyLabel}</p>
  }
  return (
    <div className="space-y-1">
      {parsed.map((it, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-card text-xs">
          <span className="text-foreground truncate">{it.name}</span>
          <span className="text-foreground font-semibold tabular-nums">×{it.quantity}</span>
        </div>
      ))}
    </div>
  )
}

type CompletedReadOnlyPanelProps = {
  cleaning: any
  onOpenPhoto: (photos: any, index: any) => void
}

function CompletedReadOnlyPanel({ cleaning, onOpenPhoto }: CompletedReadOnlyPanelProps) {
  const hasBefore = Array.isArray(cleaning.photos_before) && cleaning.photos_before.length > 0
  const hasAfter = Array.isArray(cleaning.photos_after) && cleaning.photos_after.length > 0
  const hasReport = Array.isArray(cleaning.photos_report) && cleaning.photos_report.length > 0

  const amenitiesUsedItems = parseInventory(cleaning.amenities_used_items)
  const amenitiesReplacedItems = parseInventory(cleaning.amenities_replaced_items)
  const laundryUsedItems = parseInventory(cleaning.laundry_used_items)
  const laundryReplacedItems = parseInventory(cleaning.laundry_replaced_items)

  return (
    <>
      <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-start gap-2">
        <Lock size={14} className="flex-shrink-0 mt-0.5 text-foreground" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Completed · locked
          </p>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            This cleaning has been approved and paid. Records are frozen.
          </p>
        </div>
      </div>

      <DetailSection title="Cleaning Photos">
        <div className="p-3 space-y-3">
          {hasBefore && <ReadOnlyPhotoGrid photos={cleaning.photos_before} label="Before" onOpenPhoto={onOpenPhoto} />}
          {hasAfter && <ReadOnlyPhotoGrid photos={cleaning.photos_after} label="After" onOpenPhoto={onOpenPhoto} />}
          {hasReport && <ReadOnlyPhotoGrid photos={cleaning.photos_report} label="Report" onOpenPhoto={onOpenPhoto} />}
          {!hasBefore && !hasAfter && !hasReport && (
            <p className="text-[11px] italic text-foreground text-center py-2">
              No photos on file
            </p>
          )}
        </div>
      </DetailSection>

      {(amenitiesUsedItems.length > 0 ||
        amenitiesReplacedItems.length > 0 ||
        cleaning.amenities_used_photo ||
        cleaning.amenities_replaced_photo) && (
        <DetailSection title="Amenities">
          <div className="p-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">Used</p>
              <ReadOnlySinglePhoto photo={cleaning.amenities_used_photo} label="Photo" onOpenPhoto={onOpenPhoto} />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.amenities_used_items} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">Replaced</p>
              <ReadOnlySinglePhoto photo={cleaning.amenities_replaced_photo} label="Photo" onOpenPhoto={onOpenPhoto} />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.amenities_replaced_items} />
              </div>
            </div>
          </div>
        </DetailSection>
      )}

      {(laundryUsedItems.length > 0 ||
        laundryReplacedItems.length > 0 ||
        cleaning.laundry_used_photo ||
        cleaning.laundry_replaced_photo) && (
        <DetailSection title="Laundry">
          <div className="p-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">Used</p>
              <ReadOnlySinglePhoto photo={cleaning.laundry_used_photo} label="Photo" onOpenPhoto={onOpenPhoto} />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.laundry_used_items} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">Replaced</p>
              <ReadOnlySinglePhoto photo={cleaning.laundry_replaced_photo} label="Photo" onOpenPhoto={onOpenPhoto} />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.laundry_replaced_items} />
              </div>
            </div>
          </div>
        </DetailSection>
      )}

      {cleaning.notes && (
        <DetailSection title="Notes">
          <div className="p-3">
            <p className="text-xs text-foreground whitespace-pre-wrap break-words">{cleaning.notes}</p>
          </div>
        </DetailSection>
      )}
    </>
  )
}

type PhotoGridProps = {
  cleaning: any
  category: string
  onChanged: any
  onOpenPhoto: any
}

// ─────────────────────────────────────────────────────────────
// EDITABLE COMPONENTS (only shown when NOT completed)
// ─────────────────────────────────────────────────────────────

function PhotoGrid({ cleaning, category, onChanged, onOpenPhoto }: PhotoGridProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const photoKey = category === 'before' ? 'photos_before'
    : category === 'after' ? 'photos_after'
    : 'photos_report'

  const photos = Array.isArray(cleaning[photoKey]) ? cleaning[photoKey] : []
  const limit = PHOTO_LIMITS[category]
  const canUploadMore = photos.length < limit

  const signedUrls = useSignedUrls(photos)

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const remaining = limit - photos.length
    if (files.length > remaining) toast.error(`Max ${limit} photos. ${remaining} slot${remaining === 1 ? '' : 's'} left.`)
    setUploading(true)
    try {
      const toUpload = files.slice(0, remaining)
      await addPhotosToCleaning(cleaning, category, toUpload)
      toast.success(`Uploaded ${toUpload.length} photo${toUpload.length === 1 ? '' : 's'}`)
      onChanged?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async (e, photo) => {
    e.stopPropagation()
    if (!window.confirm('Delete this photo?')) return
    try {
      await removePhotoFromCleaning(cleaning, category, photo.path)
      toast.success('Photo deleted')
      onChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    }
  }

  const openAt = (idx) => onOpenPhoto?.(photos, idx)

  return (
    <div className="space-y-2">
      {photos.length === 0 ? (
        <p className="text-xs text-foreground italic py-2 text-center">No {category} photos</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, idx) => {
            const src = signedUrls[p.path]
            return (
              <button
                key={p.path || idx}
                type="button"
                onClick={() => src && openAt(idx)}
                disabled={!src}
                className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted group cursor-zoom-in disabled:cursor-default text-left"
              >
                {src ? (
                  <>
                    <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </>
                ) : (
                  <Skeleton className="w-full h-full rounded-none" />
                )}
                <button
                  type="button"
                  onClick={(e) => handleRemove(e, p)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <X size={12} />
                </button>
              </button>
            )
          })}
        </div>
      )}
      {canUploadMore && (
        <>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleFiles} disabled={uploading} />
          <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5 w-full" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
            {uploading ? 'Uploading…' : `Add ${category} photo (${photos.length}/${limit})`}
          </Button>
        </>
      )}
    </div>
  )
}

type PhotoSectionProps = {
  cleaning: any
  onChanged: any
  onOpenPhoto: (photos: any, index: any) => void
}

function PhotoSection({ cleaning, onChanged, onOpenPhoto }: PhotoSectionProps) {
  const [tab, setTab] = useState('before')
  const tabs = [
    { id: 'before', label: 'Before', count: (cleaning.photos_before || []).length },
    { id: 'after',  label: 'After',  count: (cleaning.photos_after || []).length },
    { id: 'report', label: 'Report', count: (cleaning.photos_report || []).length },
  ]

  return (
    <DetailSection title="Cleaning Photos">
      <div className="p-2 border-b border-border">
        <StatusTabs
          fill
          tabs={tabs}
          value={tab}
          onChange={setTab}
          counts={Object.fromEntries(tabs.map((t) => [t.id, t.count]))}
          label="Photo set"
        />
      </div>
      <div className="p-3">
        <PhotoGrid cleaning={cleaning} category={tab} onChanged={onChanged} onOpenPhoto={onOpenPhoto} />
      </div>
    </DetailSection>
  )
}

type SinglePhotoCRMProps = {
  cleaning: any
  field: any
  category: any
  label: string
  onChanged: any
  onOpenPhoto: any
}

function SinglePhotoCRM({ cleaning, field, category, label, onChanged, onOpenPhoto }: SinglePhotoCRMProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)
  const existing = cleaning[field] || null
  const signedUrl = useSignedUrl(existing)

  const handleFiles = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const photo = await uploadCleaningPhoto({ cleaningId: cleaning.id, file, category })
      await updateCleaning(cleaning.id, { [field]: photo })
      if (existing?.path) deleteCleaningPhoto(existing.path).catch(() => {})
      toast.success(`${label} photo updated`)
      onChanged?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!existing) return
    if (!window.confirm(`Remove ${label} photo?`)) return
    try {
      await updateCleaning(cleaning.id, { [field]: null })
      if (existing.path) deleteCleaningPhoto(existing.path).catch(() => {})
      toast.success('Photo removed')
      onChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">{label}</p>
        {existing && (
          <button type="button" onClick={handleRemove}
            className="text-[10px] font-semibold uppercase tracking-wider text-red-500 hover:underline">
            Remove
          </button>
        )}
      </div>

      {signedUrl ? (
        <div className="relative aspect-video rounded-md overflow-hidden border border-border bg-muted group">
          <button
            type="button"
            onClick={() => onOpenPhoto?.([existing], 0)}
            className="absolute inset-0 w-full h-full cursor-zoom-in"
          >
            <img src={signedUrl} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
            </div>
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute top-1.5 right-1.5 z-10 px-2 py-1 rounded bg-black/50 hover:bg-black/70 text-white text-[10px] font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
          >
            {uploading ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
            Replace
          </button>
        </div>
      ) : existing ? (
        <div className="w-full aspect-video rounded-md border border-border bg-muted overflow-hidden">
          <Skeleton className="w-full h-full rounded-none" />
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full aspect-video rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-foreground text-[11px] active:bg-muted/50 transition-colors disabled:opacity-50">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {uploading ? 'Uploading…' : 'Add photo'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFiles}
        disabled={uploading}
      />
    </div>
  )
}

type ListEditorCRMProps = {
  items: any
  onChange: (next: any) => Promise<void>
  placeholder?: string
}

function ListEditorCRM({ items, onChange, placeholder = 'Item name' }: ListEditorCRMProps) {
  const parsed = parseInventory(items)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [saving, setSaving] = useState(false)

  const persist = async (next) => {
    setSaving(true)
    try {
      await onChange(next)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    const n = sanitizeText(name, { max: 80 })
    const q = Number(qty) || 0
    if (!n) { toast.error('Enter item name'); return }
    if (q <= 0) { toast.error('Quantity must be > 0'); return }
    if (parsed.length >= 50) { toast.error('Too many items'); return }
    persist([...parsed, { name: n, quantity: q, note: '' }])
    setName(''); setQty('1')
  }

  const handleNameCommit = (i, v) => {
    const cleaned = sanitizeText(v, { max: 80 })
    if (!cleaned || cleaned === parsed[i].name) return
    const next = parsed.map((it, idx) => idx === i ? { ...it, name: cleaned } : it)
    persist(next)
  }
  const handleQtyCommit = (i, v) => {
    const n = Math.max(0, Math.min(9999, Number(v) || 0))
    if (n === parsed[i].quantity) return
    const next = parsed.map((it, idx) => idx === i ? { ...it, quantity: n } : it)
    persist(next)
  }
  const handleRemove = (i) => persist(parsed.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-1.5">
      {parsed.length === 0 ? (
        <p className="text-[11px] italic text-foreground text-center py-1">No items</p>
      ) : (
        parsed.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border border-border">
            <Input
              defaultValue={it.name}
              onBlur={(e) => handleNameCommit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLElement).blur() }}
              maxLength={80}
              className="h-6 text-xs rounded bg-background flex-1 border-transparent hover:border-border"
            />
            <Input
              type="number"
              min={0}
              max={9999}
              defaultValue={it.quantity}
              onBlur={(e) => handleQtyCommit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLElement).blur() }}
              className="h-6 text-xs rounded bg-background w-14 tabular-nums border-transparent hover:border-border"
            />
            <button type="button" onClick={() => handleRemove(i)} disabled={saving}
              className="p-1 rounded hover:bg-red-500/10 text-foreground hover:text-red-500 disabled:opacity-50">
              <Trash2 size={11} />
            </button>
          </div>
        ))
      )}

      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          placeholder={placeholder}
          maxLength={80}
          className="h-6 text-xs rounded bg-background flex-1"
        />
        <Input
          type="number"
          min={1}
          max={9999}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          className="h-6 text-xs rounded bg-background w-14 tabular-nums"
        />
        <Button size="sm" className="h-6 px-2 rounded text-[10px]" onClick={handleAdd} disabled={saving}>
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
        </Button>
      </div>
    </div>
  )
}

type CategoryPairProps = {
  title: string
  Icon: LucideIcon
  cleaning: any
  usedPhotoField: string
  replacedPhotoField: string
  usedItemsField: string
  replacedItemsField: string
  usedCategory: string
  replacedCategory: string
  onChanged: any
  onOpenPhoto: (photos: any, index: any) => void
}

function CategoryPair({ title, Icon, cleaning, usedPhotoField, replacedPhotoField,
  usedItemsField, replacedItemsField, usedCategory, replacedCategory, onChanged, onOpenPhoto }: CategoryPairProps) {

  const handleFieldUpdate = async (field, value) => {
    try {
      await updateCleaning(cleaning.id, { [field]: value })
      onChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save')
      throw err
    }
  }

  return (
    <DetailSection title={title}>
      <div className="p-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">Used</p>
          <SinglePhotoCRM cleaning={cleaning} field={usedPhotoField} category={usedCategory} label="Used" onChanged={onChanged} onOpenPhoto={onOpenPhoto} />
          <div className="mt-2">
            <ListEditorCRM items={cleaning[usedItemsField]} onChange={(next) => handleFieldUpdate(usedItemsField, next)} />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">Replaced</p>
          <SinglePhotoCRM cleaning={cleaning} field={replacedPhotoField} category={replacedCategory} label="Replaced" onChanged={onChanged} onOpenPhoto={onOpenPhoto} />
          <div className="mt-2">
            <ListEditorCRM items={cleaning[replacedItemsField]} onChange={(next) => handleFieldUpdate(replacedItemsField, next)} />
          </div>
        </div>
      </div>
    </DetailSection>
  )
}

type HousekeeperPaymentSectionProps = {
  cleaning: any
  onChanged: any
}

function HousekeeperPaymentSection({ cleaning, onChanged }: HousekeeperPaymentSectionProps) {
  const [amount, setAmount] = useState(cleaning.payment_amount != null ? String(cleaning.payment_amount) : '')
  const [method, setMethod] = useState(cleaning.payment_method || '')
  const [reference, setReference] = useState(cleaning.payment_reference || '')
  const [note, setNote] = useState(cleaning.payment_note || '')
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  useEffect(() => {
    setAmount(cleaning.payment_amount != null ? String(cleaning.payment_amount) : '')
    setMethod(cleaning.payment_method || '')
    setReference(cleaning.payment_reference || '')
    setNote(cleaning.payment_note || '')
  }, [cleaning.id])

  const isCompleted = cleaning.status === 'completed'
  const isPending = cleaning.status === 'submitted'
  const amountOk = Number(amount) > 0
  const methodOk = method.trim().length > 0
  const canApprove = amountOk && methodOk && !isCompleted

  const handleApprove = async () => {
    const amt = sanitizeMoney(amount)
    const cleanMethod = sanitizeText(method, { max: MAX_METHOD_LEN })
    const cleanReference = sanitizeText(reference, { max: MAX_REFERENCE_LEN })
    const cleanNote = sanitizeText(note, { max: MAX_NOTE_LEN, allowNewlines: true })

    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (!cleanMethod) { toast.error('Payment method is required'); return }

    const confirmed = window.confirm(
      `Approve this cleaning and record housekeeper payment?\n\nAmount: ${formatMoney(amt)}\nMethod: ${cleanMethod}\n\nThis will mark the cleaning as completed AND delete all attached photos to free up storage.`
    )
    if (!confirmed) return

    setSaving(true)
    try {
      await approveAndPayCleaning({
        cleaningId: cleaning.id,
        amount: amt,
        method: cleanMethod,
        reference: cleanReference,
        note: cleanNote,
      })
      logAudit('APPROVE_AND_PAY_CLEANING', 'cleanings', cleaning.id, {
        amount: amt, method: cleanMethod,
      }).catch(() => {})

      let purged = { deleted: 0 }
      try {
        purged = await purgeCleaningPhotos(cleaning.id)
        logAudit('PURGE_CLEANING_PHOTOS', 'cleanings', cleaning.id, {
          deleted: purged.deleted,
        }).catch(() => {})
      } catch (purgeErr) {
        console.error('purgeCleaningPhotos failed:', purgeErr)
        toast('Cleaning approved, but photo cleanup failed.', {
          icon: <AlertTriangle size={16} strokeWidth={2.25} className="flex-shrink-0 text-foreground" />,
          style: { borderLeftColor: '#d97706' },
        })
      }

      if (purged.deleted > 0) {
        toast.success(`Cleaning approved · ${purged.deleted} photo${purged.deleted === 1 ? '' : 's'} removed`)
      } else {
        toast.success('Cleaning approved and paid')
      }

      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to approve')
    } finally {
      setSaving(false)
    }
  }

  const handleSendBack = async () => {
    if (!isPending) return
    const confirmed = window.confirm(
      'Send this cleaning back to the housekeeper for corrections?\n\nIt will return to "Ready" status and the housekeeper can resubmit.'
    )
    if (!confirmed) return
    setRejecting(true)
    try {
      await updateCleaning(cleaning.id, { status: 'ready', submitted_at: null })
      logAudit('SEND_BACK_CLEANING', 'cleanings', cleaning.id, {}).catch(() => {})
      toast.success('Sent back to housekeeper')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to send back')
    } finally {
      setRejecting(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded w-full'

  const statusLabel = isCompleted ? 'Paid' : isPending ? 'Pending Evaluation' : 'Not Paid'

  return (
    <DetailSection title={`Housekeeper Payment · ${statusLabel}`}>
      <div className="p-3 space-y-3">
        {isPending && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-card border border-border">
            <Clock size={12} className="text-foreground flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground flex-1">
              Housekeeper submitted this cleaning. Review the photos, then approve or send back for corrections.
            </p>
          </div>
        )}

        {isCompleted && cleaning.paid_at && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground">Paid at</span>
            <span className="text-foreground font-semibold">{formatDateTime(cleaning.paid_at)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Amount (₱) *</label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isCompleted} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Method *</label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} disabled={isCompleted} placeholder="GCash, BPI, Cash…" maxLength={MAX_METHOD_LEN} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Reference</label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={isCompleted} maxLength={MAX_REFERENCE_LEN} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Note</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={isCompleted} maxLength={MAX_NOTE_LEN} rows={2} className="text-xs rounded resize-none w-full" />
        </div>

        {!isCompleted && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" className="h-8 rounded text-xs gap-1.5" variant="outline" onClick={handleSendBack} disabled={!isPending || rejecting || saving}>
              {rejecting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              {rejecting ? 'Sending…' : 'Send Back'}
            </Button>
            <Button size="sm" className="h-8 rounded text-xs gap-1.5 text-white" style={{ backgroundColor: '#059669' }} onClick={handleApprove} disabled={!canApprove || saving || rejecting}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {saving ? 'Processing…' : 'Approve & Pay'}
            </Button>
          </div>
        )}
        {!isCompleted && (!amountOk || !methodOk) && (
          <p className="text-[10px] text-foreground text-center">
            Fill amount and method to enable approval
          </p>
        )}
      </div>
    </DetailSection>
  )
}

type LaundryPaymentSectionProps = {
  cleaning: any
  onChanged: any
}

function LaundryPaymentSection({ cleaning, onChanged }: LaundryPaymentSectionProps) {
  const isCompleted = cleaning.status === 'completed'
  const [amount, setAmount] = useState(cleaning.laundry_payment_amount != null ? String(cleaning.laundry_payment_amount) : '')
  const [method, setMethod] = useState(cleaning.laundry_payment_method || '')
  const [reference, setReference] = useState(cleaning.laundry_payment_reference || '')
  const [note, setNote] = useState(cleaning.laundry_payment_note || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAmount(cleaning.laundry_payment_amount != null ? String(cleaning.laundry_payment_amount) : '')
    setMethod(cleaning.laundry_payment_method || '')
    setReference(cleaning.laundry_payment_reference || '')
    setNote(cleaning.laundry_payment_note || '')
  }, [cleaning.id])

  const hasAmount = Number(amount) > 0
  const hasMethod = method.trim().length > 0
  const canSave = hasAmount && hasMethod && !isCompleted

  const handleSave = async () => {
    if (isCompleted) return
    const amt = sanitizeMoney(amount)
    const cleanMethod = sanitizeText(method, { max: MAX_METHOD_LEN })
    const cleanReference = sanitizeText(reference, { max: MAX_REFERENCE_LEN })
    const cleanNote = sanitizeText(note, { max: MAX_NOTE_LEN, allowNewlines: true })

    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (!cleanMethod) { toast.error('Payment method is required'); return }

    setSaving(true)
    try {
      await updateLaundryPayment({
        cleaningId: cleaning.id,
        amount: amt,
        method: cleanMethod,
        reference: cleanReference,
        note: cleanNote,
      })
      logAudit('UPDATE_LAUNDRY_PAYMENT', 'cleanings', cleaning.id, { amount: amt, method: cleanMethod }).catch(() => {})
      toast.success('Laundry payment saved')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded w-full'
  const hasStoredPayment = cleaning.laundry_paid_at

  const statusLabel = isCompleted
    ? (hasStoredPayment ? 'Paid' : 'Not paid')
    : (hasStoredPayment ? 'Saved' : 'Not Saved')

  if (isCompleted && !hasStoredPayment && !cleaning.laundry_payment_amount) {
    return (
      <DetailSection title={`Laundry Payment · ${statusLabel}`}>
        <div className="p-3">
          <p className="text-xs italic text-foreground text-center py-2">
            No laundry payment was recorded for this cleaning.
          </p>
        </div>
      </DetailSection>
    )
  }

  return (
    <DetailSection title={`Laundry Payment · ${statusLabel}`}>
      <div className="p-3 space-y-3">
        {hasStoredPayment && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground">Paid at</span>
            <span className="text-foreground font-semibold">{formatDateTime(cleaning.laundry_paid_at)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Amount (₱) {!isCompleted && '*'}</label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isCompleted} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Method {!isCompleted && '*'}</label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} disabled={isCompleted} placeholder="GCash, Cash…" maxLength={MAX_METHOD_LEN} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Reference</label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} disabled={isCompleted} maxLength={MAX_REFERENCE_LEN} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Note</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={isCompleted} maxLength={MAX_NOTE_LEN} rows={2} className="text-xs rounded resize-none w-full" />
        </div>

        {!isCompleted && (
          <>
            <Button size="sm" className="h-8 rounded text-xs w-full gap-1.5 text-white" style={{ backgroundColor: BRAND }} onClick={handleSave} disabled={!canSave || saving}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Wallet size={12} />}
              {saving ? 'Saving…' : hasStoredPayment ? 'Update Laundry Payment' : 'Save Laundry Payment'}
            </Button>
            {!canSave && (
              <p className="text-[10px] text-foreground text-center">
                Optional — fill amount and method to save
              </p>
            )}
          </>
        )}
      </div>
    </DetailSection>
  )
}

const emptyNewCleaning = () => ({
  unit_id: '',
  booking_id: '',
  type: 'basic',
  scheduled_date: new Date().toISOString().slice(0, 10),
  housekeeper_id: '',
  notes: '',
})

type NewCleaningModalProps = {
  open: boolean
  onClose: () => void
  onCreated: (signal?: any) => Promise<void>
  units: any
  bookings: any
  housekeepers: any
  contracts: any
}

function NewCleaningModal({ open, onClose, onCreated, units, bookings, housekeepers, contracts }: NewCleaningModalProps) {
  const [form, setForm] = useState(emptyNewCleaning())
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setForm(emptyNewCleaning()) }, [open])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const eligibleUnits = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return units.filter((u) => {
      if (u.status !== 'ACTIVE') return false
      return contracts.some((c) =>
        c.unit_id === u.id &&
        c.effective_date &&
        c.effective_date <= today &&
        (!c.expiry_date || c.expiry_date >= today)
      )
    })
  }, [units, contracts])

  const unitStatus = useMemo(() => {
    if (!form.unit_id) return null
    const hasAny = contracts.some((c) => c.unit_id === form.unit_id)
    if (!hasAny) return 'no_contract'
    const covering = contracts.some((c) =>
      c.unit_id === form.unit_id &&
      c.effective_date &&
      c.effective_date <= form.scheduled_date &&
      (!c.expiry_date || c.expiry_date >= form.scheduled_date)
    )
    return covering ? 'ok' : 'out_of_range'
  }, [form.unit_id, form.scheduled_date, contracts])

  if (!open) return null

  const handleBookingChange = (bookingId) => {
    if (bookingId === '__none__') { setField('booking_id', ''); return }
    const b = bookings.find((x) => x.id === bookingId)
    setForm((p) => ({ ...p, booking_id: bookingId, unit_id: b?.unit_id || p.unit_id }))
  }

  const handleSubmit = async () => {
    if (!form.unit_id) { toast.error('Select a unit'); return }
    const notes = sanitizeText(form.notes, { max: MAX_NOTE_LEN, allowNewlines: true })
    const scheduledDate = sanitizeDateOnly(form.scheduled_date)
    if (!scheduledDate) { toast.error('Set a valid scheduled date'); return }

    if (unitStatus === 'no_contract') {
      toast.error('This unit has no contract. Create a contract before scheduling a cleaning.')
      return
    }
    if (unitStatus === 'out_of_range') {
      toast.error('No contract covers this date. Extend a contract or pick a different date.')
      return
    }

    if (form.booking_id) {
      const b = bookings.find((x) => x.id === form.booking_id)
      if (b) {
        const ci = b.check_in ? String(b.check_in).slice(0, 10) : null
        const co = b.check_out ? String(b.check_out).slice(0, 10) : null
        if (ci && scheduledDate < ci) {
          toast.error(`Scheduled date is before the linked booking starts (${ci}).`)
          return
        }
        if (co && scheduledDate > co) {
          toast.error(`Scheduled date is after the linked booking ends (${co}).`)
          return
        }
      }
    }

    setSaving(true)
    try {
      await createCleaning({
        unit_id: form.unit_id,
        booking_id: form.booking_id || null,
        type: form.type,
        status: 'scheduled',
        scheduled_date: scheduledDate,
        housekeeper_id: form.housekeeper_id || null,
        notes,
      })
      logAudit('CREATE_CLEANING', 'cleanings', null, { unit_id: form.unit_id, type: form.type }).catch(() => {})
      toast.success('Cleaning created')
      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to create')
    } finally { setSaving(false) }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 cursor-default"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-cleaning-title"
        className="relative bg-card rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-border"
        style={{ boxShadow: SOFT_SHADOW }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 id="new-cleaning-title" className="text-sm font-bold text-foreground">New Cleaning</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className={labelClass}>Unit *</label>
            <Select value={form.unit_id} onValueChange={(v) => setField('unit_id', v)}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Select a unit...">
                  {form.unit_id
                    ? (() => { const u = units.find((x) => x.id === form.unit_id); return u ? `${u.building || '—'} — ${u.unit_code || '—'}` : null })()
                    : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {eligibleUnits.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-foreground italic">
                    No units with an active contract
                  </div>
                ) : (
                  eligibleUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.building || '—'} — <span className="font-mono font-bold">{u.unit_code || '—'}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {eligibleUnits.length === 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                Every unit either has no contract or its contract has expired. Create a contract in the Contracts page first.
              </p>
            )}
            {unitStatus === 'no_contract' && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                This unit has no contract at all.
              </p>
            )}
            {unitStatus === 'out_of_range' && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                No contract covers {form.scheduled_date}. Adjust the date or extend a contract.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Linked Booking (optional)</label>
            <Select value={form.booking_id || '__none__'} onValueChange={handleBookingChange}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="No booking (standalone)">
                  {form.booking_id
                    ? (() => { const b = bookings.find((x) => x.id === form.booking_id); return b ? `${b.booking_code} · ${b.guest_name}` : null })()
                    : <span className="text-foreground italic">No booking (standalone)</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs italic text-foreground">No booking (standalone)</SelectItem>
                {bookings.map((b) => <SelectItem key={b.id} value={b.id} className="text-xs"><span className="font-mono font-bold">{b.booking_code}</span> · {b.guest_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <Select value={form.type} onValueChange={(v) => setField('type', v)}>
                <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic" className="text-xs">Basic</SelectItem>
                  <SelectItem value="deep" className="text-xs">Deep</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelClass}>Scheduled date</label>
              <DatePicker value={form.scheduled_date} onChange={(v) => setField('scheduled_date', v)} placeholder="Pick the day" size="sm" clearable={false} ariaLabel="Scheduled date" />
              <p className="text-[10px] text-foreground mt-1">Window: {CLEANING_WINDOW.label}</p>
            </div>
          </div>
          <div>
            <label className={labelClass}>Housekeeper (optional)</label>
            <Select value={form.housekeeper_id || '__none__'} onValueChange={(v) => setField('housekeeper_id', v === '__none__' ? '' : v)}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Unassigned">
                  {form.housekeeper_id
                    ? (() => { const h = housekeepers.find((x) => x.id === form.housekeeper_id); return h ? `${h.name} · ${h.code}` : null })()
                    : <span className="text-foreground italic">Unassigned</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs italic text-foreground">Unassigned</SelectItem>
                {housekeepers.map((h) => <SelectItem key={h.id} value={h.id} className="text-xs">{h.name} · <span className="font-mono font-bold">{h.code}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} maxLength={MAX_NOTE_LEN} rows={2} className="text-xs rounded resize-none" placeholder="Any notes..." />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSubmit} disabled={saving || unitStatus !== 'ok'} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
            {saving ? 'Creating...' : 'Create Cleaning'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

type CleaningDetailPanelProps = {
  cleaning: any
  onClose: () => void
  onChanged: (signal?: any) => Promise<void>
  onDelete: () => Promise<void>
  housekeepers: any
}

function CleaningDetailPanel({ cleaning, onClose, onChanged, onDelete, housekeepers }: CleaningDetailPanelProps) {
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const updateField = async (field, value) => {
    setSaving(true)
    try {
      await updateCleaning(cleaning.id, { [field]: value })
      logAudit(`UPDATE_CLEANING_FIELD:${field}`, 'cleanings', cleaning.id, { field, to: value }).catch(() => {})
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to update')
    } finally { setSaving(false) }
  }

  const openPhoto = useCallback((photos, index) => {
    setLightbox({ photos, index })
  }, [])

  const booking = cleaning.bookings
  const stayNights = computeNightsFromBooking(booking)
  const suggestDeep = stayNights >= 7 && cleaning.type === 'basic'
  const selectedHousekeeper = housekeepers.find((h) => h.id === cleaning.housekeeper_id) || null
  const effective = getEffectiveStatus(cleaning)
  const pendingEvaluation = isPendingEvaluation(cleaning)
  const isCompleted = cleaning.status === 'completed'
  const isCancelled = cleaning.status === 'cancelled'

  const panelMotion = useSidePanelMotion(PANEL_WIDTH)

  return (
    <>
      <motion.div {...panelMotion}>
        <div className="h-full rounded-md border border-border bg-card shadow-lg overflow-hidden flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={cleaning.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="h-full flex flex-col min-h-0"
            >
          <div className="flex-shrink-0 px-5 py-4 line-below">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Code value={cleaning.cleaning_code} label="Cleaning code" className="text-sm" block />
                <p className="text-xs text-foreground mt-0.5 flex items-center gap-1 min-w-0">
                  <Code value={cleaning.units?.unit_code} label="Unit code" className="text-xs" />
                  {cleaning.units?.building && <span className="truncate">· {cleaning.units.building}</span>}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <TypeText type={cleaning.type} />
                  <StatusText cleaning={cleaning} />
                </div>
              </div>
              <button onClick={onClose} className="p-1 rounded hover:bg-muted text-foreground flex-shrink-0"><X size={16} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pendingEvaluation && (
              <div className="rounded-md bg-card border border-border p-3 flex items-start gap-2">
                <Clock size={14} className="text-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">To be evaluated</p>
                  <p className="text-[11px] text-foreground mt-0.5">
                    The housekeeper submitted this cleaning. Review the photos and payment details, then approve or send back.
                  </p>
                </div>
              </div>
            )}

            {isCancelled && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
                <X size={14} className="flex-shrink-0 mt-0.5 text-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                    This cleaning was cancelled
                  </p>
                  <p className="text-[11px] text-red-700/80 dark:text-red-400/80 mt-0.5">
                    Cancelled cleanings are locked and cannot be edited.
                  </p>
                </div>
              </div>
            )}

            <DetailSection title="Overview">
              <div className="p-3 space-y-0.5">
                {booking && (
                  <div className="flex items-center justify-between py-0.5 gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Booking</span>
                    <span className="text-xs text-foreground text-right inline-flex items-center gap-1 min-w-0">
                      <Code value={booking.booking_code} label="Booking code" className="text-xs" />
                      <span className="truncate">· {booking.guest_name}</span>
                    </span>
                  </div>
                )}
                {!booking && (
                  <div className="flex items-center justify-between py-0.5 gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Booking</span>
                    <span className="text-xs italic text-foreground">Standalone (no booking)</span>
                  </div>
                )}
                {suggestDeep && !isCompleted && !isCancelled && (
                  <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border">
                    <AlertTriangle size={12} className="text-foreground flex-shrink-0" />
                    <span className="text-[11px] text-foreground flex-1">{stayNights}-night stay — consider deep clean</span>
                    <button type="button" onClick={() => updateField('type', 'deep')} disabled={saving}
                      className="text-[10px] font-semibold uppercase tracking-wider text-foreground hover:underline disabled:opacity-50">Set Deep</button>
                  </div>
                )}
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">Type</span>
                  <div className="flex-1">
                    <Select value={cleaning.type} onValueChange={(v) => updateField('type', v)} disabled={isCompleted || isCancelled}>
                      <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic" className="text-xs">Basic</SelectItem>
                        <SelectItem value="deep" className="text-xs">Deep</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">Status</span>
                  <div className="flex-1">
                    <Select
                      value={effective}
                      onValueChange={(v) => {
                        if (isCompleted || isCancelled) return
                        const targetStatus = v === 'to-be-evaluated' ? 'submitted' : v
                        if (!canCleaningTransition(effective, targetStatus)) {
                          toast.error(
                            `Cannot move a cleaning from "${effective}" to "${v}". ` +
                            `Approve & Pay is the only way to complete a submitted cleaning.`
                          )
                          return
                        }
                        if (v === 'completed') updateField('status', 'completed')
                        else if (v === 'ready') {
                          if (cleaning.status === 'submitted') {
                            updateCleaning(cleaning.id, { status: 'ready', submitted_at: null })
                              .then(() => { logAudit('UPDATE_CLEANING_FIELD:status', 'cleanings', cleaning.id, { field: 'status', to: 'ready' }).catch(() => {}); onChanged() })
                              .catch((err) => toast.error(err?.message || 'Failed to update'))
                          } else {
                            updateField('status', 'ready')
                          }
                        }
                        else if (v === 'to-be-evaluated') updateField('status', 'submitted')
                        else if (v === 'cancelled') updateField('status', 'cancelled')
                        else updateField('status', 'scheduled')
                      }}
                      disabled={isCompleted || isCancelled}
                    >
                      <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['scheduled', 'ready', 'to-be-evaluated', 'completed', 'cancelled'].map((s) => {
                          const statusKey = s === 'to-be-evaluated' ? 'submitted' : s
                          const allowed = canCleaningTransition(effective, statusKey)
                          const label = s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                          return (
                            <SelectItem key={s} value={s} className="text-xs" disabled={!allowed}>
                              {label}{!allowed ? ' — not allowed' : ''}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">Scheduled</span>
                  <DatePicker value={cleaning.scheduled_date || ''} onChange={(v) => updateField('scheduled_date', sanitizeDateOnly(v))} disabled={isCompleted || isCancelled} size="sm" placeholder="—" clearable={false} ariaLabel="Scheduled date" className="flex-1 min-w-0" />
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">Window</span>
                  <span className="text-xs text-foreground">{CLEANING_WINDOW.label}</span>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">Submitted</span>
                  <span className="text-xs tabular-nums text-foreground">
                    {cleaning.submitted_at ? `${formatDateTime(cleaning.submitted_at)} · ${timeAgo(cleaning.submitted_at)}` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">Completed</span>
                  <span className="text-xs tabular-nums text-foreground">{cleaning.completed_at ? formatDateTime(cleaning.completed_at) : '—'}</span>
                </div>
              </div>
            </DetailSection>

            <DetailSection title="Housekeeper">
              <div className="p-3 space-y-2">
                {selectedHousekeeper && (
                  <div className="flex items-center gap-2.5 pb-2 border-b border-border">
                    <WorkerAvatar name={selectedHousekeeper.name} photo_url={selectedHousekeeper.photo_url} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{selectedHousekeeper.name}</p>
                      <Code value={selectedHousekeeper.code} label="Housekeeper code" className="text-[11px]" block />
                    </div>
                  </div>
                )}
                <Select value={cleaning.housekeeper_id || '__none__'} onValueChange={(v) => updateField('housekeeper_id', v === '__none__' ? null : v)} disabled={isCompleted || isCancelled}>
                  <SelectTrigger className="h-8 text-xs rounded w-full">
                    <SelectValue placeholder="Unassigned">
                      {selectedHousekeeper ? selectedHousekeeper.name : <span className="text-foreground italic">Unassigned</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs italic text-foreground">Unassigned</SelectItem>
                    {housekeepers.map((h) => <SelectItem key={h.id} value={h.id} className="text-xs">{h.name} · <span className="font-mono font-bold">{h.code}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </DetailSection>

            {isCompleted ? (
              <CompletedReadOnlyPanel cleaning={cleaning} onOpenPhoto={openPhoto} />
            ) : (
              <>
                <PhotoSection cleaning={cleaning} onChanged={onChanged} onOpenPhoto={openPhoto} />

                <CategoryPair
                  title="Amenities"
                  Icon={Coffee}
                  cleaning={cleaning}
                  usedPhotoField="amenities_used_photo"
                  replacedPhotoField="amenities_replaced_photo"
                  usedItemsField="amenities_used_items"
                  replacedItemsField="amenities_replaced_items"
                  usedCategory="amenities_used"
                  replacedCategory="amenities_replaced"
                  onChanged={onChanged}
                  onOpenPhoto={openPhoto}
                />

                <CategoryPair
                  title="Laundry"
                  Icon={Shirt}
                  cleaning={cleaning}
                  usedPhotoField="laundry_used_photo"
                  replacedPhotoField="laundry_replaced_photo"
                  usedItemsField="laundry_used_items"
                  replacedItemsField="laundry_replaced_items"
                  usedCategory="laundry_used"
                  replacedCategory="laundry_replaced"
                  onChanged={onChanged}
                  onOpenPhoto={openPhoto}
                />

                <DetailSection title="Notes">
                  <div className="p-3">
                    <Textarea
                      key={cleaning.id}
                      defaultValue={cleaning.notes || ''}
                      maxLength={MAX_NOTE_LEN}
                      onBlur={async (e) => {
                        const cleaned = sanitizeText(e.target.value, { max: MAX_NOTE_LEN, allowNewlines: true })
                        if (cleaned === (cleaning.notes || null)) return
                        try {
                          await updateCleaning(cleaning.id, { notes: cleaned })
                          toast.success('Notes saved')
                          onChanged()
                        } catch { toast.error('Failed to save') }
                      }}
                      rows={3}
                      className="text-xs rounded resize-none w-full"
                      placeholder="Add notes..."
                    />
                  </div>
                </DetailSection>
              </>
            )}

            <HousekeeperPaymentSection cleaning={cleaning} onChanged={onChanged} />

            <LaundryPaymentSection cleaning={cleaning} onChanged={onChanged} />

            <div className="pt-2 border-t border-border">
              <Button variant="outline" size="sm"
                className="h-8 rounded text-xs w-full gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                onClick={onDelete}>
                <Trash2 size={12} /> Delete Cleaning
              </Button>
            </div>
          </div>

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {lightbox && (
          <PhotoLightbox
            photos={lightbox.photos}
            initialIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

type CleaningListRowProps = {
  cleaning: any
  contracts: any[]
  selected: boolean
  highlighted: boolean
  onClick: () => void
  onViewBooking: (cl: any) => void | Promise<void>
}

function CleaningListRow({ cleaning, contracts, selected, highlighted, onClick, onViewBooking }: CleaningListRowProps) {
  const navigate = useNavigate()
  const contract = findContractForCleaning(cleaning, contracts)
  const contextItems = [
    { label: 'See in Housekeeping', icon: Sparkles, onSelect: onClick },
    {
      label: 'See in Accounting',
      icon: TrendingUp,
      hint: contract ? undefined : 'No contract',
      disabled: !contract,
      onSelect: () => contract && navigate(crmLink.accountingCleaning(contract.id, cleaning)),
    },
    {
      label: 'See its contract in Contracts',
      icon: FileText,
      disabled: !contract,
      onSelect: () => contract && navigate(crmLink.contract(contract.id)),
    },
    { separator: true },
    {
      label: 'Copy cleaning code',
      icon: Copy,
      hint: cleaning.cleaning_code,
      onSelect: () => {
        navigator.clipboard.writeText(cleaning.cleaning_code || '').then(
          () => toast.success('Cleaning code copied'),
          () => toast.error('Failed to copy'),
        )
      },
    },
    { separator: true },
    {
      label: 'See in Bookings',
      icon: CalendarIcon,
      disabled: !cleaning.bookings?.id,
      onSelect: () => onViewBooking?.(cleaning),
    },
  ]

  return (
    <ContextMenu items={contextItems} className="row-line">
      <motion.button
        type="button"
        data-cleaning-id={cleaning.id}
        data-row
        onClick={onClick}
        initial={false}
        animate={{
          backgroundColor: highlighted
            ? 'rgba(34, 81, 147, 0.16)'
            : selected
              ? 'rgba(34, 81, 147, 0.10)'
              : 'rgba(34, 81, 147, 0)',
        }}
        transition={{ duration: 0.4 }}
        whileHover={{ backgroundColor: selected ? 'rgba(34, 81, 147, 0.14)' : 'rgba(34, 81, 147, 0.05)' }}
        whileTap={{ scale: 0.998 }}
        className={cn('group/row w-full text-left px-4 py-3 cursor-pointer select-none', ROW_GRID)}
      >
        <div className="min-w-0">
          <Code value={cleaning.cleaning_code} label="Cleaning code" className="text-[12.5px]" block />
          <span className="text-[11.5px] text-foreground flex items-center gap-1 min-w-0">
            <Code value={cleaning.units?.unit_code} label="Unit code" className="text-[11.5px]" />
            {cleaning.units?.building && <span className="truncate">· {cleaning.units.building}</span>}
          </span>
        </div>
        <div className="min-w-0">
          {cleaning.bookings ? (
            <>
              <Code value={cleaning.bookings.booking_code} label="Booking code" className="text-[12px]" block />
              <span className="text-[11.5px] text-foreground truncate block">{cleaning.bookings.guest_name}</span>
            </>
          ) : (
            <span className="text-[11.5px] italic text-foreground">Standalone</span>
          )}
        </div>
        <div className="min-w-0"><TypeText type={cleaning.type} /></div>
        <div className="min-w-0 flex items-center gap-2">
          {cleaning.housekeepers ? (
            <>
              <WorkerAvatar name={cleaning.housekeepers.name} photo_url={cleaning.housekeepers.photo_url} size="sm" />
              <span className="text-[12.5px] font-medium text-foreground truncate">{cleaning.housekeepers.name}</span>
            </>
          ) : (
            <span className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">Unassigned</span>
          )}
        </div>
        <div className="text-[12.5px] font-medium tabular-nums text-foreground min-w-0">
          <div className="truncate">{formatDate(cleaning.scheduled_date)}</div>
        </div>
        <div className="flex items-center gap-2 justify-end flex-shrink-0">
          <StatusText cleaning={cleaning} />
        </div>
      </motion.button>
    </ContextMenu>
  )
}

type HousekeepingPageProps = {
  initialSelectedId?: string
  // Set by "See in Housekeeping" on a booking: open that booking's cleaning.
  fromBookingId?: string
}

export default function HousekeepingPage({ initialSelectedId, fromBookingId }: HousekeepingPageProps) {
  const listCap = useListCap()
  const navigate = useNavigate()
  const [cleanings, setCleanings] = useState([])
  const [units, setUnits] = useState([])
  const [bookings, setBookings] = useState([])
  const [housekeepers, setHousekeepers] = useState([])
  const [contracts, setContracts] = useState([])

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [selectedId, setSelectedId] = useState(initialSelectedId || null)
  const [highlightedId, setHighlightedId] = useState(null)
  const [newModalOpen, setNewModalOpen] = useState(false)

  const hasLoadedOnce = useRef(false)
  const highlightTimeoutRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    }
  }, [])

  // Select a cleaning, flash it and scroll it into view.
  const focusCleaning = useCallback((id) => {
    setSelectedId(id)
    setHighlightedId(id)
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 2000)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-cleaning-id="${id}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }, [])

  useEffect(() => {
    if (initialSelectedId && initialSelectedId !== selectedId) focusCleaning(initialSelectedId)
  }, [initialSelectedId])

  const fetchData = useCallback(async (signal?) => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const [cRes, uRes, bRes, hRes, ctRes] = await Promise.all([
        listCleanings({}),
        supabase.from('units').select('id, unit_code, building, status').order('unit_code'),
        supabase.from('bookings').select('id, booking_code, guest_name, unit_id, check_in, check_out, completed_at').is('deleted_at', null).order('check_in', { ascending: false }).limit(200),
        supabase.from('housekeepers').select('id, code, name, photo_url').eq('status', 'active').order('name'),
        supabase.from('contracts').select('id, unit_id, contract_code, effective_date, expiry_date'),
      ])
      if (signal?.aborted) return
      if (uRes.error) throw uRes.error
      if (bRes.error) throw bRes.error
      if (hRes.error) throw hRes.error
      if (ctRes.error) throw ctRes.error
      setCleanings(cRes)
      setUnits(uRes.data || [])
      setBookings(bRes.data || [])
      setHousekeepers(hRes.data || [])
      setContracts(ctRes.data || [])

      defensivePhotoCleanup(cRes).catch((err) => {
        console.warn('defensivePhotoCleanup threw:', err)
      })
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load housekeeping data:', err)
      toast.error('Failed to load cleanings')
    } finally {
      if (!signal?.aborted) {
        setIsFirstLoad(false); setIsRefreshing(false); hasLoadedOnce.current = true
      }
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchData(ac.signal)
    return () => ac.abort()
  }, [fetchData])

  useEffect(() => {
    const ch = supabase
      .channel(`housekeeping-admin-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings' }, () => fetchData())
      // A check-out confirmed or a late check-out given in Bookings starts or moves a cleaning.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  // Arriving from a booking: once the cleanings are in, open its cleaning
  // (the latest scheduled, if there are several). Once per booking id.
  const openedForBookingRef = useRef(null)
  useEffect(() => {
    if (!fromBookingId || isFirstLoad || openedForBookingRef.current === fromBookingId) return
    openedForBookingRef.current = fromBookingId
    const match = cleanings.find((c) => c.booking_id === fromBookingId)
    if (match) focusCleaning(match.id)
    else toast('This booking has no cleaning scheduled yet.')
  }, [fromBookingId, isFirstLoad, cleanings, focusCleaning])

  const counts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []

    const scoped = tokens.length === 0
      ? cleanings
      : cleanings.filter((c) => {
          const hay = [
            c.cleaning_code,
            c.units?.unit_code, c.units?.building,
            c.bookings?.booking_code, c.bookings?.guest_name,
            c.housekeepers?.name, c.housekeepers?.code,
            c.notes,
          ].filter(Boolean).join(' ').toLowerCase()
          return tokens.every((tok) => hay.includes(tok))
        })

    const c = { all: scoped.length, scheduled: 0, ready: 0, 'to-be-evaluated': 0, completed: 0, cancelled: 0 }
    for (const x of scoped) {
      const eff = getEffectiveStatus(x)
      if (c[eff] !== undefined) c[eff]++
    }
    return c
  }, [cleanings, debouncedSearch])

  // Today where the CRM is used (not UTC, which is still yesterday before 8am in Manila).
  const todayStr = useLocalToday()

  // Cleanings still to do; the work queue sorts them into overdue and due today.
  const openCleanings = useMemo(
    () => cleanings.filter((c) => c.status === 'scheduled' || c.status === 'ready'),
    [cleanings],
  )

  // The next guest checking in to each open cleaning's unit once its guest has left.
  const arrivals = useMemo(() => {
    const map = new Map()
    for (const c of openCleanings) {
      const from = String(c.bookings?.check_out || c.scheduled_date || '').slice(0, 10)
      if (!c.unit_id || !from) continue
      let next = null
      for (const b of bookings) {
        if (b.unit_id !== c.unit_id || b.id === c.booking_id) continue
        const ci = String(b.check_in || '').slice(0, 10)
        if (ci >= from && (!next || ci < String(next.check_in).slice(0, 10))) next = b
      }
      const at = next && stayMoment(next.check_in, STAY_TIMES.checkIn)
      if (at) map.set(c.id, { code: next.booking_code, at })
    }
    return map
  }, [openCleanings, bookings])

  const pendingEvaluation = useMemo(() => {
    return cleanings
      .filter((c) => c.status === 'submitted')
      .sort((a, b) => {
        const av = a.submitted_at || ''
        const bv = b.submitted_at || ''
        if (av < bv) return -1
        if (av > bv) return 1
        return 0
      })
  }, [cleanings])

  const completed = useMemo(() => {
    return cleanings
      .filter((c) => c.status === 'completed')
      .sort((a, b) => {
        const av = a.completed_at || ''
        const bv = b.completed_at || ''
        if (av > bv) return -1
        if (av < bv) return 1
        return 0
      })
  }, [cleanings])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    return cleanings.filter((c) => {
      if (statusFilter !== 'all') {
        const eff = getEffectiveStatus(c)
        if (statusFilter !== eff) return false
      }
      if (tokens.length > 0) {
        const hay = [
          c.cleaning_code,
          c.units?.unit_code, c.units?.building,
          c.bookings?.booking_code, c.bookings?.guest_name,
          c.housekeepers?.name, c.housekeepers?.code,
          c.notes,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!tokens.every((tok) => hay.includes(tok))) return false
      }
      return true
    })
  }, [cleanings, statusFilter, debouncedSearch])

  // Column sorting; latest scheduled date first by default.
  const [sort, setSort] = useState({ key: 'scheduled', dir: 'desc' })
  const onSort = (key) => setSort((prev) => nextSort(prev, key, CLEANING_SORT_DEFAULT_DIR))
  const sorted = useMemo(() => {
    const value = CLEANING_SORT_VALUE[sort.key] || CLEANING_SORT_VALUE.scheduled
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = value(a), bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return cmp * dir || (b.scheduled_date || '').localeCompare(a.scheduled_date || '')
    })
  }, [filtered, sort])

  // Keyboard: "/" jumps to search, Esc closes the open cleaning.
  const searchRef = useRef(null)
  const closePanel = useCallback(() => setSelectedId(null), [])
  useListShortcuts({ searchRef, onEscape: selectedId ? closePanel : null })

  const clearFilters = () => { setStatusFilter('all'); setSearch('') }
  const filterChips = [
    statusFilter !== 'all' && { key: 'status', label: STATUS_PILLS.find((p) => p.id === statusFilter)?.label || statusFilter, onRemove: () => setStatusFilter('all') },
    debouncedSearch.trim() && { key: 'search', label: `"${debouncedSearch.trim()}"`, onRemove: () => setSearch('') },
  ].filter(Boolean)

  const selected = useMemo(() => cleanings.find((c) => c.id === selectedId) || null, [cleanings, selectedId])
  const handleSelect = (c) => setSelectedId((prev) => (prev === c.id ? null : c.id))

  const handlePanelRowClick = useCallback((cleaning) => {
    setSelectedId(cleaning.id)
    setHighlightedId(cleaning.id)
    setStatusFilter('all')

    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 2000)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-cleaning-id="${cleaning.id}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }, [])

  const handleDelete = async (cleaning) => {
    const confirmed = window.confirm(
      `Delete this cleaning?\n\nCode: ${cleaning.cleaning_code || '—'}\nUnit: ${cleaning.units?.unit_code || '—'}\n${cleaning.bookings ? `Booking: ${cleaning.bookings.booking_code}\n` : ''}Type: ${cleaning.type}\n\nThis cannot be undone.`
    )
    if (!confirmed) return
    try {
      await deleteCleaning(cleaning.id)
      logAudit('DELETE_CLEANING', 'cleanings', cleaning.id, {}).catch(() => {})
      toast.success('Cleaning deleted')
      setSelectedId(null)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to delete')
    }
  }

  return (
    <div className="h-full flex min-h-0">
      <div data-page-scroll className="flex-1 min-h-0 flex flex-col px-4 py-4 md:px-8 md:py-6 gap-4 overflow-y-auto [&>*]:flex-shrink-0">

        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards cleanings={cleanings} active={statusFilter} onSelect={setStatusFilter} />
        </div>

        <div className="flex-shrink-0">
          <QueueCard
            open={openCleanings}
            arrivals={arrivals}
            pendingEvaluation={pendingEvaluation}
            completed={completed}
            today={todayStr}
            loading={isFirstLoad}
            onRowClick={handlePanelRowClick}
          />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground" />
            <Input ref={searchRef} placeholder="Search code, unit, booking, housekeeper, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-9 h-8 text-xs rounded" />
            {!search && <SearchKeyHint />}
          </div>
          <Button size="sm" className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]" style={{ backgroundColor: BRAND }} onClick={() => setNewModalOpen(true)}>
            <Plus size={13} />
            <span className="hidden sm:inline ml-1">New Cleaning</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
            <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          </Button>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <StatusTabs tabs={STATUS_PILLS} value={statusFilter} onChange={setStatusFilter} counts={counts} label="Filter cleanings by status" />
        </div>

        {!isFirstLoad && (
          <ResultsBar
            shown={sorted.length}
            total={cleanings.length}
            noun={cleanings.length === 1 ? 'cleaning' : 'cleanings'}
            chips={filterChips}
            onClearAll={clearFilters}
            hint="Click a column to sort · Right-click a cleaning for quick actions · Press / to search"
          />
        )}

        <div className="rounded-md border border-border shadow-sm overflow-hidden bg-card flex flex-col">
          <MobileSort
            options={[{ key: 'code', label: 'Code · Unit' }, { key: 'booking', label: 'Booking' }, { key: 'type', label: 'Type' }, { key: 'housekeeper', label: 'Housekeeper' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'status', label: 'Status' }]}
            sort={sort}
            onSort={onSort}
            className="flex-shrink-0"
          />
          <div className={cn('flex-shrink-0 px-4 py-2.5 border-b border-border max-md:hidden', ROW_GRID)}>
            <SortHeader label="Code · Unit" sortKey="code" sort={sort} onSort={onSort} />
            <SortHeader label="Booking" sortKey="booking" sort={sort} onSort={onSort} />
            <SortHeader label="Type" sortKey="type" sort={sort} onSort={onSort} />
            <SortHeader label="Housekeeper" sortKey="housekeeper" sort={sort} onSort={onSort} />
            <SortHeader label="Scheduled" sortKey="scheduled" sort={sort} onSort={onSort} />
            <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} align="right" />
          </div>

          <div {...listCap} className="overflow-y-auto">
            {isFirstLoad ? (
              <div className="space-y-2 p-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : sorted.length === 0 ? (
              <div className="flex items-center justify-center text-center py-12">
                <div>
                  <Sparkles size={36} className="text-foreground mx-auto mb-3" />
                  <p className="text-sm text-foreground font-semibold">No cleanings match your filters</p>
                  <p className="text-xs text-foreground mt-1">Try clearing the filters, or create a new cleaning.</p>
                  {filterChips.length > 0 && (
                    <button type="button" onClick={clearFilters} className="mt-4 inline-flex items-center h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted">
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              sorted.map((c) => (
                <CleaningListRow
                  key={c.id}
                  cleaning={c}
                  contracts={contracts}
                  selected={selectedId === c.id}
                  highlighted={highlightedId === c.id}
                  onClick={() => handleSelect(c)}
                  onViewBooking={(cl) => cl.bookings?.id && navigate(`/admin?tab=bookings&booking=${cl.bookings.id}`)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <CleaningDetailPanel
            cleaning={selected}
            onClose={() => setSelectedId(null)}
            onChanged={fetchData}
            onDelete={() => handleDelete(selected)}
            housekeepers={housekeepers}
          />
        )}
      </AnimatePresence>

      <NewCleaningModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={fetchData}
        units={units}
        bookings={bookings}
        housekeepers={housekeepers}
        contracts={contracts}
      />
    </div>
  )
}