import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, RefreshCw, X, Loader2, TrendingUp, ChevronDown, ChevronLeft, ChevronRight,
  Download, Wallet, Lock, Save, Home, Sparkles, Plus, Trash2,
  Zap, Wifi, Droplets, Megaphone, FileText, Edit2, ExternalLink,
  Calendar, User, Pencil, BarChart3, Camera,
} from 'lucide-react'
import {
  ComposedChart, Bar, BarChart, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import {
  cn, sanitizeMoney, sanitizeText, sanitizeDateOnly,
} from '@/lib/utils'
import {
  computeMonthlyStatement, computeLifetime,
  monthRangeFromDates, monthLabel, monthKeyToDate, formatMoney, formatMoneyCompact,
  OWNER_SPLIT_PCT, COMPANY_SPLIT_PCT,
} from '@/lib/accounting'
import { fetchContractsLifetime } from '@/lib/accountingRpc'

const BRAND = '#2d568e'
const CLEAN_COLOR = '#7c3aed'
const EXPENSE_BUCKET = 'expense-proofs'
const ROW_GRID = 'grid grid-cols-[1.2fr_1fr_1.2fr_1fr_140px] gap-4 items-center'
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PAGE_SIZE = 25
const REALTIME_DEBOUNCE_MS = 1500
const ANALYTICS_MONTHS = 12

const SORT_OPTIONS = [
  { id: 'unit_asc', label: 'Unit (A→Z)' },
  { id: 'date_desc', label: 'Newest first' },
  { id: 'date_asc', label: 'Oldest first' },
  { id: 'net_desc', label: 'Net (high→low)' },
  { id: 'net_asc', label: 'Net (low→high)' },
]

// ============================================================
// HELPERS
// ============================================================
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

const STATUS_CONFIG = {
  active:     { label: 'Active',     className: 'bg-emerald-600 text-white border-0' },
  expiring:   { label: 'Expiring',   className: 'bg-amber-600 text-white border-0' },
  expired:    { label: 'Expired',    className: 'bg-red-600 text-white border-0' },
  incomplete: { label: 'Incomplete', className: 'bg-gray-400 text-white border-0' },
  inactive:   { label: 'Inactive',   className: 'bg-gray-500 text-white border-0' },
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

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.inactive
  return (
    <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', config.className)}>
      {config.label}
    </Badge>
  )
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

// ============================================================
// YEAR SECTIONS
// ============================================================
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

// ============================================================
// OCCUPANCY HELPERS
// ============================================================
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

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon ? <Icon size={16} className="text-foreground flex-shrink-0" /> : null}
      <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h2>
    </div>
  )
}

// ============================================================
// SUMMARY CARDS
// ============================================================
function SummaryCards({ totals }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <Card label="Total Gross" value={formatMoney(totals.gross)} icon={TrendingUp} />
      <Card label="Total Expenses" value={formatMoney(totals.expenses)} icon={Wallet} />
      <Card label="Total Net" value={formatMoney(totals.net)} icon={TrendingUp} />
      <SplitCard label="Contracts / Company" owner={totals.owner} company={totals.company} icon={Wallet} />
    </div>
  )
}

function Card({ label, value, icon: Icon }) {
  return (
    <div className="rounded-md bg-card border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function SplitCard({ label, owner, company, icon: Icon }) {
  return (
    <div className="rounded-md bg-card border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground">
        {formatMoney(owner)}
        <span className="text-muted-foreground mx-1">·</span>
        {formatMoney(company)}
      </p>
    </div>
  )
}

// ============================================================
// STATUS PILLS
// ============================================================
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

// ============================================================
// LIST ROW
// ============================================================
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
          {contract.units?.building || '—'}
        </span>
      </div>

      <div className="min-w-0">
        <span className="text-[11px] text-foreground truncate block">
          {contract.owners?.name || 'No owner'}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono truncate block">
          {contract.contract_code || '—'}
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
        <StatusBadge status={deriveContractStatus(contract)} />
      </div>
    </motion.button>
  )
}

function CardBody({ children, className }) {
  return (
    <div className={cn('rounded-md bg-card border border-border overflow-hidden', className)}>
      {children}
    </div>
  )
}

// ============================================================
// CURSOR TOOLTIP
// ============================================================
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

// ============================================================
// CHART TOOLTIPS
// ============================================================
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

// ============================================================
// HALF GAUGE
// ============================================================
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

