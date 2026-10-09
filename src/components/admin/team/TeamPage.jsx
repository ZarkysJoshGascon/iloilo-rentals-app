// src/components/admin/team/TeamPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2, Camera,
  UserPlus, Users, Award, TrendingUp, Mail, Phone, Edit2, User,
  Calendar, Download, ChevronLeft, ChevronRight, Building2,
  AlertTriangle, Pencil, Wallet, FileText, Eye, Upload, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import { cn } from '@/lib/utils'
import {
  getTierInfo, SPECIALIST_FLAT_RATE,
  fetchTeamCompletedCounts,
} from '@/lib/commissions'

const BRAND = '#2d568e'
const PAGE_SIZE = 9
const PM_SHARE_OF_COMPANY_PCT = 35
const PM_PDF_BUCKET = 'contract-pdfs'
const PM_PDF_MAX_BYTES = 15 * 1024 * 1024
const PM_PDF_ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

const TABS = [
  { id: 'specialists',       label: 'Booking Specialists', icon: UserPlus },
  { id: 'affiliates',        label: 'Affiliates',          icon: Award },
  { id: 'housekeepers',      label: 'Housekeepers',        icon: Users },
  { id: 'property_managers', label: 'Property Managers',   icon: Building2 },
]

// ============================================================
// SHARED HELPERS
// ============================================================
function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
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

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length === 10 ? d + 'T00:00:00Z' : d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatDateShort(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length === 10 ? d + 'T00:00:00Z' : d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit' })
}
function formatMoney(n) {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn + 'T00:00:00Z')
  const b = new Date(checkOut + 'T00:00:00Z')
  return Math.max(0, Math.round((b - a) / 86400000))
}

function snapEffectiveToMonthStart(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
}
function snapExpiryToMonthEnd(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}

function deriveBookingStatus(b) {
  if (b.completed_at) return 'completed'
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const ci = b.check_in ? new Date(b.check_in) : null
  const co = b.check_out ? new Date(b.check_out) : null
  if (ci) ci.setHours(0, 0, 0, 0)
  if (co) co.setHours(0, 0, 0, 0)
  if (!ci || !co) return 'upcoming'
  if (ci > t) return 'upcoming'
  if (ci <= t && co >= t) return 'active'
  return 'needs-action'
}

const BOOKING_STATUS_TEXT = {
  upcoming: { label: 'Upcoming', className: 'text-blue-600 dark:text-blue-400' },
  active: { label: 'Active', className: 'text-emerald-600 dark:text-emerald-400' },
  'needs-action': { label: 'Needs Action', className: 'text-amber-600 dark:text-amber-400' },
  completed: { label: 'Done', className: 'text-gray-500 dark:text-gray-400' },
}

const CLEANING_STATUS_TEXT = {
  scheduled: { label: 'Scheduled', className: 'text-amber-600 dark:text-amber-400' },
  ready: { label: 'Ready', className: 'text-blue-600 dark:text-blue-400' },
  submitted: { label: 'Submitted', className: 'text-violet-600 dark:text-violet-400' },
  completed: { label: 'Completed', className: 'text-emerald-600 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', className: 'text-red-600 dark:text-red-400' },
}

