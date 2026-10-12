// src/components/admin/dashboard/DashboardPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, ArrowRight, Inbox,
  Copy, Calendar, TrendingUp, FileText, Mail, Sparkles, Loader2,
  CheckCircle2, AlertTriangle, CalendarRange, Home, CalendarClock,
  Wallet, ClipboardCheck, LogIn, LogOut, Clock, ArrowUpRight, ArrowDownRight,
  Table2, BarChart3, ExternalLink, CalendarDays, UserRound,
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
import { StatStrip, StatTile } from '@/components/admin/_shared/StatStrip'
import { StatusTabs, PeriodStepper } from '@/components/admin/_shared/StatusTabs'

const NEARING_END_DAYS = 60
const COMING_UP_DAYS = 7
const LIST_LIMIT = 8
const MY_LIST_LIMIT = 12

// Chart marks use the logo blue (the --brand token; lighter in dark mode).
const CHART_VARS = '[--chart:var(--brand)]'

// Two-thirds / one-third rows; the right card's list scrolls inside it.
const DASH_ROW = 'grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

function backupTimeAgo(iso) {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function greetingFor(date) {
  const hour = Number(date.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function copyText(text, okMessage) {
  navigator.clipboard.writeText(text || '').then(
    () => toast.success(okMessage),
    () => toast.error('Failed to copy'),
  )
}

function buildBookingContextItems(booking, navigate) {
  const openBooking = () => navigate(`/admin?tab=bookings&booking=${booking.id}`)
  return [
    { label: 'See in Bookings', icon: Calendar, onSelect: openBooking },
    { separator: true },
    {
      label: 'Copy booking code',
      icon: Copy,
      hint: booking.booking_code,
      onSelect: () => copyText(booking.booking_code, 'Booking code copied'),
    },
    {
      label: 'Copy guest email',
      icon: Mail,
      disabled: !booking.guest_email,
      onSelect: () => copyText(booking.guest_email, 'Email copied'),
    },
    { separator: true },
    {
      label: 'See in Housekeeping',
      icon: Sparkles,
      onSelect: () => navigate(`/admin?tab=housekeeping&fromBooking=${booking.id}`),
    },
  ]
}

// ─────────────────────────────────────────────────────────────
// Analytics shaping
// ─────────────────────────────────────────────────────────────

// RPC rows → 12 months, Jan..Dec, with numbers (missing months are zero).
// Months that haven't happened yet are `future`, with null values, so charts
// leave them blank instead of plotting a drop to zero.
function toMonthly(rows, year) {
  const now = new Date()
  const lastMonth = year === now.getUTCFullYear() ? now.getUTCMonth() : year > now.getUTCFullYear() ? -1 : 11
  const out = MONTHS.map((label, i) => ({
    month: i,
    label,
    future: i > lastMonth,
    bookings: i > lastMonth ? null : 0,
    occupancy: i > lastMonth ? null : 0,
    revenue: i > lastMonth ? null : 0,
  }))
  for (const r of rows || []) {
    const i = new Date(r.month_start).getUTCMonth()
    if (!Number.isFinite(i) || !out[i] || out[i].future) continue
    const bookings = Number(r.bookings_count || 0)
    out[i] = {
      ...out[i],
      bookings,
      occupancy: bookings > 0 ? Number(r.occupancy_pct || 0) : 0,
      revenue: Number(r.revenue || 0),
    }
  }
  return out
}

// Year-to-date when looking at the current year, else the full year — and the
// same span of the previous year, so comparisons are like-for-like.
function summarize(current, previous, year) {
  const now = new Date()
  const lastMonth = year === now.getUTCFullYear() ? now.getUTCMonth() : 11
  const span = (rows) => rows.filter((r) => r.month <= lastMonth)
  const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0)
  const avg = (rows, key) => (rows.length ? sum(rows, key) / rows.length : 0)

  const cur = span(current)
  const prev = span(previous)
  const peak = cur.reduce((best, r) => (r.revenue > (best?.revenue ?? 0) ? r : best), null)

  const change = (a, b) => (b > 0 ? (a - b) / b : null)
  return {
    partial: lastMonth < 11,
    revenue: sum(cur, 'revenue'),
    revenueChange: change(sum(cur, 'revenue'), sum(prev, 'revenue')),
    bookings: sum(cur, 'bookings'),
    bookingsChange: change(sum(cur, 'bookings'), sum(prev, 'bookings')),
    occupancy: avg(cur, 'occupancy'),
    occupancyChangePts: prev.some((r) => r.bookings > 0) ? avg(cur, 'occupancy') - avg(prev, 'occupancy') : null,
    peak,
  }
}

const METRICS = {
  revenue: {
    label: 'Revenue',
    note: 'Gross booking revenue by month',
    format: formatMoney,
    tick: formatMoneyCompact,
  },
  bookings: {
    label: 'Bookings',
    note: 'Bookings starting each month',
    format: (v) => v.toLocaleString('en-PH'),
    tick: (v) => v.toLocaleString('en-PH'),
  },
  occupancy: {
    label: 'Occupancy',
    note: 'Nights booked ÷ nights available',
    format: (v) => `${Math.round(v)}%`,
    tick: (v) => `${v}%`,
  },
}

// ─────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────

function Card({ className, children }) {
  return (
    <section className={cn('rounded-md bg-card border border-border shadow-sm overflow-hidden flex flex-col', className)}>
      {children}
    </section>
  )
}

function CardHeader({ icon: Icon, title, subtitle, count, action }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon size={18} strokeWidth={1.75} className="text-foreground flex-shrink-0" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-foreground truncate">{title}</h3>
            {count != null && (
              <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md border border-border text-foreground">
                {count}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function ViewAll({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-1 text-[12px] font-medium text-foreground hover:text-foreground transition-colors flex-shrink-0"
    >
      View all <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function EmptyState({ icon: Icon = Inbox, title, hint }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center">
      <Icon size={22} strokeWidth={1.5} className="text-foreground mb-2" />
      <p className="text-[12px] font-medium text-foreground">{title}</p>
      {hint && <p className="text-[11px] text-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function RowsSkeleton({ rows = 4 }) {
  return (
    <div className="p-4 space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-1/3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Status in font colour. An icon, when given, takes the same colour.
const STATUS_TONES = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  critical: 'text-red-600 dark:text-red-400',
  info: 'text-blue-600 dark:text-blue-400',
  muted: 'text-foreground',
}

function StatusLabel({ tone, icon: Icon, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap', STATUS_TONES[tone])}>
      {Icon && <Icon size={13} strokeWidth={2} className="flex-shrink-0" />}
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Today — check-ins and check-outs
// ─────────────────────────────────────────────────────────────

function BookingRow({ booking }) {
  const navigate = useNavigate()
  const openBooking = () => navigate(`/admin?tab=bookings&booking=${booking.id}`)
  const balance = Number(booking.balance || 0)
  const paid = balance <= 0

  return (
    <ContextMenu items={buildBookingContextItems(booking, navigate)}>
      <button
        type="button"
        onClick={openBooking}
        className="w-full text-left px-5 py-3 flex items-center gap-3 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
      >
        <div className="w-9 h-9 rounded-full bg-card ring-1 ring-border text-foreground flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
          {initialsOf(booking.guest_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate">{booking.guest_name || '—'}</p>
          <p className="text-[11px] text-foreground truncate mt-0.5">
            <span className="font-medium text-foreground">{booking.units?.unit_code || '—'}</span>
            {' · '}{booking.units?.building || '—'}
            {booking.booking_code && <span className="ml-2 font-mono">{booking.booking_code}</span>}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          {paid ? (
            <StatusLabel tone="good">Paid</StatusLabel>
          ) : (
            <StatusLabel tone="warning">{formatMoney(balance)} due</StatusLabel>
          )}
          <p className="text-[10px] text-foreground tabular-nums mt-1">
            {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
          </p>
        </div>
      </button>
    </ContextMenu>
  )
}

function SectionLabel({ icon: Icon, title, count }) {
  return (
    <div className="sticky top-0 z-[1] flex items-center gap-2 px-5 h-8 bg-card border-b border-border text-[11px] font-semibold uppercase tracking-wider text-foreground">
      {Icon && <Icon size={13} strokeWidth={2} className="text-foreground" />}
      <span>{title}</span>
      {count != null && <span className="tabular-nums font-medium">{count}</span>}
    </div>
  )
}

function TodaySection({ icon, title, emptyText, rows }) {
  return (
    <div>
      <SectionLabel icon={icon} title={title} count={rows.length} />
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-[12px] text-foreground border-b border-border">{emptyText}</p>
      ) : (
        <div className="border-b border-border">{rows.map((b) => <BookingRow key={b.id} booking={b} />)}</div>
      )}
    </div>
  )
}

// Arrivals, departures and the week ahead in one card. On wide screens the list scrolls inside
// the card, so the row height comes from the chart beside it.
function TodayCard({ checkIns, checkOuts, comingUp, loading, onViewAll }) {
  return (
    <Card>
      <CardHeader
        icon={CalendarDays}
        title="Today"
        subtitle={`Check-ins, check-outs and the next ${COMING_UP_DAYS} days`}
        action={<ViewAll onClick={onViewAll} />}
      />
      <div className="relative flex-1 min-h-[260px]">
        <div className="xl:absolute xl:inset-0 overflow-y-auto">
          {loading ? (
            <RowsSkeleton />
          ) : (
            <>
              <TodaySection icon={LogIn} title="Arriving" emptyText="No check-ins today." rows={checkIns} />
              <TodaySection icon={LogOut} title="Leaving" emptyText="No check-outs today." rows={checkOuts} />
              <TodaySection icon={CalendarClock} title={`Next ${COMING_UP_DAYS} days`} emptyText="No arrivals booked this week." rows={comingUp} />
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Performance — yearly analytics
// ─────────────────────────────────────────────────────────────

function Delta({ value, unit = '%', vsLabel }) {
  if (value == null || !Number.isFinite(value)) {
    return <p className="text-[11px] text-foreground mt-1.5">No {vsLabel} data to compare</p>
  }
  const shown = unit === 'pts' ? Math.round(value) : Math.round(value * 100)
  const up = shown > 0
  const flat = shown === 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <p className="text-[11px] mt-1.5 flex items-center gap-1 text-foreground">
      {flat ? (
        <span className="font-semibold text-foreground">No change</span>
      ) : (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 font-semibold',
            'text-foreground',
          )}
        >
          <Icon size={13} strokeWidth={2.25} />
          {up ? '+' : '−'}{Math.abs(shown)}{unit === 'pts' ? ' pts' : '%'}
        </span>
      )}
      <span>vs {vsLabel}</span>
    </p>
  )
}

function SummaryStat({ label, value, children, hero = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-foreground">{label}</p>
      <p className={cn('font-semibold text-foreground tracking-tight leading-none mt-1.5', hero ? 'text-[34px]' : 'text-[24px]')}>
        {value}
      </p>
      {children}
    </div>
  )
}

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload || payload.length === 0 || payload[0].value == null) return null
  const m = METRICS[metric]
  return (
    <div className="rounded-md border border-border bg-popover shadow-lg px-3 py-2">
      <p className="text-[14px] font-semibold tabular-nums text-foreground">{m.format(payload[0].value)}</p>
      <p className="text-[11px] text-foreground mt-0.5 flex items-center gap-1.5">
        <span className="inline-block w-3 h-[2px] rounded-full bg-[var(--chart)]" />
        {m.label} · {label}
      </p>
    </div>
  )
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--foreground)' }

function PerformanceChart({ data, metric }) {
  const m = METRICS[metric]
  const common = {
    data,
    margin: { top: 8, right: 8, left: 0, bottom: 0 },
  }
  const axes = (
    <>
      <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
      <XAxis
        dataKey="label"
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        interval={0}
        dy={6}
        padding={metric === 'occupancy' ? { left: 14, right: 14 } : undefined}
      />
      <YAxis
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={false}
        width={52}
        allowDecimals={false}
        tickFormatter={m.tick}
        domain={metric === 'occupancy' ? [0, 100] : [0, 'auto']}
      />
    </>
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      {metric === 'occupancy' ? (
        <AreaChart {...common}>
          <defs>
            <linearGradient id="dash-occupancy-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.14} />
              <stop offset="100%" stopColor="var(--chart)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {axes}
          <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }} />
          <Area
            type="monotone"
            dataKey="occupancy"
            stroke="var(--chart)"
            strokeWidth={2}
            fill="url(#dash-occupancy-wash)"
            dot={{ r: 4, fill: 'var(--chart)', stroke: 'var(--card)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: 'var(--chart)', stroke: 'var(--card)', strokeWidth: 2 }}
          />
        </AreaChart>
      ) : (
        <BarChart {...common} barCategoryGap="30%">
          {axes}
          <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
          <Bar dataKey={metric} fill="var(--chart)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      )}
    </ResponsiveContainer>
  )
}

// The table twin of the chart — every value readable without hovering.
function PerformanceTable({ data }) {
  const totals = data.reduce(
    (t, r) => ({ bookings: t.bookings + (r.bookings ?? 0), revenue: t.revenue + (r.revenue ?? 0) }),
    { bookings: 0, revenue: 0 },
  )
  const cell = (r, value) => (r.future ? '—' : value)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-foreground border-b border-border">
            <th className="font-medium py-2 pr-4">Month</th>
            <th className="font-medium py-2 pr-4 text-right">Bookings</th>
            <th className="font-medium py-2 pr-4 text-right">Occupancy</th>
            <th className="font-medium py-2 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {data.map((r) => (
            <tr key={r.month} className={cn('border-b border-border/60 last:border-0', r.future ? 'text-foreground' : 'text-foreground')}>
              <td className="py-1.5 pr-4">{r.label}</td>
              <td className="py-1.5 pr-4 text-right">{cell(r, r.bookings)}</td>
              <td className="py-1.5 pr-4 text-right">{cell(r, `${Math.round(r.occupancy)}%`)}</td>
              <td className="py-1.5 text-right">{cell(r, formatMoney(r.revenue))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="tabular-nums">
          <tr className="border-t border-border font-semibold text-foreground">
            <td className="py-2 pr-4">Total</td>
            <td className="py-2 pr-4 text-right">{totals.bookings}</td>
            <td className="py-2 pr-4 text-right">—</td>
            <td className="py-2 text-right">{formatMoney(totals.revenue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function PerformanceCard({ year, setYear, analytics, loading }) {
  const [metric, setMetric] = useState('revenue')
  const [view, setView] = useState('chart')
  const currentYear = new Date().getFullYear()

  const current = useMemo(() => toMonthly(analytics.current, year), [analytics.current, year])
  const previous = useMemo(() => toMonthly(analytics.previous, year - 1), [analytics.previous, year])
  const summary = useMemo(() => summarize(current, previous, year), [current, previous, year])
  const vsLabel = summary.partial ? `${year - 1} same period` : `${year - 1}`
  const hasData = (analytics.current || []).length > 0
  // First load shows a skeleton; later refetches hold the old render, dimmed.
  const firstLoad = loading && !hasData

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <TrendingUp size={18} strokeWidth={1.75} className="text-foreground flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground">Performance</h3>
            <p className="text-[11px] text-foreground mt-0.5">
              {summary.partial ? `${year} year to date` : `${year} full year`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusTabs
            tabs={Object.entries(METRICS).map(([id, m]) => ({ id, label: m.label }))}
            value={metric}
            onChange={setMetric}
            label="Chart metric"
          />
          <PeriodStepper
            label={year}
            onPrev={() => setYear((y) => y - 1)}
            onNext={() => setYear((y) => y + 1)}
            canNext={year < currentYear}
            prevLabel="Previous year"
            nextLabel="Next year"
          />
          <button
            type="button"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-[12px] font-medium text-foreground hover:text-foreground"
            aria-pressed={view === 'table'}
          >
            {view === 'chart' ? <Table2 size={14} /> : <BarChart3 size={14} />}
            {view === 'chart' ? 'Table' : 'Chart'}
          </button>
        </div>
      </div>

      {firstLoad ? (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />)}
          </div>
          <div className="h-[260px] rounded-md bg-muted/60 animate-pulse" />
        </div>
      ) : (
        <div className={cn('p-5 transition-opacity', loading && 'opacity-50')}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5 pb-5 border-b border-border">
            <SummaryStat label="Revenue" value={formatMoney(summary.revenue)} hero>
              <Delta value={summary.revenueChange} vsLabel={vsLabel} />
            </SummaryStat>
            <SummaryStat label="Bookings" value={summary.bookings.toLocaleString('en-PH')}>
              <Delta value={summary.bookingsChange} vsLabel={vsLabel} />
            </SummaryStat>
            <SummaryStat label="Average occupancy" value={`${Math.round(summary.occupancy)}%`}>
              <Delta value={summary.occupancyChangePts} unit="pts" vsLabel={vsLabel} />
            </SummaryStat>
            <SummaryStat
              label="Best month"
              value={summary.peak ? summary.peak.label : '—'}
            >
              <p className="text-[11px] text-foreground mt-1.5">
                {summary.peak ? `${formatMoney(summary.peak.revenue)} revenue` : 'No revenue yet'}
              </p>
            </SummaryStat>
          </div>

          <div className="pt-5">
            {view === 'chart' ? (
              <p className="text-[12px] font-medium text-foreground">
                {METRICS[metric].label} by month
                <span className="font-normal text-foreground"> · {METRICS[metric].note}</span>
              </p>
            ) : (
              <p className="text-[12px] font-medium text-foreground">
                Monthly breakdown
                <span className="font-normal text-foreground"> · {year}</span>
              </p>
            )}
            {view === 'chart' ? (
              <div className="h-[260px] mt-3 -ml-2 text-foreground">
                <PerformanceChart data={current} metric={metric} />
              </div>
            ) : (
              <div className="mt-3">
                <PerformanceTable data={current} />
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Contracts nearing end
// ─────────────────────────────────────────────────────────────

const CONTRACT_COLS = 'grid grid-cols-[1.4fr_1.4fr_0.9fr_0.9fr_auto] gap-4 items-center'

function ContractRow({ contract }) {
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
      onSelect: () => copyText(contract.contract_code, 'Contract code copied'),
    },
  ]

  const days = daysUntil(contract.expiry_date)
  const left = days == null ? '—' : days === 0 ? 'Ends today' : days === 1 ? '1 day' : `${days} days`

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={openContract}
        className={cn(CONTRACT_COLS, 'w-full text-left px-5 py-3 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer')}
      >
        <div className="min-w-0">
          <span className="font-mono text-[12px] font-semibold text-foreground truncate block">{contract.contract_code || '—'}</span>
          <span className="text-[11px] text-foreground truncate block mt-0.5">{contract.owners?.name || 'No owner'}</span>
        </div>
        <div className="min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate block">{contract.units?.unit_code || '—'}</span>
          <span className="text-[11px] text-foreground truncate block mt-0.5">{contract.units?.building || '—'}</span>
        </div>
        <span className="text-[12px] tabular-nums text-foreground truncate">{formatDateShort(contract.effective_date)}</span>
        <span className="text-[12px] tabular-nums text-foreground truncate">{formatDateShort(contract.expiry_date)}</span>
        <div className="flex justify-end min-w-[96px]">
          {days != null && days <= 7 ? (
            <StatusLabel tone="critical">{left}</StatusLabel>
          ) : days != null && days <= 30 ? (
            <StatusLabel tone="warning">{left}</StatusLabel>
          ) : (
            <StatusLabel tone="muted">{left}</StatusLabel>
          )}
        </div>
      </button>
    </ContextMenu>
  )
}

function ContractsCard({ contracts, loading, onViewAll, className }) {
  return (
    <Card className={className}>
      <CardHeader
        icon={CalendarClock}
        title="Contracts nearing end"
        subtitle={`Ending within ${NEARING_END_DAYS} days`}
        count={loading ? null : contracts.length}
        action={<ViewAll onClick={onViewAll} />}
      />
      {loading ? (
        <RowsSkeleton rows={3} />
      ) : contracts.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nothing ending soon" hint={`No contracts end in the next ${NEARING_END_DAYS} days.`} />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={cn(CONTRACT_COLS, 'px-5 py-2.5 border-b border-border text-[11px] font-semibold text-foreground')}>
              <span>Contract</span>
              <span>Unit</span>
              <span>Started</span>
              <span>Ends</span>
              <span className="text-right min-w-[96px]">Time left</span>
            </div>
            {contracts.map((c) => <ContractRow key={c.id} contract={c} />)}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Personal activity — only for admins linked to a staff role
// ─────────────────────────────────────────────────────────────

function ActivityRow({ title, amount, meta, dates, onOpen, contextItems }) {
  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={onOpen}
        className="relative w-full text-left px-5 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer overflow-hidden"
      >
        <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-foreground" />
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate flex-1">{title}</span>
          <span className="text-[11px] text-foreground tabular-nums flex-shrink-0">{amount}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-foreground">
          <span className="truncate">{meta}</span>
          <span className="text-[10px] tabular-nums flex-shrink-0">{dates}</span>
        </div>
      </button>
    </ContextMenu>
  )
}

function ActivitySection({ title, items, emptyText, renderRow }) {
  return (
    <div>
      <SectionLabel title={title} count={items.length} />
      {items.length === 0 ? (
        <p className="px-5 py-4 text-[12px] text-foreground border-b border-border">{emptyText}</p>
      ) : (
        <div className="border-b border-border">{items.map(renderRow)}</div>
      )}
    </div>
  )
}

// Looks the signed-in email up in the staff tables, then loads that person's
// own bookings, cleanings and referrals.
function useMyActivity(user) {
  const [state, setState] = useState({
    loading: true,
    matched: { specialist: null, affiliate: null, housekeeper: null },
    bookings: [],
    cleanings: [],
    referrals: [],
  })

  useEffect(() => {
    if (!user?.email) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    let cancelled = false
    const email = user.email.toLowerCase()

    async function load() {
      try {
        const [specRes, affRes, hkRes] = await Promise.all([
          supabase.from('specialists').select('code, name, photo_url').ilike('email', email).maybeSingle(),
          supabase.from('affiliates').select('code, name, photo_url').ilike('email', email).maybeSingle(),
          supabase.from('housekeepers').select('id, name, photo_url').ilike('email', email).maybeSingle(),
        ])
        if (cancelled) return

        const matched = {
          specialist: specRes.data || null,
          affiliate: affRes.data || null,
          housekeeper: hkRes.data || null,
        }

        const [bookings, cleanings, referrals] = await Promise.all([
          matched.specialist?.code
            ? supabase.from('bookings')
                .select(`id, booking_code, guest_name, guest_email, check_in, check_out, total_amount, booker_commission, payment_status, completed_at, units:unit_id ( id, unit_code, building )`)
                .eq('booker_code', matched.specialist.code)
                .is('deleted_at', null)
                .order('check_in', { ascending: false })
                .limit(MY_LIST_LIMIT)
                .then((r) => r.data || [])
            : [],
          matched.housekeeper?.id
            ? supabase.from('cleanings')
                .select(`id, booking_id, cleaning_code, scheduled_date, status, type, payment_amount, units:unit_id ( id, unit_code, building )`)
                .eq('housekeeper_id', matched.housekeeper.id)
                .order('scheduled_date', { ascending: false })
                .limit(MY_LIST_LIMIT)
                .then((r) => r.data || [])
            : [],
          matched.affiliate?.code
            ? supabase.from('bookings')
                .select(`id, booking_code, guest_name, guest_email, check_in, check_out, total_amount, affiliate_commission, payment_status, completed_at, units:unit_id ( id, unit_code, building )`)
                .eq('affiliate_code', matched.affiliate.code)
                .is('deleted_at', null)
                .order('check_in', { ascending: false })
                .limit(MY_LIST_LIMIT)
                .then((r) => r.data || [])
            : [],
        ])
        if (cancelled) return
        setState({ loading: false, matched, bookings, cleanings, referrals })
      } catch (err) {
        console.error('My activity load failed:', err)
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
      }
    }

    load()
    return () => { cancelled = true }
  }, [user?.id, user?.email])

  const { specialist, affiliate, housekeeper } = state.matched
  return { ...state, linked: !!(specialist || affiliate || housekeeper) }
}

function MyActivityCard({ activity }) {
  const navigate = useNavigate()
  const { matched, bookings, cleanings, referrals } = activity

  const roles = [
    matched.specialist && 'Specialist',
    matched.affiliate && 'Affiliate',
    matched.housekeeper && 'Housekeeper',
  ].filter(Boolean)

  const goBooking = (id) => navigate(`/admin?tab=bookings&booking=${id}`)
  const goCleaning = (id) => navigate(`/admin?tab=housekeeping&cleaning=${id}`)

  const cleaningContextItems = (c) => [
    { label: 'See in Housekeeping', icon: Sparkles, onSelect: () => goCleaning(c.id) },
    { separator: true },
    { label: 'Copy cleaning code', icon: Copy, hint: c.cleaning_code, onSelect: () => copyText(c.cleaning_code, 'Cleaning code copied') },
    { separator: true },
    {
      label: 'See in Bookings',
      icon: Calendar,
      disabled: !c.booking_id,
      onSelect: () => c.booking_id && goBooking(c.booking_id),
    },
  ]

  return (
    <Card>
      <CardHeader icon={UserRound} title="My activity" subtitle={`Linked as ${roles.join(' · ')}`} />
      <div className="relative flex-1 min-h-[260px]">
        <div className="xl:absolute xl:inset-0 overflow-y-auto">
          {matched.specialist && (
            <ActivitySection
              title="My bookings"
              items={bookings}
              emptyText="No bookings yet."
              renderRow={(b) => (
                <ActivityRow
                  key={b.id}
                  title={b.guest_name || '—'}
                  amount={formatMoney(b.total_amount)}
                  meta={`${b.booking_code || '—'} · ${b.units?.unit_code || '—'}`}
                  dates={`${formatDateShort(b.check_in)} → ${formatDateShort(b.check_out)}`}
                  onOpen={() => goBooking(b.id)}
                  contextItems={buildBookingContextItems(b, navigate)}
                />
              )}
            />
          )}

          {matched.housekeeper && (
            <ActivitySection
              title="My cleanings"
              items={cleanings}
              emptyText="No cleanings yet."
              renderRow={(c) => (
                <ActivityRow
                  key={c.id}
                  title={<span className="font-mono">{c.cleaning_code || '—'}</span>}
                  amount={formatMoney(c.payment_amount || 0)}
                  meta={<span className="capitalize">{`${c.units?.unit_code || '—'} · ${c.type || '—'} · ${c.status || '—'}`}</span>}
                  dates={formatDateShort(c.scheduled_date)}
                  onOpen={() => goCleaning(c.id)}
                  contextItems={cleaningContextItems(c)}
                />
              )}
            />
          )}

          {matched.affiliate && (
            <ActivitySection
              title="My referrals"
              items={referrals}
              emptyText="No referrals yet."
              renderRow={(b) => (
                <ActivityRow
                  key={b.id}
                  title={b.guest_name || '—'}
                  amount={formatMoney(b.affiliate_commission || 0)}
                  meta={`${b.booking_code || '—'} · ${b.units?.unit_code || '—'}`}
                  dates={`${formatDateShort(b.check_in)} → ${formatDateShort(b.check_out)}`}
                  onOpen={() => goBooking(b.id)}
                  contextItems={buildBookingContextItems(b, navigate)}
                />
              )}
            />
          )}
        </div>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const activity = useMyActivity(user)
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

  const [todayLists, setTodayLists] = useState({ checkIns: [], checkOuts: [], comingUp: [] })
  const [contractsNearingEnd, setContractsNearingEnd] = useState([])
  const [analytics, setAnalytics] = useState({ current: [], previous: [] })
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsYear, setAnalyticsYear] = useState(() => new Date().getFullYear())

  const [backupLatest, setBackupLatest] = useState(null)
  const [backupLoading, setBackupLoading] = useState(true)
  const [backupRunning, setBackupRunning] = useState(false)

  const hasLoadedOnce = useRef(false)

  // The selected year and the one before it, for like-for-like comparisons.
  const fetchAnalytics = useCallback(async (year, signal) => {
    setAnalyticsLoading(true)
    try {
      const [cur, prev] = await Promise.all([
        supabase.rpc('dashboard_analytics_year', { p_year: year }),
        supabase.rpc('dashboard_analytics_year', { p_year: year - 1 }),
      ])
      if (signal?.aborted) return
      if (cur.error) throw cur.error
      if (prev.error) console.error('Previous-year analytics failed:', prev.error)
      setAnalytics({ current: cur.data || [], previous: prev.data || [] })
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Analytics load failed:', err)
      setAnalytics({ current: [], previous: [] })
    } finally {
      if (!signal?.aborted) setAnalyticsLoading(false)
    }
  }, [])

  const fetchAll = useCallback(async (isRefresh = false, signal) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    const today = todayISO()
    const soon = isoDatePlusDays(NEARING_END_DAYS)
    const weekAhead = isoDatePlusDays(COMING_UP_DAYS)

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
        comingUpRes,
      ] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).is('deleted_at', null).is('completed_at', null).lte('check_in', today).gte('check_out', today),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).is('deleted_at', null).is('completed_at', null).gt('check_in', today),
        supabase.from('bookings').select('id, balance').is('deleted_at', null).is('completed_at', null).gt('balance', 0),
        supabase.from('cleanings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('bookings').select(`id, booking_code, guest_name, guest_email, check_in, check_out, balance, units:unit_id ( id, unit_code, building )`).is('deleted_at', null).eq('check_in', today).order('check_in', { ascending: true }).limit(LIST_LIMIT),
        supabase.from('bookings').select(`id, booking_code, guest_name, guest_email, check_in, check_out, balance, units:unit_id ( id, unit_code, building )`).is('deleted_at', null).eq('check_out', today).order('check_out', { ascending: true }).limit(LIST_LIMIT),
        supabase.from('contracts').select(`id, contract_code, effective_date, expiry_date, units:unit_id ( id, unit_code, building ), owners:owner_id ( id, name )`).gte('expiry_date', today).lte('expiry_date', soon).order('expiry_date', { ascending: true }).limit(LIST_LIMIT),
        supabase.from('bookings').select(`id, booking_code, guest_name, guest_email, check_in, check_out, balance, units:unit_id ( id, unit_code, building )`).is('deleted_at', null).is('completed_at', null).gt('check_in', today).lte('check_in', weekAhead).order('check_in', { ascending: true }).limit(LIST_LIMIT),
      ])

      if (signal?.aborted) return

      const firstErr = [totalRes, inHouseRes, upcomingRes, unpaidListRes, cleaningsToEvaluateRes, checkInsRes, checkOutsRes, nearingEndRes, comingUpRes].find((r) => r.error)
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
        comingUp: comingUpRes.data || [],
      })

      setContractsNearingEnd(nearingEndRes.data || [])
      hasLoadedOnce.current = true
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Dashboard load failed:', err)
      setError(err?.message || 'Failed to load dashboard')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  const fetchBackupLatest = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('backup_runs')
      .select('id, started_at, finished_at, status, row_counts, duration_ms, error_message, trigger_source')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (err) console.error('backup_runs fetch failed:', err)
    else setBackupLatest(data)
    setBackupLoading(false)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchAll(false, ac.signal)
    fetchBackupLatest()
    return () => ac.abort()
  }, [fetchAll, fetchBackupLatest])

  useEffect(() => {
    const ac = new AbortController()
    fetchAnalytics(analyticsYear, ac.signal)
    return () => ac.abort()
  }, [fetchAnalytics, analyticsYear])

  useEffect(() => {
    const t = setInterval(fetchBackupLatest, 60_000)
    return () => clearInterval(t)
  }, [fetchBackupLatest])

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

  const now = useMemo(() => new Date(), [])
  const firstName = (user?.user_metadata?.full_name || user?.email?.split('@')[0] || '').split(' ')[0]

  // Without an ID the link would point at Google's "file can't be opened" page, so it's hidden instead.
  const sheetUrl = useMemo(() => {
    const id = import.meta.env.VITE_BACKUP_SHEET_ID?.trim()
    return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null
  }, [])

  const runBackup = useCallback(async () => {
    if (backupRunning) return
    setBackupRunning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-to-sheets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: '{}',
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      toast.success(`Backup complete · ${body.duration_ms}ms`)
      await fetchBackupLatest()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Backup failed')
    } finally {
      setBackupRunning(false)
    }
  }, [backupRunning, fetchBackupLatest])

  const backupTotalRows = backupLatest?.row_counts
    ? Object.values(backupLatest.row_counts).reduce((s, v) => s + (Number(v) || 0), 0)
    : 0

  const backupStatus = backupLoading
    ? { tone: 'muted', icon: Loader2, label: 'Checking…' }
    : backupLatest?.status === 'success'
      ? { tone: 'good', icon: CheckCircle2, label: `Backed up ${backupTimeAgo(backupLatest.started_at)}` }
      : backupLatest?.status === 'partial'
        ? { tone: 'warning', icon: AlertTriangle, label: `Partial backup ${backupTimeAgo(backupLatest.started_at)}` }
        : backupLatest?.status === 'failed'
          ? { tone: 'critical', icon: AlertTriangle, label: `Backup failed ${backupTimeAgo(backupLatest.started_at)}` }
          : { tone: 'muted', icon: FileText, label: 'No backups yet' }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-center px-6">
        <div className="max-w-sm">
          <AlertTriangle size={22} strokeWidth={1.75} className="mx-auto text-foreground mb-3" />
          <p className="text-sm font-semibold text-foreground">Couldn't load the dashboard</p>
          <p className="text-xs text-foreground mt-1 mb-4 break-words">{error}</p>
          <button
            type="button"
            onClick={() => fetchAll(false)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white bg-brand-solid hover:bg-brand-solid/90"
          >
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      </div>
    )
  }

  const unpaidAttention = stats.unpaidBookingsCount > 0
  const cleaningsAttention = stats.cleaningsToEvaluate > 0

  // One line under the greeting that says what today needs.
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const listCount = (rows) => (rows.length >= LIST_LIMIT ? `${LIST_LIMIT}+` : rows.length)
  const todaySummary = loading
    ? 'Loading today’s overview…'
    : [
        todayLists.checkIns.length + todayLists.checkOuts.length === 0
          ? 'No check-ins or check-outs today'
          : `${listCount(todayLists.checkIns)} arriving and ${listCount(todayLists.checkOuts)} leaving today`,
        unpaidAttention && `${plural(stats.unpaidBookingsCount, 'unpaid booking', 'unpaid bookings')} (${formatMoneyCompact(stats.unpaidBookingsTotal)})`,
        cleaningsAttention && `${plural(stats.cleaningsToEvaluate, 'cleaning', 'cleanings')} to review`,
      ].filter(Boolean).join(' · ')

  return (
    <div className={cn('h-full overflow-y-auto', CHART_VARS)}>
      <div className="px-6 py-5 md:px-8 md:py-6 max-w-[1600px] mx-auto space-y-4 pb-10">

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">
              {greetingFor(now)}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-[12.5px] text-foreground mt-1 truncate">{todaySummary}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-2 h-8 pl-3 pr-1 rounded-md border border-border bg-card shadow-sm"
              title={backupLatest?.started_at ? `${backupTotalRows.toLocaleString()} rows in the last backup` : undefined}
            >
              <StatusLabel tone={backupStatus.tone} icon={backupStatus.icon}>{backupStatus.label}</StatusLabel>
              <span className="w-px h-4 bg-border" />
              {sheetUrl && (
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-foreground hover:text-foreground hover:bg-muted/60"
                  title="Open the Google Sheets backup"
                >
                  Sheets <ExternalLink size={11} />
                </a>
              )}
              <button
                type="button"
                onClick={runBackup}
                disabled={backupRunning}
                className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold text-white bg-brand-solid hover:bg-brand-solid/90 disabled:opacity-50"
                title="Run a backup now"
              >
                {backupRunning ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Back up now
              </button>
            </div>

            <button
              type="button"
              onClick={() => { fetchAll(true); fetchAnalytics(analyticsYear) }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-[12px] font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* KPIs */}
        <StatStrip>
          <StatTile icon={CalendarRange} label="Total bookings" value={stats.totalBookings.toLocaleString('en-PH')} sub="All active records" loading={loading} onClick={() => goto('bookings')} />
          <StatTile icon={Home} label="In-house now" value={stats.inHouseBookings} sub="Guests staying now" loading={loading} onClick={() => goto('bookings', 'in-house')} />
          <StatTile icon={CalendarClock} label="Upcoming" value={stats.upcomingBookings} sub="Future check-ins" loading={loading} onClick={() => goto('bookings', 'upcoming')} />
          <StatTile
            icon={Wallet}
            label="Unpaid bookings"
            value={stats.unpaidBookingsCount}
            sub={unpaidAttention ? `${formatMoneyCompact(stats.unpaidBookingsTotal)} outstanding` : 'Nothing outstanding'}
            attention={!loading && unpaidAttention}
            loading={loading}
            onClick={() => goto('bookings', 'unpaid')}
          />
          <StatTile
            icon={ClipboardCheck}
            label="Cleaning reviews"
            value={stats.cleaningsToEvaluate}
            sub={cleaningsAttention ? 'Waiting for review' : 'All reviewed'}
            attention={!loading && cleaningsAttention}
            loading={loading}
            onClick={() => goto('housekeeping', 'evaluate')}
            className="col-span-2 sm:col-span-1"
          />
        </StatStrip>

        {/* Performance beside today's movements */}
        <div className={DASH_ROW}>
          <PerformanceCard
            year={analyticsYear}
            setYear={setAnalyticsYear}
            analytics={analytics}
            loading={analyticsLoading}
          />
          <TodayCard
            checkIns={todayLists.checkIns}
            checkOuts={todayLists.checkOuts}
            comingUp={todayLists.comingUp}
            loading={loading}
            onViewAll={() => goto('bookings')}
          />
        </div>

        {/* Contracts, plus personal activity when this admin is also staff */}
        <div className={DASH_ROW}>
          <ContractsCard
            className={activity.linked ? undefined : 'xl:col-span-2'}
            contracts={contractsNearingEnd}
            loading={loading}
            onViewAll={() => goto('contracts')}
          />
          {activity.linked && <MyActivityCard activity={activity} />}
        </div>
      </div>
    </div>
  )
}
