// src/components/admin/bookings/BookingsPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Download, Loader2,
  Plus, RefreshCw, Search, X, Trash2,
  Building2, CheckCircle2, Clock, AlertTriangle, Calendar as CalendarIcon, User, Wallet,
  Edit2, Lock, LogIn, LogOut, ChevronLeft, ChevronRight,
  Mail, Copy, Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import {
  cn,
  generateBookingCode,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeMoney,
  sanitizeInt,
  sanitizeDateOnly,
  STAY_TIMES,
} from '@/lib/utils'
import {
  getTierInfo, SPECIALIST_FLAT_RATE,
  computeCommissionAtRate,
  fetchAffiliateCounts, fetchAffiliateCompletedCount,
} from '@/lib/commissions'
import { sendBookingConfirmation } from '@/lib/email'
import BookingConfirmationModal from './BookingConfirmationModal'
import { ContextMenu } from '@/components/ui/ContextMenu'

const BRAND = '#2d568e'

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'in-house', label: 'In-House' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'needs-action', label: 'Needs Action' },
  { id: 'completed', label: 'Done' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'cancelled', label: 'Cancelled' },
]

const ROW_GRID = 'grid grid-cols-[1.4fr_1fr_1.2fr_1.1fr_1fr_160px] gap-4 items-center'
const PANEL_WIDTH = 448

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
function parseDateOnly(d) { if (!d) return null; const dt = new Date(d); dt.setHours(0, 0, 0, 0); return dt }
function todayISO() {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function toISODate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function isoAddDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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

async function syncLinkedCleanings({ bookingId, newCheckIn, newCheckOut, bookingCode }) {
  if (!bookingId || !newCheckOut) return { updated: 0, failed: 0 }

  try {
    const { data: linked, error } = await supabase
      .from('cleanings')
      .select('id, status, type, scheduled_date')
      .eq('booking_id', bookingId)
      .in('status', ['scheduled', 'ready'])

    if (error) throw error
    if (!linked || linked.length === 0) return { updated: 0, failed: 0 }

    const newNights = newCheckIn
      ? Math.max(0, Math.round((new Date(newCheckOut + 'T00:00:00Z') - new Date(newCheckIn + 'T00:00:00Z')) / 86400000))
      : 0
    const newType = newNights >= 7 ? 'deep' : 'basic'

    let updated = 0
    let failed = 0

    for (const c of linked) {
      const patch = {}
      if (c.scheduled_date !== newCheckOut) patch.scheduled_date = newCheckOut
      if (c.type !== newType) patch.type = newType

      if (Object.keys(patch).length === 0) continue

      const { error: updErr } = await supabase
        .from('cleanings')
        .update(patch)
        .eq('id', c.id)

      if (updErr) {
        console.error('Failed to sync cleaning', c.id, updErr)
        failed++
        continue
      }
      updated++

      logAudit('AUTO_UPDATE_CLEANING_ON_BOOKING_CHANGE', 'cleanings', c.id, {
        booking_id: bookingId,
        booking_code: bookingCode,
        changes: patch,
        previous: {
          scheduled_date: c.scheduled_date,
          type: c.type,
        },
      }).catch(() => {})
    }

    return { updated, failed }
  } catch (err) {
    console.error('syncLinkedCleanings failed:', err)
    return { updated: 0, failed: 0, error: err?.message }
  }
}

function findGoverningContract(unit, contracts) {
  if (!unit) return null
  const todayStr = todayISO()
  const isActive = (c) => {
    if (!c?.effective_date) return false
    if (c.effective_date > todayStr) return false
    if (c.expiry_date && c.expiry_date < todayStr) return false
    return true
  }
  if (unit.current_contract_id) {
    const c = contracts.find((x) => x.id === unit.current_contract_id)
    if (c && isActive(c)) return c
  }
  const candidates = contracts
    .filter((x) => x.unit_id === unit.id && isActive(x))
    .sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))
  return candidates[0] || null
}

function findContractForBooking(booking, contracts) {
  if (!booking?.unit_id || !booking?.check_in) return null
  const candidates = (contracts || []).filter((c) =>
    c.unit_id === booking.unit_id &&
    c.effective_date &&
    c.effective_date <= booking.check_in &&
    (!c.expiry_date || c.expiry_date >= booking.check_in)
  )
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))[0]
}

