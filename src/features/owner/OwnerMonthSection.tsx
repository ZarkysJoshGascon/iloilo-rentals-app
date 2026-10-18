// src/features/owner/OwnerMonthSection.tsx
// One month of a contract in the owner portal, laid out like the Accounting
// page's month view and built from its parts: the month's figures with trend
// lines, occupancy and weekly charts, the calendar of stays and cleanings,
// every booking and cleaning of the term (tap one to find it), how the month
// was worked out, and the month's expenses with photos of the receipts.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarRange, ChevronDown, ChevronUp, Droplets, ExternalLink, Home, Landmark, Loader2, Lock, Megaphone,
  Receipt, Sparkles, Wallet, Wifi, X, Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  BookingCalendar, WeeklyOccupancyChart, WeeklyCumulativeChart, HalfGauge, SummaryStat,
  MoneyStrip, buildTrend, nightsInMonthFromBookings, SectionBar, ExpenseRow, SubtotalRow, ExpenseBreakdown,
} from '@/features/admin/accounting/AccountingPage'
import { Panel, PanelHeader } from '@/components/crm/Panel'
import { StatusTabs, PeriodStepper } from '@/components/crm/StatusTabs'
import {
  OWNER_PCT, COMPANY_PCT, MONTHS_SHORT, formatMoney, monthLabel, moneyTone,
  BookingRow, CleaningRow, EmptyLine,
} from './ownerUi'

const RECEIPTS_BUCKET = 'expense-proofs'
const PHONE_LIST = 5 // bookings or cleanings listed on a phone before "Show all"
const monthOf = (iso) => String(iso || '').slice(0, 7)

type ReceiptLightboxProps = {
  url: any
  onClose: () => void
}

// ── Receipts ────────────────────────────────────────────────
function ReceiptLightbox({ url, onClose }: ReceiptLightboxProps) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Receipt"
      className="fixed inset-0 z-[10001] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-semibold text-white bg-white/10 hover:bg-white/20"
        >
          <ExternalLink size={13} /> Open
        </a>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
          <X size={18} />
        </button>
      </div>
      <img src={url} alt="Receipt" className="max-w-[92vw] max-h-[86vh] object-contain rounded-md shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  )
}

type ReceiptThumbProps = {
  path: any
}

/** A receipt photo: a small thumbnail that opens full size. */
function ReceiptThumb({ path }: ReceiptThumbProps) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!path) return undefined
    supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 3600).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data?.signedUrl) setFailed(true)
      else setUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [path])

  if (!path) return null
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        disabled={!url}
        title={failed ? 'Receipt unavailable' : 'View receipt'}
        aria-label="View receipt"
        className="w-11 h-11 rounded-md overflow-hidden border border-border bg-card flex items-center justify-center flex-shrink-0 text-foreground hover:ring-2 hover:ring-brand/30 disabled:cursor-default"
      >
        {url ? <img src={url} alt="" className="w-full h-full object-cover object-top" />
          : failed ? <Receipt size={15} />
          : <Loader2 size={14} className="animate-spin" />}
      </button>
      {open && url && <ReceiptLightbox url={url} onClose={() => setOpen(false)} />}
    </>
  )
}

type ComputationCardProps = {
  month: any
}

