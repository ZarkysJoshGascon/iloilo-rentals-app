import { useNavigate } from 'react-router-dom'
import { useAuth } from "../../context/AuthContext";
import {
  Users, CalendarDays, DoorOpen, LogOut, Building2,
  Paintbrush, LayoutDashboard
} from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

export default function AdminSidebar({ activeTab, setActiveTab, collapsed, onMouseEnter, onMouseLeave, style }) {
  const navigate = useNavigate()
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
    { id: 'housekeeping', label: 'Housekeeping', icon: Paintbrush },
    { id: 'accounting', label: 'Accounting', icon: LayoutDashboard },
  ]

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}   // width & position are set by the parent
      className="h-full bg-blue-50/70 dark:bg-gray-800/70 backdrop-blur-sm shadow-md flex flex-col transition-all duration-300 overflow-hidden rounded-tl-xl"
    >
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`relative w-full flex items-center gap-3 px-3 py-3 text-left transition-all duration-300 rounded-xl text-sm font-medium ${
              activeTab === item.id
                ? 'bg-[#2d568e] text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40'
            }`}
          >
            {activeTab === item.id && (
              <motion.div
                layoutId="activePill"
                className="absolute inset-0 bg-[#2d568e] rounded-xl shadow-md"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <item.icon size={20} className="relative z-10 flex-shrink-0" />
            {!collapsed && (
              <span className="relative z-10 whitespace-nowrap">{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-blue-100/50 dark:border-gray-700/50">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-gray-700/40 transition-colors text-sm font-medium"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  )
}