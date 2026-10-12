// src/pages/owner/OwnerPortalPage.jsx
// The owner portal (/owner). A unit owner signs in with Google using the
// email on their owner record and sees their units the way the Accounting
// page shows them: this year across all units, one card per unit, and each
// contract in detail (?contract=<id>). Built in the CRM's style, phone first.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Building2, CalendarClock, Globe, Home, Landmark, Loader2, LogOut, Moon, RefreshCw,
  Sun, TrendingUp, UserRound, Wallet, AlertTriangle, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'
import { fetchOwnerOverview } from '@/lib/ownerPortal'
import { StatStrip, StatTile } from '@/components/admin/_shared/StatStrip'
import { Panel, PanelHeader, InitialsAvatar } from '@/components/admin/_shared/Panel'
import { PeriodStepper } from '@/components/admin/_shared/StatusTabs'
import { Sparkline } from '@/components/admin/_shared/Sparkline'
import OwnerContractView, { currentByUnit } from '@/components/owner/OwnerContractView'
import {
  OWNER_PCT, MONTHS_SHORT, todayISO, formatPeso, formatDate, moneyTone, ContractStatus,
} from '@/components/owner/ownerUi'

const PAGE = 'px-4 py-5 sm:px-6 md:px-8 md:py-6 max-w-[1500px] mx-auto space-y-4 pb-12'
const MONEY_TILE = 'text-[21px] sm:text-[24px]'

function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }))
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

// ── Top bar ─────────────────────────────────────────────────
// The avatar opens the account menu: who is signed in, the website, the
// theme and signing out.
function AccountMenu({ name, email, avatar, onSignOut }) {
  const { isDark, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = 'w-full flex items-center gap-2.5 h-10 px-3 rounded-md text-[13px] font-medium text-foreground hover:bg-muted/60 text-left'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={email}
        className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <span className="hidden md:inline text-[12px] font-medium text-foreground max-w-[180px] truncate">{name}</span>
        <InitialsAvatar name={name} photoUrl={avatar} size="sm" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 rounded-md border border-border bg-popover shadow-lg p-1.5 z-40">
          <div className="px-3 pt-1.5 pb-2.5 mb-1 border-b border-border">
            <p className="text-[13px] font-semibold text-foreground truncate">{name}</p>
            {email && <p className="text-[11.5px] text-foreground truncate mt-0.5">{email}</p>}
          </div>
          <Link role="menuitem" to="/" onClick={() => setOpen(false)} className={item}>
            <Globe size={15} /> Iloilo Rentals website
          </Link>
          <button role="menuitem" type="button" onClick={() => { toggleTheme(); setOpen(false) }} className={item}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />} {isDark ? 'Light mode' : 'Dark mode'}
          </button>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onSignOut() }} className={cn(item, 'text-red-600 dark:text-red-400')}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// onBack: set while a unit is open. On phones the bar then carries the way
// back to "My units" (and the unit's code), so it is reachable mid-page.
function TopBar({ user, ownerName, onSignOut, onBack, unitCode }) {
  const { isDark, toggleTheme } = useTheme()
  const avatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null
  const name = ownerName || user?.user_metadata?.full_name || user?.email || ''
  const iconButton = 'inline-flex items-center justify-center w-8 h-8 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors'
  return (
    <header className="sticky top-0 z-30 h-14 flex items-center justify-between gap-3 px-4 sm:px-6 bg-card border-b border-border">
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack && (
          <button type="button" onClick={onBack} className={cn(iconButton, 'w-9 h-9 flex-shrink-0 sm:hidden')} aria-label="Back to my units" title="Back to my units">
            <ArrowLeft size={17} />
          </button>
        )}
        <Link to="/owner" className="flex items-center gap-2.5 min-w-0">
          <img src="/Iloilo_rentals_img.png" alt="Iloilo Rentals" className="w-8 h-8 object-contain flex-shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block text-[14px] font-semibold text-foreground tracking-tight truncate">Iloilo Rentals</span>
            <span className="block text-[11px] text-foreground truncate">
              {unitCode ? <><span className="sm:hidden">{unitCode}</span><span className="hidden sm:inline">Owner portal</span></> : 'Owner portal'}
            </span>
          </span>
        </Link>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          to="/"
          title="Go to the Iloilo Rentals website"
          className="inline-flex items-center gap-1.5 h-9 sm:h-8 px-2.5 sm:px-3 rounded-md border border-border text-[12px] font-medium text-foreground hover:bg-muted/50"
        >
          <Globe size={14} /> Website
        </Link>
        {/* On phones these two live in the account menu. */}
        <button type="button" onClick={toggleTheme} className={cn(iconButton, 'hidden sm:inline-flex')} aria-label="Toggle theme" title={isDark ? 'Light mode' : 'Dark mode'}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <AccountMenu name={name} email={user?.email} avatar={avatar} onSignOut={onSignOut} />
        <button type="button" onClick={onSignOut} className={cn(iconButton, 'hidden sm:inline-flex')} aria-label="Sign out" title="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    </header>
  )
}

