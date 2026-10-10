// src/pages/admin/AdminDashboardPage.jsx
import { useEffect, useState, useCallback, useRef, lazy, Suspense, memo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion'
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import {
  Moon, Sun, LogOut, ArrowLeft, Calendar, Users, Sparkles,
  FileText, TrendingUp, Loader2, LayoutDashboard, Megaphone, Inbox, Palette,
  ScrollText,
} from 'lucide-react'
import AdminSidebar, {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_PUSH_DELTA,
  SIDEBAR_SLIDE_MS,
  SIDEBAR_SLIDE_EASE,
} from '../../components/admin/AdminSidebar'
import { InquiryNotifications } from '../../components/admin/InquiryNotifications'

// ─────────────────────────────────────────────────────────────
// Lazy pages
// ─────────────────────────────────────────────────────────────
const DashboardPage         = lazy(() => import('../../components/admin/dashboard/DashboardPage'))
const RegistryPage          = lazy(() => import('../../components/admin/registry/RegistryPage'))
const ContractsPage         = lazy(() => import('../../components/admin/contracts/ContractsPage'))
const AccountingPage        = lazy(() => import('../../components/admin/accounting/AccountingPage'))
const BookingsPage          = lazy(() => import('../../components/admin/bookings/BookingsPage'))
const CampaignsPage         = lazy(() => import('../../components/admin/campaigns/CampaignsPage'))
const InquiriesPage         = lazy(() => import('../../components/admin/inquiries/InquiriesPage'))
const InteriorInquiriesPage = lazy(() => import('../../components/admin/interior/InteriorInquiriesPage'))
const TeamPage              = lazy(() => import('../../components/admin/team/TeamPage'))
const HousekeepingPage      = lazy(() => import('../../components/admin/housekeeping/HousekeepingPage'))

const PREFETCH = {
  dashboard:    () => import('../../components/admin/dashboard/DashboardPage'),
  registry:     () => import('../../components/admin/registry/RegistryPage'),
  contracts:    () => import('../../components/admin/contracts/ContractsPage'),
  accounting:   () => import('../../components/admin/accounting/AccountingPage'),
  bookings:     () => import('../../components/admin/bookings/BookingsPage'),
  housekeeping: () => import('../../components/admin/housekeeping/HousekeepingPage'),
  inquiries:    () => import('../../components/admin/inquiries/InquiriesPage'),
  interior:     () => import('../../components/admin/interior/InteriorInquiriesPage'),
  campaigns:    () => import('../../components/admin/campaigns/CampaignsPage'),
  team:         () => import('../../components/admin/team/TeamPage'),
}

const IDLE_LIMIT_MS   = 30 * 60 * 1000
const HIDDEN_LIMIT_MS = 60 * 60 * 1000
const TICK_MS         = 15 * 1000
const ACTIVITY_KEY    = 'ir:admin:lastActivity'
const HIDDEN_AT_KEY   = 'ir:admin:hiddenAt'

const VALID_TABS = [
  'dashboard', 'registry', 'contracts', 'accounting', 'bookings',
  'housekeeping', 'inquiries', 'interior', 'campaigns', 'team',
]

// ─────────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────────
const C = {
  pageBg:      '#f2f5f9',
  pageBgDark:  '#070a12',
  surface:     '#ffffff',
  surfaceDark: '#0f131c',
  border:      '#e1e7ef',
  borderDark:  'rgba(255,255,255,0.07)',
}

const SOFT_SHADOW = '0 12px 32px -12px rgba(15,23,42,0.18), 0 4px 12px -4px rgba(15,23,42,0.08)'
const SOFT_SHADOW_DARK = '0 12px 32px -12px rgba(0,0,0,0.55), 0 4px 12px -4px rgba(0,0,0,0.35)'

function readStorage(key, fallback = 0) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch { return fallback }
}
function writeStorage(key, value) {
  try { sessionStorage.setItem(key, String(value)) } catch { /* ignore */ }
}
function clearSessionStorage() {
  try {
    sessionStorage.removeItem(ACTIVITY_KEY)
    sessionStorage.removeItem(HIDDEN_AT_KEY)
  } catch { /* ignore */ }
}

