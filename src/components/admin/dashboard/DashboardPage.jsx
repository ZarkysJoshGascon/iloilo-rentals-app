// src/components/admin/dashboard/DashboardPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, ArrowRight, Inbox, ChevronLeft, ChevronRight,
  Copy, Calendar, TrendingUp, FileText, Mail, Sparkles,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useDebouncedRealtime } from '@/hooks/useDebouncedRealtime'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { ContextMenu } from '@/components/ui/ContextMenu'

const NEARING_END_DAYS = 60
const LIST_LIMIT = 8
const MY_LIST_LIMIT = 12

const BRAND = '#2d568e'
const CLEAN_COLOR = '#10b981'

function toISODate(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function isoDatePlusDays(days) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return toISODate(d)
}
function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00Z')
  if (Number.isNaN(target.getTime())) return null
  return Math.round((target - today) / 86400000)
}
function formatMoney(n) {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function formatMoneyCompact(n) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `₱${Math.round(v / 1_000)}k`
  return `₱${Math.round(v)}`
}
function formatDateShort(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00Z')
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}

// ── Shared context menu builder for any booking row ──────────
function buildBookingContextItems(booking, navigate) {
  const openBooking = () => navigate(`/admin?tab=bookings&booking=${booking.id}`)
  return [
    { label: 'See in Bookings', icon: Calendar, onSelect: openBooking },
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
      onSelect: () => navigate(`/admin?tab=housekeeping&fromBooking=${booking.id}`),
    },
  ]
}

function Section({ title, subtitle, action, children, className }) {
  return (
    <section className={cn('flex flex-col min-h-0', className)}>
      <div className="flex items-baseline justify-between gap-3 mb-2 px-0.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground truncate">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="rounded-md bg-card border border-border overflow-hidden shadow-sm flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </section>
  )
}

function ViewAll({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
    >
      View all <ArrowRight size={11} />
    </button>
  )
}

function EmptyState({ children }) {
  return (
    <div className="h-full flex flex-col items-center justify-center py-12 px-4 text-center">
      <Inbox size={20} className="text-muted-foreground/40 mb-2" />
      <p className="text-[11px] text-muted-foreground italic">{children}</p>
    </div>
  )
}