// ============================================================
// PDF helpers
// ============================================================
function pmPdfBytesLabel(b) {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function pmPdfRandomId() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

// ============================================================
// AVATARS
// ============================================================
function GuestAvatar({ name, size = 'sm' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'md' ? 'w-9 h-9 text-xs' : 'w-8 h-8 text-[11px]'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

function WorkerAvatar({ name, photo_url, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'xl' ? 'w-20 h-20 text-2xl' : size === 'lg' ? 'w-16 h-16 text-lg' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  if (photo_url) return <img src={photo_url} alt={name} className={cn('rounded-full object-cover flex-shrink-0', sizeClasses)} />
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

// ============================================================
// BADGES
// ============================================================
function CommissionBadge({ role, completedCount, size = 'sm' }) {
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]'
  if (role === 'specialists') {
    return (
      <span className={cn('inline-flex items-center rounded-md font-bold uppercase tracking-wide', sizeClass, 'bg-[#2d568e] text-white')}>
        Flat {SPECIALIST_FLAT_RATE}%
      </span>
    )
  }
  if (role === 'affiliates') {
    const info = getTierInfo(completedCount)
    return (
      <span className={cn('inline-flex items-center rounded-md font-bold uppercase tracking-wide', sizeClass, info.badge)}>
        {info.tier} · {info.rate}%
      </span>
    )
  }
  return null
}

function RoleBadge({ role, size = 'sm' }) {
  const labels = {
    specialists: 'Booking Specialist',
    affiliates: 'Affiliate',
    housekeepers: 'Housekeeper',
    property_managers: 'Property Manager',
  }
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]'
  return (
    <span className={cn('inline-flex items-center rounded-md font-bold uppercase tracking-wide', sizeClass, 'bg-muted text-muted-foreground')}>
      {labels[role] || '—'}
    </span>
  )
}

// ============================================================
// SUMMARY CARDS
// ============================================================
function SummaryCards({ data, teamTotals, activeTab }) {
  const stats = useMemo(() => ({
    totalSpecialists: (data.specialists || []).length,
    totalAffiliates: (data.affiliates || []).length,
    totalHousekeepers: (data.housekeepers || []).length,
  }), [data])

  const fourthCard = useMemo(() => {
    switch (activeTab) {
      case 'specialists':
        return {
          label: 'Specialist Commissions',
          value: formatMoney(teamTotals?.specialistCommission || 0),
          isMoney: true,
        }
      case 'affiliates':
        return {
          label: 'Affiliate Commissions',
          value: formatMoney(teamTotals?.affiliateCommission || 0),
          isMoney: true,
        }
      case 'housekeepers':
        return {
          label: 'Housekeeper Payouts',
          value: formatMoney(teamTotals?.housekeeperPayout || 0),
          isMoney: true,
        }
      case 'property_managers':
        return {
          label: 'PM Earnings',
          value: formatMoney(teamTotals?.pmEarnings || 0),
          isMoney: true,
        }
      default:
        return {
          label: 'Commissions Paid',
          value: formatMoney(
            (teamTotals?.specialistCommission || 0) + (teamTotals?.affiliateCommission || 0)
          ),
          isMoney: true,
        }
    }
  }, [activeTab, teamTotals])

  const cards = [
    { label: 'Booking Specialists', value: stats.totalSpecialists, icon: UserPlus },
    { label: 'Affiliates',          value: stats.totalAffiliates,  icon: Award },
    { label: 'Housekeepers',        value: stats.totalHousekeepers, icon: Users },
    { label: fourthCard.label,      value: fourthCard.value,       icon: TrendingUp, isMoney: true },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={`${card.label}-${i}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.22 }}
          className="rounded-lg bg-card border border-border shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={14} className="text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {card.label}
            </span>
          </div>
          <p className={cn('font-bold text-foreground tabular-nums leading-none', card.isMoney ? 'text-xl' : 'text-2xl')}>
            {card.value}
          </p>
        </motion.div>
      ))}
    </div>
  )
}

// ============================================================
// TEAM TABS
// ============================================================
function TeamTabs({ tabs, activeTab, onChange, counts }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    if (!containerRef.current) return
    const active = containerRef.current.querySelector('[data-active="true"]')
    if (!active) return
    const cRect = containerRef.current.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
  }, [activeTab, counts])

  return (
    <div className="flex justify-center">
      <div ref={containerRef} className="relative inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
        <motion.div
          className="absolute top-1 bottom-1 rounded-full bg-card border border-border shadow-sm z-0"
          animate={{ left: indicator.left, width: indicator.width }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        />
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const count = counts[tab.id] ?? 0
          return (
            <button
              key={tab.id}
              type="button"
              data-active={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative z-10 flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors duration-200 whitespace-nowrap',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon size={13} />
              {tab.label}
              <span className={cn('tabular-nums', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// SKELETON
// ============================================================
function WorkerCardSkeleton() {
  return (
    <div className="rounded-xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="p-5 space-y-3">
        <Skeleton className="w-16 h-16 rounded-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      </div>
      <div className="bg-muted/40 border-t border-border p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Skeleton className="h-2.5 w-16" /><Skeleton className="h-3.5 w-10" /></div>
          <div className="space-y-1"><Skeleton className="h-2.5 w-12" /><Skeleton className="h-3.5 w-20" /></div>
        </div>
        <div className="space-y-2 pt-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  )
}

function WorkerCardSkeletonGrid({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(count)].map((_, i) => <WorkerCardSkeleton key={i} />)}
    </div>
  )
}

// ============================================================
// WORKER CARD
// ============================================================
function WorkerCard({ worker, role, liveCount, onClick }) {
  const isHousekeeper = role === 'housekeepers'
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'group/card relative w-full text-left rounded-xl bg-card border border-border overflow-hidden',
        'shadow-sm hover:shadow-lg hover:border-[#2d568e]/40 transition-all duration-200 flex flex-col',
      )}
    >
      <div className="p-5">
        <WorkerAvatar name={worker.name} photo_url={worker.photo_url} size="lg" />
        <div className="mt-4">
          <p className="text-base font-bold text-foreground truncate leading-tight">{worker.name}</p>
          <p className="text-[11px] font-mono text-muted-foreground mt-0.5 uppercase tracking-wide">{worker.code}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RoleBadge role={role} />
            {!isHousekeeper && <CommissionBadge role={role} completedCount={liveCount} />}
          </div>
        </div>
      </div>
      <div className="mt-auto bg-muted/40 dark:bg-muted/20 border-t border-border p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {!isHousekeeper && (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Completed</p>
                <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">{liveCount}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Hired</p>
                <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5 truncate">
                  {worker.created_at ? formatDate(worker.created_at) : '—'}
                </p>
              </div>
            </>
          )}
          {isHousekeeper && (
            <>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Hired</p>
                <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5 truncate">
                  {worker.created_at ? formatDate(worker.created_at) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Completed</p>
                <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">—</p>
              </div>
            </>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] min-w-0">
            <Mail size={12} className="text-muted-foreground flex-shrink-0" />
            {worker.email ? <span className="text-foreground truncate">{worker.email}</span> : <span className="text-muted-foreground italic">No email</span>}
          </div>
          <div className="flex items-center gap-2 text-[11px] min-w-0">
            <Phone size={12} className="text-muted-foreground flex-shrink-0" />
            {worker.phone ? <span className="text-foreground truncate">{worker.phone}</span> : <span className="text-muted-foreground italic">No phone</span>}
          </div>
        </div>
      </div>
    </motion.button>
  )
}

// ============================================================
// DATE RANGE PICKER
// ============================================================
const DATE_PRESETS = [
  { id: 'all', label: 'All' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
]

function resolveRange(preset, customFrom, customTo) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'this-month': {
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 0)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'last-month': {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'this-year': {
      const start = new Date(y, 0, 1)
      const end = new Date(y, 11, 31)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'custom':
      return { from: customFrom || null, to: customTo || null }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

function DateFilterBar({ preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex items-center gap-1 bg-muted/60 rounded-md p-0.5">
        {DATE_PRESETS.map((p) => {
          const isActive = preset === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={cn(
                'px-2.5 py-1 rounded-[5px] text-[11px] font-semibold transition-colors whitespace-nowrap',
                isActive ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 text-xs rounded w-[130px]" />
          <span className="text-[11px] text-muted-foreground">→</span>
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 rounded w-[130px] text-xs" />
        </div>
      )}
    </div>
  )
}

// ============================================================
// WORKER ACTIVITY SECTION (specialists/affiliates/housekeepers)
// ============================================================
function WorkerActivitySection({ worker, role }) {
  const [preset, setPreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  )

  const isHousekeeper = role === 'housekeepers'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (isHousekeeper) {
          let q = supabase
            .from('cleanings')
            .select('id, cleaning_code, unit_id, type, scheduled_date, status, payment_amount, units:unit_id ( unit_code, building )')
            .eq('housekeeper_id', worker.id)
            .order('scheduled_date', { ascending: false })
            .limit(500)
          if (range.from) q = q.gte('scheduled_date', range.from)
          if (range.to) q = q.lte('scheduled_date', range.to)
          const { data, error: err } = await q
          if (err) throw err
          if (!cancelled) setItems(data || [])
        } else {
          let q = supabase
            .from('bookings')
            .select('id, booking_code, guest_name, check_in, check_out, completed_at, unit_id, booker_commission, affiliate_commission, units:unit_id ( unit_code, building )')
            .is('deleted_at', null)
            .not('completed_at', 'is', null)
            .order('check_in', { ascending: false })
            .limit(500)
          if (role === 'specialists') q = q.eq('booker_code', worker.code)
          else if (role === 'affiliates') q = q.eq('affiliate_code', worker.code)
          if (range.from) q = q.gte('check_in', range.from)
          if (range.to) q = q.lte('check_in', range.to)
          const { data, error: err } = await q
          if (err) throw err
          if (!cancelled) setItems(data || [])
        }
      } catch (err) {
        console.error('WorkerActivitySection load failed:', err)
        if (!cancelled) { setItems([]); setError(err?.message || 'Failed to load') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [worker.id, worker.code, role, isHousekeeper, range.from, range.to])

  const earnings = useMemo(() => {
    if (isHousekeeper) {
      return items
        .filter((c) => c.status === 'completed')
        .reduce((sum, c) => sum + Number(c.payment_amount || 0), 0)
    }
    if (role === 'specialists') {
      return items.reduce((sum, b) => sum + Number(b.booker_commission || 0), 0)
    }
    if (role === 'affiliates') {
      return items.reduce((sum, b) => sum + Number(b.affiliate_commission || 0), 0)
    }
    return 0
  }, [items, role, isHousekeeper])

  const title = isHousekeeper ? 'Cleanings' : 'Bookings'

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-muted/40 border border-border p-4">
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={13} className="text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Earnings {preset !== 'all' ? '· in range' : '· lifetime'}
          </span>
        </div>
        {loading ? (
          <div className="h-7 w-32 rounded bg-muted animate-pulse" />
        ) : (
          <p className="text-2xl font-bold tabular-nums text-foreground">{formatMoney(earnings)}</p>
        )}
        {!loading && (
          <p className="text-[10px] text-muted-foreground mt-1">
            From {isHousekeeper
              ? items.filter((c) => c.status === 'completed').length
              : items.length} completed {isHousekeeper ? 'cleaning' : 'booking'}{items.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pr-12">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">
          {title} {!loading && <span className="text-muted-foreground">· {items.length}</span>}
        </h3>
        <DateFilterBar
          preset={preset} setPreset={setPreset}
          customFrom={customFrom} setCustomFrom={setCustomFrom}
          customTo={customTo} setCustomTo={setCustomTo}
        />
      </div>

      <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-3 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-3 w-16 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-8 px-4 text-center"><p className="text-xs text-red-500">{error}</p></div>
        ) : items.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <p className="text-xs text-muted-foreground italic">
              {isHousekeeper ? 'No completed cleanings in this range' : 'No completed bookings in this range'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              if (isHousekeeper) {
                const status = item.status || 'scheduled'
                const config = CLEANING_STATUS_TEXT[status] || CLEANING_STATUS_TEXT.scheduled
                return (
                  <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-foreground">{item.cleaning_code}</span>
                        <span className="text-[11px] text-foreground capitalize">{item.type}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums truncate">
                        {formatDateShort(item.scheduled_date)}
                        {item.units?.unit_code && ` · ${item.units.unit_code}`}
                        {item.units?.building && ` · ${item.units.building}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
                      {status === 'completed' && (
                        <span className="text-[10px] font-semibold tabular-nums text-foreground">
                          {formatMoney(item.payment_amount || 0)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              }
              const status = deriveBookingStatus(item)
              const config = BOOKING_STATUS_TEXT[status] || BOOKING_STATUS_TEXT.upcoming
              const nights = computeNights(item.check_in, item.check_out)
              const earned = role === 'specialists'
                ? Number(item.booker_commission || 0)
                : Number(item.affiliate_commission || 0)
              return (
                <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <GuestAvatar name={item.guest_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold text-foreground truncate">{item.guest_name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground truncate">{item.booking_code}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums truncate">
                      {formatDateShort(item.check_in)} → {formatDateShort(item.check_out)} · {nights} night{nights === 1 ? '' : 's'}
                      {item.units?.unit_code && ` · ${item.units.unit_code}`}
                      {item.units?.building && ` · ${item.units.building}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
                    {earned > 0 && (
                      <span className="text-[10px] font-semibold tabular-nums text-foreground">
                        {formatMoney(earned)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// WORKER DETAIL MODAL
// ============================================================
function WorkerDetailModal({ worker, role, counts, onClose, onChanged, onEdit, onDelete }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const liveCount = useMemo(() => {
    if (!worker?.code) return 0
    if (role === 'affiliates') return counts?.affiliates?.[worker.code] || 0
    if (role === 'specialists') return counts?.specialists?.[worker.code] || 0
    return 0
  }, [worker?.code, role, counts])

  if (!worker) return null

  const isHousekeeper = role === 'housekeepers'

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full max-w-5xl h-[85vh] bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 rounded-full bg-card border border-border hover:bg-muted transition-colors shadow-sm"
        >
          <X size={16} />
        </button>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-shrink-0 md:w-[300px] border-b md:border-b-0 md:border-r border-border bg-muted/20 flex flex-col overflow-y-auto">
            <div className="p-6 flex flex-col items-center text-center">
              <WorkerAvatar name={worker.name} photo_url={worker.photo_url} size="xl" />
              <p className="mt-4 text-lg font-bold text-foreground truncate w-full leading-tight">{worker.name}</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-1 uppercase tracking-wide">{worker.code}</p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <RoleBadge role={role} size="lg" />
                {!isHousekeeper && <CommissionBadge role={role} completedCount={liveCount} size="lg" />}
              </div>
              <div className="w-full mt-6 pt-5 border-t border-border space-y-3 text-left">
                <div className="flex items-start gap-2 min-w-0">
                  <Mail size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Email</p>
                    {worker.email ? <p className="text-xs text-foreground truncate mt-0.5">{worker.email}</p> : <p className="text-xs text-muted-foreground italic mt-0.5">No email</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2 min-w-0">
                  <Phone size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Phone</p>
                    {worker.phone ? <p className="text-xs text-foreground truncate mt-0.5">{worker.phone}</p> : <p className="text-xs text-muted-foreground italic mt-0.5">No phone</p>}
                  </div>
                </div>
                {!isHousekeeper && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Completed</p>
                    <p className="text-xs font-bold text-foreground tabular-nums mt-0.5">{liveCount}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Hired</p>
                  <p className="text-xs font-semibold text-foreground tabular-nums mt-0.5">
                    {worker.created_at ? formatDate(worker.created_at) : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-auto p-4 border-t border-border bg-muted/30">
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs gap-2 w-full justify-start" onClick={onEdit}>
                  <Edit2 size={12} /> Edit
                </Button>
                <Button variant="outline" size="sm"
                  className="h-9 rounded-lg text-xs gap-2 w-full justify-start text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                  onClick={onDelete}>
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            <WorkerActivitySection worker={worker} role={role} />
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// WORKER FORM MODAL
// ============================================================
function WorkerFormModal({ open, onClose, onSaved, role, editing }) {
  const [form, setForm] = useState({ code: '', name: '', email: '', phone: '', notes: '' })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const isSpecialist = role === 'specialists'
  const isAffiliate = role === 'affiliates'

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        code: editing.code || '', name: editing.name || '',
        email: editing.email || '', phone: editing.phone || '',
        notes: editing.notes || '',
      })
      setPhotoPreview(editing.photo_url || null)
    } else {
      setForm({ code: '', name: '', email: '', phone: '', notes: '' })
      setPhotoPreview(null)
    }
    setPhotoFile(null)
  }, [open, editing])

  if (!open) return null

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handlePhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPhotoFile(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async () => {
    if (saving) return
    if (!form.code.trim()) { toast.error('Code is required'); return }
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      let photoUrl = editing?.photo_url || null
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg'
        const path = `${role}/${form.code.toUpperCase()}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('team-photos').upload(path, photoFile, { cacheControl: '3600', upsert: true })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('team-photos').getPublicUrl(path)
        photoUrl = data.publicUrl
      }
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        photo_url: photoUrl,
      }
      if (editing) {
        const { error } = await supabase.from(role).update(payload).eq('id', editing.id)
        if (error) throw error
        logAudit(`UPDATE_${role.toUpperCase()}`, role, editing.id, { code: payload.code }).catch(() => {})
        toast.success('Updated')
      } else {
        const { error } = await supabase.from(role).insert(payload)
        if (error) throw error
        logAudit(`CREATE_${role.toUpperCase()}`, role, null, { code: payload.code }).catch(() => {})
        toast.success('Created')
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

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-9 text-xs rounded-lg'
  const title = editing
    ? `Edit ${isSpecialist ? 'Booking Specialist' : isAffiliate ? 'Affiliate' : 'Housekeeper'}`
    : `New ${isSpecialist ? 'Booking Specialist' : isAffiliate ? 'Affiliate' : 'Housekeeper'}`

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoPreview ? <img src={photoPreview} alt="" className="w-16 h-16 rounded-full object-cover" /> :
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center"><User size={24} className="text-muted-foreground" /></div>}
              <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#2d568e] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-[#1e3a5f]">
                <Camera size={12} />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Upload a profile photo</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className={labelClass}>Code *</label><Input value={form.code} onChange={(e) => setField('code', e.target.value)} className={cn(inputClass, 'font-mono uppercase')} /></div>
            <div><label className={labelClass}>Name *</label><Input value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputClass} autoFocus /></div>
            <div><label className={labelClass}>Email</label><Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Phone</label><Input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Notes</label><Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className="text-xs rounded-lg resize-none" /></div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-9 rounded-lg text-xs" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// PM DATA CLIENT
// ============================================================
async function fetchPMs() {
  const { data, error } = await supabase.from('property_managers').select('*').order('name')
  if (error) throw error
  return data || []
}
async function fetchContractsForPM(pmId) {
  const { data, error } = await supabase
    .from('pm_contracts')
    .select(`
      *,
      property_managers:pm_id ( id, name, code ),
      units:unit_id ( id, unit_code, building ),
      contracts:contract_id ( id, contract_code )
    `)
    .eq('pm_id', pmId)
    .order('effective_date', { ascending: false })
  if (error) throw error
  return data || []
}
async function fetchUnitsForSelect() {
  const { data, error } = await supabase.from('units').select('id, unit_code, building').order('unit_code')
  if (error) throw error
  return data || []
}
async function createPMRow(payload) {
  const { data, error } = await supabase.from('property_managers').insert(payload).select().single()
  if (error) throw error
  return data
}
async function updatePMRow(id, patch) {
  const { data, error } = await supabase.from('property_managers').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
async function deletePMRow(id) {
  const { error } = await supabase.from('property_managers').delete().eq('id', id)
  if (error) throw error
}
async function createPMContractRow(payload) {
  const { data, error } = await supabase
    .from('pm_contracts')
    .insert({ ...payload, pm_share_of_company_pct: payload.pm_share_of_company_pct ?? PM_SHARE_OF_COMPANY_PCT })
    .select().single()
  if (error) throw error
  return data
}
async function updatePMContractRow(id, patch) {
  const { data, error } = await supabase.from('pm_contracts').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
async function terminatePMContractRow(id, decisionDateISO, note = null) {
  const d = new Date(decisionDateISO + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) throw new Error('Invalid decision date')
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  const eff = last.toISOString().slice(0, 10)
  const patch = {
    termination_requested_at: decisionDateISO,
    termination_effective_date: eff,
    terminated_at: new Date().toISOString(),
  }
  if (note != null) patch.notes = note
  const { data, error } = await supabase.from('pm_contracts').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data
}
async function deletePMContractRow(id) {
  const { error } = await supabase.from('pm_contracts').delete().eq('id', id)
  if (error) throw error
}

function lastDayOfMonth(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return last.toISOString().slice(0, 10)
}
function pmContractStatus(pmc) {
  if (!pmc) return 'unknown'
  const today = new Date().toISOString().slice(0, 10)
  if (pmc.terminated_at) {
    if (pmc.termination_effective_date && pmc.termination_effective_date >= today) return 'ending'
    return 'terminated'
  }
  if (pmc.expiry_date && pmc.expiry_date < today) return 'expired'
  if (pmc.expiry_date) {
    const diff = Math.round((new Date(pmc.expiry_date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000)
    if (diff <= 30) return 'expiring'
  }
  return 'active'
}
function pmStatusLabel(pmc) {
  const s = pmContractStatus(pmc)
  if (s === 'active')     return { label: 'Active',     className: 'text-emerald-600 dark:text-emerald-400' }
  if (s === 'expiring')   return { label: 'Expiring',   className: 'text-amber-600 dark:text-amber-400' }
  if (s === 'ending')     return { label: 'Ending',     className: 'text-amber-600 dark:text-amber-400' }
  if (s === 'expired')    return { label: 'Expired',    className: 'text-red-600 dark:text-red-400' }
  if (s === 'terminated') return { label: 'Terminated', className: 'text-gray-500 dark:text-gray-400' }
  return { label: '—', className: 'text-muted-foreground' }
}

// ============================================================
// PM CARD
// ============================================================
function PMCard({ pm, onClick }) {
  const activeCount = pm._activeCount ?? 0
  const totalEarnings = pm._totalEarnings ?? 0
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'group/card relative w-full text-left rounded-xl bg-card border border-border overflow-hidden',
        'shadow-sm hover:shadow-lg hover:border-[#2d568e]/40 transition-all duration-200 flex flex-col',
      )}
    >
      <div className="p-5">
        <WorkerAvatar name={pm.name} photo_url={pm.photo_url} size="lg" />
        <div className="mt-4">
          <p className="text-base font-bold text-foreground truncate leading-tight">{pm.name}</p>
          <p className="text-[11px] font-mono text-muted-foreground mt-0.5 uppercase tracking-wide">{pm.code}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <RoleBadge role="property_managers" />
            <span className={cn(
              'inline-flex items-center rounded-md font-bold uppercase tracking-wide px-2.5 py-0.5 text-[10px]',
              pm.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-gray-400 text-white',
            )}>
              {pm.status || 'active'}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-auto bg-muted/40 dark:bg-muted/20 border-t border-border p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Managing</p>
            <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
              {activeCount} unit{activeCount === 1 ? '' : 's'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Earnings</p>
            <p className="text-sm font-bold text-foreground tabular-nums mt-0.5 truncate">
              {totalEarnings > 0 ? formatMoney(totalEarnings) : '—'}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] min-w-0">
            <Mail size={12} className="text-muted-foreground flex-shrink-0" />
            {pm.email ? <span className="text-foreground truncate">{pm.email}</span> : <span className="text-muted-foreground italic">No email</span>}
          </div>
          <div className="flex items-center gap-2 text-[11px] min-w-0">
            <Phone size={12} className="text-muted-foreground flex-shrink-0" />
            {pm.phone ? <span className="text-foreground truncate">{pm.phone}</span> : <span className="text-muted-foreground italic">No phone</span>}
          </div>
        </div>
      </div>
    </motion.button>
  )
}

// ============================================================
// PM FORM MODAL
// ============================================================
function PMFormModal({ open, onClose, onSaved, editing }) {
  const [form, setForm] = useState({ code: '', name: '', email: '', phone: '', notes: '', status: 'active' })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        code: editing.code || '', name: editing.name || '',
        email: editing.email || '', phone: editing.phone || '',
        notes: editing.notes || '', status: editing.status || 'active',
      })
      setPhotoPreview(editing.photo_url || null)
    } else {
      setForm({ code: '', name: '', email: '', phone: '', notes: '', status: 'active' })
      setPhotoPreview(null)
    }
    setPhotoFile(null)
  }, [open, editing])

  if (!open) return null

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handlePhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPhotoFile(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async () => {
    if (saving) return
    if (!form.code.trim()) { toast.error('Code is required'); return }
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      let photoUrl = editing?.photo_url || null
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg'
        const path = `property_managers/${form.code.toUpperCase()}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('team-photos').upload(path, photoFile, { cacheControl: '3600', upsert: true })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('team-photos').getPublicUrl(path)
        photoUrl = data.publicUrl
      }
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
        photo_url: photoUrl,
      }
      if (editing) {
        await updatePMRow(editing.id, payload)
        logAudit('UPDATE_PROPERTY_MANAGER', 'property_managers', editing.id, { code: payload.code }).catch(() => {})
        toast.success('Updated')
      } else {
        const created = await createPMRow(payload)
        logAudit('CREATE_PROPERTY_MANAGER', 'property_managers', created?.id, { code: payload.code }).catch(() => {})
        toast.success('Created')
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

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-9 text-xs rounded-lg'

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">{editing ? 'Edit Property Manager' : 'New Property Manager'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoPreview ? <img src={photoPreview} alt="" className="w-16 h-16 rounded-full object-cover" /> :
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center"><User size={24} className="text-muted-foreground" /></div>}
              <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#2d568e] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-[#1e3a5f]">
                <Camera size={12} />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Upload a profile photo</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className={labelClass}>Code *</label><Input value={form.code} onChange={(e) => setField('code', e.target.value)} className={cn(inputClass, 'font-mono uppercase')} placeholder="PM-XXXX" /></div>
            <div><label className={labelClass}>Name *</label><Input value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputClass} autoFocus /></div>
            <div><label className={labelClass}>Email</label><Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Phone</label><Input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} className={inputClass} /></div>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <div className="inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
              {['active', 'inactive'].map((s) => (
                <button key={s} type="button" onClick={() => setField('status', s)}
                  className={cn('px-3 py-1 rounded-full text-[11px] font-semibold transition-colors capitalize',
                    form.status === s ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div><label className={labelClass}>Notes</label><Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className="text-xs rounded-lg resize-none" /></div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-9 rounded-lg text-xs" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// PM PDF UPLOADER
// ============================================================
function PMPdfUploader({ pmContract, onSaved }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [busyRemove, setBusyRemove] = useState(false)
  const [signedUrl, setSignedUrl] = useState(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const path = pmContract?.pm_pdf_path || null

  useEffect(() => {
    let cancelled = false
    if (!path) { setSignedUrl(null); return }
    setLoadingUrl(true)
    supabase.storage.from(PM_PDF_BUCKET).createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.warn(error); setSignedUrl(null) }
        else setSignedUrl(data?.signedUrl || null)
      })
      .finally(() => { if (!cancelled) setLoadingUrl(false) })
    return () => { cancelled = true }
  }, [path])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > PM_PDF_MAX_BYTES) {
      toast.error(`File too large (max ${pmPdfBytesLabel(PM_PDF_MAX_BYTES)})`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    let buffer
    try {
      buffer = await file.arrayBuffer()
    } catch (err) {
      console.error('File read failed:', err)
      toast.error('Could not read file. Try again.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    const head = new Uint8Array(buffer.slice(0, 12))
    const hex = Array.from(head).map((b) => b.toString(16).padStart(2, '0')).join('')
    let mime = null
    if (hex.startsWith('25504446')) mime = 'application/pdf'
    else if (hex.startsWith('ffd8ff')) mime = 'image/jpeg'
    else if (hex.startsWith('89504e470d0a1a0a')) mime = 'image/png'
    else if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') mime = 'image/webp'

    if (!mime || !PM_PDF_ALLOWED.has(mime)) {
      toast.error('Unsupported file. Use PDF, JPEG, PNG, or WebP.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const ext = mime === 'application/pdf' ? 'pdf'
        : mime === 'image/png' ? 'png'
        : mime === 'image/webp' ? 'webp'
        : 'jpg'

      const newPath = `pm_contracts/${pmContract.id}/${pmPdfRandomId()}.${ext}`

      const { error: upErr } = await supabase
        .storage
        .from(PM_PDF_BUCKET)
        .upload(newPath, buffer, {
          cacheControl: '31536000',
          upsert: false,
          contentType: mime,
        })
      if (upErr) throw upErr

      const { data: signedData, error: signErr } = await supabase
        .storage
        .from(PM_PDF_BUCKET)
        .createSignedUrl(newPath, 3600)
      if (signErr) throw signErr

      await updatePMContractRow(pmContract.id, {
        pm_pdf_path: newPath,
        pm_pdf_url: signedData?.signedUrl || null,
      })

      if (path) {
        supabase.storage.from(PM_PDF_BUCKET).remove([path]).catch((err) => {
          console.warn('Failed to remove old PM PDF:', err)
        })
      }

      logAudit('UPLOAD_PM_PDF', 'pm_contracts', pmContract.id, {
        filename: file.name, size: file.size, mime,
      }).catch(() => {})

      toast.success('PDF uploaded')
      setSignedUrl(signedData?.signedUrl || null)
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!path) return
    if (!window.confirm('Remove the PM contract file? This cannot be undone.')) return
    setBusyRemove(true)
    try {
      const { error: rmErr } = await supabase.storage.from(PM_PDF_BUCKET).remove([path])
      if (rmErr) console.warn('Storage remove failed:', rmErr)
      await updatePMContractRow(pmContract.id, {
        pm_pdf_path: null,
        pm_pdf_url: null,
      })
      logAudit('REMOVE_PM_PDF', 'pm_contracts', pmContract.id, {}).catch(() => {})
      toast.success('PDF removed')
      setSignedUrl(null)
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to remove')
    } finally {
      setBusyRemove(false)
    }
  }

  const hasFile = !!path

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
        disabled={uploading || busyRemove}
      />

      {hasFile ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => signedUrl && setLightboxOpen(true)}
            disabled={!signedUrl}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Preview"
          >
            {loadingUrl ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
          </button>
          <a
            href={signedUrl || '#'}
            download
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Download"
          >
            <Download size={12} />
          </a>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Replace"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={busyRemove}
            className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
            title="Remove"
          >
            {busyRemove ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border border-dashed border-border text-muted-foreground hover:bg-muted/50 hover:border-primary/40 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Upload contract PDF"
        >
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
          Upload
        </button>
      )}

      {lightboxOpen && signedUrl && createPortal(
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[2147483647] bg-black/85 backdrop-blur-sm flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxOpen(false) }}
        >
          <div className="flex-shrink-0 h-14 px-4 flex items-center gap-3 border-b border-white/10 bg-black/60">
            <FileText size={16} className="text-white/80 flex-shrink-0" />
            <p className="text-sm font-semibold text-white truncate flex-1">
              {pmContract.pm_contract_code || 'PM Contract'}
            </p>
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">Open in new tab</span>
            </a>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X size={12} />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4 sm:p-6 flex items-center justify-center">
            <div className="relative w-full h-full max-w-[1100px] rounded-lg overflow-hidden bg-white shadow-2xl">
              <iframe
                src={signedUrl}
                title={pmContract.pm_contract_code || 'PM Contract'}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </motion.div>,
        document.body
      )}
    </>
  )
}

// ============================================================
// ASSIGN UNIT MODAL
// ============================================================
function AssignUnitModal({ open, onClose, onSaved, pm, editingContract, units }) {
  const [form, setForm] = useState({ unit_id: '', effective_date: '', expiry_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingContract) {
      setForm({
        unit_id: editingContract.unit_id,
        effective_date: editingContract.effective_date || '',
        expiry_date: editingContract.expiry_date || '',
        notes: editingContract.notes || '',
      })
    } else {
      const today = new Date()
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const oneYearEnd = new Date(today.getFullYear() + 1, today.getMonth() + 1, 0)
      setForm({
        unit_id: '',
        effective_date: toISODate(firstOfMonth),
        expiry_date: toISODate(oneYearEnd),
        notes: '',
      })
    }
  }, [open, editingContract])

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const av = `${a.building || ''} ${a.unit_code || ''}`.trim()
      const bv = `${b.building || ''} ${b.unit_code || ''}`.trim()
      return av.localeCompare(bv)
    })
  }, [units])

  const snappedEffective = useMemo(() => snapEffectiveToMonthStart(form.effective_date), [form.effective_date])
  const snappedExpiry = useMemo(() => snapExpiryToMonthEnd(form.expiry_date), [form.expiry_date])

  if (!open) return null

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async () => {
    if (saving) return
    if (!form.unit_id) { toast.error('Select a unit'); return }
    if (!form.effective_date) { toast.error('Set an effective date'); return }
    if (!form.expiry_date) { toast.error('Set an expiry date'); return }

    if (snappedEffective && snappedExpiry && snappedExpiry < snappedEffective) {
      toast.error('Expiry must be after effective date')
      return
    }

    if (editingContract) {
      const changed =
        form.unit_id !== editingContract.unit_id ||
        snappedEffective !== editingContract.effective_date ||
        snappedExpiry !== editingContract.expiry_date
      if (changed) {
        const ok = window.confirm(
          'Changing the unit, effective date, or expiry date will RETROACTIVELY rewrite accounting history.\n\nContinue?'
        )
        if (!ok) return
      }
    }

    setSaving(true)
    try {
      let resolvedContractId = editingContract?.contract_id || null
      if (!resolvedContractId) {
        const { data: candidates } = await supabase
          .from('contracts')
          .select('id, effective_date, expiry_date')
          .eq('unit_id', form.unit_id)
          .lte('effective_date', form.effective_date)
          .order('effective_date', { ascending: false })
          .limit(10)
        const match = (candidates || []).find((c) =>
          !c.expiry_date || c.expiry_date >= form.effective_date
        )
        if (match) resolvedContractId = match.id
      }

      const payload = {
        pm_id: pm.id,
        unit_id: form.unit_id,
        contract_id: resolvedContractId,
        effective_date: form.effective_date,
        expiry_date: form.expiry_date,
        notes: form.notes.trim() || null,
        pm_share_of_company_pct: PM_SHARE_OF_COMPANY_PCT,
      }
      if (editingContract) {
        await updatePMContractRow(editingContract.id, payload)
        logAudit('UPDATE_PM_CONTRACT', 'pm_contracts', editingContract.id, payload).catch(() => {})
        toast.success('Assignment updated')
      } else {
        const created = await createPMContractRow(payload)
        logAudit('CREATE_PM_CONTRACT', 'pm_contracts', created?.id, payload).catch(() => {})
        toast.success('PM assigned to unit')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      if (err?.message?.includes('pm_contracts_one_active_per_unit')) {
        toast.error('This unit already has an active PM. Terminate the current one first.')
      } else {
        toast.error(err?.message || 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-lg shadow-2xl max-w-md w-full border border-border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-bold text-foreground">{editingContract ? 'Edit Assignment' : 'Assign PM to Unit'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className={labelClass}>Unit *</label>
            <select
              value={form.unit_id}
              onChange={(e) => setField('unit_id', e.target.value)}
              className="w-full h-8 text-xs rounded border border-border bg-background px-2"
            >
              <option value="">Select a unit…</option>
              {sortedUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.building || '—'} — {u.unit_code || '—'}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Effective Date *</label>
            <Input type="date" value={form.effective_date} onChange={(e) => setField('effective_date', e.target.value)} className={inputClass} />
            {snappedEffective && snappedEffective !== form.effective_date && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Will be saved as <span className="font-mono text-foreground">{snappedEffective}</span> (start of month)
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Expiry Date *</label>
            <Input type="date" value={form.expiry_date} onChange={(e) => setField('expiry_date', e.target.value)} className={inputClass} />
            {snappedExpiry && snappedExpiry !== form.expiry_date && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Will be saved as <span className="font-mono text-foreground">{snappedExpiry}</span> (end of month)
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className="text-xs rounded resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
            {saving ? 'Saving…' : editingContract ? 'Save' : 'Assign'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// TERMINATE MODAL
// ============================================================
function TerminateModal({ open, onClose, onTerminated, pmContract }) {
  const [decisionDate, setDecisionDate] = useState('')
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDecisionDate(new Date().toISOString().slice(0, 10))
    setNote('')
    setConfirmed(false)
  }, [open])

  const effDate = useMemo(() => lastDayOfMonth(decisionDate), [decisionDate])

  if (!open || !pmContract) return null

  const handleSubmit = async () => {
    if (saving) return
    if (!decisionDate) { toast.error('Set the decision date'); return }
    if (!effDate) { toast.error('Invalid decision date'); return }
    if (!confirmed) { toast.error('Please confirm'); return }

    setSaving(true)
    try {
      await terminatePMContractRow(pmContract.id, decisionDate, note.trim() || null)
      logAudit('TERMINATE_PM_CONTRACT', 'pm_contracts', pmContract.id, {
        decision_date: decisionDate, effective_date: effDate,
      }).catch(() => {})
      toast.success(`Effective ${effDate}`)
      onTerminated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'

  return (
    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-lg shadow-2xl max-w-md w-full border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Terminate Assignment</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="rounded-md bg-muted/40 border border-border p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Contract</span><span className="font-mono font-semibold text-foreground">{pmContract.pm_contract_code || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unit</span><span className="font-semibold">{pmContract.units?.unit_code || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Effective</span><span className="font-semibold">{formatDate(pmContract.effective_date)}</span></div>
          </div>
          <div>
            <label className={labelClass}>Decision Date *</label>
            <Input type="date" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} className="h-8 text-xs rounded" />
            <p className="text-[10px] text-muted-foreground mt-1">Termination is always effective on the last day of the month.</p>
          </div>
          {effDate && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                <p><strong>Effective: {formatDate(effDate)}</strong></p>
                <p className="mt-0.5">The PM will continue to earn through this date.</p>
              </div>
            </div>
          )}
          <div>
            <label className={labelClass}>Note (optional)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-xs rounded resize-none" />
          </div>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="rounded border-border mt-0.5" />
            <span className="text-foreground">I understand the effective date above.</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSubmit} disabled={saving || !confirmed} style={{ backgroundColor: '#dc2626' }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <X size={12} className="mr-1.5" />}
            {saving ? 'Terminating…' : 'Terminate'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// PM DETAIL MODAL
// ============================================================
function PMDetailModal({ pm, onClose, onChanged, units }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editPmOpen, setEditPmOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editingContract, setEditingContract] = useState(null)
  const [terminating, setTerminating] = useState(null)

  const [preset, setPreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  )

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const load = useCallback(async () => {
    if (!pm?.id) return
    setLoading(true)
    try { setContracts(await fetchContractsForPM(pm.id)) }
    catch (err) { console.error(err); toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [pm?.id])

  useEffect(() => { load() }, [load])

  const activeCount = useMemo(
    () => contracts.filter((c) => !c.terminated_at).length,
    [contracts]
  )

  const [earningsLoading, setEarningsLoading] = useState(true)
  const [earningsTotal, setEarningsTotal] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setEarningsLoading(true)
      try {
        if (contracts.length === 0) {
          if (!cancelled) { setEarningsTotal(0); setEarningsLoading(false) }
          return
        }

        const unitIds = [...new Set(contracts.map((c) => c.unit_id).filter(Boolean))]
        if (unitIds.length === 0) {
          if (!cancelled) { setEarningsTotal(0); setEarningsLoading(false) }
          return
        }

        const { data: ownerContracts, error: ocErr } = await supabase
          .from('contracts')
          .select('id, unit_id, effective_date, expiry_date')
          .in('unit_id', unitIds)
        if (ocErr) throw ocErr

        const relevant = []
        for (const oc of ownerContracts || []) {
          const overlapping = contracts.some((pc) => {
            if (pc.unit_id !== oc.unit_id) return false
            if (oc.effective_date && pc.expiry_date && oc.effective_date > pc.expiry_date) return false
            if (oc.expiry_date && pc.effective_date && oc.expiry_date < pc.effective_date) return false
            return true
          })
          if (overlapping) relevant.push(oc.id)
        }

        const pmIds = new Set(contracts.map((pc) => pc.pm_id))
        let sum = 0

        for (const cid of relevant) {
          const { data, error: rpcErr } = await supabase.rpc('contract_monthly_breakdown', {
            p_contract_id: cid,
          })
          if (rpcErr) {
            console.warn('monthly breakdown failed for', cid, rpcErr)
            continue
          }
          for (const r of data || []) {
            if (!r.pm_id) continue
            if (!pmIds.has(r.pm_id)) continue

            const monthKey = typeof r.month === 'string' ? r.month.slice(0, 7) : ''
            if (range.from && monthKey < range.from.slice(0, 7)) continue
            if (range.to && monthKey > range.to.slice(0, 7)) continue

            sum += Number(r.pm_share || 0)
          }
        }

        if (!cancelled) setEarningsTotal(sum)
      } catch (err) {
        console.error('PM earnings load failed:', err)
        if (!cancelled) setEarningsTotal(0)
      } finally {
        if (!cancelled) setEarningsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [contracts, range.from, range.to])

  const handleDeletePM = async () => {
    if (activeCount > 0) {
      toast.error(`Cannot delete — ${activeCount} active assignment${activeCount === 1 ? '' : 's'}. Terminate them first.`)
      return
    }
    if (!window.confirm(`Delete "${pm.name}" (${pm.code})?\n\nThis cannot be undone.`)) return
    try {
      await deletePMRow(pm.id)
      logAudit('DELETE_PROPERTY_MANAGER', 'property_managers', pm.id, { code: pm.code }).catch(() => {})
      toast.success('Deleted')
      onChanged()
      onClose()
    } catch (err) { console.error(err); toast.error('Failed to delete') }
  }

  const handleDeleteContract = async (c) => {
    if (!window.confirm('Delete this assignment record permanently?\n\nThis is not the same as terminating. It removes the row entirely and affects accounting history.')) return
    try {
      if (c.pm_pdf_path) {
        supabase.storage.from(PM_PDF_BUCKET).remove([c.pm_pdf_path]).catch(() => {})
      }
      await deletePMContractRow(c.id)
      logAudit('DELETE_PM_CONTRACT', 'pm_contracts', c.id, {}).catch(() => {})
      toast.success('Deleted'); load(); onChanged()
    } catch (err) { console.error(err); toast.error('Failed to delete') }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full max-w-5xl h-[88vh] bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-20 p-2 rounded-full bg-card border border-border hover:bg-muted transition-colors shadow-sm">
          <X size={16} />
        </button>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-shrink-0 md:w-[320px] border-b md:border-b-0 md:border-r border-border bg-muted/20 flex flex-col overflow-y-auto">
            <div className="p-6 flex flex-col items-center text-center">
              <WorkerAvatar name={pm.name} photo_url={pm.photo_url} size="xl" />
              <p className="mt-4 text-lg font-bold text-foreground truncate w-full leading-tight">{pm.name}</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-1 uppercase tracking-wide">{pm.code}</p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <RoleBadge role="property_managers" size="lg" />
              </div>

              <div className="w-full mt-5 p-4 rounded-lg bg-background border border-border">
                <div className="flex items-center gap-2 mb-1 justify-center">
                  <Wallet size={13} className="text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Earnings {preset !== 'all' ? '· in range' : '· lifetime'}
                  </span>
                </div>
                {earningsLoading ? (
                  <div className="h-7 w-32 rounded bg-muted animate-pulse mx-auto" />
                ) : (
                  <p className="text-2xl font-bold tabular-nums text-foreground text-center">
                    {formatMoney(earningsTotal)}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1 text-center">
                  {activeCount} active · {contracts.length} total assignment{contracts.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="w-full mt-5 pt-5 border-t border-border space-y-3 text-left">
                <div className="flex items-start gap-2 min-w-0">
                  <Mail size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Email</p>
                    {pm.email ? <p className="text-xs text-foreground truncate mt-0.5">{pm.email}</p> : <p className="text-xs text-muted-foreground italic mt-0.5">No email</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2 min-w-0">
                  <Phone size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Phone</p>
                    {pm.phone ? <p className="text-xs text-foreground truncate mt-0.5">{pm.phone}</p> : <p className="text-xs text-muted-foreground italic mt-0.5">No phone</p>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Hired</p>
                  <p className="text-xs font-semibold text-foreground tabular-nums mt-0.5">
                    {pm.created_at ? formatDate(pm.created_at) : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-auto p-4 border-t border-border bg-muted/30">
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs gap-2 w-full justify-start" onClick={() => setEditPmOpen(true)}>
                  <Edit2 size={12} /> Edit PM
                </Button>
                <Button variant="outline" size="sm"
                  className="h-9 rounded-lg text-xs gap-2 w-full justify-start text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                  onClick={handleDeletePM}>
                  <Trash2 size={12} /> Delete PM
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap pr-12">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Unit Assignments {!loading && <span className="text-muted-foreground font-normal">· {contracts.length}</span>}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Every unit this PM has managed or is currently managing.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <DateFilterBar
                  preset={preset} setPreset={setPreset}
                  customFrom={customFrom} setCustomFrom={setCustomFrom}
                  customTo={customTo} setCustomTo={setCustomTo}
                />
                <Button size="sm" className="h-8 rounded-lg text-xs" style={{ backgroundColor: BRAND }}
                  onClick={() => { setEditingContract(null); setAssignOpen(true) }}>
                  <Plus size={12} /> Assign
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-3 space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : contracts.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <Building2 size={28} className="text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground italic">No units assigned yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {contracts.map((c) => {
                    const st = pmStatusLabel(c)
                    return (
                      <div key={c.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-mono text-[11px] font-bold text-muted-foreground">{c.pm_contract_code || '—'}</span>
                              <span className={cn('text-[11px] font-semibold', st.className)}>{st.label}</span>
                            </div>
                            <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                              <span className="font-mono text-xs font-bold text-foreground">{c.units?.unit_code || '—'}</span>
                              <span className="text-[11px] text-muted-foreground truncate">{c.units?.building || '—'}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                              <Calendar size={10} className="inline mr-1" />
                              {formatDate(c.effective_date)} → {formatDate(c.expiry_date)}
                              {c.termination_effective_date && (
                                <span className="ml-2 text-amber-600 dark:text-amber-400">
                                  · terminated {formatDate(c.termination_effective_date)}
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {Number(c.pm_share_of_company_pct).toFixed(0)}% of company's 25% · PM earns {((25 * Number(c.pm_share_of_company_pct)) / 100).toFixed(2)}% of net
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                            <PMPdfUploader pmContract={c} onSaved={() => { load(); onChanged() }} />
                            {!c.terminated_at && (
                              <Button variant="outline" size="sm"
                                className="h-7 rounded text-[11px] gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                                onClick={() => setTerminating(c)}>
                                Terminate
                              </Button>
                            )}
                            <button type="button" onClick={() => { setEditingContract(c); setAssignOpen(true) }}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit">
                              <Pencil size={12} />
                            </button>
                            <button type="button" onClick={() => handleDeleteContract(c)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" title="Delete record">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        {c.notes && (
                          <p className="text-[10px] text-muted-foreground italic mt-2 whitespace-pre-wrap break-words">{c.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {editPmOpen && (
            <PMFormModal key="edit-pm" open={editPmOpen} onClose={() => setEditPmOpen(false)}
              onSaved={() => { load(); onChanged() }} editing={pm} />
          )}
          {assignOpen && (
            <AssignUnitModal key="assign" open={assignOpen}
              onClose={() => { setAssignOpen(false); setEditingContract(null) }}
              onSaved={load} pm={pm} editingContract={editingContract} units={units} />
          )}
          {terminating && (
            <TerminateModal key="term" open={!!terminating}
              onClose={() => setTerminating(null)} onTerminated={load} pmContract={terminating} />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function TeamPage() {
  const [activeTab, setActiveTab] = useState('specialists')
  const [data, setData] = useState({ specialists: [], affiliates: [], housekeepers: [] })
  const [counts, setCounts] = useState({ specialists: {}, affiliates: {} })
  const [teamTotals, setTeamTotals] = useState({
    specialistCommission: 0,
    affiliateCommission: 0,
    housekeeperPayout: 0,
    pmEarnings: 0,
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(1)
  const [cardsHidden, setCardsHidden] = useState(false)

  const [pms, setPMs] = useState([])
  const [pmUnits, setPMUnits] = useState([])
  const [pmSelected, setPMSelected] = useState(null)
  const [pmFormOpen, setPMFormOpen] = useState(false)

  const headerRef = useRef(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setSelected(null); setPMSelected(null); setPage(1) }, [activeTab])
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const fetchAll = useCallback(async () => {
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    try {
      const [s, a, h, countResult, pmList, unitList, totalsRes] = await Promise.all([
        supabase.from('specialists').select('*').order('name'),
        supabase.from('affiliates').select('*').order('name'),
        supabase.from('housekeepers').select('*').order('name'),
        fetchTeamCompletedCounts(),
        fetchPMs(),
        fetchUnitsForSelect(),
        supabase.rpc('team_totals_bulk'),
      ])
      if (s.error) throw s.error
      if (a.error) throw a.error
      if (h.error) throw h.error

      setData({ specialists: s.data || [], affiliates: a.data || [], housekeepers: h.data || [] })
      setCounts({
        specialists: countResult.specialists || {},
        affiliates: countResult.affiliates || {},
      })

      // Team totals come from the RPC — one row with four numbers
      if (totalsRes.error) {
        console.error('team_totals_bulk failed:', totalsRes.error)
        setTeamTotals({
          specialistCommission: 0,
          affiliateCommission: 0,
          housekeeperPayout: 0,
          pmEarnings: 0,
        })
      } else {
        const row = (totalsRes.data || [])[0] || {}
        setTeamTotals({
          specialistCommission: Number(row.specialist_commission) || 0,
          affiliateCommission: Number(row.affiliate_commission) || 0,
          housekeeperPayout: Number(row.housekeeper_payout) || 0,
          pmEarnings: Number(row.pm_earnings) || 0,
        })
      }

      const { data: activeContracts } = await supabase
        .from('pm_contracts')
        .select('pm_id')
        .is('terminated_at', null)
      const activeCounts = new Map()
      for (const c of activeContracts || []) {
        activeCounts.set(c.pm_id, (activeCounts.get(c.pm_id) || 0) + 1)
      }

      const pmIds = pmList.map((p) => p.id)
      let earningsMap = new Map()
      if (pmIds.length > 0) {
        const { data: earningsRows, error: earnErr } = await supabase.rpc('pm_earnings_bulk', {
          p_pm_ids: pmIds,
        })
        if (earnErr) {
          console.error('pm_earnings_bulk failed:', earnErr)
        } else {
          for (const row of earningsRows || []) {
            earningsMap.set(row.pm_id, Number(row.total_earnings) || 0)
          }
        }
      }

      const enrichedPMs = pmList.map((p) => ({
        ...p,
        _activeCount: activeCounts.get(p.id) || 0,
        _totalEarnings: earningsMap.get(p.id) || 0,
      }))

      setPMs(enrichedPMs)
      setPMUnits(unitList)
    } catch (err) {
      console.error('Failed to load team:', err)
      toast.error('Failed to load team')
    } finally {
      setLoading(false); setRefreshing(false); hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    let timer = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { fetchAll() }, 1500)
    }

    const chs = [
      supabase.channel('team-specialists').on('postgres_changes', { event: '*', schema: 'public', table: 'specialists' }, schedule).subscribe(),
      supabase.channel('team-affiliates').on('postgres_changes', { event: '*', schema: 'public', table: 'affiliates' }, schedule).subscribe(),
      supabase.channel('team-housekeepers').on('postgres_changes', { event: '*', schema: 'public', table: 'housekeepers' }, schedule).subscribe(),
      supabase.channel('team-bookings').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, schedule).subscribe(),
      supabase.channel('team-pms').on('postgres_changes', { event: '*', schema: 'public', table: 'property_managers' }, schedule).subscribe(),
      supabase.channel('team-pm-contracts').on('postgres_changes', { event: '*', schema: 'public', table: 'pm_contracts' }, schedule).subscribe(),
    ]
    return () => {
      if (timer) clearTimeout(timer)
      chs.forEach((c) => supabase.removeChannel(c))
    }
  }, [fetchAll])

  const activeList = data[activeTab] || []

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (activeTab === 'property_managers') {
      if (!q) return pms
      return pms.filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      )
    }
    if (!q) return activeList
    return activeList.filter((w) =>
      (w.name || '').toLowerCase().includes(q) ||
      (w.code || '').toLowerCase().includes(q) ||
      (w.email || '').toLowerCase().includes(q) ||
      (w.phone || '').toLowerCase().includes(q)
    )
  }, [activeTab, activeList, pms, debouncedSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const liveCountFor = (worker) => {
    if (activeTab === 'specialists') return counts.specialists[worker.code] || 0
    if (activeTab === 'affiliates') return counts.affiliates[worker.code] || 0
    return 0
  }

  const handleSelect = (worker) => setSelected(worker)

  const handleChanged = (updated) => {
    setData((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((x) => (x.id === updated.id ? { ...x, ...updated } : x)),
    }))
    setSelected(updated)
  }

  const handleDelete = async (worker) => {
    const confirmed = window.confirm(`Delete "${worker.name}" (${worker.code})?\n\nThis cannot be undone.`)
    if (!confirmed) return
    try {
      const { error } = await supabase.from(activeTab).delete().eq('id', worker.id)
      if (error) throw error
      logAudit(`DELETE_${activeTab.toUpperCase()}`, activeTab, worker.id, { code: worker.code }).catch(() => {})
      toast.success('Deleted')
      setSelected(null)
      fetchAll()
    } catch (err) { console.error(err); toast.error('Failed to delete') }
  }

  const openNew = () => {
    if (activeTab === 'property_managers') setPMFormOpen(true)
    else { setEditing(null); setFormOpen(true) }
  }
  const openEdit = (worker) => { setEditing(worker); setFormOpen(true) }

  const handleExportCSV = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return }
    const headers = ['Code', 'Name', 'Role', 'Email', 'Phone', 'Completed', 'Hired']
    const rows = filtered.map((w) => [
      w.code || '',
      w.name || '',
      activeTab === 'specialists' ? 'Booking Specialist'
        : activeTab === 'affiliates' ? 'Affiliate'
        : activeTab === 'property_managers' ? 'Property Manager'
        : 'Housekeeper',
      w.email || '', w.phone || '',
      activeTab === 'property_managers' ? (w._activeCount || 0) : liveCountFor(w),
      w.created_at ? new Date(w.created_at).toISOString().slice(0, 10) : '',
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `team_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  const handleListMouseMove = useCallback((e) => {
    const headerEl = headerRef.current
    if (!headerEl) return
    const headerRect = headerEl.getBoundingClientRect()
    setCardsHidden(e.clientY > headerRect.bottom)
  }, [])
  const handleListMouseLeave = useCallback(() => setCardsHidden(false), [])

  const showSkeleton = loading || refreshing
  const isPMTab = activeTab === 'property_managers'

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">

        <div className={cn(
          'flex-shrink-0 pt-1 pb-2 transition-all duration-300 ease-out overflow-hidden',
          cardsHidden ? 'max-h-0 opacity-0 -mb-3' : 'max-h-52 opacity-100',
        )}>
          <SummaryCards data={data} teamTotals={teamTotals} activeTab={activeTab} />
        </div>

        <div className={cn(
          'flex-shrink-0 pt-1 pb-2 transition-all duration-300 ease-out overflow-hidden',
          cardsHidden ? 'max-h-0 opacity-0 -mb-3' : 'max-h-24 opacity-100',
        )}>
          <TeamTabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={(tab) => { setActiveTab(tab); setSelected(null); setPMSelected(null) }}
            counts={{
              specialists: data.specialists.length,
              affiliates: data.affiliates.length,
              housekeepers: data.housekeepers.length,
              property_managers: pms.length,
            }}
          />
        </div>

        <div ref={headerRef} className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, code, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs rounded-lg"
            />
          </div>
          <Button size="sm" className="h-9 rounded-lg text-xs text-white" style={{ backgroundColor: BRAND }} onClick={openNew}>
            <Plus size={13} />
            <span className="hidden sm:inline ml-1">
              {isPMTab ? 'New PM' : 'New'}
            </span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-9 rounded-lg" title="Download CSV">
            <Download size={13} />
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={refreshing} className="h-9 rounded-lg">
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          </Button>
        </div>

        <div
          className="flex-1 min-h-0 rounded border border-border shadow-sm overflow-hidden bg-card flex flex-col"
          onMouseMove={handleListMouseMove}
          onMouseLeave={handleListMouseLeave}
        >
          <div className="flex-1 min-h-0 overflow-y-auto p-4" style={{ scrollbarGutter: 'stable' }}>
            {showSkeleton ? (
              <WorkerCardSkeletonGrid count={PAGE_SIZE} />
            ) : filtered.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center py-12">
                <div>
                  <Users size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-semibold">
                    {isPMTab ? 'No Property Managers yet' : 'No workers yet'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isPMTab ? 'Click "New PM" to add the first one' : 'Click "New" to add your first one'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {isPMTab
                  ? pageItems.map((pm) => (
                      <PMCard key={pm.id} pm={pm} onClick={() => setPMSelected(pm)} />
                    ))
                  : pageItems.map((worker) => (
                      <WorkerCard
                        key={worker.id}
                        worker={worker}
                        role={activeTab}
                        liveCount={liveCountFor(worker)}
                        onClick={() => handleSelect(worker)}
                      />
                    ))}
              </div>
            )}
          </div>

          {!showSkeleton && filtered.length > PAGE_SIZE && (
            <div className="flex-shrink-0 border-t border-border bg-card px-3 py-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {filtered.length} {isPMTab ? 'PM' : 'worker'}{filtered.length === 1 ? '' : 's'} · Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className={cn('p-1.5 rounded-md border border-border transition-colors',
                    page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted text-foreground')}>
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] font-semibold text-foreground tabular-nums px-2">{page} / {totalPages}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className={cn('p-1.5 rounded-md border border-border transition-colors',
                    page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted text-foreground')}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!isPMTab && selected && (
          <WorkerDetailModal
            key={selected.id}
            worker={selected}
            role={activeTab}
            counts={counts}
            onClose={() => setSelected(null)}
            onChanged={handleChanged}
            onEdit={() => openEdit(selected)}
            onDelete={() => handleDelete(selected)}
          />
        )}
        {isPMTab && pmSelected && (
          <PMDetailModal
            key={pmSelected.id}
            pm={pmSelected}
            onClose={() => setPMSelected(null)}
            onChanged={fetchAll}
            units={pmUnits}
          />
        )}
      </AnimatePresence>

      {!isPMTab && (
        <WorkerFormModal
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSaved={fetchAll}
          role={activeTab}
          editing={editing}
        />
      )}

      {isPMTab && (
        <PMFormModal
          open={pmFormOpen}
          onClose={() => setPMFormOpen(false)}
          onSaved={fetchAll}
          editing={null}
        />
      )}
    </div>
  )
}