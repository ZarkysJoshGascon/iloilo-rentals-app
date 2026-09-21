import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import {
  Moon, Sun, CalendarDays, DoorOpen, LogOut, Building2,
  Paintbrush, LayoutDashboard, ScrollText, ArrowLeft,
} from 'lucide-react'
import toast from "react-hot-toast";
import AdminSidebar from '../../components/admin/AdminSidebar'
import BookingsList from '../../components/admin/bookings/BookingsList'
import CalendarView from '../../components/admin/calendar/CalendarView'
import CondosManagement from '../../components/admin/condos/CondosManagement'
import HousekeepingManagement from '../../components/admin/housekeeping/HousekeepingManagement'
import AccountingManagement from '../../components/admin/accounting/AccountingManagement'
import RegistryPage from '../../components/admin/registry/RegistryPage'

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

  const [activeTab, setActiveTab] = useState('bookings')
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

  const handleTabChange = (tab) => setActiveTab(tab)

  const handleSignOut = useCallback(async () => {
    await signOut()
    navigate('/')
  }, [signOut, navigate])

  // ============ SESSION TIMEOUT (30 minutes inactivity) ============
  const timeoutRef = useRef(null)

  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      handleSignOut()
    }, 30 * 60 * 1000)
  }, [handleSignOut])

  useEffect(() => {
    const events = ['click', 'keydown', 'scroll', 'mousemove', 'touchstart']
    const handleActivity = () => resetTimeout()

    events.forEach((event) => window.addEventListener(event, handleActivity))
    resetTimeout()

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      events.forEach((event) => window.removeEventListener(event, handleActivity))
    }
  }, [resetTimeout])

  const tabIcons = {
    bookings: CalendarDays,
    listings: Building2,
    calendar: DoorOpen,
    registry: ScrollText,
    housekeeping: Paintbrush,
    accounting: LayoutDashboard,
  }

  const tabTitles = {
    bookings: 'Bookings Management',
    listings: 'Listings Management',
    calendar: 'Calendar',
    registry: 'Registry',
    housekeeping: 'Housekeeping',
    accounting: 'Accounting',
  }

  const Icon = tabIcons[activeTab] || LayoutDashboard

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

  const isRegistry = activeTab === 'registry'

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
          >
            {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-gray-600" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-all duration-200 shadow-sm"
            >
              {adminUser?.avatar ? (
                <img
                  src={adminUser.avatar}
                  alt="Admin"
                  className="w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-gray-700"
                />
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
                        <img
                          src={adminUser.avatar}
                          alt="Admin"
                          className="w-10 h-10 rounded-full object-cover"
                        />
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
                isRegistry
                  ? 'flex-1 min-h-0 overflow-hidden p-6 relative'
                  : 'flex-1 overflow-auto p-6'
              }
            >
              <AnimatePresence mode="wait">
                {activeTab === 'bookings' && (
                  <PageTransition tabKey="bookings">
                    <BookingsList searchTerm="" />
                  </PageTransition>
                )}
                {activeTab === 'calendar' && (
                  <PageTransition tabKey="calendar">
                    <CalendarView />
                  </PageTransition>
                )}
                {activeTab === 'listings' && (
                  <PageTransition tabKey="listings">
                    <CondosManagement />
                  </PageTransition>
                )}
                {activeTab === 'registry' && (
                  <PageTransition tabKey="registry">
                    <div className="absolute inset-6 min-h-0 flex flex-col">
                      <RegistryPage />
                    </div>
                  </PageTransition>
                )}
                {activeTab === 'housekeeping' && (
                  <PageTransition tabKey="housekeeping">
                    <HousekeepingManagement />
                  </PageTransition>
                )}
                {activeTab === 'accounting' && (
                  <PageTransition tabKey="accounting">
                    <AccountingManagement />
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