function deriveBookingStatus(b) {
  if (b.cancelled_at) return 'cancelled'
  if (b.completed_at) return 'completed'
  const t = today()
  const ci = parseDateOnly(b.check_in)
  const co = parseDateOnly(b.check_out)
  if (!ci || !co) return 'upcoming'
  if (ci > t) return 'upcoming'
  if (ci <= t && co >= t) return 'active'
  return 'needs-action'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatDateShort(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}
function formatMoney(n) {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  const a = parseDateOnly(checkIn), b = parseDateOnly(checkOut)
  return Math.max(0, Math.round((b - a) / 86400000))
}
function unitLabel(u) {
  if (!u) return '—'
  const b = u.building || '', c = u.unit_code || ''
  if (b && c) return `${b} — ${c}`
  return c || b || '—'
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

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}
function avatarColor(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash = hash & hash }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function GuestAvatar({ name, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

const BOOKING_STATUS_TEXT = {
  upcoming: { label: 'Upcoming', className: 'text-blue-600 dark:text-blue-400' },
  active: { label: 'Active', className: 'text-emerald-600 dark:text-emerald-400' },
  'needs-action': { label: 'Needs Action', className: 'text-amber-600 dark:text-amber-400' },
  completed: { label: 'Done', className: 'text-gray-500 dark:text-gray-400' },
  cancelled: { label: 'Cancelled', className: 'text-red-600 dark:text-red-400' },
}

const PAYMENT_STATUS_TEXT = {
  paid: { label: 'Paid', className: 'text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'Partial', className: 'text-amber-600 dark:text-amber-400' },
  unpaid: { label: 'Unpaid', className: 'text-red-600 dark:text-red-400' },
}

function BookingStatusBadge({ status }) {
  const config = BOOKING_STATUS_TEXT[status]
  if (!config) return null
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
}
function PaymentStatusBadge({ status }) {
  const config = PAYMENT_STATUS_TEXT[status]
  if (!config) return null
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
}

function DateFieldPicker({
  value, onChange, placeholder,
  bookings = [],
  minDate,
  maxDate,
  excludeBookingId,
  otherDateISO,
  mode,
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => {
    const base = value || todayISO()
    return Number(base.slice(0, 4))
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const base = value || todayISO()
    return Number(base.slice(5, 7)) - 1
  })
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!value) return
    setViewYear(Number(value.slice(0, 4)))
    setViewMonth(Number(value.slice(5, 7)) - 1)
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const occupiedDays = useMemo(() => {
    const set = new Set()
    for (const b of bookings || []) {
      if (!b.check_in || !b.check_out) continue
      if (b.deleted_at) continue
      if (excludeBookingId && b.id === excludeBookingId) continue
      let cur = b.check_in
      let guard = 0
      while (cur < b.check_out && guard < 1000) {
        set.add(cur)
        cur = isoAddDays(cur, 1)
        guard++
      }
    }
    return set
  }, [bookings, excludeBookingId])

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = `${MONTHS[viewMonth]} ${viewYear}`
  const todayStr = todayISO()

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11) }
    else setViewMonth(viewMonth - 1)
  }
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0) }
    else setViewMonth(viewMonth + 1)
  }

  const displayValue = value ? formatDate(value) : null

  const inRange = (iso) => {
    if (!otherDateISO) return false
    if (mode === 'check-in') return false
    return iso > otherDateISO
  }

  const isSelectable = (iso) => {
    if (minDate && iso < minDate) return false
    if (maxDate && iso > maxDate) return false
    if (mode === 'check-out' && otherDateISO && iso <= otherDateISO) return false
    if (mode === 'check-in' && otherDateISO && iso >= otherDateISO) return false
    return true
  }

  const handlePick = (day) => {
    if (day == null) return
    const iso = toISODate(viewYear, viewMonth, day)
    if (!isSelectable(iso)) return
    onChange(iso)
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full h-8 text-xs rounded border bg-transparent px-2.5 flex items-center justify-between gap-2 text-left transition-colors',
          open ? 'border-ring ring-2 ring-ring/30' : 'border-input hover:bg-muted/50',
        )}
      >
        <span className={cn('truncate', !displayValue && 'text-muted-foreground')}>
          {displayValue || placeholder}
        </span>
        <CalendarIcon size={13} className="text-muted-foreground flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 mt-1 w-[268px] rounded-lg border border-border bg-popover shadow-lg p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={goPrevMonth} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <ChevronLeft size={13} />
              </button>
              <span className="text-xs font-bold text-foreground">{monthLabel}</span>
              <button type="button" onClick={goNextMonth} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {DOW.map((d) => (
                <div key={d} className="text-[10px] font-semibold text-muted-foreground text-center py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((day, idx) => {
                if (day == null) return <div key={idx} />
                const iso = toISODate(viewYear, viewMonth, day)
                const occupied = occupiedDays.has(iso)
                const selected = value === iso
                const isToday = iso === todayStr
                const selectable = isSelectable(iso)
                const rangeHighlight = inRange(iso)

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handlePick(day)}
                    disabled={!selectable}
                    className={cn(
                      'relative h-7 text-[11px] rounded transition-colors flex items-center justify-center tabular-nums',
                      !selectable && 'text-muted-foreground/40 cursor-not-allowed',
                      selectable && !selected && !rangeHighlight && 'hover:bg-muted text-foreground',
                      rangeHighlight && !selected && 'bg-primary/10 text-foreground',
                      selected && 'bg-primary text-primary-foreground font-bold',
                      isToday && !selected && 'ring-1 ring-primary/40',
                    )}
                    title={occupied ? 'Occupied by another booking' : undefined}
                  >
                    {day}
                    {occupied && (
                      <span
                        className={cn(
                          'absolute bottom-0.5 w-1 h-1 rounded-full',
                          selected ? 'bg-primary-foreground' : 'bg-red-500',
                        )}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between pt-2 mt-2 border-t border-border">
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Occupied
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-primary/20" /> Range
                </span>
              </div>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SummaryCards({ bookings }) {
  const stats = useMemo(() => {
    let upcoming = 0, active = 0, finished = 0
    for (const b of bookings) {
      const s = deriveBookingStatus(b)
      if (s === 'upcoming') upcoming++
      else if (s === 'active') active++
      else if (s === 'completed') finished++
    }
    return { total: bookings.length, upcoming, active, finished }
  }, [bookings])

  const cards = [
    { label: 'Total Bookings', value: stats.total, icon: CalendarIcon },
    { label: 'Upcoming', value: stats.upcoming, icon: Clock },
    { label: 'Active', value: stats.active, icon: Building2 },
    { label: 'Done', value: stats.finished, icon: CheckCircle2 },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{card.label}</span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

function StatusPills({ statusFilter, onStatusFilter, counts }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  useEffect(() => {
    if (!containerRef.current) return
    const active = containerRef.current.querySelector('[data-active="true"]')
    if (!active) return
    const cRect = containerRef.current.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
  }, [statusFilter, counts])

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
      <motion.div
        className="absolute top-1 bottom-1 rounded-full shadow-sm z-0 bg-card border border-border"
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      />
      {STATUS_PILLS.map((tab) => {
        const isActive = statusFilter === tab.id
        const count = counts[tab.id] ?? 0
        return (
          <button
            key={tab.id}
            type="button"
            data-active={isActive}
            onClick={() => onStatusFilter(tab.id)}
            className={cn(
              'relative z-10 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors duration-200 whitespace-nowrap',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className={cn('ml-1', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function TodayPanel({ title, icon: Icon, rows, loading, empty, onRowClick }) {
  return (
    <section className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className="text-foreground flex-shrink-0" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">{title}</h3>
        {!loading && (
          <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">· {rows.length}</span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <div className="max-h-[180px] overflow-y-auto pr-1 space-y-1.5">
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
            rows.map((b) => {
              const status = deriveBookingStatus(b)
              const nights = computeNights(b.check_in, b.check_out)
              const balance = Number(b.balance || 0)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onRowClick(b)}
                  className="relative w-full text-left rounded-md border border-border bg-background py-2 pl-4 pr-3 overflow-hidden transition-colors hover:bg-muted/40"
                >
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 left-0 w-[4px]"
                    style={{ backgroundColor: BRAND }}
                  />

                  <div className="flex items-center gap-2 min-w-0">
                    <GuestAvatar name={b.guest_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{b.guest_name || '—'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {b.booking_code || '—'} · {b.units?.unit_code || '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {formatDateShort(b.check_in)} → {formatDateShort(b.check_out)}
                      </span>
                      {balance > 0 ? (
                        <span className="text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                          {formatMoney(balance)} due
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          Paid
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}

function WarningChip({ icon: Icon, label, count, active, onClick, triggerRef, children }) {
  return (
    <div className="relative" ref={triggerRef}>
      <button type="button" onClick={onClick}
        className={cn('inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium border transition-colors',
          active ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-muted')}>
        <Icon size={13} className={active ? 'opacity-90' : 'opacity-60'} />
        <span>{label}</span>
        <span className={cn('min-w-[20px] h-[18px] inline-flex items-center justify-center px-1.5 rounded text-[10px] font-semibold tabular-nums', active ? 'bg-background/20' : 'bg-muted')}>{count}</span>
      </button>
      {children}
    </div>
  )
}

function DropdownPortal({ anchorRef, onClose, children }) {
  const [pos, setPos] = useState(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const width = 420
    let left = rect.right - width
    if (left < 8) left = 8
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
    setPos({ top: rect.bottom + 8, left, width })
  }, [anchorRef])

  useEffect(() => {
    const onDown = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) {
        onClose()
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  if (!pos) return null

  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12 }}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
      className="max-h-[520px] bg-popover border border-border rounded-lg shadow-lg overflow-hidden flex flex-col"
    >
      {children}
    </motion.div>,
    document.body,
  )
}

function WarningRow({ booking, chip, chipTone, onClick }) {
  const chipClass = chipTone === 'red' ? 'text-red-600 dark:text-red-400' : chipTone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors flex items-center gap-3 group">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-foreground truncate">{booking.booking_code}</span>
          <span className="text-[11px] text-foreground truncate">{booking.guest_name}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {booking.units?.unit_code || '—'} · {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
        </p>
      </div>
      <span className={cn('inline-flex items-center text-[11px] font-semibold whitespace-nowrap flex-shrink-0', chipClass)}>{chip}</span>
    </button>
  )
}

function WarningsStrip({ needsCompletion, endingSoon, onSelect }) {
  const [open, setOpen] = useState(null)
  const ncRef = useRef(null)
  const esRef = useRef(null)

  const ncCount = needsCompletion.length
  const esCount = endingSoon.length
  if (ncCount === 0 && esCount === 0) return null
  const toggle = (key) => setOpen((v) => (v === key ? null : key))

  return (
    <div className="flex items-center gap-2">
      {ncCount > 0 && (
        <WarningChip
          icon={AlertTriangle}
          label="Needs Completion"
          count={ncCount}
          active={open === 'nc'}
          onClick={() => toggle('nc')}
          triggerRef={ncRef}
        >
          <AnimatePresence>
            {open === 'nc' && (
              <DropdownPortal anchorRef={ncRef} onClose={() => setOpen(null)}>
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Needs Completion</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {ncCount} booking{ncCount === 1 ? '' : 's'} past check-out — mark as done or extend
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="p-1 -m-1 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {needsCompletion.map((b) => (
                    <WarningRow key={b.id} booking={b} chip="Needs Action" chipTone="amber" onClick={() => { onSelect(b); setOpen(null) }} />
                  ))}
                </div>
              </DropdownPortal>
            )}
          </AnimatePresence>
        </WarningChip>
      )}
      {esCount > 0 && (
        <WarningChip
          icon={Clock}
          label="Ending Soon"
          count={esCount}
          active={open === 'es'}
          onClick={() => toggle('es')}
          triggerRef={esRef}
        >
          <AnimatePresence>
            {open === 'es' && (
              <DropdownPortal anchorRef={esRef} onClose={() => setOpen(null)}>
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Ending Soon</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {esCount} booking{esCount === 1 ? '' : 's'} ending in the next 2 days with balance due
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="p-1 -m-1 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {endingSoon.map((b) => (
                    <WarningRow key={b.id} booking={b} chip={`${formatMoney(b.balance)} due`} chipTone="red" onClick={() => { onSelect(b); setOpen(null) }} />
                  ))}
                </div>
              </DropdownPortal>
            )}
          </AnimatePresence>
        </WarningChip>
      )}
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2 px-0.5">{title}</h4>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function BookingDetailPanel({
  booking, contracts, onBookingChange, onClose,
  onAddPayment, onExtend, onComplete, onEdit, onDelete, onEmail,
  onCancel, onRestore,
}) {
  const status = deriveBookingStatus(booking)
  const isCompleted = status === 'completed'
  const isCancelled = !!booking.cancelled_at
  const isPaid = booking.payment_status === 'paid'
  const guestLeft = parseDateOnly(booking.check_out) < today()
  const canComplete = !isCompleted && !isCancelled && guestLeft && isPaid
  const canExtend = !isCompleted && !isCancelled && !guestLeft

  const transactions = Array.isArray(booking.transactions) ? booking.transactions : []
  const nights = computeNights(booking.check_in, booking.check_out)

  const bookerTier = booking.booker_code
    ? (booking.booker_rate != null ? `Flat ${booking.booker_rate}%` : `Flat ${SPECIALIST_FLAT_RATE}%`)
    : null
  const affiliateTier = booking.affiliate_code
    ? (booking.affiliate_rate != null ? `${booking.affiliate_rate}%` : '—')
    : null

  const governing = useMemo(
    () => findContractForBooking(booking, contracts),
    [booking, contracts],
  )

  const bookedAgo = timeAgo(booking.created_at)
  const editedAgo = timeAgo(booking.updated_at)
  const wasEdited = booking.updated_at && booking.created_at && booking.updated_at !== booking.created_at

  return (
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
            key={booking.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="h-full flex flex-col min-h-0"
          >

        <div className="px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-3">
            <GuestAvatar name={booking.guest_name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className={cn('text-base font-bold text-foreground truncate', isCancelled && 'line-through')}>
                {booking.guest_name}
              </p>
              <p className="text-[11px] text-foreground font-mono truncate">{booking.booking_code}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <BookingStatusBadge status={status} />
                {!isCancelled && <PaymentStatusBadge status={booking.payment_status} />}
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-foreground flex-shrink-0"><X size={16} /></button>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded text-[11px] gap-1.5 text-white hover:opacity-90"
              style={{ backgroundColor: BRAND }}
              onClick={onEmail}
              disabled={!booking.guest_email || isCancelled}
              title={booking.guest_email ? 'Send booking confirmation' : 'No email on file'}
            >
              <Mail size={11} /> Email Confirmation
            </Button>
            <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onEdit} disabled={isCancelled}>
              <Edit2 size={11} /> Edit
            </Button>

            {!isCompleted && !isCancelled && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                onClick={onCancel}
              >
                <X size={11} /> Cancel
              </Button>
            )}

            {isCancelled && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded text-[11px] gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                onClick={onRestore}
              >
                <CheckCircle2 size={11} /> Restore
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              onClick={onDelete}
            >
              <Trash2 size={11} /> Delete
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {isCancelled && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
              <X size={14} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                  Cancelled · {new Date(booking.cancelled_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {booking.cancelled_reason && (
                  <p className="text-[11px] text-red-700/80 dark:text-red-400/80 mt-0.5 break-words">
                    {booking.cancelled_reason}
                  </p>
                )}
              </div>
            </div>
          )}

          {!isCancelled && (
            <div className="flex items-center justify-end gap-2 flex-wrap">
              {!isCompleted && (
                <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onAddPayment}>
                  <Plus size={11} /> Add Payment
                </Button>
              )}
              {canExtend && (
                <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onExtend}>
                  <CalendarIcon size={11} /> Extend Stay
                </Button>
              )}
              {!isCompleted && (
                <Button variant="outline" size="sm"
                  className={cn('h-7 rounded text-[11px] gap-1.5',
                    canComplete
                      ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-900/20'
                      : 'text-muted-foreground border-border cursor-not-allowed opacity-60')}
                  onClick={canComplete ? onComplete : undefined}
                  disabled={!canComplete}>
                  <CheckCircle2 size={11} /> Mark as Done
                </Button>
              )}
            </div>
          )}

          <DetailSection title="Summary">
            <div className="p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-foreground">Total</span><span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-foreground">Paid</span><span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.amount_paid)}</span></div>
              <div className="flex justify-between pt-1 border-t border-border"><span className="text-foreground font-semibold">Balance</span><span className="font-bold tabular-nums text-foreground">{formatMoney(booking.balance)}</span></div>
              {!isCancelled && <div className="pt-2"><PaymentStatusBadge status={booking.payment_status} /></div>}
            </div>
          </DetailSection>

          <DetailSection title="Timestamps">
            <div className="p-3 space-y-0.5">
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Booked</span>
                <span className="text-xs tabular-nums text-foreground">
                  {booking.created_at ? `${formatDate(booking.created_at)} · ${bookedAgo || ''}` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Edited</span>
                <span className="text-xs tabular-nums text-foreground">
                  {wasEdited
                    ? `${formatDate(booking.updated_at)} · ${editedAgo || ''}`
                    : <span className="italic text-muted-foreground">Never edited</span>}
                </span>
              </div>
            </div>
          </DetailSection>

          <DetailSection title={`Payment History · ${transactions.length}`}>
            <div className="p-2">
              {transactions.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground italic">No payments recorded yet</div>
              ) : (
                <div className="space-y-1.5">
                  {transactions.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-background">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-foreground min-w-[60px]">{formatDateShort(t.date)}</span>
                        <span className="text-xs font-semibold text-foreground tabular-nums">{formatMoney(t.amount)}</span>
                        {t.method && <span className="text-[11px] text-foreground truncate">{t.method}</span>}
                        {t.reference && <span className="text-[10px] text-muted-foreground font-mono truncate">· {t.reference}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Unit">
            <div className="p-3 space-y-1">
              <div className="flex items-baseline gap-2 pb-2 mb-2 border-b border-border">
                <span className="font-mono text-sm font-bold text-foreground">{booking.units?.unit_code || '—'}</span>
                <span className="text-[11px] text-foreground truncate">{booking.units?.building || '—'}</span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Booked by</span>
                <span className="text-xs font-semibold text-foreground">
                  {booking.booker_name || booking.booker_code || '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Affiliate</span>
                <span className="text-xs font-semibold text-foreground">
                  {booking.affiliate_name || booking.affiliate_code || '—'}
                </span>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Contract">
            {governing ? (
              <div className="p-3 space-y-0.5">
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Code</span>
                  <span className="text-xs font-mono text-foreground truncate">{governing.contract_code || '—'}</span>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Effective</span>
                  <span className="text-xs tabular-nums text-foreground">{governing.effective_date || '—'}</span>
                </div>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Expiry</span>
                  <span className="text-xs tabular-nums text-foreground">{governing.expiry_date || <span className="italic text-muted-foreground">Open-ended</span>}</span>
                </div>
                <p className="pt-2 mt-2 border-t border-border text-[10px] text-muted-foreground italic">
                  Contract PDF opens from the Contracts page.
                </p>
              </div>
            ) : (
              <div className="p-3">
                <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                  No contract covers this booking&apos;s check-in.
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  This booking won&apos;t appear in Accounting for any contract. It was created before the current booking rules, or its contract has been deleted.
                </p>
              </div>
            )}
          </DetailSection>

          <DetailSection title="Guest">
            <div className="p-3 space-y-0.5">
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Name</span>
                <span className="text-xs text-foreground truncate">{booking.guest_name || '—'}</span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Email</span>
                <span className="text-xs text-foreground truncate">{booking.guest_email || '—'}</span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Contact</span>
                <span className="text-xs text-foreground truncate">{booking.guest_contact || '—'}</span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Guests</span>
                <span className="text-xs text-foreground">{booking.guests || 1}</span>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Dates & Amount">
            <div className="p-3 space-y-0.5">
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Check-in</span>
                <span className="text-xs tabular-nums text-foreground">
                  {formatDate(booking.check_in)} · {STAY_TIMES.checkIn.label}
                </span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Check-out</span>
                <span className="text-xs tabular-nums text-foreground">
                  {formatDate(booking.check_out)} · {STAY_TIMES.checkOut.label}
                </span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">Nights</span>
                <span className="text-xs tabular-nums font-semibold text-foreground">{nights}</span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Total</span>
                <span className="text-xs tabular-nums font-semibold text-foreground">{formatMoney(booking.total_amount)}</span>
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Commissions">
            <div className="p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-foreground">Booker {bookerTier ? `· ${bookerTier}` : ''}</span>
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.booker_commission)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-foreground">Affiliate {affiliateTier ? `· ${affiliateTier}` : ''}</span>
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.affiliate_commission)}</span>
              </div>
              <p className="pt-2 mt-1 border-t border-border text-[10px] text-muted-foreground italic flex items-center gap-1">
                <Lock size={9} className="opacity-60" />
                Rates snapshotted at booking creation.
              </p>
            </div>
          </DetailSection>
        </div>

          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function BookingListRow({ booking, contracts, selected, highlighted, onClick, onViewCleaning }) {
  const status = deriveBookingStatus(booking)
  const nights = computeNights(booking.check_in, booking.check_out)
  const governing = findContractForBooking(booking, contracts)
  const bookedAgo = timeAgo(booking.created_at)
  const editedAgo = timeAgo(booking.updated_at)
  const wasEdited = booking.updated_at && booking.created_at && booking.updated_at !== booking.created_at
  const isCancelled = !!booking.cancelled_at

  const contextItems = [
    { label: 'See in Bookings', icon: CalendarIcon, onSelect: onClick },
    { separator: true },
    {
      label: 'Copy booking code',
      icon: Copy,
      hint: booking.booking_code,
      onSelect: () => {
        navigator.clipboard.writeText(booking.booking_code || '').then(
          () => toast.success('Booking code copied'),
          () => toast.error('Failed to copy'),
        )
      },
    },
    {
      label: 'Copy guest email',
      icon: Mail,
      disabled: !booking.guest_email,
      onSelect: () => {
        navigator.clipboard.writeText(booking.guest_email || '').then(
          () => toast.success('Email copied'),
          () => toast.error('Failed to copy'),
        )
      },
    },
    { separator: true },
    {
      label: 'See in Housekeeping',
      icon: Sparkles,
      disabled: !onViewCleaning,
      onSelect: () => onViewCleaning?.(booking),
    },
  ]

  return (
    <ContextMenu items={contextItems}>
      <motion.button
        type="button"
        data-booking-id={booking.id}
        onClick={onClick}
        initial={false}
        animate={{
          backgroundColor: highlighted
            ? 'rgba(45, 86, 142, 0.16)'
            : selected
              ? 'rgba(45, 86, 142, 0.10)'
              : isCancelled
                ? 'rgba(239, 68, 68, 0.04)'
                : 'rgba(45, 86, 142, 0)',
          opacity: isCancelled ? 0.6 : 1,
        }}
        transition={{ duration: 0.4 }}
        whileHover={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.14)' : 'rgba(45, 86, 142, 0.05)' }}
        whileTap={{ scale: 0.998 }}
        className={cn('group/row w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GuestAvatar name={booking.guest_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold text-foreground truncate', isCancelled && 'line-through')}>
              {booking.guest_name}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {booking.guest_email || booking.guest_contact || `${booking.guests || 1} guest${booking.guests > 1 ? 's' : ''}`}
            </p>
            {bookedAgo && (
              <p className="text-[10px] text-muted-foreground truncate">
                Booked {bookedAgo}
                {wasEdited && editedAgo && (
                  <>
                    <span className="mx-1 text-muted-foreground/50">·</span>
                    <span>Edited {editedAgo}</span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <span className="font-mono text-xs text-foreground truncate">{booking.booking_code}</span>
        <div className="min-w-0">
          <span className="font-mono text-xs font-bold text-foreground truncate flex items-center gap-1">
            {booking.units?.unit_code || '—'}
            {!governing && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                No contract
              </span>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground truncate block">{booking.units?.building || '—'}</span>
        </div>
        <div className="text-[11px] tabular-nums text-foreground min-w-0">
          <div className="truncate">{formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}</div>
          <div className="text-[10px] text-muted-foreground">{nights} night{nights === 1 ? '' : 's'}</div>
        </div>
        <div className="flex items-center min-w-0">
          <PaymentStatusBadge status={booking.payment_status} />
        </div>
        <div className="flex items-center justify-end flex-shrink-0">
          <BookingStatusBadge status={status} />
        </div>
      </motion.button>
    </ContextMenu>
  )
}

function downloadCSV(bookings, filename) {
  const headers = [
    'Booking Code', 'Building', 'Unit', 'Guest', 'Email', 'Contact', 'Guests',
    'Check-in', 'Check-out', 'Nights', 'Total', 'Paid', 'Balance',
    'Payment Status', 'Booking Status',
    'Booker Code', 'Booker Name', 'Booker Commission', 'Booker Rate %',
    'Affiliate Code', 'Affiliate Name', 'Affiliate Commission', 'Affiliate Rate %',
    'Booked At', 'Last Edited', 'Cancelled At', 'Cancellation Reason',
    'Notes',
  ]
  const rows = bookings.map((b) => {
    const s = deriveBookingStatus(b)
    return [
      b.booking_code || '', b.units?.building || '', b.units?.unit_code || '',
      b.guest_name || '', b.guest_email || '', b.guest_contact || '', b.guests || '',
      b.check_in || '', b.check_out || '', computeNights(b.check_in, b.check_out),
      b.total_amount || 0, b.amount_paid || 0, b.balance || 0,
      b.payment_status || '', s,
      b.booker_code || '', b.booker_name || '', b.booker_commission || 0, b.booker_rate ?? '',
      b.affiliate_code || '', b.affiliate_name || '', b.affiliate_commission || 0, b.affiliate_rate ?? '',
      b.created_at || '', b.updated_at || '',
      b.cancelled_at || '', b.cancelled_reason || '',
      b.notes || '',
    ]
  })
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const emptyForm = () => ({
  unit_id: '',
  guest_name: '',
  guest_email: '',
  guest_contact: '',
  guests: 1,
  check_in: '',
  check_out: '',
  total_amount: 0,
  booker_code: '',
  affiliate_code: '',
  affiliate_notes: '',
  notes: '',
  initial_amount: '',
  initial_method: '',
  initial_reference: '',
  initial_date: '',
})

async function findOverlappingBooking({ unitId, checkIn, checkOut, excludeId }) {
  if (!unitId || !checkIn || !checkOut) return null
  let query = supabase
    .from('bookings')
    .select('booking_code, check_in, check_out')
    .eq('unit_id', unitId)
    .is('deleted_at', null)
    .is('cancelled_at', null)
    .lt('check_in', checkOut)
    .gt('check_out', checkIn)
    .order('check_in')
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  if (error) {
    console.error('Overlap check failed:', error)
    return null
  }
  return data?.[0] || null
}

function BookingFormModal({ open, onClose, onSaved, units, editing, specialists, affiliates, affiliateCounts, contracts, bookings }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [liveAffiliateCount, setLiveAffiliateCount] = useState(null)
  const [sendEmail, setSendEmail] = useState(true)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        unit_id: editing.unit_id || '',
        guest_name: editing.guest_name || '',
        guest_email: editing.guest_email || '',
        guest_contact: editing.guest_contact || '',
        guests: editing.guests || 1,
        check_in: editing.check_in || '',
        check_out: editing.check_out || '',
        total_amount: editing.total_amount || 0,
        booker_code: editing.booker_code || '',
        affiliate_code: editing.affiliate_code || '',
        affiliate_notes: editing.affiliate_notes || '',
        notes: editing.notes || '',
        initial_amount: '',
        initial_method: '',
        initial_reference: '',
        initial_date: '',
      })
    } else {
      setForm(emptyForm())
    }
    setLiveAffiliateCount(null)
    setSendEmail(true)
  }, [open, editing])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open || !form.affiliate_code) { setLiveAffiliateCount(null); return }
    const cached = affiliateCounts?.[form.affiliate_code]
    if (typeof cached === 'number') { setLiveAffiliateCount(cached); return }
    let cancelled = false
    setLiveAffiliateCount(null)
    fetchAffiliateCompletedCount(form.affiliate_code)
      .then((count) => { if (!cancelled) setLiveAffiliateCount(Number(count) || 0) })
      .catch(() => { if (!cancelled) setLiveAffiliateCount(0) })
    return () => { cancelled = true }
  }, [open, form.affiliate_code, affiliateCounts])

  const totalAmount = Number(form.total_amount) || 0
  const bookerRate = useMemo(() => (form.booker_code ? SPECIALIST_FLAT_RATE : null), [form.booker_code])
  const bookerCommission = useMemo(
    () => (bookerRate != null && totalAmount > 0 ? computeCommissionAtRate(totalAmount, bookerRate) : 0),
    [bookerRate, totalAmount],
  )
  const affiliateCount = useMemo(() => {
    if (form.affiliate_code && typeof liveAffiliateCount === 'number') return liveAffiliateCount
    return affiliateCounts?.[form.affiliate_code] || 0
  }, [liveAffiliateCount, affiliateCounts, form.affiliate_code])
  const affiliateRate = useMemo(
    () => (form.affiliate_code ? getTierInfo(affiliateCount).rate : null),
    [form.affiliate_code, affiliateCount],
  )
  const affiliateCommission = useMemo(
    () => (affiliateRate != null && totalAmount > 0 ? computeCommissionAtRate(totalAmount, affiliateRate) : 0),
    [affiliateRate, totalAmount],
  )

  const nights = computeNights(form.check_in, form.check_out)
  const initialAmount = Number(form.initial_amount) || 0
  const remaining = Math.max(0, totalAmount - initialAmount)
  const willBePartial = initialAmount > 0 && initialAmount < totalAmount
  const willBePaid = initialAmount >= totalAmount && totalAmount > 0
  const selectedUnit = useMemo(() => units.find((u) => u.id === form.unit_id) || null, [units, form.unit_id])

  const selectedContract = useMemo(
    () => findGoverningContract(selectedUnit, contracts),
    [selectedUnit, contracts],
  )

  const unitBookings = useMemo(() => {
    if (!form.unit_id) return []
    return (bookings || []).filter((b) => b.unit_id === form.unit_id && !b.deleted_at && !b.cancelled_at)
  }, [bookings, form.unit_id])

  const unitsForDropdown = useMemo(() => {
    if (!editing?.unit_id) return units
    if (units.some((u) => u.id === editing.unit_id)) return units
    return [
      ...units,
      {
        id: editing.unit_id,
        unit_code: editing.units?.unit_code || '—',
        building: editing.units?.building || '',
      },
    ]
  }, [units, editing])

  const handleSubmit = async () => {
    const guestName = sanitizeText(form.guest_name, { max: 120 })
    const guestEmail = sanitizeEmail(form.guest_email)
    const guestContact = sanitizePhone(form.guest_contact)
    const notes = sanitizeText(form.notes, { max: 2000, allowNewlines: true })
    const affiliateNotes = sanitizeText(form.affiliate_notes, { max: 2000, allowNewlines: true })
    const checkIn = sanitizeDateOnly(form.check_in)
    const checkOut = sanitizeDateOnly(form.check_out)
    const guests = sanitizeInt(form.guests, { min: 1, max: 50, fallback: 1 })
    const totalAmt = sanitizeMoney(form.total_amount)
    const initialAmt = sanitizeMoney(form.initial_amount)
    const initialMethod = sanitizeText(form.initial_method, { max: 60 })
    const initialReference = sanitizeText(form.initial_reference, { max: 100 })
    const initialDate = sanitizeDateOnly(form.initial_date)

    if (!form.unit_id) { toast.error('Select a unit'); return }
    if (!guestName) { toast.error('Guest name is required'); return }
    if (form.guest_email && !guestEmail) { toast.error('Invalid email'); return }
    if (!checkIn || !checkOut) { toast.error('Set check-in and check-out'); return }
    if (checkOut <= checkIn) { toast.error('Check-out must be after check-in'); return }
    if (totalAmt <= 0) { toast.error('Total amount must be greater than 0'); return }
    if (initialAmt > totalAmt) { toast.error('Initial payment cannot exceed total'); return }

    if (!selectedContract) {
      const hasAny = contracts.some((c) => c.unit_id === form.unit_id)
      if (!hasAny) {
        toast.error('This unit has no contract. Create one in Contracts before booking.')
      } else {
        toast.error('No contract covers the check-in date. Extend a contract or pick a different date.')
      }
      return
    }
    if (selectedContract.effective_date && checkIn < selectedContract.effective_date) {
      toast.error(`Check-in is before the contract start (${selectedContract.effective_date}).`)
      return
    }
    if (selectedContract.expiry_date && checkIn > selectedContract.expiry_date) {
      toast.error(`Check-in is after the contract ends (${selectedContract.expiry_date}).`)
      return
    }
    if (selectedContract.effective_date && checkOut < selectedContract.effective_date) {
      toast.error(`Check-out is before the contract start (${selectedContract.effective_date}).`)
      return
    }
    if (selectedContract.expiry_date && checkOut > selectedContract.expiry_date) {
      toast.error(`Check-out is after the contract ends (${selectedContract.expiry_date}). Renew the contract or pick an earlier date.`)
      return
    }

    const stayNights = computeNights(checkIn, checkOut)
    if (stayNights <= 0) { toast.error('Invalid stay length'); return }

    const conflict = await findOverlappingBooking({
      unitId: form.unit_id,
      checkIn,
      checkOut,
      excludeId: editing?.id,
    })
    if (conflict) {
      toast.error(
        `This unit is already booked from ${conflict.check_in} to ${conflict.check_out} (booking ${conflict.booking_code}). Pick different dates.`
      )
      return
    }

    setSaving(true)
    try {
      const transactions = Array.isArray(editing?.transactions) ? [...editing.transactions] : []
      if (initialAmt > 0) {
        transactions.push({
          amount: initialAmt,
          method: initialMethod || '',
          reference: initialReference || '',
          date: initialDate || checkIn,
        })
      }

      const booker = specialists.find((s) => s.code === form.booker_code)
      const affiliate = affiliates.find((a) => a.code === form.affiliate_code)

      const newBookerCodeClean = sanitizeText(form.booker_code, { max: 40 }) || null
      const newAffiliateCodeClean = sanitizeText(form.affiliate_code, { max: 40 }) || null

      let finalBookerRate = bookerRate
      let finalAffiliateRate = affiliateRate
      let finalBookerComm = bookerCommission
      let finalAffiliateComm = affiliateCommission

      if (editing) {
        const bookerChanged = newBookerCodeClean !== (editing.booker_code || null)
        const affiliateChanged = newAffiliateCodeClean !== (editing.affiliate_code || null)

        if (!newBookerCodeClean) {
          finalBookerRate = null
          finalBookerComm = 0
        } else if (
          bookerChanged ||
          editing.booker_rate == null ||
          Number(editing.booker_commission || 0) === 0
        ) {
          finalBookerRate = bookerRate
          finalBookerComm = computeCommissionAtRate(totalAmt, bookerRate)
        } else {
          finalBookerRate = Number(editing.booker_rate)
          finalBookerComm = computeCommissionAtRate(totalAmt, finalBookerRate)
        }

        if (!newAffiliateCodeClean) {
          finalAffiliateRate = null
          finalAffiliateComm = 0
        } else if (
          affiliateChanged ||
          editing.affiliate_rate == null ||
          Number(editing.affiliate_commission || 0) === 0
        ) {
          finalAffiliateRate = affiliateRate
          finalAffiliateComm = computeCommissionAtRate(totalAmt, affiliateRate)
        } else {
          finalAffiliateRate = Number(editing.affiliate_rate)
          finalAffiliateComm = computeCommissionAtRate(totalAmt, finalAffiliateRate)
        }
      }

      const payload = {
        unit_id: form.unit_id,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_contact: guestContact,
        guests,
        check_in: checkIn,
        check_out: checkOut,
        total_amount: totalAmt,
        booker_code: newBookerCodeClean,
        booker_name: booker?.name ? sanitizeText(booker.name, { max: 120 }) : null,
        booker_commission: finalBookerComm,
        booker_rate: finalBookerRate,
        affiliate_code: newAffiliateCodeClean,
        affiliate_name: affiliate?.name ? sanitizeText(affiliate.name, { max: 120 }) : null,
        affiliate_commission: finalAffiliateComm,
        affiliate_rate: finalAffiliateRate,
        affiliate_notes: affiliateNotes,
        notes,
        transactions,
      }

      let savedBookingId = editing?.id
      let savedBookingCode = editing?.booking_code

      if (editing) {
        const checkOutChanged = checkOut !== editing.check_out

        const { error } = await supabase.from('bookings').update(payload).eq('id', editing.id)
        if (error) throw error
        logAudit('UPDATE_BOOKING', 'bookings', editing.id, {
          booking_code: editing.booking_code,
          booker_commission: finalBookerComm,
          affiliate_commission: finalAffiliateComm,
        }).catch(() => {})

        if (checkOutChanged) {
          const sync = await syncLinkedCleanings({
            bookingId: editing.id,
            newCheckIn: checkIn,
            newCheckOut: checkOut,
            bookingCode: editing.booking_code,
          })
          if (sync.updated > 0) {
            toast.success(`Booking updated · ${sync.updated} cleaning${sync.updated === 1 ? '' : 's'} rescheduled`)
          } else {
            toast.success('Booking updated')
          }
        } else {
          toast.success('Booking updated')
        }
      } else {
        payload.booking_code = generateBookingCode()
        const { data: inserted, error } = await supabase.from('bookings').insert(payload).select('id, booking_code').single()
        if (error) throw error
        savedBookingId = inserted?.id
        savedBookingCode = inserted?.booking_code
        logAudit('CREATE_BOOKING', 'bookings', savedBookingId, { booking_code: savedBookingCode }).catch(() => {})

        if (sendEmail && guestEmail) {
          try {
            await sendBookingConfirmation(savedBookingId)
            toast.success('Booking created · Confirmation email sent')
          } catch (emailErr) {
            console.error('Auto-send email failed:', emailErr)
            toast.error(`Booking created, but email failed: ${emailErr?.message || 'unknown error'}`)
          }
        } else {
          toast.success('Booking created')
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null
  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-foreground">{editing ? 'Edit Booking' : 'New Booking'}</h2>
            {editing && <p className="text-[11px] text-foreground font-mono mt-0.5">{editing.booking_code}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-3">Booking</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className={labelClass}>Unit *</label>
                <Select value={form.unit_id} onValueChange={(v) => setField('unit_id', v)}>
                  <SelectTrigger className="h-8 text-xs rounded w-full">
                    <SelectValue placeholder="Select a unit...">
                      {selectedUnit ? unitLabel(selectedUnit) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {unitsForDropdown.map((u) => <SelectItem key={u.id} value={u.id} className="text-xs">{unitLabel(u)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedUnit && !selectedContract && (
                  <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 font-semibold">
                    {contracts.some((c) => c.unit_id === selectedUnit.id)
                      ? 'No active contract at this date. Extend a contract or pick a different date.'
                      : 'This unit has no contract. Create one first.'}
                  </p>
                )}
                {selectedUnit && selectedContract && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Contract: {selectedContract.effective_date || '—'} → {selectedContract.expiry_date || 'open-ended'}
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Booked by</label>
                <Select value={form.booker_code || '__none__'} onValueChange={(v) => setField('booker_code', v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs rounded w-full">
                    <SelectValue placeholder="No specialist">
                      {form.booker_code
                        ? (specialists.find((s) => s.code === form.booker_code)?.name || form.booker_code)
                        : <span className="text-muted-foreground italic">No specialist</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs italic text-muted-foreground">No specialist</SelectItem>
                    {specialists.map((s) => (
                      <SelectItem key={s.id} value={s.code} className="text-xs">
                        {s.name} <span className="text-muted-foreground font-mono ml-1">· {s.code}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-3">Guest</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div><label className={labelClass}>Guest Name *</label><Input value={form.guest_name} onChange={(e) => setField('guest_name', e.target.value)} className="h-8 text-xs rounded" maxLength={120} autoFocus /></div>
              <div><label className={labelClass}>Guests</label><Input type="number" min={1} max={50} value={form.guests} onChange={(e) => setField('guests', e.target.value)} className="h-8 text-xs rounded" /></div>
              <div><label className={labelClass}>Email</label><Input type="email" value={form.guest_email} onChange={(e) => setField('guest_email', e.target.value)} className="h-8 text-xs rounded" maxLength={254} /></div>
              <div><label className={labelClass}>Contact</label><Input type="tel" value={form.guest_contact} onChange={(e) => setField('guest_contact', e.target.value)} className="h-8 text-xs rounded" maxLength={40} /></div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-3">Dates & Amount</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
              <div>
                <label className={labelClass}>Check-in *</label>
                <DateFieldPicker
                  value={form.check_in}
                  onChange={(v) => setField('check_in', v)}
                  placeholder={`From ${STAY_TIMES.checkIn.label}`}
                  bookings={unitBookings}
                  minDate={selectedContract?.effective_date || todayISO()}
                  maxDate={selectedContract?.expiry_date || undefined}
                  excludeBookingId={editing?.id}
                  otherDateISO={form.check_out || null}
                  mode="check-in"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  From {STAY_TIMES.checkIn.label}
                </p>
              </div>
              <div>
                <label className={labelClass}>Check-out *</label>
                <DateFieldPicker
                  value={form.check_out}
                  onChange={(v) => setField('check_out', v)}
                  placeholder={`Before ${STAY_TIMES.checkOut.label}`}
                  bookings={unitBookings}
                  minDate={form.check_in || selectedContract?.effective_date || todayISO()}
                  maxDate={selectedContract?.expiry_date || undefined}
                  excludeBookingId={editing?.id}
                  otherDateISO={form.check_in || null}
                  mode="check-out"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Before {STAY_TIMES.checkOut.label}
                </p>
              </div>
              <div>
                <label className={labelClass}>Nights</label>
                <Input value={nights} readOnly className="h-8 text-xs rounded bg-muted/50" />
                {form.unit_id && unitBookings.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {unitBookings.length} existing booking{unitBookings.length === 1 ? '' : 's'} · red dots mark occupied days
                  </p>
                )}
                {!form.unit_id && (
                  <p className="text-[10px] text-muted-foreground italic mt-1">
                    Pick a unit to see existing bookings
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 mt-3">
              <div><label className={labelClass}>Total Amount (₱) *</label><Input type="number" min={0} value={form.total_amount} onChange={(e) => setField('total_amount', e.target.value)} className="h-8 text-xs rounded" /></div>
              <div><label className={labelClass}>Notes</label><Input value={form.notes} onChange={(e) => setField('notes', e.target.value)} className="h-8 text-xs rounded" maxLength={2000} /></div>
            </div>
          </section>

          {!editing && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-3">Initial Payment (optional)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                <div><label className={labelClass}>Amount (₱)</label><Input type="number" min={0} value={form.initial_amount} onChange={(e) => setField('initial_amount', e.target.value)} className="h-8 text-xs rounded" /></div>
                <div><label className={labelClass}>Method</label><Input value={form.initial_method} onChange={(e) => setField('initial_method', e.target.value)} placeholder="GCash, Bank..." className="h-8 text-xs rounded" maxLength={60} /></div>
                <div><label className={labelClass}>Reference</label><Input value={form.initial_reference} onChange={(e) => setField('initial_reference', e.target.value)} className="h-8 text-xs rounded" maxLength={100} /></div>
                <div><label className={labelClass}>Date</label><Input type="date" value={form.initial_date} onChange={(e) => setField('initial_date', e.target.value)} className="h-8 text-xs rounded" /></div>
              </div>
              {initialAmount > 0 && totalAmount > 0 && (
                <p className="text-[10px] mt-2">
                  <span className="text-foreground">After this payment: </span>
                  {willBePaid ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">Fully Paid</span> : willBePartial ? <><span className="font-semibold text-amber-600 dark:text-amber-400">Partial</span><span className="text-foreground"> — remaining {formatMoney(remaining)}</span></> : null}
                </p>
              )}
            </section>
          )}

          {!editing && (
            <section>
              <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">Send booking confirmation email</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    After the booking is created, the guest will receive a confirmation email with their stay details.
                    You can also send it later from the booking panel.
                  </p>
                </div>
              </label>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-foreground">Affiliate / Commissions</h3>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock size={9} className="opacity-60" />
                Auto-calculated from total
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className={labelClass}>Affiliate</label>
                <Select value={form.affiliate_code || '__none__'} onValueChange={(v) => setField('affiliate_code', v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs rounded w-full">
                    <SelectValue placeholder="No affiliate">
                      {form.affiliate_code
                        ? (affiliates.find((a) => a.code === form.affiliate_code)?.name || form.affiliate_code)
                        : <span className="text-muted-foreground italic">No affiliate</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs italic text-muted-foreground">No affiliate</SelectItem>
                    {affiliates.map((a) => {
                      const cnt = affiliateCounts?.[a.code] || 0
                      const tier = getTierInfo(cnt)
                      return (
                        <SelectItem key={a.id} value={a.code} className="text-xs">
                          {a.name} <span className="text-muted-foreground font-mono ml-1">· {a.code}</span>
                          <span className="text-muted-foreground ml-2">({tier.tier} · {tier.rate}%)</span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={labelClass}>Affiliate Commission (₱)</label>
                <div className="relative">
                  <Input type="number" value={affiliateCommission} readOnly tabIndex={-1}
                    className="h-8 text-xs rounded bg-muted/50 cursor-not-allowed pr-20" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock size={9} className="opacity-60" />
                    Auto
                  </span>
                </div>
                {form.affiliate_code && affiliateRate != null ? (
                  <p className="text-[10px] text-foreground mt-1">
                    {getTierInfo(affiliateCount).tier} · {affiliateRate}% of {formatMoney(totalAmount)} · <span className="italic">{affiliateCount} completed</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic mt-1">Select an affiliate to enable</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 mt-3">
              <div>
                <label className={labelClass}>Booker Commission (₱)</label>
                <div className="relative">
                  <Input type="number" value={bookerCommission} readOnly tabIndex={-1}
                    className="h-8 text-xs rounded bg-muted/50 cursor-not-allowed pr-20" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock size={9} className="opacity-60" />
                    Auto
                  </span>
                </div>
                {form.booker_code && bookerRate != null ? (
                  <p className="text-[10px] text-foreground mt-1">Flat {bookerRate}% of {formatMoney(totalAmount)}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic mt-1">Select a specialist to enable</p>
                )}
              </div>
              <div><label className={labelClass}>Affiliate Notes</label><Input value={form.affiliate_notes} onChange={(e) => setField('affiliate_notes', e.target.value)} className="h-8 text-xs rounded" maxLength={2000} /></div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Booking'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function AddPaymentModal({ open, onClose, booking, onSaved }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setAmount(''); setMethod(''); setReference(''); setDate(new Date().toISOString().slice(0, 10)) }
  }, [open])

  if (!open || !booking) return null

  const save = async () => {
    const amt = sanitizeMoney(amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (amt > 100_000_000) { toast.error('Amount too large'); return }

    const cleanMethod = sanitizeText(method, { max: 60 })
    const cleanReference = sanitizeText(reference, { max: 100 })
    const cleanDate = sanitizeDateOnly(date) || new Date().toISOString().slice(0, 10)

    setSaving(true)
    try {
      const tx = Array.isArray(booking.transactions) ? [...booking.transactions] : []
      if (tx.length >= 500) { toast.error('Too many payments on this booking'); return }
      tx.push({ amount: amt, method: cleanMethod || '', reference: cleanReference || '', date: cleanDate })
      const { error } = await supabase.from('bookings').update({ transactions: tx }).eq('id', booking.id)
      if (error) throw error
      logAudit('ADD_BOOKING_PAYMENT', 'bookings', booking.id, { amount: amt, method: cleanMethod || '' }).catch(() => {})
      toast.success('Payment added')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to add payment')
    } finally { setSaving(false) }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'
  const paid = Number(booking.amount_paid || 0)
  const total = Number(booking.total_amount || 0)
  const balance = Math.max(0, total - paid)

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="relative bg-card rounded-md shadow-2xl max-w-md w-full border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-bold">Add Payment</h3>
            <p className="text-xs text-foreground font-mono">{booking.booking_code}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs bg-muted/40 rounded p-3">
            <div><div className="text-foreground">Total</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(total)}</div></div>
            <div><div className="text-foreground">Paid</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(paid)}</div></div>
            <div><div className="text-foreground">Balance</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(balance)}</div></div>
          </div>
          <div><label className={labelClass}>Amount (₱) *</label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-xs rounded" autoFocus /></div>
          <div><label className={labelClass}>Method</label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="GCash, Bank transfer, Cash..." className="h-8 rounded text-xs" maxLength={60} /></div>
          <div><label className={labelClass}>Reference</label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-8 text-xs rounded" maxLength={100} /></div>
          <div><label className={labelClass}>Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs rounded" /></div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={save} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Add Payment'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function ExtendStayModal({ open, onClose, booking, onSaved, contracts }) {
  const [newCheckOut, setNewCheckOut] = useState('')
  const [newTotal, setNewTotal] = useState('')
  const [addPayment, setAddPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payReference, setPayReference] = useState('')
  const [payDate, setPayDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && booking) {
      setNewCheckOut(booking.check_out || '')
      setNewTotal(booking.total_amount || '')
      setAddPayment(false)
      setPayAmount(''); setPayMethod(''); setPayReference('')
      setPayDate(new Date().toISOString().slice(0, 10))
    }
  }, [open, booking])

  const governingContract = useMemo(() => {
    if (!booking) return null
    const unit = booking.units
      ? { id: booking.unit_id, unit_code: booking.units.unit_code, building: booking.units.building }
      : { id: booking.unit_id }
    return findGoverningContract(unit, contracts || [])
  }, [booking, contracts])

  if (!open || !booking) return null

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'

  const snapshotBookerRate =
    booking.booker_rate != null
      ? Number(booking.booker_rate)
      : (booking.booker_code ? SPECIALIST_FLAT_RATE : null)

  const bookerRateWasInferred =
    !!booking.booker_code && booking.booker_rate == null

  const snapshotAffiliateRate =
    booking.affiliate_rate != null ? Number(booking.affiliate_rate) : null

  const affiliateRateWasInferred =
    !!booking.affiliate_code && booking.affiliate_rate == null

  const previewTotal = Number(newTotal) || 0

  const previewBooker = booking.booker_code && snapshotBookerRate != null && !bookerRateWasInferred
    ? computeCommissionAtRate(previewTotal, snapshotBookerRate)
    : 0
  const previewAffiliate = booking.affiliate_code && snapshotAffiliateRate != null && !affiliateRateWasInferred
    ? computeCommissionAtRate(previewTotal, snapshotAffiliateRate)
    : 0

  const save = async () => {
    const newCheckOutClean = sanitizeDateOnly(newCheckOut)
    if (!newCheckOutClean) { toast.error('Set a new check-out date'); return }

    const oldCheckOut = parseDateOnly(booking.check_out)
    const parsed = parseDateOnly(newCheckOutClean)
    if (parsed <= oldCheckOut) { toast.error('New check-out must be after the current one'); return }

    if (!governingContract) {
      toast.error('No contract covers this unit. Cannot extend.')
      return
    }
    if (governingContract.effective_date && newCheckOutClean < governingContract.effective_date) {
      toast.error(`New check-out is before the contract start (${governingContract.effective_date}).`)
      return
    }
    if (governingContract.expiry_date && newCheckOutClean > governingContract.expiry_date) {
      toast.error(`New check-out is after the contract ends (${governingContract.expiry_date}). Renew the contract first.`)
      return
    }

    const conflict = await findOverlappingBooking({
      unitId: booking.unit_id,
      checkIn: booking.check_in,
      checkOut: newCheckOutClean,
      excludeId: booking.id,
    })
    if (conflict) {
      toast.error(
        `Extending would overlap with booking ${conflict.booking_code} (${conflict.check_in} → ${conflict.check_out}). Pick an earlier check-out.`
      )
      return
    }

    const total = sanitizeMoney(newTotal)
    if (total <= 0) { toast.error('Total amount must be greater than 0'); return }

    const alreadyPaidBase = Number(booking.amount_paid || 0)
    if (total < alreadyPaidBase) {
      toast.error(
        `New total (${formatMoney(total)}) is less than already paid (${formatMoney(alreadyPaidBase)}). ` +
        `Refund existing payments first, or raise the new total.`
      )
      return
    }

    let payAmt = 0
    let payMethodClean = null
    let payRefClean = null
    let payDateClean = null
    if (addPayment) {
      payAmt = sanitizeMoney(payAmount)
      if (!payAmt || payAmt <= 0) { toast.error('Enter a valid extension payment amount'); return }

      if (alreadyPaidBase + payAmt > total) {
        const maxExtra = Math.max(0, total - alreadyPaidBase)
        toast.error(`Payment would overpay. Max extra: ${formatMoney(maxExtra)}`)
        return
      }

      payMethodClean = sanitizeText(payMethod, { max: 60 })
      payRefClean = sanitizeText(payReference, { max: 100 })
      payDateClean = sanitizeDateOnly(payDate) || new Date().toISOString().slice(0, 10)
    }

    setSaving(true)
    try {
      const tx = Array.isArray(booking.transactions) ? [...booking.transactions] : []
      if (addPayment) {
        tx.push({ amount: payAmt, method: payMethodClean || '', reference: payRefClean || '', date: payDateClean })
      }

      const newBookerComm =
        booking.booker_code && booking.booker_rate != null
          ? computeCommissionAtRate(total, Number(booking.booker_rate))
          : (booking.booker_code ? booking.booker_commission : 0)

      const newAffComm =
        booking.affiliate_code && booking.affiliate_rate != null
          ? computeCommissionAtRate(total, Number(booking.affiliate_rate))
          : (booking.affiliate_code ? booking.affiliate_commission : 0)

      const patch = {
        check_out: newCheckOutClean,
        total_amount: total,
        transactions: tx,
        booker_commission: newBookerComm,
        affiliate_commission: newAffComm,
      }
      const { error } = await supabase.from('bookings').update(patch).eq('id', booking.id)
      if (error) throw error

      logAudit('EXTEND_BOOKING', 'bookings', booking.id, {
        booking_code: booking.booking_code,
        old_check_out: booking.check_out,
        new_check_out: newCheckOutClean,
        old_total: booking.total_amount,
        new_total: total,
        added_payment: addPayment ? payAmt : 0,
        booker_rate_inferred: bookerRateWasInferred,
        affiliate_rate_inferred: affiliateRateWasInferred,
      }).catch(() => {})

      const sync = await syncLinkedCleanings({
        bookingId: booking.id,
        newCheckIn: booking.check_in,
        newCheckOut: newCheckOutClean,
        bookingCode: booking.booking_code,
      })

      if (sync.updated > 0) {
        toast.success(`Booking extended · ${sync.updated} cleaning${sync.updated === 1 ? '' : 's'} rescheduled`)
      } else {
        toast.success('Booking extended')
      }
      if (sync.failed > 0) {
        toast.error(`${sync.failed} cleaning${sync.failed === 1 ? '' : 's'} failed to reschedule — check Housekeeping`)
      }

      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to extend')
    } finally { setSaving(false) }
  }

  const oldNights = computeNights(booking.check_in, booking.check_out)
  const newNights = computeNights(booking.check_in, newCheckOut)

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="relative bg-card rounded-md shadow-2xl max-w-md w-full border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-bold">Extend Stay</h3>
            <p className="text-xs text-foreground font-mono">{booking.booking_code} · {booking.guest_name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded p-3">
            <div><div className="text-foreground">Current check-out</div><div className="font-semibold text-foreground">{formatDate(booking.check_out)}</div></div>
            <div><div className="text-foreground">Current nights</div><div className="font-semibold tabular-nums text-foreground">{oldNights}</div></div>
          </div>

          {bookerRateWasInferred && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
              <strong>Booker rate missing on this booking.</strong> Commission will
              <em> not </em> be recalculated when extending — the existing value stays.
              Edit the booking directly if you need to change the rate.
            </div>
          )}

          {affiliateRateWasInferred && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
              <strong>Affiliate rate missing on this booking.</strong> Commission will
              <em> not </em> be recalculated when extending.
            </div>
          )}

          {governingContract && (
            <p className="text-[10px] text-muted-foreground">
              Contract range: {governingContract.effective_date || '—'} → {governingContract.expiry_date || 'open-ended'}
            </p>
          )}
          <div>
            <label className={labelClass}>New Check-out *</label>
            <Input
              type="date"
              value={newCheckOut}
              onChange={(e) => setNewCheckOut(e.target.value)}
              min={booking.check_out || governingContract?.effective_date || undefined}
              max={governingContract?.expiry_date || undefined}
              className="h-8 text-xs rounded"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Before {STAY_TIMES.checkOut.label} · linked cleanings will move to this date
            </p>
          </div>
          <div>
            <label className={labelClass}>New Total Amount (₱) *</label>
            <Input type="number" min={0} value={newTotal} onChange={(e) => setNewTotal(e.target.value)} className="h-8 text-xs rounded" />
            {Number(newTotal) > 0 && Number(newTotal) < Number(booking.amount_paid || 0) && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                ⚠ Total is below already-paid amount ({formatMoney(booking.amount_paid)}). Save will be blocked.
              </p>
            )}
          </div>
          {newNights > oldNights && <p className="text-[10px] text-foreground">Extended by {newNights - oldNights} night{newNights - oldNights === 1 ? '' : 's'} · new total {newNights} night{newNights === 1 ? '' : 's'}</p>}

          {(booking.booker_code || booking.affiliate_code) && previewTotal > 0 && (
            <div className="rounded-md bg-muted/40 border border-border p-2.5 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
                <Lock size={9} className="opacity-60" />
                {bookerRateWasInferred || affiliateRateWasInferred
                  ? 'Existing commissions will be preserved'
                  : 'Recalculated commissions'}
              </p>
              {booking.booker_code && snapshotBookerRate != null && !bookerRateWasInferred && (
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">Booker ({snapshotBookerRate}%)</span>
                  <span className="font-semibold tabular-nums text-foreground">{formatMoney(previewBooker)}</span>
                </div>
              )}
              {booking.affiliate_code && snapshotAffiliateRate != null && !affiliateRateWasInferred && (
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">Affiliate ({snapshotAffiliateRate}%)</span>
                  <span className="font-semibold tabular-nums text-foreground">{formatMoney(previewAffiliate)}</span>
                </div>
              )}
              {(bookerRateWasInferred || affiliateRateWasInferred) && (
                <p className="text-[10px] text-muted-foreground italic">
                  Commission fields will retain their current values.
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs pt-2 border-t border-border">
            <input type="checkbox" checked={addPayment} onChange={(e) => setAddPayment(e.target.checked)} className="rounded border-border" />
            <span className="text-foreground">Add extension payment now</span>
          </label>
          {addPayment && (
            <div className="space-y-2 pl-5 border-l-2 border-border">
              <div><label className={labelClass}>Amount (₱)</label><Input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="h-8 text-xs rounded" /></div>
              <div><label className={labelClass}>Method</label><Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="GCash, Bank..." className="h-8 text-xs rounded" maxLength={60} /></div>
              <div><label className={labelClass}>Reference</label><Input value={payReference} onChange={(e) => setPayReference(e.target.value)} className="h-8 text-xs rounded" maxLength={100} /></div>
              <div><label className={labelClass}>Date</label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-8 text-xs rounded" /></div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={save} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <CalendarIcon size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Extend Stay'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function CompleteConfirmModal({ open, onClose, booking, onConfirmed }) {
  const [saving, setSaving] = useState(false)
  if (!open || !booking) return null

  const confirm = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('bookings').update({ completed_at: new Date().toISOString() }).eq('id', booking.id)
      if (error) throw error
      logAudit('COMPLETE_BOOKING', 'bookings', booking.id, { booking_code: booking.booking_code }).catch(() => {})
      toast.success('Booking marked as done')
      onConfirmed()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to complete')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="relative bg-card rounded-md shadow-2xl max-w-sm w-full border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-bold">Mark as Done?</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-2 text-xs">
          <p className="text-foreground">This booking will be marked as done. You can no longer add payments or extend it.</p>
          <div className="bg-muted/40 rounded p-3 space-y-1 mt-3">
            <div className="flex justify-between"><span className="text-foreground">Code</span><span className="font-mono font-semibold text-foreground">{booking.booking_code}</span></div>
            <div className="flex justify-between"><span className="text-foreground">Guest</span><span className="font-semibold text-foreground">{booking.guest_name}</span></div>
            <div className="flex justify-between"><span className="text-foreground">Check-out</span><span className="font-semibold text-foreground">{formatDate(booking.check_out)}</span></div>
            <div className="flex justify-between"><span className="text-foreground">Total</span><span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.total_amount)}</span></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={confirm} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Mark as Done'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export default function BookingsPage({ initialSelectedId }) {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [units, setUnits] = useState([])
  const [specialists, setSpecialists] = useState([])
  const [affiliates, setAffiliates] = useState([])
  const [contracts, setContracts] = useState([])
  const [affiliateCounts, setAffiliateCounts] = useState({})

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState(() => {
  if (typeof window === 'undefined') return 'all'
  const f = new URLSearchParams(window.location.search).get('filter')
  if (f && ['in-house', 'upcoming', 'unpaid', 'active', 'needs-action', 'completed', 'cancelled'].includes(f)) return f
  return 'all'
  })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [selectedId, setSelectedId] = useState(initialSelectedId || null)
  const [highlightedId, setHighlightedId] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [payForBooking, setPayForBooking] = useState(null)
  const [extendForBooking, setExtendForBooking] = useState(null)
  const [completeForBooking, setCompleteForBooking] = useState(null)
  const [confirmForBooking, setConfirmForBooking] = useState(null)

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
          const el = document.querySelector(`[data-booking-id="${initialSelectedId}"]`)
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
      const [bRes, uRes, sRes, aRes, cRes] = await Promise.all([
        supabase.from('bookings').select('*, units:unit_id ( id, unit_code, building )').is('deleted_at', null).order('check_in', { ascending: false }).limit(500),
        supabase.from('units').select('id, unit_code, building, status, current_contract_id').order('unit_code'),
        supabase.from('specialists').select('id, code, name').order('name'),
        supabase.from('affiliates').select('id, code, name').order('name'),
        supabase.from('contracts').select('id, unit_id, contract_code, effective_date, expiry_date'),
      ])
      if (bRes.error) throw bRes.error
      if (uRes.error) throw uRes.error
      if (sRes.error) throw sRes.error
      if (aRes.error) throw aRes.error
      if (cRes.error) throw cRes.error
      setBookings(bRes.data || [])
      setUnits(uRes.data || [])
      setSpecialists(sRes.data || [])
      setAffiliates(aRes.data || [])
      setContracts(cRes.data || [])

      const affCounts = await fetchAffiliateCounts((aRes.data || []).map((a) => a.code))
      setAffiliateCounts(affCounts)
    } catch (err) {
      console.error('Failed to load bookings:', err)
      toast.error('Failed to load bookings')
    } finally {
      setIsFirstLoad(false); setIsRefreshing(false); hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const ch = supabase.channel(`bookings-realtime-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const activeUnits = useMemo(() => {
    const todayStr = todayISO()

    const byUnit = new Map()
    for (const c of contracts) {
      if (!c.effective_date) continue
      if (c.effective_date > todayStr) continue
      if (c.expiry_date && c.expiry_date < todayStr) continue

      const existing = byUnit.get(c.unit_id)
      if (!existing || (c.effective_date > existing.effective_date)) {
        byUnit.set(c.unit_id, c)
      }
    }

    return units.filter((u) => {
      if (u.status !== 'ACTIVE') return false

      if (u.current_contract_id) {
        const c = contracts.find((x) => x.id === u.current_contract_id)
        if (c && c.effective_date && c.effective_date <= todayStr) {
          if (!c.expiry_date || c.expiry_date >= todayStr) return true
        }
      }

      return byUnit.has(u.id)
    })
  }, [units, contracts])

  const counts = useMemo(() => {
    const today = todayISO()
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []

    const scoped = tokens.length === 0
      ? bookings
      : bookings.filter((b) => {
          const hay = [
            b.booking_code, b.guest_name, b.guest_email, b.guest_contact,
            b.booker_code, b.booker_name, b.affiliate_code, b.affiliate_name, b.notes,
            b.units?.unit_code, b.units?.building,
          ].filter(Boolean).join(' ').toLowerCase()
          return tokens.every((tok) => hay.includes(tok))
        })

    const c = {
      all: scoped.length,
      'in-house': 0,
      upcoming: 0,
      active: 0,
      'needs-action': 0,
      completed: 0,
      unpaid: 0,
      cancelled: 0,
    }
    for (const b of scoped) {
      const s = deriveBookingStatus(b)
      if (c[s] !== undefined) c[s]++
      if (!b.completed_at && !b.cancelled_at && b.check_in && b.check_out && b.check_in <= today && b.check_out >= today) {
        c['in-house']++
      }
      if (!b.completed_at && !b.cancelled_at && Number(b.balance || 0) > 0) {
        c['unpaid']++
      }
    }
    return c
  }, [bookings, debouncedSearch])

  const todayISOStr = useMemo(() => todayISO(), [])

  const checkInsToday = useMemo(
    () => bookings.filter((b) => b.check_in === todayISOStr && !b.deleted_at && !b.cancelled_at),
    [bookings, todayISOStr],
  )
  const checkOutsToday = useMemo(
    () => bookings.filter((b) => b.check_out === todayISOStr && !b.deleted_at && !b.cancelled_at),
    [bookings, todayISOStr],
  )

  const needsCompletion = useMemo(
    () => bookings.filter((b) => deriveBookingStatus(b) === 'needs-action'),
    [bookings],
  )
  const endingSoon = useMemo(
    () => bookings.filter((b) => {
      const t = today()
      const twoDays = new Date(t); twoDays.setDate(twoDays.getDate() + 2)
      if (b.completed_at || b.cancelled_at) return false
      if (b.payment_status === 'paid') return false
      const co = parseDateOnly(b.check_out)
      return co >= t && co <= twoDays
    }),
    [bookings],
  )

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const today = todayISO()
    return bookings.filter((b) => {
      const derived = deriveBookingStatus(b)

      if (statusFilter !== 'all') {
        if (statusFilter === 'in-house') {
          if (b.completed_at || b.cancelled_at) return false
          if (!b.check_in || !b.check_out) return false
          if (b.check_in > today || b.check_out < today) return false
        } else if (statusFilter === 'upcoming') {
          if (b.completed_at || b.cancelled_at) return false
          if (!b.check_in) return false
          if (b.check_in <= today) return false
        } else if (statusFilter === 'unpaid') {
          if (b.completed_at || b.cancelled_at) return false
          if (Number(b.balance || 0) <= 0) return false
        } else {
          if (derived !== statusFilter) return false
        }
      }

      if (tokens.length > 0) {
        const haystack = [
          b.booking_code, b.guest_name, b.guest_email, b.guest_contact,
          b.booker_code, b.booker_name, b.affiliate_code, b.affiliate_name, b.notes,
          b.units?.unit_code, b.units?.building,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!tokens.every((tok) => haystack.includes(tok))) return false
      }
      return true
    })
  }, [bookings, statusFilter, debouncedSearch])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (statusFilter === 'all') url.searchParams.delete('filter')
    else url.searchParams.set('filter', statusFilter)
    window.history.replaceState({}, '', url.toString())
  }, [statusFilter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a.check_in ?? '', bv = b.check_in ?? ''
      if (av > bv) return -1
      if (av < bv) return 1
      return 0
    })
    return copy
  }, [filtered])

  const selected = useMemo(() => sorted.find((b) => b.id === selectedId) || null, [sorted, selectedId])

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return }
    downloadCSV(filtered, `bookings_${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success('Exported')
  }

  const handleSelect = (booking) => setSelectedId((prev) => (prev === booking.id ? null : booking.id))
  const openEdit = (booking) => { setEditing(booking); setFormOpen(true) }
  const openNew = () => { setEditing(null); setFormOpen(true) }

  const handleTodayPanelRowClick = useCallback((booking) => {
    setSelectedId(booking.id)
    setHighlightedId(booking.id)
    setStatusFilter('all')

    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    highlightTimeoutRef.current = setTimeout(() => setHighlightedId(null), 2000)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-booking-id="${booking.id}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }, [])

  const handleCancelBooking = useCallback(async (booking) => {
    const confirmed = window.confirm(
      `Cancel booking "${booking.booking_code}"?\n\n` +
      `Guest: ${booking.guest_name}\n` +
      `Dates: ${formatDate(booking.check_in)} → ${formatDate(booking.check_out)}\n\n` +
      `The booking stays in the system and is excluded from occupancy and unpaid counters. You can restore it later.`
    )
    if (!confirmed) return

    const reason = window.prompt('Reason for cancellation (optional):', '') || null

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason,
        })
        .eq('id', booking.id)
      if (error) throw error

      logAudit('CANCEL_BOOKING', 'bookings', booking.id, {
        booking_code: booking.booking_code,
        reason,
      }).catch(() => {})

      toast.success('Booking cancelled')
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to cancel')
    }
  }, [fetchData])

  const handleRestoreBooking = useCallback(async (booking) => {
    const confirmed = window.confirm(
      `Restore booking "${booking.booking_code}"?\n\nIt will re-enter the active bookings list.`
    )
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ cancelled_at: null, cancelled_reason: null })
        .eq('id', booking.id)
      if (error) throw error

      logAudit('RESTORE_BOOKING', 'bookings', booking.id, {
        booking_code: booking.booking_code,
      }).catch(() => {})

      toast.success('Booking restored')
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to restore')
    }
  }, [fetchData])

  const handleDelete = async (booking) => {
    const confirmed = window.confirm(
      `Delete booking "${booking.booking_code}"?\n\nGuest: ${booking.guest_name}\nUnit: ${booking.units?.unit_code || '—'}\nDates: ${formatDate(booking.check_in)} → ${formatDate(booking.check_out)}\nTotal: ${formatMoney(booking.total_amount)}\nPaid: ${formatMoney(booking.amount_paid)}\n\nThis will soft-delete the booking (keeps commission history).`
    )
    if (!confirmed) return
    const doubleCheck = window.confirm('Are you absolutely sure?')
    if (!doubleCheck) return
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', booking.id)
        .is('deleted_at', null)
      if (error) throw error
      logAudit('DELETE_BOOKING', 'bookings', booking.id, { booking_code: booking.booking_code }).catch(() => {})
      toast.success('Booking deleted')
      setSelectedId(null)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to delete')
    }
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-y-auto">

        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards bookings={bookings} />
        </div>

        <div className="flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1 pb-2">
          <TodayPanel
            title="Check-ins today"
            icon={LogIn}
            rows={checkInsToday}
            loading={isFirstLoad}
            empty="No check-ins today"
            onRowClick={handleTodayPanelRowClick}
          />
          <TodayPanel
            title="Check-outs today"
            icon={LogOut}
            rows={checkOutsToday}
            loading={isFirstLoad}
            empty="No check-outs today"
            onRowClick={handleTodayPanelRowClick}
          />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search guest, booking code, unit, email, booker, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded" />
          </div>
          <Button size="sm" className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]" style={{ backgroundColor: BRAND }} onClick={openNew}>
            <Plus size={13} />
            <span className="hidden sm:inline ml-1">New Booking</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
            <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded transition-all duration-150">
            <Download size={13} />
          </Button>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
          <WarningsStrip
            needsCompletion={needsCompletion}
            endingSoon={endingSoon}
            onSelect={(b) => setSelectedId(b.id)}
          />
        </div>

        <div className="flex-shrink-0 rounded border border-border shadow-sm overflow-hidden bg-card flex flex-col">
          <div className={cn('flex-shrink-0 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Guest</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Code</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Unit</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Check-in → Check-out</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Payment</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground text-right truncate">Status</span>
          </div>

          <div className="h-[280px] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
            {isFirstLoad ? (
              <div className="space-y-2 p-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : sorted.length === 0 ? (
              <div className="flex items-center justify-center text-center py-12">
                <div>
                  <CalendarIcon size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-foreground font-semibold">No bookings match your filters</p>
                  <p className="text-xs text-muted-foreground mt-1">Try clearing filters or creating a new booking</p>
                </div>
              </div>
            ) : (
              sorted.map((booking) => (
                <BookingListRow
                  key={booking.id}
                  booking={booking}
                  contracts={contracts}
                  selected={selectedId === booking.id}
                  highlighted={highlightedId === booking.id}
                  onClick={() => handleSelect(booking)}
                  onViewCleaning={(b) => navigate(`/admin?tab=housekeeping&fromBooking=${b.id}`)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <BookingDetailPanel
            booking={selected}
            contracts={contracts}
            onBookingChange={() => {}}
            onClose={() => setSelectedId(null)}
            onAddPayment={() => setPayForBooking(selected)}
            onExtend={() => setExtendForBooking(selected)}
            onComplete={() => setCompleteForBooking(selected)}
            onEdit={() => openEdit(selected)}
            onDelete={() => handleDelete(selected)}
            onEmail={() => setConfirmForBooking(selected)}
            onCancel={() => handleCancelBooking(selected)}
            onRestore={() => handleRestoreBooking(selected)}
          />
        )}
      </AnimatePresence>

      <BookingFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={fetchData}
        units={activeUnits}
        editing={editing}
        specialists={specialists}
        affiliates={affiliates}
        affiliateCounts={affiliateCounts}
        contracts={contracts}
        bookings={bookings}
      />

      <AddPaymentModal open={!!payForBooking} onClose={() => setPayForBooking(null)} booking={payForBooking} onSaved={fetchData} />
      <ExtendStayModal open={!!extendForBooking} onClose={() => setExtendForBooking(null)} booking={extendForBooking} onSaved={fetchData} contracts={contracts} />
      <CompleteConfirmModal open={!!completeForBooking} onClose={() => setCompleteForBooking(null)} booking={completeForBooking} onConfirmed={fetchData} />
      <BookingConfirmationModal
        open={!!confirmForBooking}
        onClose={() => setConfirmForBooking(null)}
        booking={confirmForBooking}
        onSent={fetchData}
      />
    </div>
  )
}