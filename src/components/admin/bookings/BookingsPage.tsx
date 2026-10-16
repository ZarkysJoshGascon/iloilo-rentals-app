// src/components/admin/bookings/BookingsPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Loader2,
  Plus, RefreshCw, Search, X, Trash2,
  Building2, CheckCircle2, Clock, AlertTriangle, Calendar as CalendarIcon, User, Wallet, Users,
  Edit2, Lock, KeyRound, Luggage, ChevronLeft, ChevronRight,
  Mail, Copy, Sparkles, ChevronDown, Undo2, AlarmClockPlus, CalendarClock, BedDouble, FileText, TrendingUp,
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
import { SortHeader, nextSort, ResultsBar, SearchKeyHint, useListShortcuts, CARD_ON_PHONE, MobileSort, useSidePanelMotion, useListCap } from '@/components/admin/_shared/listTools'
import { Panel, PanelHeader, InitialsAvatar } from '@/components/admin/_shared/Panel'
import { QueueColumn, QueueRow, RowAction, WithDot, useNow, formatSpan, formatClock } from '@/components/admin/_shared/WorkQueue'
import {
  stayMoment, checkoutDue, guestState, hasGuestLeft, sameDayArrival, latestCheckout,
  arrivalOn, nextBookingAfter, TURNOVER_CHECKOUT, confirmCheckout, setLateCheckout,
} from '@/lib/stay'
import { StatStrip, StatTile } from '@/components/admin/_shared/StatStrip'
import { StatusTabs } from '@/components/admin/_shared/StatusTabs'
import { DatePicker } from '@/components/admin/_shared/DatePicker'
import { revealOnMount } from '@/components/admin/_shared/useRevealOnOpen'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Code } from '@/components/common/Code'
import { crmLink } from '@/lib/crmLinks'

const BRAND = 'var(--brand-solid)'
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'

const STATUS_PILLS = [
  { id: 'all',              label: 'All' },
  { id: 'in-house',         label: 'In-house' },
  { id: 'upcoming',         label: 'Upcoming' },
  { id: 'checked-out',      label: 'Checked out' },
  { id: 'needs-attention',  label: 'Needs attention' },
  { id: 'completed',        label: 'Done' },
  { id: 'unpaid',           label: 'Unpaid' },
]

// Sortable columns: the value each one sorts by, and the direction a fresh
// click starts in (dates and money start with the newest / largest).
const STATUS_ORDER = ['needs-attention', 'in-house', 'upcoming', 'checked-out', 'completed']
const SORT_VALUE = {
  guest:   (b) => b.guest_name || '',
  code:    (b) => b.booking_code || '',
  unit:    (b) => b.units?.unit_code || '',
  checkin: (b) => b.check_in || '',
  payment: (b) => Number(b.balance || 0),
  status:  (b) => STATUS_ORDER.indexOf(deriveBookingStatus(b)),
}
const SORT_DEFAULT_DIR = { checkin: 'desc', payment: 'desc' }

const ROW_GRID = `grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_130px] gap-4 items-center ${CARD_ON_PHONE}`
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
      ? Math.max(0, Math.round((new Date(newCheckOut + 'T00:00:00Z').getTime() - new Date(newCheckIn + 'T00:00:00Z').getTime()) / 86400000))
      : 0
    const newType = newNights >= 7 ? 'deep' : 'basic'

    let updated = 0, failed = 0
    for (const c of linked) {
      const patch: Record<string, string> = {}
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
  // In the unit until someone confirms they've left, or the check-out day is over.
  if (t <= co && !b.checked_out_at) return 'in-house'
  return b.payment_status === 'paid' ? 'checked-out' : 'needs-attention'
}

// Commissions for a new total, at the rates snapshotted when the booking was
// made. Without a snapshot the stored commission stays as it is.
function commissionsForTotal(booking, total) {
  return {
    booker_commission: booking.booker_code && booking.booker_rate != null
      ? computeCommissionAtRate(total, Number(booking.booker_rate))
      : (booking.booker_code ? booking.booker_commission : 0),
    affiliate_commission: booking.affiliate_code && booking.affiliate_rate != null
      ? computeCommissionAtRate(total, Number(booking.affiliate_rate))
      : (booking.affiliate_code ? booking.affiliate_commission : 0),
  }
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
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}
function unitLabel(u) {
  if (!u) return '—'
  const b = u.building || '', c = u.unit_code || ''
  if (b && c) return `${b} — ${c}`
  return c || b || '—'
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}
type GuestAvatarProps = {
  name: any
  photo_url?: any
  size?: string
}

// Plain initials on white, as on the Dashboard.
function GuestAvatar({ name, photo_url = null, size = 'md' }: GuestAvatarProps) {
  return <InitialsAvatar name={name} photoUrl={photo_url} size={size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md'} />
}

const BOOKING_STATUS_TEXT = {
  upcoming:          { label: 'Upcoming',        className: 'text-blue-600 dark:text-blue-400' },
  'in-house':        { label: 'In-House',        className: 'text-emerald-600 dark:text-emerald-400' },
  'checked-out':     { label: 'Checked Out',     className: 'text-slate-600 dark:text-slate-300' },
  'needs-attention': { label: 'Needs Attention', className: 'text-amber-600 dark:text-amber-400' },
  completed:         { label: 'Done',            className: 'text-slate-600 dark:text-slate-300' },
}

const PAYMENT_STATUS_TEXT = {
  paid: { label: 'Paid', className: 'text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'Partial', className: 'text-amber-600 dark:text-amber-400' },
  unpaid: { label: 'Unpaid', className: 'text-red-600 dark:text-red-400' },
}

type BookingStatusBadgeProps = {
  status: string
}

function BookingStatusBadge({ status }: BookingStatusBadgeProps) {
  const config = BOOKING_STATUS_TEXT[status]
  if (!config) return null
  return <span className={cn('text-[12px] font-semibold', config.className)}>{config.label}</span>
}
type PaymentStatusBadgeProps = {
  status: any
}

function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const config = PAYMENT_STATUS_TEXT[status]
  if (!config) return null
  return <span className={cn('text-[12px] font-semibold', config.className)}>{config.label}</span>
}

type StayDatePickerProps = {
  value: string
  onChange: (v: any) => void
  placeholder: string
  bookings?: any
  minDate: any
  maxDate: any
  excludeBookingId: any
  otherDateISO: string
  mode: 'check-in' | 'check-out'
}

// Check-in or check-out on the shared calendar, with the other end of the
// stay marked blue. Nights other bookings hold are red. A stay can start the
// day another guest leaves and end the day another guest arrives (out by
// 11 AM, in from 3 PM), but can't take a night that's held.
function StayDatePicker({
  value, onChange, placeholder,
  bookings = [],
  minDate,
  maxDate,
  excludeBookingId,
  otherDateISO,
  mode,
}: StayDatePickerProps) {
  const heldNights = useMemo(() => {
    const set = new Set<string>()
    for (const b of bookings || []) {
      if (!b.check_in || !b.check_out || b.deleted_at || b.cancelled_at) continue
      if (excludeBookingId && b.id === excludeBookingId) continue
      for (let cur = b.check_in, guard = 0; cur < b.check_out && guard < 1000; cur = isoAddDays(cur, 1), guard++) set.add(cur)
    }
    return set
  }, [bookings, excludeBookingId])

  // A check-out day is taken when the night before it is.
  const blocked = useMemo(
    () => (mode === 'check-in' ? heldNights : new Set([...heldNights].map((night) => isoAddDays(night, 1)))),
    [heldNights, mode],
  )

  // Every night of the stay has to be free, not just the day picked.
  const crossesHeldNight = (from: string, to: string) => {
    for (let d = from, guard = 0; d < to && guard < 1000; d = isoAddDays(d, 1), guard++) {
      if (heldNights.has(d)) return true
    }
    return false
  }
  const isDisabled = (iso: string) => {
    if (!otherDateISO) return false
    return mode === 'check-in'
      ? iso >= otherDateISO || crossesHeldNight(iso, otherDateISO)
      : iso <= otherDateISO || crossesHeldNight(otherDateISO, iso)
  }

  return (
    <DatePicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      minDate={minDate}
      maxDate={maxDate}
      blocked={blocked}
      blockedLabel="Booked"
      isDisabled={isDisabled}
      rangeStart={mode === 'check-out' ? otherDateISO : null}
      rangeEnd={mode === 'check-in' ? otherDateISO : null}
      pickedLabel="Check-in / out"
      size="lg"
      ariaLabel={mode === 'check-in' ? 'Check-in date' : 'Check-out date'}
    />
  )
}

type PersonComboboxProps = {
  value: string
  onChange: (v: any) => void
  people?: any
  placeholder?: string
  emptyLabel?: string
  secondaryLabel?: any
  disabled?: boolean
  tierFor?: any
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
}: PersonComboboxProps) {
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
        <span className={cn('truncate', !selected && 'text-foreground')}>
          {selected ? (
            <>
              <span className="text-foreground">{selected.name}</span>
              <span className="ml-1.5 inline-flex align-middle"><Code value={selected.code} className="text-[11px]" iconSize={11} /></span>
            </>
          ) : (
            <span className="italic">{emptyLabel}</span>
          )}
        </span>
        <ChevronDown size={14} className="text-foreground flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            ref={revealOnMount} className="absolute z-40 mt-2 w-full rounded-xl border border-border bg-popover overflow-hidden"
            style={{ boxShadow: SOFT_SHADOW }}
          >
            <div className="p-2 border-b border-border bg-card">
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
                  'w-full text-left px-3 py-2 text-xs italic text-foreground hover:bg-muted/60 transition-colors',
                  !value && 'bg-muted font-semibold',
                )}
              >
                {emptyLabel}
              </button>

              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-foreground italic text-center">
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
                          <Code value={p.code} className="text-[10px]" iconSize={11} />
                        </div>
                        {tier && (
                          <p className="text-[10px] text-foreground mt-0.5">
                            {tier.tier} · {tier.rate}%
                          </p>
                        )}
                        {secondaryLabel && !tier && (
                          <p className="text-[10px] text-foreground mt-0.5">
                            {secondaryLabel(p)}
                          </p>
                        )}
                      </div>
                      {isActive && <Check size={12} className="flex-shrink-0 text-foreground" />}
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