function formatClockDate(d) {
  return d.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'Asia/Manila',
  })
}
function formatClockTime(d) {
  return d.toLocaleTimeString('en-PH', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Manila',
  })
}

// ─────────────────────────────────────────────────────────────
// Idle prefetch helper
// ─────────────────────────────────────────────────────────────
function scheduleIdle(cb, timeout = 2000) {
  if (typeof window === 'undefined') return null
  if ('requestIdleCallback' in window) {
    return { kind: 'idle', id: window.requestIdleCallback(cb, { timeout }) }
  }
  return { kind: 'timeout', id: setTimeout(cb, 1200) }
}
function cancelIdle(handle) {
  if (!handle) return
  if (handle.kind === 'idle' && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle.id)
  } else {
    clearTimeout(handle.id)
  }
}

// ─────────────────────────────────────────────────────────────
// Page skeleton — only shown on a tab's FIRST visit
// ─────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="px-6 py-5 md:px-8 md:py-6 max-w-[1600px] mx-auto space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] animate-pulse" />
          ))}
        </div>
        <div className="h-10 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] animate-pulse" />
        <div className="rounded-lg overflow-hidden bg-black/[0.02] dark:bg-white/[0.02]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 border-b border-black/[0.04] dark:border-white/[0.04] last:border-b-0 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Chunk cache — once a tab's component has mounted, we never
// show its skeleton again for the rest of the browser session.
// ─────────────────────────────────────────────────────────────
const loadedTabs = new Set()

const ActiveTab = memo(function ActiveTab({
  activeTab, contractId, bookingId, cleaningId, fromBookingId, onNavigateTab,
}) {
  switch (activeTab) {
    case 'dashboard':
      return <DashboardPage onNavigateTab={onNavigateTab} />
    case 'registry':
      return <RegistryPage />
    case 'contracts':
      return <ContractsPage />
    case 'accounting':
      return <AccountingPage initialSelectedId={contractId} />
    case 'bookings':
      return <BookingsPage initialSelectedId={bookingId} />
    case 'housekeeping':
      return <HousekeepingPage initialSelectedId={cleaningId} fromBookingId={fromBookingId} />
    case 'inquiries':
      return <InquiriesPage />
    case 'interior':
      return <InteriorInquiriesPage />
    case 'campaigns':
      return <CampaignsPage />
    case 'team':
      return <TeamPage />
    default:
      return <DashboardPage onNavigateTab={onNavigateTab} />
  }
})

