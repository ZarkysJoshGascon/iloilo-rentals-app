import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import {
  Moon, Sun, LogOut, ScrollText, ArrowLeft, Calendar, Users, Sparkles,
  FileText, TrendingUp,
} from 'lucide-react'
import AdminSidebar from '../../components/admin/AdminSidebar'
import RegistryPage from '../../components/admin/registry/RegistryPage'
import ContractsPage from '../../components/admin/contracts/ContractsPage'
import AccountingPage from '../../components/admin/accounting/AccountingPage'
import BookingsPage from '../../components/admin/bookings/BookingsPage'
import TeamPage from '../../components/admin/team/TeamPage'
import HousekeepingPage from '../../components/admin/housekeeping/HousekeepingPage'

// ============================================================
// SESSION TIMEOUT CONFIG
// ============================================================
const IDLE_LIMIT_MS   = 30 * 60 * 1000
const HIDDEN_LIMIT_MS = 60 * 60 * 1000
const TICK_MS         = 15 * 1000
const ACTIVITY_KEY    = 'ir:admin:lastActivity'
const HIDDEN_AT_KEY   = 'ir:admin:hiddenAt'

const VALID_TABS = ['registry', 'contracts', 'accounting', 'bookings', 'team', 'housekeeping']

function readStorage(key, fallback = 0) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
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

function PageTransition({ children, tabKey }) {
  return (
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className="h-full min-h-0"
    >
      {children}
    </motion.div>
  )
}

