// src/components/admin/accounting/AccountingPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState, memo, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, RefreshCw, X, Loader2, TrendingUp, ChevronLeft,
  Wallet, Lock, Save, Home, Sparkles, Plus, Trash2,
  Zap, Wifi, Droplets, Megaphone,
  Calendar, CalendarDays, CalendarRange, User, Pencil, BarChart3, Table2, Camera, Copy,
  FileText, Landmark, Building2, UserRound, AlertTriangle, ArrowUpRight, ArrowDownRight, Receipt, History,
} from 'lucide-react'
import {
  ComposedChart, Bar, BarChart, AreaChart, Area, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import { cn, sanitizeMoney, sanitizeText, CLEANING_WINDOW, STAY_TIMES } from '@/lib/utils'
import {
  computeLifetime,
  monthLabel, monthKeyToDate, formatMoney, formatMoneyCompact,
  OWNER_SPLIT_PCT, COMPANY_SPLIT_PCT, PM_SHARE_OF_COMPANY_PCT,
} from '@/lib/accounting'
import { fetchContractsLifetime, fetchContractMonthlyBreakdown } from '@/lib/accountingRpc'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { deriveContractStatus, contractTerms } from '@/lib/contracts'
import { StatusTabs, PeriodStepper } from '@/components/admin/_shared/StatusTabs'
import { StatStrip, StatTile } from '@/components/admin/_shared/StatStrip'
import { Sparkline } from '@/components/admin/_shared/Sparkline'
import { StatementActions } from '@/components/admin/_shared/StatementActions'
import { Panel, PanelHeader, SectionLabel, InitialsAvatar } from '@/components/admin/_shared/Panel'
import { SortHeader, nextSort, ResultsBar, SearchKeyHint, useListShortcuts, CARD_ON_PHONE, MobileSort, PHONE_LABEL } from '@/components/admin/_shared/listTools'
import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Logo blue: BRAND fills sit behind white text; CHART is for chart marks
// (a lighter tint in dark mode so it reads on dark cards).
const BRAND = 'var(--brand-solid)'
const CHART = 'var(--brand)'
const CLEAN_COLOR = '#10b981'
const CANCELLED_COLOR = '#dc2626'
// Profit and loss marks in charts.
const PROFIT_COLOR = '#059669'
const LOSS_COLOR = '#dc2626'
const EXPENSE_BUCKET = 'expense-proofs'
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REALTIME_DEBOUNCE_MS = 1500
const PARENT_REFRESH_DEBOUNCE_MS = 1200
const DETAIL_REFRESH_DEBOUNCE_MS = 800

// Page and card layout, as on the Dashboard.
const PAGE = 'px-4 py-4 md:px-8 md:py-6 max-w-[1600px] mx-auto space-y-4 pb-10'
const DASH_ROW = 'grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4'

// Peso amounts are longer than the Dashboard's counts, so KPI numbers are a
// size smaller to fit six tiles across.
const MONEY_TILE = 'text-[22px] sm:text-[24px]'

// Chart axes and grid, as on the Dashboard: black labels, no axis lines,
// horizontal guides only.
const AXIS_TICK = { fontSize: 11, fill: 'var(--foreground)' }
const X_AXIS = { tick: AXIS_TICK, tickLine: false, axisLine: false, dy: 6 }
const Y_AXIS = { tick: AXIS_TICK, tickLine: false, axisLine: false }
const GRID = { stroke: 'currentColor', strokeOpacity: 0.08, vertical: false }

// Shared modal shadow — matches Inquiries / Campaigns
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'

// Contract list: sortable columns. "Status" puts expired contracts first,
// then ones ending soon, then active ones.
const ROW_GRID = `grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_88px] gap-4 items-center ${CARD_ON_PHONE}`
const STATUS_RANK = { expired: 0, expiring: 1, active: 2, renewed: 3 }
const CONTRACT_SORT_VALUE = {
  unit:      ({ contract }) => contract.units?.unit_code || '',
  owner:     ({ contract }) => contract.owners?.name || '',
  effective: ({ contract }) => contract.effective_date || '',
  gross:     ({ lifetime }) => Number(lifetime.gross || 0),
  net:       ({ lifetime }) => Number(lifetime.net || 0),
  status:    ({ contract }) => STATUS_RANK[deriveContractStatus(contract)] ?? 3,
}
// Money and dates start highest / newest first; text starts A→Z.
const SORT_DEFAULTS = { effective: 'desc', gross: 'desc', net: 'desc' }

// Whole pesos for KPI tiles; exact amounts stay in the tables and tooltips.
function formatPeso(n) {
  const v = Math.round(Number(n || 0))
  return `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH')}`
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

function copyText(text, okMessage) {
  navigator.clipboard.writeText(text || '').then(
    () => toast.success(okMessage),
    () => toast.error('Failed to copy'),
  )
}

type LazyChartProps = {
  children: ReactNode
  rootMargin?: string
  minHeight?: number
}

// ─── Lazy chart wrapper ──────────────────────────────────────
function LazyChart({ children, rootMargin = '200px', minHeight = 260 }: LazyChartProps) {
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
      { rootMargin },
    )
    io.observe(node)
    const fallback = setTimeout(() => setVisible(true), 5000)
    return () => {
      io.disconnect()
      clearTimeout(fallback)
    }
  }, [visible, rootMargin])

  return (
    <div ref={ref} style={!visible ? { minHeight } : undefined}>
      {visible ? children : null}
    </div>
  )
}

// ─── Status text ─────────────────────────────────────────────
const STATUS_TEXT = {
  active:     { label: 'Active',     className: 'text-emerald-600 dark:text-emerald-400' },
  expiring:   { label: 'Expiring',   className: 'text-amber-600 dark:text-amber-400' },
  expired:    { label: 'For renewal', className: 'text-red-600 dark:text-red-400' },
  renewed:    { label: 'Renewed',    className: 'text-foreground' },
  incomplete: { label: 'Incomplete', className: 'text-foreground' },
  inactive:   { label: 'Inactive',   className: 'text-foreground' },
}

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'expired', label: 'For renewal' },
  { id: 'renewed', label: 'Renewed' },
]

type StatusTextProps = {
  status: string
  className?: string
}

function StatusText({ status, className }: StatusTextProps) {
  const config = STATUS_TEXT[status] || STATUS_TEXT.inactive
  return <span className={cn('text-[11.5px] font-semibold whitespace-nowrap', config.className, className)}>{config.label}</span>
}

// Accounting is the one place money takes colour: profit in green, loss in
// red. Gross and expenses stay black.
const GOOD_TEXT = 'text-emerald-600 dark:text-emerald-400'
const BAD_TEXT = 'text-red-600 dark:text-red-400'

function moneyTone(n) {
  const v = Number(n)
  if (v > 0) return GOOD_TEXT
  if (v < 0) return BAD_TEXT
  return 'text-foreground'
}

// Shares of net (owner, company): red only when they go negative.
function lossTone(n) {
  return Number(n) < 0 ? BAD_TEXT : 'text-foreground'
}

type GrowthProps = {
  current: any
  previous: any
  vs: any
  upIsGood?: any
}

/**
 * "+12% vs Sep" in green when the change is good, red when it's bad.
 * upIsGood  false for expenses, where going up is bad.
 */
function Growth({ current, previous, vs, upIsGood = true }: GrowthProps) {
  if (previous == null || !Number.isFinite(previous) || previous === 0) {
    return <span>Nothing in {vs} to compare</span>
  }
  const shown = Math.round(((current - previous) / Math.abs(previous)) * 100)
  if (shown === 0) {
    return <span><span className="font-semibold">No change</span> vs {vs}</span>
  }
  const up = shown > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={cn('inline-flex items-center gap-0.5 font-semibold tabular-nums', up === upIsGood ? GOOD_TEXT : BAD_TEXT)}>
        <Icon size={12} strokeWidth={2.25} />
        {up ? '+' : '−'}{Math.abs(shown) > 999 ? '999+' : Math.abs(shown)}%
      </span>
      <span className="truncate">vs {vs}</span>
    </span>
  )
}

function growthTone(current, previous, upIsGood = true) {
  if (previous == null || !Number.isFinite(previous) || previous === 0 || current === previous) return 'neutral'
  return (current > previous) === upIsGood ? 'good' : 'bad'
}

function formatDateShort(d) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}

function spansFullYear(effectiveDate, expiryDate) {
  if (!effectiveDate) return false
  const start = new Date(`${effectiveDate}T00:00:00Z`)
  const end = expiryDate ? new Date(`${expiryDate}T00:00:00Z`) : new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return days >= 365 || start.getUTCFullYear() !== end.getUTCFullYear()
}