// ── Overview ────────────────────────────────────────────────
function UnitCard({ contract, termCount, yearShare, monthlyShare, year, onOpen }) {
  const occupancy = contract.daysElapsed > 0 ? Math.min(1, contract.nightsBooked / contract.daysElapsed) : 0
  return (
    <button
      type="button"
      onClick={() => onOpen(contract.id)}
      className="group w-full text-left rounded-md border border-border bg-card shadow-sm hover:border-brand/40 hover:shadow-md transition-all overflow-hidden flex flex-col"
    >
      <div className="px-4 sm:px-5 py-4 border-b border-border flex items-start gap-3">
        <Home size={20} strokeWidth={1.75} className="text-foreground flex-shrink-0 mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-semibold text-foreground tracking-tight truncate">{contract.units.unit_code}</p>
            <ContractStatus contract={contract} />
          </div>
          <p className="text-[12px] text-foreground truncate mt-0.5">
            {[contract.units.building, contract.units.unit_type].filter(Boolean).join(' · ')}
          </p>
          <p className="text-[11.5px] text-foreground mt-0.5">
            {formatDate(contract.effective_date)} → {contract.expiry_date ? formatDate(contract.expiry_date) : 'open-ended'}
            {termCount > 1 && ` · ${termCount} terms`}
          </p>
        </div>
        <ChevronRight size={16} className="text-foreground flex-shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="px-4 sm:px-5 py-4 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-foreground">Your share · {year}</p>
          <p className={cn('text-[20px] font-semibold tracking-tight tabular-nums leading-none mt-1.5', moneyTone(yearShare))}>{formatPeso(yearShare)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-foreground">Occupancy</p>
          <p className="text-[20px] font-semibold tracking-tight tabular-nums leading-none mt-1.5 text-foreground">{Math.round(occupancy * 100)}%</p>
          <p className="text-[11px] text-foreground mt-1 tabular-nums">{contract.nightsBooked} of {contract.daysElapsed} nights</p>
        </div>
        {monthlyShare.length > 1 && (
          <div className="col-span-2">
            <Sparkline values={monthlyShare} tone={yearShare < 0 ? 'bad' : 'good'} label="Your share by month" />
          </div>
        )}
      </div>
      <div className="mt-auto px-4 sm:px-5 py-3 border-t border-border text-[12px] text-foreground flex items-center gap-2">
        <CalendarClock size={14} className="flex-shrink-0" />
        {contract.nextCheckIn
          ? <span>Next check-in <span className="font-semibold">{formatDate(contract.nextCheckIn)}</span>{contract.upcomingBookings > 1 ? ` · ${contract.upcomingBookings} upcoming` : ''}</span>
          : <span>No upcoming bookings</span>}
      </div>
    </button>
  )
}

function OwnerOverview({ overview, firstName, onOpen }) {
  const thisYear = new Date().getFullYear()
  const years = useMemo(() => {
    const set = new Set([thisYear])
    for (const m of overview.months) set.add(Number(m.month.slice(0, 4)))
    return [...set].sort((a, b) => a - b)
  }, [overview.months, thisYear])
  const [year, setYear] = useState(thisYear)
  const yearIdx = years.indexOf(year)

  // This year across every contract, month by month.
  const yearMonths = useMemo(() => {
    const out = MONTHS_SHORT.map((label, i) => ({ key: `${year}-${String(i + 1).padStart(2, '0')}`, gross: 0, expenses: 0, net: 0, ownerShare: 0 }))
    for (const m of overview.months) {
      if (!m.month.startsWith(String(year))) continue
      const row = out[Number(m.month.slice(5, 7)) - 1]
      row.gross += m.gross
      row.expenses += m.expenses
      row.net += m.net
      row.ownerShare += m.ownerShare
    }
    // The current year runs to this month only.
    return year === thisYear ? out.slice(0, new Date().getMonth() + 1) : out
  }, [overview.months, year, thisYear])

  const totals = useMemo(() => yearMonths.reduce((t, m) => ({
    gross: t.gross + m.gross, expenses: t.expenses + m.expenses, net: t.net + m.net, ownerShare: t.ownerShare + m.ownerShare,
  }), { gross: 0, expenses: 0, net: 0, ownerShare: 0 }), [yearMonths])

  const units = useMemo(() => currentByUnit(overview.contracts), [overview.contracts])
  const shareFor = (unitId) => {
    const ids = new Set(overview.contracts.filter((c) => c.unit_id === unitId).map((c) => c.id))
    const rows = overview.months.filter((m) => ids.has(m.contractId) && m.month.startsWith(String(year)))
    return { total: rows.reduce((t, m) => t + m.ownerShare, 0), series: rows.sort((a, b) => a.month.localeCompare(b.month)).map((m) => m.ownerShare) }
  }

  const next = units.filter((c) => c.nextCheckIn).sort((a, b) => a.nextCheckIn.localeCompare(b.nextCheckIn))[0]
  const active = units.filter((c) => !c.superseded_by && (!c.expiry_date || c.expiry_date >= todayISO())).length
  const summary = [
    `${units.length} unit${units.length === 1 ? '' : 's'}`,
    `${active} with an active contract`,
    next && `next check-in ${formatDate(next.nextCheckIn, false)} at ${next.units.unit_code}`,
  ].filter(Boolean).join(' · ')
  const period = year === thisYear ? `Jan–${MONTHS_SHORT[new Date().getMonth()]} ${year}` : String(year)

  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-foreground tracking-tight leading-tight">
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-[12.5px] text-foreground mt-1">{summary}</p>
        </div>
        <PeriodStepper
          label={year}
          canPrev={yearIdx > 0}
          canNext={yearIdx >= 0 && yearIdx < years.length - 1}
          onPrev={() => yearIdx > 0 && setYear(years[yearIdx - 1])}
          onNext={() => yearIdx < years.length - 1 && setYear(years[yearIdx + 1])}
          prevLabel="Previous year"
          nextLabel="Next year"
        />
      </div>

      <StatStrip cols={4}>
        <StatTile icon={TrendingUp} label="Gross income" value={formatPeso(totals.gross)} valueClassName={MONEY_TILE}
          trend={<Sparkline values={yearMonths.map((m) => m.gross)} label="Gross by month" />} sub={`All units · ${period}`} />
        <StatTile icon={Wallet} label="Expenses" value={formatPeso(totals.expenses)} valueClassName={MONEY_TILE}
          trend={<Sparkline values={yearMonths.map((m) => m.expenses)} label="Expenses by month" />} sub="Commissions, cleaning, bills" />
        <StatTile icon={Landmark} label="Net income" value={formatPeso(totals.net)} valueClassName={cn(MONEY_TILE, moneyTone(totals.net))}
          trend={<Sparkline values={yearMonths.map((m) => m.net)} tone={totals.net < 0 ? 'bad' : 'good'} label="Net by month" />} sub="Gross minus expenses" />
        <StatTile icon={UserRound} label={`Your share (${OWNER_PCT}%)`} value={formatPeso(totals.ownerShare)} valueClassName={cn(MONEY_TILE, moneyTone(totals.ownerShare))}
          trend={<Sparkline values={yearMonths.map((m) => m.ownerShare)} tone={totals.ownerShare < 0 ? 'bad' : 'good'} label="Your share by month" />} sub={`${OWNER_PCT}% of net income`} />
      </StatStrip>

      <Panel>
        <PanelHeader icon={Building2} title="Your units" subtitle="Open a unit to see every booking, cleaning and expense" count={units.length} />
        {units.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12.5px] text-foreground">No contracts yet. We'll show your unit here as soon as its contract is set up.</p>
        ) : (
          <div className="p-3 sm:p-5 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 sm:gap-4">
            {units.map((c) => {
              const share = shareFor(c.unit_id)
              return (
                <UnitCard
                  key={c.id}
                  contract={c}
                  termCount={overview.contracts.filter((x) => x.unit_id === c.unit_id).length}
                  yearShare={share.total}
                  monthlyShare={share.series}
                  year={year}
                  onOpen={onOpen}
                />
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}

// ── States ──────────────────────────────────────────────────
function Centered({ children }) {
  return <div className="min-h-[60vh] flex items-center justify-center px-6 text-center">{children}</div>
}

function NotLinked({ email, onSignOut }) {
  return (
    <Centered>
      <div className="max-w-sm">
        <Home size={24} strokeWidth={1.5} className="mx-auto text-foreground mb-3" />
        <p className="text-[15px] font-semibold text-foreground">We couldn't find a unit for this account</p>
        <p className="text-[12.5px] text-foreground mt-2 leading-relaxed">
          You're signed in as <span className="font-semibold">{email}</span>. Sign in with the email address we have on file
          for you as an owner, or contact us and we'll link your account.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/contact" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[12px] font-semibold text-white bg-brand-solid hover:bg-brand-solid/90">
            Contact us
          </Link>
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-border text-[12px] font-semibold text-foreground hover:bg-muted/50">
            <LogOut size={13} /> Use another account
          </button>
        </div>
      </div>
    </Centered>
  )
}

// ── Page ────────────────────────────────────────────────────
export default function OwnerPortalPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading, signOut } = useAuth()
  const { loading: roleLoading } = useUserRole()
  const [params, setParams] = useSearchParams()
  const contractId = params.get('contract')

  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    document.title = 'Owner portal · Iloilo Rentals'
  }, [])

  // Signed-out visitors go to the login page and come back here afterwards.
  useEffect(() => {
    if (!authLoading && !user) navigate('/login?redirect=/owner', { replace: true })
  }, [authLoading, user, navigate])

  // Wait for role detection: it links the owner record to this account on first login.
  useEffect(() => {
    if (authLoading || roleLoading || !user) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOwnerOverview()
      .then((d) => { if (!cancelled) setOverview(d) })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Could not load your units') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authLoading, roleLoading, user, reloadKey])

  // A link to one contract opens it; the browser's back button returns to the overview.
  const open = useCallback((id) => {
    setParams(id ? { contract: id } : {})
    window.scrollTo({ top: 0 })
  }, [setParams])

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const ownerName = overview?.owners?.[0]?.name || ''
  const firstName = (ownerName || user?.user_metadata?.full_name || '').split(' ')[0]
  const knownContract = !contractId || overview?.contracts.some((c) => c.id === contractId)
  const openContract = contractId && overview?.owners?.length ? overview.contracts.find((c) => c.id === contractId) : null

  let body
  if (authLoading || roleLoading || (loading && !overview) || !user) {
    body = <Centered><Loader2 size={24} className="animate-spin text-foreground" /></Centered>
  } else if (error) {
    body = (
      <Centered>
        <div className="max-w-sm">
          <AlertTriangle size={22} className="mx-auto text-foreground mb-3" />
          <p className="text-sm font-semibold text-foreground">Couldn't load your units</p>
          <p className="text-xs text-foreground mt-1 break-words">{error}</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white bg-brand-solid hover:bg-brand-solid/90">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      </Centered>
    )
  } else if (!overview?.owners?.length) {
    body = <NotLinked email={user.email} onSignOut={handleSignOut} />
  } else if (contractId && knownContract) {
    body = (
      <OwnerContractView
        key={contractId}
        contractId={contractId}
        contracts={overview.contracts}
        onOpen={open}
        onBack={() => open(null)}
      />
    )
  } else {
    body = <OwnerOverview overview={overview} firstName={firstName} onOpen={open} />
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#070a12]">
      <TopBar
        user={user}
        ownerName={ownerName}
        onSignOut={handleSignOut}
        onBack={openContract ? () => open(null) : null}
        unitCode={openContract?.units.unit_code}
      />
      <main className="flex-1">{body}</main>
      <footer className="px-4 sm:px-6 py-4 border-t border-border text-center text-[11.5px] text-foreground">
        <Link to="/" className="font-semibold hover:underline underline-offset-2">Iloilo Rentals</Link>
        {' '}· Figures update as bookings, cleanings and expenses are recorded · Amounts in Philippine pesos (₱)
      </footer>
    </div>
  )
}