// ============================================================
// YEAR NAV
// ============================================================
function YearNav({ yearSections, selectedYear, onSelectYear }) {
  const idx = yearSections.findIndex((s) => s.year === selectedYear)
  const canPrev = idx > 0
  const canNext = idx >= 0 && idx < yearSections.length - 1

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => canPrev && onSelectYear(yearSections[idx - 1].year)}
        disabled={!canPrev}
        className={cn(
          'p-1 rounded border border-border',
          canPrev ? 'hover:bg-muted text-foreground' : 'opacity-40 cursor-not-allowed'
        )}
      >
        <ChevronLeft size={12} />
      </button>
      <span className="text-xs font-bold tabular-nums text-foreground px-2">{selectedYear}</span>
      <button
        type="button"
        onClick={() => canNext && onSelectYear(yearSections[idx + 1].year)}
        disabled={!canNext}
        className={cn(
          'p-1 rounded border border-border',
          canNext ? 'hover:bg-muted text-foreground' : 'opacity-40 cursor-not-allowed'
        )}
      >
        <ChevronRight size={12} />
      </button>
    </div>
  )
}

// ============================================================
// YEARLY REVENUE CHART
// ============================================================
function YearlyRevenueChart({ yearSections, statements, selectedYear, onSelectYear, title }) {
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
        <div className="flex items-center gap-3">
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
          <YearNav yearSections={yearSections} selectedYear={selectedYear} onSelectYear={onSelectYear} />
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
              <ResponsiveContainer width="100%" height="100%">
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
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(45, 86, 142, 0.05)' }} />
                  <Bar dataKey="gross" fill="transparent" stroke={BRAND} strokeWidth={1.5} name="Gross" maxBarSize={40} radius={[6, 6, 0, 0]} animationDuration={700} />
                  <Bar dataKey="expenses" fill="url(#expenses-hatch-main)" name="Expenses" maxBarSize={40} radius={[6, 6, 0, 0]} animationDuration={700} animationBegin={100} />
                  <Bar dataKey="net" fill={BRAND} name="Net" maxBarSize={40} radius={[6, 6, 0, 0]} animationDuration={700} animationBegin={200} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardBody>
    </div>
  )
}

// ============================================================
// MONTHLY OCCUPANCY
// ============================================================
function MonthlyOccupancyChart({ statements, selectedYear, yearSections, onSelectYear, contract }) {
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
        <YearNav yearSections={yearSections} selectedYear={selectedYear} onSelectYear={onSelectYear} />
      </div>
      <CardBody className="flex-1">
        <div className="p-3 h-full">
          <div className="h-[260px] w-full">
            {data.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No months to display</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
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
                  <Tooltip content={<OccupancyTooltip />} cursor={{ fill: 'rgba(45, 86, 142, 0.05)' }} />
                  <Bar dataKey="pct" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardBody>
    </div>
  )
}

// ============================================================
// WEEKLY OCCUPANCY
// ============================================================
function WeeklyOccupancyChart({ statement, contract }) {
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
            <ResponsiveContainer width="100%" height="100%">
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
                <Tooltip content={<OccupancyTooltip />} cursor={{ fill: 'rgba(45, 86, 142, 0.05)' }} />
                <Bar dataKey="pct" fill={BRAND} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardBody>
    </div>
  )
}

// ============================================================
// WEEKLY CUMULATIVE
// ============================================================
function WeeklyCumulativeChart({ statement, monthlyExpenses, contract }) {
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
            <ResponsiveContainer width="100%" height="100%">
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
                <Tooltip content={<CumulativeTooltip />} cursor={{ stroke: BRAND, strokeOpacity: 0.2 }} />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={BRAND}
                  strokeWidth={2.5}
                  fill="url(#weekly-cumulative-fill)"
                  dot={{ r: 3, fill: BRAND }}
                  activeDot={{ r: 5, fill: BRAND }}
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardBody>
    </div>
  )
}

