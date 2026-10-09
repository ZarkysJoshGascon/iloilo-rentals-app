// src/components/admin/housekeeping/HousekeepingPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2,
  Sparkles, AlertTriangle, User, Camera,
  ChevronRight, ChevronLeft, Download, Building2, Clock,
  Image as ImageIcon, FileText, Shirt, Wallet, Send, Coffee,
  ZoomIn, RotateCcw, LogIn, CheckCircle2,
  Calendar as CalendarIcon, Copy,
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
import { logAudit } from '@/lib/auditLog'
import { cn, sanitizeText, sanitizeMoney, sanitizeDateOnly, CLEANING_WINDOW, STAY_TIMES } from '@/lib/utils'
import {
  listCleanings, createCleaning, updateCleaning, deleteCleaning,
  addPhotosToCleaning, removePhotoFromCleaning,
  uploadCleaningPhoto, deleteCleaningPhoto,
  parseInventory, approveAndPayCleaning, updateLaundryPayment,
  downloadCleaningsCSV,
  getSignedUrl, getSignedUrls,
} from '@/lib/cleanings'
import { ContextMenu } from '@/components/ui/ContextMenu'

const BRAND = '#2d568e'

function getEffectiveStatus(cleaning) {
  if (cleaning.status === 'completed') return 'completed'
  if (cleaning.status === 'cancelled') return 'cancelled'
  if (cleaning.status === 'submitted') return 'to-be-evaluated'
  if (!cleaning.bookings?.check_out) return 'ready'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const co = new Date(cleaning.bookings.check_out); co.setHours(0, 0, 0, 0)
  return co <= today ? 'ready' : 'scheduled'
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
  'to-be-evaluated': { label: 'To Be Evaluated',  className: 'text-gray-600 dark:text-gray-400' },
  completed:         { label: 'Completed',        className: 'text-emerald-600 dark:text-emerald-400' },
  cancelled:         { label: 'Cancelled',        className: 'text-red-600 dark:text-red-400' },
}

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'ready', label: 'Ready' },
  { id: 'to-be-evaluated', label: 'To Be Evaluated' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

const PILL_TEXT_ACTIVE = {
  all: 'text-foreground',
  scheduled: 'text-amber-700 dark:text-amber-400',
  ready: 'text-blue-700 dark:text-blue-400',
  'to-be-evaluated': 'text-gray-700 dark:text-gray-300',
  completed: 'text-emerald-700 dark:text-emerald-400',
  cancelled: 'text-red-700 dark:text-red-400',
}

const PHOTO_LIMITS = { before: 15, after: 15, report: 10 }
const MAX_NOTE_LEN = 2000
const MAX_METHOD_LEN = 60
const MAX_REFERENCE_LEN = 100

const ROW_GRID = 'grid grid-cols-[1.3fr_1fr_1fr_1.2fr_1fr_140px] gap-4 items-center'
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
  return Math.max(0, Math.round((b - a) / 86400000))
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

function guestLeftStatus(booking) {
  if (!booking?.check_out) return null
  const parts = String(booking.check_out).slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const [y, m, d] = parts
  const checkOutTime = new Date(y, m - 1, d, STAY_TIMES.checkOut.hour, STAY_TIMES.checkOut.minute, 0, 0)
  const diffMs = Date.now() - checkOutTime.getTime()

  if (diffMs < 0) {
    const absMs = Math.abs(diffMs)
    const mins = Math.floor(absMs / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)
    let label
    if (mins < 60) label = `${mins}m`
    else if (hours < 24) label = `${hours}h ${mins % 60}m`
    else label = `${days}d ${hours % 24}h`
    return {
      text: `leaves in ${label}`,
      className: 'text-blue-600 dark:text-blue-400',
    }
  }

  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  let label
  if (mins < 60) label = `${mins}m`
  else if (hours < 24) label = `${hours}h ${mins % 60}m`
  else label = `${days}d ${hours % 24}h`

  const className =
    mins < 60 ? 'text-amber-600 dark:text-amber-400'
    : hours < 4 ? 'text-muted-foreground'
    : 'text-red-600 dark:text-red-400'

  return {
    text: `left ${label} ago`,
    className,
  }
}

const AVATAR_COLORS = [
  ['bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300'],
  ['bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-900/40', 'dark:text-emerald-300'],
  ['bg-orange-100', 'text-orange-700', 'dark:bg-orange-900/40', 'dark:text-orange-300'],
  ['bg-purple-100', 'text-purple-700', 'dark:bg-purple-900/40', 'dark:text-purple-300'],
  ['bg-rose-100', 'text-rose-700', 'dark:bg-rose-900/40', 'dark:text-rose-300'],
  ['bg-cyan-100', 'text-cyan-700', 'dark:bg-cyan-900/40', 'dark:text-cyan-300'],
  ['bg-amber-100', 'text-amber-700', 'dark:bg-amber-900/40', 'dark:text-amber-300'],
  ['bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900/40', 'dark:text-indigo-300'],
]
function avatarColor(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash = hash & hash }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function WorkerAvatar({ name, photo_url, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-10 h-10 text-sm'
  if (photo_url) return <img src={photo_url} alt={name} className={cn('rounded-full object-cover flex-shrink-0', sizeClasses)} />
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function PhotoLightbox({ photos, initialIndex, onClose }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function TypeText({ type }) {
  const config = TYPE_TEXT[type] || TYPE_TEXT.basic
  return <span className={cn('text-[11px] font-semibold capitalize', config.className)}>{config.label}</span>
}

function StatusText({ cleaning }) {
  const effective = getEffectiveStatus(cleaning)
  const config = STATUS_TEXT[effective] || STATUS_TEXT.scheduled
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
}

function SummaryCards({ cleanings }) {
  const stats = useMemo(() => {
    let scheduled = 0, toBeEvaluated = 0, cancelled = 0
    for (const c of cleanings) {
      const s = getEffectiveStatus(c)
      if (s === 'scheduled' || s === 'ready') scheduled++
      else if (s === 'to-be-evaluated') toBeEvaluated++
      else if (s === 'cancelled') cancelled++
    }
    return { total: cleanings.length, scheduled, toBeEvaluated, cancelled }
  }, [cleanings])

  const cards = [
    { label: 'Total Cleanings',  value: stats.total,          icon: Sparkles  },
    { label: 'Scheduled',        value: stats.scheduled,      icon: Clock     },
    { label: 'To Be Evaluated',  value: stats.toBeEvaluated,  icon: AlertTriangle },
    { label: 'Cancelled',        value: stats.cancelled,      icon: X         },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {card.label}
            </span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

function PanelRow({ cleaning, variant, onClick }) {
  const booking = cleaning.bookings
  const housekeeper = cleaning.housekeepers
  const unit = cleaning.units
  const nights = computeNightsFromBooking(booking)

  let timingText = null
  let timingClass = 'text-muted-foreground'

  if (variant === 'overdue') {
    const gl = guestLeftStatus(booking)
    if (gl) {
      timingText = `Guest ${gl.text}`
      timingClass = 'text-red-600 dark:text-red-400'
    } else {
      timingText = 'No guest check-out'
      timingClass = 'text-red-600 dark:text-red-400 italic'
    }
  } else if (variant === 'scheduled') {
    const gl = guestLeftStatus(booking)
    if (gl) {
      timingText = `Guest ${gl.text}`
      timingClass = gl.className
    } else {
      timingText = 'No guest check-out'
      timingClass = 'text-muted-foreground italic'
    }
  } else if (variant === 'pending') {
    const ago = timeAgo(cleaning.submitted_at)
    if (ago) timingText = `Submitted ${ago}`
  } else if (variant === 'completed') {
    const ago = timeAgo(cleaning.completed_at)
    if (ago) timingText = `Completed ${ago}`
  }

  const identityParts = [
    (cleaning.type || 'basic').charAt(0).toUpperCase() + (cleaning.type || 'basic').slice(1),
    unit?.unit_code,
    unit?.building,
  ].filter(Boolean)

  const metaParts = []
  if (housekeeper?.name) metaParts.push(housekeeper.name)
  if (booking?.guest_name) metaParts.push(booking.guest_name)
  if (nights > 0) metaParts.push(`${nights}n`)

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left rounded-md border border-border bg-background py-2 pl-4 pr-3 overflow-hidden transition-colors hover:bg-muted/40"
    >
      <span
        aria-hidden
        className="absolute top-0 bottom-0 left-0 w-[4px]"
        style={{ backgroundColor: '#10b981' }}
      />

      <div className="flex items-center gap-2 min-w-0">
        <p className="text-[11px] text-foreground truncate flex-1 min-w-0">
          <span className="font-mono font-semibold">{cleaning.cleaning_code || '—'}</span>
          {identityParts.map((part, i) => (
            <span key={i}>
              <span className="text-muted-foreground mx-1.5">·</span>
              <span className="text-muted-foreground">{part}</span>
            </span>
          ))}
        </p>
        <div className="flex-shrink-0">
          <StatusText cleaning={cleaning} />
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        {housekeeper?.name && (
          <WorkerAvatar name={housekeeper.name} photo_url={housekeeper.photo_url} size="sm" />
        )}
        <p className="text-[10px] truncate flex-1 min-w-0">
          {metaParts.length > 0 ? (
            metaParts.map((part, i) => (
              <span key={i} className="text-muted-foreground">
                {i > 0 && <span className="mx-1.5 text-muted-foreground/50">·</span>}
                {part}
              </span>
            ))
          ) : (
            <span className="italic text-muted-foreground">No booking</span>
          )}
          {timingText && (
            <>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              <span className={cn('font-medium', timingClass)}>{timingText}</span>
            </>
          )}
        </p>
      </div>
    </button>
  )
}

function TodayPanel({ title, icon: Icon, rows, loading, empty, variant, onRowClick, emphasis = false }) {
  const countClass = emphasis && rows.length > 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground'

  return (
    <section className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className="text-foreground flex-shrink-0" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">
          {title}
        </h3>
        {!loading && (
          <span className={cn('text-[11px] font-semibold tabular-nums', countClass)}>
            · {rows.length}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <div className="max-h-[200px] overflow-y-auto pr-1 space-y-1.5">
          {loading ? (
            <div className="space-y-1.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md bg-card border border-border shadow-sm py-8 px-4 text-center">
              <p className="text-[11px] text-muted-foreground italic">{empty}</p>
            </div>
          ) : (
            rows.map((c) => (
              <PanelRow
                key={c.id}
                cleaning={c}
                variant={variant}
                onClick={() => onRowClick(c)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function DetailSection({ title, action, children }) {
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

function StatusPills({ active, onChange, counts }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  useEffect(() => {
    if (!containerRef.current) return
    const activeEl = containerRef.current.querySelector('[data-active="true"]')
    if (!activeEl) return
    const cRect = containerRef.current.getBoundingClientRect()
    const aRect = activeEl.getBoundingClientRect()
    setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
  }, [active, counts])

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
      <motion.div className="absolute top-1 bottom-1 rounded-full shadow-sm z-0 bg-card border border-border"
        animate={{ left: indicator.left, width: indicator.width }} transition={{ type: 'spring', stiffness: 350, damping: 28 }} />
      {STATUS_PILLS.map((tab) => {
        const isActive = active === tab.id
        const count = counts[tab.id] ?? 0
        return (
          <button key={tab.id} type="button" data-active={isActive} onClick={() => onChange(tab.id)}
            className={cn('relative z-10 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors duration-200 whitespace-nowrap',
              isActive ? (PILL_TEXT_ACTIVE[tab.id] || 'text-foreground') : 'text-muted-foreground hover:text-foreground')}>
            {tab.label}
            <span className={cn('ml-1', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function PhotoGrid({ cleaning, category, onChanged, onOpenPhoto }) {
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
      // Multi-upload via the safe path — this batches all uploads into a
      // single DB write, so N photos don't overwrite each other.
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
        <p className="text-xs text-muted-foreground italic py-2 text-center">No {category} photos</p>
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

function PhotoSection({ cleaning, onChanged, onOpenPhoto }) {
  const [tab, setTab] = useState('before')
  const tabs = [
    { id: 'before', label: 'Before', count: (cleaning.photos_before || []).length },
    { id: 'after',  label: 'After',  count: (cleaning.photos_after || []).length },
    { id: 'report', label: 'Report', count: (cleaning.photos_report || []).length },
  ]

  return (
    <DetailSection title="Cleaning Photos">
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
              tab === t.id ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
            <span className="opacity-60 tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="p-3">
        <PhotoGrid cleaning={cleaning} category={tab} onChanged={onChanged} onOpenPhoto={onOpenPhoto} />
      </div>
    </DetailSection>
  )
}

function SinglePhotoCRM({ cleaning, field, category, label, onChanged, onOpenPhoto }) {
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
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
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
          className="w-full aspect-video rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground text-[11px] active:bg-muted/50 transition-colors disabled:opacity-50">
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

function ListEditorCRM({ items, onChange, placeholder = 'Item name' }) {
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
        <p className="text-[11px] italic text-muted-foreground text-center py-1">No items</p>
      ) : (
        parsed.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border border-border">
            <Input
              defaultValue={it.name}
              onBlur={(e) => handleNameCommit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
              maxLength={80}
              className="h-6 text-xs rounded bg-background flex-1 border-transparent hover:border-border"
            />
            <Input
              type="number"
              min={0}
              max={9999}
              defaultValue={it.quantity}
              onBlur={(e) => handleQtyCommit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
              className="h-6 text-xs rounded bg-background w-14 tabular-nums border-transparent hover:border-border"
            />
            <button type="button" onClick={() => handleRemove(i)} disabled={saving}
              className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 disabled:opacity-50">
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

function CategoryPair({ title, Icon, cleaning, usedPhotoField, replacedPhotoField,
  usedItemsField, replacedItemsField, usedCategory, replacedCategory, onChanged, onOpenPhoto }) {

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
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Used</p>
          <SinglePhotoCRM cleaning={cleaning} field={usedPhotoField} category={usedCategory} label="Used" onChanged={onChanged} onOpenPhoto={onOpenPhoto} />
          <div className="mt-2">
            <ListEditorCRM items={cleaning[usedItemsField]} onChange={(next) => handleFieldUpdate(usedItemsField, next)} />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Replaced</p>
          <SinglePhotoCRM cleaning={cleaning} field={replacedPhotoField} category={replacedCategory} label="Replaced" onChanged={onChanged} onOpenPhoto={onOpenPhoto} />
          <div className="mt-2">
            <ListEditorCRM items={cleaning[replacedItemsField]} onChange={(next) => handleFieldUpdate(replacedItemsField, next)} />
          </div>
        </div>
      </div>
    </DetailSection>
  )
}

function HousekeeperPaymentSection({ cleaning, onChanged }) {
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
      `Approve this cleaning and record housekeeper payment?\n\nAmount: ${formatMoney(amt)}\nMethod: ${cleanMethod}\n\nThis will mark the cleaning as completed.`
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
      logAudit('APPROVE_AND_PAY_CLEANING', 'cleanings', cleaning.id, { amount: amt, method: cleanMethod }).catch(() => {})
      toast.success('Cleaning approved and paid')
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

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded w-full'

  const statusLabel = isCompleted ? 'Paid' : isPending ? 'Pending Evaluation' : 'Not Paid'

  return (
    <DetailSection title={`Housekeeper Payment · ${statusLabel}`}>
      <div className="p-3 space-y-3">
        {isPending && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-muted/40 border border-border">
            <Clock size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground flex-1">
              Housekeeper submitted this cleaning. Review the photos, then approve or send back for corrections.
            </p>
          </div>
        )}

        {isCompleted && cleaning.paid_at && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Paid at</span>
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
          <p className="text-[10px] text-muted-foreground text-center">
            Fill amount and method to enable approval
          </p>
        )}
      </div>
    </DetailSection>
  )
}

function LaundryPaymentSection({ cleaning, onChanged }) {
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
  const canSave = hasAmount && hasMethod

  const handleSave = async () => {
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

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded w-full'
  const hasStoredPayment = cleaning.laundry_paid_at

  const statusLabel = hasStoredPayment ? 'Saved' : 'Not Saved'

  return (
    <DetailSection title={`Laundry Payment · ${statusLabel}`}>
      <div className="p-3 space-y-3">
        {hasStoredPayment && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Paid at</span>
            <span className="text-foreground font-semibold">{formatDateTime(cleaning.laundry_paid_at)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Amount (₱) *</label>
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Method *</label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="GCash, Cash…" maxLength={MAX_METHOD_LEN} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Reference</label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={MAX_REFERENCE_LEN} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Note</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LEN} rows={2} className="text-xs rounded resize-none w-full" />
        </div>

        <Button size="sm" className="h-8 rounded text-xs w-full gap-1.5 text-white" style={{ backgroundColor: BRAND }} onClick={handleSave} disabled={!canSave || saving}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Wallet size={12} />}
          {saving ? 'Saving…' : hasStoredPayment ? 'Update Laundry Payment' : 'Save Laundry Payment'}
        </Button>
        {!canSave && (
          <p className="text-[10px] text-muted-foreground text-center">
            Optional — fill amount and method to save
          </p>
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

function NewCleaningModal({ open, onClose, onCreated, units, bookings, housekeepers, contracts }) {
  const [form, setForm] = useState(emptyNewCleaning())
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setForm(emptyNewCleaning()) }, [open])

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

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">New Cleaning</h2>
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
                  <div className="px-3 py-2 text-xs text-muted-foreground italic">
                    No units with an active contract
                  </div>
                ) : (
                  eligibleUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.building || '—'} — {u.unit_code || '—'}
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
                    : <span className="text-muted-foreground italic">No booking (standalone)</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs italic text-muted-foreground">No booking (standalone)</SelectItem>
                {bookings.map((b) => <SelectItem key={b.id} value={b.id} className="text-xs">{b.booking_code} · {b.guest_name}</SelectItem>)}
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
              <Input type="date" value={form.scheduled_date} onChange={(e) => setField('scheduled_date', e.target.value)} className={inputClass} />
              <p className="text-[10px] text-muted-foreground mt-1">Window: {CLEANING_WINDOW.label}</p>
            </div>
          </div>
          <div>
            <label className={labelClass}>Housekeeper (optional)</label>
            <Select value={form.housekeeper_id || '__none__'} onValueChange={(v) => setField('housekeeper_id', v === '__none__' ? '' : v)}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Unassigned">
                  {form.housekeeper_id
                    ? (() => { const h = housekeepers.find((x) => x.id === form.housekeeper_id); return h ? `${h.name} · ${h.code}` : null })()
                    : <span className="text-muted-foreground italic">Unassigned</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs italic text-muted-foreground">Unassigned</SelectItem>
                {housekeepers.map((h) => <SelectItem key={h.id} value={h.id} className="text-xs">{h.name} · {h.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} maxLength={MAX_NOTE_LEN} rows={2} className="text-xs rounded resize-none" placeholder="Any notes..." />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
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

function CleaningDetailPanel({ cleaning, onClose, onChanged, onDelete, housekeepers }) {
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

  return (
    <>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: PANEL_WIDTH, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ width: { duration: 0.32, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2, ease: 'easeOut' } }}
        className="h-full flex-shrink-0 p-3"
        style={{ maxWidth: '100%', width: PANEL_WIDTH + 24 }}
      >
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
          <div className="flex-shrink-0 px-5 py-4 border-b border-border">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <Building2 size={20} className="text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-bold text-foreground truncate">
                  {cleaning.cleaning_code || '—'}
                </p>
                <p className="text-xs text-foreground truncate mt-0.5">
                  {cleaning.units?.unit_code || '—'}
                  {cleaning.units?.building ? ` · ${cleaning.units.building}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <TypeText type={cleaning.type} />
                  <StatusText cleaning={cleaning} />
                </div>
              </div>
              <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"><X size={16} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pendingEvaluation && (
              <div className="rounded-md bg-muted/40 border border-border p-3 flex items-start gap-2">
                <Clock size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">To be evaluated</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    The housekeeper submitted this cleaning. Review the photos and payment details, then approve or send back.
                  </p>
                </div>
              </div>
            )}

            <DetailSection title="Overview">
              <div className="p-3 space-y-0.5">
                {booking && (
                  <div className="flex items-center justify-between py-0.5 gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Booking</span>
                    <span className="text-xs font-mono text-foreground truncate text-right">
                      {booking.booking_code} · {booking.guest_name}
                    </span>
                  </div>
                )}
                {!booking && (
                  <div className="flex items-center justify-between py-0.5 gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Booking</span>
                    <span className="text-xs italic text-muted-foreground">Standalone (no booking)</span>
                  </div>
                )}
                {suggestDeep && (
                  <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border">
                    <AlertTriangle size={12} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-[11px] text-foreground flex-1">{stayNights}-night stay — consider deep clean</span>
                    <button type="button" onClick={() => updateField('type', 'deep')} disabled={saving}
                      className="text-[10px] font-semibold uppercase tracking-wider text-foreground hover:underline disabled:opacity-50">Set Deep</button>
                  </div>
                )}
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Type</span>
                  <div className="flex-1">
                    <Select value={cleaning.type} onValueChange={(v) => updateField('type', v)}>
                      <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic" className="text-xs">Basic</SelectItem>
                        <SelectItem value="deep" className="text-xs">Deep</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Status</span>
                  <div className="flex-1">
                    <Select value={effective} onValueChange={(v) => {
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
                    }}>
                      <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scheduled" className="text-xs">Scheduled</SelectItem>
                        <SelectItem value="ready" className="text-xs">Ready</SelectItem>
                        <SelectItem value="to-be-evaluated" className="text-xs">To Be Evaluated</SelectItem>
                        <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                        <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Scheduled</span>
                  <Input type="date" value={cleaning.scheduled_date || ''} onChange={(e) => updateField('scheduled_date', sanitizeDateOnly(e.target.value))} className="h-7 text-xs rounded bg-background flex-1" />
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Window</span>
                  <span className="text-xs text-foreground">{CLEANING_WINDOW.label}</span>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Submitted</span>
                  <span className="text-xs tabular-nums text-foreground">
                    {cleaning.submitted_at ? `${formatDateTime(cleaning.submitted_at)} · ${timeAgo(cleaning.submitted_at)}` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Completed</span>
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
                      <p className="text-[11px] font-mono text-muted-foreground">{selectedHousekeeper.code}</p>
                    </div>
                  </div>
                )}
                <Select value={cleaning.housekeeper_id || '__none__'} onValueChange={(v) => updateField('housekeeper_id', v === '__none__' ? null : v)}>
                  <SelectTrigger className="h-8 text-xs rounded w-full">
                    <SelectValue placeholder="Unassigned">
                      {selectedHousekeeper ? selectedHousekeeper.name : <span className="text-muted-foreground italic">Unassigned</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs italic text-muted-foreground">Unassigned</SelectItem>
                    {housekeepers.map((h) => <SelectItem key={h.id} value={h.id} className="text-xs">{h.name} · {h.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </DetailSection>

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

function CleaningListRow({ cleaning, selected, highlighted, onClick, onViewBooking }) {
  const contextItems = [
    { label: 'See in Housekeeping', icon: Sparkles, onSelect: onClick },
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
    <ContextMenu items={contextItems}>
      <motion.button
        type="button"
        data-cleaning-id={cleaning.id}
        onClick={onClick}
        initial={false}
        animate={{
          backgroundColor: highlighted
            ? 'rgba(45, 86, 142, 0.16)'
            : selected
              ? 'rgba(45, 86, 142, 0.10)'
              : 'rgba(45, 86, 142, 0)',
        }}
        transition={{ duration: 0.4 }}
        whileHover={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.14)' : 'rgba(45, 86, 142, 0.05)' }}
        whileTap={{ scale: 0.998 }}
        className={cn('group/row w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
      >
        <div className="min-w-0">
          <span className="font-mono text-xs font-bold text-foreground truncate block">
            {cleaning.cleaning_code || '—'}
          </span>
          <span className="text-[10px] text-muted-foreground truncate block">
            {cleaning.units?.unit_code || '—'}
            {cleaning.units?.building ? ` · ${cleaning.units.building}` : ''}
          </span>
        </div>
        <div className="min-w-0">
          {cleaning.bookings ? (
            <>
              <span className="font-mono text-[11px] text-foreground truncate block">{cleaning.bookings.booking_code}</span>
              <span className="text-[10px] text-muted-foreground truncate block">{cleaning.bookings.guest_name}</span>
            </>
          ) : (
            <span className="text-[10px] italic text-muted-foreground">Standalone</span>
          )}
        </div>
        <div className="min-w-0"><TypeText type={cleaning.type} /></div>
        <div className="min-w-0 flex items-center gap-2">
          {cleaning.housekeepers ? (
            <>
              <WorkerAvatar name={cleaning.housekeepers.name} photo_url={cleaning.housekeepers.photo_url} size="sm" />
              <span className="text-xs text-foreground truncate">{cleaning.housekeepers.name}</span>
            </>
          ) : (
            <span className="text-[11px] italic text-muted-foreground">Unassigned</span>
          )}
        </div>
        <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
          <div className="truncate">{formatDate(cleaning.scheduled_date)}</div>
        </div>
        <div className="flex items-center gap-2 justify-end flex-shrink-0">
          <StatusText cleaning={cleaning} />
        </div>
      </motion.button>
    </ContextMenu>
  )
}

export default function HousekeepingPage({ initialSelectedId }) {
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

  useEffect(() => {
    if (initialSelectedId && initialSelectedId !== selectedId) {
      setSelectedId(initialSelectedId)
      setHighlightedId(initialSelectedId)
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
      highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 2000)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-cleaning-id="${initialSelectedId}"]`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId])

  const fetchData = useCallback(async () => {
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
      if (uRes.error) throw uRes.error
      if (bRes.error) throw bRes.error
      if (hRes.error) throw hRes.error
      if (ctRes.error) throw ctRes.error
      setCleanings(cRes)
      setUnits(uRes.data || [])
      setBookings(bRes.data || [])
      setHousekeepers(hRes.data || [])
      setContracts(ctRes.data || [])
    } catch (err) {
      console.error('Failed to load housekeeping data:', err)
      toast.error('Failed to load cleanings')
    } finally {
      setIsFirstLoad(false); setIsRefreshing(false); hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const ch = supabase
      .channel(`housekeeping-admin-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const counts = useMemo(() => {
    const c = { all: cleanings.length, scheduled: 0, ready: 0, 'to-be-evaluated': 0, completed: 0, cancelled: 0 }
    for (const x of cleanings) {
      const eff = getEffectiveStatus(x)
      if (c[eff] !== undefined) c[eff]++
    }
    return c
  }, [cleanings])

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const dueToday = useMemo(() => {
    return cleanings
      .filter((c) => {
        if (c.scheduled_date !== todayStr) return false
        const eff = getEffectiveStatus(c)
        return eff === 'scheduled' || eff === 'ready'
      })
      .sort((a, b) => {
        const ac = a.cleaning_code || ''
        const bc = b.cleaning_code || ''
        return ac.localeCompare(bc)
      })
  }, [cleanings, todayStr])

  const overdue = useMemo(() => {
    return cleanings
      .filter((c) => {
        if (!c.scheduled_date) return false
        if (c.scheduled_date >= todayStr) return false
        const eff = getEffectiveStatus(c)
        return eff === 'scheduled' || eff === 'ready'
      })
      .sort((a, b) => {
        const av = a.scheduled_date || ''
        const bv = b.scheduled_date || ''
        if (av < bv) return -1
        if (av > bv) return 1
        const ac = a.cleaning_code || ''
        const bc = b.cleaning_code || ''
        return ac.localeCompare(bc)
      })
  }, [cleanings, todayStr])

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
    return cleanings.filter((c) => {
      if (statusFilter !== 'all') {
        const eff = getEffectiveStatus(c)
        if (statusFilter !== eff) return false
      }
      if (q) {
        const hay = [
          c.cleaning_code,
          c.units?.unit_code, c.units?.building,
          c.bookings?.booking_code, c.bookings?.guest_name,
          c.housekeepers?.name, c.housekeepers?.code,
          c.notes,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [cleanings, statusFilter, debouncedSearch])

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

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return }
    downloadCleaningsCSV(filtered, `cleanings_${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success('Exported')
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-y-auto">

        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards cleanings={cleanings} />
        </div>

        <div className="flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1 pb-2">
          <TodayPanel
            title="Due today"
            icon={Sparkles}
            rows={dueToday}
            loading={isFirstLoad}
            empty="No cleanings due today"
            variant="scheduled"
            onRowClick={handlePanelRowClick}
          />
          <TodayPanel
            title="To be evaluated"
            icon={AlertTriangle}
            rows={pendingEvaluation}
            loading={isFirstLoad}
            empty="Nothing waiting for review"
            variant="pending"
            onRowClick={handlePanelRowClick}
          />
          <TodayPanel
            title="Overdue"
            icon={Clock}
            rows={overdue}
            loading={isFirstLoad}
            empty="No overdue cleanings"
            variant="overdue"
            onRowClick={handlePanelRowClick}
            emphasis
          />
          <TodayPanel
            title="Completed"
            icon={CheckCircle2}
            rows={completed}
            loading={isFirstLoad}
            empty="No completed cleanings"
            variant="completed"
            onRowClick={handlePanelRowClick}
          />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search code, unit, booking, housekeeper, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded" />
          </div>
          <Button size="sm" className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]" style={{ backgroundColor: BRAND }} onClick={() => setNewModalOpen(true)}>
            <Plus size={13} />
            <span className="hidden sm:inline ml-1">New Cleaning</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
            <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded transition-all duration-150">
            <Download size={13} />
          </Button>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <StatusPills active={statusFilter} onChange={setStatusFilter} counts={counts} />
        </div>

        <div className="flex-shrink-0 rounded border border-border shadow-sm overflow-hidden bg-card flex flex-col">
          <div className={cn('flex-shrink-0 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Code · Unit</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Booking</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Type</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Housekeeper</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Scheduled</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right truncate">Status</span>
          </div>

          <div className="h-[280px] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
            {isFirstLoad ? (
              <div className="space-y-2 p-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center text-center py-12">
                <div>
                  <Sparkles size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-semibold">No cleanings match your filters</p>
                  <p className="text-xs text-muted-foreground mt-1">Try clearing filters or creating a new cleaning</p>
                </div>
              </div>
            ) : (
              filtered.map((c) => (
                <CleaningListRow
                  key={c.id}
                  cleaning={c}
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