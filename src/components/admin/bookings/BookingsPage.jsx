import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Download, Loader2,
  Plus, RefreshCw, Search, SlidersHorizontal, X, Trash2,
  Building2, CheckCircle2, Clock, AlertTriangle, Calendar, User, Wallet,
  ChevronRight, Edit2, Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
} from '@/lib/utils'
import {
  getTierInfo, SPECIALIST_FLAT_RATE,
  computeSpecialistCommission, computeAffiliateCommission,
  fetchAffiliateCounts, fetchSpecialistCounts,
} from '@/lib/commissions'

const BRAND = '#2d568e'

const DATE_FILTERS = [
  { id: 'all', label: 'Any status' },
  { id: 'upcoming', label: 'Upcoming (future check-ins)' },
  { id: 'active', label: 'Active (currently staying)' },
  { id: 'needs-action', label: 'Needs Action (guest has left)' },
  { id: 'completed', label: 'Completed' },
]

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'needs-action', label: 'Needs Action' },
  { id: 'completed', label: 'Completed' },
]

const PILL_TEXT_ACTIVE = {
  all: 'text-foreground',
  upcoming: 'text-blue-700 dark:text-blue-400',
  active: 'text-emerald-700 dark:text-emerald-400',
  'needs-action': 'text-amber-700 dark:text-amber-400',
  completed: 'text-gray-700 dark:text-gray-300',
}

const STATUS_BADGE_CONFIG = {
  upcoming: { label: 'Upcoming', className: 'bg-blue-600 text-white hover:bg-blue-600 border-0' },
  active: { label: 'Active', className: 'bg-emerald-600 text-white hover:bg-emerald-600 border-0' },
  'needs-action': { label: 'Needs Action', className: 'bg-amber-600 text-white hover:bg-amber-600 border-0' },
  completed: { label: 'Completed', className: 'bg-gray-500 text-white hover:bg-gray-500 border-0' },
}

const PAYMENT_STATUS_CONFIG = {
  unpaid: { label: 'Unpaid', className: 'bg-red-600 text-white hover:bg-red-600 border-0' },
  partial: { label: 'Partial', className: 'bg-amber-600 text-white hover:bg-amber-600 border-0' },
  paid: { label: 'Paid', className: 'bg-emerald-600 text-white hover:bg-emerald-600 border-0' },
}

const ROW_GRID = 'grid grid-cols-[1.4fr_1fr_1.2fr_1.1fr_1fr_160px] gap-4 items-center'
const PANEL_WIDTH = 448

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
function parseDateOnly(d) { if (!d) return null; const dt = new Date(d); dt.setHours(0, 0, 0, 0); return dt }

function deriveBookingStatus(b) {
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
    { label: 'Total Bookings', value: stats.total, icon: Calendar },
    { label: 'Upcoming', value: stats.upcoming, icon: Clock },
    { label: 'Active', value: stats.active, icon: Building2 },
    { label: 'Finished', value: stats.finished, icon: CheckCircle2 },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

function BookingStatusBadge({ status }) {
  const config = STATUS_BADGE_CONFIG[status]
  if (!config) return null
  return <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', config.className)}>{config.label}</Badge>
}
function PaymentStatusBadge({ status }) {
  const config = PAYMENT_STATUS_CONFIG[status]
  if (!config) return null
  return <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', config.className)}>{config.label}</Badge>
}

function SectionCard({ title, icon: Icon, children, className, action }) {
  return (
    <div className={cn('rounded-md bg-card border border-border overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={13} className="text-muted-foreground flex-shrink-0" />}
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{title}</h4>
        </div>
        {action}
      </div>
      <div className="p-3 space-y-0.5">{children}</div>
    </div>
  )
}

/**
 * Read-only display for auto-computed commission values.
 * Shows a lock icon so admins know it's derived from total_amount.
 */
function ComputedCommissionRow({ label, value, hint }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0 flex items-center gap-1">
        <Lock size={9} className="opacity-60" />
        {label}
      </span>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2 h-7 rounded bg-muted/40 border border-border">
        <span className="text-xs font-semibold tabular-nums text-foreground truncate">{value}</span>
        {hint && <span className="text-[10px] text-muted-foreground flex-shrink-0">{hint}</span>}
      </div>
    </div>
  )
}

function EditableField({ label, value, type = 'text', onSave, auditTag, maxLength = 500, sanitizer }) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = async () => {
    if (draft === (value ?? '')) return
    setStatus('saving')
    try {
      const cleaned = sanitizer ? sanitizer(draft) : (draft === '' ? null : String(draft).slice(0, maxLength))
      const next = cleaned === '' ? null : cleaned
      await onSave(next)
      setStatus('saved')
      if (auditTag) logAudit(`UPDATE_BOOKING_FIELD:${auditTag}`, 'bookings', null, { field: auditTag, from: value, to: next }).catch(() => {})
      setTimeout(() => setStatus('idle'), 1200)
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Save failed')
      setDraft(value ?? '')
      setStatus('idle')
    }
  }
  const cancel = () => setDraft(value ?? '')

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Input type={type} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } if (e.key === 'Escape') { e.preventDefault(); cancel(); e.target.blur() } }}
          onBlur={commit}
          maxLength={maxLength}
          className={cn('h-7 text-xs rounded bg-background flex-1 transition-colors', !value && 'border-border', value && 'border-transparent hover:border-border')}
          placeholder="—" />
        {status === 'saving' && <Loader2 size={11} className="flex-shrink-0 animate-spin text-primary" />}
        {status === 'saved' && <Check size={11} className="flex-shrink-0 text-emerald-500" />}
      </div>
    </div>
  )
}

