import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, RefreshCw, X, Loader2, TrendingUp, ChevronDown, ChevronRight,
  Download, AlertTriangle, Wallet, Lock, Save, Home, Sparkles,
  Zap, Wifi, Droplets, Megaphone,
} from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import { cn, sanitizeMoney } from '@/lib/utils'
import {
  computeMonthlyStatement, computeLifetime,
  monthRangeFromDates, monthLabel, monthKeyToDate, formatMoney, formatMoneyCompact,
} from '@/lib/accounting'

const BRAND = '#2d568e'

const COLORS = {
  gross:    '#2d568e',
  expenses: '#dc2626',
  net:      '#059669',
}

const ROW_GRID = 'grid grid-cols-[1.4fr_1fr_1fr_140px] gap-3 items-center'
const PANEL_WIDTH = 520

// ============================================================
// SUMMARY CARDS
// ============================================================
function SummaryCards({ totals }) {
  const cards = [
    { label: 'Total Gross',    value: totals.gross,    icon: TrendingUp, tone: 'default' },
    { label: 'Total Expenses', value: totals.expenses, icon: Wallet,     tone: 'red' },
    { label: 'Total Net',      value: totals.net,      icon: TrendingUp, tone: totals.net >= 0 ? 'green' : 'red' },
    { label: 'Owner · Company', value: null,           icon: Wallet,     tone: 'split', owner: totals.owner, company: totals.company, hasSplit: totals.hasSplit },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={14} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {card.label}
            </span>
          </div>
          {card.tone === 'split' ? (
            card.hasSplit ? (
              <p className="text-lg font-bold tabular-nums text-foreground">
                {formatMoney(card.owner)}
                <span className="text-muted-foreground mx-1">·</span>
                {formatMoney(card.company)}
              </p>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground italic">Not configured</p>
            )
          ) : (
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                card.tone === 'red' && 'text-red-600 dark:text-red-400',
                card.tone === 'green' && 'text-emerald-600 dark:text-emerald-400',
                card.tone === 'default' && 'text-foreground'
              )}
            >
              {formatMoney(card.value)}
            </p>
          )}
        </motion.div>
      ))}
    </div>
  )
}

// ============================================================
// STATUS PILLS
// ============================================================
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

function deriveContractStatus(contract) {
  if (!contract) return 'inactive'
  const exp = contract.expiry_date ? new Date(contract.expiry_date + 'T00:00:00Z') : null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  if (!exp) return 'active'
  if (exp < today) return 'expired'
  const daysLeft = Math.round((exp - today) / 86400000)
  return daysLeft <= 60 ? 'expiring' : 'active'
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

// ============================================================
// CONTRACT LIST ROW
// ============================================================
function ContractListRow({ contract, lifetime, selected, onClick }) {
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
      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">
          {contract.units?.unit_code || '—'}
        </span>
        <span className="text-[10px] text-muted-foreground truncate block">
          {contract.contract_code || '—'}
        </span>
      </div>

      <span className="text-[11px] text-muted-foreground truncate">
        {contract.owners?.name || 'No owner'}
      </span>

      <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
        <div className="truncate">{formatMoney(lifetime.gross)}</div>
        <div className={cn('text-[10px]', lifetime.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          {formatMoney(lifetime.net)}
        </div>
      </div>

      <div className="flex items-center gap-1.5 justify-end flex-shrink-0">
        <Badge className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 border-0',
          contract.classification === '75/25' || contract.classification === '85/15'
            ? 'bg-muted text-muted-foreground'
            : 'bg-amber-600 text-white')}>
          {contract.classification || '—'}
        </Badge>
        <ChevronRight
          size={14}
          className={cn('text-muted-foreground/40 transition-transform duration-300 ease-out',
            selected && 'rotate-180 text-primary')}
        />
      </div>
    </motion.button>
  )
}

