// src/components/owner/OwnerContractView.jsx
// One contract in the owner portal: the Accounting contract page, read-only
// and for its owner. Term figures, month-by-month performance, upcoming
// stays, and for any month every booking, cleaning and expense with how the
// month's net income and the owner's share were worked out.
import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  ArrowLeft, BarChart3, CalendarRange, Download, FileText, Home, Landmark,
  Loader2, RefreshCw, Table2, TrendingUp, UserRound, Wallet, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { contractTerms } from '@/lib/contracts'
import { fetchOwnerContract } from '@/lib/ownerPortal'
import { downloadContractStatement } from '@/lib/email'
import { Panel, PanelHeader } from '@/components/admin/_shared/Panel'
import { StatStrip, StatTile } from '@/components/admin/_shared/StatStrip'
import { StatusTabs, PeriodStepper } from '@/components/admin/_shared/StatusTabs'
import { Sparkline } from '@/components/admin/_shared/Sparkline'
import OwnerMonthSection from './OwnerMonthSection'
import {
  OWNER_PCT, MONTHS_SHORT, todayISO, formatMoney, formatPeso, formatDate, monthLabel,
  moneyTone, ContractStatus, BookingRow, EmptyLine, bookingStatus,
} from './ownerUi'

const PAGE = 'px-4 py-5 sm:px-6 md:px-8 md:py-6 max-w-[1500px] mx-auto space-y-4 pb-12'
const MONEY_TILE = 'text-[21px] sm:text-[24px]'
const AXIS_TICK = { fontSize: 11, fill: 'var(--foreground)' }
const LOSS_COLOR = '#dc2626'

const METRICS = {
  ownerShare: { label: 'Your share' },
  gross:      { label: 'Gross' },
  net:        { label: 'Net' },
}

/** The contract each unit is on now, for the unit switcher. */
export function currentByUnit(contracts) {
  const byUnit = new Map()
  for (const c of contracts) {
    const cur = byUnit.get(c.unit_id)
    const better = !cur
      || (cur.superseded_by && !c.superseded_by)
      || (!!cur.superseded_by === !!c.superseded_by && (c.effective_date || '') > (cur.effective_date || ''))
    if (better) byUnit.set(c.unit_id, c)
  }
  return [...byUnit.values()].sort((a, b) => String(a.units.unit_code).localeCompare(String(b.units.unit_code), undefined, { numeric: true }))
}

function MonthTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload
  const line = (label, value, cls) => (
    <div className="flex items-center justify-between gap-4 text-[12px]">
      <span className="text-foreground">{label}</span>
      <span className={cn('tabular-nums font-semibold', cls || 'text-foreground')}>{formatMoney(value)}</span>
    </div>
  )
  return (
    <div className="rounded-md border border-border bg-popover shadow-lg px-3 py-2 min-w-[180px]">
      <p className="text-[11px] font-semibold text-foreground mb-1">{monthLabel(m.month, true)}</p>
      {line('Gross', m.gross)}
      {line('Expenses', m.totalExpenses)}
      {line('Net', m.net, moneyTone(m.net))}
      {line(`Your share (${OWNER_PCT}%)`, m.ownerShare, moneyTone(m.ownerShare))}
    </div>
  )
}