// ─── Month enumeration (for zero-month padding) ─────────────
function enumerateMonths(effectiveDate, expiryDate) {
  if (!effectiveDate) return []
  const start = new Date(`${effectiveDate}T00:00:00Z`)
  const end = expiryDate ? new Date(`${expiryDate}T00:00:00Z`) : new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  if (end < start) return []
  const out = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const endKey = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
  for (let i = 0; i < 480; i++) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`)
    if (cur.getTime() >= endKey) break
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

function makeEmptyStatement(month) {
  return {
    month,
    grossRevenue: 0,
    bookingCommission: 0,
    affiliateCommission: 0,
    housekeeping: 0,
    laundry: 0,
    electricity: 0,
    internet: 0,
    water: 0,
    marketing: 0,
    customTotal: 0,
    totalExpenses: 0,
    netProfit: 0,
    ownerShare: 0,
    companyShare: 0,
    pmShare: 0,
    pmId: null,
    pmName: null,
    bookingsList: [],
    cleaningsList: [],
    manualRow: null,
    customItems: [],
  }
}

function recomputeStatement(statement, patch) {
  const next = { ...statement, ...patch }
  const customItems = Array.isArray(next.customItems) ? next.customItems : []
  next.customTotal = customItems.reduce((sum, x) => sum + (Number(x.amount) || 0), 0)
  const manual =
    Number(next.electricity || 0) +
    Number(next.internet || 0) +
    Number(next.water || 0) +
    Number(next.marketing || 0) +
    Number(next.customTotal || 0)
  const auto =
    Number(next.bookingCommission || 0) +
    Number(next.affiliateCommission || 0) +
    Number(next.housekeeping || 0) +
    Number(next.laundry || 0)
  next.totalExpenses = auto + manual
  next.netProfit = Number(next.grossRevenue || 0) - next.totalExpenses
  const net = next.netProfit
  next.ownerShare = Math.round(net * (OWNER_SPLIT_PCT / 100) * 100) / 100
  next.companyShare = Math.round(net * (COMPANY_SPLIT_PCT / 100) * 100) / 100
  if (next.pmId) {
    next.pmShare = Math.round((next.companyShare * (PM_SHARE_OF_COMPANY_PCT / 100)) * 100) / 100
  } else {
    next.pmShare = 0
  }
  return next
}

// ─── Storage helpers ─────────────────────────────────────────
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

// ─── Year sections + default picker ─────────────────────────
function buildYearSections(effectiveDate, expiryDate) {
  if (!effectiveDate) return []
  const eff = new Date(`${effectiveDate}T00:00:00Z`)
  if (Number.isNaN(eff.getTime())) return []
  const effYear = eff.getUTCFullYear()
  const effMonth = eff.getUTCMonth()
  let endYear, endMonth
  if (expiryDate) {
    const exp = new Date(`${expiryDate}T00:00:00Z`)
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

// ─── Occupancy helpers ──────────────────────────────────────
export function nightsInMonthFromBookings(bookings, year, month1to12, contract) {
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  const monthStart = new Date(Date.UTC(year, month1to12 - 1, 1))
  const monthEndExclusive = new Date(Date.UTC(year, month1to12, 1))
  let nights = 0
  for (const b of bookings) {
    if (!b.check_in || !b.check_out) continue
    if (b.cancelled_at) continue
    if (contract?.effective_date && b.check_in < contract.effective_date) continue
    if (contract?.expiry_date && b.check_in > contract.expiry_date) continue
    const ci = new Date(`${b.check_in}T00:00:00Z`)
    const co = new Date(`${b.check_out}T00:00:00Z`)
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
    const overlapStart = ci > monthStart ? ci : monthStart
    const overlapEnd = co < monthEndExclusive ? co : monthEndExclusive
    if (overlapEnd > overlapStart) {
      nights += Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000)
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
      if (b.cancelled_at) continue
      if (contract?.effective_date && b.check_in < contract.effective_date) continue
      if (contract?.expiry_date && b.check_in > contract.expiry_date) continue
      const ci = new Date(`${b.check_in}T00:00:00Z`)
      const co = new Date(`${b.check_out}T00:00:00Z`)
      if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
      const overlapStart = ci > weekStart ? ci : weekStart
      const overlapEnd = co < weekEndExclusive ? co : weekEndExclusive
      if (overlapEnd > overlapStart) {
        nights += Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000)
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
      if (b.cancelled_at) return false
      if (contract?.effective_date && b.check_in < contract.effective_date) return false
      if (contract?.expiry_date && b.check_in > contract.expiry_date) return false
      const ci = new Date(`${b.check_in}T00:00:00Z`)
      return !Number.isNaN(ci.getTime()) && ci >= wStart && ci < wEndEx
    })
    const weekCleanings = (cleanings || []).filter((c) => {
      if (!c.scheduled_date) return false
      if (contract?.effective_date && c.scheduled_date < contract.effective_date) return false
      if (contract?.expiry_date && c.scheduled_date > contract.expiry_date) return false
      const d = new Date(`${c.scheduled_date}T00:00:00Z`)
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
  const start = new Date(`${effectiveDate}T00:00:00Z`)
  const end = expiryDate ? new Date(`${expiryDate}T00:00:00Z`) : new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { pct: 0, nights: 0, totalNights: 0 }
  }
  const totalNights = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  let nights = 0
  for (const b of bookings) {
    if (!b.check_in || !b.check_out) continue
    if (b.cancelled_at) continue
    if (b.check_in < effectiveDate) continue
    if (expiryDate && b.check_in > expiryDate) continue
    const ci = new Date(`${b.check_in}T00:00:00Z`)
    const co = new Date(`${b.check_out}T00:00:00Z`)
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
    const overlapStart = ci > start ? ci : start
    const overlapEnd = co < end ? co : end
    if (overlapEnd > overlapStart) {
      nights += Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000)
    }
  }
  nights = Math.min(nights, totalNights)
  return { pct: totalNights > 0 ? nights / totalNights : 0, nights, totalNights }
}

type CardHeadProps = {
  icon: LucideIcon
  title: any
  subtitle: string
  children: ReactNode
}

// ─── Building blocks (the Dashboard's look) ─────────────────
// Card header whose controls wrap under the title on narrow screens, like
// the Dashboard's Performance card.
function CardHead({ icon: Icon, title, subtitle, children }: CardHeadProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon size={18} strokeWidth={1.75} className="text-foreground flex-shrink-0" />}
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-foreground truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

type EmptyStateProps = {
  icon?: any
  title: string
  hint: any
  children?: ReactNode
}

function EmptyState({ icon: Icon = FileText, title, hint, children }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center">
      <Icon size={22} strokeWidth={1.5} className="text-foreground mb-2" />
      <p className="text-[12px] font-medium text-foreground">{title}</p>
      {hint && <p className="text-[11px] text-foreground mt-0.5">{hint}</p>}
      {children}
    </div>
  )
}

type SummaryStatProps = {
  label: string
  value: any
  children: ReactNode
}

// Label, big number and a note under it (the Dashboard's summary stat).
export function SummaryStat({ label, value, children }: SummaryStatProps) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-foreground">{label}</p>
      <p className="text-[24px] font-semibold text-foreground tracking-tight leading-none tabular-nums mt-1.5">{value}</p>
      {children && <p className="text-[11px] text-foreground mt-1.5 truncate">{children}</p>}
    </div>
  )
}

type ViewToggleProps = {
  view: string
  onChange: (...args: any[]) => any
}

// Chart ↔ table switch, as on the Dashboard.
function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(view === 'chart' ? 'table' : 'chart')}
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card text-[12px] font-medium text-foreground hover:bg-muted/50 transition-colors"
      aria-pressed={view === 'table'}
    >
      {view === 'chart' ? <Table2 size={14} /> : <BarChart3 size={14} />}
      {view === 'chart' ? 'Table' : 'Chart'}
    </button>
  )
}

/**
 * Monthly figures → what a KPI tile's trend line and growth line need.
 * months    [{ gross, expenses, net }] in time order (the trend line)
 * current   totals being compared; previous the same totals one period back
 *           (null when there is nothing to compare with)
 * vs        name of the earlier period, e.g. "Sep" or "Jan–Oct 2025"
 */
export function buildTrend(months, current, previous, vs) {
  return {
    values: {
      gross: months.map((m) => m.gross),
      expenses: months.map((m) => m.expenses),
      net: months.map((m) => m.net),
      // The owner's share, when the months carry it.
      ...(months.length && months.every((m) => m.owner != null) ? { owner: months.map((m) => m.owner) } : {}),
    },
    current,
    previous,
    vs,
  }
}

// Trend line + growth for one money tile. Net's line is green while the
// period is in profit and red at a loss; gross and expenses follow growth.
function trendProps(trend, key, upIsGood, fallbackSub) {
  if (!trend) return { sub: fallbackSub }
  const cur = trend.current?.[key] ?? 0
  const prev = trend.previous ? trend.previous[key] : null
  const tone = key === 'net'
    ? (cur < 0 ? 'bad' : cur > 0 ? 'good' : 'neutral')
    : growthTone(cur, prev, upIsGood)
  return {
    trend: <Sparkline values={trend.values[key]} tone={tone} label={`${key} by month`} />,
    sub: trend.previous ? <Growth current={cur} previous={prev} vs={trend.vs} upIsGood={upIsGood} /> : fallbackSub,
  }
}

type MoneyStripProps = {
  totals: any
  grossSub: string
  pmSub: string
  trend: any
  loading?: boolean
  ownerLabel?: string
  showPm?: any
}

/**
 * KPI strip for a year or a month: gross, expenses, net, and how net splits.
 * totals  { gross, expenses, net, owner, company, pm }; company is the full
 *         company share, out of which the PM is paid.
 * trend   optional buildTrend() result: adds trend lines and growth
 * ownerLabel  the owner tile's name ("Your share" in the owner portal)
 * showPm  false leaves out the PM tile (a unit that never had a PM)
 */
export function MoneyStrip({ totals, grossSub, pmSub, trend, loading = false, ownerLabel = 'Owner share', showPm = true }: MoneyStripProps) {
  const loss = !loading && totals.net < 0
  const kept = totals.company - totals.pm
  const ownerSub = `${OWNER_SPLIT_PCT}% of net`
  return (
    <StatStrip cols={showPm ? 6 : 5}>
      <StatTile
        icon={TrendingUp}
        label="Gross revenue"
        value={formatPeso(totals.gross)}
        loading={loading}
        valueClassName={MONEY_TILE}
        {...trendProps(trend, 'gross', true, grossSub)}
      />
      <StatTile
        icon={Wallet}
        label="Expenses"
        value={formatPeso(totals.expenses)}
        loading={loading}
        valueClassName={MONEY_TILE}
        {...trendProps(trend, 'expenses', false, 'Commissions, cleaning, bills')}
      />
      <StatTile
        icon={Landmark}
        label="Net profit"
        value={formatPeso(totals.net)}
        loading={loading}
        valueClassName={cn(MONEY_TILE, moneyTone(totals.net))}
        {...trendProps(trend, 'net', true, loss ? 'Expenses are higher than revenue' : 'Gross minus expenses')}
      />
      <StatTile
        icon={UserRound}
        label={ownerLabel}
        value={formatPeso(totals.owner)}
        loading={loading}
        valueClassName={cn(MONEY_TILE, lossTone(totals.owner))}
        {...(trend?.values?.owner ? trendProps(trend, 'owner', true, ownerSub) : { sub: ownerSub })}
      />
      <StatTile
        icon={Building2}
        label="Company share"
        value={formatPeso(totals.company)}
        sub={totals.pm > 0 ? `${formatPeso(kept)} kept after PM` : `${COMPANY_SPLIT_PCT}% of net`}
        loading={loading}
        valueClassName={cn(MONEY_TILE, lossTone(totals.company))}
        // Without the PM tile, the last tile takes the whole row on phones.
        className={showPm ? undefined : 'col-span-2 sm:col-span-1'}
      />
      {showPm && <StatTile icon={User} label="PM payout" value={formatPeso(totals.pm)} sub={pmSub} loading={loading} valueClassName={MONEY_TILE} />}
    </StatStrip>
  )
}

type ContractRowProps = {
  contract: any
  lifetime: any
  onClick: () => any
}

function ContractRow({ contract, lifetime, onClick }: ContractRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ROW_GRID, 'w-full text-left px-5 py-3 border-b border-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer')}
    >
      <div className="min-w-0">
        <span className="font-mono text-[12px] font-semibold text-foreground truncate block">{contract.units?.unit_code || '—'}</span>
        <span className="text-[11px] text-foreground truncate block mt-0.5">{contract.units?.building || '—'}</span>
      </div>
      <div className="min-w-0 flex items-center gap-2.5">
        <InitialsAvatar name={contract.owners?.name} size="sm" />
        <div className="min-w-0">
          <span className="text-[12px] font-semibold text-foreground truncate block">{contract.owners?.name || 'No owner'}</span>
          <span className="font-mono text-[11px] text-foreground truncate block mt-0.5">{contract.contract_code || '—'}</span>
        </div>
      </div>
      <div className="min-w-0 tabular-nums text-foreground">
        <span className="text-[12px] truncate block">{formatDateShort(contract.effective_date)}</span>
        <span className="text-[11px] truncate block mt-0.5">→ {contract.expiry_date ? formatDateShort(contract.expiry_date) : 'Open-ended'}</span>
      </div>
      <div className="min-w-0 md:text-right">
        <span className={PHONE_LABEL}>Gross</span>
        <span className="text-[12px] tabular-nums text-foreground truncate block">{formatMoney(lifetime?.gross || 0)}</span>
      </div>
      <div className="min-w-0 md:text-right">
        <span className={PHONE_LABEL}>Net</span>
        <span className={cn('text-[12px] font-semibold tabular-nums truncate block', moneyTone(lifetime?.net))}>
          {formatMoney(lifetime?.net || 0)}
        </span>
      </div>
      <div className="flex justify-end">
        <StatusText status={deriveContractStatus(contract)} />
      </div>
    </button>
  )
}

function useCursorTooltip() {
  const [cursor, setCursor] = useState(null)
  const onMove = useCallback((e) => setCursor({ x: e.clientX, y: e.clientY }), [])
  const onLeave = useCallback(() => setCursor(null), [])
  return { cursor, onMove, onLeave }
}

type CursorTooltipProps = {
  cursor: any
  children: ReactNode
}

function CursorTooltip({ cursor, children }: CursorTooltipProps) {
  if (!cursor) return null
  const style: CSSProperties = {
    position: 'fixed',
    left: Math.min(cursor.x + 14, window.innerWidth - 280),
    top: Math.min(cursor.y + 14, window.innerHeight - 180),
    zIndex: 9999,
    pointerEvents: 'none',
  }
  return (
    <div style={style} className="rounded-md border border-border bg-popover shadow-lg px-3 py-2.5 text-[12px] w-[264px]">
      {children}
    </div>
  )
}

// ─── Chart tooltips (the Dashboard's style) ─────────────────
const TOOLTIP_BOX = 'rounded-md border border-border bg-popover shadow-lg px-3 py-2'

type ChartTooltipProps = {
  active?: any
  payload?: any
  label?: any
  highlight?: string
}

// Gross, expenses and net for one month; `highlight` marks the series on screen.
function ChartTooltip({ active, payload, label, highlight }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload || {}
  const lines = [
    { key: 'gross', label: 'Gross' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'net', label: 'Net' },
  ]
  return (
    <div className={cn(TOOLTIP_BOX, 'min-w-[176px]')}>
      <p className="text-[11px] font-semibold text-foreground mb-1">{label}</p>
      <div className="space-y-0.5">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center justify-between gap-4 text-[12px]">
            <span className={cn('text-foreground', highlight === l.key && 'font-semibold')}>{l.label}</span>
            <span
              className={cn(
                'tabular-nums',
                l.key === 'net' ? moneyTone(row.net) : 'text-foreground',
                (highlight === l.key || (!highlight && l.key === 'net')) && 'font-semibold',
              )}
            >
              {formatMoney(row[l.key] || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type OccupancyTooltipProps = {
  active?: any
  payload?: any
  label?: any
}

function OccupancyTooltip({ active, payload, label }: OccupancyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const pct = payload[0]?.value || 0
  const nights = payload[0]?.payload?.nights || 0
  const days = payload[0]?.payload?.daysInMonth || payload[0]?.payload?.daysCount || 0
  return (
    <div className={TOOLTIP_BOX}>
      <p className="text-[14px] font-semibold tabular-nums text-foreground">{Math.round(pct)}%</p>
      <p className="text-[11px] text-foreground mt-0.5 flex items-center gap-1.5 tabular-nums">
        <span className="inline-block w-3 h-[2px] rounded-full" style={{ backgroundColor: CHART }} />
        {label} · {nights} of {days} nights
      </p>
    </div>
  )
}

type CumulativeTooltipProps = {
  active?: any
  payload?: any
  label?: any
}

function CumulativeTooltip({ active, payload, label }: CumulativeTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const v = payload[0]?.value || 0
  return (
    <div className={TOOLTIP_BOX}>
      <p className={cn('text-[14px] font-semibold tabular-nums', moneyTone(v))}>{formatMoney(v)}</p>
      <p className="text-[11px] text-foreground mt-0.5 flex items-center gap-1.5">
        <span className="inline-block w-3 h-[2px] rounded-full" style={{ backgroundColor: CHART }} />
        Net so far · {label}
      </p>
    </div>
  )
}

type HalfGaugeProps = {
  pct: number
  sublabel: string
  compact?: boolean
}

export function HalfGauge({ pct, sublabel, compact = false }: HalfGaugeProps) {
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
    <div className="flex flex-col items-center justify-center text-foreground">
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
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={active ? CHART : 'currentColor'}
                strokeOpacity={active ? 1 : 0.15}
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.008, duration: 0.15 }}
              />
            )
          })}
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ paddingTop: compact ? 18 : 24 }}
        >
          <motion.p
            key={`${Math.round(clampedPct * 100)}-${compact}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn('font-semibold tracking-tight tabular-nums text-foreground', compact ? 'text-[22px]' : 'text-[28px]')}
          >
            {Math.round(clampedPct * 100)}%
          </motion.p>
          {sublabel && (
            <p className={cn('text-foreground mt-0.5 text-center px-2 tabular-nums', compact ? 'text-[11px]' : 'text-[12px]')}>
              {sublabel}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

type YearNavProps = {
  yearSections: any
  selectedYear: any
  onSelectYear: any
}

function YearNav({ yearSections, selectedYear, onSelectYear }: YearNavProps) {
  const idx = yearSections.findIndex((s) => s.year === selectedYear)
  const canPrev = idx > 0
  const canNext = idx >= 0 && idx < yearSections.length - 1
  return (
    <PeriodStepper
      label={selectedYear}
      canPrev={canPrev}
      canNext={canNext}
      onPrev={() => canPrev && onSelectYear(yearSections[idx - 1].year)}
      onNext={() => canNext && onSelectYear(yearSections[idx + 1].year)}
      prevLabel="Previous year"
      nextLabel="Next year"
      minWidth={56}
    />
  )
}

// ─── Charts ─────────────────────────────────────────────────
const CHART_HEIGHT = 260

// Gross is an outlined bar, expenses hatched, net solid — all logo blue.
function RevenueLegend() {
  return (
    <div className="hidden md:flex items-center gap-3 text-[11px] text-foreground mr-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm border-[1.5px]" style={{ borderColor: CHART }} />
        Gross
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 12 12" className="rounded-sm">
          <defs>
            <pattern id="legend-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={CHART} strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="12" height="12" fill="url(#legend-hatch)" />
        </svg>
        Expenses
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART }} />
        Net
      </span>
    </div>
  )
}

type ChartBodyProps = {
  height?: any
  empty?: boolean
  emptyTitle?: string
  emptyHint?: string
  children: ReactNode
}

function ChartBody({ height = CHART_HEIGHT, empty, emptyTitle = 'No months to show', emptyHint, children }: ChartBodyProps) {
  return (
    <div className="p-5 flex-1">
      <div className={cn('text-foreground', empty ? 'flex flex-col' : '-ml-2')} style={{ height }}>
        {empty ? (
          <EmptyState icon={BarChart3} title={emptyTitle} hint={emptyHint} />
        ) : (
          <LazyChart minHeight={height}>{children}</LazyChart>
        )}
      </div>
    </div>
  )
}

type YearlyRevenueChartProps = {
  yearSections: any
  statements: any
  selectedYear: any
  onSelectYear: any
  title: string
}

const YearlyRevenueChart = memo(function YearlyRevenueChart({ yearSections, statements, selectedYear, onSelectYear, title }: YearlyRevenueChartProps) {
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
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values, 0)
    const span = rawMax - rawMin
    const padded = span > 0 ? span * 0.1 : 1000
    const minY = rawMin >= 0 ? 0 : Math.floor((rawMin - padded) / 1000) * 1000
    const maxY = Math.ceil((rawMax + padded) / 1000) * 1000
    return [minY, maxY]
  }, [data])

  return (
    <Panel>
      <CardHead icon={TrendingUp} title={title} subtitle={`${selectedYear} · gross, expenses and net by month`}>
        <RevenueLegend />
        <YearNav yearSections={yearSections} selectedYear={selectedYear} onSelectYear={onSelectYear} />
      </CardHead>
      <ChartBody height={300} empty={!section || section.months.length === 0} emptyHint={`This contract has no months in ${selectedYear}.`}>
        <ResponsiveContainer width="100%" height={300} debounce={100}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
            <defs>
              <pattern id="expenses-hatch-main" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke={CHART} strokeWidth="1.5" opacity="0.55" />
              </pattern>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...X_AXIS} interval="preserveStartEnd" />
            <YAxis {...Y_AXIS} tickFormatter={formatMoneyCompact} width={56} domain={[minY, maxY]} />
            <Tooltip content={<ChartTooltip />} animationDuration={0} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
            <Bar dataKey="gross" fill="transparent" stroke={CHART} strokeWidth={1.5} name="Gross" maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="expenses" fill="url(#expenses-hatch-main)" name="Expenses" maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="net" fill={CHART} name="Net" maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartBody>
    </Panel>
  )
})

type MonthlyOccupancyChartProps = {
  statements: any
  selectedYear: any
  contract: any
}

const MonthlyOccupancyChart = memo(function MonthlyOccupancyChart({ statements, selectedYear, contract }: MonthlyOccupancyChartProps) {
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
    <Panel>
      <PanelHeader icon={Home} title="Monthly occupancy" subtitle={`${selectedYear} · nights booked ÷ nights in the month`} />
      <ChartBody empty={data.length === 0} emptyHint={`This contract has no months in ${selectedYear}.`}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} debounce={100}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...X_AXIS} interval="preserveStartEnd" />
            <YAxis {...Y_AXIS} tickFormatter={(v) => `${v}%`} width={44} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
            <Tooltip content={<OccupancyTooltip />} animationDuration={0} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
            <Bar dataKey="pct" fill={CHART} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBody>
    </Panel>
  )
})