function BookingStripRow({ booking, stripColor = BRAND }) {
  const navigate = useNavigate()
  const openBooking = () => navigate(`/admin?tab=bookings&booking=${booking.id}`)
  const contextItems = buildBookingContextItems(booking, navigate)

  const balance = Number(booking.balance || 0)
  const paid = balance <= 0

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={openBooking}
        className="relative w-full text-left px-4 py-2.5 pl-5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors overflow-hidden cursor-pointer"
      >
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-[4px]"
          style={{ backgroundColor: stripColor }}
        />
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-foreground truncate">
              {booking.guest_name || '—'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {booking.units?.unit_code || '—'} · {booking.units?.building || '—'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate mt-0.5 tabular-nums">
              {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
              {booking.booking_code && <span className="ml-2 font-mono">{booking.booking_code}</span>}
            </p>
          </div>
          <p
            className={cn(
              'text-[11px] tabular-nums flex-shrink-0 font-medium',
              paid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            {paid ? 'paid' : formatMoney(balance)}
          </p>
        </div>
      </button>
    </ContextMenu>
  )
}

function ContractStripRow({ contract }) {
  const navigate = useNavigate()
  const openContract = () => navigate(`/admin?tab=contracts&contract=${contract.id}`)

  const contextItems = [
    { label: 'See in Contracts', icon: FileText, onSelect: openContract },
    { label: 'See in Accounting', icon: TrendingUp, onSelect: () => navigate(`/admin?tab=accounting&contract=${contract.id}`) },
    { separator: true },
    {
      label: 'Copy contract code',
      icon: Copy,
      hint: contract.contract_code,
      onSelect: () => {
        navigator.clipboard.writeText(contract.contract_code || '').then(
          () => toast.success('Contract code copied'),
          () => toast.error('Failed to copy'),
        )
      },
    },
  ]

  const days = daysUntil(contract.expiry_date)
  const label = days == null ? '—' : days === 0 ? 'today' : `${days}d`
  const toneClass = days != null && days <= 7
    ? 'text-red-600 dark:text-red-400'
    : days != null && days <= 30
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground'

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={openContract}
        className="w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer grid grid-cols-[1.3fr_1.5fr_1fr_1fr_auto] gap-4 items-center"
      >
        <div className="min-w-0">
          <span className="font-mono text-xs font-bold text-foreground truncate block">
            {contract.contract_code || '—'}
          </span>
          <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
            {contract.owners?.name || 'No owner'}
          </span>
        </div>
        <div className="min-w-0">
          <span className="font-mono text-xs font-bold text-foreground truncate block">
            {contract.units?.unit_code || '—'}
          </span>
          <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
            {contract.units?.building || '—'}
          </span>
        </div>
        <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
          <div className="truncate">{formatDateShort(contract.effective_date)}</div>
        </div>
        <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
          <div className="truncate">{formatDateShort(contract.expiry_date)}</div>
        </div>
        <div className="flex items-center justify-end flex-shrink-0 min-w-[64px]">
          <span className={cn('text-[11px] font-semibold tabular-nums', toneClass)}>
            {label}
          </span>
        </div>
      </button>
    </ContextMenu>
  )
}

function StatCard({ label, value, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-md bg-card border border-border shadow-sm p-4 text-left flex flex-col justify-between min-h-[104px] w-full',
        onClick
          ? 'cursor-pointer hover:bg-muted/40 hover:border-[#2d568e]/40 transition-all active:scale-[0.99]'
          : 'cursor-default',
      )}
    >
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-3">
        <p className="text-[26px] font-semibold tabular-nums text-foreground leading-none tracking-tight">
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-2 truncate">{sub}</p>}
      </div>
    </button>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border border-border bg-popover shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{p.name}</span>
          <span className="tabular-nums font-semibold text-foreground">
            {p.dataKey === 'revenue'
              ? formatMoney(p.value)
              : p.dataKey === 'occupancy_pct'
                ? `${p.value}%`
                : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function BookingsChart({ data, loading }) {
  const chartData = useMemo(() => (data || []).map((r) => ({
    label: new Date(r.month_start).toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
    bookings: Number(r.bookings_count || 0),
  })), [data])

  if (loading) return <div className="h-[200px] m-4 rounded bg-muted/50 animate-pulse" />

  return (
    <div className="h-[220px] w-full p-4 pt-5">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            strokeOpacity={0.4}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(45, 86, 142, 0.06)' }} />
          <Bar dataKey="bookings" name="Bookings" fill={BRAND} radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function OccupancyChart({ data, loading }) {
  const chartData = useMemo(() => (data || []).map((r) => {
    const bookingsCount = Number(r.bookings_count || 0)
    return {
      label: new Date(r.month_start).toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
      occupancy_pct: bookingsCount > 0 ? Number(r.occupancy_pct || 0) : 0,
    }
  }), [data])

  if (loading) return <div className="h-[200px] m-4 rounded bg-muted/50 animate-pulse" />

  return (
    <div className="h-[220px] w-full p-4 pt-5">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="dash-occupancy-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
              <stop offset="60%" stopColor={BRAND} stopOpacity={0.10} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            strokeOpacity={0.4}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            strokeOpacity={0.4}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 100]}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: BRAND, strokeOpacity: 0.15 }} />
          <Area
            type="monotone"
            dataKey="occupancy_pct"
            name="Occupancy"
            stroke={BRAND}
            strokeWidth={2}
            fill="url(#dash-occupancy-fill)"
            dot={{ r: 2.5, fill: BRAND }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function RevenueGauge({ data, loading, year }) {
  const { totalRevenue, maxMonthRevenue } = useMemo(() => {
    let total = 0
    let max = 0
    for (const r of (data || [])) {
      const v = Number(r.revenue || 0)
      total += v
      if (v > max) max = v
    }
    return { totalRevenue: total, maxMonthRevenue: max }
  }, [data])

  const pct = maxMonthRevenue > 0 ? 1 : 0
  const totalTicks = 44
  const filledTicks = Math.round(pct * totalTicks)
  const w = 180
  const h = 100
  const cx = w / 2
  const cy = h - 2
  const r = 66
  const strokeW = 6

  if (loading) return <div className="h-[220px] m-4 rounded bg-muted/50 animate-pulse" />

  return (
    <div className="h-[220px] w-full flex flex-col items-center justify-center gap-1 p-4">
      <div className="relative" style={{ width: w, height: h }}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
          {[...Array(totalTicks)].map((_, i) => {
            const t = i / (totalTicks - 1)
            const angle = 180 - t * 180
            const rad = (angle * Math.PI) / 180
            const x1 = cx + Math.cos(rad) * (r - strokeW / 2)
            const y1 = cy - Math.sin(rad) * (r - strokeW / 2)
            const x2 = cx + Math.cos(rad) * (r + strokeW / 2)
            const y2 = cy - Math.sin(rad) * (r + strokeW / 2)
            const active = i < filledTicks
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={active ? BRAND : '#d1d5db'}
                strokeWidth="2"
                strokeLinecap="round"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 22 }}>
          <p className="text-xl font-bold tabular-nums text-foreground">
            {formatMoneyCompact(totalRevenue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{year} total</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground tabular-nums mt-1">
        Peak month: {maxMonthRevenue > 0 ? formatMoneyCompact(maxMonthRevenue) : '—'}
      </p>
    </div>
  )
}

// ── My Bookings panel row (with context menu) ────────────────
function MyBookingRow({ booking, onOpen }) {
  const navigate = useNavigate()
  const contextItems = buildBookingContextItems(booking, navigate)

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={onOpen}
        className="relative w-full text-left px-3 py-2 pl-4 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer overflow-hidden"
      >
        <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ backgroundColor: BRAND }} />
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate flex-1">{booking.guest_name || '—'}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{formatMoney(booking.total_amount)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground min-w-0">
          <span className="font-mono truncate">{booking.booking_code || '—'}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate">{booking.units?.unit_code || '—'}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
        </div>
      </button>
    </ContextMenu>
  )
}

// ── My Cleanings panel row (with context menu) ───────────────
function MyCleaningRow({ cleaning, onOpen }) {
  const navigate = useNavigate()

  const contextItems = [
    { label: 'See in Housekeeping', icon: Sparkles, onSelect: onOpen },
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
      icon: Calendar,
      disabled: !cleaning.booking_id,
      onSelect: () => cleaning.booking_id && navigate(`/admin?tab=bookings&booking=${cleaning.booking_id}`),
    },
  ]

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={onOpen}
        className="relative w-full text-left px-3 py-2 pl-4 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer overflow-hidden"
      >
        <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ backgroundColor: CLEAN_COLOR }} />
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] text-foreground truncate flex-1">{cleaning.cleaning_code || '—'}</span>
          <span className="text-[10px] text-muted-foreground capitalize flex-shrink-0">{cleaning.type || '—'}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground min-w-0">
          <span className="truncate">{cleaning.units?.unit_code || '—'}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="capitalize truncate">{cleaning.status || '—'}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="tabular-nums">{formatDateShort(cleaning.scheduled_date)}</span>
          <span className="tabular-nums font-semibold text-foreground">{formatMoney(cleaning.payment_amount || 0)}</span>
        </div>
      </button>
    </ContextMenu>
  )
}