export default function AdminDashboardPage() {
  const { user, signOut } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlTab = searchParams.get('tab')
  const initialTab = urlTab && VALID_TABS.includes(urlTab) ? urlTab : 'registry'

  const [activeTab, setActiveTab] = useState(initialTab)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [adminUser, setAdminUser] = useState(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)

  useEffect(() => {
    if (user) {
      setAdminUser({
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin',
        email: user.email,
        avatar: user.user_metadata?.avatar_url || null,
      })
    }
  }, [user])

  // Sync tab state with URL when URL changes externally
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
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const handleSignOut = useCallback(async () => {
    clearSessionStorage()
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out failed:', err)
    }
    navigate('/', { replace: true })
  }, [signOut, navigate])

  // ============ SESSION TIMEOUT ============
  const tickRef = useRef(null)
  const handleSignOutRef = useRef(handleSignOut)

  useEffect(() => { handleSignOutRef.current = handleSignOut }, [handleSignOut])

  useEffect(() => {
    if (!user) return

    const now = Date.now()
    let lastActivity = readStorage(ACTIVITY_KEY, 0)
    if (!lastActivity || lastActivity > now) {
      lastActivity = now
      writeStorage(ACTIVITY_KEY, lastActivity)
    }

    if (now - lastActivity >= IDLE_LIMIT_MS) {
      handleSignOutRef.current()
      return
    }

    const markActive = () => {
      const t = Date.now()
      writeStorage(ACTIVITY_KEY, t)
    }

    const tick = () => {
      const nowTs = Date.now()
      if (document.hidden) {
        const hiddenAt = readStorage(HIDDEN_AT_KEY, 0)
        if (hiddenAt && nowTs - hiddenAt >= HIDDEN_LIMIT_MS) {
          handleSignOutRef.current()
        }
        return
      }
      const last = readStorage(ACTIVITY_KEY, nowTs)
      if (nowTs - last >= IDLE_LIMIT_MS) {
        handleSignOutRef.current()
      }
    }

    tickRef.current = setInterval(tick, TICK_MS)

    const onVisibilityChange = () => {
      const nowTs = Date.now()
      if (document.hidden) {
        writeStorage(HIDDEN_AT_KEY, nowTs)
      } else {
        const hiddenAt = readStorage(HIDDEN_AT_KEY, 0)
        if (hiddenAt && nowTs - hiddenAt >= HIDDEN_LIMIT_MS) {
          clearSessionStorage()
          handleSignOutRef.current()
          return
        }
        const last = readStorage(ACTIVITY_KEY, nowTs)
        if (nowTs - last >= IDLE_LIMIT_MS) {
          handleSignOutRef.current()
          return
        }
        writeStorage(ACTIVITY_KEY, nowTs)
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

  useEffect(() => {
    if (!showProfileMenu) return
    const onKey = (e) => { if (e.key === 'Escape') setShowProfileMenu(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showProfileMenu])

  const tabIcons = {
    registry: ScrollText,
    contracts: FileText,
    accounting: TrendingUp,
    bookings: Calendar,
    team: Users,
    housekeeping: Sparkles,
  }

  const tabTitles = {
    registry: 'Registry',
    contracts: 'Contracts',
    accounting: 'Accounting',
    bookings: 'Bookings',
    team: 'Team',
    housekeeping: 'Housekeeping',
  }

  const Icon = tabIcons[activeTab] || ScrollText

  const sidebarLeftOffset = 12
  const sidebarCollapsedWidth = 56
  const sidebarExpandedWidth = 224
  const pageOverlap = 4

  const sidebarWidth = sidebarCollapsed ? sidebarCollapsedWidth : sidebarExpandedWidth
  const contentMarginLeft = sidebarLeftOffset + sidebarWidth - pageOverlap

  const sidebarStyle = {
    left: `${sidebarLeftOffset}px`,
    width: `calc(100% - ${sidebarLeftOffset}px)`,
    transition: 'all 0.3s ease',
  }

  const isFullHeightTab =
    activeTab === 'registry' ||
    activeTab === 'contracts' ||
    activeTab === 'accounting' ||
    activeTab === 'bookings' ||
    activeTab === 'team' ||
    activeTab === 'housekeeping'

  return (
    <div className="h-screen flex flex-col bg-[#d4deec] dark:bg-gray-900 overflow-hidden transition-colors duration-300">
      {/* Top bar */}
      <div className="flex-shrink-0 h-14 flex items-center justify-between px-6 bg-transparent z-40">
        <h1 className="text-xl font-bold text-[#2d568e] dark:text-blue-400 tracking-tight">
          Iloilo Rentals Management System
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-all duration-200 shadow-sm"
            title="Back to site"
          >
            <ArrowLeft size={17} />
            <span className="hidden sm:inline text-sm font-medium">Back to site</span>
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-all duration-200 shadow-sm"
            title="Toggle theme"
          >
            {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-gray-600" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-all duration-200 shadow-sm"
            >
              {adminUser?.avatar ? (
                <img src={adminUser.avatar} alt="Admin" className="w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-gray-700" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center text-white text-xs font-semibold ring-2 ring-white dark:ring-gray-700">
                  {adminUser?.name?.charAt(0)?.toUpperCase() || 'A'}
                </div>
              )}
              <div className="hidden sm:block text-left">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">
                  {adminUser?.name || 'Admin'}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                  Administrator
                </p>
              </div>
            </button>
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      {adminUser?.avatar ? (
                        <img src={adminUser.avatar} alt="Admin" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center text-white font-semibold">
                          {adminUser?.name?.charAt(0)?.toUpperCase() || 'A'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {adminUser?.name || 'Admin'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {adminUser?.email || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <LogOut size={16} /> Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute top-0 bottom-0 z-0" style={sidebarStyle}>
          <AdminSidebar
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            collapsed={sidebarCollapsed}
            onMouseEnter={() => setSidebarCollapsed(false)}
            onMouseLeave={() => setSidebarCollapsed(true)}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        <div
          className="h-full flex flex-col transition-all duration-300"
          style={{ marginLeft: `${contentMarginLeft}px` }}
          onMouseEnter={() => setSidebarCollapsed(true)}
        >
          <div className="bg-white dark:bg-gray-800 rounded-tl-xl shadow-2xl overflow-hidden flex flex-col flex-1 transition-colors duration-300 z-10 relative">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-3 flex-shrink-0">
              <Icon size={22} className="text-[#2d568e] dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                {tabTitles[activeTab] || 'Dashboard'}
              </h2>
            </div>

            <div
              className={
                isFullHeightTab
                  ? 'flex-1 min-h-0 overflow-hidden p-6 relative'
                  : 'flex-1 overflow-auto p-6'
              }
            >
              <AnimatePresence mode="wait">
                {activeTab === 'registry' && (
                  <PageTransition tabKey="registry">
                    <div className="absolute inset-6 min-h-0 flex flex-col">
                      <RegistryPage />
                    </div>
                  </PageTransition>
                )}
                {activeTab === 'contracts' && (
                  <PageTransition tabKey="contracts">
                    <div className="absolute inset-6 min-h-0 flex flex-col">
                      <ContractsPage />
                    </div>
                  </PageTransition>
                )}
                {activeTab === 'accounting' && (
                  <PageTransition tabKey="accounting">
                    <div className="absolute inset-6 min-h-0 flex flex-col">
                      <AccountingPage />
                    </div>
                  </PageTransition>
                )}
                {activeTab === 'bookings' && (
                  <PageTransition tabKey="bookings">
                    <div className="absolute inset-6 min-h-0 flex flex-col">
                      <BookingsPage />
                    </div>
                  </PageTransition>
                )}
                {activeTab === 'team' && (
                  <PageTransition tabKey="team">
                    <div className="absolute inset-6 min-h-0 flex flex-col">
                      <TeamPage />
                    </div>
                  </PageTransition>
                )}
                {activeTab === 'housekeeping' && (
                  <PageTransition tabKey="housekeeping">
                    <div className="absolute inset-6 min-h-0 flex flex-col">
                      <HousekeepingPage />
                    </div>
                  </PageTransition>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}