type WeeklyOccupancyChartProps = {
  statement: any
  contract: any
}

export const WeeklyOccupancyChart = memo(function WeeklyOccupancyChart({ statement, contract }: WeeklyOccupancyChartProps) {
  const [y, m] = statement.month.split('-').map(Number)
  const data = useMemo(
    () => weeklyOccupancyForMonth(y, m, statement.bookingsList, contract),
    [y, m, statement.bookingsList, contract],
  )
  return (
    <Panel>
      <PanelHeader icon={Home} title="Weekly occupancy" subtitle={`${monthLabel(statement.month)} · nights booked each week`} />
      <ChartBody>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} debounce={100}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...X_AXIS} />
            <YAxis {...Y_AXIS} tickFormatter={(v) => `${v}%`} width={44} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
            <Tooltip content={<OccupancyTooltip />} animationDuration={0} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
            <Bar dataKey="pct" fill={CHART} radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBody>
    </Panel>
  )
})

type WeeklyCumulativeChartProps = {
  statement: any
  monthlyExpenses: any
  contract: any
}

export const WeeklyCumulativeChart = memo(function WeeklyCumulativeChart({ statement, monthlyExpenses, contract }: WeeklyCumulativeChartProps) {
  const [y, m] = statement.month.split('-').map(Number)
  const data = useMemo(
    () => weeklyNetProfitForMonth(y, m, statement.bookingsList, statement.cleaningsList, monthlyExpenses, contract),
    [y, m, statement.bookingsList, statement.cleaningsList, monthlyExpenses, contract],
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
    <Panel>
      <PanelHeader icon={TrendingUp} title="Weekly cumulative net" subtitle={`${monthLabel(statement.month)} · bills spread evenly across the weeks`} />
      <ChartBody>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} debounce={100}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="weekly-cumulative-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART} stopOpacity={0.14} />
                <stop offset="100%" stopColor={CHART} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...X_AXIS} padding={{ left: 14, right: 14 }} />
            <YAxis {...Y_AXIS} tickFormatter={formatMoneyCompact} width={52} domain={[minValue, maxValue]} />
            <Tooltip content={<CumulativeTooltip />} animationDuration={0} cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }} />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={CHART}
              strokeWidth={2}
              fill="url(#weekly-cumulative-fill)"
              dot={{ r: 4, fill: CHART, stroke: 'var(--card)', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: CHART, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartBody>
    </Panel>
  )
})

type CumulativeNetChartProps = {
  statements: any
  selectedYear: any
}

const CumulativeNetChart = memo(function CumulativeNetChart({ statements, selectedYear }: CumulativeNetChartProps) {
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
    <Panel>
      <PanelHeader icon={TrendingUp} title="Cumulative net" subtitle={`${selectedYear} · running total since the contract started`} />
      <ChartBody empty={data.length === 0} emptyHint={`This contract has no months in ${selectedYear}.`}>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT} debounce={100}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cumulative-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART} stopOpacity={0.14} />
                <stop offset="100%" stopColor={CHART} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...X_AXIS} interval="preserveStartEnd" padding={{ left: 10, right: 10 }} />
            <YAxis {...Y_AXIS} tickFormatter={formatMoneyCompact} width={52} domain={[minValue, maxValue]} ticks={ticks} />
            <Tooltip content={<CumulativeTooltip />} animationDuration={0} cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }} />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke={CHART}
              strokeWidth={2}
              fill="url(#cumulative-fill)"
              dot={{ r: 3.5, fill: CHART, stroke: 'var(--card)', strokeWidth: 2 }}
              activeDot={{ r: 5, fill: CHART, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartBody>
    </Panel>
  )
})

// ─── Calendar ────────────────────────────────────────────────
// Grid lines between days only — the card's own border draws the outer edge.
const CAL_CELL = 'min-h-[110px] border-b border-r border-border [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0'

type BookingCalendarProps = {
  title: string
  subtitle: ReactNode | string
  month: any
  bookings: any
  cleanings: any
  selectedId: any
  onSelect: (type: any, id: any) => void
}

export function BookingCalendar({ title, subtitle, month, bookings, cleanings, selectedId, onSelect }: BookingCalendarProps) {
  const [y, m] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(y, m - 1, 1))
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const startDow = firstDay.getUTCDay()

  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const dayItems = useMemo(() => {
    const map = {}
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStart = new Date(Date.UTC(y, m - 1, d))
      const dayEnd = new Date(Date.UTC(y, m - 1, d + 1))
      const dayISO = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const items = []

      for (const b of bookings) {
        if (!b.check_in || !b.check_out) continue
        const ci = new Date(`${b.check_in}T00:00:00Z`)
        const co = new Date(`${b.check_out}T00:00:00Z`)
        if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) continue
        if (co < dayStart || ci >= dayEnd) continue
        
        const isCheckinDay = b.check_in === dayISO
        const isCheckoutDay = b.check_out === dayISO
        const isDepartureOnly = isCheckoutDay && !isCheckinDay
        const isCancelled = !!b.cancelled_at

        let rank
        if (isCancelled) rank = 4
        else if (isDepartureOnly) rank = 0
        else if (isCheckinDay) rank = 3
        else rank = 2

        items.push({
          kind: 'booking',
          rank,
          sortKey: `${String(rank).padStart(2, '0')}-${b.check_in || ''}-${b.id}`,
          data: b,
          isCheckinDay,
          isCheckoutDay,
          isCancelled,
        })
      }

      for (const c of (cleanings || [])) {
        if (!c.scheduled_date) continue
        const sd = new Date(`${c.scheduled_date}T00:00:00Z`)
        if (Number.isNaN(sd.getTime())) continue
        if (sd >= dayStart && sd < dayEnd) {
          items.push({
            kind: 'cleaning',
            rank: 1,
            sortKey: `01-${c.scheduled_date}-${c.id}`,
            data: c,
          })
        }
      }

      items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      map[d] = items
    }
    return map
  }, [y, m, daysInMonth, bookings, cleanings])

  const today = new Date()
  const isCurrentMonth = today.getUTCFullYear() === y && today.getUTCMonth() + 1 === m
  const todayDay = isCurrentMonth ? today.getUTCDate() : null

  return (
    <Panel>
      <PanelHeader icon={CalendarDays} title={title} subtitle={subtitle} />
      <div className="sm:hidden">
        <CompactCalendar
          month={month}
          cells={cells}
          dayItems={dayItems}
          todayDay={todayDay}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
      <div className="hidden sm:block">
      <div className="flex items-center gap-x-4 gap-y-1.5 px-5 py-2.5 text-[11px] text-foreground border-b border-border flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--brand-solid) 50%, transparent)',
              borderLeft: '2px dashed rgba(255,255,255,0.85)',
            }}
          />
          Checkout (11:00 AM)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CLEAN_COLOR }} />
          Cleaning (11:00 AM – 3:00 PM)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: BRAND }} />
          Check-in (3:00 PM) / in-house
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: CANCELLED_COLOR }} />
          Cancelled
        </span>
      </div>

      <div className="grid grid-cols-7 border-b border-border">
        {DOW_SHORT.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-foreground text-center py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={idx} className={CAL_CELL} />
          }
          const items = dayItems[day] || []
          const shown = items.slice(0, 3)
          const extra = Math.max(0, items.length - shown.length)
          return (
            <div
              key={idx}
              className={cn(
                CAL_CELL,
                'p-1.5 flex flex-col gap-1',
                todayDay === day && 'bg-brand-solid/5',
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-[11px] font-semibold tabular-nums', todayDay === day ? 'text-brand' : 'text-foreground')}>
                  {day}
                </span>
              </div>
              <div className="space-y-0.5">
                {shown.map((it) => {
                  if (it.kind === 'booking') {
                    const b = it.data
                    return (
                      <CalendarBookingBar
                        key={`b-${b.id}`}
                        booking={b}
                        selected={selectedId?.type === 'booking' && selectedId.id === b.id}
                        onSelect={() => onSelect?.('booking', b.id)}
                        isCheckinDay={it.isCheckinDay}
                        isCheckoutDay={it.isCheckoutDay}
                        isCancelled={it.isCancelled}
                      />
                    )
                  }
                  const c = it.data
                  return (
                    <CalendarCleaningChip
                      key={`c-${c.id}`}
                      cleaning={c}
                      selected={selectedId?.type === 'cleaning' && selectedId.id === c.id}
                      onSelect={() => onSelect?.('cleaning', c.id)}
                    />
                  )
                })}
                {extra > 0 && (
                  <div className="text-[10px] font-semibold text-foreground pl-1">+{extra} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </Panel>
  )
}

type CompactCalendarProps = {
  month: any
  cells: any
  dayItems: Record<string, any[]>
  todayDay: number
  selectedId: any
  onSelect: any
}

// Phones: the month fits the screen. Stays run as a bar across their days
// (arriving on the right half of the check-in day, leaving on the left half of
// the checkout day), cleanings and cancellations are dots, and tapping a day
// lists what happens on it.
function CompactCalendar({ month, cells, dayItems, todayDay, selectedId, onSelect }: CompactCalendarProps) {
  const [y, m] = month.split('-').map(Number)
  const selKey = selectedId ? `${selectedId.type}:${selectedId.id}` : ''
  const [picked, setPicked] = useState(null) // { month, sel, day }: a day tapped while `sel` was selected

  // The first day the selected booking or cleaning appears on.
  const selectedDay = useMemo(() => {
    if (!selectedId) return null
    const found = Object.entries(dayItems).find(([, items]) => items.some((it) => it.kind === selectedId.type && it.data.id === selectedId.id))
    return found ? Number(found[0]) : null
  }, [dayItems, selectedId])
  const firstBusy = Number(Object.keys(dayItems).find((d) => dayItems[d].length)) || 1
  const day = picked && picked.month === month && picked.sel === selKey ? picked.day : (selectedDay ?? todayDay ?? firstBusy)
  const items = dayItems[day] || []
  const dayLabel = new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const departing = 'color-mix(in srgb, var(--brand-solid) 50%, transparent)'

  return (
    <>
      <div className="flex items-center gap-x-3 gap-y-1 px-4 py-2 text-[11px] text-foreground border-b border-border flex-wrap">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full" style={{ backgroundColor: BRAND }} />Stay</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full" style={{ backgroundColor: departing }} />Checkout</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLEAN_COLOR }} />Cleaning</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CANCELLED_COLOR }} />Cancelled</span>
      </div>
      <div className="grid grid-cols-7 border-b border-border">
        {DOW_SHORT.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-foreground text-center py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-b border-border">
        {cells.map((d, idx) => {
          const cell = 'relative h-12 border-b border-r border-border [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0'
          if (d === null) return <div key={idx} className={cell} />
          const list = dayItems[d] || []
          const live = list.filter((it) => it.kind === 'booking' && !it.isCancelled)
          const staying = live.some((it) => !it.isCheckinDay && !it.isCheckoutDay)
          const arriving = live.some((it) => it.isCheckinDay)
          const leaving = live.some((it) => it.isCheckoutDay && !it.isCheckinDay)
          const cleaning = list.some((it) => it.kind === 'cleaning')
          const cancelled = list.some((it) => it.kind === 'booking' && it.isCancelled)
          const isPicked = d === day
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setPicked({ month, sel: selKey, day: d })}
              aria-pressed={isPicked}
              aria-label={`${d} ${monthLabel(month)}: ${list.length ? `${list.length} item${list.length === 1 ? '' : 's'}` : 'nothing'}`}
              className={cn(cell, 'flex flex-col items-center pt-1', isPicked && 'bg-brand-solid/10')}
            >
              <span
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold tabular-nums',
                  todayDay === d ? 'bg-brand-solid text-white' : 'text-foreground',
                )}
              >
                {d}
              </span>
              {staying && <span aria-hidden className="absolute left-0 right-0 bottom-3 h-1.5" style={{ backgroundColor: BRAND }} />}
              {!staying && leaving && <span aria-hidden className="absolute left-0 right-1/2 bottom-3 h-1.5 rounded-r-full" style={{ backgroundColor: departing }} />}
              {!staying && arriving && <span aria-hidden className="absolute left-1/2 right-0 bottom-3 h-1.5 rounded-l-full" style={{ backgroundColor: BRAND }} />}
              {(cleaning || cancelled) && (
                <span aria-hidden className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-1">
                  {cleaning && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CLEAN_COLOR }} />}
                  {cancelled && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CANCELLED_COLOR }} />}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="px-4 pt-3 pb-1.5 text-[12px] font-semibold text-foreground">{dayLabel}</p>
      {items.length === 0 ? (
        <p className="px-4 pb-3 text-[12px] text-foreground">No stays or cleanings this day.</p>
      ) : (
        items.map((it) => {
          const isSel = selectedId?.type === it.kind && selectedId.id === it.data.id
          let colour, name, note, amount
          if (it.kind === 'booking') {
            const b = it.data
            colour = it.isCancelled ? CANCELLED_COLOR : it.isCheckoutDay && !it.isCheckinDay ? departing : BRAND
            name = b.guest_name || b.booking_code
            note = it.isCancelled ? 'Cancelled'
              : it.isCheckinDay ? `Checks in from ${STAY_TIMES.checkIn.label}`
              : it.isCheckoutDay ? `Checks out by ${STAY_TIMES.checkOut.label}`
              : 'Staying'
            amount = b.total_amount
          } else {
            const c = it.data
            colour = CLEAN_COLOR
            name = `${c.type ? c.type[0].toUpperCase() + c.type.slice(1) : 'Basic'} cleaning`
            note = `${CLEANING_WINDOW.label}${c.bookings?.booking_code ? ` · after ${c.bookings.booking_code}` : ''}`
            amount = Number(c.payment_amount || 0) + Number(c.laundry_payment_amount || 0)
          }
          return (
            <button
              key={`${it.kind}-${it.data.id}`}
              type="button"
              onClick={() => onSelect?.(it.kind, it.data.id)}
              aria-pressed={isSel}
              className={cn('w-full text-left flex items-center gap-3 px-4 py-2.5 border-t border-border', isSel ? 'bg-brand-solid/10' : 'active:bg-muted/50')}
            >
              <span aria-hidden className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: colour }} />
              <span className="min-w-0 flex-1">
                <span className={cn('block text-[12.5px] font-semibold text-foreground truncate', it.isCancelled && 'line-through')}>{name}</span>
                <span className={cn('block text-[11px] truncate mt-0.5', it.isCancelled ? 'font-semibold text-red-600 dark:text-red-400' : 'text-foreground')}>{note}</span>
              </span>
              <span className="text-[12.5px] font-semibold tabular-nums text-foreground flex-shrink-0">{formatMoney(amount)}</span>
            </button>
          )
        })
      )}
    </>
  )
}

type CalendarBookingBarProps = {
  booking: any
  selected: boolean
  onSelect: () => any
  isCheckinDay: any
  isCheckoutDay: any
  isCancelled: any
}

