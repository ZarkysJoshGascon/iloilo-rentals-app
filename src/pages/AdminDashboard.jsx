import { useState, useEffect, useCallback } from 'react'
import LeadsList from '../components/LeadsList'
import LeadDetail from '../components/LeadDetail'
import BookingsList from '../components/BookingsList'
import CalendarView from '../components/CalendarView'
import AdminListings from '../components/AdminListings'
import AdminHousekeeping from '../components/AdminHousekeeping'
import AdminSidebar from '../components/AdminSidebar'
import { Moon, Sun, Users, CalendarDays, DoorOpen, LayoutDashboard, LogOut, Building2, Paintbrush } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

function BookingsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between"><div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-12" /><div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded" /></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mt-2" />
          </div>
        ))}
      </div>
      <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-96" />
    </div>
  )
}

function LeadsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />)}
      </div>
      <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-96" />
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 h-full animate-pulse">
      <div className="h-16 bg-gray-100 dark:bg-gray-700/50 rounded-t-xl border-b border-gray-200 dark:border-gray-600" />
      <div className="p-4 space-y-3">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex gap-3">
            <div className="w-[200px] h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0" />
            <div className="flex-1 flex gap-1">{[1,2,3,4,5,6,7,8,9,10].map(j => <div key={j} className="flex-1 h-16 bg-gray-50 dark:bg-gray-700/30 rounded" />)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ListingsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-72" />)}</div>
    </div>
  )
}

function HousekeepingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-24" />)}
      </div>
      <div className="flex-1 flex gap-4">
        <div className="w-72 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-64" />
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-64" />
      </div>
    </div>
  )
}

function PageTransition({ children, tabKey }) {
  return (
    <motion.div key={tabKey} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth()
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [activeTab, setActiveTab] = useState('bookings')
  const [adminUser, setAdminUser] = useState(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const fetchAdminProfile = useCallback(() => {
    if (user) setAdminUser({ name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin', email: user.email, avatar: user.user_metadata?.avatar_url || null })
  }, [user])

  useEffect(() => { fetchAdminProfile() }, [fetchAdminProfile])

  useEffect(() => {
    const handleNavigateToBooking = (e) => { handleTabChange('bookings'); sessionStorage.setItem('highlightBooking', e.detail.bookingId) }
    const handleNavigateToListing = (e) => { handleTabChange('listings'); sessionStorage.setItem('highlightCondo', e.detail.condoId) }
    window.addEventListener('navigateToBooking', handleNavigateToBooking)
    window.addEventListener('navigateToListing', handleNavigateToListing)
    return () => {
      window.removeEventListener('navigateToBooking', handleNavigateToBooking)
      window.removeEventListener('navigateToListing', handleNavigateToListing)
    }
  }, [])

  const handleTabChange = (tab) => { setIsTransitioning(true); setActiveTab(tab); setTimeout(() => setIsTransitioning(false), 300) }
  const handleSignOut = async () => { await signOut(); navigate('/') }

  const tabIcons = { leads: Users, bookings: CalendarDays, calendar: DoorOpen, listings: Building2, housekeeping: Paintbrush }
  const tabTitles = { leads: 'Leads Management', bookings: 'Bookings Management', calendar: 'Calendar', listings: 'Listings Management', housekeeping: 'Housekeeping' }
  const Icon = tabIcons[activeTab] || LayoutDashboard

  return (
    <div className="h-screen flex flex-col bg-[#d4deec] dark:bg-gray-900 overflow-hidden transition-colors duration-300">
      <div className="flex-shrink-0 ml-[3mm] py-3 flex justify-between items-center pr-6">
        <div><h1 className="text-xl font-bold text-[#2d568e] dark:text-blue-400 tracking-tight">Iloilo Rentals Management System</h1></div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-all duration-200 shadow-sm hover:shadow-md" title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-gray-600" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 transition-all duration-200 shadow-sm">
              {adminUser?.avatar ? <img src={adminUser.avatar} alt="Admin" className="w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-gray-700" /> : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center text-white text-xs font-semibold ring-2 ring-white dark:ring-gray-700">{adminUser?.name?.charAt(0)?.toUpperCase() || 'A'}</div>}
              <div className="hidden sm:block text-left"><p className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">{adminUser?.name || 'Admin'}</p><p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Administrator</p></div>
            </button>
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)}></div>
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      {adminUser?.avatar ? <img src={adminUser.avatar} alt="Admin" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center text-white font-semibold">{adminUser?.name?.charAt(0)?.toUpperCase() || 'A'}</div>}
                      <div><p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{adminUser?.name || 'Admin'}</p><p className="text-xs text-gray-500 dark:text-gray-400">{adminUser?.email || 'admin@iloilorentals.com'}</p></div>
                    </div>
                  </div>
                  <div className="p-2"><button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><LogOut size={16} /> Sign Out</button></div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="flex-shrink-0 z-0 ml-[3mm]"><AdminSidebar activeTab={activeTab} setActiveTab={handleTabChange} /></div>
        <div className="flex-1 -ml-8 z-10 flex flex-col min-w-0">
          <div className="bg-white dark:bg-gray-800 rounded-tl-xl shadow-2xl overflow-hidden flex flex-col flex-1 transition-colors duration-300">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-3 flex-shrink-0">
              <Icon size={22} className="text-[#2d568e] dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{tabTitles[activeTab] || 'Dashboard'}</h2>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <AnimatePresence mode="wait">
                {activeTab === 'leads' && <PageTransition tabKey="leads">{isTransitioning ? <LeadsSkeleton /> : <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-1"><LeadsList onSelectLead={setSelectedLeadId} selectedId={selectedLeadId} searchTerm="" /></div><div className="lg:col-span-2">{selectedLeadId ? <LeadDetail leadId={selectedLeadId} /> : <div className="flex flex-col items-center justify-center text-center py-20"><div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4"><Users size={32} className="text-gray-400 dark:text-gray-500" /></div><p className="text-gray-500 dark:text-gray-400 text-sm">Select a lead to view details</p></div>}</div></div>}</PageTransition>}
                {activeTab === 'bookings' && <PageTransition tabKey="bookings">{isTransitioning ? <BookingsSkeleton /> : <BookingsList searchTerm="" />}</PageTransition>}
                {activeTab === 'calendar' && <PageTransition tabKey="calendar">{isTransitioning ? <CalendarSkeleton /> : <CalendarView />}</PageTransition>}
                {activeTab === 'listings' && <PageTransition tabKey="listings">{isTransitioning ? <ListingsSkeleton /> : <AdminListings />}</PageTransition>}
                {activeTab === 'housekeeping' && <PageTransition tabKey="housekeeping">{isTransitioning ? <HousekeepingSkeleton /> : <AdminHousekeeping />}</PageTransition>}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}