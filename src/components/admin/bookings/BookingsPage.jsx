// src/components/admin/bookings/BookingsPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Loader2,
  Plus, RefreshCw, Search, X, Trash2,
  Building2, CheckCircle2, Clock, AlertTriangle, Calendar as CalendarIcon, User, Wallet, Users,
  Edit2, Lock, LogIn, LogOut, ChevronLeft, ChevronRight,
  Mail, Copy, Sparkles, ChevronDown,
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
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'

const STATUS_PILLS = [
  { id: 'all',              label: 'All' },
  { id: 'in-house',         label: 'In-House' },
  { id: 'upcoming',         label: 'Upcoming' },
  { id: 'checked-out',      label: 'Checked Out' },
  { id: 'needs-attention',  label: 'Needs Attention' },
  { id: 'completed',        label: 'Done' },
  { id: 'unpaid',           label: 'Unpaid' },
]

const ROW_GRID = 'grid grid-cols-[1.4fr_1fr_1.2fr_1.1fr_1fr_160px] gap-4 items-center'
const PANEL_WIDTH = 448

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['S','M','T','W','T','F','S']

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

    let updated = 0, failed = 0
    for (const c of linked) {
      const patch = {}
      if (c.scheduled_date !== newCheckOut) patch.scheduled_date = newCheckOut
      if (c.type !== newType) patch.type = newType
      if (Object.keys(patch).length === 0) continue

      const { error: updErr } = await supabase.from('cleanings').update(patch).eq('id', c.id)
      if (updErr) { failed++; continue }
      updated++
      logAudit('AUTO_UPDATE_CLEANING_ON_BOOKING_CHANGE', 'cleanings', c.id, {
        booking_id: bookingId, booking_code: bookingCode, changes: patch,
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
  if (b.completed_at) return 'completed'
  const t = today()
  const ci = parseDateOnly(b.check_in)
  const co = parseDateOnly(b.check_out)
  if (!ci || !co) return 'upcoming'
  if (t < ci) return 'upcoming'
  if (t <= co) return 'in-house'
  return b.payment_status === 'paid' ? 'checked-out' : 'needs-attention'
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
function GuestAvatar({ name, photo_url = null, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-[11px]' : size === 'xs' ? 'w-6 h-6 text-[9px]' : 'w-10 h-10 text-sm'
  if (photo_url) {
    return <img src={photo_url} alt={name} className={cn('rounded-full object-cover flex-shrink-0', sizeClasses)} />
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

const BOOKING_STATUS_TEXT = {
  upcoming:          { label: 'Upcoming',        className: 'text-blue-600 dark:text-blue-400' },
  'in-house':        { label: 'In-House',        className: 'text-emerald-600 dark:text-emerald-400' },
  'checked-out':     { label: 'Checked Out',     className: 'text-gray-500 dark:text-gray-400' },
  'needs-attention': { label: 'Needs Attention', className: 'text-amber-600 dark:text-amber-400' },
  completed:         { label: 'Done',            className: 'text-gray-500 dark:text-gray-400' },
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

// ─────────────────────────────────────────────────────────────
// RangeCalendar
// Single-month calendar styled like the reference.
//   • Red circle  = blocked / occupied day (overlaps another booking)
//   • Blue circle = selected check-in or check-out
//   • Blue strip  = days between check-in and check-out
//   • Amber ring  = today
//   • Disabled    = before contract start / after contract end
// ─────────────────────────────────────────────────────────────
function RangeCalendar({
  value, onChange, placeholder,
  bookings = [],
  minDate,
  maxDate,
  excludeBookingId,
  otherDateISO,
  mode,
}) {
  const [open, setOpen] = useState(false)
  const initialBase = value || todayISO()
  const [viewYear, setViewYear] = useState(() => Number(initialBase.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => Number(initialBase.slice(5, 7)) - 1)
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

  // Set of occupied ISO dates from existing bookings
  const occupiedDays = useMemo(() => {
    const set = new Set()
    for (const b of bookings || []) {
      if (!b.check_in || !b.check_out) continue
      if (b.deleted_at) continue
      if (b.cancelled_at) continue
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
  const rangeStart = mode === 'check-out' ? otherDateISO : value
  const rangeEnd = mode === 'check-in' ? otherDateISO : value

  const isInRange = (iso) => {
    if (!rangeStart || !rangeEnd) return false
    return iso > rangeStart && iso < rangeEnd
  }

  const isSelectable = (iso) => {
    if (minDate && iso < minDate) return false
    if (maxDate && iso > maxDate) return false
    if (mode === 'check-out' && otherDateISO && iso <= otherDateISO) return false
    if (mode === 'check-in' && otherDateISO && iso >= otherDateISO) return false
    if (occupiedDays.has(iso)) return false
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
          'w-full h-10 text-sm rounded-lg border bg-background px-3 flex items-center justify-between gap-2 text-left transition-colors',
          open ? 'border-primary ring-2 ring-primary/25' : 'border-input hover:bg-muted/40',
        )}
      >
        <span className={cn('truncate', !displayValue && 'text-muted-foreground')}>
          {displayValue || placeholder}
        </span>
        <CalendarIcon size={14} className="text-muted-foreground flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-40 mt-2 w-[320px] rounded-2xl border border-border bg-popover p-4"
            style={{ boxShadow: SOFT_SHADOW }}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={goPrevMonth}
                className="p-1.5 rounded-full hover:bg-muted text-foreground transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-sm font-bold text-foreground tabular-nums">{monthLabel}</span>
              <button
                type="button"
                onClick={goNextMonth}
                className="p-1.5 rounded-full hover:bg-muted text-foreground transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Day of week header */}
            <div className="grid grid-cols-7 mb-2">
              {DOW.map((d, i) => (
                <div key={`${d}-${i}`} className="text-[10px] font-bold text-muted-foreground text-center">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((day, idx) => {
                if (day == null) return <div key={idx} className="h-9" />

                const iso = toISODate(viewYear, viewMonth, day)
                const occupied = occupiedDays.has(iso)
                const selected = value === iso
                const isToday = iso === todayStr
                const selectable = isSelectable(iso)
                const inRange = isInRange(iso)

                return (
                  <div key={idx} className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => handlePick(day)}
                      disabled={!selectable}
                      title={occupied ? 'Occupied by another booking' : undefined}
                      className={cn(
                        'relative h-9 w-9 rounded-full text-[12px] font-semibold tabular-nums transition-all',
                        'flex items-center justify-center',

                        // Default: plain text
                        !selected && !occupied && !inRange && selectable &&
                          'text-foreground hover:bg-muted',
                        !selectable && 'text-muted-foreground/40 cursor-not-allowed',

                        // In range strip
                        inRange && !selected && 'bg-[#2d568e]/10 text-foreground',

                        // Occupied — red circle
                        occupied && !selected && 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 cursor-not-allowed',

                        // Selected — solid blue circle
                        selected && 'bg-[#2d568e] text-white shadow-md',

                        // Today indicator (only if not selected)
                        isToday && !selected && 'ring-2 ring-amber-400/70',
                      )}
                    >
                      {day}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Legend + clear */}
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Occupied
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2d568e]" /> Selected
                </span>
              </div>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
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

// ─────────────────────────────────────────────────────────────
// PersonCombobox
// Avatar-aware picker for specialists / affiliates / housekeepers.
//   • Shows avatar + name + code in the dropdown
//   • Shows only plain text once selected
// ─────────────────────────────────────────────────────────────
function PersonCombobox({
  value, onChange, people = [], placeholder = 'Select…',
  emptyLabel = 'No selection', secondaryLabel,
  disabled = false,
  tierFor = null, // optional fn(code) => { tier, rate } for affiliates
}) {
  const wrapRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

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

  const selected = useMemo(() => people.find((p) => p.code === value) || null, [people, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q)
    )
  }, [people, query])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full h-10 text-sm rounded-lg border bg-background px-3 flex items-center justify-between gap-2 text-left transition-colors',
          open ? 'border-primary ring-2 ring-primary/25' : 'border-input hover:bg-muted/40',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? (
            <>
              <span className="text-foreground">{selected.name}</span>
              <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">{selected.code}</span>
            </>
          ) : (
            <span className="italic">{emptyLabel}</span>
          )}
        </span>
        <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute z-40 mt-2 w-full rounded-xl border border-border bg-popover overflow-hidden"
            style={{ boxShadow: SOFT_SHADOW }}
          >
            <div className="p-2 border-b border-border bg-muted/30">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or code…"
                className="h-8 text-xs rounded-lg"
                autoFocus
              />
            </div>

            <div className="max-h-[280px] overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-2 text-xs italic text-muted-foreground hover:bg-muted/60 transition-colors',
                  !value && 'bg-muted/40 font-semibold',
                )}
              >
                {emptyLabel}
              </button>

              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground italic text-center">
                  No matches
                </div>
              ) : (
                filtered.map((p) => {
                  const tier = tierFor ? tierFor(p.code) : null
                  const isActive = p.code === value
                  return (
                    <button
                      key={p.id || p.code}
                      type="button"
                      onClick={() => { onChange(p.code); setOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors',
                        isActive ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <GuestAvatar name={p.name} photo_url={p.photo_url || null} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold text-foreground truncate">
                            {p.name || '—'}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
                        </div>
                        {tier && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {tier.tier} · {tier.rate}%
                          </p>
                        )}
                        {secondaryLabel && !tier && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {secondaryLabel(p)}
                          </p>
                        )}
                      </div>
                      {isActive && <Check size={12} className="text-emerald-500 flex-shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────────────────────
function ModalShell({ open, onClose, title, titleId, maxWidth = 'max-w-md', children, footer }) {
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
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
        aria-labelledby={titleId}
        className={cn('relative bg-card rounded-lg w-full border border-border overflow-hidden flex flex-col', maxWidth)}
        style={{ boxShadow: SOFT_SHADOW }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 id={titleId} className="text-sm font-bold text-foreground">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="Close"><X size={14} /></button>
        </div>
        {children}
        {footer}
      </motion.div>
    </div>
  )
}

function SummaryCards({ bookings }) {
  const stats = useMemo(() => {
    let upcoming = 0, inHouse = 0, completed = 0, needsAttention = 0
    for (const b of bookings) {
      const s = deriveBookingStatus(b)
      if (s === 'upcoming') upcoming++
      else if (s === 'in-house') inHouse++
      else if (s === 'completed') completed++
      else if (s === 'needs-attention') needsAttention++
    }
    return { total: bookings.length, upcoming, inHouse, completed, needsAttention }
  }, [bookings])

  const cards = [
    { label: 'Total Bookings',    value: stats.total,          icon: CalendarIcon },
    { label: 'Upcoming',          value: stats.upcoming,       icon: Clock },
    { label: 'In-House',          value: stats.inHouse,        icon: Building2 },
    { label: 'Needs Attention',   value: stats.needsAttention, icon: AlertTriangle },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">{card.label}</span>
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
    const node = containerRef.current
    if (!node) return
    const measure = () => {
      const active = node.querySelector('[data-active="true"]')
      if (!active) { setIndicator({ left: 0, width: 0 }); return }
      const cRect = node.getBoundingClientRect()
      const aRect = active.getBoundingClientRect()
      setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) ro.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [statusFilter, counts])

  return (
    <div className="inline-flex items-center p-1 rounded-full bg-muted/60 border border-border/60">
      <div ref={containerRef} className="relative inline-flex items-center gap-1">
        <motion.div
          className="absolute top-0 bottom-0 rounded-full bg-card shadow-sm border border-border z-0"
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
                'relative z-10 px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors duration-200 whitespace-nowrap',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              <span className={cn('ml-1', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DateRangeFilter({ from, to, onFromChange, onToChange, onClear }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const [localFrom, setLocalFrom] = useState(from || '')
  const [localTo, setLocalTo] = useState(to || '')

  useEffect(() => { setLocalFrom(from || ''); setLocalTo(to || '') }, [from, to])

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

  const hasAny = !!from || !!to
  const summary = hasAny
    ? `${from ? formatDateShort(from) : '…'} → ${to ? formatDateShort(to) : '…'}`
    : 'Filter by date'

  const apply = () => {
    if (localFrom && localTo && localTo < localFrom) return
    onFromChange(localFrom); onToChange(localTo); setOpen(false)
  }
  const clear = () => { setLocalFrom(''); setLocalTo(''); onClear?.(); setOpen(false) }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-semibold transition-colors border',
          hasAny
            ? 'bg-foreground text-background border-foreground'
            : 'bg-card text-foreground border-border hover:bg-muted',
        )}
      >
        <CalendarIcon size={13} className={hasAny ? 'opacity-90' : 'opacity-60'} />
        <span className="hidden sm:inline truncate max-w-[160px]">{summary}</span>
        {hasAny && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); clear() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); clear() } }}
            className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-background/20 hover:bg-background/30 cursor-pointer"
            aria-label="Clear date filter"
          >
            <X size={10} />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-[280px] rounded-xl bg-popover border border-border shadow-xl p-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Booking check-in range
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">From</label>
                <input
                  type="date"
                  value={localFrom}
                  onChange={(e) => setLocalFrom(e.target.value)}
                  max={localTo || undefined}
                  className="w-full h-8 text-xs rounded border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">To</label>
                <input
                  type="date"
                  value={localTo}
                  onChange={(e) => setLocalTo(e.target.value)}
                  min={localFrom || undefined}
                  className="w-full h-8 text-xs rounded border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
              <button type="button" onClick={clear} disabled={!localFrom && !localTo}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">
                Clear
              </button>
              <button type="button" onClick={apply}
                className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-foreground text-background text-[11px] font-semibold hover:opacity-90">
                <Check size={11} />
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
              const balance = Number(b.balance || 0)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onRowClick(b)}
                  className="relative w-full text-left rounded-md border border-border bg-background py-2 pl-4 pr-3 overflow-hidden transition-colors hover:bg-muted/40"
                >
                  <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[4px]" style={{ backgroundColor: BRAND }} />
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
      if (panelRef.current && !panelRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)) onClose()
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

function WarningsStrip({ needsAttention, endingSoon, onSelect }) {
  const [open, setOpen] = useState(null)
  const naRef = useRef(null)
  const esRef = useRef(null)

  const naCount = needsAttention.length
  const esCount = endingSoon.length
  if (naCount === 0 && esCount === 0) return null
  const toggle = (key) => setOpen((v) => (v === key ? null : key))

  return (
    <div className="flex items-center gap-2">
      {naCount > 0 && (
        <WarningChip icon={AlertTriangle} label="Needs Attention" count={naCount} active={open === 'na'}
          onClick={() => toggle('na')} triggerRef={naRef}>
          <AnimatePresence>
            {open === 'na' && (
              <DropdownPortal anchorRef={naRef} onClose={() => setOpen(null)}>
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Needs Attention</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {naCount} booking{naCount === 1 ? '' : 's'} past check-out with balance still owed
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="p-1 -m-1 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {needsAttention.map((b) => (
                    <WarningRow key={b.id} booking={b} chip={`${formatMoney(b.balance)} due`} chipTone="amber" onClick={() => { onSelect(b); setOpen(null) }} />
                  ))}
                </div>
              </DropdownPortal>
            )}
          </AnimatePresence>
        </WarningChip>
      )}
      {esCount > 0 && (
        <WarningChip icon={Clock} label="Ending Soon" count={esCount} active={open === 'es'}
          onClick={() => toggle('es')} triggerRef={esRef}>
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
}) {
  const status = deriveBookingStatus(booking)
  const isCompleted = status === 'completed'
  const isPaid = booking.payment_status === 'paid'
  const guestLeft = parseDateOnly(booking.check_out) < today()
  const canComplete = !isCompleted && guestLeft && isPaid
  const canExtend = !isCompleted && !guestLeft

  const transactions = Array.isArray(booking.transactions) ? booking.transactions : []
  const nights = computeNights(booking.check_in, booking.check_out)

  const bookerTier = booking.booker_code
    ? (booking.booker_rate != null ? `Flat ${booking.booker_rate}%` : `Flat ${SPECIALIST_FLAT_RATE}%`)
    : null
  const affiliateTier = booking.affiliate_code
    ? (booking.affiliate_rate != null ? `${booking.affiliate_rate}%` : '—')
    : null

  const governing = useMemo(() => findContractForBooking(booking, contracts), [booking, contracts])
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
                  <p className="text-base font-bold text-foreground truncate">{booking.guest_name}</p>
                  <p className="text-[11px] text-foreground font-mono truncate">{booking.booking_code}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <BookingStatusBadge status={status} />
                    <PaymentStatusBadge status={booking.payment_status} />
                  </div>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-muted text-foreground flex-shrink-0"><X size={16} /></button>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Button variant="outline" size="sm"
                  className="h-7 rounded text-[11px] gap-1.5 text-white hover:opacity-90"
                  style={{ backgroundColor: BRAND }}
                  onClick={onEmail}
                  disabled={!booking.guest_email}
                  title={booking.guest_email ? 'Send booking confirmation' : 'No email on file'}>
                  <Mail size={11} /> Email Confirmation
                </Button>
                <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onEdit}>
                  <Edit2 size={11} /> Edit
                </Button>
                <Button variant="outline" size="sm"
                  className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                  onClick={onDelete}>
                  <Trash2 size={11} /> Delete
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
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

              <DetailSection title="Summary">
                <div className="p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-foreground">Total</span><span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.total_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-foreground">Paid</span><span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.amount_paid)}</span></div>
                  <div className="flex justify-between pt-1 border-t border-border"><span className="text-foreground font-semibold">Balance</span><span className="font-bold tabular-nums text-foreground">{formatMoney(booking.balance)}</span></div>
                  <div className="pt-2"><PaymentStatusBadge status={booking.payment_status} /></div>
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
                      This booking won&apos;t appear in Accounting for any contract.
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
              : 'rgba(45, 86, 142, 0)',
        }}
        transition={{ duration: 0.4 }}
        whileHover={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.14)' : 'rgba(45, 86, 142, 0.05)' }}
        whileTap={{ scale: 0.998 }}
        className={cn('group/row w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GuestAvatar name={booking.guest_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{booking.guest_name}</p>
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
    .lt('check_in', checkOut)
    .gt('check_out', checkIn)
    .order('check_in')
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query
  if (error) { console.error('Overlap check failed:', error); return null }
  return data?.[0] || null
}

// ─────────────────────────────────────────────────────────────
// Section wrapper for the form
// ─────────────────────────────────────────────────────────────
function FormSection({ icon: Icon, title, subtitle, children, className }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-foreground flex-shrink-0" />}
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {subtitle && <span className="text-[10px] text-muted-foreground">· {subtitle}</span>}
      </div>
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        {children}
      </div>
    </section>
  )
}

function BookingFormModal({ open, onClose, onSaved, units, editing, specialists, affiliates, affiliateCounts, contracts, bookings }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [liveAffiliateCount, setLiveAffiliateCount] = useState(null)
  const [sendEmail, setSendEmail] = useState(true)
  const [errors, setErrors] = useState({})

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
    setErrors({})
  }, [open, editing])

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

  const setField = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((p) => { const n = { ...p }; delete n[k]; return n })
  }

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
    return (bookings || []).filter((b) => b.unit_id === form.unit_id && !b.deleted_at)
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

  const affiliateTierFor = useCallback((code) => {
    if (!code) return null
    const count = (typeof liveAffiliateCount === 'number' && form.affiliate_code === code)
      ? liveAffiliateCount
      : (affiliateCounts?.[code] || 0)
    return getTierInfo(count)
  }, [liveAffiliateCount, affiliateCounts, form.affiliate_code])

  const handleSubmit = async () => {
    const nextErrors = {}
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

    if (!form.unit_id) nextErrors.unit_id = 'Select a unit'
    if (!guestName) nextErrors.guest_name = 'Guest name is required'
    if (form.guest_email && !guestEmail) nextErrors.guest_email = 'Invalid email'
    if (!checkIn) nextErrors.check_in = 'Set check-in'
    if (!checkOut) nextErrors.check_out = 'Set check-out'
    if (checkIn && checkOut && checkOut <= checkIn) nextErrors.check_out = 'Must be after check-in'
    if (totalAmt <= 0) nextErrors.total_amount = 'Must be greater than 0'
    if (initialAmt > totalAmt) nextErrors.initial_amount = 'Cannot exceed total'

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      toast.error('Please fix the highlighted fields')
      return
    }

    if (!selectedContract) {
      const hasAny = contracts.some((c) => c.unit_id === form.unit_id)
      if (!hasAny) toast.error('This unit has no contract. Create one in Contracts before booking.')
      else toast.error('No contract covers the check-in date. Extend a contract or pick a different date.')
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
      toast.error(`This unit is already booked from ${conflict.check_in} to ${conflict.check_out} (booking ${conflict.booking_code}). Pick different dates.`)
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
        } else if (bookerChanged || editing.booker_rate == null || Number(editing.booker_commission || 0) === 0) {
          finalBookerRate = bookerRate
          finalBookerComm = computeCommissionAtRate(totalAmt, bookerRate)
        } else {
          finalBookerRate = Number(editing.booker_rate)
          finalBookerComm = computeCommissionAtRate(totalAmt, finalBookerRate)
        }

        if (!newAffiliateCodeClean) {
          finalAffiliateRate = null
          finalAffiliateComm = 0
        } else if (affiliateChanged || editing.affiliate_rate == null || Number(editing.affiliate_commission || 0) === 0) {
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
          if (sync.updated > 0) toast.success(`Booking updated · ${sync.updated} cleaning${sync.updated === 1 ? '' : 's'} rescheduled`)
          else toast.success('Booking updated')
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

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1.5 block'
  const fieldError = (key) => errors[key] && (
    <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">{errors[key]}</p>
  )

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 cursor-default" />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-form-title"
        className="relative bg-card rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-border"
        style={{ boxShadow: SOFT_SHADOW }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#2d568e]/10 flex items-center justify-center flex-shrink-0">
              <CalendarIcon size={18} className="text-[#2d568e]" />
            </div>
            <div className="min-w-0">
              <h2 id="booking-form-title" className="text-base font-bold text-foreground truncate">
                {editing ? 'Edit Booking' : 'New Booking'}
              </h2>
              {editing && <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{editing.booking_code}</p>}
              {!editing && <p className="text-[11px] text-muted-foreground mt-0.5">Create a new reservation</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body — two-column on desktop */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

            {/* LEFT — main form */}
            <div className="space-y-6">

              <FormSection icon={Building2} title="Unit" subtitle="Where will the guest stay?">
                <div>
                  <label className={labelClass}>Unit *</label>
                  <Select value={form.unit_id} onValueChange={(v) => setField('unit_id', v)}>
                    <SelectTrigger className={cn('h-10 text-sm rounded-lg w-full', errors.unit_id && 'border-red-400')}>
                      <SelectValue placeholder="Select a unit...">
                        {selectedUnit ? unitLabel(selectedUnit) : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {unitsForDropdown.map((u) => <SelectItem key={u.id} value={u.id} className="text-xs">{unitLabel(u)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {fieldError('unit_id')}
                  {selectedUnit && !selectedContract && (
                    <p className="text-[10px] text-red-600 dark:text-red-400 mt-1.5 font-semibold">
                      {contracts.some((c) => c.unit_id === selectedUnit.id)
                        ? 'No active contract at this date. Extend a contract or pick a different date.'
                        : 'This unit has no contract. Create one first.'}
                    </p>
                  )}
                  {selectedUnit && selectedContract && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Contract: {selectedContract.effective_date || '—'} → {selectedContract.expiry_date || 'open-ended'}
                    </p>
                  )}
                </div>
              </FormSection>

              <FormSection icon={CalendarIcon} title="Dates" subtitle={`${nights} night${nights === 1 ? '' : 's'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Check-in *</label>
                    <RangeCalendar
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
                    {fieldError('check_in')}
                  </div>
                  <div>
                    <label className={labelClass}>Check-out *</label>
                    <RangeCalendar
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
                    {fieldError('check_out')}
                  </div>
                </div>
                {form.unit_id && unitBookings.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {unitBookings.length} existing booking{unitBookings.length === 1 ? '' : 's'} · red circles mark occupied days
                  </p>
                )}
                {!form.unit_id && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Pick a unit to see existing bookings
                  </p>
                )}
              </FormSection>

              <FormSection icon={User} title="Guest" subtitle="Who's staying?">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Guest Name *</label>
                    <Input value={form.guest_name} onChange={(e) => setField('guest_name', e.target.value)}
                      className={cn('h-10 text-sm rounded-lg', errors.guest_name && 'border-red-400')} maxLength={120} autoFocus={!editing} />
                    {fieldError('guest_name')}
                  </div>
                  <div>
                    <label className={labelClass}>Guests</label>
                    <Input type="number" min={1} max={50} value={form.guests} onChange={(e) => setField('guests', e.target.value)} className="h-10 text-sm rounded-lg" />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <Input type="email" value={form.guest_email} onChange={(e) => setField('guest_email', e.target.value)}
                      className={cn('h-10 text-sm rounded-lg', errors.guest_email && 'border-red-400')} maxLength={254} />
                    {fieldError('guest_email')}
                  </div>
                  <div>
                    <label className={labelClass}>Contact</label>
                    <Input type="tel" value={form.guest_contact} onChange={(e) => setField('guest_contact', e.target.value)} className="h-10 text-sm rounded-lg" maxLength={40} />
                  </div>
                </div>
              </FormSection>

              <FormSection icon={Users} title="Staff" subtitle="Who's involved?">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Booked by (specialist)</label>
                    <PersonCombobox
                      value={form.booker_code}
                      onChange={(v) => setField('booker_code', v)}
                      people={specialists}
                      placeholder="Search specialists…"
                      emptyLabel="No specialist"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Affiliate</label>
                    <PersonCombobox
                      value={form.affiliate_code}
                      onChange={(v) => setField('affiliate_code', v)}
                      people={affiliates}
                      placeholder="Search affiliates…"
                      emptyLabel="No affiliate"
                      tierFor={affiliateTierFor}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Affiliate Notes</label>
                  <Input value={form.affiliate_notes} onChange={(e) => setField('affiliate_notes', e.target.value)} className="h-10 text-sm rounded-lg" maxLength={2000} />
                </div>
              </FormSection>

              <FormSection icon={Wallet} title="Amounts" subtitle="What's the total and any initial payment?">
                <div>
                  <label className={labelClass}>Total Amount (₱) *</label>
                  <Input type="number" min={0} value={form.total_amount} onChange={(e) => setField('total_amount', e.target.value)}
                    className={cn('h-10 text-sm rounded-lg tabular-nums', errors.total_amount && 'border-red-400')} />
                  {fieldError('total_amount')}
                </div>

                {!editing && (
                  <div className="pt-2 border-t border-border space-y-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Initial payment (optional)</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className={labelClass}>Amount</label>
                        <Input type="number" min={0} value={form.initial_amount} onChange={(e) => setField('initial_amount', e.target.value)}
                          className={cn('h-10 text-sm rounded-lg tabular-nums', errors.initial_amount && 'border-red-400')} />
                        {fieldError('initial_amount')}
                      </div>
                      <div>
                        <label className={labelClass}>Method</label>
                        <Input value={form.initial_method} onChange={(e) => setField('initial_method', e.target.value)} placeholder="GCash…" className="h-10 text-sm rounded-lg" maxLength={60} />
                      </div>
                      <div>
                        <label className={labelClass}>Reference</label>
                        <Input value={form.initial_reference} onChange={(e) => setField('initial_reference', e.target.value)} className="h-10 text-sm rounded-lg" maxLength={100} />
                      </div>
                      <div>
                        <label className={labelClass}>Date</label>
                        <Input type="date" value={form.initial_date} onChange={(e) => setField('initial_date', e.target.value)} className="h-10 text-sm rounded-lg" />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Notes</label>
                  <Input value={form.notes} onChange={(e) => setField('notes', e.target.value)} className="h-10 text-sm rounded-lg" maxLength={2000} />
                </div>
              </FormSection>

              {!editing && (
                <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors">
                  <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)}
                    className="mt-0.5 rounded border-border" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Send booking confirmation email</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      The guest receives a confirmation after the booking is created. You can also send it later from the booking panel.
                    </p>
                  </div>
                </label>
              )}
            </div>

            {/* RIGHT — sticky summary */}
            <aside className="lg:sticky lg:top-0 self-start">
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Live Summary</p>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unit</span>
                    <span className="font-semibold text-foreground truncate ml-2 text-right">
                      {selectedUnit ? unitLabel(selectedUnit) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Check-in</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {form.check_in || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Check-out</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {form.check_out || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nights</span>
                    <span className="font-semibold text-foreground tabular-nums">{nights}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guests</span>
                    <span className="font-semibold text-foreground tabular-nums">{form.guests || 1}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold text-foreground tabular-nums">{formatMoney(totalAmount)}</span>
                  </div>
                  {!editing && initialAmount > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Initial</span>
                        <span className="font-semibold text-foreground tabular-nums">{formatMoney(initialAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Remaining</span>
                        <span className={cn('font-bold tabular-nums',
                          willBePaid ? 'text-emerald-600 dark:text-emerald-400' :
                          willBePartial ? 'text-amber-600 dark:text-amber-400' :
                          'text-foreground')}>
                          {formatMoney(remaining)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {bookerCommission > 0 && (
                  <div className="pt-3 border-t border-border space-y-1 text-xs">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Commissions</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Booker ({bookerRate}%)</span>
                      <span className="font-semibold text-foreground tabular-nums">{formatMoney(bookerCommission)}</span>
                    </div>
                  </div>
                )}
                {affiliateCommission > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      Affiliate ({affiliateRate}%)
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">{formatMoney(affiliateCommission)}</span>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-muted/30 flex-shrink-0">
          <p className="text-[10px] text-muted-foreground hidden sm:block">
            {editing ? 'Changes to check-out will reschedule linked cleanings.' : 'Booking code will be generated on save.'}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" className="h-10 rounded-lg text-xs" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" className="h-10 rounded-lg text-xs gap-1.5 text-white" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Booking'}
            </Button>
          </div>
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
    <ModalShell open={open} onClose={onClose} title="Add Payment" titleId="add-payment-title">
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs bg-muted/40 rounded p-3">
          <div><div className="text-foreground">Total</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(total)}</div></div>
          <div><div className="text-foreground">Paid</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(paid)}</div></div>
          <div><div className="text-foreground">Balance</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(balance)}</div></div>
        </div>
        <div><label className={labelClass}>Amount (₱) *</label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs rounded" autoFocus /></div>
        <div><label className={labelClass}>Method</label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="GCash, Bank transfer, Cash..." className="h-9 text-xs rounded" maxLength={60} /></div>
        <div><label className={labelClass}>Reference</label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 text-xs rounded" maxLength={100} /></div>
        <div><label className={labelClass}>Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-xs rounded" /></div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
        <Button variant="outline" size="sm" className="h-9 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" className="h-9 rounded text-xs" onClick={save} disabled={saving} style={{ backgroundColor: BRAND }}>
          {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
          {saving ? 'Saving...' : 'Add Payment'}
        </Button>
      </div>
    </ModalShell>
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

  const governingContract = useMemo(() => {
    if (!booking) return null
    const unit = booking.units
      ? { id: booking.unit_id, unit_code: booking.units.unit_code, building: booking.units.building }
      : { id: booking.unit_id }
    return findGoverningContract(unit, contracts || [])
  }, [booking, contracts])

  if (!open || !booking) return null

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'
  const snapshotBookerRate = booking.booker_rate != null ? Number(booking.booker_rate) : (booking.booker_code ? SPECIALIST_FLAT_RATE : null)
  const bookerRateWasInferred = !!booking.booker_code && booking.booker_rate == null
  const snapshotAffiliateRate = booking.affiliate_rate != null ? Number(booking.affiliate_rate) : null
  const affiliateRateWasInferred = !!booking.affiliate_code && booking.affiliate_rate == null
  const previewTotal = Number(newTotal) || 0

  const previewBooker = booking.booker_code && snapshotBookerRate != null && !bookerRateWasInferred
    ? computeCommissionAtRate(previewTotal, snapshotBookerRate) : 0
  const previewAffiliate = booking.affiliate_code && snapshotAffiliateRate != null && !affiliateRateWasInferred
    ? computeCommissionAtRate(previewTotal, snapshotAffiliateRate) : 0

  const save = async () => {
    const newCheckOutClean = sanitizeDateOnly(newCheckOut)
    if (!newCheckOutClean) { toast.error('Set a new check-out date'); return }

    const oldCheckOut = parseDateOnly(booking.check_out)
    const parsed = parseDateOnly(newCheckOutClean)
    if (parsed <= oldCheckOut) { toast.error('New check-out must be after the current one'); return }

    if (!governingContract) { toast.error('No contract covers this unit. Cannot extend.'); return }
    if (governingContract.effective_date && newCheckOutClean < governingContract.effective_date) {
      toast.error(`New check-out is before the contract start (${governingContract.effective_date}).`); return
    }
    if (governingContract.expiry_date && newCheckOutClean > governingContract.expiry_date) {
      toast.error(`New check-out is after the contract ends (${governingContract.expiry_date}). Renew the contract first.`); return
    }

    const conflict = await findOverlappingBooking({
      unitId: booking.unit_id,
      checkIn: booking.check_in,
      checkOut: newCheckOutClean,
      excludeId: booking.id,
    })
    if (conflict) {
      toast.error(`Extending would overlap with booking ${conflict.booking_code} (${conflict.check_in} → ${conflict.check_out}). Pick an earlier check-out.`)
      return
    }

    const total = sanitizeMoney(newTotal)
    if (total <= 0) { toast.error('Total amount must be greater than 0'); return }

    const alreadyPaidBase = Number(booking.amount_paid || 0)
    if (total < alreadyPaidBase) {
      toast.error(`New total (${formatMoney(total)}) is less than already paid (${formatMoney(alreadyPaidBase)}).`)
      return
    }

    let payAmt = 0, payMethodClean = null, payRefClean = null, payDateClean = null
    if (addPayment) {
      payAmt = sanitizeMoney(payAmount)
      if (!payAmt || payAmt <= 0) { toast.error('Enter a valid extension payment amount'); return }
      if (alreadyPaidBase + payAmt > total) {
        toast.error(`Payment would overpay. Max extra: ${formatMoney(Math.max(0, total - alreadyPaidBase))}`)
        return
      }
      payMethodClean = sanitizeText(payMethod, { max: 60 })
      payRefClean = sanitizeText(payReference, { max: 100 })
      payDateClean = sanitizeDateOnly(payDate) || new Date().toISOString().slice(0, 10)
    }

    setSaving(true)
    try {
      const tx = Array.isArray(booking.transactions) ? [...booking.transactions] : []
      if (addPayment) tx.push({ amount: payAmt, method: payMethodClean || '', reference: payRefClean || '', date: payDateClean })

      const newBookerComm = booking.booker_code && booking.booker_rate != null
        ? computeCommissionAtRate(total, Number(booking.booker_rate))
        : (booking.booker_code ? booking.booker_commission : 0)

      const newAffComm = booking.affiliate_code && booking.affiliate_rate != null
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
      }).catch(() => {})

      const sync = await syncLinkedCleanings({
        bookingId: booking.id,
        newCheckIn: booking.check_in,
        newCheckOut: newCheckOutClean,
        bookingCode: booking.booking_code,
      })

      if (sync.updated > 0) toast.success(`Booking extended · ${sync.updated} cleaning${sync.updated === 1 ? '' : 's'} rescheduled`)
      else toast.success('Booking extended')
      if (sync.failed > 0) toast.error(`${sync.failed} cleaning${sync.failed === 1 ? '' : 's'} failed to reschedule — check Housekeeping`)

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
    <ModalShell open={open} onClose={onClose} title="Extend Stay" titleId="extend-stay-title">
      <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded p-3">
          <div><div className="text-foreground">Current check-out</div><div className="font-semibold text-foreground">{formatDate(booking.check_out)}</div></div>
          <div><div className="text-foreground">Current nights</div><div className="font-semibold tabular-nums text-foreground">{oldNights}</div></div>
        </div>

        {bookerRateWasInferred && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
            <strong>Booker rate missing.</strong> Commission will <em>not</em> be recalculated.
          </div>
        )}

        {affiliateRateWasInferred && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
            <strong>Affiliate rate missing.</strong> Commission will <em>not</em> be recalculated.
          </div>
        )}

        {governingContract && (
          <p className="text-[10px] text-muted-foreground">
            Contract range: {governingContract.effective_date || '—'} → {governingContract.expiry_date || 'open-ended'}
          </p>
        )}
        <div>
          <label className={labelClass}>New Check-out *</label>
          <Input type="date" value={newCheckOut} onChange={(e) => setNewCheckOut(e.target.value)}
            min={booking.check_out || governingContract?.effective_date || undefined}
            max={governingContract?.expiry_date || undefined}
            className="h-8 text-xs rounded" />
          <p className="text-[10px] text-muted-foreground mt-1">Before {STAY_TIMES.checkOut.label} · linked cleanings will move</p>
        </div>
        <div>
          <label className={labelClass}>New Total Amount (₱) *</label>
          <Input type="number" min={0} value={newTotal} onChange={(e) => setNewTotal(e.target.value)} className="h-8 text-xs rounded" />
        </div>
        {newNights > oldNights && <p className="text-[10px] text-foreground">Extended by {newNights - oldNights} night{newNights - oldNights === 1 ? '' : 's'} · new total {newNights} night{newNights === 1 ? '' : 's'}</p>}

        {(booking.booker_code || booking.affiliate_code) && previewTotal > 0 && (
          <div className="rounded-md bg-muted/40 border border-border p-2.5 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
              <Lock size={9} className="opacity-60" />
              {bookerRateWasInferred || affiliateRateWasInferred ? 'Existing commissions preserved' : 'Recalculated commissions'}
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
    </ModalShell>
  )
}

function CompleteConfirmModal({ open, onClose, booking, onConfirmed }) {
  const [saving, setSaving] = useState(false)

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
    <ModalShell open={open} onClose={onClose} title="Mark as Done?" titleId="complete-title" maxWidth="max-w-sm">
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
    </ModalShell>
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
    if (!f) return 'all'
    const alias = { active: 'in-house', 'needs-action': 'needs-attention' }
    const normalized = alias[f] || f
    if (['in-house', 'upcoming', 'checked-out', 'needs-attention', 'completed', 'unpaid'].includes(normalized)) return normalized
    return 'all'
  })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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
    return () => { if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current) }
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

  const fetchData = useCallback(async (signal) => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      // NOTE: adds photo_url to specialists / affiliates so the combobox can show avatars
      const [bRes, uRes, sRes, aRes, cRes] = await Promise.all([
        supabase.from('bookings').select('*, units:unit_id ( id, unit_code, building )').is('deleted_at', null).order('check_in', { ascending: false }).limit(500),
        supabase.from('units').select('id, unit_code, building, status, current_contract_id').order('unit_code'),
        supabase.from('specialists').select('id, code, name, photo_url').order('name'),
        supabase.from('affiliates').select('id, code, name, photo_url').order('name'),
        supabase.from('contracts').select('id, unit_id, contract_code, effective_date, expiry_date'),
      ])
      if (signal?.aborted) return
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
      if (signal?.aborted) return
      setAffiliateCounts(affCounts)
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load bookings:', err)
      toast.error('Failed to load bookings')
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
      if (!existing || (c.effective_date > existing.effective_date)) byUnit.set(c.unit_id, c)
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
    const c = {
      all: bookings.length,
      'in-house': 0, upcoming: 0, 'checked-out': 0,
      'needs-attention': 0, completed: 0, unpaid: 0,
    }
    for (const b of bookings) {
      const s = deriveBookingStatus(b)
      if (c[s] !== undefined) c[s]++
      if (!b.completed_at && Number(b.balance || 0) > 0) c['unpaid']++
    }
    return c
  }, [bookings])

  const todayISOStr = useMemo(() => todayISO(), [])
  const checkInsToday = useMemo(() => bookings.filter((b) => b.check_in === todayISOStr && !b.deleted_at), [bookings, todayISOStr])
  const checkOutsToday = useMemo(() => bookings.filter((b) => b.check_out === todayISOStr && !b.deleted_at), [bookings, todayISOStr])

  const needsAttention = useMemo(() => bookings.filter((b) => deriveBookingStatus(b) === 'needs-attention'), [bookings])
  const endingSoon = useMemo(() => bookings.filter((b) => {
    const t = today()
    const twoDays = new Date(t); twoDays.setDate(twoDays.getDate() + 2)
    if (b.completed_at) return false
    if (b.payment_status === 'paid') return false
    const co = parseDateOnly(b.check_out)
    return co >= t && co <= twoDays
  }), [bookings])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return bookings.filter((b) => {
      const derived = deriveBookingStatus(b)
      if (statusFilter !== 'all') {
        if (statusFilter === 'unpaid') {
          if (b.completed_at) return false
          if (Number(b.balance || 0) <= 0) return false
        } else {
          if (derived !== statusFilter) return false
        }
      }
      if (dateFrom && (b.check_in || '') < dateFrom) return false
      if (dateTo && (b.check_in || '') > dateTo) return false
      if (q) {
        const haystack = [
          b.booking_code, b.guest_name, b.guest_email, b.guest_contact,
          b.booker_code, b.booker_name, b.affiliate_code, b.affiliate_name, b.notes,
          b.units?.unit_code, b.units?.building,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [bookings, statusFilter, debouncedSearch, dateFrom, dateTo])

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
          <TodayPanel title="Check-ins today" icon={LogIn} rows={checkInsToday} loading={isFirstLoad} empty="No check-ins today" onRowClick={handleTodayPanelRowClick} />
          <TodayPanel title="Check-outs today" icon={LogOut} rows={checkOutsToday} loading={isFirstLoad} empty="No check-outs today" onRowClick={handleTodayPanelRowClick} />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search guest, booking code, unit, email, booker, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded" />
          </div>
          <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} onClear={() => { setDateFrom(''); setDateTo('') }} />
          <Button size="sm" className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]" style={{ backgroundColor: BRAND }} onClick={openNew}>
            <Plus size={13} />
            <span className="hidden sm:inline ml-1">New Booking</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
            <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          </Button>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
          <WarningsStrip needsAttention={needsAttention} endingSoon={endingSoon} onSelect={(b) => setSelectedId(b.id)} />
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
      <BookingConfirmationModal open={!!confirmForBooking} onClose={() => setConfirmForBooking(null)} booking={confirmForBooking} onSent={fetchData} />
    </div>
  )
}