// ── How the month was worked out ────────────────────────────
function ComputationCard({ month }: ComputationCardProps) {
  const companyFull = month.companyKeeps + month.pmShare
  const pmPct = companyFull !== 0 && month.pmShare ? Math.round((month.pmShare / companyFull) * 100) : null
  const expenseLines = [
    ['Booking commission', month.bookingComm],
    ['Affiliate commission', month.affiliateComm],
    ['Housekeeping', month.housekeeping],
    ['Laundry', month.laundry],
    ['Electricity', month.electricity],
    ['Internet', month.internet],
    ['Water', month.water],
    ['Marketing', month.marketing],
    ['Other expenses', month.other],
  ].filter(([, v]) => Number(v) !== 0)
  // Expenses read as deductions ("−₱500.00").
  const row = (label: ReactNode, value: number, opts: { border?: boolean; indent?: boolean; bold?: boolean; tone?: string; minus?: boolean } = {}) => (
    <div className={cn('flex items-baseline justify-between gap-3 px-4 sm:px-5 py-2', opts.border && 'border-t border-border', opts.indent && 'pl-7 sm:pl-8')}>
      <span className={cn('text-[12.5px] text-foreground', opts.bold && 'font-semibold')}>{label}</span>
      <span className={cn('text-[13px] tabular-nums', opts.bold ? 'font-semibold' : 'font-medium', opts.tone || 'text-foreground')}>
        {opts.minus ? `−${formatMoney(Math.abs(value))}` : formatMoney(value)}
      </span>
    </div>
  )
  return (
    <Panel>
      <PanelHeader icon={Landmark} title="How this month was worked out" subtitle={monthLabel(month.month, true)} />
      <div className="py-1">
        {row('Gross income', month.gross, { bold: true })}
        {expenseLines.length === 0 && <p className="pl-7 sm:pl-8 pr-4 py-2 text-[12px] text-foreground">No expenses this month</p>}
        {expenseLines.map(([label, value]) => <div key={label}>{row(label, value, { indent: true, minus: true })}</div>)}
        {row('Total expenses', month.totalExpenses, { bold: true, border: true })}
        {row('Net income', month.net, { bold: true, tone: moneyTone(month.net) })}
        {row(`Your share (${OWNER_PCT}% of net)`, month.ownerShare, { bold: true, border: true, tone: moneyTone(month.ownerShare) })}
        {row(`Company share (${COMPANY_PCT}% of net)`, companyFull)}
        {month.pmShare ? (
          <>
            {row(`PM share${month.pmName ? ` · ${month.pmName}` : ''}${pmPct != null ? ` (${pmPct}% of company share)` : ''}`, month.pmShare, { indent: true })}
            {row('Company keeps', month.companyKeeps, { indent: true })}
          </>
        ) : null}
      </div>
    </Panel>
  )
}

type ExpensesCardProps = {
  month: any
  expense: any
  bookings: any
  cleanings: any
}

// ── Expenses (Accounting's layout, read-only, with receipts) ─
function ExpensesCard({ month, expense, bookings, cleanings }: ExpensesCardProps) {
  const live = bookings.filter((b) => !b.cancelled_at)
  const withAffiliate = live.filter((b) => Number(b.affiliate_commission) > 0).length
  const cleaningsCount = cleanings.filter((c) => c.status !== 'cancelled').length
  const autoComputed = month.bookingComm + month.affiliateComm + month.housekeeping + month.laundry
  const manualTotal = month.electricity + month.internet + month.water + month.marketing + month.other
  const total = month.totalExpenses
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

  const bills = [
    { key: 'electricity', label: 'Electricity', icon: Zap },
    { key: 'internet', label: 'Internet', icon: Wifi },
    { key: 'water', label: 'Water', icon: Droplets },
    { key: 'marketing', label: 'Marketing', icon: Megaphone },
  ].map((b) => ({ ...b, value: month[b.key], image: expense?.[`${b.key}_image`] || null }))
  const other = expense?.custom_items || []

  const breakdown = [
    { key: 'commissions', label: 'Commissions', value: month.bookingComm + month.affiliateComm },
    { key: 'cleaning', label: 'Cleaning & laundry', value: month.housekeeping + month.laundry },
    { key: 'utilities', label: 'Utilities', value: month.electricity + month.internet + month.water },
    { key: 'marketing', label: 'Marketing', value: month.marketing },
    { key: 'other', label: 'Other', value: month.other },
  ]

  return (
    <Panel>
      <PanelHeader icon={Wallet} title="Expenses" subtitle={`${monthLabel(month.month)} · tap a receipt to see it`} />

      <div className="px-4 sm:px-5 py-4 border-b border-border space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
          <SummaryStat label="Total expenses" value={formatMoney(total)}>
            {month.gross > 0 ? `${Math.round((total / month.gross) * 100)}% of gross income` : 'No income this month'}
          </SummaryStat>
          <SummaryStat label="Auto-computed" value={formatMoney(autoComputed)}>Commissions, cleaning, laundry</SummaryStat>
          <SummaryStat label="Bills and other" value={formatMoney(manualTotal)}>Entered with receipts</SummaryStat>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-foreground">Net income</p>
            <p className={cn('text-[24px] font-semibold tracking-tight leading-none tabular-nums mt-1.5', moneyTone(month.net))}>{formatMoney(month.net)}</p>
            <p className="text-[11px] text-foreground mt-1.5">
              {month.gross > 0 ? <><span className={cn('font-semibold', moneyTone(month.net))}>{Math.round((month.net / month.gross) * 100)}%</span> margin</> : 'Gross minus expenses'}
            </p>
          </div>
        </div>
        <ExpenseBreakdown parts={breakdown} total={total} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
        <div className="min-w-0">
          <SectionBar icon={Lock} title="Auto-computed" />
          <ExpenseRow icon={Wallet} label="Booking commission" hint={plural(live.length, 'booking', 'bookings')} amount={month.bookingComm} />
          <ExpenseRow icon={Wallet} label="Affiliate commission" hint={withAffiliate ? `${plural(withAffiliate, 'booking', 'bookings')} via affiliates` : 'No affiliate bookings'} amount={month.affiliateComm} />
          <ExpenseRow icon={Sparkles} label="Housekeeping" hint={plural(cleaningsCount, 'cleaning', 'cleanings')} amount={month.housekeeping} />
          <ExpenseRow icon={Sparkles} label="Laundry" hint={plural(cleaningsCount, 'cleaning', 'cleanings')} amount={month.laundry} />
          <SubtotalRow label="Auto-computed" value={autoComputed} />
        </div>
        <div className="min-w-0">
          <SectionBar icon={Zap} title="Bills" />
          {bills.map((b) => (
            <ExpenseRow key={b.key} icon={b.icon} label={b.label} hint={b.image ? 'Receipt attached' : b.value ? 'No receipt' : 'Not entered yet'} amount={b.value}>
              <ReceiptThumb path={b.image} />
            </ExpenseRow>
          ))}
          <SectionBar icon={Receipt} title="Other expenses" count={other.length} />
          {other.length === 0 ? (
            <p className="px-5 py-3 text-[12px] text-foreground border-b border-border">Nothing else this month.</p>
          ) : (
            other.map((item, i) => (
              <ExpenseRow key={`${item.name}-${i}`} icon={Receipt} label={item.name} hint={item.image ? 'Receipt attached' : 'No receipt'} amount={item.amount}>
                <ReceiptThumb path={item.image} />
              </ExpenseRow>
            ))
          )}
          <SubtotalRow label="Bills and other" value={manualTotal} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
        <span className="text-[12px] font-semibold text-foreground">Total expenses</span>
        <span className="text-[15px] font-bold tabular-nums text-foreground">{formatMoney(total)}</span>
      </div>
    </Panel>
  )
}

