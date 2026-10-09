import { useCallback, useEffect, useMemo, useRef, useState, memo, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, RefreshCw, X, Loader2, TrendingUp, ChevronDown, ChevronLeft, ChevronRight,
  Download, Wallet, Lock, Save, Home, Sparkles, Plus, Trash2,
  Zap, Wifi, Droplets, Megaphone,
  Calendar, User, Pencil, BarChart3, Camera, Copy,
} from 'lucide-react'
import {
  ComposedChart, Bar, BarChart, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import {
  cn, sanitizeMoney, sanitizeText, sanitizeDateOnly,
} from '@/lib/utils'
import {
  computeLifetime,
  monthLabel, monthKeyToDate, formatMoney, formatMoneyCompact,
  OWNER_SPLIT_PCT, COMPANY_SPLIT_PCT, PM_SHARE_OF_COMPANY_PCT,
} from '@/lib/accounting'
import { fetchContractsLifetime, fetchContractMonthlyBreakdown } from '@/lib/accountingRpc'
import { ContextMenu } from '@/components/ui/ContextMenu'

const BRAND = '#2d568e'
const CLEAN_COLOR = '#10b981'
const EXPENSE_BUCKET = 'expense-proofs'
const ROW_GRID = 'grid grid-cols-[1.2fr_1fr_1.2fr_1fr_140px] gap-4 items-center'
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PAGE_SIZE = 25
const REALTIME_DEBOUNCE_MS = 1500
const PARENT_REFRESH_DEBOUNCE_MS = 1200
const DETAIL_REFRESH_DEBOUNCE_MS = 800

const SORT_OPTIONS = [
  { id: 'unit_asc', label: 'Unit (A→Z)' },
  { id: 'date_desc', label: 'Newest first' },
  { id: 'date_asc', label: 'Oldest first' },
  { id: 'net_desc', label: 'Net (high→low)' },
  { id: 'net_asc', label: 'Net (low→high)' },
]

function LazyChart({ children, rootMargin = '200px', minHeight = 260 }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            io.disconnect()
            return
          }
        }
      },
      { rootMargin }
    )
    io.observe(node)
    const fallback = setTimeout(() => setVisible(true), 5000)
    return () => { io.disconnect(); clearTimeout(fallback) }
  }, [visible, rootMargin])

  return (
    <div ref={ref} style={!visible ? { minHeight } : undefined}>
      {visible ? children : null}
    </div>
  )
}

function deriveContractStatus(contract) {
  if (!contract) return 'inactive'
  if (!contract.effective_date) return 'incomplete'
  const exp = contract.expiry_date ? new Date(contract.expiry_date + 'T00:00:00Z') : null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  if (!exp) return 'active'
  if (exp < today) return 'expired'
  const daysLeft = Math.round((exp - today) / 86400000)
  return daysLeft <= 60 ? 'expiring' : 'active'
}

const STATUS_TEXT = {
  active:     { label: 'Active',     className: 'text-emerald-600 dark:text-emerald-400' },
  expiring:   { label: 'Expiring',   className: 'text-amber-600 dark:text-amber-400' },
  expired:    { label: 'Expired',    className: 'text-red-600 dark:text-red-400' },
  incomplete: { label: 'Incomplete', className: 'text-gray-500 dark:text-gray-400' },
  inactive:   { label: 'Inactive',   className: 'text-gray-500 dark:text-gray-400' },
}

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'expired', label: 'Expired' },
]

const PILL_TEXT_ACTIVE = {
  all: 'text-foreground',
  active: 'text-emerald-700 dark:text-emerald-400',
  expiring: 'text-amber-700 dark:text-amber-400',
  expired: 'text-red-700 dark:text-red-400',
}

function StatusText({ status }) {
  const config = STATUS_TEXT[status] || STATUS_TEXT.inactive
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
}

function formatDateShort(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00Z')
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}

function spansFullYear(effectiveDate, expiryDate) {
  if (!effectiveDate) return false
  const start = new Date(effectiveDate + 'T00:00:00Z')
  const end = expiryDate ? new Date(expiryDate + 'T00:00:00Z') : new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  const days = Math.round((end - start) / 86400000)
  return days >= 365 || start.getUTCFullYear() !== end.getUTCFullYear()
}

async function uploadExpenseImage(file, contractId) {
  const ext = (file.name?.split('.').pop() || 'jpg').slice(0, 6).toLowerCase()
  const random = Math.random().toString(36).slice(2, 10)
  const path = `${contractId}/${Date.now()}_${random}.${ext}`
  const { error } = await supabase.storage.from(EXPENSE_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw error
  return path
}

async function deleteExpenseImage(path) {
  if (!path) return
  try {
    await supabase.storage.from(EXPENSE_BUCKET).remove([path])
  } catch (err) {
    console.warn('Failed to delete image:', err)
  }
}

async function getSignedUrl(path, expiresIn = 3600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(EXPENSE_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data?.signedUrl || null
}

function buildYearSections(effectiveDate, expiryDate) {
  if (!effectiveDate) return []
  const eff = new Date(effectiveDate + 'T00:00:00Z')
  if (Number.isNaN(eff.getTime())) return []

  const effYear = eff.getUTCFullYear()
  const effMonth = eff.getUTCMonth()

  let endYear, endMonth
  if (expiryDate) {
    const exp = new Date(expiryDate + 'T00:00:00Z')
    if (Number.isNaN(exp.getTime())) return []
    endYear = exp.getUTCFullYear()
    endMonth = exp.getUTCMonth()
  } else {
    const t = new Date()
    endYear = t.getUTCFullYear()
    endMonth = t.getUTCMonth()
  }

  const sections = []
  for (let y = effYear; y <= endYear; y++) {
    const startM = y === effYear ? effMonth : 0
    const stopM = y === endYear ? endMonth : 11
    const months = []
    for (let m = startM; m <= stopM; m++) {
      months.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    }
    if (months.length > 0) sections.push({ year: y, months })
  }
  return sections
}

function pickDefaultYear(yearSections) {
  if (!yearSections || yearSections.length === 0) return null
  const currentYear = new Date().getUTCFullYear()
  const years = yearSections.map((s) => s.year)
  if (years.includes(currentYear)) return currentYear
  if (currentYear < years[0]) return years[0]
  return years[years.length - 1]
}

function nightsInMonthFromBookings(bookings, year, month1to12, contract) {
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  const monthStart = new Date(Date.UTC(year, month1to12 - 1, 1))
  const monthEndExclusive = new Date(Date.UTC(year, month1to12, 1))

  let nights = 0
  for (const b of bookings) {
    if (!b.check_in || !b.check_out) continue
    if (contract?.effective_date && b.check_in < contract.effective_date) continue
    if (contract?.expiry_date && b.check_in > contract.expiry_date) continue

    const ci = new Date(b.check_in + 'T00:00:00Z')
    const co = new Date(b.check_out + 'T00:00:00Z')
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
    const overlapStart = ci > monthStart ? ci : monthStart
    const overlapEnd = co < monthEndExclusive ? co : monthEndExclusive
    if (overlapEnd > overlapStart) {
      nights += Math.round((overlapEnd - overlapStart) / 86400000)
    }
  }
  return { nights: Math.min(nights, daysInMonth), daysInMonth }
}

function buildWeeksForMonth(year, month1to12) {
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  const bounds = [
    { start: 1, end: 7 },
    { start: 8, end: 14 },
    { start: 15, end: 21 },
    { start: 22, end: daysInMonth },
  ]
  return bounds.map((b, i) => ({
    week: i + 1,
    startDay: b.start,
    endDay: b.end,
    daysCount: b.end - b.start + 1,
  }))
}

function weeklyOccupancyForMonth(year, month1to12, bookings, contract) {
  const weeks = buildWeeksForMonth(year, month1to12)
  return weeks.map((w) => {
    const weekStart = new Date(Date.UTC(year, month1to12 - 1, w.startDay))
    const weekEndExclusive = new Date(Date.UTC(year, month1to12 - 1, w.endDay + 1))
    let nights = 0
    for (const b of bookings) {
      if (!b.check_in || !b.check_out) continue
      if (contract?.effective_date && b.check_in < contract.effective_date) continue
      if (contract?.expiry_date && b.check_in > contract.expiry_date) continue

      const ci = new Date(b.check_in + 'T00:00:00Z')
      const co = new Date(b.check_out + 'T00:00:00Z')
      if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
      const overlapStart = ci > weekStart ? ci : weekStart
      const overlapEnd = co < weekEndExclusive ? co : weekEndExclusive
      if (overlapEnd > overlapStart) {
        nights += Math.round((overlapEnd - overlapStart) / 86400000)
      }
    }
    nights = Math.min(nights, w.daysCount)
    return {
      label: `Wk ${w.week}`,
      week: w.week,
      nights,
      daysCount: w.daysCount,
      pct: w.daysCount > 0 ? Math.round((nights / w.daysCount) * 100) : 0,
    }
  })
}

function weeklyNetProfitForMonth(year, month1to12, bookings, cleanings, monthlyExpenses, contract) {
  const weeks = buildWeeksForMonth(year, month1to12)
  const monthKey = `${year}-${String(month1to12).padStart(2, '0')}`
  const manual = (monthlyExpenses || []).find((e) => e.month?.startsWith(monthKey)) || {}
  const manualTotal =
    Number(manual.electricity || 0) +
    Number(manual.internet || 0) +
    Number(manual.water || 0) +
    Number(manual.marketing || 0) +
    (Array.isArray(manual.custom_items)
      ? manual.custom_items.reduce((s, x) => s + Number(x.amount || 0), 0)
      : 0)

  const weekData = weeks.map((w) => {
    const wStart = new Date(Date.UTC(year, month1to12 - 1, w.startDay))
    const wEndEx = new Date(Date.UTC(year, month1to12 - 1, w.endDay + 1))
    const weekBookings = (bookings || []).filter((b) => {
      if (!b.check_in) return false
      if (contract?.effective_date && b.check_in < contract.effective_date) return false
      if (contract?.expiry_date && b.check_in > contract.expiry_date) return false
      const ci = new Date(b.check_in + 'T00:00:00Z')
      return !Number.isNaN(ci.getTime()) && ci >= wStart && ci < wEndEx
    })
    const weekCleanings = (cleanings || []).filter((c) => {
      if (!c.scheduled_date) return false
      if (contract?.effective_date && c.scheduled_date < contract.effective_date) return false
      if (contract?.expiry_date && c.scheduled_date > contract.expiry_date) return false
      const d = new Date(c.scheduled_date + 'T00:00:00Z')
      return !Number.isNaN(d.getTime()) && d >= wStart && d < wEndEx
    })
    const gross = weekBookings.reduce((s, b) => s + Number(b.total_amount || 0), 0)
    const bookerComm = weekBookings.reduce((s, b) => s + Number(b.booker_commission || 0), 0)
    const affiliateComm = weekBookings.reduce((s, b) => s + Number(b.affiliate_commission || 0), 0)
    const housekeeping = weekCleanings.reduce((s, c) => s + Number(c.payment_amount || 0), 0)
    const laundry = weekCleanings.reduce((s, c) => s + Number(c.laundry_payment_amount || 0), 0)
    const net = gross - bookerComm - affiliateComm - housekeeping - laundry
    return { label: `Wk ${w.week}`, week: w.week, net }
  })

  const manualPerWeek = manualTotal / 4
  const withManual = weekData.map((w) => ({ ...w, net: w.net - manualPerWeek }))
  let running = 0
  return withManual.map((w) => {
    running += w.net
    return { ...w, cumulative: running }
  })
}

function computeContractOccupancy(effectiveDate, expiryDate, bookings) {
  if (!effectiveDate) return { pct: 0, nights: 0, totalNights: 0 }
  const start = new Date(effectiveDate + 'T00:00:00Z')
  const end = expiryDate ? new Date(expiryDate + 'T00:00:00Z') : new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { pct: 0, nights: 0, totalNights: 0 }
  }
  const totalNights = Math.round((end - start) / 86400000)
  let nights = 0
  for (const b of bookings) {
    if (!b.check_in || !b.check_out) continue
    if (b.check_in < effectiveDate) continue
    if (expiryDate && b.check_in > expiryDate) continue

    const ci = new Date(b.check_in + 'T00:00:00Z')
    const co = new Date(b.check_out + 'T00:00:00Z')
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
    const overlapStart = ci > start ? ci : start
    const overlapEnd = co < end ? co : end
    if (overlapEnd > overlapStart) {
      nights += Math.round((overlapEnd - overlapStart) / 86400000)
    }
  }
  nights = Math.min(nights, totalNights)
  return { pct: totalNights > 0 ? nights / totalNights : 0, nights, totalNights }
}

function SectionHeader({ icon: Icon, title, action }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon ? <Icon size={16} className="text-foreground flex-shrink-0" /> : null}
      <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h2>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  )
}