function CalendarBookingBar({ booking, selected, onSelect, isCheckinDay, isCheckoutDay, isCancelled }: CalendarBookingBarProps) {
  const { cursor, onMove, onLeave } = useCursorTooltip()
  const bookerComm = Number(booking.booker_commission || 0)
  const affiliateComm = Number(booking.affiliate_commission || 0)
  const isDepartureOnly = isCheckoutDay && !isCheckinDay && !isCancelled
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
          'w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate cursor-pointer transition-all',
          selected && 'ring-2 ring-offset-1 ring-offset-card ring-white',
          (isDepartureOnly || isCancelled) && 'italic',
          isCancelled && 'line-through',
        )}
        style={{
          backgroundColor: isCancelled ? CANCELLED_COLOR : isDepartureOnly ? 'color-mix(in srgb, var(--brand-solid) 50%, transparent)' : BRAND,
          color: 'white',
          borderLeft: isDepartureOnly ? '2px dashed rgba(255,255,255,0.85)' : undefined,
          opacity: isCancelled ? 0.75 : 1,
        }}
        title={
          isCancelled
            ? `Cancelled · ${booking.booking_code}`
            : isDepartureOnly
              ? `Checkout day · ${booking.check_out} · by ${STAY_TIMES.checkOut.label}`
              : isCheckinDay
                ? `Check-in day · ${booking.check_in} · from ${STAY_TIMES.checkIn.label}`
                : undefined
        }
      >
        {booking.guest_name || booking.booking_code}
      </motion.button>
      <CursorTooltip cursor={cursor}>
        <p className="font-mono font-semibold text-foreground mb-0.5">{booking.booking_code}</p>
        <p className="text-foreground font-semibold mb-2">{booking.guest_name}</p>
        {isCancelled && (
          <p className="mb-2 text-[11px] text-foreground break-words">
            <span className="font-semibold text-red-600 dark:text-red-400">Cancelled</span>
            {booking.cancelled_reason && <> · {booking.cancelled_reason}</>}
          </p>
        )}
        <div className="space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-foreground">Check-in</span>
            <span className="text-foreground tabular-nums">
              {booking.check_in}
              {isCheckinDay && <> · {STAY_TIMES.checkIn.label}</>}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-foreground">Check-out</span>
            <span className="text-foreground tabular-nums">
              {booking.check_out}
              {isCheckoutDay && <> · {STAY_TIMES.checkOut.label}</>}
            </span>
          </div>
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

type CalendarCleaningChipProps = {
  cleaning: any
  selected: boolean
  onSelect: () => any
}

function CalendarCleaningChip({ cleaning, selected, onSelect }: CalendarCleaningChipProps) {
  const { cursor, onMove, onLeave } = useCursorTooltip()
  const housekeeper = Number(cleaning.payment_amount || 0)
  const laundry = Number(cleaning.laundry_payment_amount || 0)
  const booking = cleaning.bookings || null
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
        title={`Cleaning · ${CLEANING_WINDOW.label}`}
      >
        <Sparkles size={9} className="inline mr-1" />
        {cleaning.type || 'cleaning'}
      </motion.button>
      <CursorTooltip cursor={cursor}>
        <p className="font-semibold text-foreground mb-1.5">Cleaning</p>
        <div className="space-y-0.5">
          <div className="flex justify-between gap-2"><span className="text-foreground">Code</span><span className="text-foreground font-mono font-semibold">{cleaning.cleaning_code || '—'}</span></div>
          <div className="flex justify-between gap-2">
            <span className="text-foreground">Booking</span>
            {booking?.booking_code ? (
              <span className="text-foreground font-mono font-semibold truncate max-w-[160px]">
                {booking.booking_code}
              </span>
            ) : (
              <span className="text-foreground">Standalone</span>
            )}
          </div>
          {booking?.guest_name && (
            <div className="flex justify-between gap-2">
              <span className="text-foreground">Guest</span>
              <span className="text-foreground font-semibold truncate max-w-[160px]">
                {booking.guest_name}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-2"><span className="text-foreground">Type</span><span className="text-foreground capitalize font-semibold">{cleaning.type || '—'}</span></div>
          <div className="flex justify-between gap-2"><span className="text-foreground">Status</span><span className="text-foreground font-semibold">{cleaning.status || '—'}</span></div>
          <div className="flex justify-between gap-2"><span className="text-foreground">Scheduled</span><span className="text-foreground tabular-nums">{cleaning.scheduled_date || '—'}</span></div>
          <div className="flex justify-between gap-2"><span className="text-foreground">Window</span><span className="text-foreground tabular-nums">{CLEANING_WINDOW.label}</span></div>
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

type MonthSelectorProps = {
  options: any
  selectedMonth: any
  onSelectMonth: any
}

function MonthSelector({ options, selectedMonth, onSelectMonth }: MonthSelectorProps) {
  const idx = options.findIndex((s) => s.month === selectedMonth)
  const canPrev = idx >= 0 && idx < options.length - 1
  const canNext = idx > 0
  const currentLabel = selectedMonth ? monthLabel(selectedMonth) : 'No month'
  return (
    <PeriodStepper
      label={currentLabel}
      canPrev={canPrev}
      canNext={canNext}
      onPrev={() => canPrev && onSelectMonth(options[idx + 1].month)}
      onNext={() => canNext && onSelectMonth(options[idx - 1].month)}
      prevLabel="Previous month"
      nextLabel="Next month"
      minWidth={96}
    />
  )
}

// ─── Contract details ───────────────────────────────────────
function formatDateLong(d) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

type FieldProps = {
  label: string
  value: any
  mono?: boolean
}

function Field({ label, value, mono = false }: FieldProps) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 py-1 items-baseline">
      <span className="text-[11px] font-semibold text-foreground">{label}</span>
      <span className={cn('text-[12px] text-foreground truncate', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

// Terms and owner, beside the revenue chart. On wide screens the body scrolls
// inside the card, so the row height comes from the chart.
// Extensions of this contract, oldest first (empty if none, or if the
// contract_extensions table isn't there yet).
function useContractExtensions(contractId, expiryDate) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    let cancelled = false
    if (!contractId) return undefined
    supabase
      .from('contract_extensions')
      .select('id, previous_expiry, new_expiry, created_at')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        setRows(error ? [] : data || [])
      })
    return () => { cancelled = true }
  }, [contractId, expiryDate])
  return rows
}

type ContractCardProps = {
  contract: any
}

