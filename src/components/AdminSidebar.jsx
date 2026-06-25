import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { 
  Users, CalendarDays, DoorOpen, LogOut, Building2, AlertTriangle,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Paintbrush } from 'lucide-react'

export default function AdminSidebar({ activeTab, setActiveTab }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const { signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/')
  }

  const navItems = [
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'listings', label: 'Listings', icon: Building2 },
    { id: 'calendar', label: 'Calendar', icon: DoorOpen },
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'housekeeping', label: 'Housekeeping', icon: Paintbrush }
  ]

  return (
    <div className={`bg-blue-50/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-tl-xl shadow-md flex flex-col h-full transition-all duration-300 ${collapsed ? 'w-20' : 'w-56'}`}>
      {/* Collapse button */}
      <div className="flex justify-end p-4 border-b border-blue-100/50 dark:border-gray-700/50">
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 relative">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`relative w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-300 rounded-xl text-sm font-medium ${
              activeTab === item.id
                ? 'text-[#2d568e] dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40'
            }`}
          >
            {activeTab === item.id && (
              <motion.div
                layoutId="activePill"
                className="absolute inset-0 bg-[#2d568e]/10 dark:bg-blue-900/30 rounded-xl border border-[#2d568e]/20 dark:border-blue-700/30"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <item.icon size={20} className="relative z-10" />
            {!collapsed && <span className="relative z-10">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-blue-100/50 dark:border-gray-700/50">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-gray-700/40 transition-colors text-sm font-medium"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  )
}