type ModalShellProps = {
  open: any
  onClose: any
  title: string
  titleId: string
  maxWidth?: string
  children: ReactNode
  footer?: any
}

// ─────────────────────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────────────────────
function ModalShell({ open, onClose, title, titleId, maxWidth = 'max-w-md', children, footer }: ModalShellProps) {
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

type SummaryCardsProps = {
  bookings: any
  active: any
  onSelect: (...args: any[]) => any
}

// KPI strip as on the Dashboard; each tile filters the list below.
function SummaryCards({ bookings, active, onSelect }: SummaryCardsProps) {
  const stats = useMemo(() => {
    let upcoming = 0, inHouse = 0, needsAttention = 0
    for (const b of bookings) {
      const s = deriveBookingStatus(b)
      if (s === 'upcoming') upcoming++
      else if (s === 'in-house') inHouse++
      else if (s === 'needs-attention') needsAttention++
    }
    return { total: bookings.length, upcoming, inHouse, needsAttention }
  }, [bookings])

  const pick = (id) => onSelect(active === id ? 'all' : id)

  return (
    <StatStrip cols={4}>
      <StatTile icon={CalendarIcon} label="Total bookings" value={stats.total} sub="All active records" active={active === 'all'} onClick={() => onSelect('all')} />
      <StatTile icon={CalendarClock} label="Upcoming" value={stats.upcoming} sub="Future check-ins" active={active === 'upcoming'} onClick={() => pick('upcoming')} />
      <StatTile icon={BedDouble} label="In-house" value={stats.inHouse} sub="Guests staying now" active={active === 'in-house'} onClick={() => pick('in-house')} />
      <StatTile
        icon={AlertTriangle}
        label="Needs attention"
        value={stats.needsAttention}
        sub={stats.needsAttention > 0 ? 'Left with a balance owed' : 'Everyone has settled'}
        attention={stats.needsAttention > 0}
        active={active === 'needs-attention'}
        onClick={() => pick('needs-attention')}
      />
    </StatStrip>
  )
}

type DateRangeFilterProps = {
  from: string
  to: string
  onFromChange: (...args: any[]) => any
  onToChange: (...args: any[]) => any
  onClear: () => void
}

function DateRangeFilter({ from, to, onFromChange, onToChange, onClear }: DateRangeFilterProps) {
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
            ? 'bg-brand-solid text-white border-brand-solid'
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
            ref={revealOnMount} className="absolute right-0 z-30 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl bg-popover border border-border shadow-xl p-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">
              Booking check-in range
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block">From</label>
                <DatePicker value={localFrom} onChange={setLocalFrom} maxDate={localTo || null} rangeEnd={localTo || null} placeholder="Any day" size="sm" align="right" ariaLabel="Check-in from" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block">To</label>
                <DatePicker value={localTo} onChange={setLocalTo} minDate={localFrom || null} rangeStart={localFrom || null} placeholder="Any day" size="sm" align="right" ariaLabel="Check-in to" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
              <button type="button" onClick={clear} disabled={!localFrom && !localTo}
                className="text-[11px] font-semibold text-foreground hover:text-foreground disabled:opacity-40">
                Clear
              </button>
              <button type="button" onClick={apply}
                className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-brand-solid text-white text-[11px] font-semibold hover:bg-brand-solid/90">
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

const clockOf = (d: Date) => formatClock(d.getHours(), d.getMinutes())

type TodayRowProps = {
  booking: any
  kind: 'in' | 'out'
  now: number
  onClick: () => void
  onConfirmCheckout?: (booking: any) => void
  onLateCheckout?: (booking: any) => void
}

function TodayRow({ booking, kind, now, onClick, onConfirmCheckout, onLateCheckout }: TodayRowProps) {
  const balance = Number(booking.balance || 0)
  const nights = computeNights(booking.check_in, booking.check_out)
  const guests = Number(booking.guests || 0)
  const late = booking.late_checkout_at ? new Date(booking.late_checkout_at) : null

  let lead: { lead: string; caption: string; tone: string }
  let stillIn = false
  if (kind === 'in') {
    // Before 3 PM a countdown; after it, the hour.
    const at = stayMoment(booking.check_in, STAY_TIMES.checkIn)
    const until = at ? at.getTime() - now : 0
    lead = until > 0
      ? { lead: formatSpan(until), caption: 'to check-in', tone: BOOKING_STATUS_TEXT.upcoming.className }
      : { lead: formatClock(STAY_TIMES.checkIn.hour, STAY_TIMES.checkIn.minute), caption: 'check-in', tone: BOOKING_STATUS_TEXT['in-house'].className }
  } else {
    const state = guestState(booking, now)
    stillIn = state.kind === 'staying' || state.kind === 'unconfirmed'
    if (state.kind === 'staying') {
      lead = { lead: formatSpan(state.due.getTime() - now), caption: late ? 'to late check-out' : 'to check-out', tone: BOOKING_STATUS_TEXT['needs-attention'].className }
    } else if (state.kind === 'unconfirmed') {
      lead = { lead: clockOf(state.due), caption: 'not confirmed', tone: BOOKING_STATUS_TEXT['needs-attention'].className }
    } else if (state.kind === 'left') {
      lead = { lead: clockOf(state.at), caption: 'checked out', tone: BOOKING_STATUS_TEXT['in-house'].className }
    } else {
      lead = { lead: formatClock(STAY_TIMES.checkOut.hour, STAY_TIMES.checkOut.minute), caption: 'check-out', tone: '' }
    }
  }

  return (
    <QueueRow
      lead={lead.lead}
      leadCaption={lead.caption}
      leadTone={lead.tone}
      label={`Open ${booking.guest_name || 'booking'}, ${booking.units?.unit_code || 'no unit'}: ${lead.lead} ${lead.caption}`}
      title={(
        <>
          {booking.guest_name || '—'}
          {booking.booking_code && <span className="ml-2 inline-flex align-middle"><Code value={booking.booking_code} label="Booking code" className="text-[11px]" /></span>}
        </>
      )}
      subtitle={(
        <>
          {booking.units?.unit_code ? <Code value={booking.units.unit_code} label="Unit code" className="text-[11.5px]" /> : <span>No unit</span>}
          {booking.units?.building && <WithDot>{booking.units.building}</WithDot>}
          {nights > 0 && <WithDot>{nights} night{nights === 1 ? '' : 's'}</WithDot>}
          {guests > 0 && <WithDot>{guests} guest{guests === 1 ? '' : 's'}</WithDot>}
          {kind === 'out' && late && <WithDot><span className="font-semibold">Late check-out {clockOf(late)}</span></WithDot>}
        </>
      )}
      aside={balance > 0
        ? <span className="tabular-nums text-amber-600 dark:text-amber-400">{formatMoney(balance)} due</span>
        : <span className="text-emerald-600 dark:text-emerald-400">Paid</span>}
      asideSub={`${formatDateShort(booking.check_in)} → ${formatDateShort(booking.check_out)}`}
      actions={kind === 'out' && stillIn && (onConfirmCheckout || onLateCheckout) ? (
        <>
          {onConfirmCheckout && (
            <RowAction primary icon={CheckCircle2} onClick={() => onConfirmCheckout(booking)}>Guest checked out</RowAction>
          )}
          {onLateCheckout && (
            <RowAction icon={AlarmClockPlus} onClick={() => onLateCheckout(booking)}>{late ? 'Change late check-out' : 'Late check-out'}</RowAction>
          )}
        </>
      ) : null}
      onClick={onClick}
    />
  )
}

type TodayCardProps = {
  checkIns: any[]
  checkOuts: any[]
  loading: boolean
  onRowClick: (booking: any) => void
  onConfirmCheckout: (booking: any) => void
  onLateCheckout: (booking: any) => void
}

// Where each of today's departures stands: still in first, then checked out.
const CHECKOUT_ORDER = { unconfirmed: 0, staying: 1, none: 2, left: 3 }

// Today's arrivals and departures, each with a live countdown to its hour.
// Departures are confirmed here ("Guest checked out"), which starts the cleaning.
function TodayCard({ checkIns, checkOuts, loading, onRowClick, onConfirmCheckout, onLateCheckout }: TodayCardProps) {
  const now = useNow()
  const outs = useMemo(
    () => checkOuts
      .map((b) => ({ b, state: guestState(b, now) }))
      .sort((x, y) => CHECKOUT_ORDER[x.state.kind] - CHECKOUT_ORDER[y.state.kind]),
    [checkOuts, now],
  )
  const owing = checkOuts.filter((b) => Number(b.balance || 0) > 0).length
  const unconfirmed = outs.filter((o) => o.state.kind === 'unconfirmed').length
  const inAt = formatClock(STAY_TIMES.checkIn.hour, STAY_TIMES.checkIn.minute)
  const outBy = formatClock(STAY_TIMES.checkOut.hour, STAY_TIMES.checkOut.minute)
  const summary = loading ? 'Loading…' : `${checkIns.length} arriving · ${checkOuts.length} leaving`
  const outHint = [
    `Guests leave by ${outBy}`,
    unconfirmed > 0 && `${unconfirmed} not confirmed`,
    owing > 0 && `${owing} still owe${owing === 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ')

  return (
    <Panel>
      <PanelHeader icon={CalendarIcon} title="Today" subtitle={summary} />
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <QueueColumn
          icon={KeyRound}
          title="Check-ins"
          hint={`Guests arrive from ${inAt}`}
          count={loading ? null : checkIns.length}
          loading={loading}
          emptyTitle="No check-ins today"
          emptyText="Nobody is arriving."
        >
          {checkIns.map((b) => <TodayRow key={b.id} booking={b} kind="in" now={now} onClick={() => onRowClick(b)} />)}
        </QueueColumn>
        <QueueColumn
          icon={Luggage}
          title="Check-outs"
          hint={outHint}
          count={loading ? null : checkOuts.length}
          countTone={unconfirmed > 0 ? BOOKING_STATUS_TEXT['needs-attention'].className : undefined}
          loading={loading}
          emptyTitle="No check-outs today"
          emptyText="Nobody is leaving."
        >
          {outs.map(({ b }) => (
            <TodayRow
              key={b.id}
              booking={b}
              kind="out"
              now={now}
              onClick={() => onRowClick(b)}
              onConfirmCheckout={onConfirmCheckout}
              onLateCheckout={onLateCheckout}
            />
          ))}
        </QueueColumn>
      </div>
    </Panel>
  )
}

type WarningChipProps = {
  icon: LucideIcon
  label: string
  count: any
  active: boolean
  onClick: () => void
  triggerRef: any
  children: ReactNode
}

function WarningChip({ icon: Icon, label, count, active, onClick, triggerRef, children }: WarningChipProps) {
  return (
    <div className="relative" ref={triggerRef}>
      <button type="button" onClick={onClick}
        className={cn('inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium border transition-colors',
          active ? 'bg-brand-solid text-white border-brand-solid' : 'bg-card text-foreground border-border hover:bg-muted')}>
        <Icon size={13} className={active ? 'opacity-90' : 'opacity-60'} />
        <span>{label}</span>
        <span className={cn('min-w-[20px] h-[18px] inline-flex items-center justify-center px-1.5 rounded text-[10px] font-semibold tabular-nums', active ? 'bg-background/20' : 'border border-border')}>{count}</span>
      </button>
      {children}
    </div>
  )
}

type DropdownPortalProps = {
  anchorRef: any
  onClose: () => void
  children: ReactNode
}

function DropdownPortal({ anchorRef, onClose, children }: DropdownPortalProps) {
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

type WarningRowProps = {
  booking: any
  chip: string
  chipTone: string
  onClick: () => void
}

function WarningRow({ booking, chip, chipTone, onClick }: WarningRowProps) {
  const chipClass = chipTone === 'red' ? 'text-red-600 dark:text-red-400' : chipTone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors flex items-center gap-3 group">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Code value={booking.booking_code} label="Booking code" className="text-xs" />
          <span className="text-[11px] text-foreground truncate">{booking.guest_name}</span>
        </div>
        <p className="text-[10px] text-foreground mt-0.5 truncate">
          {booking.units?.unit_code || '—'} · {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
        </p>
      </div>
      <span className={cn('inline-flex items-center text-[11px] font-semibold whitespace-nowrap flex-shrink-0', chipClass)}>{chip}</span>
    </button>
  )
}

type WarningsStripProps = {
  needsAttention: any
  endingSoon: any
  onSelect: (b: any) => void
}

function WarningsStrip({ needsAttention, endingSoon, onSelect }: WarningsStripProps) {
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
        <WarningChip icon={AlertTriangle} label="Needs attention" count={naCount} active={open === 'na'}
          onClick={() => toggle('na')} triggerRef={naRef}>
          <AnimatePresence>
            {open === 'na' && (
              <DropdownPortal anchorRef={naRef} onClose={() => setOpen(null)}>
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Needs Attention</p>
                    <p className="text-[10px] text-foreground mt-0.5">
                      {naCount} booking{naCount === 1 ? '' : 's'} past check-out with balance still owed
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="p-1 -m-1 rounded hover:bg-muted text-foreground"><X size={12} /></button>
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
        <WarningChip icon={Clock} label="Ending soon" count={esCount} active={open === 'es'}
          onClick={() => toggle('es')} triggerRef={esRef}>
          <AnimatePresence>
            {open === 'es' && (
              <DropdownPortal anchorRef={esRef} onClose={() => setOpen(null)}>
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Ending Soon</p>
                    <p className="text-[10px] text-foreground mt-0.5">
                      {esCount} booking{esCount === 1 ? '' : 's'} ending in the next 2 days with balance due
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(null)} className="p-1 -m-1 rounded hover:bg-muted text-foreground"><X size={12} /></button>
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

type DetailSectionProps = {
  title: string
  children: ReactNode
}

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2 px-0.5">{title}</h4>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

type CheckoutSectionProps = {
  booking: any
  nextArrival: any
  editable: boolean
  onConfirm: (confirmed: boolean) => void
  onLate: () => void
}

// When the guest has to be out (with any late check-out), whether they've
// left, who's arriving next, and the buttons to confirm or give a late check-out.
function CheckoutSection({ booking, nextArrival, editable, onConfirm, onLate }: CheckoutSectionProps) {
  const now = useNow()
  const state = guestState(booking, now)
  if (state.kind === 'none') return null
  const due = checkoutDue(booking)
  const late = !!booking.late_checkout_at
  const started = parseDateOnly(booking.check_in) <= today()
  const label = 'text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0'
  const checkoutToday = String(booking.check_out).slice(0, 10) === todayISO()

  let guest: ReactNode
  if (state.kind === 'left') {
    guest = state.confirmed ? (
      <span>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Checked out</span>
        {' '}{state.at.toDateString() === new Date(now).toDateString() ? 'at' : `${formatDateShort(state.at)},`} {clockOf(state.at)}
        {booking.checked_out_by_name && ` · by ${booking.checked_out_by_name}`}
      </span>
    ) : (
      <span><span className="font-semibold">Left</span> · check-out day is over (not confirmed)</span>
    )
  } else if (state.kind === 'unconfirmed') {
    guest = (
      <span>
        <span className="font-semibold text-amber-600 dark:text-amber-400">Not confirmed</span>
        {' '}· check-out was {formatSpan(now - state.due.getTime())} ago
      </span>
    )
  } else {
    guest = checkoutToday
      ? <span><span className="font-semibold text-amber-600 dark:text-amber-400">Still in</span> · leaves in {formatSpan(state.due.getTime() - now)}</span>
      : <span><span className="font-semibold">Staying</span> · checks out {formatDateShort(booking.check_out)}</span>
  }

  return (
    <DetailSection title="Check-out">
      <div className="p-3 space-y-1">
        <div className="flex items-baseline gap-2 py-0.5">
          <span className={label}>Due</span>
          <span className="text-xs tabular-nums text-foreground">
            {formatDate(booking.check_out)} · {due ? clockOf(due) : STAY_TIMES.checkOut.label}
            {late && <span className="font-semibold"> · late check-out{booking.late_checkout_by_name ? ` by ${booking.late_checkout_by_name}` : ''}</span>}
          </span>
        </div>
        <div className="flex items-baseline gap-2 py-0.5">
          <span className={label}>Guest</span>
          <span className="text-xs text-foreground">{guest}</span>
        </div>
        {nextArrival && (
          <div className="flex items-baseline gap-2 py-0.5">
            <span className={label}>Next guest</span>
            <span className="text-xs text-foreground">
              <Code value={nextArrival.booking_code} label="Booking code" /> checks in at {formatClock(STAY_TIMES.checkIn.hour, STAY_TIMES.checkIn.minute)} that day, so a late check-out ends by {TURNOVER_CHECKOUT.label}
            </span>
          </div>
        )}
        {editable && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            {state.kind !== 'left' && started && (
              <RowAction primary icon={CheckCircle2} onClick={() => onConfirm(true)}>Guest checked out</RowAction>
            )}
            {state.kind !== 'left' && (
              <RowAction icon={AlarmClockPlus} onClick={onLate}>{late ? 'Change late check-out' : 'Late check-out'}</RowAction>
            )}
            {state.kind === 'left' && state.confirmed && (
              <RowAction icon={Undo2} onClick={() => onConfirm(false)} title="The guest hasn't actually left">Undo check-out</RowAction>
            )}
          </div>
        )}
      </div>
    </DetailSection>
  )
}

type BookingDetailPanelProps = {
  booking: any
  contracts: any
  onBookingChange: () => void
  onClose: () => void
  onAddPayment: () => void
  onExtend: () => void
  onComplete: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
  onEmail: () => void
  /** The booking arriving in the same unit on this one's check-out day, if any. */
  nextArrival: any
  onConfirmCheckout: (confirmed: boolean) => void
  onLateCheckout: () => void
}

function BookingDetailPanel({
  booking, contracts, onBookingChange, onClose,
  onAddPayment, onExtend, onComplete, onEdit, onDelete, onEmail,
  nextArrival, onConfirmCheckout, onLateCheckout,
}: BookingDetailPanelProps) {
  const status = deriveBookingStatus(booking)
  const isCompleted = status === 'completed'
  const isPaid = booking.payment_status === 'paid'
  // Left once someone confirms the check-out, or the check-out day is over.
  const guestLeft = hasGuestLeft(booking)
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

  const panelMotion = useSidePanelMotion(PANEL_WIDTH)

  return (
    <motion.div {...panelMotion}>
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
            <div className="px-5 py-4 line-below flex-shrink-0">
              <div className="flex items-start gap-3">
                <GuestAvatar name={booking.guest_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground truncate">{booking.guest_name}</p>
                  <Code value={booking.booking_code} label="Booking code" className="text-[11px]" block />
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
                        : 'text-foreground border-border cursor-not-allowed opacity-60')}
                    onClick={canComplete ? onComplete : undefined}
                    disabled={!canComplete}>
                    <CheckCircle2 size={11} /> Mark as Done
                  </Button>
                )}
              </div>
              {!isCompleted && !canComplete && (
                <p className="-mt-2 text-right text-[11px] text-foreground">
                  {guestLeft
                    ? 'To mark this booking as done, collect the remaining balance first.'
                    : 'You can mark this booking as done after the guest checks out.'}
                </p>
              )}

              <CheckoutSection
                booking={booking}
                nextArrival={nextArrival}
                editable={!isCompleted}
                onConfirm={onConfirmCheckout}
                onLate={onLateCheckout}
              />

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
                        : <span className="italic text-foreground">Never edited</span>}
                    </span>
                  </div>
                </div>
              </DetailSection>

              <DetailSection title={`Payment History · ${transactions.length}`}>
                <div className="p-2">
                  {transactions.length === 0 ? (
                    <div className="py-4 text-center text-xs text-foreground italic">No payments recorded yet</div>
                  ) : (
                    <div className="space-y-1.5">
                      {transactions.map((t, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-background">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-foreground min-w-[60px]">{formatDateShort(t.date)}</span>
                            <span className="text-xs font-semibold text-foreground tabular-nums">{formatMoney(t.amount)}</span>
                            {t.method && <span className="text-[11px] text-foreground truncate">{t.method}</span>}
                            {t.reference && <span className="text-[10px] text-foreground font-mono truncate">· {t.reference}</span>}
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
                    <Code value={booking.units?.unit_code} label="Unit code" className="text-sm" />
                    <span className="text-[11px] text-foreground truncate">{booking.units?.building || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Booked by</span>
                    <span className="text-xs font-semibold text-foreground">
                      {booking.booker_name && <span className="mr-1.5">{booking.booker_name}</span>}
                      {booking.booker_code ? <Code value={booking.booker_code} label="Booker code" className="text-xs" /> : !booking.booker_name && '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Affiliate</span>
                    <span className="text-xs font-semibold text-foreground">
                      {booking.affiliate_name && <span className="mr-1.5">{booking.affiliate_name}</span>}
                      {booking.affiliate_code ? <Code value={booking.affiliate_code} label="Affiliate code" className="text-xs" /> : !booking.affiliate_name && '—'}
                    </span>
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="Contract">
                {governing ? (
                  <div className="p-3 space-y-0.5">
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Code</span>
                      <Code value={governing.contract_code} label="Contract code" className="text-xs" />
                    </div>
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Effective</span>
                      <span className="text-xs tabular-nums text-foreground">{governing.effective_date || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Expiry</span>
                      <span className="text-xs tabular-nums text-foreground">{governing.expiry_date || <span className="italic text-foreground">Open-ended</span>}</span>
                    </div>
                    <p className="pt-2 mt-2 border-t border-border text-[10px] text-foreground italic">
                      Contract PDF opens from the Contracts page.
                    </p>
                  </div>
                ) : (
                  <div className="p-3">
                    <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                      No contract covers this booking&apos;s check-in.
                    </p>
                    <p className="text-[10px] text-foreground mt-1">
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
                      {formatDate(booking.check_out)} · {booking.late_checkout_at
                        ? `${clockOf(new Date(booking.late_checkout_at))} (late check-out)`
                        : STAY_TIMES.checkOut.label}
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
                  <p className="pt-2 mt-1 border-t border-border text-[10px] text-foreground italic flex items-center gap-1">
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

type BookingListRowProps = {
  booking: any
  contracts: any
  selected: boolean
  highlighted: boolean
  onClick: () => void
  onViewCleaning: (b: any) => void | Promise<void>
}

function BookingListRow({ booking, contracts, selected, highlighted, onClick, onViewCleaning }: BookingListRowProps) {
  const navigate = useNavigate()
  const status = deriveBookingStatus(booking)
  const nights = computeNights(booking.check_in, booking.check_out)
  const governing = findContractForBooking(booking, contracts)
  const bookedAgo = timeAgo(booking.created_at)
  const editedAgo = timeAgo(booking.updated_at)
  const wasEdited = booking.updated_at && booking.created_at && booking.updated_at !== booking.created_at

  const contextItems = [
    { label: 'See in Bookings', icon: CalendarIcon, onSelect: onClick },
    {
      label: 'See in Accounting',
      icon: TrendingUp,
      hint: governing ? undefined : 'No contract',
      disabled: !governing,
      onSelect: () => governing && navigate(crmLink.accountingBooking(governing.id, booking)),
    },
    {
      label: 'See its contract in Contracts',
      icon: FileText,
      disabled: !governing,
      onSelect: () => governing && navigate(crmLink.contract(governing.id)),
    },
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
    <ContextMenu items={contextItems} className="row-line">
      <motion.button
        type="button"
        data-booking-id={booking.id}
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
        <div className="flex items-center gap-3 min-w-0">
          <GuestAvatar name={booking.guest_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-foreground truncate leading-tight">{booking.guest_name}</p>
            <p className="text-[11.5px] text-foreground truncate mt-0.5">
              {booking.guest_email || booking.guest_contact || `${booking.guests || 1} guest${booking.guests > 1 ? 's' : ''}`}
            </p>
            {bookedAgo && (
              <p className="text-[11px] text-foreground truncate">
                Booked {bookedAgo}
                {wasEdited && editedAgo && <> · Edited {editedAgo}</>}
              </p>
            )}
          </div>
        </div>
        <Code value={booking.booking_code} label="Booking code" className="text-[12px]" />
        <div className="min-w-0">
          <Code value={booking.units?.unit_code} label="Unit code" className="text-[12.5px]" block />
          <span className="block text-[11.5px] text-foreground truncate">{booking.units?.building || '—'}</span>
          {!governing && (
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              No contract
            </span>
          )}
        </div>
        <div className="min-w-0 tabular-nums">
          <div className="text-[12.5px] font-medium text-foreground truncate">{formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}</div>
          <div className="text-[11.5px] text-foreground">{nights} night{nights === 1 ? '' : 's'}</div>
        </div>
        <div className="min-w-0">
          <PaymentStatusBadge status={booking.payment_status} />
          <div className="text-[11.5px] tabular-nums text-foreground truncate">
            {Number(booking.balance || 0) > 0
              ? `${formatMoney(booking.balance)} due of ${formatMoney(booking.total_amount)}`
              : formatMoney(booking.total_amount)}
          </div>
        </div>
        <div className="flex items-center justify-end min-w-0">
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

type FormSectionProps = {
  icon: LucideIcon
  title: string
  subtitle: string
  children: ReactNode
  className?: string
}

// ─────────────────────────────────────────────────────────────
// Section wrapper for the form
// ─────────────────────────────────────────────────────────────
function FormSection({ icon: Icon, title, subtitle, children, className }: FormSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className="text-foreground flex-shrink-0" />}
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {subtitle && <span className="text-[10px] text-foreground">· {subtitle}</span>}
      </div>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {children}
      </div>
    </section>
  )
}

type BookingFormModalProps = {
  open: boolean
  onClose: () => void
  onSaved: (signal?: any) => Promise<void>
  units: any
  editing: any
  specialists: any
  affiliates: any
  affiliateCounts: any
  contracts: any
  bookings: any
}

function BookingFormModal({ open, onClose, onSaved, units, editing, specialists, affiliates, affiliateCounts, contracts, bookings }: BookingFormModalProps) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [liveAffiliateCount, setLiveAffiliateCount] = useState(null)
  const [sendEmail, setSendEmail] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
    const nextErrors: Record<string, string> = {}
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

      const payload: Record<string, unknown> = {
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
            <CalendarIcon size={20} className="text-foreground flex-shrink-0" />
            <div className="min-w-0">
              <h2 id="booking-form-title" className="text-base font-bold text-foreground truncate">
                {editing ? 'Edit Booking' : 'New Booking'}
              </h2>
              {editing && <div className="mt-0.5"><Code value={editing.booking_code} label="Booking code" className="text-[11px]" block /></div>}
              {!editing && <p className="text-[11px] text-foreground mt-0.5">Create a new reservation</p>}
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
                    <p className="text-[10px] text-foreground mt-1.5">
                      Contract: {selectedContract.effective_date || '—'} → {selectedContract.expiry_date || 'open-ended'}
                    </p>
                  )}
                </div>
              </FormSection>

              <FormSection icon={CalendarIcon} title="Dates" subtitle={`${nights} night${nights === 1 ? '' : 's'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Check-in *</label>
                    <StayDatePicker
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
                    <StayDatePicker
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
                  <p className="text-[10px] text-foreground">
                    {unitBookings.length} existing booking{unitBookings.length === 1 ? '' : 's'} · red circles mark occupied days
                  </p>
                )}
                {!form.unit_id && (
                  <p className="text-[10px] text-foreground italic">
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
                    <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold">Initial payment (optional)</p>
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
                        <DatePicker value={form.initial_date} onChange={(v) => setField('initial_date', v)} placeholder="Payment date" size="lg" align="right" clearable={false} ariaLabel="Payment date" />
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
                <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted/30 transition-colors">
                  <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)}
                    className="mt-0.5 rounded border-border" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">Send booking confirmation email</p>
                    <p className="text-[10px] text-foreground mt-0.5">
                      The guest receives a confirmation after the booking is created. You can also send it later from the booking panel.
                    </p>
                  </div>
                </label>
              )}
            </div>

            {/* RIGHT — sticky summary */}
            <aside className="lg:sticky lg:top-0 self-start">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-wider text-foreground font-bold">Live Summary</p>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-foreground">Unit</span>
                    <span className="font-semibold text-foreground truncate ml-2 text-right">
                      {selectedUnit ? unitLabel(selectedUnit) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Check-in</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {form.check_in || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Check-out</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {form.check_out || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Nights</span>
                    <span className="font-semibold text-foreground tabular-nums">{nights}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground">Guests</span>
                    <span className="font-semibold text-foreground tabular-nums">{form.guests || 1}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-foreground">Total</span>
                    <span className="font-semibold text-foreground tabular-nums">{formatMoney(totalAmount)}</span>
                  </div>
                  {!editing && initialAmount > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-foreground">Initial</span>
                        <span className="font-semibold text-foreground tabular-nums">{formatMoney(initialAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground">Remaining</span>
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
                    <p className="text-[10px] uppercase tracking-wider text-foreground font-bold">Commissions</p>
                    <div className="flex justify-between">
                      <span className="text-foreground">Booker ({bookerRate}%)</span>
                      <span className="font-semibold text-foreground tabular-nums">{formatMoney(bookerCommission)}</span>
                    </div>
                  </div>
                )}
                {affiliateCommission > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground">
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
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-card flex-shrink-0">
          <p className="text-[10px] text-foreground hidden sm:block">
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

type AddPaymentModalProps = {
  open: boolean
  onClose: () => void
  booking: any
  onSaved: (signal?: any) => Promise<void>
}

function AddPaymentModal({ open, onClose, booking, onSaved }: AddPaymentModalProps) {
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
        <div className="grid grid-cols-3 gap-2 text-xs bg-card border border-border rounded p-3">
          <div><div className="text-foreground">Total</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(total)}</div></div>
          <div><div className="text-foreground">Paid</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(paid)}</div></div>
          <div><div className="text-foreground">Balance</div><div className="font-semibold tabular-nums text-foreground">{formatMoney(balance)}</div></div>
        </div>
        <div><label className={labelClass}>Amount (₱) *</label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs rounded" autoFocus /></div>
        <div><label className={labelClass}>Method</label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="GCash, Bank transfer, Cash..." className="h-9 text-xs rounded" maxLength={60} /></div>
        <div><label className={labelClass}>Reference</label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 text-xs rounded" maxLength={100} /></div>
        <div><label className={labelClass}>Date</label><DatePicker value={date} onChange={setDate} placeholder="Payment date" clearable={false} ariaLabel="Payment date" /></div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card">
        <Button variant="outline" size="sm" className="h-9 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" className="h-9 rounded text-xs" onClick={save} disabled={saving} style={{ backgroundColor: BRAND }}>
          {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
          {saving ? 'Saving...' : 'Add Payment'}
        </Button>
      </div>
    </ModalShell>
  )
}

type ExtendMode = 'hours' | 'nights'

const EXTEND_MODES = [
  { id: 'hours', label: 'More hours', icon: AlarmClockPlus },
  { id: 'nights', label: 'More nights', icon: BedDouble },
]

// Quick picks for a late check-out (each switched off past the limit).
const LATE_CHECKOUT_PICKS = [12, 13, 14, 15, 16, 18]

function hhmm(d: Date | null) {
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
}

/** A stay day at an "HH:MM" time, or null. */
function momentAt(day, time) {
  const [h, m] = String(time || '').split(':').map(Number)
  return day && time && Number.isFinite(h) ? stayMoment(day, { hour: h, minute: m || 0 }) : null
}

type LateTimePickerProps = {
  day: string
  value: string
  onChange: (value: string) => void
  latest: Date | null
  arrival: any
  openHint: ReactNode
}

// A time past 11 AM on the guest's last day: until 1 PM when another guest
// checks in that day, otherwise any time until midnight. Quick picks for the
// usual hours, and every half hour in the list beside them.
function LateTimePicker({ day, value, onChange, latest, arrival, openHint }: LateTimePickerProps) {
  const picked = momentAt(day, value)
  const usual = stayMoment(day, STAY_TIMES.checkOut)
  const tooEarly = !!picked && !!usual && picked <= usual
  const tooLate = !!picked && !!latest && picked > latest
  const arrivalAt = arrival ? stayMoment(day, STAY_TIMES.checkIn) : null
  const arrivalCode = arrival ? <Code value={arrival.booking_code} label="Booking code" /> : null

  // Every half hour after 11 AM up to the limit for the day.
  const slots = useMemo(() => {
    const out: { value: string; label: string }[] = []
    for (let mins = 11 * 60 + 30; mins <= 23 * 60 + 30; mins += 30) {
      const h = Math.floor(mins / 60), m = mins % 60
      const at = stayMoment(day, { hour: h, minute: m })
      if (!at || (latest && at > latest)) break
      out.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, label: formatClock(h, m) })
    }
    return out
  }, [day, latest])
  const quick = LATE_CHECKOUT_PICKS.map((hour) => `${String(hour).padStart(2, '0')}:00`)
  const fromList = !!value && !quick.includes(value)

  let hint: ReactNode
  if (tooEarly) hint = `Pick a time after ${STAY_TIMES.checkOut.label}.`
  else if (tooLate) hint = <>Too late: {arrivalCode} checks in at {STAY_TIMES.checkIn.label}, so the guest has to be out by {TURNOVER_CHECKOUT.label}.</>
  else if (arrival && picked && arrivalAt) hint = <>Leaves {formatSpan(arrivalAt.getTime() - picked.getTime())} to clean before {arrivalCode} checks in at {STAY_TIMES.checkIn.label}.</>
  else if (arrival) hint = <>Until {TURNOVER_CHECKOUT.label} at the latest: {arrivalCode} checks in at {STAY_TIMES.checkIn.label} that day.</>
  else hint = openHint

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {LATE_CHECKOUT_PICKS.map((hour, i) => {
          const at = stayMoment(day, { hour, minute: 0 })
          const allowed = !!at && (!latest || at <= latest)
          const pick = quick[i]
          const on = value === pick
          return (
            <button
              key={hour}
              type="button"
              disabled={!allowed}
              aria-pressed={on}
              onClick={() => onChange(pick)}
              title={allowed ? undefined : `${arrival?.booking_code || 'The next guest'} checks in at ${STAY_TIMES.checkIn.label}: out by ${TURNOVER_CHECKOUT.label}`}
              className={cn(
                'h-9 rounded-md border text-[12px] font-semibold tabular-nums transition-colors disabled:opacity-35 disabled:cursor-not-allowed',
                on ? 'border-brand-solid bg-brand-solid text-white' : 'border-border text-foreground hover:border-brand-solid/50',
              )}
            >
              {formatClock(hour)}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-foreground flex-shrink-0">Other time</span>
        <Select value={fromList ? value : ''} onValueChange={(v) => v && onChange(v)}>
          <SelectTrigger aria-label="Other time" className={cn('h-9 text-xs rounded-md flex-1 min-w-0', fromList && 'border-brand-solid ring-1 ring-brand-solid/30')}>
            <SelectValue placeholder="Every half hour…">{fromList ? formatClock(Number(value.slice(0, 2)), Number(value.slice(3, 5))) : null}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {slots.map((s) => <SelectItem key={s.value} value={s.value} className="text-xs tabular-nums">{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className={cn('text-[11px]', tooEarly || tooLate ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-foreground')}>
        {hint}
      </p>
    </div>
  )
}

type ExtendStayModalProps = {
  open: boolean
  onClose: () => void
  booking: any
  bookings: any[]
  mode?: ExtendMode
  onSaved: (signal?: any) => Promise<void> | void
  contracts: any
}

// Extending a stay, either way:
//   More hours  - a late check-out on the current last day
//   More nights - a later check-out day, with or without a late check-out on it
// A late check-out runs until 1 PM when another guest checks in that day
// (housekeeping gets two hours before their 3 PM check-in), otherwise any time
// that day. Nights can be added up to the next guest's check-in day or the
// contract's end, whichever comes first. The database holds to the same
// limits. The booker sets the new total for what's added.
function ExtendStayModal({ open, onClose, booking, bookings, mode: startMode, onSaved, contracts }: ExtendStayModalProps) {
  const [mode, setMode] = useState<ExtendMode>('hours')
  const [hoursTime, setHoursTime] = useState('')
  const [newCheckOut, setNewCheckOut] = useState('')
  const [lateOnLastDay, setLateOnLastDay] = useState(false)
  const [nightsTime, setNightsTime] = useState('')
  const [newTotal, setNewTotal] = useState('')
  const [addPayment, setAddPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payReference, setPayReference] = useState('')
  const [payDate, setPayDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && booking) {
      const out = String(booking.check_out || '').slice(0, 10)
      setMode(startMode || (out === todayISO() ? 'hours' : 'nights'))
      setHoursTime(booking.late_checkout_at ? hhmm(new Date(booking.late_checkout_at)) : '')
      setNewCheckOut(out ? isoAddDays(out, 1) : '')
      setLateOnLastDay(false)
      setNightsTime('')
      setNewTotal(booking.total_amount != null ? String(booking.total_amount) : '')
      setAddPayment(false)
      setPayAmount(''); setPayMethod(''); setPayReference('')
      setPayDate(todayISO())
    }
  }, [open, booking, startMode])

  const governingContract = useMemo(() => {
    if (!booking) return null
    const unit = booking.units
      ? { id: booking.unit_id, unit_code: booking.units.unit_code, building: booking.units.building }
      : { id: booking.unit_id }
    return findGoverningContract(unit, contracts || [])
  }, [booking, contracts])

  const next = useMemo(() => (booking ? nextBookingAfter(booking, bookings || []) : null), [booking, bookings])

  if (!open || !booking) return null

  const all = bookings || []
  const out = String(booking.check_out).slice(0, 10)
  const lateNow = booking.late_checkout_at ? new Date(booking.late_checkout_at) : null
  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1.5 block'
  const nextCode = next ? <Code value={next.booking_code} label="Booking code" /> : null

  // More hours: on the current last day.
  const hoursArrival = arrivalOn(booking, out, all)
  const hoursLatest = latestCheckout(booking, all, out)
  const hoursPicked = momentAt(out, hoursTime)
  const hoursBad = !hoursPicked
    || hoursPicked <= stayMoment(out, STAY_TIMES.checkOut)
    || (!!hoursLatest && hoursPicked > hoursLatest)

  // More nights: as far as the next guest's check-in day or the contract's end.
  const nextIn = next ? String(next.check_in).slice(0, 10) : null
  const contractEnd = governingContract?.expiry_date ? String(governingContract.expiry_date).slice(0, 10) : null
  const maxCheckOut = [nextIn, contractEnd].filter(Boolean).sort()[0] || null
  const limitIsBooking = !!nextIn && nextIn === maxCheckOut
  const canAddNights = !!governingContract && (!maxCheckOut || maxCheckOut > out)
  const nightsDay = sanitizeDateOnly(newCheckOut) || ''
  const nightsAdded = nightsDay > out ? computeNights(out, nightsDay) : 0
  const pastLimit = !!nightsDay && !!maxCheckOut && nightsDay > maxCheckOut
  const nightsArrival = nightsDay ? arrivalOn(booking, nightsDay, all) : null
  const nightsLatest = nightsDay ? latestCheckout(booking, all, nightsDay) : null
  const nightsPicked = lateOnLastDay ? momentAt(nightsDay, nightsTime) : null
  const nightsLateBad = lateOnLastDay && (!nightsPicked
    || nightsPicked <= stayMoment(nightsDay, STAY_TIMES.checkOut)
    || (!!nightsLatest && nightsPicked > nightsLatest))
  const nightsOk = canAddNights && nightsAdded > 0 && !pastLimit && !nightsLateBad

  let nightsHint: ReactNode
  let nightsHintBad = false
  if (!governingContract) {
    nightsHint = 'No contract covers this unit, so nights can\'t be added.'
    nightsHintBad = true
  } else if (!canAddNights) {
    nightsHint = limitIsBooking
      ? <>{nextCode} checks in on {formatDateShort(nextIn)}, the day this guest leaves, so no nights can be added. More hours (until {TURNOVER_CHECKOUT.label}) still works.</>
      : `The contract ends ${formatDate(contractEnd)}. Renew it to add nights.`
    nightsHintBad = true
  } else if (nightsDay && nightsDay <= out) {
    nightsHint = 'Pick a day after the current check-out.'
    nightsHintBad = true
  } else if (pastLimit) {
    nightsHint = limitIsBooking
      ? <>Too far: {nextCode} checks in on {formatDateShort(nextIn)}. Pick that day or earlier.</>
      : `Too far: the contract ends ${formatDate(contractEnd)}. Renew it first.`
    nightsHintBad = true
  } else {
    const added = nightsAdded > 0
      ? `${nightsAdded} more night${nightsAdded === 1 ? '' : 's'}, ${computeNights(booking.check_in, nightsDay)} in all. `
      : ''
    nightsHint = maxCheckOut
      ? <>{added}As far as {formatDateShort(maxCheckOut)}{limitIsBooking ? <>: {nextCode} checks in that day.</> : ': the contract ends then.'}</>
      : `${added}Nothing is booked after this stay.`
  }

  const snapshotBookerRate = booking.booker_rate != null ? Number(booking.booker_rate) : (booking.booker_code ? SPECIALIST_FLAT_RATE : null)
  const bookerRateWasInferred = !!booking.booker_code && booking.booker_rate == null
  const snapshotAffiliateRate = booking.affiliate_rate != null ? Number(booking.affiliate_rate) : null
  const affiliateRateWasInferred = !!booking.affiliate_code && booking.affiliate_rate == null
  const previewTotal = Number(newTotal) || 0
  const previewBooker = booking.booker_code && snapshotBookerRate != null && !bookerRateWasInferred
    ? computeCommissionAtRate(previewTotal, snapshotBookerRate) : 0
  const previewAffiliate = booking.affiliate_code && snapshotAffiliateRate != null && !affiliateRateWasInferred
    ? computeCommissionAtRate(previewTotal, snapshotAffiliateRate) : 0

  const ready = mode === 'hours' ? !hoursBad : nightsOk

  const save = async () => {
    const total = sanitizeMoney(newTotal)
    const totalChanged = total !== Number(booking.total_amount || 0)
    const alreadyPaid = Number(booking.amount_paid || 0)
    if (total <= 0) { toast.error('Total amount must be greater than 0'); return }
    if (total < alreadyPaid) {
      toast.error(`New total (${formatMoney(total)}) is less than already paid (${formatMoney(alreadyPaid)}).`)
      return
    }

    let payment = null
    if (addPayment) {
      const amount = sanitizeMoney(payAmount)
      if (!amount || amount <= 0) { toast.error('Enter a valid extension payment amount'); return }
      if (alreadyPaid + amount > total) {
        toast.error(`Payment would overpay. Max extra: ${formatMoney(Math.max(0, total - alreadyPaid))}`)
        return
      }
      payment = {
        amount,
        method: sanitizeText(payMethod, { max: 60 }) || '',
        reference: sanitizeText(payReference, { max: 100 }) || '',
        date: sanitizeDateOnly(payDate) || todayISO(),
      }
    }

    const patch: Record<string, any> = {}
    if (mode === 'hours') {
      if (hoursBad) { toast.error('Pick a check-out time the day allows'); return }
      patch.late_checkout_at = hoursPicked.toISOString()
    } else {
      if (!nightsOk) { toast.error('Pick a check-out day the stay can reach'); return }
      // Fresh from the database: someone may have booked the unit since this page loaded.
      const conflict = await findOverlappingBooking({
        unitId: booking.unit_id,
        checkIn: booking.check_in,
        checkOut: nightsDay,
        excludeId: booking.id,
      })
      if (conflict) {
        toast.error(`Extending would overlap with booking ${conflict.booking_code} (${conflict.check_in} → ${conflict.check_out}). Pick an earlier check-out.`)
        return
      }
      patch.check_out = nightsDay
      // Set in the same update, so it lands on the new last day; any late
      // check-out on the old last day is dropped.
      patch.late_checkout_at = nightsPicked ? nightsPicked.toISOString() : null
    }
    if (totalChanged) Object.assign(patch, { total_amount: total, ...commissionsForTotal(booking, total) })
    if (payment) patch.transactions = [...(Array.isArray(booking.transactions) ? booking.transactions : []), payment]

    setSaving(true)
    try {
      const { error } = await supabase.from('bookings').update(patch).eq('id', booking.id)
      if (error) throw error

      const totalNote = totalChanged ? ` · total ${formatMoney(total)}` : ''
      if (mode === 'hours') {
        logAudit('LATE_CHECKOUT', 'bookings', booking.id, {
          booking_code: booking.booking_code,
          until: patch.late_checkout_at,
          old_total: booking.total_amount,
          new_total: total,
          added_payment: payment?.amount || 0,
        }).catch(() => {})
        toast.success(`Late check-out until ${clockOf(hoursPicked)}${totalNote}`)
      } else {
        logAudit('EXTEND_BOOKING', 'bookings', booking.id, {
          booking_code: booking.booking_code,
          old_check_out: booking.check_out,
          new_check_out: nightsDay,
          late_checkout_until: patch.late_checkout_at,
          old_total: booking.total_amount,
          new_total: total,
          added_payment: payment?.amount || 0,
        }).catch(() => {})

        const sync = await syncLinkedCleanings({
          bookingId: booking.id,
          newCheckIn: booking.check_in,
          newCheckOut: nightsDay,
          bookingCode: booking.booking_code,
        })
        const stay = `Stay extended to ${formatDateShort(nightsDay)}${nightsPicked ? `, ${clockOf(nightsPicked)}` : ''}${totalNote}`
        toast.success(sync.updated > 0 ? `${stay} · ${sync.updated} cleaning${sync.updated === 1 ? '' : 's'} moved` : stay)
        if (sync.failed > 0) toast.error(`${sync.failed} cleaning${sync.failed === 1 ? '' : 's'} failed to reschedule — check Housekeeping`)
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Could not extend the stay')
    } finally {
      setSaving(false)
    }
  }

  const removeLate = async () => {
    setSaving(true)
    try {
      await setLateCheckout(booking.id, null)
      logAudit('REMOVE_LATE_CHECKOUT', 'bookings', booking.id, { booking_code: booking.booking_code }).catch(() => {})
      toast.success(`Check-out back to ${STAY_TIMES.checkOut.label}`)
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Could not remove the late check-out')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Extend stay" titleId="extend-stay-title">
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          <div className="flex justify-between gap-3">
            <span className="text-foreground">Guest</span>
            <span className="font-semibold text-foreground inline-flex items-center gap-1 min-w-0"><span className="truncate">{booking.guest_name} ·</span> <Code value={booking.units?.unit_code} label="Unit code" /></span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-foreground">Check-out now</span>
            <span className="font-semibold text-foreground tabular-nums text-right">
              {formatDate(out)} · {lateNow ? `${clockOf(lateNow)} (late)` : STAY_TIMES.checkOut.label}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-foreground">Next booking</span>
            <span className="font-semibold text-foreground text-right">
              {next ? <>{nextCode} checks in {formatDateShort(nextIn)}</> : 'None after this stay'}
            </span>
          </div>
        </div>

        <StatusTabs tabs={EXTEND_MODES} value={mode} onChange={setMode} label="How to extend the stay" fill />

        {mode === 'hours' ? (
          <div>
            <span className={labelClass}>Leaves {formatDateShort(out)} at</span>
            <LateTimePicker
              day={out}
              value={hoursTime}
              onChange={setHoursTime}
              latest={hoursLatest}
              arrival={hoursArrival}
              openHint="Nobody checks in that day, so any time until midnight. To stay the night, use More nights."
            />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="extend-checkout" className={labelClass}>New check-out day</label>
              <DatePicker
                id="extend-checkout"
                value={newCheckOut}
                onChange={setNewCheckOut}
                minDate={isoAddDays(out, 1)}
                maxDate={maxCheckOut}
                rangeStart={String(booking.check_in).slice(0, 10)}
                pickedLabel="Stay"
                placeholder="Pick the new check-out day"
                disabled={!canAddNights}
                clearable={false}
              />
              <p className={cn('text-[11px] mt-1.5', nightsHintBad ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-foreground')}>
                {nightsHint}
              </p>
            </div>

            {canAddNights && nightsAdded > 0 && !pastLimit && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={lateOnLastDay} onChange={(e) => setLateOnLastDay(e.target.checked)} className="rounded border-border" />
                  Also stay past {STAY_TIMES.checkOut.label} on {formatDateShort(nightsDay)}
                </label>
                {lateOnLastDay && (
                  <LateTimePicker
                    day={nightsDay}
                    value={nightsTime}
                    onChange={setNightsTime}
                    latest={nightsLatest}
                    arrival={nightsArrival}
                    openHint="Nobody checks in that day, so any time until midnight."
                  />
                )}
              </div>
            )}

            {lateNow && nightsAdded > 0 && (
              <p className="text-[11px] text-foreground">
                The late check-out on {formatDateShort(out)} ({clockOf(lateNow)}) is dropped: the stay now ends on {formatDateShort(nightsDay)}.
              </p>
            )}
          </>
        )}

        {(bookerRateWasInferred || affiliateRateWasInferred) && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            <span className="font-semibold">{bookerRateWasInferred && affiliateRateWasInferred ? 'Booker and affiliate rates' : bookerRateWasInferred ? 'Booker rate' : 'Affiliate rate'} missing.</span>{' '}
            Their commission won't be recalculated.
          </p>
        )}

        <div>
          <label htmlFor="extend-total" className={labelClass}>Booking total (₱)</label>
          <Input id="extend-total" type="number" min={0} value={newTotal} onChange={(e) => setNewTotal(e.target.value)} className="h-8 text-xs rounded" />
          <p className="text-[11px] text-foreground mt-1">
            Was {formatMoney(booking.total_amount)}. Add what the guest pays for the extra {mode === 'hours' ? 'hours' : 'nights'}; commissions follow the new total.
          </p>
        </div>

        {(booking.booker_code || booking.affiliate_code) && previewTotal > 0 && (
          <div className="rounded-md bg-card border border-border p-2.5 space-y-1">
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
            <div><label className={labelClass}>Date</label><DatePicker value={payDate} onChange={setPayDate} placeholder="Payment date" size="sm" clearable={false} ariaLabel="Payment date" /></div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-border bg-card">
        {mode === 'hours' && lateNow && (
          <Button variant="outline" size="sm" className="h-8 rounded text-xs mr-auto" onClick={removeLate} disabled={saving}>
            Back to {STAY_TIMES.checkOut.label}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 rounded text-xs ml-auto" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" className="h-8 rounded text-xs text-white" onClick={save} disabled={saving || !ready} style={{ backgroundColor: BRAND }}>
          {saving
            ? <Loader2 size={12} className="mr-1.5 animate-spin" />
            : mode === 'hours' ? <AlarmClockPlus size={12} className="mr-1.5" /> : <BedDouble size={12} className="mr-1.5" />}
          {saving ? 'Saving…' : mode === 'hours' ? <>Save<span className="max-sm:hidden">&nbsp;late check-out</span></> : 'Extend stay'}
        </Button>
      </div>
    </ModalShell>
  )
}

type CompleteConfirmModalProps = {
  open: boolean
  onClose: () => void
  booking: any
  onConfirmed: (signal?: any) => Promise<void>
}

function CompleteConfirmModal({ open, onClose, booking, onConfirmed }: CompleteConfirmModalProps) {
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
        <div className="bg-card border border-border rounded p-3 space-y-1 mt-3">
          <div className="flex justify-between"><span className="text-foreground">Code</span><Code value={booking.booking_code} label="Booking code" /></div>
          <div className="flex justify-between"><span className="text-foreground">Guest</span><span className="font-semibold text-foreground">{booking.guest_name}</span></div>
          <div className="flex justify-between"><span className="text-foreground">Check-out</span><span className="font-semibold text-foreground">{formatDate(booking.check_out)}</span></div>
          <div className="flex justify-between"><span className="text-foreground">Total</span><span className="font-semibold tabular-nums text-foreground">{formatMoney(booking.total_amount)}</span></div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card">
        <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" className="h-8 rounded text-xs" onClick={confirm} disabled={saving} style={{ backgroundColor: BRAND }}>
          {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={12} className="mr-1.5" />}
          {saving ? 'Saving...' : 'Mark as Done'}
        </Button>
      </div>
    </ModalShell>
  )
}

type BookingsPageProps = {
  initialSelectedId?: any
}

export default function BookingsPage({ initialSelectedId }: BookingsPageProps) {
  const listCap = useListCap()
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
  // { booking, mode }: the Extend stay window, on More hours or More nights (or picked from the day).
  const [extendFor, setExtendFor] = useState(null)
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
  }, [initialSelectedId])

  const fetchData = useCallback(async (signal?) => {
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

  // Column sorting; newest check-in first by default.
  const [sort, setSort] = useState({ key: 'checkin', dir: 'desc' })
  const onSort = (key) => setSort((prev) => nextSort(prev, key, SORT_DEFAULT_DIR))
  const sorted = useMemo(() => {
    const value = SORT_VALUE[sort.key] || SORT_VALUE.checkin
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = value(a), bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return cmp * dir || (b.check_in || '').localeCompare(a.check_in || '')
    })
  }, [filtered, sort])

  // Keyboard: "/" jumps to search, Esc closes the open booking.
  const searchRef = useRef(null)
  const closePanel = useCallback(() => setSelectedId(null), [])
  useListShortcuts({ searchRef, onEscape: selectedId ? closePanel : null })

  const clearFilters = () => { setStatusFilter('all'); setSearch(''); setDateFrom(''); setDateTo('') }
  const filterChips = [
    statusFilter !== 'all' && { key: 'status', label: STATUS_PILLS.find((p) => p.id === statusFilter)?.label || statusFilter, onRemove: () => setStatusFilter('all') },
    debouncedSearch.trim() && { key: 'search', label: `"${debouncedSearch.trim()}"`, onRemove: () => setSearch('') },
    (dateFrom || dateTo) && { key: 'dates', label: `Check-in ${dateFrom ? formatDateShort(dateFrom) : '…'} → ${dateTo ? formatDateShort(dateTo) : '…'}`, onRemove: () => { setDateFrom(''); setDateTo('') } },
  ].filter(Boolean)

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

  // "Guest checked out" starts the cleaning; the toast offers Undo for a mistap.
  const confirmCheckoutFor = async (booking, confirmed = true) => {
    try {
      const row = await confirmCheckout(booking.id, confirmed)
      if (row) setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, ...row } : b)))
      logAudit(confirmed ? 'CONFIRM_CHECKOUT' : 'UNDO_CHECKOUT', 'bookings', booking.id, { booking_code: booking.booking_code }).catch(() => {})
      if (!confirmed) { toast.success('Check-out undone'); return }
      toast((t) => (
        <span className="flex items-center gap-3 text-[13px]">
          <span><strong className="font-semibold">{booking.guest_name || 'Guest'}</strong> checked out · cleaning can start</span>
          <button
            type="button"
            onClick={() => { toast.dismiss(t.id); confirmCheckoutFor(booking, false) }}
            className="font-semibold underline underline-offset-2"
          >
            Undo
          </button>
        </span>
      ), { id: `checkout-${booking.id}`, duration: 6000 })
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Could not save the check-out')
    }
  }

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
      <div data-page-scroll className="flex-1 min-h-0 flex flex-col px-4 py-4 md:px-8 md:py-6 gap-4 overflow-y-auto [&>*]:flex-shrink-0">

        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards bookings={bookings} active={statusFilter} onSelect={setStatusFilter} />
        </div>

        <div className="flex-shrink-0">
          <TodayCard
            checkIns={checkInsToday}
            checkOuts={checkOutsToday}
            loading={isFirstLoad}
            onRowClick={handleTodayPanelRowClick}
            onConfirmCheckout={(b) => confirmCheckoutFor(b)}
            onLateCheckout={(b) => setExtendFor({ booking: b, mode: 'hours' })}
          />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground" />
            <Input ref={searchRef} placeholder="Search guest, booking code, unit, email, booker, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-9 h-8 text-xs rounded" />
            {!search && <SearchKeyHint />}
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
          <StatusTabs tabs={STATUS_PILLS} value={statusFilter} onChange={setStatusFilter} counts={counts} label="Filter bookings by status" />
          <WarningsStrip needsAttention={needsAttention} endingSoon={endingSoon} onSelect={(b) => setSelectedId(b.id)} />
        </div>

        {!isFirstLoad && (
          <ResultsBar
            shown={sorted.length}
            total={bookings.length}
            noun={bookings.length === 1 ? 'booking' : 'bookings'}
            chips={filterChips}
            onClearAll={clearFilters}
            hint="Click a column to sort · Right-click a booking for quick actions · Press / to search"
          />
        )}

        <div className="rounded-md border border-border shadow-sm overflow-hidden bg-card flex flex-col">
          <MobileSort
            options={[{ key: 'guest', label: 'Guest' }, { key: 'code', label: 'Code' }, { key: 'unit', label: 'Unit' }, { key: 'checkin', label: 'Check-in → Check-out' }, { key: 'payment', label: 'Payment' }, { key: 'status', label: 'Status' }]}
            sort={sort}
            onSort={onSort}
            className="flex-shrink-0"
          />
          <div className={cn('flex-shrink-0 px-4 py-2.5 border-b border-border max-md:hidden', ROW_GRID)}>
            <SortHeader label="Guest" sortKey="guest" sort={sort} onSort={onSort} />
            <SortHeader label="Code" sortKey="code" sort={sort} onSort={onSort} />
            <SortHeader label="Unit" sortKey="unit" sort={sort} onSort={onSort} />
            <SortHeader label="Check-in → Check-out" sortKey="checkin" sort={sort} onSort={onSort} />
            <SortHeader label="Payment" sortKey="payment" sort={sort} onSort={onSort} />
            <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} align="right" />
          </div>

          <div {...listCap} className="overflow-y-auto">
            {isFirstLoad ? (
              <div className="space-y-2 p-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : sorted.length === 0 ? (
              <div className="flex items-center justify-center text-center py-12">
                <div>
                  <CalendarIcon size={36} className="text-foreground mx-auto mb-3" />
                  <p className="text-sm text-foreground font-semibold">No bookings match your filters</p>
                  <p className="text-xs text-foreground mt-1">Try clearing the filters, or create a new booking.</p>
                  {filterChips.length > 0 && (
                    <button type="button" onClick={clearFilters} className="mt-4 inline-flex items-center h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted">
                      Clear filters
                    </button>
                  )}
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
            onExtend={() => setExtendFor({ booking: selected })}
            onComplete={() => setCompleteForBooking(selected)}
            onEdit={() => openEdit(selected)}
            onDelete={() => handleDelete(selected)}
            onEmail={() => setConfirmForBooking(selected)}
            nextArrival={sameDayArrival(selected, bookings)}
            onConfirmCheckout={(confirmed) => confirmCheckoutFor(selected, confirmed)}
            onLateCheckout={() => setExtendFor({ booking: selected, mode: 'hours' })}
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
      <ExtendStayModal
        open={!!extendFor}
        onClose={() => setExtendFor(null)}
        booking={extendFor?.booking}
        mode={extendFor?.mode}
        bookings={bookings}
        onSaved={fetchData}
        contracts={contracts}
      />
      <CompleteConfirmModal open={!!completeForBooking} onClose={() => setCompleteForBooking(null)} booking={completeForBooking} onConfirmed={fetchData} />
      <BookingConfirmationModal open={!!confirmForBooking} onClose={() => setConfirmForBooking(null)} booking={confirmForBooking} onSent={fetchData} />
    </div>
  )
}