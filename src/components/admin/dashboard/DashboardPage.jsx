// src/components/admin/dashboard/DashboardPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, ArrowRight, Inbox, ChevronLeft, ChevronRight,
  Copy, Calendar, TrendingUp, FileText, Mail, Sparkles, Loader2,
  CheckCircle2, AlertTriangle, CalendarRange, Home, CalendarClock,
  Wallet, ClipboardCheck, LogIn, LogOut, Clock, ArrowUpRight, ArrowDownRight,
  Table2, BarChart3, ExternalLink,
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

// Monochrome, to match the CRM: near-black marks on the white card,
// light grey on the dark card.
const CHART_VARS = '[--chart:#1f2937] dark:[--chart:#e5e7eb]'

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
              <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                {count}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
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
      className="group inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
    >
      View all <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function EmptyState({ icon: Icon = Inbox, title, hint }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center">
      <Icon size={22} strokeWidth={1.5} className="text-muted-foreground/50 mb-2" />
      <p className="text-[12px] font-medium text-foreground">{title}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
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

// Status = icon + label, never colour alone.
function StatusLabel({ tone, icon: Icon, children }) {
  const toneClass = {
    good: 'text-foreground',
    warning: 'text-foreground',
    critical: 'text-foreground',
    muted: 'text-muted-foreground',
  }[tone]
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap', toneClass)}>
      <Icon size={13} strokeWidth={2} />
      {children}
    </span>
  )
}