function ContractCard({ contract }: ContractCardProps) {
  const owner = contract.owners || null
  const extensions = useContractExtensions(contract.id, contract.expiry_date)
  return (
    <Panel>
      <PanelHeader icon={FileText} title="Contract" subtitle={`${OWNER_SPLIT_PCT}/${COMPANY_SPLIT_PCT} owner/company split`} />
      <div className="relative flex-1 min-h-[220px]">
        <div className="xl:absolute xl:inset-0 overflow-y-auto">
          <SectionLabel title="Terms" />
          <div className="px-5 py-2.5">
            <Field label="Code" value={contract.contract_code || '—'} mono />
            <Field label="Starts" value={formatDateLong(contract.effective_date)} />
            <Field label="Ends" value={contract.expiry_date ? formatDateLong(contract.expiry_date) : 'Open-ended'} />
            {extensions.length > 0 && (
              <Field
                label="Extended"
                value={`${extensions.length}× · first ended ${formatDateLong(extensions[0].previous_expiry)}`}
              />
            )}
            <Field label="Split" value={`${OWNER_SPLIT_PCT}% owner · ${COMPANY_SPLIT_PCT}% company`} />
            <Field label="PM" value={`${PM_SHARE_OF_COMPANY_PCT}% of the company share`} />
          </div>
          <SectionLabel title="Owner" />
          <div className="px-5 py-3">
            <div className="flex items-center gap-3 mb-2">
              <InitialsAvatar name={owner?.name} size="md" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">{owner?.name || 'No owner'}</p>
                <p className="text-[11px] text-foreground truncate mt-0.5">
                  <span className="font-mono font-medium">{contract.units?.unit_code || '—'}</span> · {contract.units?.building || '—'}
                </p>
              </div>
            </div>
            <Field label="Email" value={owner?.email || '—'} />
            <Field label="Phone" value={owner?.phone || '—'} />
          </div>
          {contract.notes && (
            <>
              <SectionLabel title="Notes" />
              <p className="px-5 py-3 text-[12px] text-foreground whitespace-pre-wrap break-words">{contract.notes}</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

type GeneralStatisticsProps = {
  lifetime: any
  statements: any
  yearSections: any
  selectedYear: any
  onSelectYear: (...args: any[]) => any
  contract: any
  bookings: any
}

function GeneralStatistics({ lifetime, statements, yearSections, selectedYear, onSelectYear, contract, bookings }: GeneralStatisticsProps) {
  const totalBookings = statements.reduce((sum, s) => sum + s.bookingsList.filter((b) => !b.cancelled_at).length, 0)
  const totalCleanings = statements.reduce((sum, s) => sum + s.cleaningsList.length, 0)
  const occupancy = useMemo(
    () => computeContractOccupancy(contract.effective_date, contract.expiry_date, bookings),
    [contract.effective_date, contract.expiry_date, bookings],
  )
  const chartTitle = spansFullYear(contract.effective_date, contract.expiry_date)
    ? 'Yearly revenue'
    : 'Revenue by month'
  const loss = lifetime.net < 0
  // Trend lines over the contract's months (the last two years at most).
  const lifetimeTrend = useMemo(() => {
    const recent = statements.slice(-24).map((s) => ({ gross: s.grossRevenue, expenses: s.totalExpenses, net: s.netProfit }))
    return buildTrend(recent, lifetime, null, '')
  }, [statements, lifetime])
  const since = statements.length > 24 ? 'Last 24 months shown' : statements[0] ? `Monthly since ${monthLabel(statements[0].month)}` : 'Lifetime'
  // Full company share (before the PM's cut), month by month as the CRM rounds it.
  const lifetimeCompany = statements.reduce((t, s) => t + Math.round(s.netProfit * COMPANY_SPLIT_PCT) / 100, 0)
  return (
    <>
      <StatStrip cols={5}>
        <StatTile icon={CalendarRange} label="Bookings" value={totalBookings.toLocaleString('en-PH')} sub="Over the whole contract" />
        <StatTile icon={Sparkles} label="Cleanings" value={totalCleanings.toLocaleString('en-PH')} sub="Over the whole contract" />
        <StatTile
          icon={TrendingUp}
          label="Revenue"
          value={formatPeso(lifetime.gross)}
          valueClassName={MONEY_TILE}
          {...trendProps(lifetimeTrend, 'gross', true, since)}
        />
        <StatTile
          icon={Wallet}
          label="Expenses"
          value={formatPeso(lifetime.expenses)}
          valueClassName={MONEY_TILE}
          {...trendProps(lifetimeTrend, 'expenses', false, since)}
        />
        <StatTile
          icon={Landmark}
          label="Net profit"
          value={formatPeso(lifetime.net)}
          valueClassName={cn(MONEY_TILE, moneyTone(lifetime.net))}
          className="col-span-2 sm:col-span-1"
          {...trendProps(
            lifetimeTrend,
            'net',
            true,
            loss ? 'Expenses are higher than revenue' : `Owner ${formatPeso(lifetime.owner)} · Company ${formatPeso(lifetimeCompany)}`,
          )}
        />
      </StatStrip>

      <div className={DASH_ROW}>
        <YearlyRevenueChart
          yearSections={yearSections}
          statements={statements}
          selectedYear={selectedYear}
          onSelectYear={onSelectYear}
          title={chartTitle}
        />
        <ContractCard contract={contract} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4">
        <MonthlyOccupancyChart statements={statements} selectedYear={selectedYear} contract={contract} />
        <Panel>
          <PanelHeader icon={Home} title="Contract occupancy" subtitle="Across the whole contract" />
          <div className="flex-1 p-5 min-h-[260px] flex items-center justify-center">
            <HalfGauge pct={occupancy.pct} sublabel={`${occupancy.nights} of ${occupancy.totalNights} nights`} />
          </div>
        </Panel>
        <CumulativeNetChart statements={statements} selectedYear={selectedYear} />
      </div>
    </>
  )
}

const LEDGER_ROW = 'grid grid-cols-[minmax(84px,1fr)_repeat(4,minmax(0,1fr))] gap-4 items-center'

type MonthlyLedgerProps = {
  statements: any
  selectedMonth: any
  onSelectMonth: (monthKey: any) => void
}

function MonthlyLedger({ statements, selectedMonth, onSelectMonth }: MonthlyLedgerProps) {
  const ordered = useMemo(
    () => [...statements].sort((a, b) => a.month.localeCompare(b.month)),
    [statements],
  )
  const lifetime = useMemo(() => computeLifetime(ordered), [ordered])
  return (
    <Panel>
      <PanelHeader icon={Table2} title="Monthly ledger" subtitle="Click a month to open it below" count={ordered.length} />
      {ordered.length === 0 ? (
        <EmptyState icon={Table2} title="No months yet" hint="This contract has no months to show." />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className={cn(LEDGER_ROW, 'px-5 py-2.5 border-b border-border text-[11px] font-semibold text-foreground')}>
              <span>Month</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Expenses</span>
              <span className="text-right">Net</span>
              <span className="text-right">PM payout</span>
            </div>

            <div className="max-h-[340px] overflow-y-auto">
              {ordered.map((s) => {
                const isSelected = s.month === selectedMonth
                const [y, m] = s.month.split('-').map(Number)
                const pm = Number(s.pmShare) || 0
                return (
                  <button
                    key={s.month}
                    type="button"
                    onClick={() => onSelectMonth(s.month)}
                    aria-pressed={isSelected}
                    className={cn(
                      LEDGER_ROW,
                      'w-full text-left px-5 py-2.5 border-b border-border last:border-0 text-[12px] tabular-nums transition-colors cursor-pointer',
                      isSelected ? 'bg-brand-solid/10 hover:bg-brand-solid/15' : 'hover:bg-muted/40',
                    )}
                  >
                    <span className={cn('font-semibold', isSelected ? 'text-brand' : 'text-foreground')}>
                      {MONTHS_SHORT[m - 1]} {y}
                    </span>
                    <span className="text-right text-foreground">{formatMoney(s.grossRevenue)}</span>
                    <span className="text-right text-foreground">{formatMoney(s.totalExpenses)}</span>
                    <span className={cn('text-right font-semibold', moneyTone(s.netProfit))}>{formatMoney(s.netProfit)}</span>
                    <span className="text-right text-foreground">{pm > 0 ? formatMoney(pm) : '—'}</span>
                  </button>
                )
              })}
            </div>

            <div className={cn(LEDGER_ROW, 'px-5 py-2.5 border-t border-border text-[12px] font-semibold tabular-nums text-foreground')}>
              <span>Lifetime</span>
              <span className="text-right">{formatMoney(lifetime.gross)}</span>
              <span className="text-right">{formatMoney(lifetime.expenses)}</span>
              <span className={cn('text-right', moneyTone(lifetime.net))}>{formatMoney(lifetime.net)}</span>
              <span className="text-right">{lifetime.pm > 0 ? formatMoney(lifetime.pm) : '—'}</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

type ExpenseImageControlProps = {
  path: any
  onUpload: ((...args: any[]) => any)
  onRemove: ((...args: any[]) => any)
  contractId: any
  size?: string
}

// ─── Expense image + panel ──────────────────────────────────
function ExpenseImageControl({ path, onUpload, onRemove, contractId, size = 'md' }: ExpenseImageControlProps) {
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

  const sizeClasses = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 11 : 12

  return (
    <>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />

      {path ? (
        <div className="relative group/img flex-shrink-0">
          <button
            type="button"
            onClick={() => thumbUrl && setLightboxUrl(thumbUrl)}
            className={cn('rounded-md overflow-hidden border border-border bg-card', sizeClasses)}
            title="View"
          >
            {thumbUrl ? (
              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={iconSize} className="animate-spin text-foreground" />
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
          className={cn('rounded-md border border-dashed border-border flex items-center justify-center text-foreground hover:bg-muted/50 disabled:opacity-50 flex-shrink-0', sizeClasses)}
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
    const { data, error } = await supabase
      .from('contract_monthly_expenses')
      .update(payload)
      .eq('id', existingId)
      .select('*')
      .single()
    if (error) throw error
    logAudit(auditLabel, 'contract_monthly_expenses', existingId, {
      contract_id: contract.id,
      month: monthDate,
      ...patch,
    }).catch(() => {})
    return data
  } else {
    const { data, error } = await supabase
      .from('contract_monthly_expenses')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    logAudit(auditLabel, 'contract_monthly_expenses', data?.id || null, {
      contract_id: contract.id,
      month: monthDate,
      ...patch,
    }).catch(() => {})
    return data
  }
}

type CustomItemRowProps = {
  item: any
  contractId: any
  onUpdate: (...args: any[]) => any
  onRemove: (id: any) => Promise<void>
}

function CustomItemRow({ item, contractId, onUpdate, onRemove }: CustomItemRowProps) {
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
      <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-border bg-brand-solid/5">
        <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={80} placeholder="Name" aria-label="Expense name" className="h-8 flex-1 min-w-[140px] text-xs rounded-md" />
        <Input type="number" min={0} value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} aria-label="Amount" className="h-8 w-[110px] text-xs text-right rounded-md tabular-nums" />
        <ExpenseImageControl
          path={draftImage}
          contractId={contractId}
          onUpload={(path) => setDraftImage(path)}
          onRemove={() => setDraftImage(null)}
          size="sm"
        />
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" className="h-7 rounded-md text-[11px]" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          <Button size="sm" className="h-7 rounded-md text-[11px] text-white" onClick={save} disabled={busy} style={{ backgroundColor: BRAND }}>
            {busy ? <Loader2 size={11} className="animate-spin mr-1" /> : <Save size={11} className="mr-1" />}
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border min-h-[52px]">
      <Receipt size={15} strokeWidth={1.9} className="text-foreground flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground truncate">{item.name}</p>
        <p className="text-[11px] text-foreground truncate mt-0.5">{item.image ? 'Receipt attached' : 'No receipt'}</p>
      </div>
      <ExpenseImageControl
        path={item.image}
        contractId={contractId}
        onUpload={async (path) => { await onUpdate(item.id, { name: item.name, amount: item.amount, image: path }) }}
        onRemove={async () => { await onUpdate(item.id, { name: item.name, amount: item.amount, image: null }) }}
        size="sm"
      />
      <div className="flex items-center">
        <button type="button" onClick={() => setEditing(true)} disabled={busy} className="p-1.5 rounded-md hover:bg-muted text-foreground disabled:opacity-50" title="Edit" aria-label={`Edit ${item.name}`}>
          <Pencil size={12} />
        </button>
        <button type="button" onClick={remove} disabled={busy} className="p-1.5 rounded-md hover:bg-muted text-foreground hover:text-red-600 disabled:opacity-50" title="Remove" aria-label={`Remove ${item.name}`}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
      <span className="text-[13px] font-semibold tabular-nums text-foreground text-right min-w-[84px]">{formatMoney(item.amount)}</span>
    </div>
  )
}

type AddExpenseModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
  contractId: any
}

function AddExpenseModal({ open, onClose, onSubmit, contractId }: AddExpenseModalProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [imagePath, setImagePath] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setName(''); setAmount(''); setImagePath(null); setBusy(false) }
  }, [open])

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

  const submit = async () => {
    setBusy(true)
    try { await onSubmit({ name, amount, image: imagePath }) }
    finally { setBusy(false) }
  }

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
        aria-labelledby="add-expense-title"
        className="relative bg-card rounded-lg max-w-md w-full border border-border overflow-hidden"
        style={{ boxShadow: SOFT_SHADOW }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 id="add-expense-title" className="text-[14px] font-semibold text-foreground">Add expense</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-foreground hover:bg-muted/60"><X size={14} /></button>
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
              <span className="text-[11px] text-foreground">
                Click the box to attach a receipt or proof photo
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={submit} disabled={busy} style={{ backgroundColor: BRAND }}>
            {busy ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
            {busy ? 'Adding…' : 'Add expense'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

type SectionBarProps = {
  icon: LucideIcon
  title: string
  count?: any
  children?: ReactNode
}

// Section heading inside the Expenses card (the Dashboard's section label,
// with room for buttons on the right).
export function SectionBar({ icon: Icon, title, count, children }: SectionBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 h-10 border-b border-border">
      <span className="flex items-center gap-2 min-w-0 text-[11px] font-semibold uppercase tracking-wider text-foreground">
        {Icon && <Icon size={13} strokeWidth={2} className="flex-shrink-0" />}
        <span className="truncate">{title}</span>
        {count != null && <span className="tabular-nums">{count}</span>}
      </span>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </div>
  )
}

type ExpenseRowProps = {
  icon: LucideIcon
  label: any
  hint: string
  amount: any
  editing?: boolean
  children?: ReactNode
}

// One expense: icon, name and a short note, then anything extra (receipt,
// input) and the amount.
export function ExpenseRow({ icon: Icon, label, hint, amount, editing = false, children }: ExpenseRowProps) {
  return (
    <div className={cn('flex items-center gap-3 px-5 py-2.5 border-b border-border min-h-[52px]', editing && 'bg-brand-solid/5')}>
      <Icon size={15} strokeWidth={1.9} className="text-foreground flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground truncate">{label}</p>
        {hint && <p className="text-[11px] text-foreground truncate mt-0.5">{hint}</p>}
      </div>
      {children}
      {amount != null && (
        <span className="text-[13px] font-semibold tabular-nums text-foreground text-right min-w-[84px]">{formatMoney(amount)}</span>
      )}
    </div>
  )
}

type SubtotalRowProps = {
  label: string
  value: any
}

export function SubtotalRow({ label, value }: SubtotalRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5 text-[12px]">
      <span className="text-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{formatMoney(value)}</span>
    </div>
  )
}

// Where the month's expenses went, as one bar split by category in shades of
// the logo blue, with the amounts under it.
const BREAKDOWN_SHADES = [100, 70, 45, 28, 14]

type ExpenseBreakdownProps = {
  parts: any
  total: any
}

export function ExpenseBreakdown({ parts, total }: ExpenseBreakdownProps) {
  if (!(total > 0)) {
    return <p className="text-[12px] text-foreground">No expenses recorded this month.</p>
  }
  const shade = (i) => `color-mix(in srgb, var(--brand) ${BREAKDOWN_SHADES[i]}%, transparent)`
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 rounded-full overflow-hidden" role="img" aria-label="Expenses by category">
        {parts.map((p, i) => (p.value > 0 ? (
          <span
            key={p.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(p.value / total) * 100}%`, backgroundColor: shade(i) }}
            title={`${p.label}: ${formatMoney(p.value)}`}
          />
        ) : null))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((p, i) => (
          <span key={p.key} className="inline-flex items-center gap-1.5 text-[11px] text-foreground">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: shade(i) }} />
            {p.label}
            <span className="font-semibold tabular-nums">{formatMoney(p.value)}</span>
            <span className="tabular-nums">· {Math.round((p.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

type ExpensesPanelProps = {
  statement: any
  contract: any
  onChanged: any
  onStatementPatched: any
}

function ExpensesPanel({ statement, contract, onChanged, onStatementPatched }: ExpensesPanelProps) {
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
  }, [statement.month, statement.electricity, statement.internet, statement.water, statement.marketing])

  const applyPatchedRow = (row) => {
    const customItems = Array.isArray(row?.custom_items)
      ? row.custom_items
          .filter((x) => x && typeof x === 'object')
          .map((x) => ({
            id: typeof x.id === 'string' && x.id ? x.id : `ci_${Math.random().toString(36).slice(2, 10)}`,
            name: typeof x.name === 'string' ? x.name.slice(0, 80) : '',
            amount: Number(x.amount) || 0,
            image: typeof x.image === 'string' ? x.image : null,
          }))
          .filter((x) => x.name.length > 0)
      : []

    const electricity = Number(row?.electricity || 0)
    const internet    = Number(row?.internet    || 0)
    const water       = Number(row?.water       || 0)
    const marketing   = Number(row?.marketing   || 0)
    const customTotal = customItems.reduce((s, x) => s + Number(x.amount || 0), 0)

    const autoComputed =
      Number(statement.bookingCommission || 0) +
      Number(statement.affiliateCommission || 0) +
      Number(statement.housekeeping || 0) +
      Number(statement.laundry || 0)

    const totalExpenses =
      autoComputed + electricity + internet + water + marketing + customTotal

    onStatementPatched?.(statement.month, {
      manualRow: row || null,
      customItems,
      electricity,
      internet,
      water,
      marketing,
      customTotal,
      totalExpenses,
    })
  }

  const saveFixed = async () => {
    setSaving(true)
    try {
      const row = await upsertRow({
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
      applyPatchedRow(row)
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
    const row = await upsertRow({
      contract,
      month: statement.month,
      existingId: statement.manualRow?.id,
      patch: { [imageField]: newPath },
      auditLabel: `SET_EXPENSE_IMAGE:${field}`,
    })
    applyPatchedRow(row)
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
      applyPatchedRow(null)
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
    const next = [
      ...statement.customItems,
      {
        id: `ci_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleaned,
        amount: amt,
        image: image || null,
      },
    ]
    const row = await upsertRow({
      contract,
      month: statement.month,
      existingId: statement.manualRow?.id,
      patch: { custom_items: next },
      auditLabel: 'ADD_CUSTOM_EXPENSE',
    })
    applyPatchedRow(row)
    onChanged()
  }

  const removeCustomItem = async (id) => {
    const item = statement.customItems.find((x) => x.id === id)
    if (item?.image) await deleteExpenseImage(item.image)
    const next = statement.customItems.filter((x) => x.id !== id)
    const row = await upsertRow({
      contract,
      month: statement.month,
      existingId: statement.manualRow?.id,
      patch: { custom_items: next },
      auditLabel: 'REMOVE_CUSTOM_EXPENSE',
    })
    applyPatchedRow(row)
    onChanged()
  }

  const updateCustomItem = async (id, { name, amount, image }) => {
    const cleaned = sanitizeText(name, { max: 80 })
    const amt = sanitizeMoney(amount)
    if (!cleaned) throw new Error('Name is required')
    if (amt <= 0) throw new Error('Amount must be greater than 0')
    const next = statement.customItems.map((x) =>
      x.id === id ? { ...x, name: cleaned, amount: amt, image: image !== undefined ? image : x.image } : x,
    )
    const row = await upsertRow({
      contract,
      month: statement.month,
      existingId: statement.manualRow?.id,
      patch: { custom_items: next },
      auditLabel: 'UPDATE_CUSTOM_EXPENSE',
    })
    applyPatchedRow(row)
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

  const smallButton = 'inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-card text-[11px] font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50'

  const liveBookings = statement.bookingsList.filter((b) => !b.cancelled_at)
  const withAffiliate = liveBookings.filter((b) => Number(b.affiliate_commission || 0) > 0).length
  const cleaningsCount = statement.cleaningsList.length
  const gross = Number(statement.grossRevenue || 0)
  const net = Number(statement.netProfit || 0)
  const total = Number(statement.totalExpenses || 0)

  const breakdown = [
    { key: 'commissions', label: 'Commissions',        value: statement.bookingCommission + statement.affiliateCommission },
    { key: 'cleaning',    label: 'Cleaning & laundry', value: statement.housekeeping + statement.laundry },
    { key: 'utilities',   label: 'Utilities',          value: statement.electricity + statement.internet + statement.water },
    { key: 'marketing',   label: 'Marketing',          value: statement.marketing },
    { key: 'other',       label: 'Other',              value: statement.customTotal },
  ]

  return (
    <Panel>
      <PanelHeader
        icon={Wallet}
        title="Expenses"
        subtitle={`${monthLabel(statement.month)} · where the month's money went`}
      />

      {/* Totals and the split of where it went */}
      <div className="px-5 py-4 border-b border-border space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <SummaryStat label="Total expenses" value={formatMoney(total)}>
            {gross > 0 ? `${Math.round((total / gross) * 100)}% of gross revenue` : 'No revenue this month'}
          </SummaryStat>
          <SummaryStat label="Auto-computed" value={formatMoney(autoComputed)}>
            Commissions, cleaning, laundry
          </SummaryStat>
          <SummaryStat label="Entered by hand" value={formatMoney(manualTotal)}>
            Bills and other expenses
          </SummaryStat>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-foreground">Net profit</p>
            <p className={cn('text-[24px] font-semibold tracking-tight leading-none tabular-nums mt-1.5', moneyTone(net))}>{formatMoney(net)}</p>
            <p className="text-[11px] text-foreground mt-1.5 truncate">
              {gross > 0 ? (
                <><span className={cn('font-semibold', moneyTone(net))}>{Math.round((net / gross) * 100)}%</span> margin</>
              ) : (
                'Gross minus expenses'
              )}
            </p>
          </div>
        </div>
        <ExpenseBreakdown parts={breakdown} total={total} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* Worked out from bookings and cleanings */}
        <div className="min-w-0">
          <SectionBar icon={Lock} title="Auto-computed" />
          <ExpenseRow icon={Wallet} label="Booking commission" hint={plural(liveBookings.length, 'booking', 'bookings')} amount={statement.bookingCommission} />
          <ExpenseRow icon={Wallet} label="Affiliate commission" hint={withAffiliate ? `${plural(withAffiliate, 'booking', 'bookings')} via affiliates` : 'No affiliate bookings'} amount={statement.affiliateCommission} />
          <ExpenseRow icon={Sparkles} label="Housekeeping" hint={plural(cleaningsCount, 'cleaning', 'cleanings')} amount={statement.housekeeping} />
          <ExpenseRow icon={Sparkles} label="Laundry" hint={plural(cleaningsCount, 'cleaning', 'cleanings')} amount={statement.laundry} />
          <SubtotalRow label="Auto-computed" value={autoComputed} />
        </div>

        {/* Entered by hand */}
        <div className="min-w-0">
          <SectionBar icon={Zap} title="Bills">
            {editingFixed ? (
              <>
                <button type="button" onClick={() => setEditingFixed(false)} disabled={saving} className={smallButton}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveFixed}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold text-white bg-brand-solid hover:bg-brand-solid/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                {statement.manualRow && (
                  <button
                    type="button"
                    onClick={clearFixed}
                    disabled={saving}
                    className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline underline-offset-2 disabled:opacity-50"
                  >
                    Clear all
                  </button>
                )}
                <button type="button" onClick={() => setEditingFixed(true)} className={smallButton}>
                  <Pencil size={11} /> Edit
                </button>
              </>
            )}
          </SectionBar>

          {fixedExpenses.map((f) => (
            <ExpenseRow
              key={f.key}
              icon={f.icon}
              label={f.label}
              hint={f.image ? 'Receipt attached' : 'No receipt'}
              amount={editingFixed ? null : f.value}
              editing={editingFixed}
            >
              <ExpenseImageControl
                path={f.image}
                contractId={contract.id}
                onUpload={(path) => setFixedImage(f.key, path)}
                onRemove={() => setFixedImage(f.key, null)}
                size="sm"
              />
              {editingFixed && (
                <Input
                  type="number"
                  min={0}
                  value={draftFixed[f.key]}
                  onChange={(e) => setDraftFixed((p) => ({ ...p, [f.key]: e.target.value }))}
                  aria-label={`${f.label} amount`}
                  className="h-8 w-[120px] text-xs text-right rounded-md tabular-nums"
                />
              )}
            </ExpenseRow>
          ))}

          <SectionBar icon={Plus} title="Other expenses" count={statement.customItems.length}>
            <button type="button" onClick={() => setAddOpen(true)} className={smallButton}>
              <Plus size={11} /> Add
            </button>
          </SectionBar>
          {statement.customItems.length === 0 ? (
            <p className="px-5 py-3 text-[12px] text-foreground border-b border-border">
              Nothing else this month. Add repairs, linen or supplies here.
            </p>
          ) : (
            statement.customItems.map((item) => (
              <CustomItemRow
                key={item.id}
                item={item}
                contractId={contract.id}
                onUpdate={updateCustomItem}
                onRemove={removeCustomItem}
              />
            ))
          )}
          <SubtotalRow label="Entered by hand" value={manualTotal} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
        <span className="text-[12px] font-semibold text-foreground">Total expenses</span>
        <span className="text-[15px] font-bold tabular-nums text-foreground">{formatMoney(total)}</span>
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
    </Panel>
  )
}

// ─── Booking & cleaning rows (right column) ────────────────
function monthKeyFromDate(iso) {
  if (!iso) return null
  const s = String(iso).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s.slice(0, 7)
}

type ActivityRowShellProps = {
  barColor: string
  isSelected: any
  onClick: any
  contextItems: ContextMenuItem[]
  children: ReactNode
}

// List row with a coloured bar matching the calendar: logo blue for
// bookings, red for cancelled ones, green for cleanings.
function ActivityRowShell({ barColor, isSelected, onClick, contextItems, children }: ActivityRowShellProps) {
  return (
    // ContextMenu wraps each row in its own div, so the divider goes on that.
    <ContextMenu items={contextItems} className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isSelected}
        className={cn(
          'relative w-full text-left px-5 py-2.5 transition-colors cursor-pointer overflow-hidden',
          isSelected ? 'bg-brand-solid/10 hover:bg-brand-solid/15' : 'hover:bg-muted/40',
        )}
      >
        <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r" style={{ backgroundColor: barColor }} />
        {children}
      </button>
    </ContextMenu>
  )
}

type AccountingBookingRowProps = {
  booking: any
  isSelected: boolean
  onClick: () => void
}

function AccountingBookingRow({ booking, isSelected, onClick }: AccountingBookingRowProps) {
  const navigate = useNavigate()
  const isCancelled = !!booking.cancelled_at

  const contextItems = [
    { label: 'See in Bookings', icon: Calendar, onSelect: () => navigate(`/admin?tab=bookings&booking=${booking.id}`) },
    { separator: true },
    {
      label: 'Copy booking code',
      icon: Copy,
      hint: booking.booking_code,
      onSelect: () => copyText(booking.booking_code, 'Booking code copied'),
    },
  ]

  const bookerLabel = booking.booker_name || booking.booker_code || '—'
  const affiliateLabel = booking.affiliate_name || booking.affiliate_code || '—'

  return (
    <ActivityRowShell
      barColor={isCancelled ? CANCELLED_COLOR : BRAND}
      isSelected={isSelected}
      onClick={onClick}
      contextItems={contextItems}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] font-semibold text-foreground truncate flex-1">{booking.guest_name || '—'}</span>
        {isCancelled && <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 flex-shrink-0">Cancelled</span>}
        <span className="text-[12px] font-semibold tabular-nums text-foreground flex-shrink-0">{formatMoney(booking.total_amount)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-foreground">
        <span className="font-mono truncate">{booking.booking_code}</span>
        <span className={cn('text-[10px] tabular-nums flex-shrink-0', isCancelled && 'line-through')}>
          {formatDateShort(booking.check_in)} → {formatDateShort(booking.check_out)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-foreground tabular-nums">
        <span className="truncate">Booker <span className="font-semibold">{bookerLabel}</span> {formatMoney(booking.booker_commission || 0)}</span>
        <span className="truncate">Affiliate <span className="font-semibold">{affiliateLabel}</span> {formatMoney(booking.affiliate_commission || 0)}</span>
      </div>
    </ActivityRowShell>
  )
}

type AccountingCleaningRowProps = {
  cleaning: any
  isSelected: boolean
  onClick: () => void
}

function AccountingCleaningRow({ cleaning, isSelected, onClick }: AccountingCleaningRowProps) {
  const navigate = useNavigate()
  const hk = Number(cleaning.payment_amount || 0)
  const laundry = Number(cleaning.laundry_payment_amount || 0)
  const booking = cleaning.bookings || null

  const contextItems = [
    { label: 'See in Housekeeping', icon: Sparkles, onSelect: () => navigate(`/admin?tab=housekeeping&cleaning=${cleaning.id}`) },
    ...(booking?.id
      ? [{
          label: 'See in Bookings',
          icon: Calendar,
          onSelect: () => navigate(`/admin?tab=bookings&booking=${booking.id}`),
        }]
      : []),
    { separator: true },
    {
      label: 'Copy cleaning code',
      icon: Copy,
      hint: cleaning.cleaning_code,
      onSelect: () => copyText(cleaning.cleaning_code, 'Cleaning code copied'),
    },
    ...(booking?.booking_code
      ? [{
          label: 'Copy booking code',
          icon: Copy,
          hint: booking.booking_code,
          onSelect: () => copyText(booking.booking_code, 'Booking code copied'),
        }]
      : []),
  ]

  return (
    <ActivityRowShell barColor={CLEAN_COLOR} isSelected={isSelected} onClick={onClick} contextItems={contextItems}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[12px] font-semibold capitalize text-foreground truncate flex-1">{cleaning.type || 'Cleaning'}</span>
        <span className="text-[10px] tabular-nums text-foreground flex-shrink-0">{formatDateShort(cleaning.scheduled_date)}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-foreground truncate">
        <span className="font-mono">{cleaning.cleaning_code || '—'}</span>
        {' · '}
        {booking?.booking_code ? (
          <>
            <span className="font-mono">{booking.booking_code}</span>
            {booking.guest_name && <> · {booking.guest_name}</>}
          </>
        ) : (
          'Standalone'
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-foreground tabular-nums">
        <span>Housekeeper <span className="font-semibold">{formatMoney(hk)}</span></span>
        <span>Laundry <span className="font-semibold">{formatMoney(laundry)}</span></span>
      </div>
    </ActivityRowShell>
  )
}

// ─── Specific month section ────────────────────────────────
function monthLabelLong(key) {
  return monthKeyToDate(key).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

type DetailLineProps = {
  label: string
  children: ReactNode
  strong?: boolean
}

function DetailLine({ label, children, strong = false }: DetailLineProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5 text-[12px] min-w-0">
      <span className="text-foreground flex-shrink-0">{label}</span>
      <span className={cn('text-foreground tabular-nums truncate', strong ? 'font-bold' : 'font-semibold')}>{children}</span>
    </div>
  )
}

type CloseButtonProps = {
  onClick: () => void
  label?: string
}

function CloseButton({ onClick, label = 'Close' }: CloseButtonProps) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="p-1.5 rounded-md text-foreground hover:bg-muted/60 flex-shrink-0">
      <X size={14} />
    </button>
  )
}

const FOCUS_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.2 },
}

type MonthlySectionProps = {
  statements: any
  selectedMonth: any
  onSelectMonth: (...args: any[]) => any
  contract: any
  monthlyExpenses: any
  onChanged: () => void
  onStatementPatched: (monthKey: any, patch: any) => void
  allBookings: any
  allCleanings: any
}

function MonthlySection({
  statements,
  selectedMonth,
  onSelectMonth,
  contract,
  monthlyExpenses,
  onChanged,
  onStatementPatched,
  allBookings,
  allCleanings,
}: MonthlySectionProps) {
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

  const monthCounts = useMemo(() => {
    if (!statement) return { bookings: 0, cancelled: 0, cleanings: 0 }
    const cancelled = statement.bookingsList.filter((b) => b.cancelled_at).length
    return {
      bookings: statement.bookingsList.length - cancelled,
      cancelled,
      cleanings: statement.cleaningsList.length,
    }
  }, [statement])

  // Trend lines over the six months up to this one; growth against the month before.
  const monthTrend = useMemo(() => {
    const idx = statements.findIndex((s) => s.month === selectedMonth)
    if (idx < 0) return null
    const pick = (s) => ({ gross: s.grossRevenue, expenses: s.totalExpenses, net: s.netProfit })
    const recent = statements.slice(Math.max(0, idx - 5), idx + 1).map(pick)
    const prev = idx > 0 ? statements[idx - 1] : null
    const prevLabel = prev ? MONTHS_SHORT[Number(prev.month.split('-')[1]) - 1] : ''
    return buildTrend(recent, pick(statements[idx]), prev ? pick(prev) : null, prevLabel)
  }, [statements, selectedMonth])

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

  // One line under the month name that says what happened in it.
  const monthSummary = statement
    ? [
        plural(monthCounts.bookings, 'booking', 'bookings'),
        plural(monthCounts.cleanings, 'cleaning', 'cleanings'),
        monthOccupancy && `${Math.round(monthOccupancy.pct * 100)}% occupied`,
      ].filter(Boolean).join(' · ')
    : 'Pick a month in the ledger or with the arrows'

  const calendarSubtitle = (
    <>
      {plural(monthCounts.bookings, 'booking', 'bookings')} · {plural(monthCounts.cleanings, 'cleaning', 'cleanings')}
      {monthCounts.cancelled > 0 && (
        <> · <span className="font-semibold text-red-600 dark:text-red-400">{monthCounts.cancelled} cancelled</span></>
      )}
    </>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold text-foreground tracking-tight leading-tight">
            {statement ? monthLabelLong(statement.month) : 'Month'}
          </h2>
          <p className="text-[12.5px] text-foreground mt-1 truncate">
            {monthSummary}
            {monthCounts.cancelled > 0 && (
              <> · <span className="font-semibold text-red-600 dark:text-red-400">{monthCounts.cancelled} cancelled</span></>
            )}
          </p>
        </div>
        <MonthSelector options={options} selectedMonth={selectedMonth} onSelectMonth={onSelectMonth} />
      </div>

      {!statement ? (
        <Panel>
          <EmptyState icon={CalendarDays} title="No month selected" hint="Pick a month in the ledger or with the arrows." />
        </Panel>
      ) : (
        <>
          <MoneyStrip
            totals={{
              gross: statement.grossRevenue,
              expenses: statement.totalExpenses,
              net: statement.netProfit,
              owner: statement.ownerShare,
              // The full company share; the breakdown's companyShare is what's
              // left after the PM, so it's worked out from net here.
              company: Math.round(statement.netProfit * COMPANY_SPLIT_PCT) / 100,
              pm: Number(statement.pmShare) || 0,
            }}
            grossSub={`${plural(monthCounts.bookings, 'booking', 'bookings')} this month`}
            pmSub={statement.pmName ? `${statement.pmName} was active` : 'No PM this month'}
            trend={monthTrend}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel>
              <PanelHeader icon={Home} title="Month occupancy" subtitle={`${monthLabel(statement.month)} · nights booked`} />
              <div className="flex-1 p-5 flex flex-col items-center justify-center gap-5">
                <HalfGauge
                  pct={monthOccupancy?.pct || 0}
                  sublabel={monthOccupancy ? `${monthOccupancy.nights} of ${monthOccupancy.daysInMonth} nights` : '—'}
                />
                <div className="w-full grid grid-cols-2 gap-4 pt-4 border-t border-border">
                  <SummaryStat label="Bookings" value={monthCounts.bookings}>
                    {formatMoney(statement.grossRevenue)} gross
                  </SummaryStat>
                  <SummaryStat label="Cleanings" value={monthCounts.cleanings}>
                    {formatMoney(statement.housekeeping + statement.laundry)} paid
                  </SummaryStat>
                </div>
              </div>
            </Panel>
            <WeeklyOccupancyChart statement={statement} contract={contract} />
            <WeeklyCumulativeChart statement={statement} monthlyExpenses={monthlyExpenses} contract={contract} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
            <div ref={calendarRef} className="scroll-mt-4 min-w-0">
              <BookingCalendar
                title={`${monthLabel(statement.month)} calendar`}
                subtitle={calendarSubtitle}
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

            <Panel>
              <PanelHeader icon={CalendarRange} title="Bookings and cleanings" subtitle="Everything on this unit · click one to find it" />
              <div className="px-5 py-3 border-b border-border">
                <StatusTabs
                  tabs={[{ id: 'bookings', label: 'Bookings' }, { id: 'cleanings', label: 'Cleanings' }]}
                  value={listTab}
                  onChange={setListTab}
                  counts={{ bookings: allBookingsSorted.length, cleanings: allCleaningsSorted.length }}
                  label="Show bookings or cleanings"
                  fill
                />
              </div>
              <div className="relative flex-1 min-h-[320px]">
                <div className="max-h-[520px] lg:max-h-none lg:absolute lg:inset-0 overflow-y-auto overscroll-contain flex flex-col">
                  {listTab === 'bookings' ? (
                    allBookingsSorted.length === 0 ? (
                      <EmptyState icon={Calendar} title="No bookings yet" hint="Bookings on this unit show here." />
                    ) : (
                      allBookingsSorted.map((b) => (
                        <AccountingBookingRow
                          key={b.id}
                          booking={b}
                          isSelected={selectedCalendarId?.type === 'booking' && selectedCalendarId.id === b.id}
                          onClick={() => focusBooking(b)}
                        />
                      ))
                    )
                  ) : allCleaningsSorted.length === 0 ? (
                    <EmptyState icon={Sparkles} title="No cleanings yet" hint="Cleanings on this unit show here." />
                  ) : (
                    allCleaningsSorted.map((c) => (
                      <AccountingCleaningRow
                        key={c.id}
                        cleaning={c}
                        isSelected={selectedCalendarId?.type === 'cleaning' && selectedCalendarId.id === c.id}
                        onClick={() => focusCleaning(c)}
                      />
                    ))
                  )}
                </div>
              </div>
            </Panel>
          </div>

          <AnimatePresence initial={false}>
            {focusedBooking && (
              <motion.div key={`booking-${focusedBooking.id}`} {...FOCUS_MOTION}>
                <Panel>
                  <PanelHeader
                    icon={Calendar}
                    title={focusedBooking.guest_name || focusedBooking.booking_code}
                    subtitle={<span className="font-mono">{focusedBooking.booking_code}</span>}
                    action={<CloseButton onClick={clearFocus} />}
                  />
                  {focusedBooking.cancelled_at && (
                    <p className="px-5 pt-3 text-[12px] text-foreground break-words">
                      <span className="font-semibold text-red-600 dark:text-red-400">Cancelled</span>
                      {focusedBooking.cancelled_reason && <> · {focusedBooking.cancelled_reason}</>}
                    </p>
                  )}
                  <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-10">
                    <DetailLine label="Check-in">{formatDateLong(focusedBooking.check_in)}</DetailLine>
                    <DetailLine label="Check-out">{formatDateLong(focusedBooking.check_out)}</DetailLine>
                    <DetailLine label="Guests">{focusedBooking.guests || 1}</DetailLine>
                    <DetailLine label="Total">{formatMoney(focusedBooking.total_amount)}</DetailLine>
                    <DetailLine label="Payment"><span className="capitalize">{focusedBooking.payment_status || '—'}</span></DetailLine>
                    {Number(focusedBooking.booker_commission || 0) > 0 && (
                      <DetailLine label="Booker commission">{formatMoney(focusedBooking.booker_commission)}</DetailLine>
                    )}
                    {Number(focusedBooking.affiliate_commission || 0) > 0 && (
                      <DetailLine label="Affiliate commission">{formatMoney(focusedBooking.affiliate_commission)}</DetailLine>
                    )}
                  </div>
                </Panel>
              </motion.div>
            )}

            {focusedCleaning && (
              <motion.div key={`cleaning-${focusedCleaning.id}`} {...FOCUS_MOTION}>
                <Panel>
                  <PanelHeader
                    icon={Sparkles}
                    title={<span className="capitalize">{focusedCleaning.type || 'Cleaning'}</span>}
                    subtitle={
                      <>
                        <span className="font-mono">{focusedCleaning.cleaning_code || '—'}</span>
                        {focusedCleaning.bookings?.booking_code && (
                          <>
                            {' · from '}
                            <span className="font-mono">{focusedCleaning.bookings.booking_code}</span>
                            {focusedCleaning.bookings.guest_name && <> · {focusedCleaning.bookings.guest_name}</>}
                          </>
                        )}
                      </>
                    }
                    action={<CloseButton onClick={clearFocus} />}
                  />
                  <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-10">
                    <DetailLine label="Scheduled">{formatDateLong(focusedCleaning.scheduled_date)}</DetailLine>
                    <DetailLine label="Window">{CLEANING_WINDOW.label}</DetailLine>
                    <DetailLine label="Status"><span className="capitalize">{focusedCleaning.status || '—'}</span></DetailLine>
                    <DetailLine label="Housekeeper">{formatMoney(focusedCleaning.payment_amount || 0)}</DetailLine>
                    <DetailLine label="Laundry">{formatMoney(focusedCleaning.laundry_payment_amount || 0)}</DetailLine>
                    <DetailLine label="Total cost" strong>
                      {formatMoney((focusedCleaning.payment_amount || 0) + (focusedCleaning.laundry_payment_amount || 0))}
                    </DetailLine>
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>

          <ExpensesPanel
            statement={statement}
            contract={contract}
            onChanged={onChanged}
            onStatementPatched={onStatementPatched}
          />
        </>
      )}
    </div>
  )
}

type ContractDetailProps = {
  contract: any
  terms?: any
  lifetimeMap: any
  onSelectContract: (id: any) => void
  onBack: () => void
  onChanged: (signal?: any) => Promise<void>
}

// ─── Contract detail ────────────────────────────────────────
const ContractDetail = memo(function ContractDetail({ contract, terms = [], lifetimeMap, onSelectContract, onBack, onChanged }: ContractDetailProps) {
  const [bookings, setBookings] = useState([])
  const [cleanings, setCleanings] = useState([])
  const [monthlyExpenses, setMonthlyExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [baseStatements, setBaseStatements] = useState([])
  const [statementsLoading, setStatementsLoading] = useState(true)
  const [optimisticPatches, setOptimisticPatches] = useState({})

  const contractId = contract?.id
  const contractUnitId = contract?.unit_id

  const prevContractIdRef = useRef(contractId)
  useEffect(() => {
    if (prevContractIdRef.current !== contractId) {
      prevContractIdRef.current = contractId
      setBookings([])
      setCleanings([])
      setMonthlyExpenses([])
      setBaseStatements([])
      setOptimisticPatches({})
      setLoading(true)
      setStatementsLoading(true)
    }
  }, [contractId])

  const fetchDetailData = useCallback(async (signal?) => {
    if (!contractId || !contractUnitId) return
    setLoading(true)
    try {
      const [bRes, clRes, exRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, unit_id, booking_code, guest_name, check_in, check_out, guests, total_amount, booker_commission, affiliate_commission, booker_name, booker_code, affiliate_name, affiliate_code, payment_status, balance, deleted_at, completed_at, cancelled_at, cancelled_reason')
          .eq('unit_id', contractUnitId)
          .is('deleted_at', null),
        supabase
          .from('cleanings')
          .select(`
            id, cleaning_code, unit_id, type, scheduled_date, status,
            payment_amount, laundry_payment_amount,
            photos_before, photos_after, photos_report,
            booking_id,
            bookings:booking_id ( id, booking_code, guest_name )
          `)
          .eq('unit_id', contractUnitId),
        supabase
          .from('contract_monthly_expenses')
          .select('*')
          .eq('contract_id', contractId),
      ])
      if (signal?.aborted) return
      if (bRes.error) throw bRes.error
      if (clRes.error) throw clRes.error
      if (exRes.error) throw exRes.error
      setBookings(bRes.data || [])
      setCleanings(clRes.data || [])
      setMonthlyExpenses(exRes.data || [])
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load contract detail:', err)
      toast.error('Failed to load contract detail')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [contractId, contractUnitId])

  useEffect(() => {
    const ac = new AbortController()
    fetchDetailData(ac.signal)
    return () => ac.abort()
  }, [fetchDetailData])

  useEffect(() => {
    if (!contractUnitId || !contractId) return
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

  useEffect(() => {
    if (!contractId) return
    let cancelled = false
    setStatementsLoading(true)
    fetchContractMonthlyBreakdown(contractId)
      .then((rows) => { if (!cancelled) setBaseStatements(rows) })
      .catch((err) => {
        console.error('Failed to load monthly breakdown:', err)
        toast.error('Failed to load monthly breakdown')
      })
      .finally(() => { if (!cancelled) setStatementsLoading(false) })
    return () => { cancelled = true }
  }, [contractId])

  const handleStatementPatched = useCallback((monthKey, patch) => {
    setOptimisticPatches((prev) => ({
      ...prev,
      [monthKey]: { ...(prev[monthKey] || {}), ...patch },
    }))
  }, [])

  const statements = useMemo(() => {
    const fullMonths = enumerateMonths(effectiveDate, expiryDate)
    const monthList = fullMonths.length > 0
      ? fullMonths
      : baseStatements.map((r) => r.month)
    if (monthList.length === 0) return []
    const baseByMonth = new Map()
    for (const row of baseStatements) baseByMonth.set(row.month, row)

    const bookingsByMonth = new Map()
    for (const b of bookings) {
      if (!b.check_in) continue
      const month = b.check_in.slice(0, 7)
      if (!bookingsByMonth.has(month)) bookingsByMonth.set(month, [])
      bookingsByMonth.get(month).push(b)
    }

    const cleaningsByMonth = new Map()
    for (const c of cleanings) {
      if (!c.scheduled_date) continue
      const month = c.scheduled_date.slice(0, 7)
      if (!cleaningsByMonth.has(month)) cleaningsByMonth.set(month, [])
      cleaningsByMonth.get(month).push(c)
    }

    const expensesByMonth = new Map()
    for (const e of monthlyExpenses) {
      if (!e.month) continue
      const month = String(e.month).slice(0, 7)
      expensesByMonth.set(month, e)
    }

    return monthList.map((month) => {
      const base = baseByMonth.get(month) || makeEmptyStatement(month)
      const manualRow = expensesByMonth.get(month) || null
      const customItems = Array.isArray(manualRow?.custom_items)
        ? manualRow.custom_items
            .filter((x) => x && typeof x === 'object')
            .map((x) => ({
              id: typeof x.id === 'string' && x.id ? x.id : `ci_${Math.random().toString(36).slice(2, 10)}`,
              name: typeof x.name === 'string' ? x.name.slice(0, 80) : '',
              amount: Number(x.amount) || 0,
              image: typeof x.image === 'string' ? x.image : null,
            }))
            .filter((x) => x.name.length > 0)
        : []
      let merged = {
        ...base,
        month,
        bookingsList: bookingsByMonth.get(month) || [],
        cleaningsList: cleaningsByMonth.get(month) || [],
        manualRow,
        customItems,
      }
      const patch = optimisticPatches[month]
      if (patch) {
        merged = recomputeStatement(merged, patch)
      }
      return merged
    })
  }, [baseStatements, bookings, cleanings, monthlyExpenses, effectiveDate, expiryDate, optimisticPatches])

  useEffect(() => {
    if (Object.keys(optimisticPatches).length === 0) return
    setOptimisticPatches((prev) => {
      let changed = false
      const next = { ...prev }
      for (const month of Object.keys(prev)) {
        const base = baseStatements.find((r) => r.month === month)
        if (!base) continue
        const opt = prev[month]
        const fields: [string, number][] = [
          ['electricity',   Number(base.electricity   || 0)],
          ['internet',      Number(base.internet      || 0)],
          ['water',         Number(base.water         || 0)],
          ['marketing',     Number(base.marketing     || 0)],
          ['customTotal',   Number(base.customTotal   || 0)],
          ['totalExpenses', Number(base.totalExpenses || 0)],
          ['pmShare',       Number(base.pmShare       || 0)],
        ]
        const allMatch = fields.every(([k, rpcVal]) => {
          if (opt[k] == null) return true
          return Math.abs(Number(opt[k]) - rpcVal) < 0.5
        })
        if (allMatch) {
          delete next[month]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [baseStatements, optimisticPatches])

  const lifetime = useMemo(() => computeLifetime(statements), [statements])
  const yearSections = useMemo(
    () => buildYearSections(effectiveDate, expiryDate),
    [effectiveDate, expiryDate],
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

  const header = (
    <>
      <DetailHeader contract={contract} terms={terms} onSelectContract={onSelectContract} onBack={onBack} />
      {terms.length > 1 && (
        <AllTermsCard terms={terms} currentId={contract.id} lifetimeMap={lifetimeMap} onSelectContract={onSelectContract} />
      )}
    </>
  )

  if ((loading || statementsLoading) && statements.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className={PAGE}>
          {header}
          <div className="py-24 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-foreground" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className={PAGE}>
        {header}

        <GeneralStatistics
          lifetime={lifetime}
          statements={statements}
          yearSections={yearSections}
          selectedYear={selectedYear}
          onSelectYear={setSelectedYear}
          contract={contract}
          bookings={bookings}
        />

        <MonthlyLedger
          statements={statements}
          selectedMonth={selectedMonth}
          onSelectMonth={handleJumpToMonth}
        />

        <section ref={monthSectionRef} className="scroll-mt-4">
          <MonthlySection
            statements={statements}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            contract={contract}
            monthlyExpenses={monthlyExpenses}
            onChanged={handleChanged}
            onStatementPatched={handleStatementPatched}
            allBookings={bookings}
            allCleanings={cleanings}
          />
        </section>
      </div>
    </div>
  )
})

type DetailHeaderProps = {
  contract: any
  terms?: any
  onSelectContract: any
  onBack: any
}

// Back button, unit and status, with the contract's facts on one line —
// laid out like the Dashboard's greeting.
function DetailHeader({ contract, terms = [], onSelectContract, onBack }: DetailHeaderProps) {
  const navigate = useNavigate()
  const termIndex = terms.findIndex((t) => t.id === contract.id)
  const previousTerm = termIndex > 0 ? terms[termIndex - 1] : null
  const nextTerm = termIndex >= 0 && termIndex < terms.length - 1 ? terms[termIndex + 1] : null
  const facts = [
    contract.units?.building,
    contract.contract_code,
    contract.owners?.name || 'No owner',
    `${formatDateShort(contract.effective_date)} → ${contract.expiry_date ? formatDateShort(contract.expiry_date) : 'open-ended'}`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all contracts"
          title="Back to all contracts"
          className="mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-card text-foreground shadow-sm hover:bg-muted/50 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">{contract.units?.unit_code || '—'}</h1>
            <StatusText status={deriveContractStatus(contract)} className="text-[12px]" />
            {terms.length > 1 && termIndex >= 0 && (
              <span className="text-[12px] font-medium text-foreground">Term {termIndex + 1} of {terms.length}</span>
            )}
          </div>
          <p className="text-[12.5px] text-foreground mt-1 truncate">{facts}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {terms.length > 1 && (
          <PeriodStepper
            label={`Term ${termIndex + 1}`}
            canPrev={!!previousTerm}
            canNext={!!nextTerm}
            onPrev={() => previousTerm && onSelectContract?.(previousTerm.id)}
            onNext={() => nextTerm && onSelectContract?.(nextTerm.id)}
            prevLabel="Previous term"
            nextLabel="Next term"
            minWidth={60}
          />
        )}
        <button
          type="button"
          onClick={() => navigate(`/admin?tab=contracts&contract=${contract.id}`)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-[12px] font-medium text-foreground shadow-sm hover:bg-muted/50 transition-colors"
          title="Open this contract, its PDF and notes"
        >
          <FileText size={13} />
          See in Contracts
        </button>
        <StatementActions key={contract.id} contract={contract} compact />
      </div>
    </div>
  )
}

// Every term of a renewed contract, with each term's lifetime figures and the
// total across them. Each term keeps its own figures; this only adds them up.
const TERMS_ROW = 'grid grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_84px] gap-4 items-center'

type AllTermsCardProps = {
  terms: any
  currentId: any
  lifetimeMap: any
  onSelectContract: any
}

function AllTermsCard({ terms, currentId, lifetimeMap, onSelectContract }: AllTermsCardProps) {
  const figures = (t) => lifetimeMap?.get(t.id) || { gross: 0, expenses: 0, net: 0 }
  const total = terms.reduce((acc, t) => {
    const f = figures(t)
    return { gross: acc.gross + Number(f.gross || 0), expenses: acc.expenses + Number(f.expenses || 0), net: acc.net + Number(f.net || 0) }
  }, { gross: 0, expenses: 0, net: 0 })
  return (
    <Panel>
      <PanelHeader
        icon={History}
        title="All terms"
        subtitle={`${terms.length} contracts on this unit, renewed one after another · ${formatDateShort(terms[0].effective_date)} → ${terms[terms.length - 1].expiry_date ? formatDateShort(terms[terms.length - 1].expiry_date) : 'open-ended'}`}
        count={terms.length}
      />
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={cn(TERMS_ROW, 'px-5 py-2.5 border-b border-border text-[11px] font-semibold text-foreground')}>
            <span>Term</span>
            <span>Contract</span>
            <span>Dates</span>
            <span className="text-right">Gross</span>
            <span className="text-right">Expenses</span>
            <span className="text-right">Net</span>
            <span className="text-right">Status</span>
          </div>
          {terms.map((t, i) => {
            const f = figures(t)
            const isCurrent = t.id === currentId
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => !isCurrent && onSelectContract?.(t.id)}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(
                  TERMS_ROW,
                  'w-full text-left px-5 py-2.5 border-b border-border text-[12px] tabular-nums transition-colors',
                  isCurrent ? 'bg-brand-solid/10' : 'hover:bg-muted/40 cursor-pointer',
                )}
              >
                <span className={cn('font-semibold', isCurrent ? 'text-brand' : 'text-foreground')}>Term {i + 1}</span>
                <span className="font-mono font-semibold text-foreground truncate">{t.contract_code || '—'}</span>
                <span className="text-foreground truncate">{formatDateShort(t.effective_date)} → {t.expiry_date ? formatDateShort(t.expiry_date) : 'open'}</span>
                <span className="text-right text-foreground">{formatMoney(f.gross)}</span>
                <span className="text-right text-foreground">{formatMoney(f.expenses)}</span>
                <span className={cn('text-right font-semibold', moneyTone(f.net))}>{formatMoney(f.net)}</span>
                <span className="flex justify-end"><StatusText status={deriveContractStatus(t)} /></span>
              </button>
            )
          })}
          <div className={cn(TERMS_ROW, 'px-5 py-2.5 text-[12px] font-semibold tabular-nums text-foreground')}>
            <span>All terms</span>
            <span />
            <span />
            <span className="text-right">{formatMoney(total.gross)}</span>
            <span className="text-right">{formatMoney(total.expenses)}</span>
            <span className={cn('text-right', moneyTone(total.net))}>{formatMoney(total.net)}</span>
            <span />
          </div>
        </div>
      </div>
    </Panel>
  )
}

// ─── Year performance (list page) ───────────────────────────
const METRICS = {
  gross:    { label: 'Gross',    note: 'Booking revenue by month' },
  expenses: { label: 'Expenses', note: 'Commissions, cleaning and bills by month' },
  net:      { label: 'Net',      note: 'Gross minus expenses by month' },
}

// RPC rows → Jan..Dec, with numbers (months without activity are zero).
function toYearMonths(rows) {
  const out = MONTHS_SHORT.map((label, i) => ({ month: i, label, gross: 0, expenses: 0, net: 0, pm: 0 }))
  for (const r of rows || []) {
    const i = new Date(`${String(r.month_start).slice(0, 10)}T00:00:00Z`).getUTCMonth()
    if (!Number.isFinite(i) || !out[i]) continue
    out[i] = {
      ...out[i],
      gross: Number(r.gross || 0),
      expenses: Number(r.expenses || 0),
      net: Number(r.net || 0),
      pm: Number(r.pm_share || 0),
    }
  }
  return out
}

type YearTableProps = {
  data: any
}

// The table twin of the chart — every value readable without hovering.
function YearTable({ data }: YearTableProps) {
  const totals = data.reduce(
    (t, r) => ({ gross: t.gross + r.gross, expenses: t.expenses + r.expenses, net: t.net + r.net, pm: t.pm + r.pm }),
    { gross: 0, expenses: 0, net: 0, pm: 0 },
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-foreground border-b border-border">
            <th className="font-medium py-2 pr-4">Month</th>
            <th className="font-medium py-2 pr-4 text-right">Gross</th>
            <th className="font-medium py-2 pr-4 text-right">Expenses</th>
            <th className="font-medium py-2 pr-4 text-right">Net</th>
            <th className="font-medium py-2 text-right">PM payout</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {data.map((r) => (
            <tr key={r.month} className="border-b border-border/60 last:border-0 text-foreground">
              <td className="py-1.5 pr-4">{r.label}</td>
              <td className="py-1.5 pr-4 text-right">{formatMoney(r.gross)}</td>
              <td className="py-1.5 pr-4 text-right">{formatMoney(r.expenses)}</td>
              <td className={cn('py-1.5 pr-4 text-right', moneyTone(r.net))}>{formatMoney(r.net)}</td>
              <td className="py-1.5 text-right">{r.pm > 0 ? formatMoney(r.pm) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="tabular-nums">
          <tr className="border-t border-border font-semibold text-foreground">
            <td className="py-2 pr-4">Total</td>
            <td className="py-2 pr-4 text-right">{formatMoney(totals.gross)}</td>
            <td className="py-2 pr-4 text-right">{formatMoney(totals.expenses)}</td>
            <td className={cn('py-2 pr-4 text-right', moneyTone(totals.net))}>{formatMoney(totals.net)}</td>
            <td className="py-2 text-right">{totals.pm > 0 ? formatMoney(totals.pm) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

type YearPerformanceCardProps = {
  year: any
  rows: any
  loading: boolean
  error: any
  onRetry: () => Promise<void>
}

function YearPerformanceCard({ year, rows, loading, error, onRetry }: YearPerformanceCardProps) {
  const [metric, setMetric] = useState('gross')
  const [view, setView] = useState('chart')
  const data = useMemo(() => toYearMonths(rows), [rows])
  // First load shows a skeleton; later refetches hold the old render, dimmed.
  const firstLoad = loading && rows.length === 0

  return (
    <Panel>
      <CardHead icon={BarChart3} title="Performance" subtitle={`${year} · all contracts`}>
        <StatusTabs
          tabs={Object.entries(METRICS).map(([id, m]) => ({ id, label: m.label }))}
          value={metric}
          onChange={setMetric}
          label="Chart metric"
        />
        <ViewToggle view={view} onChange={setView} />
      </CardHead>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertTriangle size={22} strokeWidth={1.75} className="text-foreground mb-2" />
          <p className="text-[12px] font-semibold text-foreground">Couldn't load {year}'s figures</p>
          <p className="text-[11px] text-foreground mt-0.5 max-w-sm break-words">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white bg-brand-solid hover:bg-brand-solid/90"
          >
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      ) : firstLoad ? (
        <div className="p-5">
          <div className="h-[278px] rounded-md bg-muted/60 animate-pulse" />
        </div>
      ) : (
        <div className={cn('p-5 transition-opacity', loading && 'opacity-50')}>
          <p className="text-[12px] font-medium text-foreground">
            {view === 'chart' ? METRICS[metric].label : 'Monthly breakdown'}
            <span className="font-normal"> · {view === 'chart' ? METRICS[metric].note : year}</span>
          </p>
          {view === 'chart' ? (
            <div className="h-[260px] mt-3 -ml-2 text-foreground">
              <LazyChart minHeight={260}>
                <ResponsiveContainer width="100%" height={260} debounce={100}>
                  <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...X_AXIS} interval="preserveStartEnd" />
                    <YAxis
                      {...Y_AXIS}
                      width={56}
                      tickFormatter={formatMoneyCompact}
                      domain={[(dataMin) => Math.min(0, dataMin), 'auto']}
                    />
                    <Tooltip content={<ChartTooltip highlight={metric} />} animationDuration={0} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
                    <Bar dataKey={metric} fill={CHART} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                      {/* Net bars show profit in green and loss in red. */}
                      {metric === 'net' && data.map((d) => (
                        <Cell key={d.month} fill={d.net < 0 ? LOSS_COLOR : PROFIT_COLOR} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </LazyChart>
            </div>
          ) : (
            <div className="mt-3">
              <YearTable data={data} />
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ─── Contract list ─────────────────────────────────────────
const YEAR_SPAN = 3

type ContractListProps = {
  contracts: any
  lifetimeMap: any
  onSelect: (id: any) => void
  isFirstLoad: boolean
  isRefreshing: boolean
  onRefresh: (signal?: any) => Promise<void>
  search: string
  setSearch: (...args: any[]) => any
  statusFilter: string
  setStatusFilter: (...args: any[]) => any
  sort: any
  setSort: (...args: any[]) => any
  counts: any
  selectedYear: number
  setSelectedYear: (...args: any[]) => any
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
  sort,
  setSort,
  counts,
  selectedYear,
  setSelectedYear,
}: ContractListProps) {
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [analyticsData, setAnalyticsData] = useState([])
  const [analyticsPrev, setAnalyticsPrev] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState(null)

  // "/" jumps to the search box.
  const searchRef = useRef(null)
  useListShortcuts({ searchRef, onEscape: null })

  const yearSections = useMemo(() => {
    const cy = new Date().getUTCFullYear()
    const years = []
    for (let y = cy - YEAR_SPAN; y <= cy + YEAR_SPAN; y++) years.push({ year: y })
    return years
  }, [])

  // The selected year and the one before it, for growth on the KPI tiles.
  const loadAnalytics = useCallback(async (signal?) => {
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    try {
      const [cur, prev] = await Promise.all([
        supabase.rpc('accounting_analytics_by_year', { p_year: selectedYear }),
        supabase.rpc('accounting_analytics_by_year', { p_year: selectedYear - 1 }),
      ])
      if (signal?.aborted) return
      if (cur.error) throw cur.error
      if (prev.error) console.error('Previous-year analytics failed:', prev.error)
      setAnalyticsData(cur.data || [])
      setAnalyticsPrev(prev.data || [])
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Analytics load failed:', err)
      setAnalyticsError(err?.message || 'Unknown error')
      setAnalyticsData([])
      setAnalyticsPrev([])
    } finally {
      if (!signal?.aborted) setAnalyticsLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    const ac = new AbortController()
    loadAnalytics(ac.signal)
    return () => ac.abort()
  }, [loadAnalytics])

  // Company share is the full 25%; the PM is paid out of it.
  const yearTotals = useMemo(() => {
    const acc = { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, pm: 0 }
    for (const r of analyticsData) {
      acc.gross    += Number(r.gross || 0)
      acc.expenses += Number(r.expenses || 0)
      acc.net      += Number(r.net || 0)
      acc.pm       += Number(r.pm_share || 0)
    }
    acc.owner   = Math.round(acc.net * (OWNER_SPLIT_PCT / 100) * 100) / 100
    acc.company = Math.round(acc.net * (COMPANY_SPLIT_PCT / 100) * 100) / 100
    return acc
  }, [analyticsData])

  // Trend lines run Jan → this month for the current year (all twelve months
  // for other years), and growth compares the same months of the year before.
  const yearTrend = useMemo(() => {
    const now = new Date()
    const lastMonth = selectedYear === now.getUTCFullYear() ? now.getUTCMonth() : 11
    const cur = toYearMonths(analyticsData).slice(0, lastMonth + 1)
    const prev = toYearMonths(analyticsPrev).slice(0, lastMonth + 1)
    const sum = (rows) => rows.reduce(
      (t, r) => ({ gross: t.gross + r.gross, expenses: t.expenses + r.expenses, net: t.net + r.net }),
      { gross: 0, expenses: 0, net: 0 },
    )
    const hasPrev = prev.some((r) => r.gross || r.expenses || r.net)
    const vs = lastMonth === 11
      ? String(selectedYear - 1)
      : lastMonth === 0
        ? `Jan ${selectedYear - 1}`
        : `Jan–${MONTHS_SHORT[lastMonth]} ${selectedYear - 1}`
    return buildTrend(cur, sum(cur), hasPrev ? sum(prev) : null, vs)
  }, [analyticsData, analyticsPrev, selectedYear])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    let list = contracts.map((c) => ({
      contract: c,
      lifetime: lifetimeMap.get(c.id) || { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, pm: 0, monthsCount: 0 },
    }))

    if (statusFilter !== 'all') {
      list = list.filter(({ contract }) => deriveContractStatus(contract) === statusFilter)
    }

    if (tokens.length > 0) {
      list = list.filter(({ contract }) => {
        const haystack = [
          contract.contract_code,
          contract.units?.unit_code, contract.units?.building,
          contract.owners?.name, contract.owners?.email,
        ].filter(Boolean).join(' ').toLowerCase()
        return tokens.every((tok) => haystack.includes(tok))
      })
    }
    return list
  }, [contracts, lifetimeMap, debouncedSearch, statusFilter])

  // Column sorting; unit A→Z by default, ties broken by unit.
  const onSort = (key) => setSort((prev) => nextSort(prev, key, SORT_DEFAULTS))
  const sorted = useMemo(() => {
    const value = CONTRACT_SORT_VALUE[sort.key] || CONTRACT_SORT_VALUE.unit
    const dir = sort.dir === 'asc' ? 1 : -1
    const byUnit = (a, b) => String(a.contract.units?.unit_code || '').localeCompare(String(b.contract.units?.unit_code || ''), undefined, { numeric: true, sensitivity: 'base' })
    return [...filtered].sort((a, b) => {
      const av = value(a), bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return cmp * dir || byUnit(a, b)
    })
  }, [filtered, sort])

  const clearAllFilters = () => { setStatusFilter('all'); setSearch('') }
  const filterChips = [
    statusFilter !== 'all' && { key: 'status', label: STATUS_PILLS.find((p) => p.id === statusFilter)?.label || statusFilter, onRemove: () => setStatusFilter('all') },
    debouncedSearch.trim() && { key: 'search', label: `"${debouncedSearch.trim()}"`, onRemove: () => setSearch('') },
  ].filter(Boolean)

  // One line under the title that says what needs attention.
  const summary = isFirstLoad
    ? 'Loading contracts…'
    : [
        plural(counts.all, 'contract', 'contracts'),
        counts.expiring > 0 && `${counts.expiring} expiring soon`,
        counts.expired > 0 && `${counts.expired} for renewal`,
      ].filter(Boolean).join(' · ')

  return (
    <div className="h-full overflow-y-auto">
      <div className={PAGE}>

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">{selectedYear} overview</h1>
            <p className="text-[12.5px] text-foreground mt-1 truncate">{summary}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <YearNav yearSections={yearSections} selectedYear={selectedYear} onSelectYear={setSelectedYear} />
            <button
              type="button"
              onClick={() => { onRefresh(); loadAnalytics() }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-[12px] font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw size={13} className={cn((isRefreshing || analyticsLoading) && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* Year KPIs (dimmed while another year loads) */}
        <div className={cn('transition-opacity', analyticsLoading && analyticsData.length > 0 && 'opacity-50')}>
          <MoneyStrip
            totals={yearTotals}
            loading={analyticsLoading && analyticsData.length === 0}
            grossSub={`All contracts in ${selectedYear}`}
            pmSub={yearTotals.pm > 0 ? `${PM_SHARE_OF_COMPANY_PCT}% of the company share` : 'No PM payouts'}
            trend={analyticsError ? null : yearTrend}
          />
        </div>

        <YearPerformanceCard
          year={selectedYear}
          rows={analyticsData}
          loading={analyticsLoading}
          error={analyticsError}
          onRetry={() => loadAnalytics()}
        />

        {/* Contracts */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search contract code, unit, owner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 h-9 text-xs rounded-md"
            />
            {!search && <SearchKeyHint />}
          </div>
          <StatusTabs tabs={STATUS_PILLS} value={statusFilter} onChange={setStatusFilter} counts={counts} label="Filter contracts by status" />
        </div>

        {!isFirstLoad && (
          <ResultsBar
            shown={sorted.length}
            total={contracts.length}
            noun={contracts.length === 1 ? 'contract' : 'contracts'}
            chips={filterChips}
            onClearAll={clearAllFilters}
            hint="Lifetime figures · Click a column to sort · Press / to search"
          />
        )}

        <Panel>
          <div className="overflow-x-auto">
            <div className="md:min-w-[780px] max-h-[600px] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <MobileSort
                options={[{ key: 'unit', label: 'Unit' }, { key: 'owner', label: 'Owner' }, { key: 'effective', label: 'Term' }, { key: 'gross', label: 'Gross' }, { key: 'net', label: 'Net' }, { key: 'status', label: 'Status' }]}
                sort={sort}
                onSort={onSort}
                className="sticky top-0 z-10"
              />
              <div className={cn('sticky top-0 z-10 px-5 py-2.5 border-b border-border bg-card max-md:hidden', ROW_GRID)}>
                <SortHeader label="Unit" sortKey="unit" sort={sort} onSort={onSort} />
                <SortHeader label="Owner" sortKey="owner" sort={sort} onSort={onSort} />
                <SortHeader label="Term" sortKey="effective" sort={sort} onSort={onSort} />
                <SortHeader label="Gross" sortKey="gross" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Net" sortKey="net" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} align="right" />
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-4">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : contracts.length === 0 ? (
                <EmptyState icon={FileText} title="No contracts yet" hint="Create contracts on the Contracts page first." />
              ) : sorted.length === 0 ? (
                <EmptyState icon={Search} title="No contracts match your filters" hint="Try another search or status.">
                  {filterChips.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="mt-4 inline-flex items-center h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Clear filters
                    </button>
                  )}
                </EmptyState>
              ) : (
                sorted.map(({ contract, lifetime }) => (
                  <ContractRow
                    key={contract.id}
                    contract={contract}
                    lifetime={lifetime}
                    onClick={() => onSelect(contract.id)}
                  />
                ))
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

type AccountingPageProps = {
  initialSelectedId?: any
}

// ─── Main page ──────────────────────────────────────────────
export default function AccountingPage({ initialSelectedId }: AccountingPageProps) {
  const [selectedContractId, setSelectedContractId] = useState(initialSelectedId || null)

  const [contracts, setContracts] = useState([])
  const [lifetimeMap, setLifetimeMap] = useState(new Map())

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  // Kept here so they survive opening a contract and coming back.
  const [sort, setSort] = useState({ key: 'unit', dir: 'asc' })
  const [selectedYear, setSelectedYear] = useState(() => new Date().getUTCFullYear())

  const hasLoadedOnce = useRef(false)
  const realtimeDebounceRef = useRef(null)

  const fetchAll = useCallback(async (signal?) => {
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
      if (signal?.aborted) return
      if (error) throw error

      const list = data || []
      setContracts(list)

      const ids = list.map((c) => c.id)
      const map = await fetchContractsLifetime(ids)
      if (signal?.aborted) return
      setLifetimeMap(map)
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load accounting data:', err)
      toast.error('Failed to load accounting data')
    } finally {
      if (!signal?.aborted) {
        setIsFirstLoad(false)
        setIsRefreshing(false)
        hasLoadedOnce.current = true
      }
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchAll(ac.signal)
    return () => ac.abort()
  }, [fetchAll])

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

  useEffect(() => {
    if (initialSelectedId) setSelectedContractId(initialSelectedId)
  }, [initialSelectedId])

  const counts = useMemo(() => {
    const c = { all: contracts.length, active: 0, expiring: 0, expired: 0, renewed: 0 }
    for (const contract of contracts) {
      const s = deriveContractStatus(contract)
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [contracts])

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === selectedContractId) || null,
    [contracts, selectedContractId],
  )

  // The selected contract's run of renewals (just itself if never renewed).
  const selectedTerms = useMemo(
    () => (selectedContract ? contractTerms(selectedContract, contracts) : []),
    [selectedContract, contracts],
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
              terms={selectedTerms}
              lifetimeMap={lifetimeMap}
              onSelectContract={handleSelectContract}
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
              sort={sort}
              setSort={setSort}
              counts={counts}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}