function PerformanceCard({ months, selectedMonth, onSelectMonth }) {
  const [metric, setMetric] = useState('ownerShare')
  const [view, setView] = useState('chart')
  const data = useMemo(() => months.map((m) => ({ ...m, label: MONTHS_SHORT[Number(m.month.slice(5, 7)) - 1] })), [months])
  const totals = useMemo(() => data.reduce((t, m) => ({
    gross: t.gross + m.gross, totalExpenses: t.totalExpenses + m.totalExpenses, net: t.net + m.net, ownerShare: t.ownerShare + m.ownerShare,
  }), { gross: 0, totalExpenses: 0, net: 0, ownerShare: 0 }), [data])

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <TrendingUp size={18} strokeWidth={1.75} className="text-foreground flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground">Month by month</h3>
            <p className="text-[11px] text-foreground mt-0.5">Tap a month to see its details below</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'chart' && (
            <StatusTabs tabs={Object.entries(METRICS).map(([id, m]) => ({ id, label: m.label }))} value={metric} onChange={setMetric} label="Chart metric" />
          )}
          <button
            type="button"
            onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card text-[12px] font-medium text-foreground hover:bg-muted/50"
            aria-pressed={view === 'table'}
          >
            {view === 'chart' ? <Table2 size={14} /> : <BarChart3 size={14} />}
            {view === 'chart' ? 'Table' : 'Chart'}
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyLine>No months yet.</EmptyLine>
      ) : view === 'chart' ? (
        <div className="p-4 sm:p-5">
          <div className="h-[240px] -ml-2 text-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} dy={6} />
                <YAxis
                  tick={AXIS_TICK} tickLine={false} axisLine={false} width={52}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₱${Math.round(v / 1000)}k` : `₱${v}`)}
                  domain={[(min) => Math.min(0, min), 'auto']}
                />
                <Tooltip content={<MonthTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
                <Bar dataKey={metric} radius={[4, 4, 0, 0]} maxBarSize={32} onClick={(d) => d?.payload?.month && onSelectMonth(d.payload.month)} className="cursor-pointer">
                  {data.map((d) => (
                    <Cell
                      key={d.month}
                      fill={d[metric] < 0 ? LOSS_COLOR : 'var(--brand)'}
                      fillOpacity={selectedMonth && d.month !== selectedMonth ? 0.45 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12px] tabular-nums">
            <thead>
              <tr className="text-left text-foreground border-b border-border">
                <th className="font-semibold py-2.5 px-4 sm:px-5">Month</th>
                <th className="font-semibold py-2.5 pr-4 text-right">Gross</th>
                <th className="font-semibold py-2.5 pr-4 text-right">Expenses</th>
                <th className="font-semibold py-2.5 pr-4 text-right">Net</th>
                <th className="font-semibold py-2.5 pr-4 sm:pr-5 text-right">Your share</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr
                  key={m.month}
                  onClick={() => onSelectMonth(m.month)}
                  className={cn('border-b border-border cursor-pointer', m.month === selectedMonth ? 'bg-brand-solid/10' : 'hover:bg-muted/40')}
                >
                  <td className="py-2 px-4 sm:px-5 font-semibold text-foreground">{monthLabel(m.month)}</td>
                  <td className="py-2 pr-4 text-right text-foreground">{formatMoney(m.gross)}</td>
                  <td className="py-2 pr-4 text-right text-foreground">{formatMoney(m.totalExpenses)}</td>
                  <td className={cn('py-2 pr-4 text-right font-semibold', moneyTone(m.net))}>{formatMoney(m.net)}</td>
                  <td className={cn('py-2 pr-4 sm:pr-5 text-right font-semibold', moneyTone(m.ownerShare))}>{formatMoney(m.ownerShare)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-foreground">
                <td className="py-2.5 px-4 sm:px-5">Total</td>
                <td className="py-2.5 pr-4 text-right">{formatMoney(totals.gross)}</td>
                <td className="py-2.5 pr-4 text-right">{formatMoney(totals.totalExpenses)}</td>
                <td className={cn('py-2.5 pr-4 text-right', moneyTone(totals.net))}>{formatMoney(totals.net)}</td>
                <td className={cn('py-2.5 pr-4 sm:pr-5 text-right', moneyTone(totals.ownerShare))}>{formatMoney(totals.ownerShare)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  )
}

// In-house now and upcoming stays.
function StaysCard({ bookings }) {
  const today = todayISO()
  const live = bookings.filter((b) => ['inhouse', 'upcoming'].includes(bookingStatus(b, today)))
  return (
    <Panel>
      <PanelHeader icon={CalendarRange} title="Now and next" subtitle="Guests staying now and upcoming stays" count={live.length} />
      <div className="relative flex-1 min-h-[200px]">
        <div className="xl:absolute xl:inset-0 overflow-y-auto">
          {live.length === 0 ? <EmptyLine>No guests now and no upcoming stays.</EmptyLine> : live.map((b) => <BookingRow key={b.id} booking={b} />)}
        </div>
      </div>
    </Panel>
  )
}

export default function OwnerContractView({ contractId, contracts, onOpen, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOwnerContract(contractId)
      .then((d) => {
        if (cancelled) return
        setData(d)
        // Open on this month, or the term's last month if it has ended.
        const thisMonth = todayISO().slice(0, 7)
        const keys = d.months.map((m) => m.month)
        setSelectedMonth(keys.includes(thisMonth) ? thisMonth : keys.filter((k) => k <= thisMonth).pop() || keys[keys.length - 1] || null)
      })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Could not load this contract') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [contractId, reloadKey])

  const contract = data?.contract
  const months = useMemo(() => data?.months || [], [data])

  // Terms of this unit (the owner's contracts only) and the units to switch between.
  const terms = useMemo(() => (contract ? contractTerms(contracts.find((c) => c.id === contract.id) || contract, contracts) : []), [contract, contracts])
  const termIndex = terms.findIndex((t) => t.id === contractId)
  const units = useMemo(() => currentByUnit(contracts), [contracts])

  const totals = useMemo(() => months.reduce((t, m) => ({
    gross: t.gross + m.gross, totalExpenses: t.totalExpenses + m.totalExpenses, net: t.net + m.net, ownerShare: t.ownerShare + m.ownerShare,
  }), { gross: 0, totalExpenses: 0, net: 0, ownerShare: 0 }), [months])

  // Nights booked so far (cancelled stays left out).
  const occupancy = useMemo(() => {
    if (!contract) return { nights: 0, days: 0, pct: 0 }
    const today = todayISO()
    const end = contract.expiry_date && contract.expiry_date < today ? contract.expiry_date : today
    const startMs = Date.parse(`${contract.effective_date}T00:00:00Z`)
    const endExclusive = Date.parse(`${end}T00:00:00Z`) + 86_400_000
    let nights = 0
    for (const b of data?.bookings || []) {
      if (b.cancelled_at) continue
      const from = Math.max(Date.parse(`${b.check_in}T00:00:00Z`), startMs)
      const to = Math.min(Date.parse(`${b.check_out}T00:00:00Z`), endExclusive)
      if (to > from) nights += Math.round((to - from) / 86_400_000)
    }
    const days = Math.max(0, Math.round((endExclusive - startMs) / 86_400_000))
    return { nights, days, pct: days > 0 ? Math.min(1, nights / days) : 0 }
  }, [contract, data])

  const monthIdx = months.findIndex((m) => m.month === selectedMonth)
  const month = monthIdx >= 0 ? months[monthIdx] : null

  const download = async () => {
    setDownloading(true)
    try {
      await downloadContractStatement(contractId)
      toast.success('Statement downloaded')
    } catch (err) {
      toast.error(err?.message || 'Could not build the statement')
    } finally {
      setDownloading(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="py-24 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-foreground" />
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className={PAGE}>
        <div className="py-20 text-center max-w-sm mx-auto">
          <AlertTriangle size={22} className="mx-auto text-foreground mb-3" />
          <p className="text-sm font-semibold text-foreground">Couldn't load this contract</p>
          <p className="text-xs text-foreground mt-1 break-words">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted/50">
              <ArrowLeft size={13} /> My units
            </button>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white bg-brand-solid hover:bg-brand-solid/90">
              <RefreshCw size={13} /> Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  const trend = (key) => months.map((m) => m[key])

  return (
    <div className={PAGE}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to my units"
            title="Back to my units"
            // Phones have this button in the top bar instead.
            className="mt-0.5 hidden sm:inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-card text-foreground shadow-sm hover:bg-muted/50 flex-shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
              <h1 className="text-[20px] sm:text-[22px] font-semibold text-foreground tracking-tight leading-tight">{contract.units.unit_code}</h1>
              <ContractStatus contract={contract} className="text-[12px]" />
              {terms.length > 1 && termIndex >= 0 && (
                <span className="text-[12px] font-medium text-foreground">Term {termIndex + 1} of {terms.length}</span>
              )}
            </div>
            <p className="text-[12.5px] text-foreground mt-1">
              {[contract.units.building, contract.units.unit_type, contract.contract_code].filter(Boolean).join(' · ')}
            </p>
            <p className="text-[12.5px] text-foreground mt-0.5">
              {formatDate(contract.effective_date)} → {contract.expiry_date ? formatDate(contract.expiry_date) : 'open-ended'}
              {data.extensions.length > 0 && ` · extended ${data.extensions.length}× (first ended ${formatDate(data.extensions[0].previous_expiry)})`}
            </p>
          </div>
        </div>

        {/* On phones: one full-width row, the unit switcher taking the space. */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {units.length > 1 && (
            <label className="relative min-w-0 flex-1 sm:flex-none">
              <span className="sr-only">Switch unit</span>
              <select
                value={units.find((u) => u.unit_id === contract.unit_id)?.id || ''}
                onChange={(e) => e.target.value && onOpen(e.target.value)}
                className="w-full h-9 sm:h-8 pl-3 pr-8 rounded-md border border-border bg-card text-[12px] font-medium text-foreground appearance-none truncate focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.units.unit_code}{u.units.building ? ` · ${u.units.building}` : ''}</option>
                ))}
              </select>
              <Home size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-foreground" />
            </label>
          )}
          {terms.length > 1 && (
            <PeriodStepper
              label={`Term ${termIndex + 1}`}
              canPrev={termIndex > 0}
              canNext={termIndex >= 0 && termIndex < terms.length - 1}
              onPrev={() => termIndex > 0 && onOpen(terms[termIndex - 1].id)}
              onNext={() => termIndex < terms.length - 1 && onOpen(terms[termIndex + 1].id)}
              prevLabel="Previous term"
              nextLabel="Next term"
              minWidth={60}
            />
          )}
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-md text-[12px] font-semibold text-white bg-brand-solid hover:bg-brand-solid/90 disabled:opacity-50 flex-shrink-0"
            title="Download an Excel statement of this contract"
          >
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Statement
          </button>
        </div>
      </div>

      {/* Term to date */}
      <StatStrip cols={5}>
        <StatTile icon={TrendingUp} label="Gross income" value={formatPeso(totals.gross)} valueClassName={MONEY_TILE}
          trend={<Sparkline values={trend('gross')} label="Gross by month" />} sub="This contract so far" />
        <StatTile icon={Wallet} label="Expenses" value={formatPeso(totals.totalExpenses)} valueClassName={MONEY_TILE}
          trend={<Sparkline values={trend('totalExpenses')} label="Expenses by month" />} sub="Commissions, cleaning, bills" />
        <StatTile icon={Landmark} label="Net income" value={formatPeso(totals.net)} valueClassName={cn(MONEY_TILE, moneyTone(totals.net))}
          trend={<Sparkline values={trend('net')} tone={totals.net < 0 ? 'bad' : 'good'} label="Net by month" />} sub="Gross minus expenses" />
        <StatTile icon={UserRound} label={`Your share (${OWNER_PCT}%)`} value={formatPeso(totals.ownerShare)} valueClassName={cn(MONEY_TILE, moneyTone(totals.ownerShare))}
          trend={<Sparkline values={trend('ownerShare')} tone={totals.ownerShare < 0 ? 'bad' : 'good'} label="Your share by month" />} sub={`${OWNER_PCT}% of net income`} />
        <StatTile icon={Home} label="Occupancy" value={`${Math.round(occupancy.pct * 100)}%`} valueClassName={MONEY_TILE}
          sub={`${occupancy.nights} of ${occupancy.days} nights booked`} className="col-span-2 sm:col-span-1" />
      </StatStrip>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <PerformanceCard months={months} selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
        <StaysCard bookings={data.bookings} />
      </div>

      {/* One month in detail, laid out as on the Accounting page */}
      {month && (
        <OwnerMonthSection
          contract={contract}
          months={months}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
          bookings={data.bookings}
          cleanings={data.cleanings}
          expenses={data.expenses}
        />
      )}

      <p className="flex items-center gap-1.5 text-[11.5px] text-foreground pt-2">
        <FileText size={13} /> Questions about these figures? Reply to any statement email or contact Iloilo Rentals.
      </p>
    </div>
  )
}
