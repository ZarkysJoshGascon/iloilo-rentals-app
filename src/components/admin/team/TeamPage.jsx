import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2, Camera,
  UserPlus, Users, Award, TrendingUp, Mail, Phone, Edit2, User,
  Calendar, Download, ChevronLeft, ChevronRight,
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

const TABS = [
  { id: 'specialists', label: 'Booking Specialists', icon: UserPlus },
  { id: 'affiliates', label: 'Affiliates', icon: Award },
  { id: 'housekeepers', label: 'Housekeepers', icon: Users },
]

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
  const labels = { specialists: 'Booking Specialist', affiliates: 'Affiliate', housekeepers: 'Housekeeper' }
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[10px]'
  return (
    <span className={cn('inline-flex items-center rounded-md font-bold uppercase tracking-wide', sizeClass, 'bg-muted text-muted-foreground')}>
      {labels[role] || '—'}
    </span>
  )
}

function SummaryCards({ data, totalCommission }) {
  const stats = useMemo(() => ({
    totalSpecialists: (data.specialists || []).length,
    totalAffiliates: (data.affiliates || []).length,
    totalHousekeepers: (data.housekeepers || []).length,
    totalCommission: Number(totalCommission || 0),
  }), [data, totalCommission])

  const cards = [
    { label: 'Booking Specialists', value: stats.totalSpecialists, icon: UserPlus },
    { label: 'Affiliates',          value: stats.totalAffiliates,  icon: Award },
    { label: 'Housekeepers',        value: stats.totalHousekeepers, icon: Users },
    { label: 'Commission Income',   value: formatMoney(stats.totalCommission), icon: TrendingUp, isMoney: true },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.22 }}
          className="rounded-lg bg-card border border-border shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={14} className="text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3.5 w-10" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-3.5 w-20" />
          </div>
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
        'shadow-sm hover:shadow-lg hover:border-[#2d568e]/40 transition-all duration-200',
        'flex flex-col',
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
            {worker.email ? (
              <span className="text-foreground truncate">{worker.email}</span>
            ) : (
              <span className="text-muted-foreground italic">No email</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] min-w-0">
            <Phone size={12} className="text-muted-foreground flex-shrink-0" />
            {worker.phone ? (
              <span className="text-foreground truncate">{worker.phone}</span>
            ) : (
              <span className="text-muted-foreground italic">No phone</span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  )
}

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
                isActive
                  ? 'bg-card border border-border text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
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
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 text-xs rounded w-[130px]" />
        </div>
      )}
    </div>
  )
}

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
            .select('id, cleaning_code, unit_id, type, scheduled_date, status, units:unit_id ( unit_code, building )')
            .eq('housekeeper_id', worker.id)
            .order('scheduled_date', { ascending: false })
            .limit(200)
          if (range.from) q = q.gte('scheduled_date', range.from)
          if (range.to) q = q.lte('scheduled_date', range.to)
          const { data, error: err } = await q
          if (err) throw err
          if (!cancelled) setItems(data || [])
        } else {
          let q = supabase
            .from('bookings')
            .select('id, booking_code, guest_name, check_in, check_out, completed_at, unit_id, units:unit_id ( unit_code, building )')
            .is('deleted_at', null)
            .order('check_in', { ascending: false })
            .limit(200)
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

  const title = isHousekeeper ? 'Cleanings' : 'Bookings'

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap pr-12">
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
          <div className="py-8 px-4 text-center">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 px-4 text-center">
            <p className="text-xs text-muted-foreground italic">
              {isHousekeeper ? 'No cleanings in this range' : 'No bookings in this range'}
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
                    <span className={cn('text-[11px] font-semibold flex-shrink-0', config.className)}>
                      {config.label}
                    </span>
                  </div>
                )
              }

              const status = deriveBookingStatus(item)
              const config = BOOKING_STATUS_TEXT[status] || BOOKING_STATUS_TEXT.upcoming
              const nights = computeNights(item.check_in, item.check_out)
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
                  <span className={cn('text-[11px] font-semibold flex-shrink-0', config.className)}>
                    {config.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

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
          title="Close (Esc)"
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
                    {worker.email ? (
                      <p className="text-xs text-foreground truncate mt-0.5">{worker.email}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic mt-0.5">No email</p>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 min-w-0">
                  <Phone size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Phone</p>
                    {worker.phone ? (
                      <p className="text-xs text-foreground truncate mt-0.5">{worker.phone}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic mt-0.5">No phone</p>
                    )}
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
        code: editing.code || '',
        name: editing.name || '',
        email: editing.email || '',
        phone: editing.phone || '',
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
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center"><User size={24} className="text-muted-foreground" /></div>
              )}
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

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState('specialists')
  const [data, setData] = useState({ specialists: [], affiliates: [], housekeepers: [] })
  const [counts, setCounts] = useState({ specialists: {}, affiliates: {} })
  const [totalCommission, setTotalCommission] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [page, setPage] = useState(1)
  const [cardsHidden, setCardsHidden] = useState(false)

  const headerRef = useRef(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setSelected(null); setPage(1) }, [activeTab])
  useEffect(() => { setPage(1) }, [debouncedSearch])

  const fetchAll = useCallback(async () => {
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    try {
      const [s, a, h, countResult, bookingRes] = await Promise.all([
        supabase.from('specialists').select('*').order('name'),
        supabase.from('affiliates').select('*').order('name'),
        supabase.from('housekeepers').select('*').order('name'),
        fetchTeamCompletedCounts(),
        supabase
          .from('bookings')
          .select('booker_commission, affiliate_commission')
          .is('deleted_at', null)
          .not('completed_at', 'is', null),
      ])
      if (s.error) throw s.error
      if (a.error) throw a.error
      if (h.error) throw h.error
      if (bookingRes.error) throw bookingRes.error

      setData({ specialists: s.data || [], affiliates: a.data || [], housekeepers: h.data || [] })
      setCounts({
        specialists: countResult.specialists || {},
        affiliates: countResult.affiliates || {},
      })

      const commissionSum = (bookingRes.data || []).reduce(
        (sum, b) => sum + Number(b.booker_commission || 0) + Number(b.affiliate_commission || 0),
        0
      )
      setTotalCommission(commissionSum)
    } catch (err) {
      console.error('Failed to load team:', err)
      toast.error('Failed to load team')
    } finally {
      setLoading(false); setRefreshing(false); hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const chs = [
      supabase.channel('team-specialists').on('postgres_changes', { event: '*', schema: 'public', table: 'specialists' }, () => fetchAll()).subscribe(),
      supabase.channel('team-affiliates').on('postgres_changes', { event: '*', schema: 'public', table: 'affiliates' }, () => fetchAll()).subscribe(),
      supabase.channel('team-housekeepers').on('postgres_changes', { event: '*', schema: 'public', table: 'housekeepers' }, () => fetchAll()).subscribe(),
      supabase.channel('team-bookings').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchAll()).subscribe(),
    ]
    return () => { chs.forEach((c) => supabase.removeChannel(c)) }
  }, [fetchAll])

  const activeList = data[activeTab] || []

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return activeList
    return activeList.filter((w) =>
      (w.name || '').toLowerCase().includes(q) ||
      (w.code || '').toLowerCase().includes(q) ||
      (w.email || '').toLowerCase().includes(q) ||
      (w.phone || '').toLowerCase().includes(q)
    )
  }, [activeList, debouncedSearch])

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
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    }
  }

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (worker) => { setEditing(worker); setFormOpen(true) }

  const handleExportCSV = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return }

    const headers = ['Code', 'Name', 'Role', 'Email', 'Phone', 'Completed', 'Hired']
    const rows = filtered.map((w) => [
      w.code || '',
      w.name || '',
      activeTab === 'specialists' ? 'Booking Specialist' : activeTab === 'affiliates' ? 'Affiliate' : 'Housekeeper',
      w.email || '',
      w.phone || '',
      liveCountFor(w),
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

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">

        <div className={cn(
          'flex-shrink-0 pt-1 pb-2 transition-all duration-300 ease-out overflow-hidden',
          cardsHidden ? 'max-h-0 opacity-0 -mb-3' : 'max-h-52 opacity-100',
        )}>
          <SummaryCards data={data} totalCommission={totalCommission} />
        </div>

        <div className={cn(
          'flex-shrink-0 pt-1 pb-2 transition-all duration-300 ease-out overflow-hidden',
          cardsHidden ? 'max-h-0 opacity-0 -mb-3' : 'max-h-24 opacity-100',
        )}>
          <TeamTabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={(tab) => { setActiveTab(tab); setSelected(null) }}
            counts={{
              specialists: data.specialists.length,
              affiliates: data.affiliates.length,
              housekeepers: data.housekeepers.length,
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
            <span className="hidden sm:inline ml-1">New</span>
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
                  <p className="text-sm text-muted-foreground font-semibold">No workers yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "New" to add your first one</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pageItems.map((worker) => (
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
                {filtered.length} worker{filtered.length === 1 ? '' : 's'} · Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cn(
                    'p-1.5 rounded-md border border-border transition-colors',
                    page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted text-foreground',
                  )}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] font-semibold text-foreground tabular-nums px-2">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={cn(
                    'p-1.5 rounded-md border border-border transition-colors',
                    page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted text-foreground',
                  )}
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
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
      </AnimatePresence>

      <WorkerFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={fetchAll}
        role={activeTab}
        editing={editing}
      />
    </div>
  )
}