export default function AdminDashboardPage() {
  const { user, signOut } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const prefersReducedMotion = useReducedMotion()

  const urlTab = searchParams.get('tab')
  const initialTab = urlTab && VALID_TABS.includes(urlTab) ? urlTab : 'dashboard'

  const [activeTab, setActiveTab] = useState(initialTab)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [adminUser, setAdminUser] = useState(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  // ── Mark current tab loaded as soon as it becomes active ──
  useEffect(() => {
    loadedTabs.add(activeTab)
  }, [activeTab])

  // ── Clock ────────────────────────────────────────────────
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  // ── Admin user ───────────────────────────────────────────
  useEffect(() => {
    if (user) {
      setAdminUser({
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin',
        email: user.email,
        avatar: user.user_metadata?.avatar_url || null,
      })
    }
  }, [user])

  // ── URL tab sync ─────────────────────────────────────────
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && VALID_TABS.includes(tab) && tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [searchParams, activeTab])

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    if (tab !== 'contracts') next.delete('unit')
    if (tab !== 'contracts') next.delete('new')
    if (tab !== 'contracts' && tab !== 'accounting') next.delete('contract')
    if (tab !== 'bookings') next.delete('booking')
    if (tab !== 'housekeeping') next.delete('cleaning')
    if (tab !== 'housekeeping') next.delete('fromBooking')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const handleSignOut = useCallback(async () => {
    clearSessionStorage()
    try { await signOut() } catch (err) { console.error('Sign out failed:', err) }
    navigate('/', { replace: true })
  }, [signOut, navigate])

  // ── Session timeouts ─────────────────────────────────────
  const tickRef = useRef(null)
  const handleSignOutRef = useRef(handleSignOut)
  useEffect(() => { handleSignOutRef.current = handleSignOut }, [handleSignOut])

  useEffect(() => {
    if (!user) return
    const nowTs = Date.now()
    let lastActivity = readStorage(ACTIVITY_KEY, 0)
    if (!lastActivity || lastActivity > nowTs) {
      lastActivity = nowTs
      writeStorage(ACTIVITY_KEY, lastActivity)
    }
    if (nowTs - lastActivity >= IDLE_LIMIT_MS) {
      handleSignOutRef.current()
      return
    }
    const markActive = () => writeStorage(ACTIVITY_KEY, Date.now())
    const tick = () => {
      const t = Date.now()
      if (document.hidden) {
        const hiddenAt = readStorage(HIDDEN_AT_KEY, 0)
        if (hiddenAt && t - hiddenAt >= HIDDEN_LIMIT_MS) handleSignOutRef.current()
        return
      }
      const last = readStorage(ACTIVITY_KEY, t)
      if (t - last >= IDLE_LIMIT_MS) handleSignOutRef.current()
    }
    tickRef.current = setInterval(tick, TICK_MS)
    const onVisibilityChange = () => {
      const t = Date.now()
      if (document.hidden) {
        writeStorage(HIDDEN_AT_KEY, t)
      } else {
        const hiddenAt = readStorage(HIDDEN_AT_KEY, 0)
        if (hiddenAt && t - hiddenAt >= HIDDEN_LIMIT_MS) {
          clearSessionStorage()
          handleSignOutRef.current()
          return
        }
        const last = readStorage(ACTIVITY_KEY, t)
        if (t - last >= IDLE_LIMIT_MS) {
          handleSignOutRef.current()
          return
        }
        writeStorage(ACTIVITY_KEY, t)
        try { sessionStorage.removeItem(HIDDEN_AT_KEY) } catch { /* ignore */ }
      }
    }
    const events = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart']
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }))
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive))
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onVisibilityChange)
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [user])

  // ── Idle prefetch every lazy chunk once ─────────────────
  useEffect(() => {
    const handle = scheduleIdle(() => {
      Object.values(PREFETCH).forEach((fn) => {
        try { fn().catch(() => {}) } catch { /* ignore */ }
      })
    }, 2500)
    return () => cancelIdle(handle)
  }, [])

  // ── Profile menu escape ─────────────────────────────────
  useEffect(() => {
    if (!showProfileMenu) return
    const onKey = (e) => { if (e.key === 'Escape') setShowProfileMenu(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showProfileMenu])

  const tabIcons = {
    dashboard: LayoutDashboard, registry: ScrollText, contracts: FileText,
    accounting: TrendingUp, bookings: Calendar, housekeeping: Sparkles,
    inquiries: Inbox, interior: Palette, campaigns: Megaphone, team: Users,
  }
  const tabTitles = {
    dashboard: 'Dashboard', registry: 'Registry', contracts: 'Contracts',
    accounting: 'Accounting', bookings: 'Bookings', housekeeping: 'Housekeeping',
    inquiries: 'Inquiries', interior: 'Interior Design', campaigns: 'Campaigns',
    team: 'Team',
  }
  const Icon = tabIcons[activeTab] || LayoutDashboard
  const title = tabTitles[activeTab] || 'Dashboard'

  const contentPush = sidebarCollapsed ? 0 : SIDEBAR_PUSH_DELTA

  const surface = isDark ? C.surfaceDark : C.surface
  const border = isDark ? C.borderDark : C.border

  // ─────────────────────────────────────────────────────────
  // Page transition — always left → right.
  //   Incoming page: enters from left (-x), settles to 0
  //   Outgoing page: exits to the right (+x)
  // Respects reduced-motion preference (fade only).
  // ─────────────────────────────────────────────────────────
  const pageVariants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.12 } },
        exit:    { opacity: 0, transition: { duration: 0.08 } },
      }
    : {
        initial: { opacity: 0, x: -24 },
        animate: { opacity: 1, x: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] } },
        exit:    { opacity: 0, x: 24, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
      }

  const skeletonFor = loadedTabs.has(activeTab) ? null : <PageSkeleton />

  return (
    <MotionConfig reducedMotion="user">
      <div className="fixed inset-0 overflow-hidden text-foreground">
        <InquiryNotifications onNavigateTab={handleTabChange} />

        <AdminSidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          collapsed={sidebarCollapsed}
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
          prefetch={PREFETCH}
        />

        <div
          className="h-full flex flex-col"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: SIDEBAR_COLLAPSED_WIDTH,
            width: `calc(100vw - ${SIDEBAR_COLLAPSED_WIDTH}px)`,
            transform: `translate3d(${contentPush}px, 0, 0)`,
            transition: `transform ${SIDEBAR_SLIDE_MS}ms ${SIDEBAR_SLIDE_EASE}`,
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          }}
        >
          <header
            className="flex-shrink-0 flex items-center justify-between gap-4 px-5"
            style={{
              height: 56,
              backgroundColor: surface,
              borderBottom: `1px solid ${border}`,
              transition: 'background-color 300ms ease, border-color 300ms ease',
            }}
          >
          <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-2.5 min-w-0"
              >
                <Icon size={18} className="text-[#2d568e] dark:text-blue-400 flex-shrink-0" />
                <h2 className="text-[15px] font-semibold text-foreground truncate tracking-tight">
                  {title}
                </h2>
                <span className="hidden md:inline text-[11px] text-muted-foreground tabular-nums whitespace-nowrap ml-1">
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  {formatClockDate(now)}
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  {formatClockTime(now)}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => navigate('/')}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ border: `1px solid ${border}` }}
              >
                <ArrowLeft size={13} />
                <span>Back to site</span>
              </button>

              <button
                onClick={toggleTheme}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ border: `1px solid ${border}` }}
                aria-label="Toggle theme"
              >
                {isDark
                  ? <Sun size={14} className="text-amber-400" />
                  : <Moon size={14} className="text-gray-600" />}
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu((v) => !v)}
                  className="flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-lg transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  style={{ border: `1px solid ${border}` }}
                >
                  {adminUser?.avatar ? (
                    <img src={adminUser.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center text-white text-[10px] font-semibold">
                      {adminUser?.name?.charAt(0)?.toUpperCase() || 'A'}
                    </div>
                  )}
                  <div className="hidden md:block text-left leading-none">
                    <p className="text-[12px] font-medium text-foreground truncate max-w-[140px]">
                      {adminUser?.name || 'Admin'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Administrator</p>
                  </div>
                </button>

                <AnimatePresence>
                  {showProfileMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute right-0 top-full mt-2 w-64 rounded-xl z-50 overflow-hidden"
                        style={{
                          backgroundColor: surface,
                          border: `1px solid ${border}`,
                          boxShadow: isDark ? SOFT_SHADOW_DARK : SOFT_SHADOW,
                        }}
                      >
                        <div className="p-4" style={{ borderBottom: `1px solid ${border}` }}>
                          <div className="flex items-center gap-3 min-w-0">
                            {adminUser?.avatar ? (
                              <img src={adminUser.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center text-white font-semibold">
                                {adminUser?.name?.charAt(0)?.toUpperCase() || 'A'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-foreground truncate">
                                {adminUser?.name || 'Admin'}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {adminUser?.email || ''}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="p-1.5">
                          <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                          >
                            <LogOut size={14} /> Sign Out
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          <div
            className="flex-1 min-h-0 relative"
            style={{
              backgroundColor: isDark ? C.pageBgDark : C.pageBg,
              transition: 'background-color 300ms ease',
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="absolute inset-0"
              >
                <Suspense fallback={skeletonFor}>
                  <ActiveTab
                    activeTab={activeTab}
                    contractId={searchParams.get('contract')}
                    bookingId={searchParams.get('booking')}
                    cleaningId={searchParams.get('cleaning')}
                    fromBookingId={searchParams.get('fromBooking')}
                    onNavigateTab={handleTabChange}
                  />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </MotionConfig>
  )
}