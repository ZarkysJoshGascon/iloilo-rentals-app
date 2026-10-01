// src/components/admin/dashboard/DashboardPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RefreshCw, ArrowRight, Inbox,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useDebouncedRealtime } from '@/hooks/useDebouncedRealtime'
import { cn } from '@/lib/utils'

const NEARING_END_DAYS = 60
const LIST_LIMIT = 8
const ANALYTICS_MONTHS = 12

// ------------------------------------------------------------
// Date helpers
// ------------------------------------------------------------
function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function todayISO() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return toISODate(d)
}
function isoDatePlusDays(days) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return toISODate(d)
}
function formatDateShort(dateStr) {
  if (!dateStr) return '—'
  const dt = new Date(dateStr + 'T00:00:00Z')
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
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

// ------------------------------------------------------------
// Section — title OUTSIDE the card, content inside
// ------------------------------------------------------------
function Section({ title, subtitle, action, children, className }) {
  return (
    <section className={cn('flex flex-col min-h-0', className)}>
      {/* Title outside the card */}
      <div className="flex items-baseline justify-between gap-3 mb-2 px-0.5">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground truncate">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {action}
      </div>

      {/* Plain card — no header strip inside */}
      <div className="rounded-md bg-card border border-border overflow-hidden flex-1 flex flex-col min-h-0">
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

function ListRow({ onClick, primary, secondary, trailing, trailingTone = 'muted' }) {
  const toneClass = {
    muted: 'text-muted-foreground',
    default: 'text-foreground',
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  }[trailingTone] || 'text-muted-foreground'

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground truncate">{primary}</p>
          {secondary && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{secondary}</p>
          )}
        </div>
        {trailing && (
          <p className={cn('text-[11px] tabular-nums flex-shrink-0 font-medium', toneClass)}>
            {trailing}
          </p>
        )}
      </div>
    </button>
  )
}

// ------------------------------------------------------------
// KPI tiles — plain card, no icon, no bar
// ------------------------------------------------------------
function StatCard({ label, value, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-md bg-card border border-border p-4 text-left flex flex-col justify-between min-h-[104px] w-full',
        onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : 'cursor-default',
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

// ------------------------------------------------------------
// Charts — same idea: title outside, chart inside plain card
// ------------------------------------------------------------
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
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(45, 86, 142, 0.06)' }} />
          <Bar dataKey="bookings" name="Bookings" fill="#2d568e" radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function OccupancyChart({ data, loading }) {
  const chartData = useMemo(() => (data || []).map((r) => ({
    label: new Date(r.month_start).toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
    occupancy_pct: Number(r.occupancy_pct || 0),
  })), [data])

  if (loading) return <div className="h-[200px] m-4 rounded bg-muted/50 animate-pulse" />

  return (
    <div className="h-[220px] w-full p-4 pt-5">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#7c3aed', strokeOpacity: 0.15 }} />
          <Line type="monotone" dataKey="occupancy_pct" name="Occupancy" stroke="#7c3aed" strokeWidth={2}
            dot={{ r: 2.5, fill: '#7c3aed' }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function RevenueChart({ data, loading }) {
  const chartData = useMemo(() => (data || []).map((r) => ({
    label: new Date(r.month_start).toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' }),
    revenue: Number(r.revenue || 0),
  })), [data])

  if (loading) return <div className="h-[200px] m-4 rounded bg-muted/50 animate-pulse" />

  return (
    <div className="h-[220px] w-full p-4 pt-5">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={formatMoneyCompact}
            stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(5, 150, 105, 0.06)' }} />
          <Bar dataKey="revenue" name="Revenue" fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
export default function DashboardPage({ onNavigateTab }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const [stats, setStats] = useState({
    inHouseBookings: 0,
    cleaningsToday: 0,
    unpaidBookingsCount: 0,
    unpaidBookingsTotal: 0,
    cleaningsToEvaluate: 0,
  })

  const [todayLists, setTodayLists] = useState({ checkIns: [], checkOuts: [] })
  const [contractsNearingEnd, setContractsNearingEnd] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  const hasLoadedOnce = useRef(false)

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('dashboard_analytics', {
        p_months: ANALYTICS_MONTHS,
      })
      if (err) throw err
      setAnalytics(data || [])
    } catch (err) {
      console.error('Analytics load failed:', err)
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
        inHouseRes,
        cleaningsTodayRes,
        unpaidListRes,
        cleaningsToEvaluateRes,
        checkInsRes,
        checkOutsRes,
        nearingEndRes,
      ] = await Promise.all([
        supabase.from('bookings')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('completed_at', null)
          .lte('check_in', today)
          .gte('check_out', today),

        supabase.from('cleanings')
          .select('id', { count: 'exact', head: true })
          .eq('scheduled_date', today),

        supabase.from('bookings')
          .select('id, balance')
          .is('deleted_at', null)
          .is('completed_at', null)
          .gt('balance', 0),

        supabase.from('cleanings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'submitted'),

        supabase.from('bookings')
          .select(`id, booking_code, guest_name, check_in, check_out, balance, units:unit_id ( id, unit_code, building )`)
          .is('deleted_at', null)
          .eq('check_in', today)
          .order('check_in', { ascending: true })
          .limit(LIST_LIMIT),

        supabase.from('bookings')
          .select(`id, booking_code, guest_name, check_in, check_out, balance, units:unit_id ( id, unit_code, building )`)
          .is('deleted_at', null)
          .eq('check_out', today)
          .order('check_out', { ascending: true })
          .limit(LIST_LIMIT),

        supabase.from('contracts')
          .select(`id, contract_code, expiry_date, units:unit_id ( id, unit_code, building ), owners:owner_id ( id, name )`)
          .gte('expiry_date', today)
          .lte('expiry_date', soon)
          .order('expiry_date', { ascending: true })
          .limit(LIST_LIMIT),
      ])

      const firstErr = [
        inHouseRes, cleaningsTodayRes, unpaidListRes, cleaningsToEvaluateRes,
        checkInsRes, checkOutsRes, nearingEndRes,
      ].find((r) => r.error)
      if (firstErr?.error) throw firstErr.error

      const unpaidList = unpaidListRes.data || []
      const unpaidTotal = unpaidList.reduce((s, b) => s + Number(b.balance || 0), 0)

      setStats({
        inHouseBookings: inHouseRes.count || 0,
        cleaningsToday: cleaningsTodayRes.count || 0,
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
    fetchAnalytics()
  }, [fetchAll, fetchAnalytics])

  const handleRealtime = useCallback(() => {
    if (!hasLoadedOnce.current) return
    fetchAll(true)
    fetchAnalytics()
  }, [fetchAll, fetchAnalytics])

  useDebouncedRealtime({ table: 'contracts', onChange: handleRealtime, debounceMs: 2000 })
  useDebouncedRealtime({ table: 'bookings', onChange: handleRealtime, debounceMs: 2000 })
  useDebouncedRealtime({ table: 'cleanings', onChange: handleRealtime, debounceMs: 2000 })

  const goto = useCallback((tab) => {
    if (typeof onNavigateTab === 'function') onNavigateTab(tab)
  }, [onNavigateTab])

  const nowLabel = useMemo(
    () => new Date().toLocaleDateString('en-PH', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }),
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto space-y-6 pb-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">Operations Overview</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">{nowLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => { fetchAll(true); fetchAnalytics() }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-[11px] font-semibold text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw size={11} className={cn(refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Bookings"
            value={stats.inHouseBookings}
            sub="Guests currently in-house"
            onClick={() => goto('bookings')}
          />
          <StatCard
            label="Cleanings"
            value={stats.cleaningsToday}
            sub="Scheduled for today"
            onClick={() => goto('housekeeping')}
          />
          <StatCard
            label="Unpaid Bookings"
            value={stats.unpaidBookingsCount}
            sub={
              stats.unpaidBookingsTotal > 0
                ? `${formatMoney(stats.unpaidBookingsTotal)} outstanding`
                : 'No outstanding balances'
            }
            onClick={() => goto('bookings')}
          />
          <StatCard
            label="Cleanings to Evaluate"
            value={stats.cleaningsToEvaluate}
            sub="Waiting for review"
            onClick={() => goto('housekeeping')}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Bookings per month" subtitle="Last 12 months" className="min-h-[280px]">
            <BookingsChart data={analytics} loading={analyticsLoading} />
          </Section>
          <Section title="Occupancy rate" subtitle="Last 12 months" className="min-h-[280px]">
            <OccupancyChart data={analytics} loading={analyticsLoading} />
          </Section>
          <Section title="Gross revenue" subtitle="Last 12 months" className="min-h-[280px]">
            <RevenueChart data={analytics} loading={analyticsLoading} />
          </Section>
        </div>

        {/* Today */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section
            title="Check-ins today"
            action={<ViewAll onClick={() => goto('bookings')} />}
            className="min-h-[260px]"
          >
            {loading ? (
              <div className="p-3 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-9 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : todayLists.checkIns.length === 0 ? (
              <EmptyState>No check-ins today</EmptyState>
            ) : (
              todayLists.checkIns.map((b) => (
                <ListRow
                  key={b.id}
                  onClick={() => goto('bookings')}
                  primary={b.guest_name || '—'}
                  secondary={`${b.units?.unit_code || '—'} · ${b.units?.building || '—'}`}
                  trailing={Number(b.balance) > 0 ? formatMoney(b.balance) : 'paid'}
                  trailingTone={Number(b.balance) > 0 ? 'warn' : 'good'}
                />
              ))
            )}
          </Section>

          <Section
            title="Check-outs today"
            action={<ViewAll onClick={() => goto('bookings')} />}
            className="min-h-[260px]"
          >
            {loading ? (
              <div className="p-3 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-9 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : todayLists.checkOuts.length === 0 ? (
              <EmptyState>No check-outs today</EmptyState>
            ) : (
              todayLists.checkOuts.map((b) => (
                <ListRow
                  key={b.id}
                  onClick={() => goto('bookings')}
                  primary={b.guest_name || '—'}
                  secondary={`${b.units?.unit_code || '—'} · ${b.units?.building || '—'}`}
                  trailing={Number(b.balance) > 0 ? formatMoney(b.balance) : 'paid'}
                  trailingTone={Number(b.balance) > 0 ? 'warn' : 'good'}
                />
              ))
            )}
          </Section>
        </div>

        {/* Contracts nearing end */}
        <Section
          title="Contracts nearing end"
          subtitle={`Within ${NEARING_END_DAYS} days`}
          action={<ViewAll onClick={() => goto('contracts')} />}
          className="min-h-[260px]"
        >
          {loading ? (
            <div className="p-3 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : contractsNearingEnd.length === 0 ? (
            <EmptyState>Nothing expiring soon</EmptyState>
          ) : (
            contractsNearingEnd.map((c) => {
              const days = daysUntil(c.expiry_date)
              const label = days == null ? '—' : days === 0 ? 'today' : `${days}d left`
              return (
                <ListRow
                  key={c.id}
                  onClick={() => goto('contracts')}
                  primary={c.units?.unit_code || '—'}
                  secondary={`${c.owners?.name || 'No owner'} · ${c.units?.building || '—'}`}
                  trailing={label}
                  trailingTone={days != null && days <= 7 ? 'danger' : days != null && days <= 30 ? 'warn' : 'muted'}
                />
              )
            })
          )}
        </Section>

      </div>
    </div>
  )
}