function WarningChip({ icon: Icon, label, count, active, onClick, children }) {
  return (
    <div className="relative">
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

function DropdownPanel({ title, subtitle, onClose, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
      className="absolute right-0 top-full mt-2 w-[420px] max-h-[520px] bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 -m-1 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </motion.div>
  )
}

function WarningRow({ booking, chip, chipTone, onClick }) {
  const chipClass = chipTone === 'red' ? 'bg-red-600 text-white' : chipTone === 'amber' ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors flex items-center gap-3 group">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs font-semibold text-foreground truncate">{booking.booking_code}</span>
          <span className="text-[11px] text-muted-foreground truncate">{booking.guest_name}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {booking.units?.unit_code || '—'} · {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
        </p>
      </div>
      <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap flex-shrink-0', chipClass)}>{chip}</span>
      <ChevronRight size={12} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
    </button>
  )
}

function WarningsStrip({ needsCompletion, endingSoon, onSelect }) {
  const [open, setOpen] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(null) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const ncCount = needsCompletion.length
  const esCount = endingSoon.length
  if (ncCount === 0 && esCount === 0) return null
  const toggle = (key) => setOpen((v) => (v === key ? null : key))

  return (
    <div className="flex items-center gap-2" ref={wrapRef}>
      {ncCount > 0 && (
        <WarningChip icon={AlertTriangle} label="Needs Completion" count={ncCount} active={open === 'nc'} onClick={() => toggle('nc')}>
          <AnimatePresence>
            {open === 'nc' && (
              <DropdownPanel title="Needs Completion" subtitle={`${ncCount} booking${ncCount === 1 ? '' : 's'} past check-out — mark as done or extend`} onClose={() => setOpen(null)}>
                {needsCompletion.map((b) => (
                  <WarningRow key={b.id} booking={b} chip="Needs Action" chipTone="amber" onClick={() => { onSelect(b); setOpen(null) }} />
                ))}
              </DropdownPanel>
            )}
          </AnimatePresence>
        </WarningChip>
      )}
      {esCount > 0 && (
        <WarningChip icon={Clock} label="Ending Soon" count={esCount} active={open === 'es'} onClick={() => toggle('es')}>
          <AnimatePresence>
            {open === 'es' && (
              <DropdownPanel title="Ending Soon" subtitle={`${esCount} booking${esCount === 1 ? '' : 's'} ending in the next 2 days with balance due`} onClose={() => setOpen(null)}>
                {endingSoon.map((b) => (
                  <WarningRow key={b.id} booking={b} chip={`${formatMoney(b.balance)} due`} chipTone="red" onClick={() => { onSelect(b); setOpen(null) }} />
                ))}
              </DropdownPanel>
            )}
          </AnimatePresence>
        </WarningChip>
      )}
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
      <motion.div className="absolute top-1 bottom-1 rounded-full shadow-sm z-0 bg-card border border-border"
        animate={{ left: indicator.left, width: indicator.width }} transition={{ type: 'spring', stiffness: 350, damping: 28 }} />
      {STATUS_PILLS.map((tab) => {
        const isActive = statusFilter === tab.id
        const count = counts[tab.id] ?? 0
        return (
          <button key={tab.id} type="button" data-active={isActive} onClick={() => onStatusFilter(tab.id)}
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

function FilterPanel({ open, onClose, building, setBuilding, dateFilter, setDateFilter, bookerCode, setBookerCode, buildings, specialists, activeCount, onClear }) {
  const panelRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onMouseDown); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={panelRef} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h3 className="text-xs font-bold text-foreground">Filters</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={13} /></button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Building</p>
              <Select value={building} onValueChange={setBuilding}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All buildings" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All buildings</SelectItem>
                  {buildings.map((b) => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Status</p>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="Any status" /></SelectTrigger>
                <SelectContent>{DATE_FILTERS.map((d) => <SelectItem key={d.id} value={d.id} className="text-xs">{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Booked by</p>
              <Select value={bookerCode} onValueChange={setBookerCode}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All specialists" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All specialists</SelectItem>
                  {specialists.map((s) => <SelectItem key={s.id} value={s.code} className="text-xs">{s.name} · {s.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
            <Button variant="ghost" size="sm" onClick={onClear} disabled={activeCount === 0} className="text-xs h-7 rounded">Clear all</Button>
            <Button size="sm" onClick={onClose} className="text-xs h-7 rounded"><Check size={11} className="mr-1" />Done</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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

function BookingFormModal({ open, onClose, onSaved, units, editing, specialists, affiliates, affiliateCounts }) {
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

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
  }, [open, editing])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  // ============================================================
  // Auto-compute commissions — always derived from total_amount
  // and the current tier/codes. Never stored on form state; the
  // values are recomputed whenever inputs change.
  // ============================================================
  const totalAmount = Number(form.total_amount) || 0
  const bookerCommission = useMemo(
    () => (form.booker_code && totalAmount > 0 ? computeSpecialistCommission(totalAmount) : 0),
    [form.booker_code, totalAmount],
  )
  const affiliateCommission = useMemo(() => {
    if (!form.affiliate_code || totalAmount <= 0) return 0
    const count = affiliateCounts?.[form.affiliate_code] || 0
    return computeAffiliateCommission(totalAmount, count)
  }, [form.affiliate_code, totalAmount, affiliateCounts])

  const nights = computeNights(form.check_in, form.check_out)
  const initialAmount = Number(form.initial_amount) || 0
  const remaining = Math.max(0, totalAmount - initialAmount)
  const willBePartial = initialAmount > 0 && initialAmount < totalAmount
  const willBePaid = initialAmount >= totalAmount && totalAmount > 0
  const selectedUnit = useMemo(() => units.find((u) => u.id === form.unit_id) || null, [units, form.unit_id])

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

    const stayNights = computeNights(checkIn, checkOut)
    if (stayNights <= 0) { toast.error('Invalid stay length'); return }

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

      const payload = {
        unit_id: form.unit_id,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_contact: guestContact,
        guests,
        check_in: checkIn,
        check_out: checkOut,
        total_amount: totalAmt,
        booker_code: sanitizeText(form.booker_code, { max: 40 }) || null,
        booker_name: booker?.name ? sanitizeText(booker.name, { max: 120 }) : null,
        affiliate_code: sanitizeText(form.affiliate_code, { max: 40 }) || null,
        affiliate_name: affiliate?.name ? sanitizeText(affiliate.name, { max: 120 }) : null,
        // Computed values — never user input
        booker_commission: bookerCommission,
        affiliate_commission: affiliateCommission,
        affiliate_notes: affiliateNotes,
        notes,
        transactions,
      }

      if (editing) {
        const { error } = await supabase.from('bookings').update(payload).eq('id', editing.id)
        if (error) throw error
        logAudit('UPDATE_BOOKING', 'bookings', editing.id, {
          booking_code: editing.booking_code,
          booker_commission: bookerCommission,
          affiliate_commission: affiliateCommission,
        }).catch(() => {})
        toast.success('Booking updated')
      } else {
        payload.booking_code = generateBookingCode()
        const { error } = await supabase.from('bookings').insert(payload)
        if (error) throw error
        logAudit('CREATE_BOOKING', 'bookings', null, { booking_code: payload.booking_code }).catch(() => {})
        toast.success('Booking created')
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
  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'
  const bookerTierHint = form.booker_code ? `Flat ${SPECIALIST_FLAT_RATE}%` : null
  const affiliateTierHint = form.affiliate_code
    ? (() => {
        const t = getTierInfo(affiliateCounts?.[form.affiliate_code] || 0)
        return `${t.tier} · ${t.rate}%`
      })()
    : null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-foreground">{editing ? 'Edit Booking' : 'New Booking'}</h2>
            {editing && <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{editing.booking_code}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Booking</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className={labelClass}>Unit *</label>
                <Select value={form.unit_id} onValueChange={(v) => setField('unit_id', v)}>
                  <SelectTrigger className={cn(inputClass, 'w-full')}>
                    <SelectValue placeholder="Select a unit...">
                      {selectedUnit ? unitLabel(selectedUnit) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => <SelectItem key={u.id} value={u.id} className="text-xs">{unitLabel(u)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={labelClass}>Booked by</label>
                <Select value={form.booker_code || '__none__'} onValueChange={(v) => setField('booker_code', v === '__none__' ? '' : v)}>
                  <SelectTrigger className={cn(inputClass, 'w-full')}>
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
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Guest</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div><label className={labelClass}>Guest Name *</label><Input value={form.guest_name} onChange={(e) => setField('guest_name', e.target.value)} className={inputClass} maxLength={120} autoFocus /></div>
              <div><label className={labelClass}>Guests</label><Input type="number" min={1} max={50} value={form.guests} onChange={(e) => setField('guests', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Email</label><Input type="email" value={form.guest_email} onChange={(e) => setField('guest_email', e.target.value)} className={inputClass} maxLength={254} /></div>
              <div><label className={labelClass}>Contact</label><Input type="tel" value={form.guest_contact} onChange={(e) => setField('guest_contact', e.target.value)} className={inputClass} maxLength={40} /></div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Dates & Amount</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
              <div><label className={labelClass}>Check-in *</label><Input type="date" value={form.check_in} onChange={(e) => setField('check_in', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Check-out *</label><Input type="date" value={form.check_out} onChange={(e) => setField('check_out', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Nights</label><Input value={nights} readOnly className={cn(inputClass, 'bg-muted/50')} /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 mt-3">
              <div><label className={labelClass}>Total Amount (₱) *</label><Input type="number" min={0} value={form.total_amount} onChange={(e) => setField('total_amount', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Notes</label><Input value={form.notes} onChange={(e) => setField('notes', e.target.value)} className={inputClass} maxLength={2000} /></div>
            </div>
          </section>

          {!editing && (
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Initial Payment (optional)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                <div><label className={labelClass}>Amount (₱)</label><Input type="number" min={0} value={form.initial_amount} onChange={(e) => setField('initial_amount', e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Method</label><Input value={form.initial_method} onChange={(e) => setField('initial_method', e.target.value)} placeholder="GCash, Bank..." className={inputClass} maxLength={60} /></div>
                <div><label className={labelClass}>Reference</label><Input value={form.initial_reference} onChange={(e) => setField('initial_reference', e.target.value)} className={inputClass} maxLength={100} /></div>
                <div><label className={labelClass}>Date</label><Input type="date" value={form.initial_date} onChange={(e) => setField('initial_date', e.target.value)} className={inputClass} /></div>
              </div>
              {initialAmount > 0 && totalAmount > 0 && (
                <p className="text-[10px] mt-2">
                  <span className="text-muted-foreground">After this payment: </span>
                  {willBePaid ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">Fully Paid</span> : willBePartial ? <><span className="font-semibold text-amber-600 dark:text-amber-400">Partial</span><span className="text-muted-foreground"> — remaining {formatMoney(remaining)}</span></> : null}
                </p>
              )}
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Affiliate / Commissions</h3>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock size={9} className="opacity-60" />
                Auto-calculated from total
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <label className={labelClass}>Affiliate</label>
                <Select value={form.affiliate_code || '__none__'} onValueChange={(v) => setField('affiliate_code', v === '__none__' ? '' : v)}>
                  <SelectTrigger className={cn(inputClass, 'w-full')}>
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
                  <Input
                    type="number"
                    value={affiliateCommission}
                    readOnly
                    tabIndex={-1}
                    className={cn(inputClass, 'bg-muted/50 cursor-not-allowed pr-20')}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock size={9} className="opacity-60" />
                    Auto
                  </span>
                </div>
                {form.affiliate_code ? (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {getTierInfo(affiliateCounts?.[form.affiliate_code] || 0).tier} · {getTierInfo(affiliateCounts?.[form.affiliate_code] || 0).rate}% of {formatMoney(totalAmount)}
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
                  <Input
                    type="number"
                    value={bookerCommission}
                    readOnly
                    tabIndex={-1}
                    className={cn(inputClass, 'bg-muted/50 cursor-not-allowed pr-20')}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock size={9} className="opacity-60" />
                    Auto
                  </span>
                </div>
                {form.booker_code ? (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Flat {SPECIALIST_FLAT_RATE}% of {formatMoney(totalAmount)}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic mt-1">Select a specialist to enable</p>
                )}
              </div>
              <div><label className={labelClass}>Affiliate Notes</label><Input value={form.affiliate_notes} onChange={(e) => setField('affiliate_notes', e.target.value)} className={inputClass} maxLength={2000} /></div>
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
      tx.push({
        amount: amt,
        method: cleanMethod || '',
        reference: cleanReference || '',
        date: cleanDate,
      })
      const { error } = await supabase.from('bookings').update({ transactions: tx }).eq('id', booking.id)
      if (error) throw error
      logAudit('ADD_BOOKING_PAYMENT', 'bookings', booking.id, { amount: amt, method: cleanMethod || '' }).catch(() => {})
      toast.success('Payment added')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to add payment')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'
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
            <p className="text-xs text-muted-foreground font-mono">{booking.booking_code}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs bg-muted/40 rounded p-3">
            <div><div className="text-muted-foreground">Total</div><div className="font-semibold tabular-nums">{formatMoney(total)}</div></div>
            <div><div className="text-muted-foreground">Paid</div><div className="font-semibold tabular-nums">{formatMoney(paid)}</div></div>
            <div><div className="text-muted-foreground">Balance</div><div className="font-semibold tabular-nums">{formatMoney(balance)}</div></div>
          </div>
          <div><label className={labelClass}>Amount (₱) *</label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus /></div>
          <div><label className={labelClass}>Method</label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="GCash, Bank transfer, Cash..." className={inputClass} maxLength={60} /></div>
          <div><label className={labelClass}>Reference</label><Input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} maxLength={100} /></div>
          <div><label className={labelClass}>Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></div>
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

function ExtendStayModal({ open, onClose, booking, onSaved, affiliateCounts }) {
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

  if (!open || !booking) return null

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  // Preview the recomputed commissions live
  const previewTotal = Number(newTotal) || 0
  const previewBooker = booking.booker_code && previewTotal > 0
    ? computeSpecialistCommission(previewTotal)
    : 0
  const previewAffiliate = booking.affiliate_code && previewTotal > 0
    ? computeAffiliateCommission(previewTotal, affiliateCounts?.[booking.affiliate_code] || 0)
    : 0

  const save = async () => {
    const newCheckOutClean = sanitizeDateOnly(newCheckOut)
    if (!newCheckOutClean) { toast.error('Set a new check-out date'); return }

    const oldCheckOut = parseDateOnly(booking.check_out)
    const parsed = parseDateOnly(newCheckOutClean)
    if (parsed <= oldCheckOut) { toast.error('New check-out must be after the current one'); return }

    const total = sanitizeMoney(newTotal)
    if (total <= 0) { toast.error('Total amount must be greater than 0'); return }

    let payAmt = 0
    let payMethodClean = null
    let payRefClean = null
    let payDateClean = null
    if (addPayment) {
      payAmt = sanitizeMoney(payAmount)
      if (!payAmt || payAmt <= 0) { toast.error('Enter a valid extension payment amount'); return }
      payMethodClean = sanitizeText(payMethod, { max: 60 })
      payRefClean = sanitizeText(payReference, { max: 100 })
      payDateClean = sanitizeDateOnly(payDate) || new Date().toISOString().slice(0, 10)
    }

    setSaving(true)
    try {
      const tx = Array.isArray(booking.transactions) ? [...booking.transactions] : []
      if (addPayment) {
        tx.push({
          amount: payAmt,
          method: payMethodClean || '',
          reference: payRefClean || '',
          date: payDateClean,
        })
      }

      // Commissions recomputed from new total
      const newBookerComm = booking.booker_code
        ? computeSpecialistCommission(total)
        : 0
      const newAffComm = booking.affiliate_code
        ? computeAffiliateCommission(total, affiliateCounts?.[booking.affiliate_code] || 0)
        : 0

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
      toast.success('Booking extended')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to extend')
    } finally {
      setSaving(false)
    }
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
            <p className="text-xs text-muted-foreground font-mono">{booking.booking_code} · {booking.guest_name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded p-3">
            <div><div className="text-muted-foreground">Current check-out</div><div className="font-semibold">{formatDate(booking.check_out)}</div></div>
            <div><div className="text-muted-foreground">Current nights</div><div className="font-semibold tabular-nums">{oldNights}</div></div>
          </div>
          <div><label className={labelClass}>New Check-out *</label><Input type="date" value={newCheckOut} min={booking.check_out} onChange={(e) => setNewCheckOut(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>New Total Amount (₱) *</label><Input type="number" min={0} value={newTotal} onChange={(e) => setNewTotal(e.target.value)} className={inputClass} /></div>
          {newNights > oldNights && <p className="text-[10px] text-muted-foreground">Extended by {newNights - oldNights} night{newNights - oldNights === 1 ? '' : 's'} · new total {newNights} night{newNights === 1 ? '' : 's'}</p>}

          {(booking.booker_code || booking.affiliate_code) && previewTotal > 0 && (
            <div className="rounded-md bg-muted/40 border border-border p-2.5 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Lock size={9} className="opacity-60" />
                Recalculated commissions
              </p>
              {booking.booker_code && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Booker ({SPECIALIST_FLAT_RATE}%)</span>
                  <span className="font-semibold tabular-nums">{formatMoney(previewBooker)}</span>
                </div>
              )}
              {booking.affiliate_code && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Affiliate ({getTierInfo(affiliateCounts?.[booking.affiliate_code] || 0).rate}%)</span>
                  <span className="font-semibold tabular-nums">{formatMoney(previewAffiliate)}</span>
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs pt-2 border-t border-border">
            <input type="checkbox" checked={addPayment} onChange={(e) => setAddPayment(e.target.checked)} className="rounded border-border" />
            <span>Add extension payment now</span>
          </label>
          {addPayment && (
            <div className="space-y-2 pl-5 border-l-2 border-border">
              <div><label className={labelClass}>Amount (₱)</label><Input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Method</label><Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="GCash, Bank..." className={inputClass} maxLength={60} /></div>
              <div><label className={labelClass}>Reference</label><Input value={payReference} onChange={(e) => setPayReference(e.target.value)} className={inputClass} maxLength={100} /></div>
              <div><label className={labelClass}>Date</label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputClass} /></div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={save} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Calendar size={12} className="mr-1.5" />}
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
      toast.success('Booking marked as completed')
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
          <h3 className="text-sm font-bold">Mark as Completed?</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-2 text-xs">
          <p className="text-muted-foreground">This booking will be marked as done. You can no longer add payments or extend it.</p>
          <div className="bg-muted/40 rounded p-3 space-y-1 mt-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Code</span><span className="font-mono font-semibold">{booking.booking_code}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Guest</span><span className="font-semibold">{booking.guest_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Check-out</span><span className="font-semibold">{formatDate(booking.check_out)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold tabular-nums">{formatMoney(booking.total_amount)}</span></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={confirm} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <CheckCircle2 size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Mark as Completed'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function BookingDetailPanel({ booking, affiliateCounts, onBookingChange, onClose, onAddPayment, onExtend, onComplete, onEdit, onDelete }) {
  const status = deriveBookingStatus(booking)
  const isCompleted = status === 'completed'
  const isPaid = booking.payment_status === 'paid'
  const guestLeft = parseDateOnly(booking.check_out) < today()
  const canComplete = !isCompleted && guestLeft && isPaid
  const canExtend = !isCompleted && !guestLeft

  const updateField = async (field, value) => {
    const { error } = await supabase.from('bookings').update({ [field]: value }).eq('id', booking.id)
    if (error) throw error
    logAudit(`UPDATE_BOOKING_FIELD:${field}`, 'bookings', booking.id, { field, from: booking[field], to: value }).catch(() => {})
    onBookingChange({ ...booking, [field]: value })
  }

  // When total_amount changes, recalc commissions too — always derived, never user-set.
  const updateTotalAmount = async (value) => {
    const n = value === '' || value === null ? 0 : Number(value)
    if (Number.isNaN(n)) throw new Error('Invalid number')

    const newBookerComm = booking.booker_code && n > 0
      ? computeSpecialistCommission(n)
      : 0
    const newAffComm = booking.affiliate_code && n > 0
      ? computeAffiliateCommission(n, affiliateCounts?.[booking.affiliate_code] || 0)
      : 0

    const { error } = await supabase
      .from('bookings')
      .update({
        total_amount: n,
        booker_commission: newBookerComm,
        affiliate_commission: newAffComm,
      })
      .eq('id', booking.id)
    if (error) throw error

    logAudit('UPDATE_BOOKING_FIELD:total_amount', 'bookings', booking.id, {
      from: booking.total_amount,
      to: n,
      booker_commission: newBookerComm,
      affiliate_commission: newAffComm,
    }).catch(() => {})

    onBookingChange({
      ...booking,
      total_amount: n,
      booker_commission: newBookerComm,
      affiliate_commission: newAffComm,
    })
  }

  const transactions = Array.isArray(booking.transactions) ? booking.transactions : []
  const nights = computeNights(booking.check_in, booking.check_out)
  const bookerTier = booking.booker_code
    ? `Flat ${SPECIALIST_FLAT_RATE}%`
    : null
  const affiliateTier = booking.affiliate_code
    ? (() => {
        const t = getTierInfo(affiliateCounts?.[booking.affiliate_code] || 0)
        return `${t.tier} · ${t.rate}%`
      })()
    : null

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: PANEL_WIDTH, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ width: { duration: 0.32, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2, ease: 'easeOut' } }}
      className="bg-card border-l border-border h-full overflow-hidden flex-shrink-0"
      style={{ maxWidth: '100%' }}
    >
      <div className="flex flex-col h-full" style={{ width: PANEL_WIDTH }}>
        <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-start gap-3">
            <GuestAvatar name={booking.guest_name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-foreground truncate">{booking.guest_name}</p>
              <p className="text-[11px] text-muted-foreground font-mono truncate">{booking.booking_code}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <BookingStatusBadge status={status} />
                <PaymentStatusBadge status={booking.payment_status} />
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {!isCompleted && (
              <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onAddPayment}>
                <Plus size={11} /> Add Payment
              </Button>
            )}
            {canExtend && (
              <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onExtend}>
                <Calendar size={11} /> Extend Stay
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
                <CheckCircle2 size={11} /> Mark as Completed
              </Button>
            )}
          </div>

          <SectionCard title="Summary" icon={Wallet}>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold tabular-nums">{formatMoney(booking.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(booking.amount_paid)}</span></div>
              <div className="flex justify-between pt-1 border-t border-border"><span className="text-muted-foreground font-semibold">Balance</span><span className={cn('font-bold tabular-nums', Number(booking.balance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{formatMoney(booking.balance)}</span></div>
              <div className="pt-2"><PaymentStatusBadge status={booking.payment_status} /></div>
            </div>
          </SectionCard>

          <div className="rounded-md bg-card border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2 min-w-0">
                <Wallet size={13} className="text-muted-foreground flex-shrink-0" />
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Payment History · {transactions.length}</h4>
              </div>
            </div>
            <div className="p-2">
              {transactions.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">No payments recorded yet</div>
              ) : (
                <div className="space-y-1.5">
                  {transactions.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-background">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[60px]">{formatDateShort(t.date)}</span>
                        <span className="text-xs font-semibold text-foreground tabular-nums">{formatMoney(t.amount)}</span>
                        {t.method && <span className="text-[11px] text-muted-foreground truncate">{t.method}</span>}
                        {t.reference && <span className="text-[10px] text-muted-foreground font-mono truncate">· {t.reference}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <SectionCard title="Unit" icon={Building2}>
            <div className="space-y-1">
              <div className="flex items-baseline gap-2 pb-2 mb-2 border-b border-border">
                <span className="font-mono text-sm font-bold text-foreground">{booking.units?.unit_code || '—'}</span>
                <span className="text-[11px] text-muted-foreground truncate">{booking.units?.building || '—'}</span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Booked by</span>
                <span className="text-xs font-semibold text-foreground">
                  {booking.booker_name || booking.booker_code || '—'}
                  {booking.booker_code && booking.booker_name && (
                    <span className="text-muted-foreground font-mono ml-1">· {booking.booker_code}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Affiliate</span>
                <span className="text-xs font-semibold text-foreground">
                  {booking.affiliate_name || booking.affiliate_code || '—'}
                  {booking.affiliate_code && booking.affiliate_name && (
                    <span className="text-muted-foreground font-mono ml-1">· {booking.affiliate_code}</span>
                  )}
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Guest" icon={User}>
            <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-border">
              <GuestAvatar name={booking.guest_name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{booking.guest_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{booking.guest_email || 'No email'}</p>
              </div>
            </div>
            <EditableField label="Name" value={booking.guest_name} onSave={(v) => updateField('guest_name', v)} auditTag="guest_name" maxLength={120} sanitizer={(v) => sanitizeText(v, { max: 120 })} />
            <EditableField label="Email" value={booking.guest_email} type="email" onSave={(v) => updateField('guest_email', v)} auditTag="guest_email" maxLength={254} sanitizer={sanitizeEmail} />
            <EditableField label="Contact" value={booking.guest_contact} type="tel" onSave={(v) => updateField('guest_contact', v)} auditTag="guest_contact" maxLength={40} sanitizer={sanitizePhone} />
            <EditableField label="Guests" value={booking.guests} type="number" onSave={(v) => updateField('guests', sanitizeInt(v, { min: 1, max: 50, fallback: 1 }))} auditTag="guests" maxLength={4} />
          </SectionCard>

          <SectionCard title="Dates & Amount" icon={Calendar}>
            <EditableField label="Check-in" value={booking.check_in} type="date" onSave={(v) => updateField('check_in', v)} auditTag="check_in" />
            <EditableField label="Check-out" value={booking.check_out} type="date" onSave={(v) => updateField('check_out', v)} auditTag="check_out" />
            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Nights</span>
              <span className="text-xs tabular-nums font-semibold">{nights}</span>
            </div>
            <EditableField label="Total" value={booking.total_amount} type="number" onSave={updateTotalAmount} auditTag="total_amount" maxLength={14} sanitizer={(v) => sanitizeMoney(v)} />
            <EditableField label="Notes" value={booking.notes} onSave={(v) => updateField('notes', v)} auditTag="notes" maxLength={2000} sanitizer={(v) => sanitizeText(v, { max: 2000, allowNewlines: true })} />
          </SectionCard>

          <SectionCard title="Commissions" icon={Wallet}>
            <ComputedCommissionRow
              label="Booker"
              value={formatMoney(booking.booker_commission)}
              hint={bookerTier ? `${bookerTier} · ${booking.booker_name || booking.booker_code || '—'}` : '—'}
            />
            <ComputedCommissionRow
              label="Affiliate"
              value={formatMoney(booking.affiliate_commission)}
              hint={affiliateTier ? `${affiliateTier} · ${booking.affiliate_name || booking.affiliate_code || '—'}` : '—'}
            />
            <p className="pt-2 mt-1 border-t border-border text-[10px] text-muted-foreground italic flex items-center gap-1">
              <Lock size={9} className="opacity-60" />
              Auto-calculated from the total amount. Update the Total above to recalculate.
            </p>
          </SectionCard>

          <SectionCard title="Affiliate Notes" icon={Wallet}>
            <EditableField label="Notes" value={booking.affiliate_notes} onSave={(v) => updateField('affiliate_notes', v)} auditTag="affiliate_notes" maxLength={2000} sanitizer={(v) => sanitizeText(v, { max: 2000, allowNewlines: true })} />
          </SectionCard>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onEdit}>
              <Edit2 size={11} /> Edit
            </Button>
            <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20" onClick={onDelete}>
              <Trash2 size={11} /> Delete
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function BookingListRow({ booking, selected, onClick }) {
  const status = deriveBookingStatus(booking)
  const nights = computeNights(booking.check_in, booking.check_out)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.10)' : 'rgba(45, 86, 142, 0)' }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
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
        </div>
      </div>
      <span className="font-mono text-xs text-foreground truncate">{booking.booking_code}</span>
      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">{booking.units?.unit_code || '—'}</span>
        <span className="text-[10px] text-muted-foreground truncate block">{booking.units?.building || '—'}</span>
      </div>
      <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
        <div className="truncate">{formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}</div>
        <div className="text-[10px] text-muted-foreground/70">{nights} night{nights === 1 ? '' : 's'}</div>
      </div>
      <div className="flex items-center min-w-0">
        <PaymentStatusBadge status={booking.payment_status} />
      </div>
      <div className="flex items-center gap-2 justify-end flex-shrink-0">
        <BookingStatusBadge status={status} />
        <ChevronRight size={14} className={cn('text-muted-foreground/40 transition-transform duration-300 ease-out', selected && 'rotate-180 text-primary')} />
      </div>
    </motion.button>
  )
}

function downloadCSV(bookings, filename) {
  const headers = [
    'Booking Code', 'Building', 'Unit', 'Guest', 'Email', 'Contact', 'Guests',
    'Check-in', 'Check-out', 'Nights', 'Total', 'Paid', 'Balance',
    'Payment Status', 'Booking Status',
    'Booker Code', 'Booker Name', 'Booker Commission', 'Booker Rate %',
    'Affiliate Code', 'Affiliate Name', 'Affiliate Commission', 'Affiliate Rate %',
    'Notes',
  ]
  const rows = bookings.map((b) => {
    const s = deriveBookingStatus(b)
    const bookerRate = Number(b.booker_commission) > 0 && Number(b.total_amount) > 0
      ? Math.round((Number(b.booker_commission) / Number(b.total_amount)) * 100)
      : 0
    const affiliateRate = Number(b.affiliate_commission) > 0 && Number(b.total_amount) > 0
      ? Math.round((Number(b.affiliate_commission) / Number(b.total_amount)) * 100)
      : 0
    return [
      b.booking_code || '', b.units?.building || '', b.units?.unit_code || '',
      b.guest_name || '', b.guest_email || '', b.guest_contact || '', b.guests || '',
      b.check_in || '', b.check_out || '', computeNights(b.check_in, b.check_out),
      b.total_amount || 0, b.amount_paid || 0, b.balance || 0,
      b.payment_status || '', s,
      b.booker_code || '', b.booker_name || '', b.booker_commission || 0, bookerRate,
      b.affiliate_code || '', b.affiliate_name || '', b.affiliate_commission || 0, affiliateRate,
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

export default function BookingsPage() {
  const [bookings, setBookings] = useState([])
  const [units, setUnits] = useState([])
  const [specialists, setSpecialists] = useState([])
  const [affiliates, setAffiliates] = useState([])
  const [affiliateCounts, setAffiliateCounts] = useState({})

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [building, setBuilding] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [bookerCode, setBookerCode] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const [cardsHidden, setCardsHidden] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [payForBooking, setPayForBooking] = useState(null)
  const [extendForBooking, setExtendForBooking] = useState(null)
  const [completeForBooking, setCompleteForBooking] = useState(null)

  const listScrollRef = useRef(null)
  const headerRef = useRef(null)
  const filterWrapRef = useRef(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const [bRes, uRes, sRes, aRes] = await Promise.all([
        supabase.from('bookings').select('*, units:unit_id ( id, unit_code, building )').is('deleted_at', null).order('check_in', { ascending: false }),
        supabase.from('units').select('id, unit_code, building, status').order('unit_code'),
        supabase.from('specialists').select('id, code, name').order('name'),
        supabase.from('affiliates').select('id, code, name').order('name'),
      ])
      if (bRes.error) throw bRes.error
      if (uRes.error) throw uRes.error
      if (sRes.error) throw sRes.error
      if (aRes.error) throw aRes.error
      setBookings(bRes.data || [])
      setUnits(uRes.data || [])
      setSpecialists(sRes.data || [])
      setAffiliates(aRes.data || [])

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

  const activeUnits = useMemo(() => units.filter((u) => u.status === 'ACTIVE'), [units])

  const buildings = useMemo(() => {
    const set = new Set()
    for (const b of bookings) { if (b.units?.building) set.add(b.units.building) }
    return [...set].sort()
  }, [bookings])

  const counts = useMemo(() => {
    const c = { all: bookings.length, upcoming: 0, active: 0, 'needs-action': 0, completed: 0 }
    for (const b of bookings) {
      const s = deriveBookingStatus(b)
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [bookings])

  const needsCompletion = useMemo(() => bookings.filter((b) => deriveBookingStatus(b) === 'needs-action'), [bookings])

  const endingSoon = useMemo(() => {
    const t = today()
    const twoDays = new Date(t); twoDays.setDate(twoDays.getDate() + 2)
    return bookings.filter((b) => {
      if (b.completed_at) return false
      if (b.payment_status === 'paid') return false
      const co = parseDateOnly(b.check_out)
      return co >= t && co <= twoDays
    })
  }, [bookings])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (building !== 'all') n++
    if (dateFilter !== 'all') n++
    if (bookerCode !== 'all') n++
    return n
  }, [building, dateFilter, bookerCode])

  const clearFilters = () => { setBuilding('all'); setDateFilter('all'); setBookerCode('all') }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return bookings.filter((b) => {
      const derived = deriveBookingStatus(b)
      if (statusFilter !== 'all' && derived !== statusFilter) return false
      if (building !== 'all' && b.units?.building !== building) return false
      if (bookerCode !== 'all' && b.booker_code !== bookerCode) return false
      if (dateFilter !== 'all') {
        if (dateFilter === 'upcoming' && derived !== 'upcoming') return false
        if (dateFilter === 'active' && derived !== 'active') return false
        if (dateFilter === 'needs-action' && derived !== 'needs-action') return false
        if (dateFilter === 'completed' && derived !== 'completed') return false
      }
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
  }, [bookings, statusFilter, building, dateFilter, bookerCode, debouncedSearch])

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

  const handleBookingChange = (updated) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)))
  }

  const handleSelect = (booking) => setSelectedId((prev) => (prev === booking.id ? null : booking.id))
  const openEdit = (booking) => { setEditing(booking); setFormOpen(true) }
  const openNew = () => { setEditing(null); setFormOpen(true) }

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

  const handleListMouseMove = useCallback((e) => {
    const headerEl = headerRef.current
    if (!headerEl) return
    const headerRect = headerEl.getBoundingClientRect()
    setCardsHidden(e.clientY > headerRect.bottom)
  }, [])
  const handleListMouseLeave = useCallback(() => setCardsHidden(false), [])

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card border border-border rounded-md">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">
          <div className={cn('flex-shrink-0 transition-all duration-300 ease-out overflow-hidden', cardsHidden ? 'max-h-0 opacity-0 -mb-3' : 'max-h-40 opacity-100')}>
            <SummaryCards bookings={bookings} />
          </div>

          <div ref={headerRef} className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search guest, booking code, unit, email, booker, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded" />
            </div>
            <Button size="sm" className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]" style={{ backgroundColor: BRAND }} onClick={openNew}>
              <Plus size={13} />
              <span className="hidden sm:inline ml-1">New Booking</span>
            </Button>
            <div className="relative" ref={filterWrapRef}>
              <Button variant={activeFilterCount > 0 ? 'default' : 'outline'} size="sm" className="h-8 rounded text-xs transition-all duration-150" onClick={() => setFilterOpen((v) => !v)}>
                <SlidersHorizontal size={13} />
                <span className="hidden sm:inline ml-1">Filter</span>
                {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">{activeFilterCount}</span>}
              </Button>
              <FilterPanel
                open={filterOpen} onClose={() => setFilterOpen(false)}
                building={building} setBuilding={setBuilding}
                dateFilter={dateFilter} setDateFilter={setDateFilter}
                bookerCode={bookerCode} setBookerCode={setBookerCode}
                buildings={buildings} specialists={specialists}
                activeCount={activeFilterCount} onClear={clearFilters}
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded transition-all duration-150">
              <Download size={13} />
            </Button>
          </div>

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
            <WarningsStrip needsCompletion={needsCompletion} endingSoon={endingSoon} onSelect={(b) => setSelectedId(b.id)} />
          </div>

          <div className="flex-1 min-h-0 rounded border border-border overflow-hidden">
            <div ref={listScrollRef} className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}
              onMouseMove={handleListMouseMove} onMouseLeave={handleListMouseLeave}>
              <div className={cn('sticky top-0 z-10 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Guest</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Code</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Unit</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Check-in → Check-out</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Payment</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right truncate">Status</span>
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : sorted.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <Calendar size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-semibold">No bookings match your filters</p>
                    <p className="text-xs text-muted-foreground mt-1">Try clearing filters or creating a new booking</p>
                  </div>
                </div>
              ) : (
                sorted.map((booking) => (
                  <BookingListRow key={booking.id} booking={booking} selected={selectedId === booking.id} onClick={() => handleSelect(booking)} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <BookingDetailPanel
            key={selected.id}
            booking={selected}
            affiliateCounts={affiliateCounts}
            onBookingChange={handleBookingChange}
            onClose={() => setSelectedId(null)}
            onAddPayment={() => setPayForBooking(selected)}
            onExtend={() => setExtendForBooking(selected)}
            onComplete={() => setCompleteForBooking(selected)}
            onEdit={() => openEdit(selected)}
            onDelete={() => handleDelete(selected)}
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
      />

      <AddPaymentModal open={!!payForBooking} onClose={() => setPayForBooking(null)} booking={payForBooking} onSaved={fetchData} />
      <ExtendStayModal open={!!extendForBooking} onClose={() => setExtendForBooking(null)} booking={extendForBooking} onSaved={fetchData} affiliateCounts={affiliateCounts} />
      <CompleteConfirmModal open={!!completeForBooking} onClose={() => setCompleteForBooking(null)} booking={completeForBooking} onConfirmed={fetchData} />
    </div>
  )
}