function SummaryCards({ totals }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
      <Card label="Gross" value={formatMoney(totals.gross)} icon={TrendingUp} />
      <Card label="Expenses" value={formatMoney(totals.expenses)} icon={Wallet} />
      <Card label="Net" value={formatMoney(totals.net)} icon={TrendingUp} />
      <SplitCard
        label="Owner / Company"
        owner={totals.owner}
        company={totals.company}
        pm={totals.pm}
        icon={Wallet}
      />
      <Card label="PM Payout" value={formatMoney(totals.pm || 0)} icon={User} />
    </div>
  )
}

function Card({ label, value, icon: Icon }) {
  return (
    <div className="rounded-md bg-card border border-border shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function SplitCard({ label, owner, company, pm = 0, icon: Icon }) {
  return (
    <div className="rounded-md bg-card border border-border shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground">
        {formatMoney(owner)}
        <span className="text-muted-foreground mx-1">·</span>
        {formatMoney(company)}
      </p>
      {pm > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          incl. PM {formatMoney(pm)}
        </p>
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
              isActive ? (PILL_TEXT_ACTIVE[tab.id] || 'text-foreground') : 'text-muted-foreground hover:text-foreground'
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

function ContractRow({ contract, lifetime, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{ backgroundColor: 'rgba(45, 86, 142, 0)' }}
      transition={{ duration: 0.2 }}
      whileHover={{ backgroundColor: 'rgba(45, 86, 142, 0.05)' }}
      whileTap={{ scale: 0.998 }}
      className={cn('w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
    >
      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">
          {contract.units?.unit_code || '—'}
        </span>
        <span className="text-[11px] text-muted-foreground truncate block">
          {contract.contract_code || '—'}
        </span>
      </div>

      <div className="min-w-0">
        <span className="text-[11px] text-foreground truncate block">
          {contract.owners?.name || 'No owner'}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono truncate block">
          {contract.units?.building || '—'}
        </span>
      </div>

      <div className="min-w-0 text-[11px] text-foreground tabular-nums">
        <div className="truncate">{formatDateShort(contract.effective_date)}</div>
        <div className="text-muted-foreground truncate">→ {formatDateShort(contract.expiry_date)}</div>
      </div>

      <div className="text-[11px] tabular-nums text-foreground min-w-0">
        <div className="truncate">{formatMoney(lifetime?.gross || 0)}</div>
        <div className="text-[11px] text-muted-foreground truncate">{formatMoney(lifetime?.net || 0)}</div>
      </div>

      <div className="flex items-center justify-end flex-shrink-0">
        <StatusText status={deriveContractStatus(contract)} />
      </div>
    </motion.button>
  )
}

function CardBody({ children, className }) {
  return (
    <div className={cn('rounded-md bg-card border border-border shadow-sm overflow-hidden', className)}>
      {children}
    </div>
  )
}

function CursorTooltip({ cursor, children }) {
  if (!cursor) return null
  const style = {
    position: 'fixed',
    left: Math.min(cursor.x + 14, window.innerWidth - 280),
    top: Math.min(cursor.y + 14, window.innerHeight - 180),
    zIndex: 9999,
    pointerEvents: 'none',
  }
  return (
    <div style={style} className="rounded-md border border-border bg-popover shadow-lg p-3 text-xs w-[264px]">
      {children}
    </div>
  )
}

function useCursorTooltip() {
  const [cursor, setCursor] = useState(null)
  const onMove = useCallback((e) => setCursor({ x: e.clientX, y: e.clientY }), [])
  const onLeave = useCallback(() => setCursor(null), [])
  return { cursor, onMove, onLeave }
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  const byKey = {}
  for (const p of payload) byKey[p.dataKey] = p.value
  return (
    <div className="rounded-md border border-border bg-popover shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground">Gross</span>
          <span className="tabular-nums font-semibold text-foreground">{formatMoney(byKey.gross || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground">Expenses</span>
          <span className="tabular-nums font-semibold text-foreground">{formatMoney(byKey.expenses || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-foreground">Net</span>
          <span className="tabular-nums font-semibold text-foreground">{formatMoney(byKey.net || 0)}</span>
        </div>
      </div>
    </div>
  )
}

function OccupancyTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  const pct = payload[0]?.value || 0
  const nights = payload[0]?.payload?.nights || 0
  const days = payload[0]?.payload?.daysInMonth || payload[0]?.payload?.daysCount || 0
  return (
    <div className="rounded-md border border-border bg-popover shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-foreground tabular-nums">
        {nights} of {days} nights · <span className="font-semibold">{Math.round(pct)}%</span>
      </p>
    </div>
  )
}

function CumulativeTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  const v = payload[0]?.value || 0
  return (
    <div className="rounded-md border border-border bg-popover shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-foreground tabular-nums font-semibold">{formatMoney(v)}</p>
    </div>
  )
}

function HalfGauge({ pct, sublabel, compact = false }) {
  const clampedPct = Math.max(0, Math.min(1, pct || 0))
  const total = compact ? 44 : 60
  const filled = Math.round(clampedPct * total)

  const w = compact ? 140 : 200
  const h = compact ? 78 : 110
  const cx = w / 2
  const cy = h - 2
  const r = compact ? 56 : 80
  const strokeW = compact ? 5 : 6

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: w, height: h }}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
          {[...Array(total)].map((_, i) => {
            const t = i / (total - 1)
            const angle = 180 - t * 180
            const rad = (angle * Math.PI) / 180
            const x1 = cx + Math.cos(rad) * (r - strokeW / 2)
            const y1 = cy - Math.sin(rad) * (r - strokeW / 2)
            const x2 = cx + Math.cos(rad) * (r + strokeW / 2)
            const y2 = cy - Math.sin(rad) * (r + strokeW / 2)
            const active = i < filled
            return (
              <motion.line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={active ? BRAND : '#d1d5db'}
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.008, duration: 0.15 }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: compact ? 18 : 24 }}>
          <motion.p
            key={`${Math.round(clampedPct * 100)}-${compact}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn('font-bold tabular-nums text-foreground', compact ? 'text-2xl' : 'text-3xl')}
          >
            {Math.round(clampedPct * 100)}%
          </motion.p>
          {sublabel && (
            <p className={cn('text-foreground mt-0.5 text-center px-2', compact ? 'text-[11px]' : 'text-xs')}>
              {sublabel}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function YearNav({ yearSections, selectedYear, onSelectYear }) {
  const idx = yearSections.findIndex((s) => s.year === selectedYear)
  const canPrev = idx > 0
  const canNext = idx >= 0 && idx < yearSections.length - 1

  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex items-center gap-1 bg-muted/50 rounded-full p-1">
        <button
          type="button"
          onClick={() => canPrev && onSelectYear(yearSections[idx - 1].year)}
          disabled={!canPrev}
          className={cn(
            'p-1.5 rounded-full transition-colors',
            canPrev ? 'hover:bg-muted text-foreground' : 'opacity-30 cursor-not-allowed'
          )}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[12px] font-bold tabular-nums text-foreground px-3 min-w-[60px] text-center">
          {selectedYear}
        </span>
        <button
          type="button"
          onClick={() => canNext && onSelectYear(yearSections[idx + 1].year)}
          disabled={!canNext}
          className={cn(
            'p-1.5 rounded-full transition-colors',
            canNext ? 'hover:bg-muted text-foreground' : 'opacity-30 cursor-not-allowed'
          )}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

const YearlyRevenueChart = memo(function YearlyRevenueChart({ yearSections, statements, selectedYear, title }) {
  const section = yearSections.find((s) => s.year === selectedYear)

  const data = useMemo(() => {
    if (!section) return []
    return section.months.map((mk) => {
      const found = statements.find((s) => s.month === mk)
      return {
        label: MONTHS_SHORT[Number(mk.split('-')[1]) - 1],
        monthKey: mk,
        gross: found?.grossRevenue || 0,
        expenses: found?.totalExpenses || 0,
        net: found?.netProfit || 0,
      }
    })
  }, [section, statements])

  const [minY, maxY] = useMemo(() => {
    const values = []
    for (const d of data) values.push(d.gross, d.expenses, d.net, 0)
    const min = Math.min(...values, 0)
    const max = Math.max(...values, 0)
    const span = max - min || 1
    const pad = span * 0.1
    return [
      Math.floor((min - pad) / 1000) * 1000,
      Math.ceil((max + pad) / 1000) * 1000,
    ]
  }, [data])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TrendingUp size={16} className="text-foreground flex-shrink-0" />
          <h3 className="text-base font-semibold text-foreground truncate">{title}</h3>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border" style={{ borderColor: BRAND }} />
            <span className="text-foreground">Gross</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <pattern id="legend-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke={BRAND} strokeWidth="1.2" />
              </pattern>
              <rect width="12" height="12" fill="url(#legend-hatch)" />
            </svg>
            <span className="text-foreground">Expenses</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: BRAND }} />
            <span className="text-foreground">Net</span>
          </span>
        </div>
      </div>
      <CardBody>
        <div className="p-3">
          <div className="h-[320px] w-full">
            {!section || section.months.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                No months to display
              </div>
            ) : (
              <LazyChart minHeight={320}>
                <ResponsiveContainer width="100%" height={320} debounce={100}>
                  <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
                    <pattern id="expenses-hatch-main" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="6" stroke={BRAND} strokeWidth="1.5" opacity="0.55" />
                    </pattern>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" strokeOpacity={0.4} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={formatMoneyCompact}
                      stroke="currentColor"
                      strokeOpacity={0.4}
                      width={60}
                      domain={[minY, maxY]}
                    />
                    <Tooltip content={<ChartTooltip />} animationDuration={0} cursor={{ fill: 'rgba(45, 86, 142, 0.05)' }} />
                    <Bar dataKey="gross" fill="transparent" stroke={BRAND} strokeWidth={1.5} name="Gross" maxBarSize={40} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="expenses" fill="url(#expenses-hatch-main)" name="Expenses" maxBarSize={40} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="net" fill={BRAND} name="Net" maxBarSize={40} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </LazyChart>
            )}
          </div>
        </div>
      </CardBody>
    </div>
  )
})

const MonthlyOccupancyChart = memo(function MonthlyOccupancyChart({ statements, selectedYear, contract }) {
  const data = useMemo(() => {
    return statements
      .filter((s) => s.month.startsWith(String(selectedYear)))
      .map((s) => {
        const [y, m] = s.month.split('-').map(Number)
        const { nights, daysInMonth } = nightsInMonthFromBookings(s.bookingsList, y, m, contract)
        return {
          label: MONTHS_SHORT[m - 1],
          monthKey: s.month,
          pct: daysInMonth > 0 ? Math.round((nights / daysInMonth) * 100) : 0,
          nights,
          daysInMonth,
        }
      })
  }, [statements, selectedYear, contract])

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Home size={16} className="text-foreground flex-shrink-0" />
          <h3 className="text-base font-semibold text-foreground truncate">Monthly Occupancy</h3>
        </div>
      </div>
      <CardBody className="flex-1">
        <div className="p-3 h-full">
          <div className="h-[260px] w-full">
            {data.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No months to display</div>
            ) : (
              <LazyChart minHeight={260}>
                <ResponsiveContainer width="100%" height={260} debounce={100}>
                  <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.4} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      stroke="currentColor"
                      strokeOpacity={0.4}
                      width={44}
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                    />
                    <Tooltip content={<OccupancyTooltip />} animationDuration={0} cursor={{ fill: 'rgba(45, 86, 142, 0.05)' }} />
                    <Bar dataKey="pct" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </LazyChart>
            )}
          </div>
        </div>
      </CardBody>
    </div>
  )
})

const WeeklyOccupancyChart = memo(function WeeklyOccupancyChart({ statement, contract }) {
  const [y, m] = statement.month.split('-').map(Number)

  const data = useMemo(
    () => weeklyOccupancyForMonth(y, m, statement.bookingsList, contract),
    [y, m, statement.bookingsList, contract]
  )

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Home size={16} className="text-foreground flex-shrink-0" />
          <h3 className="text-base font-semibold text-foreground truncate">Weekly Occupancy</h3>
        </div>
        <span className="text-xs font-bold text-foreground tabular-nums">{monthLabel(statement.month)}</span>
      </div>
      <CardBody className="flex-1">
        <div className="p-3 h-full">
          <div className="h-[260px] w-full">
            <LazyChart minHeight={260}>
              <ResponsiveContainer width="100%" height={260} debounce={100}>
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.4} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                    stroke="currentColor"
                    strokeOpacity={0.4}
                    width={44}
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                  />
                  <Tooltip content={<OccupancyTooltip />} animationDuration={0} cursor={{ fill: 'rgba(45, 86, 142, 0.05)' }} />
                  <Bar dataKey="pct" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </LazyChart>
          </div>
        </div>
      </CardBody>
    </div>
  )
})

const WeeklyCumulativeChart = memo(function WeeklyCumulativeChart({ statement, monthlyExpenses, contract }) {
  const [y, m] = statement.month.split('-').map(Number)

  const data = useMemo(
    () => weeklyNetProfitForMonth(y, m, statement.bookingsList, statement.cleaningsList, monthlyExpenses, contract),
    [y, m, statement.bookingsList, statement.cleaningsList, monthlyExpenses, contract]
  )

  const maxValue = useMemo(() => {
    const max = data.reduce((mx, d) => Math.max(mx, Math.abs(d.cumulative)), 0)
    return Math.max(Math.ceil(max / 1000) * 1000, 1000)
  }, [data])

  const minValue = useMemo(() => {
    const min = data.reduce((mn, d) => Math.min(mn, d.cumulative), 0)
    return min < 0 ? Math.floor(min / 1000) * 1000 : 0
  }, [data])

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TrendingUp size={16} className="text-foreground flex-shrink-0" />
          <h3 className="text-base font-semibold text-foreground truncate">Weekly Cumulative Net</h3>
        </div>
        <span className="text-xs font-bold text-foreground tabular-nums">{monthLabel(statement.month)}</span>
      </div>
      <CardBody className="flex-1">
        <div className="p-3 h-full">
          <div className="h-[260px] w-full">
            <LazyChart minHeight={260}>
              <ResponsiveContainer width="100%" height={260} debounce={100}>
                <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <linearGradient id="weekly-cumulative-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.45} />
                    <stop offset="60%" stopColor={BRAND} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.4} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatMoneyCompact}
                    stroke="currentColor"
                    strokeOpacity={0.4}
                    width={56}
                    domain={[minValue, maxValue]}
                  />
                  <Tooltip content={<CumulativeTooltip />} animationDuration={0} cursor={{ stroke: BRAND, strokeOpacity: 0.2 }} />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke={BRAND}
                    strokeWidth={2.5}
                    fill="url(#weekly-cumulative-fill)"
                    dot={{ r: 3, fill: BRAND }}
                    activeDot={{ r: 5, fill: BRAND }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </LazyChart>
          </div>
        </div>
      </CardBody>
    </div>
  )
})

const CumulativeNetChart = memo(function CumulativeNetChart({ statements, selectedYear }) {
  const data = useMemo(() => {
    const ordered = [...statements].sort((a, b) => a.month.localeCompare(b.month))
    const withCumulative = []
    let running = 0
    for (const s of ordered) {
      running += s.netProfit
      withCumulative.push({
        label: MONTHS_SHORT[Number(s.month.split('-')[1]) - 1],
        monthKey: s.month,
        year: Number(s.month.split('-')[0]),
        cumulative: running,
      })
    }
    return withCumulative.filter((d) => d.year === selectedYear)
  }, [statements, selectedYear])

  const maxValue = useMemo(() => {
    const max = data.reduce((m, d) => Math.max(m, Math.abs(d.cumulative)), 0)
    return Math.max(Math.ceil(max / 10000) * 10000, 70000)
  }, [data])

  const minValue = useMemo(() => {
    const min = data.reduce((mn, d) => Math.min(mn, d.cumulative), 0)
    return min < 0 ? Math.floor(min / 10000) * 10000 : 0
  }, [data])

  const ticks = useMemo(() => {
    const steps = 4
    const span = maxValue - minValue
    const out = []
    for (let i = 0; i <= steps; i++) out.push(minValue + (span / steps) * i)
    return out
  }, [maxValue, minValue])

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TrendingUp size={16} className="text-foreground flex-shrink-0" />
          <h3 className="text-base font-semibold text-foreground truncate">Cumulative Net</h3>
        </div>
      </div>
      <CardBody className="flex-1">
        <div className="p-3 h-full">
          <div className="h-[260px] w-full">
            {data.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No months to display</div>
            ) : (
              <LazyChart minHeight={260}>
                <ResponsiveContainer width="100%" height={260} debounce={100}>
                  <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <linearGradient id="cumulative-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.45} />
                      <stop offset="60%" stopColor={BRAND} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" strokeOpacity={0.4} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatMoneyCompact}
                      stroke="currentColor"
                      strokeOpacity={0.4}
                      width={56}
                      domain={[minValue, maxValue]}
                      ticks={ticks}
                    />
                    <Tooltip content={<CumulativeTooltip />} animationDuration={0} cursor={{ stroke: BRAND, strokeOpacity: 0.2 }} />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke={BRAND}
                      strokeWidth={2.5}
                      fill="url(#cumulative-fill)"
                      dot={false}
                      activeDot={{ r: 4, fill: BRAND }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </LazyChart>
            )}
          </div>
        </div>
      </CardBody>
    </div>
  )
})

function BookingCalendar({ month, bookings, cleanings, selectedId, onSelect }) {
  const [y, m] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(y, m - 1, 1))
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const startDow = firstDay.getUTCDay()

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const dayBookings = useMemo(() => {
    const map = {}
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(Date.UTC(y, m - 1, d))
      const dayEnd = new Date(Date.UTC(y, m - 1, d + 1))
      const list = []
      for (const b of bookings) {
        if (!b.check_in || !b.check_out) continue
        const ci = new Date(b.check_in + 'T00:00:00Z')
        const co = new Date(b.check_out + 'T00:00:00Z')
        if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
        if (co <= dayStart || ci >= dayEnd) continue
        list.push(b)
      }
      map[d] = list
    }
    return map
  }, [y, m, daysInMonth, bookings])

  const dayCleanings = useMemo(() => {
    const map = {}
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(Date.UTC(y, m - 1, d))
      const dayEnd = new Date(Date.UTC(y, m - 1, d + 1))
      const list = []
      for (const c of (cleanings || [])) {
        if (!c.scheduled_date) continue
        const sd = new Date(c.scheduled_date + 'T00:00:00Z')
        if (Number.isNaN(sd.getTime())) continue
        if (sd >= dayStart && sd < dayEnd) list.push(c)
      }
      map[d] = list
    }
    return map
  }, [y, m, daysInMonth, cleanings])

  const today = new Date()
  const isCurrentMonth = today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m
  const todayDay = isCurrentMonth ? today.getUTCDate() : null

  return (
    <div className="rounded-md border border-border shadow-sm overflow-hidden bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {DOW_SHORT.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-foreground text-center py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={idx} className="min-h-[110px] border-b border-r border-border last:border-r-0 bg-muted/10" />
          }
          const dayB = dayBookings[day] || []
          const dayC = dayCleanings[day] || []
          const shownB = dayB.slice(0, 3)
          const shownC = dayC.slice(0, 3)
          const extra = Math.max(0, (dayB.length - 3) + (dayC.length - 3))
          return (
            <div
              key={idx}
              className={cn(
                'min-h-[110px] border-b border-r border-border last:border-r-0 p-1.5 flex flex-col gap-1',
                todayDay === day && 'bg-[#2d568e]/5'
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-[11px] font-semibold tabular-nums', todayDay === day ? 'text-[#2d568e]' : 'text-foreground')}>
                  {day}
                </span>
              </div>
              <div className="space-y-0.5">
                {shownB.map((b) => (
                  <CalendarBookingBar
                    key={`b-${b.id}`}
                    booking={b}
                    selected={selectedId?.type === 'booking' && selectedId.id === b.id}
                    onSelect={() => onSelect?.('booking', b.id)}
                  />
                ))}
                {shownC.map((c) => (
                  <CalendarCleaningChip
                    key={`c-${c.id}`}
                    cleaning={c}
                    selected={selectedId?.type === 'cleaning' && selectedId.id === c.id}
                    onSelect={() => onSelect?.('cleaning', c.id)}
                  />
                ))}
                {extra > 0 && (
                  <div className="text-[10px] font-semibold text-foreground pl-1">+{extra} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarBookingBar({ booking, selected, onSelect }) {
  const { cursor, onMove, onLeave } = useCursorTooltip()
  const bookerComm = Number(booking.booker_commission || 0)
  const affiliateComm = Number(booking.affiliate_commission || 0)

  return (
    <>
      <motion.button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect?.() }}
        onMouseEnter={onMove}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate cursor-pointer',
          selected && 'ring-2 ring-offset-1 ring-offset-card ring-white',
        )}
        style={{ backgroundColor: BRAND }}
      >
        {booking.guest_name || booking.booking_code}
      </motion.button>
      <CursorTooltip cursor={cursor}>
        <p className="font-mono font-semibold text-foreground mb-0.5">{booking.booking_code}</p>
        <p className="text-foreground font-semibold mb-2">{booking.guest_name}</p>
        <div className="space-y-0.5">
          <div className="flex justify-between gap-2"><span className="text-foreground">Check-in</span><span className="text-foreground tabular-nums">{booking.check_in}</span></div>
          <div className="flex justify-between gap-2"><span className="text-foreground">Check-out</span><span className="text-foreground tabular-nums">{booking.check_out}</span></div>
          <div className="flex justify-between gap-2 pt-1 border-t border-border mt-1">
            <span className="text-foreground">Total</span>
            <span className="text-foreground tabular-nums font-semibold">{formatMoney(booking.total_amount)}</span>
          </div>
          {bookerComm > 0 && (
            <div className="flex justify-between gap-2"><span className="text-foreground">Booker comm.</span><span className="text-foreground tabular-nums">{formatMoney(bookerComm)}</span></div>
          )}
          {affiliateComm > 0 && (
            <div className="flex justify-between gap-2"><span className="text-foreground">Affiliate comm.</span><span className="text-foreground tabular-nums">{formatMoney(affiliateComm)}</span></div>
          )}
        </div>
      </CursorTooltip>
    </>
  )
}

function CalendarCleaningChip({ cleaning, selected, onSelect }) {
  const { cursor, onMove, onLeave } = useCursorTooltip()
  const housekeeper = Number(cleaning.payment_amount || 0)
  const laundry = Number(cleaning.laundry_payment_amount || 0)

  return (
    <>
      <motion.button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect?.() }}
        onMouseEnter={onMove}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate italic cursor-pointer',
          selected && 'ring-2 ring-offset-1 ring-offset-card ring-white',
        )}
        style={{ backgroundColor: CLEAN_COLOR }}
      >
        <Sparkles size={9} className="inline mr-1" />
        {cleaning.type || 'cleaning'}
      </motion.button>
      <CursorTooltip cursor={cursor}>
        <p className="font-semibold text-foreground mb-1.5">Cleaning</p>
        <div className="space-y-0.5">
          <div className="flex justify-between gap-2"><span className="text-foreground">Code</span><span className="text-foreground font-mono font-semibold">{cleaning.cleaning_code || '—'}</span></div>
          <div className="flex justify-between gap-2"><span className="text-foreground">Type</span><span className="text-foreground capitalize font-semibold">{cleaning.type || '—'}</span></div>
          <div className="flex justify-between gap-2"><span className="text-foreground">Status</span><span className="text-foreground font-semibold">{cleaning.status || '—'}</span></div>
          <div className="flex justify-between gap-2"><span className="text-foreground">Scheduled</span><span className="text-foreground tabular-nums">{cleaning.scheduled_date || '—'}</span></div>
          <div className="flex justify-between gap-2 pt-1 border-t border-border mt-1">
            <span className="text-foreground">Housekeeper</span>
            <span className="text-foreground tabular-nums font-semibold">{formatMoney(housekeeper)}</span>
          </div>
          {laundry > 0 && (
            <div className="flex justify-between gap-2"><span className="text-foreground">Laundry</span><span className="text-foreground tabular-nums font-semibold">{formatMoney(laundry)}</span></div>
          )}
        </div>
      </CursorTooltip>
    </>
  )
}

function MonthSelector({ options, selectedMonth, onSelectMonth }) {
  const idx = options.findIndex((s) => s.month === selectedMonth)
  const canPrev = idx >= 0 && idx < options.length - 1
  const canNext = idx > 0
  const currentLabel = selectedMonth ? monthLabel(selectedMonth) : 'No month'

  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex items-center gap-1 bg-muted/50 rounded-full p-1">
        <button
          type="button"
          onClick={() => canPrev && onSelectMonth(options[idx + 1].month)}
          disabled={!canPrev}
          className={cn(
            'p-1.5 rounded-full transition-colors',
            canPrev ? 'hover:bg-muted text-foreground' : 'opacity-30 cursor-not-allowed'
          )}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[12px] font-bold tabular-nums text-foreground px-3 min-w-[120px] text-center">
          {currentLabel}
        </span>
        <button
          type="button"
          onClick={() => canNext && onSelectMonth(options[idx - 1].month)}
          disabled={!canNext}
          className={cn(
            'p-1.5 rounded-full transition-colors',
            canNext ? 'hover:bg-muted text-foreground' : 'opacity-30 cursor-not-allowed'
          )}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, mono = false }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 min-w-0">
      <span className="text-[11px] font-semibold text-foreground min-w-[72px] flex-shrink-0">{label}</span>
      <span className={cn('text-xs text-foreground truncate', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function SidebarSection({ title, action, children }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        {action}
      </div>
      <CardBody><div className="p-3">{children}</div></CardBody>
    </div>
  )
}

function ContractSidebar({ contract, onBack }) {
  return (
    <aside className="w-full lg:w-[280px] flex-shrink-0 lg:overflow-y-auto lg:border-r border-border p-3 space-y-4">
      <CardBody>
        <div className="p-3">
          <div className="flex items-start gap-2 mb-2">
            <button type="button" onClick={onBack} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0 -ml-1" title="Back to list">
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono text-sm font-bold text-foreground truncate">{contract.units?.unit_code || '—'}</p>
                <StatusText status={deriveContractStatus(contract)} />
              </div>
              <p className="text-xs text-foreground truncate mt-0.5">{contract.units?.building || '—'}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{contract.contract_code || '—'} · {contract.owners?.name || 'No owner'}</p>
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-muted text-foreground">
              {OWNER_SPLIT_PCT}/{COMPANY_SPLIT_PCT}
            </span>
          </div>
        </div>
      </CardBody>

      <SidebarSection title="Contract Details">
        <div className="space-y-0.5">
          <Field label="Code" value={contract.contract_code || '—'} mono />
          <Field label="Effective" value={contract.effective_date || '—'} mono />
          <Field label="Expiry" value={contract.expiry_date ? contract.expiry_date : <span className="italic text-muted-foreground">Open-ended</span>} mono />
          <Field label="Split" value={<span className="font-semibold">{OWNER_SPLIT_PCT}/{COMPANY_SPLIT_PCT}</span>} />
        </div>
        <div className="pt-2 mt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground italic">
            Contract PDF is available on the Contracts page.
          </p>
        </div>
        {contract.notes && (
          <div className="pt-2 mt-2 border-t border-border">
            <p className="text-[11px] font-semibold text-foreground mb-1">Notes</p>
            <p className="text-[11px] text-foreground whitespace-pre-wrap break-words">{contract.notes}</p>
          </div>
        )}
      </SidebarSection>

      <SidebarSection title="Owner Details">
        <div className="space-y-0.5">
          <Field label="Name" value={contract.owners?.name || '—'} />
          <Field label="Email" value={contract.owners?.email || '—'} />
          <Field label="Phone" value={contract.owners?.phone || '—'} />
          <Field label="Unit" value={contract.units?.unit_code || '—'} mono />
          <Field label="Building" value={contract.units?.building || '—'} />
        </div>
      </SidebarSection>
    </aside>
  )
}

function GeneralStatistics({
  lifetime, statements, yearSections, selectedYear, onSelectYear, contract, bookings,
}) {
  const totalBookings = statements.reduce((sum, s) => sum + s.bookingsList.length, 0)
  const totalCleanings = statements.reduce((sum, s) => sum + s.cleaningsList.length, 0)

  const occupancy = useMemo(
    () => computeContractOccupancy(contract.effective_date, contract.expiry_date, bookings),
    [contract.effective_date, contract.expiry_date, bookings]
  )

  const chartTitle = spansFullYear(contract.effective_date, contract.expiry_date)
    ? 'Yearly Revenue'
    : 'Months Revenue'

  return (
    <div className="space-y-4">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-1 pb-2"
      >
        <StatCard label="Total Bookings" value={totalBookings} icon={Home} />
        <StatCard label="Total Cleanings" value={totalCleanings} icon={Sparkles} />
        <StatCard label="Total Revenue" value={formatMoney(lifetime.gross)} icon={TrendingUp} />
        <StatCard label="Total Expenses" value={formatMoney(lifetime.expenses)} icon={Wallet} />
        <StatCard label="Total Net" value={formatMoney(lifetime.net)} icon={TrendingUp} />
      </motion.div>

      <YearlyRevenueChart
        yearSections={yearSections}
        statements={statements}
        selectedYear={selectedYear}
        title={chartTitle}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <MonthlyOccupancyChart
          statements={statements}
          selectedYear={selectedYear}
          contract={contract}
        />

        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <Home size={16} className="text-foreground flex-shrink-0" />
            <h3 className="text-base font-semibold text-foreground truncate">Contract Occupancy</h3>
          </div>
          <CardBody className="flex-1">
            <div className="p-3 h-full min-h-[292px] flex items-center justify-center">
              <HalfGauge pct={occupancy.pct} sublabel={`${occupancy.nights} of ${occupancy.totalNights} nights`} />
            </div>
          </CardBody>
        </div>

        <CumulativeNetChart
          statements={statements}
          selectedYear={selectedYear}
        />
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      className="rounded-md bg-card border border-border shadow-sm p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-foreground truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground truncate">{value}</p>
    </motion.div>
  )
}

function MonthlyLedger({ statements, selectedMonth, onSelectMonth }) {
  const ordered = useMemo(
    () => [...statements].sort((a, b) => a.month.localeCompare(b.month)),
    [statements]
  )

  const lifetime = useMemo(() => computeLifetime(ordered), [ordered])

  if (ordered.length === 0) {
    return (
      <CardBody>
        <div className="p-4 text-xs text-muted-foreground italic">
          No months on this contract yet
        </div>
      </CardBody>
    )
  }

  const ROW = 'grid grid-cols-[110px_1fr_1fr_1fr_1fr] gap-4 items-center'

  return (
    <CardBody>
      <div className={cn('px-4 py-2 border-b border-border bg-muted/20 sticky top-0 z-10', ROW)}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">Gross</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">Expenses</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">Net</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">PM Payout</span>
      </div>

      <div className="max-h-[340px] overflow-y-auto">
        {ordered.map((s) => {
          const isSelected = s.month === selectedMonth
          const [y, m] = s.month.split('-').map(Number)
          const label = `${MONTHS_SHORT[m - 1]} ${y}`

          return (
            <button
              key={s.month}
              type="button"
              onClick={() => onSelectMonth(s.month)}
              className={cn(
                'w-full text-left px-4 py-2.5 border-b border-border last:border-0 transition-colors cursor-pointer',
                ROW,
                isSelected ? 'bg-[#2d568e]/10 hover:bg-[#2d568e]/15' : 'hover:bg-muted/40'
              )}
            >
              <span className={cn('text-xs font-semibold tabular-nums', isSelected ? 'text-[#2d568e]' : 'text-foreground')}>
                {label}
              </span>
              <span className="text-xs tabular-nums text-foreground text-right">
                {formatMoney(s.grossRevenue)}
              </span>
              <span className="text-xs tabular-nums text-foreground text-right">
                {formatMoney(s.totalExpenses)}
              </span>
              <span className={cn(
                'text-xs tabular-nums font-semibold text-right',
                s.netProfit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
              )}>
                {formatMoney(s.netProfit)}
              </span>
              <span className={cn(
                'text-xs tabular-nums text-right',
                Number(s.pmShare) > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'
              )}>
                {Number(s.pmShare) > 0 ? formatMoney(s.pmShare) : '—'}
              </span>
            </button>
          )
        })}
      </div>

      <div className={cn('px-4 py-2.5 border-t-2 border-border bg-muted/30', ROW)}>
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">Lifetime</span>
        <span className="text-xs font-bold tabular-nums text-foreground text-right">
          {formatMoney(lifetime.gross)}
        </span>
        <span className="text-xs font-bold tabular-nums text-foreground text-right">
          {formatMoney(lifetime.expenses)}
        </span>
        <span className={cn(
          'text-xs font-bold tabular-nums text-right',
          lifetime.net < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
        )}>
          {formatMoney(lifetime.net)}
        </span>
        <span className="text-xs font-bold tabular-nums text-right text-foreground">
          {lifetime.pm > 0 ? formatMoney(lifetime.pm) : '—'}
        </span>
      </div>
    </CardBody>
  )
}

function ExpenseImageControl({ path, onUpload, onRemove, contractId, size = 'md' }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [thumbUrl, setThumbUrl] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!path) { setThumbUrl(null); return }
    getSignedUrl(path)
      .then((u) => { if (!cancelled) setThumbUrl(u) })
      .catch(() => { if (!cancelled) setThumbUrl(null) })
    return () => { cancelled = true }
  }, [path])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const newPath = await uploadExpenseImage(file, contractId)
      await onUpload(newPath)
      toast.success('Image uploaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to upload')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!path) return
    if (!window.confirm('Remove this image?')) return
    try {
      await onRemove(path)
      toast.success('Image removed')
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove')
    }
  }

  const sizeClasses =
    size === 'lg' ? 'w-14 h-14' :
    size === 'sm' ? 'w-7 h-7' :
    'w-9 h-9'

  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 11 : 12

  return (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />

      {path ? (
        <div className="relative group/img flex-shrink-0">
          <button
            type="button"
            onClick={() => thumbUrl && setLightboxUrl(thumbUrl)}
            className={cn('rounded-md overflow-hidden border border-border bg-muted', sizeClasses)}
            title="View"
          >
            {thumbUrl ? (
              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={iconSize} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
            title="Remove"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn('rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-muted/50 disabled:opacity-50 flex-shrink-0', sizeClasses)}
          title="Attach proof"
        >
          {uploading ? <Loader2 size={iconSize} className="animate-spin" /> : <Camera size={iconSize} />}
        </button>
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[10001] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null) }}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X size={20} />
          </button>
          <img src={lightboxUrl} alt="" className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}

async function upsertRow({ contract, month, existingId, patch, auditLabel }) {
  const monthDate = monthKeyToDate(month).toISOString().slice(0, 10)
  const payload = { contract_id: contract.id, month: monthDate, ...patch }

  if (existingId) {
    const { error } = await supabase.from('contract_monthly_expenses').update(payload).eq('id', existingId)
    if (error) throw error
    logAudit(auditLabel, 'contract_monthly_expenses', existingId, { contract_id: contract.id, month: monthDate, ...patch }).catch(() => {})
  } else {
    const { data, error } = await supabase.from('contract_monthly_expenses').insert(payload).select('id').single()
    if (error) throw error
    logAudit(auditLabel, 'contract_monthly_expenses', data?.id || null, { contract_id: contract.id, month: monthDate, ...patch }).catch(() => {})
  }
}

function CustomItemRow({ item, contractId, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(item.name)
  const [draftAmount, setDraftAmount] = useState(String(item.amount))
  const [draftImage, setDraftImage] = useState(item.image || null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraftName(item.name)
    setDraftAmount(String(item.amount))
    setDraftImage(item.image || null)
  }, [item])

  const save = async () => {
    setBusy(true)
    try { await onUpdate(item.id, { name: draftName, amount: draftAmount, image: draftImage }) }
    finally { setBusy(false); setEditing(false) }
  }

  const remove = async () => {
    if (!window.confirm(`Remove "${item.name}"?`)) return
    setBusy(true)
    try { await onRemove(item.id) }
    finally { setBusy(false) }
  }

  if (editing) {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-1.5">
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={80} placeholder="Name" className="h-7 text-xs rounded" />
          <Input type="number" min={0} value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} className="h-7 text-xs rounded tabular-nums" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-foreground">Proof</span>
          <ExpenseImageControl
            path={draftImage}
            contractId={contractId}
            onUpload={(path) => setDraftImage(path)}
            onRemove={() => setDraftImage(null)}
            size="sm"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="h-6 rounded text-[10px]" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" className="h-6 rounded text-[10px]" onClick={save} disabled={busy} style={{ backgroundColor: BRAND }}>
            {busy ? <Loader2 size={10} className="animate-spin mr-1" /> : <Save size={10} className="mr-1" />}
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-background">
      <span className="text-xs text-foreground flex-1 truncate">{item.name}</span>
      <span className="text-xs font-semibold tabular-nums text-foreground">{formatMoney(item.amount)}</span>
      <ExpenseImageControl
        path={item.image}
        contractId={contractId}
        onUpload={async (path) => { await onUpdate(item.id, { name: item.name, amount: item.amount, image: path }) }}
        onRemove={async () => { await onUpdate(item.id, { name: item.name, amount: item.amount, image: null }) }}
        size="sm"
      />
      <button type="button" onClick={() => setEditing(true)} disabled={busy} className="p-1 rounded hover:bg-muted text-foreground disabled:opacity-50" title="Edit">
        <Pencil size={11} />
      </button>
      <button type="button" onClick={remove} disabled={busy} className="p-1 rounded hover:bg-red-500/10 text-foreground hover:text-red-500 disabled:opacity-50" title="Remove">
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
      </button>
    </div>
  )
}

function AddExpenseModal({ open, onClose, onSubmit, contractId }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [imagePath, setImagePath] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setName(''); setAmount(''); setImagePath(null); setBusy(false) }
  }, [open])

  if (!open) return null

  const submit = async () => {
    setBusy(true)
    try { await onSubmit({ name, amount, image: imagePath }) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-md w-full border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Add Expense</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-foreground mb-1 block">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Repairs, Linen, etc." className="h-8 text-xs rounded" autoFocus />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-foreground mb-1 block">Amount (₱)</label>
            <Input type="number" min={0} max={100000000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-8 text-xs rounded tabular-nums" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-foreground mb-1 block">Proof (optional)</label>
            <div className="flex items-center gap-3">
              <ExpenseImageControl
                path={imagePath}
                contractId={contractId}
                onUpload={(path) => setImagePath(path)}
                onRemove={() => setImagePath(null)}
                size="lg"
              />
              <span className="text-[10px] text-muted-foreground">
                Click the box to attach a receipt or proof photo
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={submit} disabled={busy} style={{ backgroundColor: BRAND }}>
            {busy ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
            {busy ? 'Adding…' : 'Add Expense'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function ExpenseLine({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <Icon size={11} className="text-muted-foreground flex-shrink-0" />
      <span className="text-foreground flex-1 truncate">{label}</span>
      <span className="tabular-nums font-semibold text-foreground">{formatMoney(value)}</span>
    </div>
  )
}

function TotalLine({ label, value, bold = false }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-foreground">{label}</span>
      <span className={cn('tabular-nums text-foreground', bold && 'font-bold')}>{formatMoney(value)}</span>
    </div>
  )
}

function ExpensesPanel({ statement, contract, onChanged }) {
  const [editingFixed, setEditingFixed] = useState(false)
  const [draftFixed, setDraftFixed] = useState({
    electricity: statement.electricity,
    internet: statement.internet,
    water: statement.water,
    marketing: statement.marketing,
  })
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    setDraftFixed({
      electricity: statement.electricity,
      internet: statement.internet,
      water: statement.water,
      marketing: statement.marketing,
    })
    setEditingFixed(false)
    setAddOpen(false)
  }, [statement.month])

  const saveFixed = async () => {
    setSaving(true)
    try {
      await upsertRow({
        contract,
        month: statement.month,
        existingId: statement.manualRow?.id,
        patch: {
          electricity: sanitizeMoney(draftFixed.electricity),
          internet: sanitizeMoney(draftFixed.internet),
          water: sanitizeMoney(draftFixed.water),
          marketing: sanitizeMoney(draftFixed.marketing),
        },
        auditLabel: 'UPDATE_CONTRACT_EXPENSES',
      })
      toast.success('Expenses saved')
      setEditingFixed(false)
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const setFixedImage = async (field, newPath) => {
    const imageField = `${field}_image`
    await upsertRow({
      contract,
      month: statement.month,
      existingId: statement.manualRow?.id,
      patch: { [imageField]: newPath },
      auditLabel: `SET_EXPENSE_IMAGE:${field}`,
    })
    onChanged()
  }

  const clearFixed = async () => {
    if (!statement.manualRow?.id) return
    if (!window.confirm(`Clear ALL manual expenses for ${monthLabel(statement.month)}? Custom items and images will also be removed.`)) return
    setSaving(true)
    try {
      const paths = [
        statement.manualRow?.electricity_image,
        statement.manualRow?.internet_image,
        statement.manualRow?.water_image,
        statement.manualRow?.marketing_image,
        ...(statement.customItems || []).map((x) => x.image),
      ].filter(Boolean)
      await Promise.all(paths.map((p) => deleteExpenseImage(p)))

      const { error } = await supabase.from('contract_monthly_expenses').delete().eq('id', statement.manualRow.id)
      if (error) throw error
      toast.success('Cleared')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error('Failed to clear')
    } finally {
      setSaving(false)
    }
  }

  const addCustomItem = async ({ name, amount, image }) => {
    const cleaned = sanitizeText(name, { max: 80 })
    const amt = sanitizeMoney(amount)
    if (!cleaned) throw new Error('Name is required')
    if (amt <= 0) throw new Error('Amount must be greater than 0')
    const next = [...statement.customItems, {
      id: `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleaned,
      amount: amt,
      image: image || null,
    }]
    await upsertRow({
      contract, month: statement.month, existingId: statement.manualRow?.id,
      patch: { custom_items: next }, auditLabel: 'ADD_CUSTOM_EXPENSE',
    })
    onChanged()
  }

  const removeCustomItem = async (id) => {
    const item = statement.customItems.find((x) => x.id === id)
    if (item?.image) await deleteExpenseImage(item.image)
    const next = statement.customItems.filter((x) => x.id !== id)
    await upsertRow({
      contract, month: statement.month, existingId: statement.manualRow?.id,
      patch: { custom_items: next }, auditLabel: 'REMOVE_CUSTOM_EXPENSE',
    })
    onChanged()
  }

  const updateCustomItem = async (id, { name, amount, image }) => {
    const cleaned = sanitizeText(name, { max: 80 })
    const amt = sanitizeMoney(amount)
    if (!cleaned) throw new Error('Name is required')
    if (amt <= 0) throw new Error('Amount must be greater than 0')
    const next = statement.customItems.map((x) => x.id === id
      ? { ...x, name: cleaned, amount: amt, image: image !== undefined ? image : x.image }
      : x
    )
    await upsertRow({
      contract, month: statement.month, existingId: statement.manualRow?.id,
      patch: { custom_items: next }, auditLabel: 'UPDATE_CUSTOM_EXPENSE',
    })
    onChanged()
  }

  const fixedExpenses = [
    { key: 'electricity', label: 'Electricity', icon: Zap,       value: statement.electricity, image: statement.manualRow?.electricity_image },
    { key: 'internet',    label: 'Internet',    icon: Wifi,      value: statement.internet,    image: statement.manualRow?.internet_image    },
    { key: 'water',       label: 'Water',       icon: Droplets,  value: statement.water,       image: statement.manualRow?.water_image       },
    { key: 'marketing',   label: 'Marketing',   icon: Megaphone, value: statement.marketing,   image: statement.manualRow?.marketing_image   },
  ]

  const autoComputed =
    statement.bookingCommission +
    statement.affiliateCommission +
    statement.housekeeping +
    statement.laundry
  const manualTotal =
    statement.electricity +
    statement.internet +
    statement.water +
    statement.marketing +
    statement.customTotal

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Wallet size={16} className="text-foreground" />
        <h3 className="text-base font-semibold text-foreground">Expenses</h3>
      </div>

      <CardBody>
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">

          <div className="p-4 space-y-4 lg:sticky lg:top-0 self-start">
            <div>
              <p className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Lock size={11} /> Auto-computed
              </p>
              <div className="space-y-0.5">
                <ExpenseLine icon={Wallet}   label="Booking commission"   value={statement.bookingCommission} />
                <ExpenseLine icon={Wallet}   label="Affiliate commission" value={statement.affiliateCommission} />
                <ExpenseLine icon={Sparkles} label="Housekeeping"         value={statement.housekeeping} />
                <ExpenseLine icon={Sparkles} label="Laundry"              value={statement.laundry} />
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-1.5">
              <TotalLine label="Auto-computed" value={autoComputed} />
              <TotalLine label="Manual"        value={manualTotal} />
              <div className="pt-2 mt-1 border-t border-border">
                <TotalLine label="Total expenses" value={statement.totalExpenses} bold />
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="max-h-[520px] overflow-y-auto pr-1 space-y-4">

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-foreground">Manual (fixed)</p>
                  {!editingFixed && (
                    <div className="flex items-center gap-2">
                      {statement.manualRow && (
                        <button type="button" onClick={clearFixed} disabled={saving} className="text-[11px] font-semibold text-red-500 hover:underline disabled:opacity-50">
                          Clear all
                        </button>
                      )}
                      <button type="button" onClick={() => setEditingFixed(true)} className="text-[11px] font-semibold text-primary hover:underline">
                        Edit
                      </button>
                    </div>
                  )}
                </div>

                {editingFixed ? (
                  <div className="space-y-2">
                    {fixedExpenses.map((f) => (
                      <div
                        key={f.key}
                        className="grid grid-cols-[auto_1fr_140px_auto] items-center gap-3 px-3 py-2 rounded-md border border-primary/40 bg-primary/5"
                      >
                        <f.icon size={16} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-foreground font-medium truncate">{f.label}</span>
                        <Input
                          type="number"
                          min={0}
                          value={draftFixed[f.key]}
                          onChange={(e) => setDraftFixed((p) => ({ ...p, [f.key]: e.target.value }))}
                          className="h-8 text-xs rounded tabular-nums"
                        />
                        <ExpenseImageControl
                          path={f.image}
                          contractId={contract.id}
                          onUpload={(path) => setFixedImage(f.key, path)}
                          onRemove={() => setFixedImage(f.key, null)}
                          size="lg"
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button size="sm" variant="outline" className="h-8 rounded text-[11px]" onClick={() => setEditingFixed(false)} disabled={saving}>Cancel</Button>
                      <Button size="sm" className="h-8 rounded text-[11px]" onClick={saveFixed} disabled={saving} style={{ backgroundColor: BRAND }}>
                        {saving ? <Loader2 size={11} className="animate-spin mr-1" /> : <Save size={11} className="mr-1" />}
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fixedExpenses.map((f) => (
                      <div
                        key={f.key}
                        className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2 rounded-md border border-border bg-background"
                      >
                        <f.icon size={16} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-foreground font-medium truncate">{f.label}</span>
                        <span className="tabular-nums font-semibold text-foreground text-base">
                          {formatMoney(f.value)}
                        </span>
                        <ExpenseImageControl
                          path={f.image}
                          contractId={contract.id}
                          onUpload={(path) => setFixedImage(f.key, path)}
                          onRemove={() => setFixedImage(f.key, null)}
                          size="lg"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-foreground">Custom · {statement.customItems.length}</p>
                  <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                    <Plus size={11} /> Add
                  </button>
                </div>
                {statement.customItems.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic py-1">No custom expenses this month</p>
                ) : (
                  <div className="space-y-1.5">
                    {statement.customItems.map((item) => (
                      <CustomItemRow
                        key={item.id}
                        item={item}
                        contractId={contract.id}
                        onUpdate={updateCustomItem}
                        onRemove={removeCustomItem}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>

        <AddExpenseModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          contractId={contract.id}
          onSubmit={async (data) => {
            try {
              await addCustomItem(data)
              toast.success('Expense added')
              setAddOpen(false)
            } catch (err) {
              toast.error(err?.message || 'Failed to add')
            }
          }}
        />
      </CardBody>
    </div>
  )
}

function monthKeyFromDate(iso) {
  if (!iso) return null
  const s = String(iso).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s.slice(0, 7)
}

function AccountingBookingRow({ booking, isSelected, onClick }) {
  const navigate = useNavigate()

  const contextItems = [
    {
      label: 'See in Bookings',
      icon: Calendar,
      onSelect: () => navigate(`/admin?tab=bookings&booking=${booking.id}`),
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
  ]

  const bookerLabel = booking.booker_name || booking.booker_code || '—'
  const affiliateLabel = booking.affiliate_name || booking.affiliate_code || '—'

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative w-full text-left rounded-md border bg-background py-2.5 pl-5 pr-3 min-w-0 transition-colors overflow-hidden',
          isSelected
            ? 'border-primary ring-1 ring-primary/30'
            : 'border-border hover:bg-muted/40',
        )}
      >
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-[4px]"
          style={{ backgroundColor: '#2d568e' }}
        />

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] text-foreground flex-shrink-0">{booking.booking_code}</span>
          <span className="text-xs font-semibold tabular-nums text-foreground ml-auto flex-shrink-0">
            {formatMoney(booking.total_amount)}
          </span>
        </div>

        <div className="mt-1 text-[11px] text-muted-foreground tabular-nums truncate">
          {booking.check_in ? formatDateShort(booking.check_in) : '—'} → {booking.check_out ? formatDateShort(booking.check_out) : '—'}
        </div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground min-w-0 flex-wrap">
          <span className="truncate">
            Booker <span className="text-foreground font-semibold">{bookerLabel}</span>
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate">
            Affiliate <span className="text-foreground font-semibold">{affiliateLabel}</span>
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground min-w-0 flex-wrap">
          <span className="tabular-nums">
            Booker comm. <span className="text-foreground font-semibold">{formatMoney(booking.booker_commission || 0)}</span>
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums">
            Affiliate comm. <span className="text-foreground font-semibold">{formatMoney(booking.affiliate_commission || 0)}</span>
          </span>
        </div>
      </button>
    </ContextMenu>
  )
}

function AccountingCleaningRow({ cleaning, isSelected, onClick }) {
  const navigate = useNavigate()
  const hk = Number(cleaning.payment_amount || 0)
  const laundry = Number(cleaning.laundry_payment_amount || 0)

  const contextItems = [
    {
      label: 'See in Cleanings',
      icon: Sparkles,
      onSelect: () => navigate(`/admin?tab=housekeeping&cleaning=${cleaning.id}`),
    },
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
  ]

  return (
    <ContextMenu items={contextItems}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative w-full text-left rounded-md border bg-background py-2.5 pl-5 pr-3 min-w-0 transition-colors overflow-hidden',
          isSelected
            ? 'border-primary ring-1 ring-primary/30'
            : 'border-border hover:bg-muted/40',
        )}
      >
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-[4px]"
          style={{ backgroundColor: '#10b981' }}
        />

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] text-foreground flex-shrink-0">{cleaning.cleaning_code || '—'}</span>
          <span className="text-xs font-semibold capitalize text-foreground truncate flex-1">
            {cleaning.type || '—'}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground min-w-0 flex-wrap">
          <span className="tabular-nums">
            Housekeeper <span className="text-foreground font-semibold">{formatMoney(hk)}</span>
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums">
            Laundry <span className="text-foreground font-semibold">{formatMoney(laundry)}</span>
          </span>
        </div>
      </button>
    </ContextMenu>
  )
}

function MonthlySection({
  statements,
  selectedMonth,
  onSelectMonth,
  contract,
  cleanings,
  monthlyExpenses,
  onChanged,
  yearSections,
  selectedYear,
  onSelectYear,
  allBookings,
  allCleanings,
}) {
  const options = useMemo(() => [...statements].reverse(), [statements])
  const statement = statements.find((s) => s.month === selectedMonth) || null
  const [selectedCalendarId, setSelectedCalendarId] = useState(null)
  const [listTab, setListTab] = useState('bookings')
  const calendarRef = useRef(null)

  useEffect(() => {
    setSelectedCalendarId(null)
    setListTab('bookings')
  }, [contract.id, selectedMonth])

  const monthOccupancy = useMemo(() => {
    if (!statement) return null
    const [y, m] = statement.month.split('-').map(Number)
    const { nights, daysInMonth } = nightsInMonthFromBookings(statement.bookingsList, y, m, contract)
    return { pct: daysInMonth > 0 ? nights / daysInMonth : 0, nights, daysInMonth }
  }, [statement, contract])

  const defaultMonthKey = useMemo(() => {
    if (statements.length === 0) return selectedMonth
    const now = new Date()
    const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    if (statements.some((s) => s.month === currentKey)) return currentKey
    for (let i = statements.length - 1; i >= 0; i--) {
      const s = statements[i]
      if (s.grossRevenue > 0 || s.totalExpenses > 0 || s.manualRow) return s.month
    }
    return statements[statements.length - 1].month
  }, [statements, selectedMonth])

  const resetToDefaultMonth = useCallback(() => {
    if (defaultMonthKey && defaultMonthKey !== selectedMonth) {
      onSelectMonth(defaultMonthKey)
    }
  }, [defaultMonthKey, selectedMonth, onSelectMonth])

  const allBookingsSorted = useMemo(() => {
    return [...(allBookings || [])].sort((a, b) => {
      const av = a.check_in ?? ''
      const bv = b.check_in ?? ''
      if (av > bv) return -1
      if (av < bv) return 1
      return 0
    })
  }, [allBookings])

  const allCleaningsSorted = useMemo(() => {
    return [...(allCleanings || [])].sort((a, b) => {
      const av = a.scheduled_date ?? ''
      const bv = b.scheduled_date ?? ''
      if (av > bv) return -1
      if (av < bv) return 1
      return 0
    })
  }, [allCleanings])

  const focusBooking = useCallback((booking) => {
    if (!booking?.id) return
    const isSame = selectedCalendarId?.type === 'booking' && selectedCalendarId.id === booking.id
    if (isSame) {
      setSelectedCalendarId(null)
      resetToDefaultMonth()
      return
    }
    const mk = monthKeyFromDate(booking.check_in)
    const monthChanged = mk && mk !== selectedMonth
    if (monthChanged) onSelectMonth(mk)
    setSelectedCalendarId({ type: 'booking', id: booking.id })

    if (monthChanged) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      })
    }
  }, [selectedCalendarId, selectedMonth, onSelectMonth, resetToDefaultMonth])

  const focusCleaning = useCallback((cleaning) => {
    if (!cleaning?.id) return
    const isSame = selectedCalendarId?.type === 'cleaning' && selectedCalendarId.id === cleaning.id
    if (isSame) {
      setSelectedCalendarId(null)
      resetToDefaultMonth()
      return
    }
    const mk = monthKeyFromDate(cleaning.scheduled_date)
    const monthChanged = mk && mk !== selectedMonth
    if (monthChanged) onSelectMonth(mk)
    setSelectedCalendarId({ type: 'cleaning', id: cleaning.id })

    if (monthChanged) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      })
    }
  }, [selectedCalendarId, selectedMonth, onSelectMonth, resetToDefaultMonth])

  const clearFocus = useCallback(() => {
    setSelectedCalendarId(null)
    resetToDefaultMonth()
  }, [resetToDefaultMonth])

  const focusedBooking = useMemo(() => {
    if (selectedCalendarId?.type !== 'booking') return null
    return allBookingsSorted.find((b) => b.id === selectedCalendarId.id) || null
  }, [selectedCalendarId, allBookingsSorted])

  const focusedCleaning = useMemo(() => {
    if (selectedCalendarId?.type !== 'cleaning') return null
    return allCleaningsSorted.find((c) => c.id === selectedCalendarId.id) || null
  }, [selectedCalendarId, allCleaningsSorted])

  return (
    <div className="space-y-4">
      <MonthSelector options={options} selectedMonth={selectedMonth} onSelectMonth={onSelectMonth} />

      {!statement ? (
        <CardBody><div className="p-4 text-xs text-muted-foreground italic">Select a month to view details</div></CardBody>
      ) : (
        <>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-1 pb-2"
          >
            <MiniStat label="Gross Revenue" value={statement.grossRevenue} />
            <MiniStat label="Total Expenses" value={statement.totalExpenses} />
            <MiniStat label="Net Profit" value={statement.netProfit} />
            <MiniStat label="PM Payout" value={Number(statement.pmShare) || 0} />
            <MiniSplitStat label="Owner · Company" owner={statement.ownerShare} company={statement.companyShare} />
          </motion.div>

          {statement.pmName && (
            <div className="rounded-md bg-card border border-border shadow-sm p-3 flex items-center gap-3">
              <User size={14} className="text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-foreground flex-1 truncate">
                Property Manager <span className="font-semibold">{statement.pmName}</span> was active this month
              </p>
              <span className="text-xs font-semibold tabular-nums flex-shrink-0 text-foreground">
                {formatMoney(statement.pmShare)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <Home size={16} className="text-foreground flex-shrink-0" />
                <h3 className="text-base font-semibold text-foreground truncate">Month Occupancy</h3>
              </div>
              <CardBody className="flex-1">
                <div className="p-3 h-full flex flex-col items-center justify-center gap-4">
                  <HalfGauge
                    pct={monthOccupancy?.pct || 0}
                    sublabel={
                      monthOccupancy
                        ? `${monthOccupancy.nights} of ${monthOccupancy.daysInMonth} nights`
                        : '—'
                    }
                  />
                </div>
              </CardBody>
            </div>

            <div className="grid grid-rows-2 gap-3">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-md bg-card border border-border shadow-sm p-4 flex flex-col justify-between"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Home size={14} className="text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-foreground">Total Bookings</span>
                </div>
                <div>
                  <p className="text-3xl font-bold tabular-nums text-foreground">
                    {statement.bookingsList.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatMoney(statement.grossRevenue)} gross
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="rounded-md bg-card border border-border shadow-sm p-4 flex flex-col justify-between"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-foreground">Total Cleanings</span>
                </div>
                <div>
                  <p className="text-3xl font-bold tabular-nums text-foreground">
                    {statement.cleaningsList.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatMoney(statement.housekeeping + statement.laundry)} paid
                  </p>
                </div>
              </motion.div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <WeeklyOccupancyChart statement={statement} contract={contract} />
            <WeeklyCumulativeChart statement={statement} monthlyExpenses={monthlyExpenses} contract={contract} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            <div ref={calendarRef} className="space-y-4 scroll-mt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{monthLabel(statement.month)} Calendar</h3>
                <span className="text-[11px] text-foreground tabular-nums">
                  {statement.bookingsList.length} booking{statement.bookingsList.length === 1 ? '' : 's'} · {statement.cleaningsList.length} cleaning{statement.cleaningsList.length === 1 ? '' : 's'}
                </span>
              </div>

              <BookingCalendar
                month={statement.month}
                bookings={statement.bookingsList}
                cleanings={statement.cleaningsList}
                selectedId={selectedCalendarId}
                onSelect={(type, id) => {
                  const isSame = selectedCalendarId?.type === type && selectedCalendarId?.id === id
                  if (isSame) {
                    setSelectedCalendarId(null)
                    resetToDefaultMonth()
                    return
                  }
                  setSelectedCalendarId({ type, id })
                }}
              />
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setListTab('bookings')}
                  className={cn(
                    'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
                    listTab === 'bookings' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Bookings · {allBookingsSorted.length}
                </button>
                <button
                  type="button"
                  onClick={() => setListTab('cleanings')}
                  className={cn(
                    'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
                    listTab === 'cleanings' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Cleanings · {allCleaningsSorted.length}
                </button>
              </div>

              {listTab === 'bookings' ? (
                allBookingsSorted.length === 0 ? (
                  <CardBody><div className="p-3 text-xs text-muted-foreground italic">No bookings on this contract</div></CardBody>
                ) : (
                  <div className="space-y-1.5 max-h-[520px] overflow-y-auto overscroll-contain pr-1">
                    {allBookingsSorted.map((b) => {
                      const isSelected = selectedCalendarId?.type === 'booking' && selectedCalendarId.id === b.id
                      return (
                        <AccountingBookingRow
                          key={b.id}
                          booking={b}
                          isSelected={isSelected}
                          onClick={() => focusBooking(b)}
                        />
                      )
                    })}
                  </div>
                )
              ) : (
                allCleaningsSorted.length === 0 ? (
                  <CardBody><div className="p-3 text-xs text-muted-foreground italic">No cleanings on this contract</div></CardBody>
                ) : (
                  <div className="space-y-1.5 max-h-[520px] overflow-y-auto overscroll-contain pr-1">
                    {allCleaningsSorted.map((c) => {
                      const isSelected = selectedCalendarId?.type === 'cleaning' && selectedCalendarId.id === c.id
                      return (
                        <AccountingCleaningRow
                          key={c.id}
                          cleaning={c}
                          isSelected={isSelected}
                          onClick={() => focusCleaning(c)}
                        />
                      )
                    })}
                  </div>
                )
              )}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {focusedBooking && (
              <motion.div
                key={`booking-${focusedBooking.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="rounded-md bg-card border border-border shadow-sm p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-foreground truncate">{focusedBooking.booking_code}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{focusedBooking.guest_name}</p>
                  </div>
                  <button type="button" onClick={clearFocus} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Check-in</span><span className="tabular-nums text-foreground font-semibold">{focusedBooking.check_in}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Check-out</span><span className="tabular-nums text-foreground font-semibold">{focusedBooking.check_out}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Total</span><span className="tabular-nums text-foreground font-semibold">{formatMoney(focusedBooking.total_amount)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Guests</span><span className="tabular-nums text-foreground font-semibold">{focusedBooking.guests || 1}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Payment</span><span className="text-foreground font-semibold capitalize">{focusedBooking.payment_status || '—'}</span></div>
                  {Number(focusedBooking.booker_commission || 0) > 0 && (
                    <div className="flex justify-between text-[11px]"><span className="text-foreground">Booker commission</span><span className="tabular-nums text-foreground font-semibold">{formatMoney(focusedBooking.booker_commission)}</span></div>
                  )}
                  {Number(focusedBooking.affiliate_commission || 0) > 0 && (
                    <div className="flex justify-between text-[11px]"><span className="text-foreground">Affiliate commission</span><span className="tabular-nums text-foreground font-semibold">{formatMoney(focusedBooking.affiliate_commission)}</span></div>
                  )}
                </div>
              </motion.div>
            )}

            {focusedCleaning && (
              <motion.div
                key={`cleaning-${focusedCleaning.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="rounded-md bg-card border border-border shadow-sm p-3"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-foreground truncate">{focusedCleaning.cleaning_code || '—'}</p>
                    <p className="text-[11px] text-muted-foreground capitalize truncate">{focusedCleaning.type || 'cleaning'}</p>
                  </div>
                  <button type="button" onClick={clearFocus} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0">
                    <X size={12} />
                  </button>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Scheduled</span><span className="tabular-nums text-foreground font-semibold">{focusedCleaning.scheduled_date}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Status</span><span className="text-foreground font-semibold capitalize">{focusedCleaning.status || '—'}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Housekeeper</span><span className="text-foreground font-semibold tabular-nums">{formatMoney(focusedCleaning.payment_amount || 0)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-foreground">Laundry</span><span className="text-foreground font-semibold tabular-nums">{formatMoney(focusedCleaning.laundry_payment_amount || 0)}</span></div>
                  <div className="flex justify-between text-[11px] pt-1 border-t border-border mt-1">
                    <span className="text-foreground font-semibold">Total cost</span>
                    <span className="text-foreground font-bold tabular-nums">{formatMoney((focusedCleaning.payment_amount || 0) + (focusedCleaning.laundry_payment_amount || 0))}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ExpensesPanel statement={statement} contract={contract} onChanged={onChanged} />
        </>
      )}
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      className="rounded-md bg-card border border-border shadow-sm p-3"
    >
      <p className="text-[11px] font-semibold text-foreground mb-1 truncate">{label}</p>
      <p className="text-base font-bold tabular-nums text-foreground truncate">
        {formatMoney(value)}
      </p>
    </motion.div>
  )
}

function MiniSplitStat({ label, owner, company }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      className="rounded-md bg-card border border-border shadow-sm p-3"
    >
      <p className="text-[11px] font-semibold text-foreground mb-1">{label}</p>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-foreground">Owner</span>
          <span className="text-xs font-bold tabular-nums text-foreground">{formatMoney(owner)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-foreground">Company</span>
          <span className="text-xs font-bold tabular-nums text-foreground">{formatMoney(company)}</span>
        </div>
      </div>
    </motion.div>
  )
}

const ContractDetail = memo(function ContractDetail({ contract, onBack, onChanged }) {
  const [bookings, setBookings] = useState([])
  const [cleanings, setCleanings] = useState([])
  const [monthlyExpenses, setMonthlyExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  const contractId = contract?.id
  const contractUnitId = contract?.unit_id

  const fetchDetailData = useCallback(async () => {
    if (!contractId || !contractUnitId) return
    setLoading(true)
    try {
      const [bRes, clRes, exRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, unit_id, booking_code, guest_name, check_in, check_out, guests, total_amount, booker_commission, affiliate_commission, booker_name, booker_code, affiliate_name, affiliate_code, payment_status, balance, deleted_at')
          .eq('unit_id', contractUnitId)
          .is('deleted_at', null),
        supabase
          .from('cleanings')
          .select('id, cleaning_code, unit_id, type, scheduled_date, status, payment_amount, laundry_payment_amount, photos_before, photos_after, photos_report')
          .eq('unit_id', contractUnitId),
        supabase
          .from('contract_monthly_expenses')
          .select('*')
          .eq('contract_id', contractId),
      ])
      if (bRes.error) throw bRes.error
      if (clRes.error) throw clRes.error
      if (exRes.error) throw exRes.error
      setBookings(bRes.data || [])
      setCleanings(clRes.data || [])
      setMonthlyExpenses(exRes.data || [])
    } catch (err) {
      console.error('Failed to load contract detail:', err)
      toast.error('Failed to load contract detail')
    } finally {
      setLoading(false)
    }
  }, [contractId, contractUnitId])

  useEffect(() => { fetchDetailData() }, [fetchDetailData])

  useEffect(() => {
    if (!contractUnitId) return

    let timer = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fetchDetailData(), DETAIL_REFRESH_DEBOUNCE_MS)
    }

    const ch = supabase
      .channel(`contract-detail-${contractId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `unit_id=eq.${contractUnitId}` },
        schedule)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cleanings', filter: `unit_id=eq.${contractUnitId}` },
        schedule)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contract_monthly_expenses', filter: `contract_id=eq.${contractId}` },
        schedule)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(ch)
    }
  }, [contractId, contractUnitId, fetchDetailData])

  const effectiveDate = useMemo(() => contract.effective_date || null, [contract.effective_date])
  const expiryDate = useMemo(() => contract.expiry_date || null, [contract.expiry_date])

  const [statements, setStatements] = useState([])
  const [statementsLoading, setStatementsLoading] = useState(true)

  useEffect(() => {
    if (!contractId) return

    let cancelled = false
    setStatementsLoading(true)

    fetchContractMonthlyBreakdown(contractId)
      .then((rows) => {
        if (cancelled) return

        const merged = rows.map((row) => {
          const [y, m] = row.month.split('-').map(Number)
          const monthStartDate = new Date(Date.UTC(y, m - 1, 1))
          const monthEndDate   = new Date(Date.UTC(y, m, 1))

          const inMonth = (d) => {
            if (!d) return false
            const dt = new Date(d + 'T00:00:00Z')
            return dt >= monthStartDate && dt < monthEndDate
          }

          const monthBookings = (bookings || []).filter((b) => inMonth(b.check_in))
          const monthCleanings = (cleanings || []).filter((c) => inMonth(c.scheduled_date))
          const manualRow = (monthlyExpenses || []).find((e) =>
            typeof e.month === 'string' && e.month.startsWith(row.month)
          ) || null

          const customItems = manualRow && Array.isArray(manualRow.custom_items)
            ? manualRow.custom_items
                .filter((x) => x && typeof x === 'object')
                .map((x) => ({
                  id:     typeof x.id === 'string' && x.id ? x.id : `ci_${Math.random().toString(36).slice(2, 10)}`,
                  name:   typeof x.name === 'string' ? x.name.slice(0, 80) : '',
                  amount: Number(x.amount) || 0,
                  image:  typeof x.image === 'string' ? x.image : null,
                }))
                .filter((x) => x.name.length > 0)
            : []

          return {
            ...row,
            bookingsList:  monthBookings,
            cleaningsList: monthCleanings,
            manualRow,
            customItems,
          }
        })

        setStatements(merged)
      })
      .catch((err) => {
        console.error('Failed to load monthly breakdown:', err)
        toast.error('Failed to load monthly breakdown')
      })
      .finally(() => {
        if (!cancelled) setStatementsLoading(false)
      })

    return () => { cancelled = true }
  }, [contractId, bookings, cleanings, monthlyExpenses])

  const lifetime = useMemo(() => computeLifetime(statements), [statements])

  const yearSections = useMemo(
    () => buildYearSections(effectiveDate, expiryDate),
    [effectiveDate, expiryDate]
  )

  const [selectedYear, setSelectedYear] = useState(() => pickDefaultYear(yearSections) ?? new Date().getUTCFullYear())

  useEffect(() => {
    const defaultY = pickDefaultYear(yearSections)
    if (defaultY != null && !yearSections.some((s) => s.year === selectedYear)) {
      setSelectedYear(defaultY)
    }
  }, [yearSections, selectedYear])

  const defaultMonth = useMemo(() => {
    if (statements.length === 0) return null
    const now = new Date()
    const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const current = statements.find((s) => s.month === currentKey)
    if (current) return current.month
    for (let i = statements.length - 1; i >= 0; i--) {
      const s = statements[i]
      if (s.grossRevenue > 0 || s.totalExpenses > 0 || s.manualRow) return s.month
    }
    return statements[statements.length - 1].month
  }, [statements])

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)
  useEffect(() => {
    if (!selectedMonth && defaultMonth) setSelectedMonth(defaultMonth)
  }, [defaultMonth, selectedMonth])

  const monthSectionRef = useRef(null)
  const shouldScrollRef = useRef(false)

  const handleJumpToMonth = useCallback((monthKey) => {
    shouldScrollRef.current = true
    setSelectedMonth(monthKey)
  }, [])

  useLayoutEffect(() => {
    if (!shouldScrollRef.current) return
    shouldScrollRef.current = false
    monthSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedMonth])

  const parentRefreshTimer = useRef(null)

  const handleChanged = useCallback(() => {
    fetchDetailData()
    if (parentRefreshTimer.current) clearTimeout(parentRefreshTimer.current)
    parentRefreshTimer.current = setTimeout(() => {
      onChanged?.()
    }, PARENT_REFRESH_DEBOUNCE_MS)
  }, [fetchDetailData, onChanged])

  useEffect(() => () => {
    if (parentRefreshTimer.current) {
      clearTimeout(parentRefreshTimer.current)
      parentRefreshTimer.current = null
      onChanged?.()
    }
  }, [onChanged])

  if ((loading || statementsLoading) && statements.length === 0) {
    return (
      <div className="h-full flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <ContractSidebar contract={contract} onBack={onBack} />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0 overflow-hidden">
      <ContractSidebar contract={contract} onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        <section>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-foreground flex-shrink-0" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">General Statistics</h2>
          </div>
          <div className="flex items-center justify-center mb-3">
            <YearNav
              yearSections={yearSections}
              selectedYear={selectedYear}
              onSelectYear={setSelectedYear}
            />
          </div>
          <GeneralStatistics
            lifetime={lifetime}
            statements={statements}
            yearSections={yearSections}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            contract={contract}
            bookings={bookings}
          />
        </section>

        <section>
          <SectionHeader icon={Calendar} title="Monthly Ledger" />
          <MonthlyLedger
            statements={statements}
            selectedMonth={selectedMonth}
            onSelectMonth={handleJumpToMonth}
          />
        </section>

        <section ref={monthSectionRef} className="scroll-mt-4">
          <SectionHeader icon={Calendar} title="Specific Month" />
          <MonthlySection
            statements={statements}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            contract={contract}
            cleanings={cleanings}
            monthlyExpenses={monthlyExpenses}
            onChanged={handleChanged}
            yearSections={yearSections}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            allBookings={bookings}
            allCleanings={cleanings}
          />
        </section>
      </div>
    </div>
  )
})

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const pages = []
  const maxVisible = 5
  let start = Math.max(1, page - Math.floor(maxVisible / 2))
  let end = Math.min(totalPages, start + maxVisible - 1)
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div className="flex items-center justify-center gap-1 pt-3">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className={cn(
          'p-1.5 rounded border border-border',
          page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted text-foreground'
        )}
      >
        <ChevronLeft size={13} />
      </button>

      {start > 1 && (
        <>
          <button
            type="button"
            onClick={() => onPageChange(1)}
            className="px-3 py-1 rounded text-xs font-semibold text-foreground hover:bg-muted"
          >
            1
          </button>
          {start > 2 && <span className="text-xs text-muted-foreground px-1">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={cn(
            'min-w-[32px] px-2.5 py-1 rounded text-xs font-semibold tabular-nums transition-colors',
            p === page ? 'text-white' : 'text-foreground hover:bg-muted'
          )}
          style={p === page ? { backgroundColor: BRAND } : undefined}
        >
          {p}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-xs text-muted-foreground px-1">…</span>}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            className="px-3 py-1 rounded text-xs font-semibold text-foreground hover:bg-muted"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className={cn(
          'p-1.5 rounded border border-border',
          page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted text-foreground'
        )}
      >
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

const MultiMetricChart = memo(function MultiMetricChart({
  title,
  icon: Icon,
  data,
  loading,
  solidKey,
  secondaryKeys,
}) {
  const chartData = useMemo(() => (data || []).map((r) => ({
    label: MONTHS_SHORT[new Date(r.month_start + 'T00:00:00Z').getUTCMonth()],
    gross: Number(r.gross || 0),
    expenses: Number(r.expenses || 0),
    net: Number(r.net || 0),
  })), [data])

  const gradientId = `gradient-${solidKey}`

  return (
    <section className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={13} className="text-foreground flex-shrink-0" />}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">{title}</h3>
      </div>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden flex-1 min-h-0">
        <div className="h-[260px] p-3">
          {loading ? (
            <div className="h-full w-full rounded bg-muted/50 animate-pulse" />
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No data</div>
          ) : (
            <LazyChart minHeight={236}>
              <ResponsiveContainer width="100%" height={236} debounce={100}>
                <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.4} />
                      <stop offset="60%" stopColor={BRAND} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatMoneyCompact}
                    stroke="currentColor"
                    strokeOpacity={0.4}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip content={<ChartTooltip />} animationDuration={0} cursor={{ stroke: BRAND, strokeOpacity: 0.2 }} />
                  <Area
                    type="monotone"
                    dataKey={solidKey}
                    stroke={BRAND}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{ r: 4, fill: BRAND }}
                    isAnimationActive={false}
                  />
                  {secondaryKeys.map((k) => (
                    <Area
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={BRAND}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      strokeOpacity={0.55}
                      fill="transparent"
                      fillOpacity={0}
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </LazyChart>
          )}
        </div>
      </div>
    </section>
  )
})

function AccountingAnalyticsPanels({ data, loading, collapsed, error, onRetry }) {
  return (
    <div className={cn(
      'flex-shrink-0 flex flex-col gap-3 transition-all duration-300 ease-out overflow-hidden',
      collapsed ? 'max-h-0 opacity-0' : 'max-h-[420px] opacity-100'
    )}>
      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Failed to load analytics</p>
            <p className="text-[11px] text-red-600/80 dark:text-red-400/80 truncate">{error}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 rounded text-[11px] shrink-0" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1 pb-2">
        <MultiMetricChart title="Gross"    icon={TrendingUp} data={data} loading={loading} solidKey="gross"    secondaryKeys={['expenses', 'net']} />
        <MultiMetricChart title="Expenses" icon={Wallet}     data={data} loading={loading} solidKey="expenses" secondaryKeys={['gross', 'net']} />
        <MultiMetricChart title="Net"      icon={TrendingUp} data={data} loading={loading} solidKey="net"      secondaryKeys={['gross', 'expenses']} />
      </div>
    </div>
  )
}

function ContractList({
  contracts,
  lifetimeMap,
  onSelect,
  isFirstLoad,
  isRefreshing,
  onRefresh,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  counts,
}) {
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  const [selectedYear, setSelectedYear] = useState(() => new Date().getUTCFullYear())
  const [analyticsData, setAnalyticsData] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState(null)

  const yearRange = useMemo(() => {
    const cy = new Date().getUTCFullYear()
    const years = []
    for (let y = cy - 3; y <= cy + 3; y++) years.push(y)
    return years
  }, [])

  const yearSections = useMemo(() => yearRange.map((y) => ({ year: y })), [yearRange])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    try {
      const { data: monthly, error } = await supabase.rpc('accounting_analytics_by_year', {
        p_year: selectedYear,
      })
      if (error) throw error
      setAnalyticsData(monthly || [])
    } catch (err) {
      console.error('Analytics load failed:', err)
      setAnalyticsError(err?.message || 'Unknown error')
      setAnalyticsData([])
    } finally {
      setAnalyticsLoading(false)
    }
  }, [selectedYear])

  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  const yearTotals = useMemo(() => {
    const acc = { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, pm: 0 }
    for (const r of analyticsData) {
      acc.gross    += Number(r.gross || 0)
      acc.expenses += Number(r.expenses || 0)
      acc.net      += Number(r.net || 0)
      acc.pm       += Number(r.pm_share || 0)
    }
    acc.owner   = Math.round(acc.net * (OWNER_SPLIT_PCT / 100) * 100) / 100
    acc.company = Math.round((acc.net * (COMPANY_SPLIT_PCT / 100) - acc.pm) * 100) / 100
    return acc
  }, [analyticsData])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter, sortBy])

  const filteredSorted = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    let list = contracts.map((c) => ({
      contract: c,
      lifetime: lifetimeMap.get(c.id) || { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, pm: 0, monthsCount: 0 },
    }))

    if (statusFilter !== 'all') {
      list = list.filter(({ contract }) => deriveContractStatus(contract) === statusFilter)
    }

    if (q) {
      list = list.filter(({ contract }) =>
        [contract.contract_code, contract.units?.unit_code, contract.units?.building, contract.owners?.name, contract.owners?.email]
          .filter(Boolean).join(' ').toLowerCase().includes(q)
      )
    }

    const sorted = [...list]
    switch (sortBy) {
      case 'date_desc':
        sorted.sort((a, b) => (b.contract.effective_date ?? '').localeCompare(a.contract.effective_date ?? ''))
        break
      case 'date_asc':
        sorted.sort((a, b) => (a.contract.effective_date ?? '').localeCompare(b.contract.effective_date ?? ''))
        break
      case 'net_desc':
        sorted.sort((a, b) => (b.lifetime.net || 0) - (a.lifetime.net || 0))
        break
      case 'net_asc':
        sorted.sort((a, b) => (a.lifetime.net || 0) - (b.lifetime.net || 0))
        break
      case 'unit_asc':
      default:
        sorted.sort((a, b) => (a.contract.units?.unit_code ?? '').localeCompare(b.contract.units?.unit_code ?? ''))
    }
    return sorted
  }, [contracts, lifetimeMap, debouncedSearch, statusFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageItems = useMemo(
    () => filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredSorted, page]
  )

  const handleExport = () => {
    if (filteredSorted.length === 0) { toast.error('Nothing to export'); return }
    const headers = ['Contract Code', 'Unit', 'Building', 'Owner', 'Effective', 'Expiry', 'Months', 'Lifetime Gross', 'Lifetime Expenses', 'Lifetime Net', `Owner Payout (${OWNER_SPLIT_PCT}%)`, `Company Margin (${COMPANY_SPLIT_PCT}%)`, `PM Payout (${PM_SHARE_OF_COMPANY_PCT}% of company)`]
    const rows = filteredSorted.map(({ contract, lifetime }) => [
      contract.contract_code || '', contract.units?.unit_code || '', contract.units?.building || '', contract.owners?.name || '',
      contract.effective_date || '', contract.expiry_date || '', lifetime.monthsCount || 0,
      lifetime.gross, lifetime.expenses, lifetime.net, lifetime.owner, lifetime.company, lifetime.pm || 0,
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `accounting_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="p-3 flex flex-col gap-2.5">

        <div className="flex-shrink-0 relative flex items-center justify-center py-1">
          <span className="absolute left-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Year Overview
          </span>
          <div className="inline-flex items-center gap-1 bg-muted/50 rounded-full p-1">
            <YearNav
              yearSections={yearSections}
              selectedYear={selectedYear}
              onSelectYear={setSelectedYear}
            />
          </div>
        </div>

        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards totals={yearTotals} />
        </div>

        <AccountingAnalyticsPanels
          data={analyticsData}
          loading={analyticsLoading}
          collapsed={false}
          error={analyticsError}
          onRetry={loadAnalytics}
        />

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search contract code, unit, owner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs rounded"
            />
          </div>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 text-xs rounded border border-border bg-background px-2 pr-7 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 tabular-nums"
            >
              {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
          </div>

          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="h-8 rounded">
            <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded"><Download size={13} /></Button>
        </div>

        <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filteredSorted.length} contract{filteredSorted.length === 1 ? '' : 's'} · Page {page} of {totalPages}
          </span>
        </div>

        <div className="flex-shrink-0 rounded border border-border shadow-sm overflow-hidden flex flex-col bg-card h-[420px]">
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
            <div className={cn('sticky top-0 z-10 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
              <span className="text-[11px] font-bold text-foreground truncate">Unit</span>
              <span className="text-[11px] font-bold text-foreground truncate">Owner / Contract</span>
              <span className="text-[11px] font-bold text-foreground truncate">Dates</span>
              <span className="text-[11px] font-bold text-foreground truncate">Gross · Net</span>
              <span className="text-[11px] font-bold text-foreground text-right truncate">Status</span>
            </div>
            {isFirstLoad ? (
              <div className="space-y-2 p-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : pageItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center py-12">
                <div>
                  <TrendingUp size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-foreground font-semibold">No contracts to display</p>
                  <p className="text-xs text-muted-foreground mt-1">Create contracts in the Contracts page first</p>
                </div>
              </div>
            ) : (
              pageItems.map(({ contract, lifetime }) => (
                <ContractRow
                  key={contract.id}
                  contract={contract}
                  lifetime={lifetime}
                  onClick={() => onSelect(contract.id)}
                />
              ))
            )}
          </div>

          <div className="flex-shrink-0 border-t border-border bg-card px-3 py-1">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AccountingPage() {
  const [selectedContractId, setSelectedContractId] = useState(null)

  const [contracts, setContracts] = useState([])
  const [lifetimeMap, setLifetimeMap] = useState(new Map())

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('unit_asc')

  const hasLoadedOnce = useRef(false)
  const realtimeDebounceRef = useRef(null)

  const fetchAll = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          units:unit_id ( id, unit_code, building ),
          owners:owner_id ( id, name, email, phone )
        `)
        .order('effective_date', { ascending: false, nullsFirst: false })
      if (error) throw error

      const list = data || []
      setContracts(list)

      const ids = list.map((c) => c.id)
      const map = await fetchContractsLifetime(ids)
      setLifetimeMap(map)
    } catch (err) {
      console.error('Failed to load accounting data:', err)
      toast.error('Failed to load accounting data')
    } finally {
      setIsFirstLoad(false)
      setIsRefreshing(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const ch = supabase
      .channel(`accounting-contracts-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
        realtimeDebounceRef.current = setTimeout(() => {
          fetchAll()
        }, REALTIME_DEBOUNCE_MS)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
    }
  }, [fetchAll])

  const counts = useMemo(() => {
    const c = { all: contracts.length, active: 0, expiring: 0, expired: 0 }
    for (const contract of contracts) {
      const s = deriveContractStatus(contract)
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [contracts])

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === selectedContractId) || null,
    [contracts, selectedContractId]
  )

  const handleSelectContract = useCallback((id) => setSelectedContractId(id), [])
  const handleBack = useCallback(() => setSelectedContractId(null), [])

  return (
    <div className="h-full min-h-0 relative">
      <AnimatePresence mode="wait" initial={false}>
        {selectedContract ? (
          <motion.div
            key={`detail-${selectedContract.id}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="h-full min-h-0"
          >
            <ContractDetail
              contract={selectedContract}
              onBack={handleBack}
              onChanged={fetchAll}
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="h-full min-h-0"
          >
            <ContractList
              contracts={contracts}
              lifetimeMap={lifetimeMap}
              onSelect={handleSelectContract}
              isFirstLoad={isFirstLoad}
              isRefreshing={isRefreshing}
              onRefresh={fetchAll}
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              counts={counts}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}