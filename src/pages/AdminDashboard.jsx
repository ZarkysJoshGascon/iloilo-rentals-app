import { useState, useEffect, useCallback } from 'react'
import LeadsList from '../components/LeadsList'
import LeadDetail from '../components/LeadDetail'
import BookingsList from '../components/BookingsList'
import CalendarView from '../components/CalendarView'
import AdminSidebar from '../components/AdminSidebar'
import { Moon, Sun, Users, CalendarDays, DoorOpen, LayoutDashboard, LogOut } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function AdminDashboard() {
  const { user, signOut } = useAuth()
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [activeTab, setActiveTab] = useState('bookings')
  const [adminUser, setAdminUser] = useState(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const fetchAdminProfile = useCallback(() => {
    if (user) {
      setAdminUser({
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin',
        email: user.email,
        avatar: user.user_metadata?.avatar_url || null
      })
    }
  }, [user])

  useEffect(() => {
    fetchAdminProfile()
  }, [fetchAdminProfile])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  const getTabTitle = () => {
    switch(activeTab) {
      case 'leads': return 'Leads Management'
      case 'bookings': return 'Bookings Management'
      case 'calendar': return 'Calendar'
      default: return 'Dashboard'
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#d4deec] dark:bg-gray-900 overflow-hidden transition-colors duration-300">
      {/* Top bar */}
      <div className="flex-shrink-0 ml-[3mm] py-3 flex justify-between items-center pr-6">
        <div>
          <h1 className="text-xl font-bold text-[#2d568e] dark:text-blue-400 tracking-tight">
            Iloilo Rentals Management System
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Manage your leads, bookings, and property availability
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-all duration-200 shadow-sm hover:shadow-md"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
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
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">{adminUser?.name || 'Admin'}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Administrator</p>
              </div>
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)}></div>
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
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{adminUser?.name || 'Admin'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{adminUser?.email || 'admin@iloilorentals.com'}</p>
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

      {/* Card container */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-shrink-0 z-0 ml-[3mm]">
          <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        <div className="flex-1 -ml-8 z-10 flex flex-col min-w-0">
          <div className="bg-white dark:bg-gray-800 rounded-tl-xl shadow-2xl overflow-hidden flex flex-col flex-1 transition-colors duration-300">
            
            {/* Title Header - stays fixed */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center shadow-md">
                {activeTab === 'leads' && <Users size={20} className="text-white" />}
                {activeTab === 'bookings' && <CalendarDays size={20} className="text-white" />}
                {activeTab === 'calendar' && <DoorOpen size={20} className="text-white" />}
                {activeTab !== 'leads' && activeTab !== 'bookings' && activeTab !== 'calendar' && <LayoutDashboard size={20} className="text-white" />}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{getTabTitle()}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activeTab === 'bookings' && 'Review and manage all booking requests'}
                  {activeTab === 'leads' && 'Track and manage potential customers'}
                  {activeTab === 'calendar' && 'View bookings and events calendar'}
                </p>
              </div>
            </div>

            {/* Content area - scrollable */}
            <div className="flex-1 overflow-auto p-6">
              {activeTab === 'leads' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1">
                    <LeadsList onSelectLead={setSelectedLeadId} selectedId={selectedLeadId} searchTerm="" />
                  </div>
                  <div className="lg:col-span-2">
                    {selectedLeadId ? (
                      <LeadDetail leadId={selectedLeadId} />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center py-20">
                        <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
                          <Users size={32} className="text-gray-400 dark:text-gray-500" />
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Select a lead to view details</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'bookings' && <BookingsList searchTerm="" />}

              {activeTab === 'calendar' && <CalendarView />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}