// ============================================================
// LIFETIME TOTALS CARD
// ============================================================
function LifetimeCard({ contract, lifetime, monthsCount, dateRange }) {
  const hasSplit = lifetime.hasSplit
  return (
    <div className="rounded-md bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-muted-foreground" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Lifetime · {monthsCount} month{monthsCount === 1 ? '' : 's'}
          </h4>
        </div>
        {dateRange && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{dateRange}</span>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Gross revenue</p>
          <p className="text-base font-bold tabular-nums text-foreground mt-0.5">{formatMoney(lifetime.gross)}</p>
        </div>
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total expenses</p>
          <p className="text-base font-bold tabular-nums text-red-600 dark:text-red-400 mt-0.5">{formatMoney(lifetime.expenses)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Net profit</p>
          <p className={cn('text-base font-bold tabular-nums mt-0.5',
            lifetime.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {formatMoney(lifetime.net)}
          </p>
        </div>
        <div className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Monthly average</p>
          <p className={cn('text-base font-bold tabular-nums mt-0.5',
            lifetime.monthlyAvg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {formatMoney(lifetime.monthlyAvg)}
          </p>
        </div>
      </div>
      {hasSplit ? (
        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-sky-600 dark:text-sky-400 font-semibold">
              Owner payout
            </p>
            <p className="text-base font-bold tabular-nums text-sky-600 dark:text-sky-400 mt-0.5">{formatMoney(lifetime.owner)}</p>
          </div>
          <div className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">
              Company margin
            </p>
            <p className="text-base font-bold tabular-nums text-purple-600 dark:text-purple-400 mt-0.5">{formatMoney(lifetime.company)}</p>
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 flex items-start gap-2 bg-amber-500/5 border-t border-amber-500/20">
          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Split not configured</p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
              Classification <span className="font-mono">{contract.classification || '—'}</span> has no owner/company split.
              Set it to <span className="font-mono">75/25</span> or <span className="font-mono">85/15</span> to enable payouts.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// CHART — no cap, shows every month
// ============================================================
function FinancialChart({ statements }) {
  const data = statements.map((s) => ({
    label: monthLabel(s.month).split(' ')[0],
    monthKey: s.month,
    gross: s.grossRevenue,
    expenses: s.totalExpenses,
    net: s.netProfit,
  }))

  // Dynamically adjust bar/gap width based on month count.
  // More months → thinner bars, tighter gaps.
  const monthCount = statements.length
  const barSize = Math.max(6, Math.min(36, Math.floor(520 / Math.max(monthCount, 1))))
  const barGap = monthCount > 24 ? 1 : monthCount > 12 ? 2 : 4

  return (
    <div className="rounded-md bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-muted-foreground" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Monthly trend · {monthCount} month{monthCount === 1 ? '' : 's'}
          </h4>
        </div>
      </div>
      <div className="p-3">
        <div className="h-[220px] w-full">
          {monthCount === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
              No months to display
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={barGap} barCategoryGap={`${Math.max(2, 20 - monthCount / 4)}%`}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  strokeOpacity={0.5}
                  interval={monthCount > 24 ? Math.floor(monthCount / 12) : 0}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={formatMoneyCompact} stroke="currentColor" strokeOpacity={0.5} width={50} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  formatter={(value, name) => [formatMoney(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="expenses" stackId="a" fill={COLORS.expenses} name="Expenses" maxBarSize={barSize} />
                <Bar dataKey="net" stackId="a" fill={COLORS.net} name="Net profit" radius={[3, 3, 0, 0]} maxBarSize={barSize} />
                <Line type="monotone" dataKey="gross" stroke={COLORS.gross} strokeWidth={2} dot={false} name="Gross" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MONTH ROW
// ============================================================
function MonthRow({ statement, expanded, onToggle }) {
  const hasActivity = statement.grossRevenue > 0 || statement.totalExpenses > 0 || statement.manualRow
  const netPositive = statement.netProfit >= 0

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors flex items-center gap-3 border-b border-border',
        expanded && 'bg-muted/30'
      )}
    >
      <span className="text-muted-foreground flex-shrink-0">
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </span>
      <span className="text-xs font-semibold text-foreground min-w-[80px]">
        {monthLabel(statement.month)}
      </span>
      {!hasActivity ? (
        <span className="text-[10px] text-muted-foreground italic ml-auto">No activity</span>
      ) : (
        <div className="flex-1 min-w-0 grid grid-cols-3 gap-3 text-[11px] tabular-nums">
          <span className="text-muted-foreground">{formatMoney(statement.grossRevenue)}</span>
          <span className="text-red-600 dark:text-red-400">−{formatMoney(statement.totalExpenses)}</span>
          <span className={cn('font-semibold', netPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {formatMoney(statement.netProfit)}
          </span>
        </div>
      )}
    </button>
  )
}

// ============================================================
// MONTH DETAIL
// ============================================================
function MonthDetail({ statement, contract, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    electricity: statement.electricity,
    internet: statement.internet,
    water: statement.water,
    marketing: statement.marketing,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft({
      electricity: statement.electricity,
      internet: statement.internet,
      water: statement.water,
      marketing: statement.marketing,
    })
    setEditing(false)
  }, [statement.month])

  const save = async () => {
    setSaving(true)
    try {
      const monthDate = monthKeyToDate(statement.month).toISOString().slice(0, 10)
      const payload = {
        contract_id: contract.id,
        month: monthDate,
        electricity: sanitizeMoney(draft.electricity),
        internet: sanitizeMoney(draft.internet),
        water: sanitizeMoney(draft.water),
        marketing: sanitizeMoney(draft.marketing),
      }
      if (statement.manualRow?.id) {
        const { error } = await supabase
          .from('contract_monthly_expenses')
          .update(payload)
          .eq('id', statement.manualRow.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('contract_monthly_expenses')
          .insert(payload)
        if (error) throw error
      }
      logAudit('UPDATE_CONTRACT_EXPENSES', 'contract_monthly_expenses', statement.manualRow?.id || null, {
        contract_id: contract.id, month: monthDate, ...payload,
      }).catch(() => {})
      toast.success('Expenses saved')
      setEditing(false)
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    if (!statement.manualRow?.id) return
    if (!window.confirm(`Clear manual expenses for ${monthLabel(statement.month)}?`)) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('contract_monthly_expenses')
        .delete()
        .eq('id', statement.manualRow.id)
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

  return (
    <div className="px-3 pb-4 pt-2 space-y-3 text-xs border-b border-border bg-muted/10">
      {statement.bookingsList.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 flex items-center gap-1.5">
            <Home size={10} /> Bookings · {statement.bookingsList.length}
          </p>
          <div className="space-y-0.5">
            {statement.bookingsList.map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-muted-foreground">{b.booking_code}</span>
                <span className="truncate flex-1">{b.guest_name}</span>
                <span className="tabular-nums font-semibold">{formatMoney(b.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {statement.cleaningsList.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 flex items-center gap-1.5">
            <Sparkles size={10} /> Cleanings · {statement.cleaningsList.length}
          </p>
          <div className="space-y-0.5">
            {statement.cleaningsList.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-[11px]">
                <span className="capitalize text-muted-foreground">{c.type}</span>
                <span className="text-muted-foreground text-[10px]">{c.status}</span>
                <span className="truncate flex-1" />
                <span className="tabular-nums font-semibold">{formatMoney(c.payment_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 flex items-center gap-1.5">
          <Lock size={9} /> Auto-computed
        </p>
        <div className="space-y-0.5">
          <ExpenseLine icon={Wallet} label="Booking commission" value={statement.bookingCommission} />
          <ExpenseLine icon={Wallet} label="Affiliate commission" value={statement.affiliateCommission} />
          <ExpenseLine icon={Sparkles} label="Housekeeping" value={statement.housekeeping} />
          <ExpenseLine icon={Sparkles} label="Laundry" value={statement.laundry} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Manual expenses
          </p>
          {!editing && (
            <div className="flex items-center gap-2">
              {statement.manualRow && (
                <button
                  type="button"
                  onClick={clear}
                  disabled={saving}
                  className="text-[10px] font-semibold text-red-500 hover:underline disabled:opacity-50"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Edit
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="space-y-1">
            <EditLine icon={Zap} label="Electricity" value={draft.electricity} onChange={(v) => setDraft((p) => ({ ...p, electricity: v }))} />
            <EditLine icon={Wifi} label="Internet" value={draft.internet} onChange={(v) => setDraft((p) => ({ ...p, internet: v }))} />
            <EditLine icon={Droplets} label="Water" value={draft.water} onChange={(v) => setDraft((p) => ({ ...p, water: v }))} />
            <EditLine icon={Megaphone} label="Marketing" value={draft.marketing} onChange={(v) => setDraft((p) => ({ ...p, marketing: v }))} />
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 rounded text-[11px]" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 rounded text-[11px]" onClick={save} disabled={saving} style={{ backgroundColor: BRAND }}>
                {saving ? <Loader2 size={11} className="animate-spin mr-1" /> : <Save size={11} className="mr-1" />}
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            <ExpenseLine icon={Zap} label="Electricity" value={statement.electricity} />
            <ExpenseLine icon={Wifi} label="Internet" value={statement.internet} />
            <ExpenseLine icon={Droplets} label="Water" value={statement.water} />
            <ExpenseLine icon={Megaphone} label="Marketing" value={statement.marketing} />
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-border space-y-1">
        <TotalLine label="Gross revenue" value={statement.grossRevenue} tone="default" />
        <TotalLine label="Total expenses" value={-statement.totalExpenses} tone="negative" />
        <TotalLine label="Net profit" value={statement.netProfit} tone={statement.netProfit >= 0 ? 'positive' : 'negative'} bold />

        {statement.split ? (
          <div className="pt-2 mt-2 border-t border-border space-y-1">
            <TotalLine label={`Owner (${statement.split.owner}%)`} value={statement.ownerShare} tone="owner" />
            <TotalLine label={`Company (${statement.split.company}%)`} value={statement.companyShare} tone="company" />
          </div>
        ) : (
          <p className="pt-2 mt-2 border-t border-border text-[10px] text-amber-600 dark:text-amber-400 italic">
            Split not configured for classification "{contract.classification || '—'}"
          </p>
        )}
      </div>
    </div>
  )
}

function ExpenseLine({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-[11px] py-0.5">
      <Icon size={10} className="text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground flex-1 truncate">{label}</span>
      <span className="tabular-nums font-semibold text-foreground">{formatMoney(value)}</span>
    </div>
  )
}

function EditLine({ icon: Icon, label, value, onChange }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <Icon size={10} className="text-muted-foreground flex-shrink-0" />
      <span className="text-muted-foreground min-w-[70px] truncate">{label}</span>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 text-[11px] rounded flex-1 tabular-nums"
      />
    </div>
  )
}

function TotalLine({ label, value, tone = 'default', bold = false }) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'negative' ? 'text-red-600 dark:text-red-400'
    : tone === 'owner' ? 'text-sky-600 dark:text-sky-400'
    : tone === 'company' ? 'text-purple-600 dark:text-purple-400'
    : 'text-foreground'
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', toneClass, bold && 'font-bold')}>{formatMoney(value)}</span>
    </div>
  )
}

// ============================================================
// DETAIL PANEL
// ============================================================
function ContractAccountingPanel({ contract, bookings, cleanings, monthlyExpenses, onClose, onChanged }) {
  const [expandedMonth, setExpandedMonth] = useState(null)

  const allMonths = useMemo(
    () => monthRangeFromDates(contract.effective_date, contract.expiry_date),
    [contract.effective_date, contract.expiry_date]
  )

  const statements = useMemo(() => allMonths.map((m) =>
    computeMonthlyStatement({ contract, bookings, cleanings, monthlyExpenses, month: m })
  ), [allMonths, contract, bookings, cleanings, monthlyExpenses])

  const lifetime = useMemo(() => computeLifetime(statements), [statements])

  // Human-readable range label
  const dateRange = useMemo(() => {
    if (!allMonths.length) return null
    const first = monthLabel(allMonths[0])
    const last = monthLabel(allMonths[allMonths.length - 1])
    return `${first} → ${last}`
  }, [allMonths])

  // No dates → show message
  if (!contract.effective_date || !contract.expiry_date) {
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
              <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <TrendingUp size={20} className="text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-foreground font-mono truncate">{contract.units?.unit_code || '—'}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {contract.contract_code || '—'} · {contract.owners?.name || 'No owner'}
                </p>
              </div>
              <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <AlertTriangle size={36} className="text-amber-500/60 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">Missing contract dates</p>
              <p className="text-xs text-muted-foreground max-w-[320px]">
                This contract needs both an <span className="font-mono">effective date</span> and an <span className="font-mono">expiry date</span> before accounting can be computed.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

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
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <TrendingUp size={20} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-foreground font-mono truncate">{contract.units?.unit_code || '—'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {contract.contract_code || '—'} · {contract.owners?.name || 'No owner'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className="text-[10px] font-semibold rounded-full px-2 py-0.5 border-0 bg-muted text-muted-foreground">
                  {contract.classification || '—'}
                </Badge>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {contract.effective_date} → {contract.expiry_date}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <LifetimeCard
            contract={contract}
            lifetime={lifetime}
            monthsCount={allMonths.length}
            dateRange={dateRange}
          />

          <FinancialChart statements={statements} />

          {/* Month list — full, no cap */}
          <div className="rounded-md bg-card border border-border overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Monthly breakdown · {statements.length}
              </h4>
              {dateRange && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{dateRange}</span>
              )}
            </div>
            {statements.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground italic">
                No months to display.
              </div>
            ) : (
              [...statements].reverse().map((s) => {
                const expanded = expandedMonth === s.month
                return (
                  <div key={s.month}>
                    <MonthRow
                      statement={s}
                      expanded={expanded}
                      onToggle={() => setExpandedMonth(expanded ? null : s.month)}
                    />
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <MonthDetail statement={s} contract={contract} onChanged={onChanged} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function AccountingPage() {
  const [contracts, setContracts] = useState([])
  const [bookingsByUnit, setBookingsByUnit] = useState({})
  const [cleaningsByUnit, setCleaningsByUnit] = useState({})
  const [expensesByContract, setExpensesByContract] = useState({})

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchAll = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const [cRes, bRes, clRes, exRes] = await Promise.all([
        supabase
          .from('contracts')
          .select(`
            *,
            units:unit_id ( id, unit_code, building ),
            owners:owner_id ( id, name, email, phone )
          `)
          .order('effective_date', { ascending: false, nullsFirst: false }),
        supabase
          .from('bookings')
          .select('id, unit_id, booking_code, guest_name, check_in, check_out, total_amount, booker_commission, affiliate_commission, deleted_at')
          .is('deleted_at', null),
        supabase
          .from('cleanings')
          .select('id, unit_id, type, scheduled_date, status, payment_amount, laundry_payment_amount'),
        supabase
          .from('contract_monthly_expenses')
          .select('*'),
      ])
      if (cRes.error) throw cRes.error
      if (bRes.error) throw bRes.error
      if (clRes.error) throw clRes.error
      if (exRes.error) throw exRes.error

      setContracts(cRes.data || [])

      const byUnit = {}
      for (const b of (bRes.data || [])) {
        if (!byUnit[b.unit_id]) byUnit[b.unit_id] = []
        byUnit[b.unit_id].push(b)
      }
      setBookingsByUnit(byUnit)

      const clByUnit = {}
      for (const c of (clRes.data || [])) {
        if (!clByUnit[c.unit_id]) clByUnit[c.unit_id] = []
        clByUnit[c.unit_id].push(c)
      }
      setCleaningsByUnit(clByUnit)

      const exByContract = {}
      for (const e of (exRes.data || [])) {
        if (!exByContract[e.contract_id]) exByContract[e.contract_id] = []
        exByContract[e.contract_id].push(e)
      }
      setExpensesByContract(exByContract)
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
      .channel(`accounting-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contract_monthly_expenses' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  const contractsWithLifetime = useMemo(() => {
    return contracts.map((c) => {
      const bookings = bookingsByUnit[c.unit_id] || []
      const cleanings = cleaningsByUnit[c.unit_id] || []
      const expenses = expensesByContract[c.id] || []
      const months = monthRangeFromDates(c.effective_date, c.expiry_date)
      const statements = months.map((m) =>
        computeMonthlyStatement({ contract: c, bookings, cleanings, monthlyExpenses: expenses, month: m })
      )
      const lifetime = computeLifetime(statements)
      return { contract: c, lifetime, monthsCount: months.length }
    })
  }, [contracts, bookingsByUnit, cleaningsByUnit, expensesByContract])

  const globalTotals = useMemo(() => {
    return contractsWithLifetime.reduce((acc, row) => {
      acc.gross += row.lifetime.gross
      acc.expenses += row.lifetime.expenses
      acc.net += row.lifetime.net
      if (row.lifetime.hasSplit) {
        acc.owner += row.lifetime.owner
        acc.company += row.lifetime.company
        acc.hasSplit = true
      }
      return acc
    }, { gross: 0, expenses: 0, net: 0, owner: 0, company: 0, hasSplit: false })
  }, [contractsWithLifetime])

  const counts = useMemo(() => {
    const c = { all: contractsWithLifetime.length, active: 0, expiring: 0, expired: 0 }
    for (const { contract } of contractsWithLifetime) {
      const s = deriveContractStatus(contract)
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [contractsWithLifetime])

  const sorted = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    let list = contractsWithLifetime
    if (statusFilter !== 'all') {
      list = list.filter(({ contract }) => deriveContractStatus(contract) === statusFilter)
    }
    if (q) {
      list = list.filter(({ contract }) =>
        [
          contract.contract_code, contract.units?.unit_code, contract.units?.building,
          contract.owners?.name, contract.owners?.email, contract.classification,
        ].filter(Boolean).join(' ').toLowerCase().includes(q)
      )
    }
    const copy = [...list]
    copy.sort((a, b) => {
      const av = a.contract.units?.unit_code ?? ''
      const bv = b.contract.units?.unit_code ?? ''
      return av.localeCompare(bv)
    })
    return copy
  }, [contractsWithLifetime, debouncedSearch, statusFilter])

  useEffect(() => {
    if (!selectedId && sorted.length > 0 && !isFirstLoad) {
      setSelectedId(sorted[0].contract.id)
    }
  }, [sorted, selectedId, isFirstLoad])

  const selected = useMemo(
    () => contracts.find((c) => c.id === selectedId) || null,
    [contracts, selectedId]
  )

  const handleSelect = (contract) => setSelectedId((prev) => (prev === contract.id ? null : contract.id))

  const handleExport = () => {
    if (sorted.length === 0) { toast.error('Nothing to export'); return }
    const headers = [
      'Contract Code', 'Unit', 'Building', 'Owner', 'Classification',
      'Effective', 'Expiry', 'Months',
      'Lifetime Gross', 'Lifetime Expenses', 'Lifetime Net',
      'Owner Payout', 'Company Margin',
    ]
    const rows = sorted.map(({ contract, lifetime, monthsCount }) => [
      contract.contract_code || '',
      contract.units?.unit_code || '',
      contract.units?.building || '',
      contract.owners?.name || '',
      contract.classification || '',
      contract.effective_date || '',
      contract.expiry_date || '',
      monthsCount,
      lifetime.gross, lifetime.expenses, lifetime.net,
      lifetime.hasSplit ? lifetime.owner : '',
      lifetime.hasSplit ? lifetime.company : '',
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `accounting_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card border border-border rounded-md">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="flex-shrink-0">
            <SummaryCards totals={globalTotals} />
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contract code, unit, owner..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded"
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={isRefreshing} className="h-8 rounded">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded">
              <Download size={13} />
            </Button>
          </div>

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
          </div>

          <div className="flex-1 min-h-0 rounded border border-border overflow-hidden">
            <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className={cn('sticky top-0 z-10 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Contract</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Owner</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Gross · Net</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right truncate">Class</span>
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-3">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : sorted.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <TrendingUp size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-semibold">No contracts to display</p>
                    <p className="text-xs text-muted-foreground mt-1">Create contracts in the Contracts page first</p>
                  </div>
                </div>
              ) : (
                sorted.map(({ contract, lifetime }) => (
                  <ContractListRow
                    key={contract.id}
                    contract={contract}
                    lifetime={lifetime}
                    selected={selectedId === contract.id}
                    onClick={() => handleSelect(contract)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <ContractAccountingPanel
            key={selected.id}
            contract={selected}
            bookings={bookingsByUnit[selected.unit_id] || []}
            cleanings={cleaningsByUnit[selected.unit_id] || []}
            monthlyExpenses={expensesByContract[selected.id] || []}
            onClose={() => setSelectedId(null)}
            onChanged={fetchAll}
          />
        )}
      </AnimatePresence>
    </div>
  )
}