function StatTile({ icon: Icon, label, value, sub, attention = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group relative rounded-md bg-card border shadow-sm p-4 text-left flex flex-col justify-between min-h-[128px] w-full transition-all',
        'border-border',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/25 active:translate-y-0',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon
          size={20}
          strokeWidth={1.75}
          className="text-foreground"
        />
        {attention ? (
          <AlertTriangle size={16} strokeWidth={2} className="text-foreground" aria-label="Needs action" />
        ) : (
          onClick && (
            <ArrowUpRight size={15} className="text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
          )
        )}
      </div>
      <div className="mt-4">
        <p className="text-[12px] font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-[30px] font-semibold text-foreground leading-none tracking-tight mt-1.5">{value}</p>
        {/* For attention tiles this line is the status label that goes with the warning icon. */}
        {sub && (
          <p className={cn('text-[11px] mt-2 truncate', attention ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            {sub}
          </p>
        )}
      </div>
    </button>
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
        <div className="w-9 h-9 rounded-full bg-muted text-foreground flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
          {initialsOf(booking.guest_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate">{booking.guest_name || '—'}</p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            <span className="font-medium text-foreground/80">{booking.units?.unit_code || '—'}</span>
            {' · '}{booking.units?.building || '—'}
            {booking.booking_code && <span className="ml-2 font-mono">{booking.booking_code}</span>}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          {paid ? (
            <StatusLabel tone="good" icon={CheckCircle2}>Paid</StatusLabel>
          ) : (
            <StatusLabel tone="warning" icon={Wallet}>{formatMoney(balance)} due</StatusLabel>
          )}
          <p className="text-[10px] text-muted-foreground tabular-nums mt-1">
            {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
          </p>
        </div>
      </button>
    </ContextMenu>
  )
}

function TodayCard({ icon, title, emptyTitle, emptyHint, rows, loading, onViewAll }) {
  return (
    <Card className="min-h-[300px]">
      <CardHeader
        icon={icon}
        title={title}
        count={loading ? null : rows.length}
        action={<ViewAll onClick={onViewAll} />}
      />
      {loading ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="flex-1">{rows.map((b) => <BookingRow key={b.id} booking={b} />)}</div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────
// Performance — yearly analytics
// ─────────────────────────────────────────────────────────────

function Delta({ value, unit = '%', vsLabel }) {
  if (value == null || !Number.isFinite(value)) {
    return <p className="text-[11px] text-muted-foreground mt-1.5">No {vsLabel} data to compare</p>
  }
  const shown = unit === 'pts' ? Math.round(value) : Math.round(value * 100)
  const up = shown > 0
  const flat = shown === 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <p className="text-[11px] mt-1.5 flex items-center gap-1 text-muted-foreground">
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
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
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
      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
        <span className="inline-block w-3 h-[2px] rounded-full bg-[var(--chart)]" />
        {m.label} · {label}
      </p>
    </div>
  )
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' }

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
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="font-medium py-2 pr-4">Month</th>
            <th className="font-medium py-2 pr-4 text-right">Bookings</th>
            <th className="font-medium py-2 pr-4 text-right">Occupancy</th>
            <th className="font-medium py-2 text-right">Revenue</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {data.map((r) => (
            <tr key={r.month} className={cn('border-b border-border/60 last:border-0', r.future ? 'text-muted-foreground' : 'text-foreground')}>
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

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-md bg-muted/70 border border-border">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'px-3 h-7 rounded-md text-[12px] font-medium transition-colors',
            value === o.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
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
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.partial ? `${year} year to date` : `${year} full year`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={metric}
            onChange={setMetric}
            options={Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label }))}
          />
          <div className="inline-flex items-center h-8 rounded-md border border-border">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="h-full px-2 text-muted-foreground hover:text-foreground"
              aria-label="Previous year"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12px] font-semibold tabular-nums text-foreground px-1 min-w-[44px] text-center">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              className="h-full px-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
              aria-label="Next year"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground"
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
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {summary.peak ? `${formatMoney(summary.peak.revenue)} revenue` : 'No revenue yet'}
              </p>
            </SummaryStat>
          </div>

          <div className="pt-5">
            {view === 'chart' ? (
              <p className="text-[12px] font-medium text-foreground">
                {METRICS[metric].label} by month
                <span className="font-normal text-muted-foreground"> · {METRICS[metric].note}</span>
              </p>
            ) : (
              <p className="text-[12px] font-medium text-foreground">
                Monthly breakdown
                <span className="font-normal text-muted-foreground"> · {year}</span>
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
          <span className="text-[11px] text-muted-foreground truncate block mt-0.5">{contract.owners?.name || 'No owner'}</span>
        </div>
        <div className="min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate block">{contract.units?.unit_code || '—'}</span>
          <span className="text-[11px] text-muted-foreground truncate block mt-0.5">{contract.units?.building || '—'}</span>
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground truncate">{formatDateShort(contract.effective_date)}</span>
        <span className="text-[12px] tabular-nums text-foreground truncate">{formatDateShort(contract.expiry_date)}</span>
        <div className="flex justify-end min-w-[96px]">
          {days != null && days <= 7 ? (
            <StatusLabel tone="critical" icon={AlertTriangle}>{left}</StatusLabel>
          ) : days != null && days <= 30 ? (
            <StatusLabel tone="warning" icon={Clock}>{left}</StatusLabel>
          ) : (
            <StatusLabel tone="muted" icon={Clock}>{left}</StatusLabel>
          )}
        </div>
      </button>
    </ContextMenu>
  )
}

function ContractsCard({ contracts, loading, onViewAll }) {
  return (
    <Card>
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
            <div className={cn(CONTRACT_COLS, 'px-5 py-2 bg-muted/40 border-b border-border text-[11px] font-medium text-muted-foreground')}>
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
// Personal activity (left column)
// ─────────────────────────────────────────────────────────────

function ActivityRow({ title, amount, meta, dates, onOpen, contextItems }) {
  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={onOpen}
        className="relative w-full text-left px-3.5 py-2.5 pl-4 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer overflow-hidden"
      >
        <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-foreground/25" />
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate flex-1">{title}</span>
          <span className="text-[11px] text-foreground tabular-nums flex-shrink-0">{amount}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{meta}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{dates}</div>
      </button>
    </ContextMenu>
  )
}

function ActivityList({ title, loading, items, emptyText, renderRow }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        <span className="text-[11px] text-muted-foreground tabular-nums">{loading ? '…' : items.length}</span>
      </div>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-2 space-y-1.5">{[...Array(3)].map((_, i) => <div key={i} className="h-11 rounded-md bg-muted animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-6 text-center"><p className="text-[11px] text-muted-foreground">{emptyText}</p></div>
        ) : (
          items.map(renderRow)
        )}
      </div>
    </div>
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
    <aside className="flex-shrink-0 hidden lg:flex flex-col gap-4 w-[300px] xl:w-[320px] overflow-hidden" style={{ maxHeight: '100%' }}>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden flex-shrink-0">
        <div className="p-4 flex flex-col items-center text-center">
          {profile.photo_url ? (
            <img src={profile.photo_url} alt={profile.name || ''} className="w-16 h-16 rounded-full object-cover ring-1 ring-border" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center text-background text-xl font-bold">
              {(profile.name || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <p className="mt-2.5 text-sm font-semibold text-foreground truncate w-full">{profile.name || 'User'}</p>
          <p className="text-[11px] text-muted-foreground truncate w-full">{profile.email || ''}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            {['Administrator', ...rolePills].map((p) => (
              <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border text-foreground">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-0.5">
        {!hasAnyMatch && !loading && (
          <div className="rounded-md bg-card border border-border shadow-sm px-4 py-8 flex flex-col items-center justify-center text-center">
            <Inbox size={20} strokeWidth={1.5} className="text-muted-foreground/50 mb-2" />
            <p className="text-[12px] font-medium text-foreground">No personal activity</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">
              Your email isn't linked to a specialist, affiliate, or housekeeper.
            </p>
          </div>
        )}

        {matched.specialist && (
          <ActivityList
            title="My bookings"
            loading={loading}
            items={bookings}
            emptyText="No bookings yet"
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
          <ActivityList
            title="My cleanings"
            loading={loading}
            items={cleanings}
            emptyText="No cleanings yet"
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
          <ActivityList
            title="My referrals"
            loading={loading}
            items={referrals}
            emptyText="No referrals yet"
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
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
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

      if (signal?.aborted) return

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
  const dateLabel = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  const firstName = (user?.user_metadata?.full_name || user?.email?.split('@')[0] || '').split(' ')[0]

  const sheetUrl = useMemo(
    () => `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_BACKUP_SHEET_ID || ''}`,
    [],
  )

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
          <p className="text-xs text-muted-foreground mt-1 mb-4 break-words">{error}</p>
          <button
            type="button"
            onClick={() => fetchAll(false)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-background bg-foreground hover:opacity-90"
          >
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      </div>
    )
  }

  const unpaidAttention = stats.unpaidBookingsCount > 0
  const cleaningsAttention = stats.cleaningsToEvaluate > 0

  return (
    <div className={cn('h-full flex gap-5 min-h-0 px-6 py-5 md:px-8 md:py-6', CHART_VARS)}>
      <MyActivityPanel />

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1400px] space-y-5 pb-8">

          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] text-muted-foreground">{dateLabel}</p>
              <h1 className="text-[22px] font-semibold text-foreground tracking-tight mt-0.5">
                {greetingFor(now)}{firstName ? `, ${firstName}` : ''}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center gap-2 h-8 pl-3 pr-1 rounded-md border border-border bg-card shadow-sm"
                title={backupLatest?.started_at ? `${backupTotalRows.toLocaleString()} rows in the last backup` : undefined}
              >
                <StatusLabel tone={backupStatus.tone} icon={backupStatus.icon}>{backupStatus.label}</StatusLabel>
                <span className="w-px h-4 bg-border" />
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  title="Open the Google Sheets backup"
                >
                  Sheets <ExternalLink size={11} />
                </a>
                <button
                  type="button"
                  onClick={runBackup}
                  disabled={backupRunning}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold text-background bg-foreground hover:opacity-90 disabled:opacity-50"
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
          {/* All five in one row whenever there's room; wraps only on narrow screens. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            <StatTile icon={CalendarRange} label="Total bookings" value={stats.totalBookings.toLocaleString('en-PH')} sub="All active records" onClick={() => goto('bookings')} />
            <StatTile icon={Home} label="In-house now" value={stats.inHouseBookings} sub="Guests staying now" onClick={() => goto('bookings', 'in-house')} />
            <StatTile icon={CalendarClock} label="Upcoming" value={stats.upcomingBookings} sub="Future check-ins" onClick={() => goto('bookings', 'upcoming')} />
            <StatTile
              icon={Wallet}
              label="Unpaid bookings"
              value={stats.unpaidBookingsCount}
              sub={unpaidAttention ? `${formatMoneyCompact(stats.unpaidBookingsTotal)} outstanding` : 'Nothing outstanding'}
              attention={unpaidAttention}
              onClick={() => goto('bookings', 'unpaid')}
            />
            <StatTile
              icon={ClipboardCheck}
              label="Cleaning reviews"
              value={stats.cleaningsToEvaluate}
              sub={cleaningsAttention ? 'Waiting for review' : 'All reviewed'}
              attention={cleaningsAttention}
              onClick={() => goto('housekeeping', 'evaluate')}
            />
          </div>

          {/* Today */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TodayCard
              icon={LogIn}
              title="Arriving today"
              emptyTitle="No check-ins today"
              emptyHint="New arrivals will show up here."
              rows={todayLists.checkIns}
              loading={loading}
              onViewAll={() => goto('bookings')}
            />
            <TodayCard
              icon={LogOut}
              title="Leaving today"
              emptyTitle="No check-outs today"
              emptyHint="Departures will show up here."
              rows={todayLists.checkOuts}
              loading={loading}
              onViewAll={() => goto('bookings')}
            />
          </div>

          {/* Performance */}
          <PerformanceCard
            year={analyticsYear}
            setYear={setAnalyticsYear}
            analytics={analytics}
            loading={analyticsLoading}
          />

          {/* Contracts */}
          <ContractsCard
            contracts={contractsNearingEnd}
            loading={loading}
            onViewAll={() => goto('contracts')}
          />
        </div>
      </div>
    </div>
  )
}