// ============================================================
// GENERAL CUMULATIVE
// ============================================================
function CumulativeNetChart({ statements, selectedYear, yearSections, onSelectYear }) {
  const data = useMemo(() => {
    const ordered = [...statements].sort((a, b) => a.month.localeCompare(b.month))
    let running = 0
    const all = ordered.map((s) => {
      running += s.netProfit
      return {
        label: MONTHS_SHORT[Number(s.month.split('-')[1]) - 1],
        monthKey: s.month,
        year: Number(s.month.split('-')[0]),
        cumulative: running,
      }
    })
    return all.filter((d) => d.year === selectedYear)
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
        <YearNav yearSections={yearSections} selectedYear={selectedYear} onSelectYear={onSelectYear} />
      </div>
      <CardBody className="flex-1">
        <div className="p-3 h-full">
          <div className="h-[260px] w-full">
            {data.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No months to display</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
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
                  <Tooltip content={<CumulativeTooltip />} cursor={{ stroke: BRAND, strokeOpacity: 0.2 }} />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    stroke={BRAND}
                    strokeWidth={2.5}
                    fill="url(#cumulative-fill)"
                    dot={false}
                    activeDot={{ r: 4, fill: BRAND }}
                    animationDuration={900}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardBody>
    </div>
  )
}

// ============================================================
// BOOKING CALENDAR
// ============================================================
function BookingCalendar({ month, bookings, cleanings }) {
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
    <div className="rounded-md border border-border overflow-hidden bg-card">
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
          const shownB = dayB.slice(0, 2)
          const shownC = dayC.slice(0, 2)
          const extra = Math.max(0, (dayB.length - 2) + (dayC.length - 2))
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
                {shownB.map((b, i) => (
                  <CalendarBookingBar key={`b-${b.id}-${i}`} booking={b} />
                ))}
                {shownC.map((c, i) => (
                  <CalendarCleaningChip key={`c-${c.id}-${i}`} cleaning={c} />
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

function CalendarBookingBar({ booking }) {
  const { cursor, onMove, onLeave } = useCursorTooltip()
  const bookerComm = Number(booking.booker_commission || 0)
  const affiliateComm = Number(booking.affiliate_commission || 0)

  return (
    <>
      <motion.div
        onMouseEnter={onMove}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate cursor-default"
        style={{ backgroundColor: BRAND }}
      >
        {booking.guest_name || booking.booking_code}
      </motion.div>
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

function CalendarCleaningChip({ cleaning }) {
  const { cursor, onMove, onLeave } = useCursorTooltip()
  const housekeeper = Number(cleaning.payment_amount || 0)
  const laundry = Number(cleaning.laundry_payment_amount || 0)

  return (
    <>
      <motion.div
        onMouseEnter={onMove}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate cursor-default italic"
        style={{ backgroundColor: CLEAN_COLOR }}
      >
        <Sparkles size={9} className="inline mr-1" />
        {cleaning.type || 'cleaning'}
      </motion.div>
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

// ============================================================
// MONTH SELECTOR
// ============================================================
function MonthSelector({ options, selectedMonth, onSelectMonth }) {
  const idx = options.findIndex((s) => s.month === selectedMonth)
  const canPrev = idx >= 0 && idx < options.length - 1
  const canNext = idx > 0
  const currentLabel = selectedMonth ? monthLabel(selectedMonth) : 'No month'

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => canPrev && onSelectMonth(options[idx + 1].month)}
        disabled={!canPrev}
        className={cn(
          'p-1.5 rounded border border-border',
          canPrev ? 'hover:bg-muted text-foreground' : 'opacity-40 cursor-not-allowed'
        )}
      >
        <ChevronLeft size={13} />
      </button>
      <span className="text-sm font-bold tabular-nums text-foreground px-3 min-w-[140px] text-center">
        {currentLabel}
      </span>
      <button
        type="button"
        onClick={() => canNext && onSelectMonth(options[idx - 1].month)}
        disabled={!canNext}
        className={cn(
          'p-1.5 rounded border border-border',
          canNext ? 'hover:bg-muted text-foreground' : 'opacity-40 cursor-not-allowed'
        )}
      >
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

// ============================================================
// CONTRACT EDIT MODAL
// ============================================================
function ContractEditModal({ open, onClose, contract, onSaved }) {
  const [effective, setEffective] = useState('')
  const [expiry, setExpiry] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !contract) return
    setEffective(contract.effective_date || '')
    setExpiry(contract.expiry_date || '')
    setPdfUrl(contract.contract_pdf_url || '')
    setNotes(contract.notes || '')
  }, [open, contract])

  if (!open || !contract) return null

  const handleSave = async () => {
    const eff = sanitizeDateOnly(effective)
    const exp = expiry ? sanitizeDateOnly(expiry) : null
    const url = sanitizeText(pdfUrl, { max: 500 })
    const n = sanitizeText(notes, { max: 2000, allowNewlines: true })

    if (!eff) { toast.error('Effective date is required'); return }
    if (eff > new Date().toISOString().slice(0, 10)) { toast.error('Effective date cannot be in the future'); return }
    if (exp && exp <= eff) { toast.error('Expiry must be after effective date'); return }

    setSaving(true)
    try {
      const payload = { effective_date: eff, expiry_date: exp, contract_pdf_url: url, notes: n }
      const { error } = await supabase.from('contracts').update(payload).eq('id', contract.id)
      if (error) throw error
      logAudit('UPDATE_CONTRACT', 'contracts', contract.id, {
        before: { effective_date: contract.effective_date, expiry_date: contract.expiry_date, contract_pdf_url: contract.contract_pdf_url },
        after: payload,
      }).catch(() => {})
      toast.success('Contract updated')
      onSaved?.()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to update contract')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[11px] font-semibold text-foreground mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-lg w-full border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Edit Contract</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Effective Date *</label>
              <Input type="date" value={effective} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setEffective(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Expiry Date</label>
              <Input type="date" value={expiry} min={effective} onChange={(e) => setExpiry(e.target.value)} className={inputClass} />
              <p className="text-[11px] text-muted-foreground mt-1 italic">Leave blank for open-ended</p>
            </div>
          </div>
          <div>
            <label className={labelClass}>Contract PDF URL</label>
            <Input type="url" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} className={inputClass} maxLength={500} placeholder="https://…" />
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={4} className="text-xs rounded resize-none w-full" placeholder="Any notes about this contract…" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSave} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Save size={12} className="mr-1.5" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// SIDEBAR
// ============================================================
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

function ContractSidebar({ contract, onBack, onEdit }) {
  return (
    <aside className="w-full lg:w-[280px] flex-shrink-0 lg:overflow-y-auto bg-muted/20 lg:border-r border-border p-3 space-y-4">
      <CardBody>
        <div className="p-3">
          <div className="flex items-start gap-2 mb-2">
            <button type="button" onClick={onBack} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0 -ml-1" title="Back to list">
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono text-sm font-bold text-foreground truncate">{contract.units?.unit_code || '—'}</p>
                <StatusBadge status={deriveContractStatus(contract)} />
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

      <SidebarSection
        title="Contract Details"
        action={
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
            <Edit2 size={11} /> Edit
          </button>
        }
      >
        <div className="space-y-0.5">
          <Field label="Code" value={contract.contract_code || '—'} mono />
          <Field label="Effective" value={contract.effective_date || '—'} mono />
          <Field label="Expiry" value={contract.expiry_date ? contract.expiry_date : <span className="italic text-muted-foreground">Open-ended</span>} mono />
          <Field label="Split" value={<span className="font-semibold">{OWNER_SPLIT_PCT}/{COMPANY_SPLIT_PCT}</span>} />
        </div>
        {contract.contract_pdf_url && (
          <div className="pt-2 mt-2 border-t border-border">
            <a href={contract.contract_pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline">
              <ExternalLink size={11} /> Open contract PDF
            </a>
          </div>
        )}
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

// ============================================================
// GENERAL STATISTICS
// ============================================================
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
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
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
        onSelectYear={onSelectYear}
        title={chartTitle}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <MonthlyOccupancyChart
          statements={statements}
          selectedYear={selectedYear}
          yearSections={yearSections}
          onSelectYear={onSelectYear}
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
          yearSections={yearSections}
          onSelectYear={onSelectYear}
        />
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      className="rounded-md bg-card border border-border p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-muted-foreground" />}
        <span className="text-[11px] font-semibold text-foreground truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground truncate">{value}</p>
    </motion.div>
  )
}

// ============================================================
// EXPENSE IMAGE CONTROL
// ============================================================
function ExpenseImageControl({ path, onUpload, onRemove, contractId, compact = false }) {
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

  const size = compact ? 'w-7 h-7' : 'w-9 h-9'

  return (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
      {path ? (
        <div className="relative group/img flex-shrink-0">
          <button
            type="button"
            onClick={() => thumbUrl && setLightboxUrl(thumbUrl)}
            className={cn('rounded-md overflow-hidden border border-border bg-muted', size)}
            title="View"
          >
            {thumbUrl ? (
              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={11} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
            title="Remove"
          >
            <X size={9} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn('rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground hover:bg-muted/50 disabled:opacity-50 flex-shrink-0', size)}
          title="Attach proof"
        >
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={12} />}
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

// ============================================================
// EXPENSES PANEL
// ============================================================
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

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Wallet size={16} className="text-foreground" />
        <h3 className="text-base font-semibold text-foreground">Expenses</h3>
      </div>
      <CardBody>
        <div className="p-3 space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <Lock size={11} /> Auto-computed
            </p>
            <div className="space-y-0.5">
              <ExpenseLine icon={Wallet}    label="Booking commission"   value={statement.bookingCommission} />
              <ExpenseLine icon={Wallet}    label="Affiliate commission" value={statement.affiliateCommission} />
              <ExpenseLine icon={Sparkles}  label="Housekeeping"         value={statement.housekeeping} />
              <ExpenseLine icon={Sparkles}  label="Laundry"              value={statement.laundry} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
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
                  <div key={f.key} className="flex items-center gap-2 text-xs">
                    <f.icon size={11} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground min-w-[80px] truncate">{f.label}</span>
                    <Input
                      type="number"
                      min={0}
                      value={draftFixed[f.key]}
                      onChange={(e) => setDraftFixed((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="h-7 text-xs rounded flex-1 tabular-nums"
                    />
                    <ExpenseImageControl
                      path={f.image}
                      contractId={contract.id}
                      onUpload={(path) => setFixedImage(f.key, path)}
                      onRemove={() => setFixedImage(f.key, null)}
                      compact
                    />
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" className="h-7 rounded text-[11px]" onClick={() => setEditingFixed(false)} disabled={saving}>Cancel</Button>
                  <Button size="sm" className="h-7 rounded text-[11px]" onClick={saveFixed} disabled={saving} style={{ backgroundColor: BRAND }}>
                    {saving ? <Loader2 size={11} className="animate-spin mr-1" /> : <Save size={11} className="mr-1" />}
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {fixedExpenses.map((f) => (
                  <div key={f.key} className="flex items-center gap-2 text-xs py-0.5">
                    <f.icon size={11} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground flex-1 truncate">{f.label}</span>
                    <span className="tabular-nums font-semibold text-foreground">{formatMoney(f.value)}</span>
                    <ExpenseImageControl
                      path={f.image}
                      contractId={contract.id}
                      onUpload={(path) => setFixedImage(f.key, path)}
                      onRemove={() => setFixedImage(f.key, null)}
                      compact
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold text-foreground">Custom · {statement.customItems.length}</p>
              <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                <Plus size={11} /> Add
              </button>
            </div>
            {statement.customItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic py-0.5">No custom expenses this month</p>
            ) : (
              <div className="space-y-1">
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

          <div className="pt-2 border-t border-border space-y-1">
            <TotalLine label="Auto-computed" value={statement.bookingCommission + statement.affiliateCommission + statement.housekeeping + statement.laundry} />
            <TotalLine label="Manual" value={statement.electricity + statement.internet + statement.water + statement.marketing + statement.customTotal} />
            <TotalLine label="Total expenses" value={statement.totalExpenses} bold />
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
            compact
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
        compact
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
        className="relative bg-card rounded-md shadow-2xl max-w-sm w-full border border-border overflow-hidden">
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
            <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-8 text-xs rounded tabular-nums" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-foreground mb-1 block">Proof (optional)</label>
            <ExpenseImageControl
              path={imagePath}
              contractId={contractId}
              onUpload={(path) => setImagePath(path)}
              onRemove={() => setImagePath(null)}
            />
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

// ============================================================
// BOOKING ROW
// ============================================================
function BookingRow({ booking }) {
  const bookerComm = Number(booking.booker_commission || 0)
  const affiliateComm = Number(booking.affiliate_commission || 0)

  const nights = booking.check_in && booking.check_out
    ? Math.max(0, Math.round(
        (new Date(booking.check_out + 'T00:00:00Z') - new Date(booking.check_in + 'T00:00:00Z')) / 86400000
      ))
    : 0

  const paymentBadge = {
    paid:    { label: 'Paid',    className: 'bg-emerald-600 text-white' },
    partial: { label: 'Partial', className: 'bg-amber-600 text-white' },
    unpaid:  { label: 'Unpaid',  className: 'bg-red-600 text-white' },
  }[booking.payment_status] || null

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] text-foreground flex-shrink-0">
          {booking.booking_code}
        </span>
        <span className="text-xs font-semibold text-foreground truncate flex-1">
          {booking.guest_name}
        </span>
        <span className="text-xs font-semibold tabular-nums text-foreground flex-shrink-0">
          {formatMoney(booking.total_amount)}
        </span>
        {paymentBadge && (
          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0', paymentBadge.className)}>
            {paymentBadge.label}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground/80 min-w-0 flex-wrap">
        <span className="tabular-nums">
          {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums">{nights} night{nights === 1 ? '' : 's'}</span>
        {booking.guests > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span>{booking.guests} guest{booking.guests === 1 ? '' : 's'}</span>
          </>
        )}
      </div>

      {(bookerComm > 0 || affiliateComm > 0) && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-foreground/80">
          {bookerComm > 0 && (
            <span>
              Booker · <span className="tabular-nums font-semibold text-foreground">−{formatMoney(bookerComm)}</span>
            </span>
          )}
          {affiliateComm > 0 && (
            <span>
              Affiliate · <span className="tabular-nums font-semibold text-foreground">−{formatMoney(affiliateComm)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// CLEANING ROW
// ============================================================
function CleaningRow({ cleaning }) {
  const housekeeper = Number(cleaning.payment_amount || 0)
  const laundry = Number(cleaning.laundry_payment_amount || 0)

  const photoCount =
    (Array.isArray(cleaning.photos_before) ? cleaning.photos_before.length : 0) +
    (Array.isArray(cleaning.photos_after)  ? cleaning.photos_after.length  : 0) +
    (Array.isArray(cleaning.photos_report) ? cleaning.photos_report.length : 0)

  const statusBadge = {
    scheduled: { label: 'Scheduled', className: 'bg-amber-600 text-white' },
    ready:     { label: 'Ready',     className: 'bg-blue-600 text-white' },
    submitted: { label: 'Submitted', className: 'bg-gray-600 text-white' },
    completed: { label: 'Completed', className: 'bg-emerald-600 text-white' },
  }[cleaning.status] || null

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] text-foreground flex-shrink-0">
          {cleaning.cleaning_code || '—'}
        </span>
        <span className="text-xs font-semibold capitalize text-foreground flex-shrink-0">
          {cleaning.type}
        </span>
        {statusBadge && (
          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0', statusBadge.className)}>
            {statusBadge.label}
          </span>
        )}
        <span className="flex-1 min-w-0" />
        <span className="text-xs font-semibold tabular-nums text-foreground flex-shrink-0">
          {formatMoney(housekeeper)}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground/80 flex-wrap">
        <span className="tabular-nums">{formatDateShort(cleaning.scheduled_date)}</span>
        {laundry > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span>
              Laundry · <span className="tabular-nums font-semibold text-foreground">−{formatMoney(laundry)}</span>
            </span>
          </>
        )}
        {photoCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1">
              <Camera size={10} />
              {photoCount} photo{photoCount === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>
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

// ============================================================
// MONTHLY SECTION
// ============================================================
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
}) {
  const options = useMemo(() => [...statements].reverse(), [statements])
  const statement = statements.find((s) => s.month === selectedMonth) || null
  const [tab, setTab] = useState('bookings')

  useEffect(() => { setTab('bookings') }, [selectedMonth])

  const monthOccupancy = useMemo(() => {
    if (!statement) return null
    const [y, m] = statement.month.split('-').map(Number)
    const { nights, daysInMonth } = nightsInMonthFromBookings(statement.bookingsList, y, m, contract)
    return { pct: daysInMonth > 0 ? nights / daysInMonth : 0, nights, daysInMonth }
  }, [statement, contract])

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
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <MiniStat label="Gross Revenue" value={statement.grossRevenue} />
            <MiniStat label="Total Expenses" value={statement.totalExpenses} />
            <MiniStat label="Net Profit" value={statement.netProfit} />
            <MiniSplitStat label="Owner · Company" owner={statement.ownerShare} company={statement.companyShare} />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <Home size={16} className="text-foreground flex-shrink-0" />
                <h3 className="text-base font-semibold text-foreground truncate">Month Occupancy</h3>
              </div>
              <CardBody className="flex-1">
                <div className="p-3 h-full min-h-[292px] flex items-center justify-center">
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

            <div className="flex flex-col gap-3">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-md bg-card border border-border p-4 flex-1 flex flex-col justify-center"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Home size={14} className="text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-foreground">Total Bookings</span>
                </div>
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {statement.bookingsList.length}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {formatMoney(statement.grossRevenue)} gross
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="rounded-md bg-card border border-border p-4 flex-1 flex flex-col justify-center"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-foreground">Total Cleanings</span>
                </div>
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {statement.cleaningsList.length}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {formatMoney(statement.housekeeping + statement.laundry)} paid
                </p>
              </motion.div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <WeeklyOccupancyChart statement={statement} contract={contract} />
            <WeeklyCumulativeChart statement={statement} monthlyExpenses={monthlyExpenses} contract={contract} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-foreground truncate">{monthLabel(statement.month)} Calendar</h3>
                <span className="text-[11px] text-foreground tabular-nums">
                  {statement.bookingsList.length} booking{statement.bookingsList.length === 1 ? '' : 's'} · {statement.cleaningsList.length} cleaning{statement.cleaningsList.length === 1 ? '' : 's'}
                </span>
              </div>
              <BookingCalendar month={statement.month} bookings={statement.bookingsList} cleanings={statement.cleaningsList} />
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setTab('bookings')}
                  className={cn(
                    'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
                    tab === 'bookings' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Bookings · {statement.bookingsList.length}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('cleanings')}
                  className={cn(
                    'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
                    tab === 'cleanings' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Cleanings · {statement.cleaningsList.length}
                </button>
              </div>

              {tab === 'bookings' ? (
                statement.bookingsList.length === 0 ? (
                  <CardBody><div className="p-3 text-xs text-muted-foreground italic">No bookings this month</div></CardBody>
                ) : (
                  <div className="space-y-1.5 max-h-[480px] overflow-y-auto overscroll-contain pr-1">
                    {statement.bookingsList.map((b) => <BookingRow key={b.id} booking={b} />)}
                  </div>
                )
              ) : (
                statement.cleaningsList.length === 0 ? (
                  <CardBody><div className="p-3 text-xs text-muted-foreground italic">No cleanings this month</div></CardBody>
                ) : (
                  <div className="space-y-1.5 max-h-[480px] overflow-y-auto overscroll-contain pr-1">
                    {statement.cleaningsList.map((c) => <CleaningRow key={c.id} cleaning={c} />)}
                  </div>
                )
              )}
            </div>
          </div>

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
      className="rounded-md bg-card border border-border p-3"
    >
      <p className="text-[11px] font-semibold text-foreground mb-1 truncate">{label}</p>
      <p className="text-base font-bold tabular-nums text-foreground truncate">{formatMoney(value)}</p>
    </motion.div>
  )
}

function MiniSplitStat({ label, owner, company }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
      className="rounded-md bg-card border border-border p-3"
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

// ============================================================
// CONTRACT DETAIL — MEMOIZED
// ============================================================
const ContractDetail = memo(function ContractDetail({ contract, onBack, onChanged }) {
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [bookings, setBookings] = useState([])
  const [cleanings, setCleanings] = useState([])
  const [monthlyExpenses, setMonthlyExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDetailData = useCallback(async () => {
    if (!contract?.id || !contract?.unit_id) return
    setLoading(true)
    try {
      const [bRes, clRes, exRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, unit_id, booking_code, guest_name, check_in, check_out, guests, total_amount, booker_commission, affiliate_commission, payment_status, balance, deleted_at')
          .eq('unit_id', contract.unit_id)
          .is('deleted_at', null),
        supabase
          .from('cleanings')
          .select('id, cleaning_code, unit_id, type, scheduled_date, status, payment_amount, laundry_payment_amount, photos_before, photos_after, photos_report')
          .eq('unit_id', contract.unit_id),
        supabase
          .from('contract_monthly_expenses')
          .select('*')
          .eq('contract_id', contract.id),
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
  }, [contract?.id, contract?.unit_id])

  useEffect(() => { fetchDetailData() }, [fetchDetailData])

  useEffect(() => {
    if (!contract?.unit_id) return
    const ch = supabase
      .channel(`contract-detail-${contract.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `unit_id=eq.${contract.unit_id}` },
        () => fetchDetailData())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cleanings', filter: `unit_id=eq.${contract.unit_id}` },
        () => fetchDetailData())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'contract_monthly_expenses', filter: `contract_id=eq.${contract.id}` },
        () => fetchDetailData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [contract?.id, contract?.unit_id, fetchDetailData])

  const effectiveDate = useMemo(() => contract.effective_date || null, [contract.effective_date])
  const expiryDate = useMemo(() => contract.expiry_date || null, [contract.expiry_date])

  const allMonths = useMemo(
    () => monthRangeFromDates(effectiveDate, expiryDate),
    [effectiveDate, expiryDate]
  )

  const statements = useMemo(() => allMonths.map((m) =>
    computeMonthlyStatement({ contract, bookings, cleanings, monthlyExpenses, month: m })
  ), [allMonths, contract, bookings, cleanings, monthlyExpenses])

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
  useEffect(() => { setSelectedMonth(defaultMonth) }, [defaultMonth])

  const handleChanged = useCallback(() => {
    fetchDetailData()
    onChanged?.()
  }, [fetchDetailData, onChanged])

  if (loading && statements.length === 0) {
    return (
      <div className="h-full flex flex-col lg:flex-row min-h-0 bg-card border border-border rounded-md overflow-hidden">
        <ContractSidebar contract={contract} onBack={onBack} onEdit={() => setEditModalOpen(true)} />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0 bg-card border border-border rounded-md overflow-hidden">
      <ContractSidebar contract={contract} onBack={onBack} onEdit={() => setEditModalOpen(true)} />

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        <section>
          <SectionHeader icon={BarChart3} title="General Statistics" />
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
          />
        </section>
      </div>

      <ContractEditModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        contract={contract}
        onSaved={handleChanged}
      />
    </div>
  )
})

// ============================================================
// PAGINATION
// ============================================================
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
            p === page
              ? 'text-white'
              : 'text-foreground hover:bg-muted'
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

// ============================================================
// ANALYTICS PANELS (portfolio-wide, last 12 months)
// ============================================================
function AccountingAnalyticsPanels({ collapsed }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data: monthly, error } = await supabase.rpc('dashboard_analytics', {
          p_months: ANALYTICS_MONTHS,
        })
        if (error) throw error
        if (!cancelled) setData(monthly || [])
      } catch (err) {
        console.error('Analytics load failed:', err)
        if (!cancelled) setData([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const bookingsData = useMemo(() => (data || []).map((r) => ({
    label: MONTHS_SHORT[new Date(r.month_start + 'T00:00:00Z').getUTCMonth()],
    bookings: Number(r.bookings_count || 0),
  })), [data])

  const occupancyData = useMemo(() => (data || []).map((r) => ({
    label: MONTHS_SHORT[new Date(r.month_start + 'T00:00:00Z').getUTCMonth()],
    pct: Number(r.occupancy_pct || 0),
  })), [data])

  return (
    <div className={cn('flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-4 transition-all duration-300 ease-out overflow-hidden', collapsed ? 'max-h-0 opacity-0 -mb-3' : 'max-h-[340px] opacity-100')}>
      {/* Bookings per month */}
      <section className="flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={13} className="text-foreground flex-shrink-0" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">Bookings — Last 12 Months</h3>
        </div>
        <div className="rounded-md bg-card border border-border overflow-hidden flex-1 min-h-0">
          <div className="h-[240px] p-3">
            {loading ? (
              <div className="h-full w-full rounded bg-muted/50 animate-pulse" />
            ) : bookingsData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bookingsData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
                    formatter={(v) => [v, 'Bookings']}
                  />
                  <Bar dataKey="bookings" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Occupancy — area chart with gradient, no dots, blue */}
      <section className="flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <Home size={13} className="text-foreground flex-shrink-0" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">Occupancy — Last 12 Months</h3>
        </div>
        <div className="rounded-md bg-card border border-border overflow-hidden flex-1 min-h-0">
          <div className="h-[240px] p-3">
            {loading ? (
              <div className="h-full w-full rounded bg-muted/50 animate-pulse" />
            ) : occupancyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={occupancyData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="occupancy-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                      <stop offset="60%" stopColor={BRAND} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" strokeOpacity={0.4} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${v}%`}
                    stroke="currentColor"
                    strokeOpacity={0.4}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
                    formatter={(v) => [`${v}%`, 'Occupancy']}
                  />
                  <Area
                    type="monotone"
                    dataKey="pct"
                    stroke={BRAND}
                    strokeWidth={2}
                    fill="url(#occupancy-fill)"
                    dot={false}
                    activeDot={{ r: 4, fill: BRAND }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// ============================================================
// LIST PAGE
// ============================================================
function ContractList({
  contracts,
  lifetimeMap,
  globalTotals,
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
  const [panelsHidden, setPanelsHidden] = useState(false)
  const headerRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter, sortBy])

  const filteredSorted = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    let list = contracts.map((c) => ({
      contract: c,
      lifetime: lifetimeMap.get(c.id) || { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, monthsCount: 0 },
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
    const headers = ['Contract Code', 'Unit', 'Building', 'Owner', 'Effective', 'Expiry', 'Months', 'Lifetime Gross', 'Lifetime Expenses', 'Lifetime Net', `Owner Payout (${OWNER_SPLIT_PCT}%)`, `Company Margin (${COMPANY_SPLIT_PCT}%)`]
    const rows = filteredSorted.map(({ contract, lifetime }) => [
      contract.contract_code || '', contract.units?.unit_code || '', contract.units?.building || '', contract.owners?.name || '',
      contract.effective_date || '', contract.expiry_date || '', lifetime.monthsCount || 0,
      lifetime.gross, lifetime.expenses, lifetime.net, lifetime.owner, lifetime.company,
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `accounting_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  const handleListMouseMove = useCallback((e) => {
    const headerEl = headerRef.current
    if (!headerEl) return
    const rect = headerEl.getBoundingClientRect()
    setPanelsHidden(e.clientY > rect.bottom)
  }, [])

  const handleListMouseLeave = useCallback(() => setPanelsHidden(false), [])

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">

        {/* Summary cards */}
        <div className="flex-shrink-0">
          <SummaryCards totals={globalTotals} />
        </div>

        {/* Analytics panels — collapse on list hover */}
        <AccountingAnalyticsPanels collapsed={panelsHidden} />

        {/* Search bar */}
        <div ref={headerRef} className="flex-shrink-0 flex items-center gap-2">
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

        {/* Status pills */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
          <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {filteredSorted.length} contract{filteredSorted.length === 1 ? '' : 's'} · Page {page} of {totalPages}
          </span>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 rounded border border-border overflow-hidden flex flex-col bg-card">
          <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}
            onMouseMove={handleListMouseMove}
            onMouseLeave={handleListMouseLeave}>
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

// ============================================================
// MAIN PAGE
// ============================================================
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

  const globalTotals = useMemo(() => {
    const acc = { gross: 0, expenses: 0, net: 0, owner: 0, company: 0 }
    for (const lt of lifetimeMap.values()) {
      acc.gross += lt.gross
      acc.expenses += lt.expenses
      acc.net += lt.net
      acc.owner += lt.owner
      acc.company += lt.company
    }
    return acc
  }, [lifetimeMap])

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
              globalTotals={globalTotals}
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