type OwnerMonthSectionProps = {
  contract: any
  months: any
  selectedMonth: any
  onSelectMonth: (...args: any[]) => any
  bookings: any
  cleanings: any
  expenses: any
}

// ── The month ───────────────────────────────────────────────
export default function OwnerMonthSection({ contract, months, selectedMonth, onSelectMonth, bookings, cleanings, expenses }: OwnerMonthSectionProps) {
  const [selected, setSelected] = useState(null) // { type: 'booking' | 'cleaning', id }
  const [listTab, setListTab] = useState('bookings')
  const [showAll, setShowAll] = useState(false)
  const calendarRef = useRef(null)

  const idx = months.findIndex((m) => m.month === selectedMonth)
  const month = idx >= 0 ? months[idx] : null

  const monthBookings = useMemo(() => bookings.filter((b) => monthOf(b.check_in) === selectedMonth), [bookings, selectedMonth])
  const monthCleanings = useMemo(() => cleanings.filter((c) => monthOf(c.scheduled_date) === selectedMonth), [cleanings, selectedMonth])
  const expense = expenses.find((e) => e.month === selectedMonth) || null
  const statement = useMemo(
    () => ({ month: selectedMonth, bookingsList: monthBookings, cleaningsList: monthCleanings }),
    [selectedMonth, monthBookings, monthCleanings],
  )
  const contractDates = useMemo(
    () => ({ effective_date: contract.effective_date, expiry_date: contract.expiry_date }),
    [contract.effective_date, contract.expiry_date],
  )

  // Newest first, as in Accounting.
  const allBookings = useMemo(() => [...bookings].sort((a, b) => String(b.check_in).localeCompare(String(a.check_in))), [bookings])
  const allCleanings = useMemo(() => [...cleanings].sort((a, b) => String(b.scheduled_date).localeCompare(String(a.scheduled_date))), [cleanings])

  if (!month) return null

  const [y, m] = selectedMonth.split('-').map(Number)
  const occ = nightsInMonthFromBookings(monthBookings, y, m, contractDates)
  const cancelled = monthBookings.filter((b) => b.cancelled_at).length
  const liveCount = monthBookings.length - cancelled
  const cleaningCount = monthCleanings.length
  const listCount = listTab === 'bookings' ? allBookings.length : allCleanings.length
  // The PM tile only matters on a unit that has had a property manager.
  const hadPm = months.some((r) => r.pmShare !== 0 || r.pmName)

  // Trend lines over the six months up to this one; growth against the month before.
  const pick = (r) => ({ gross: r.gross, expenses: r.totalExpenses, net: r.net, owner: r.ownerShare })
  const prev = idx > 0 ? months[idx - 1] : null
  const trend = buildTrend(
    months.slice(Math.max(0, idx - 5), idx + 1).map(pick),
    pick(month),
    prev ? pick(prev) : null,
    prev ? MONTHS_SHORT[Number(prev.month.slice(5, 7)) - 1] : '',
  )

  const changeMonth = (key) => { setSelected(null); onSelectMonth(key) }
  const jumpTo = (type, item) => {
    const same = selected?.type === type && selected.id === item.id
    if (same) { setSelected(null); return }
    const key = monthOf(type === 'booking' ? item.check_in : item.scheduled_date)
    if (key !== selectedMonth) onSelectMonth(key)
    // On phones the list sits under the calendar, so always bring the calendar up.
    if (key !== selectedMonth || window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
    setSelected({ type, id: item.id })
  }
  const selectedBooking = selected?.type === 'booking' ? bookings.find((b) => b.id === selected.id) : null
  const selectedCleaning = selected?.type === 'cleaning' ? cleanings.find((c) => c.id === selected.id) : null

  return (
    <div className="space-y-4">
      {/* Stays under the top bar while scrolling through the month, so the
          month in view and the way to change it are always at hand. */}
      <div className="sticky top-14 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 py-2.5 bg-white/95 dark:bg-[#070a12]/95 backdrop-blur-sm border-b border-border flex items-center justify-between gap-3">
        <h2 className="text-[17px] sm:text-[18px] font-semibold text-foreground tracking-tight leading-tight truncate">{monthLabel(selectedMonth, true)}</h2>
        <PeriodStepper
          label={monthLabel(selectedMonth)}
          canPrev={idx > 0}
          canNext={idx < months.length - 1}
          onPrev={() => idx > 0 && changeMonth(months[idx - 1].month)}
          onNext={() => idx < months.length - 1 && changeMonth(months[idx + 1].month)}
          prevLabel="Previous month"
          nextLabel="Next month"
          minWidth={84}
        />
      </div>
      <p className="text-[12.5px] text-foreground -mt-1">
        {liveCount} booking{liveCount === 1 ? '' : 's'} · {cleaningCount} cleaning{cleaningCount === 1 ? '' : 's'}
        {' · '}{occ.daysInMonth ? Math.round((occ.nights / occ.daysInMonth) * 100) : 0}% occupied
        {cancelled > 0 && <> · <span className="font-semibold text-red-600 dark:text-red-400">{cancelled} cancelled</span></>}
      </p>

      <MoneyStrip
        ownerLabel="Your share"
        showPm={hadPm}
        totals={{
          gross: month.gross,
          expenses: month.totalExpenses,
          net: month.net,
          owner: month.ownerShare,
          company: month.companyKeeps + month.pmShare,
          pm: month.pmShare,
        }}
        grossSub={`${liveCount} booking${liveCount === 1 ? '' : 's'} this month`}
        pmSub={month.pmName ? `${month.pmName} was active` : 'No PM this month'}
        trend={trend}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel>
          <PanelHeader icon={Home} title="Month occupancy" subtitle={`${monthLabel(selectedMonth)} · nights booked`} />
          <div className="flex-1 p-5 flex flex-col items-center justify-center gap-5">
            <HalfGauge pct={occ.daysInMonth ? occ.nights / occ.daysInMonth : 0} sublabel={`${occ.nights} of ${occ.daysInMonth} nights`} />
            <div className="w-full grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <SummaryStat label="Bookings" value={liveCount}>{formatMoney(month.gross)} gross</SummaryStat>
              <SummaryStat label="Cleanings" value={cleaningCount}>{formatMoney(month.housekeeping + month.laundry)} paid</SummaryStat>
            </div>
          </div>
        </Panel>
        <WeeklyOccupancyChart statement={statement} contract={contractDates} />
        <WeeklyCumulativeChart statement={statement} monthlyExpenses={expenses} contract={contractDates} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        {/* scroll-mt clears the top bar and the sticky month bar. */}
        <div ref={calendarRef} className="scroll-mt-32 min-w-0">
          <BookingCalendar
            title={`${monthLabel(selectedMonth)} calendar`}
            subtitle={`${liveCount} booking${liveCount === 1 ? '' : 's'} · ${cleaningCount} cleaning${cleaningCount === 1 ? '' : 's'}`}
            month={selectedMonth}
            bookings={monthBookings}
            cleanings={monthCleanings}
            selectedId={selected}
            onSelect={(type, id) => setSelected((cur) => (cur?.type === type && cur.id === id ? null : { type, id }))}
          />
        </div>

        <Panel>
          <PanelHeader icon={CalendarRange} title="Bookings and cleanings" subtitle="This contract · tap one to find it on the calendar" />
          <div className="px-4 sm:px-5 py-3 border-b border-border">
            <StatusTabs
              tabs={[{ id: 'bookings', label: 'Bookings' }, { id: 'cleanings', label: 'Cleanings' }]}
              value={listTab}
              onChange={setListTab}
              counts={{ bookings: allBookings.length, cleanings: allCleanings.length }}
              label="Show bookings or cleanings"
              fill
            />
          </div>
          {/* Beside the calendar the list scrolls on its own; on phones it shows
              the first few with a button for the rest (no scroll inside a scroll). */}
          <div className="relative flex-1 lg:min-h-[320px]">
            <div className="lg:absolute lg:inset-0 lg:overflow-y-auto lg:overscroll-contain">
              {listTab === 'bookings'
                ? (allBookings.length === 0 ? <EmptyLine>No bookings yet.</EmptyLine> : allBookings.map((b, i) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => jumpTo('booking', b)}
                      aria-pressed={selected?.type === 'booking' && selected.id === b.id}
                      className={cn(
                        'block w-full text-left transition-colors',
                        selected?.type === 'booking' && selected.id === b.id ? 'bg-brand-solid/10' : 'hover:bg-muted/40',
                        !showAll && i >= PHONE_LIST && 'max-lg:hidden',
                      )}
                    >
                      <BookingRow booking={b} />
                    </button>
                  )))
                : (allCleanings.length === 0 ? <EmptyLine>No cleanings yet.</EmptyLine> : allCleanings.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => jumpTo('cleaning', c)}
                      aria-pressed={selected?.type === 'cleaning' && selected.id === c.id}
                      className={cn(
                        'block w-full text-left transition-colors',
                        selected?.type === 'cleaning' && selected.id === c.id ? 'bg-brand-solid/10' : 'hover:bg-muted/40',
                        !showAll && i >= PHONE_LIST && 'max-lg:hidden',
                      )}
                    >
                      <CleaningRow cleaning={c} />
                    </button>
                  )))}
              {listCount > PHONE_LIST && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="lg:hidden w-full flex items-center justify-center gap-1.5 h-11 border-t border-border text-[12.5px] font-semibold text-foreground active:bg-muted/50"
                >
                  {showAll ? <><ChevronUp size={15} /> Show fewer</> : <><ChevronDown size={15} /> Show all {listCount}</>}
                </button>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {(selectedBooking || selectedCleaning) && (
        <Panel>
          <PanelHeader
            icon={selectedBooking ? CalendarRange : Sparkles}
            title={selectedBooking ? 'Selected booking' : 'Selected cleaning'}
            action={(
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="p-1.5 rounded-md text-foreground hover:bg-muted/60">
                <X size={14} />
              </button>
            )}
          />
          {selectedBooking ? <BookingRow booking={selectedBooking} /> : <CleaningRow cleaning={selectedCleaning} />}
        </Panel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 items-start">
        <ComputationCard month={month} />
        <ExpensesCard month={month} expense={expense} bookings={monthBookings} cleanings={monthCleanings} />
      </div>
    </div>
  )
}