// ── My Referrals panel row (with context menu) ───────────────
function MyReferralRow({ booking, onOpen }) {
  const navigate = useNavigate()
  const contextItems = buildBookingContextItems(booking, navigate)

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={onOpen}
        className="relative w-full text-left px-3 py-2 pl-4 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer overflow-hidden"
      >
        <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ backgroundColor: BRAND }} />
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate flex-1">{booking.guest_name || '—'}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{formatMoney(booking.affiliate_commission || 0)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground min-w-0">
          <span className="font-mono truncate">{booking.booking_code || '—'}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate">{booking.units?.unit_code || '—'}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
          {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
        </div>
      </button>
    </ContextMenu>
  )
}

function MyActivityPanel() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState({ name: null, email: null, photo_url: null })
  const [matched, setMatched] = useState({ specialist: null, affiliate: null, housekeeper: null })
  const [bookings, setBookings] = useState([])
  const [cleanings, setCleanings] = useState([])
  const [referrals, setReferrals] = useState([])

  useEffect(() => {
    if (!user?.email) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const email = user.email.toLowerCase()

    async function load() {
      try {
        const [specRes, affRes, hkRes] = await Promise.all([
          supabase.from('specialists').select('code, name, photo_url').ilike('email', email).maybeSingle(),
          supabase.from('affiliates').select('code, name, photo_url').ilike('email', email).maybeSingle(),
          supabase.from('housekeepers').select('id, name, photo_url').ilike('email', email).maybeSingle(),
        ])
        if (cancelled) return

        const nextMatched = {
          specialist: specRes.data || null,
          affiliate: affRes.data || null,
          housekeeper: hkRes.data || null,
        }
        setMatched(nextMatched)

        setProfile({
          name: user.user_metadata?.full_name || specRes.data?.name || affRes.data?.name || hkRes.data?.name || user.email.split('@')[0],
          email: user.email,
          photo_url: user.user_metadata?.avatar_url || specRes.data?.photo_url || affRes.data?.photo_url || hkRes.data?.photo_url || null,
        })

        const fetches = []
        if (nextMatched.specialist?.code) {
          fetches.push(
            supabase.from('bookings')
              .select(`id, booking_code, guest_name, guest_email, check_in, check_out, total_amount, booker_commission, payment_status, completed_at, units:unit_id ( id, unit_code, building )`)
              .eq('booker_code', nextMatched.specialist.code)
              .is('deleted_at', null)
              .order('check_in', { ascending: false })
              .limit(MY_LIST_LIMIT)
              .then((r) => ({ kind: 'bookings', data: r.data || [] }))
          )
        }
        if (nextMatched.housekeeper?.id) {
          fetches.push(
            supabase.from('cleanings')
              .select(`id, booking_id, cleaning_code, scheduled_date, status, type, payment_amount, units:unit_id ( id, unit_code, building )`)
              .eq('housekeeper_id', nextMatched.housekeeper.id)
              .order('scheduled_date', { ascending: false })
              .limit(MY_LIST_LIMIT)
              .then((r) => ({ kind: 'cleanings', data: r.data || [] }))
          )
        }
        if (nextMatched.affiliate?.code) {
          fetches.push(
            supabase.from('bookings')
              .select(`id, booking_code, guest_name, guest_email, check_in, check_out, total_amount, affiliate_commission, payment_status, completed_at, units:unit_id ( id, unit_code, building )`)
              .eq('affiliate_code', nextMatched.affiliate.code)
              .is('deleted_at', null)
              .order('check_in', { ascending: false })
              .limit(MY_LIST_LIMIT)
              .then((r) => ({ kind: 'referrals', data: r.data || [] }))
          )
        }

        const results = await Promise.all(fetches)
        if (cancelled) return
        for (const r of results) {
          if (r.kind === 'bookings') setBookings(r.data)
          else if (r.kind === 'cleanings') setCleanings(r.data)
          else if (r.kind === 'referrals') setReferrals(r.data)
        }
      } catch (err) {
        console.error('MyActivityPanel load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.id, user?.email])

  const rolePills = useMemo(() => {
    const pills = []
    if (matched.specialist) pills.push('Specialist')
    if (matched.affiliate) pills.push('Affiliate')
    if (matched.housekeeper) pills.push('Housekeeper')
    return pills
  }, [matched])

  const hasAnyMatch = !!(matched.specialist || matched.affiliate || matched.housekeeper)

  const goBooking = (id) => navigate(`/admin?tab=bookings&booking=${id}`)
  const goCleaning = (id) => navigate(`/admin?tab=housekeeping&cleaning=${id}`)

  return (
    <aside className="flex-shrink-0 hidden lg:flex flex-col gap-3 w-[300px] xl:w-[320px] overflow-hidden" style={{ maxHeight: '100%' }}>
      <div className="rounded-md bg-card border border-border shadow-lg overflow-hidden flex-shrink-0">
        <div className="p-4 flex flex-col items-center text-center">
          {profile.photo_url ? (
            <img src={profile.photo_url} alt={profile.name || ''} className="w-16 h-16 rounded-full object-cover ring-2 ring-border" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#2d568e] flex items-center justify-center text-white text-xl font-bold">
              {(profile.name || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <p className="mt-3 text-sm font-semibold text-foreground truncate w-full">{profile.name || 'User'}</p>
          <p className="text-[11px] text-muted-foreground truncate w-full">{profile.email || ''}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground">Administrator</span>
            {rolePills.map((p) => (
              <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-foreground">{p}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
        {!hasAnyMatch && !loading && (
          <div className="rounded-md bg-card border border-border shadow-sm px-3 py-8 flex flex-col items-center justify-center text-center">
            <Inbox size={20} className="text-muted-foreground/40 mb-2" />
            <p className="text-[11px] text-muted-foreground italic">No personal activity</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1 max-w-[200px]">
              Your email isn't linked to a specialist, affiliate, or housekeeper row.
            </p>
          </div>
        )}

        {matched.specialist && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">My Bookings</h4>
              <span className="text-[11px] text-muted-foreground tabular-nums">· {loading ? '…' : bookings.length}</span>
            </div>
            <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-2 space-y-1.5">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
              ) : bookings.length === 0 ? (
                <div className="px-3 py-6 text-center"><p className="text-[11px] text-muted-foreground italic">No bookings yet</p></div>
              ) : (
                bookings.map((b) => (
                  <MyBookingRow key={b.id} booking={b} onOpen={() => goBooking(b.id)} />
                ))
              )}
            </div>
          </div>
        )}

        {matched.housekeeper && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">My Cleanings</h4>
              <span className="text-[11px] text-muted-foreground tabular-nums">· {loading ? '…' : cleanings.length}</span>
            </div>
            <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-2 space-y-1.5">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
              ) : cleanings.length === 0 ? (
                <div className="px-3 py-6 text-center"><p className="text-[11px] text-muted-foreground italic">No cleanings yet</p></div>
              ) : (
                cleanings.map((c) => (
                  <MyCleaningRow key={c.id} cleaning={c} onOpen={() => goCleaning(c.id)} />
                ))
              )}
            </div>
          </div>
        )}

        {matched.affiliate && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-0.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">My Referrals</h4>
              <span className="text-[11px] text-muted-foreground tabular-nums">· {loading ? '…' : referrals.length}</span>
            </div>
            <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-2 space-y-1.5">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}</div>
              ) : referrals.length === 0 ? (
                <div className="px-3 py-6 text-center"><p className="text-[11px] text-muted-foreground italic">No referrals yet</p></div>
              ) : (
                referrals.map((b) => (
                  <MyReferralRow key={b.id} booking={b} onOpen={() => goBooking(b.id)} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default function DashboardPage({ onNavigateTab }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const [stats, setStats] = useState({
    totalBookings: 0,
    inHouseBookings: 0,
    upcomingBookings: 0,
    unpaidBookingsCount: 0,
    unpaidBookingsTotal: 0,
    cleaningsToEvaluate: 0,
  })

  const [todayLists, setTodayLists] = useState({ checkIns: [], checkOuts: [] })
  const [contractsNearingEnd, setContractsNearingEnd] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsYear, setAnalyticsYear] = useState(() => new Date().getFullYear())

  const hasLoadedOnce = useRef(false)

  const fetchAnalytics = useCallback(async (year) => {
    setAnalyticsLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('dashboard_analytics_year', { p_year: year })
      if (err) throw err
      setAnalytics(data || [])
    } catch (err) {
      console.error('Analytics load failed:', err)
      setAnalytics([])
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const today = todayISO()
    const soon = isoDatePlusDays(NEARING_END_DAYS)

    try {
      const [
        totalRes,
        inHouseRes,
        upcomingRes,
        unpaidListRes,
        cleaningsToEvaluateRes,
        checkInsRes,
        checkOutsRes,
        nearingEndRes,
      ] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).is('deleted_at', null).is('completed_at', null).lte('check_in', today).gte('check_out', today),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).is('deleted_at', null).is('completed_at', null).gt('check_in', today),
        supabase.from('bookings').select('id, balance').is('deleted_at', null).is('completed_at', null).gt('balance', 0),
        supabase.from('cleanings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('bookings').select(`id, booking_code, guest_name, guest_email, check_in, check_out, balance, units:unit_id ( id, unit_code, building )`).is('deleted_at', null).eq('check_in', today).order('check_in', { ascending: true }).limit(LIST_LIMIT),
        supabase.from('bookings').select(`id, booking_code, guest_name, guest_email, check_in, check_out, balance, units:unit_id ( id, unit_code, building )`).is('deleted_at', null).eq('check_out', today).order('check_out', { ascending: true }).limit(LIST_LIMIT),
        supabase.from('contracts').select(`id, contract_code, effective_date, expiry_date, units:unit_id ( id, unit_code, building ), owners:owner_id ( id, name )`).gte('expiry_date', today).lte('expiry_date', soon).order('expiry_date', { ascending: true }).limit(LIST_LIMIT),
      ])

      const firstErr = [totalRes, inHouseRes, upcomingRes, unpaidListRes, cleaningsToEvaluateRes, checkInsRes, checkOutsRes, nearingEndRes].find((r) => r.error)
      if (firstErr?.error) throw firstErr.error

      const unpaidList = unpaidListRes.data || []
      const unpaidTotal = unpaidList.reduce((s, b) => s + Number(b.balance || 0), 0)

      setStats({
        totalBookings: totalRes.count || 0,
        inHouseBookings: inHouseRes.count || 0,
        upcomingBookings: upcomingRes.count || 0,
        unpaidBookingsCount: unpaidList.length,
        unpaidBookingsTotal: unpaidTotal,
        cleaningsToEvaluate: cleaningsToEvaluateRes.count || 0,
      })

      setTodayLists({
        checkIns: checkInsRes.data || [],
        checkOuts: checkOutsRes.data || [],
      })

      setContractsNearingEnd(nearingEndRes.data || [])
      hasLoadedOnce.current = true
    } catch (err) {
      console.error('Dashboard load failed:', err)
      setError(err?.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll(false)
    fetchAnalytics(analyticsYear)
  }, [fetchAll, fetchAnalytics, analyticsYear])

  const handleRealtime = useCallback(() => {
    if (!hasLoadedOnce.current) return
    fetchAll(true)
    fetchAnalytics(analyticsYear)
  }, [fetchAll, fetchAnalytics, analyticsYear])

  useDebouncedRealtime({ table: 'contracts', onChange: handleRealtime, debounceMs: 2000 })
  useDebouncedRealtime({ table: 'bookings', onChange: handleRealtime, debounceMs: 2000 })
  useDebouncedRealtime({ table: 'cleanings', onChange: handleRealtime, debounceMs: 2000 })

  const goto = useCallback((tab, filter) => {
    const url = filter ? `/admin?tab=${tab}&filter=${filter}` : `/admin?tab=${tab}`
    navigate(url)
  }, [navigate])

  const nowLabel = useMemo(
    () => new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    [],
  )

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-center px-6">
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-foreground">Couldn't load dashboard</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4 break-words">{error}</p>
          <button
            type="button"
            onClick={() => fetchAll(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[#2d568e] hover:opacity-90"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex gap-4 min-h-0">
      <MyActivityPanel />

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1400px] space-y-6 pb-8">

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-foreground">Operations Overview</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">{nowLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => { fetchAll(true); fetchAnalytics(analyticsYear) }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-[11px] font-semibold text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 flex-shrink-0 shadow-sm"
            >
              <RefreshCw size={11} className={cn(refreshing && 'animate-spin')} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Total Bookings" value={stats.totalBookings} sub="All non-deleted" onClick={() => goto('bookings')} />
            <StatCard label="In-House Now" value={stats.inHouseBookings} sub="Currently staying" onClick={() => goto('bookings', 'in-house')} />
            <StatCard label="Upcoming" value={stats.upcomingBookings} sub="Future check-ins" onClick={() => goto('bookings', 'upcoming')} />
            <StatCard label="Unpaid Bookings" value={stats.unpaidBookingsCount} sub={stats.unpaidBookingsTotal > 0 ? `${formatMoney(stats.unpaidBookingsTotal)} outstanding` : 'No outstanding'} onClick={() => goto('bookings', 'unpaid')} />
            <StatCard label="Cleanings to Evaluate" value={stats.cleaningsToEvaluate} sub="Waiting for review" onClick={() => goto('housekeeping', 'evaluate')} />
          </div>

          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-1 bg-muted/50 rounded-full p-1">
              <button
                type="button"
                onClick={() => setAnalyticsYear((y) => y - 1)}
                className="p-1.5 rounded-full hover:bg-muted text-foreground"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[12px] font-bold tabular-nums text-foreground px-3 min-w-[60px] text-center">
                {analyticsYear}
              </span>
              <button
                type="button"
                onClick={() => setAnalyticsYear((y) => y + 1)}
                disabled={analyticsYear >= new Date().getFullYear()}
                className={cn(
                  'p-1.5 rounded-full transition-colors',
                  analyticsYear >= new Date().getFullYear() ? 'opacity-30 cursor-not-allowed' : 'hover:bg-muted text-foreground',
                )}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Section title="Bookings per month" subtitle={`${analyticsYear} · bookings starting this month`} className="min-h-[280px]">
              <BookingsChart data={analytics} loading={analyticsLoading} />
            </Section>
            <Section title="Occupancy rate" subtitle={`${analyticsYear} · nights booked ÷ nights available`} className="min-h-[280px]">
              <OccupancyChart data={analytics} loading={analyticsLoading} />
            </Section>
            <Section title="Gross revenue" subtitle={`${analyticsYear}`} className="min-h-[280px]">
              <RevenueGauge data={analytics} loading={analyticsLoading} year={analyticsYear} />
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Check-ins today" action={<ViewAll onClick={() => goto('bookings')} />} className="min-h-[260px]">
              {loading ? (
                <div className="p-3 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-9 rounded bg-muted animate-pulse" />)}</div>
              ) : todayLists.checkIns.length === 0 ? (
                <EmptyState>No check-ins today</EmptyState>
              ) : (
                todayLists.checkIns.map((b) => <BookingStripRow key={b.id} booking={b} />)
              )}
            </Section>

            <Section title="Check-outs today" action={<ViewAll onClick={() => goto('bookings')} />} className="min-h-[260px]">
              {loading ? (
                <div className="p-3 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-9 rounded bg-muted animate-pulse" />)}</div>
              ) : todayLists.checkOuts.length === 0 ? (
                <EmptyState>No check-outs today</EmptyState>
              ) : (
                todayLists.checkOuts.map((b) => <BookingStripRow key={b.id} booking={b} />)
              )}
            </Section>
          </div>

          <Section title="Contracts nearing end" subtitle={`Within ${NEARING_END_DAYS} days`} action={<ViewAll onClick={() => goto('contracts')} />} className="min-h-[260px]">
            {loading ? (
              <div className="p-3 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-9 rounded bg-muted animate-pulse" />)}</div>
            ) : contractsNearingEnd.length === 0 ? (
              <EmptyState>Nothing expiring soon</EmptyState>
            ) : (
              contractsNearingEnd.map((c) => <ContractStripRow key={c.id} contract={c} />)
            )}
          </Section>

        </div>
      </div>
    </div>
  )
}