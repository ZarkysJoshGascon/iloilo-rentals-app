import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { 
  Users, CalendarDays, DoorOpen, LogOut,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminSidebar({ activeTab, setActiveTab }) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    toast.success('Signed out')
    navigate('/')
  }

  const navItems = [
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'calendar', label: 'Calendar', icon: DoorOpen },
  ]

  return (
    <div className={`bg-blue-50/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-tl-xl shadow-md flex flex-col h-full transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
      {/* Collapse button only */}
      <div className="flex justify-end p-4 border-b border-blue-100/50 dark:border-gray-700/50">
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-200 mx-1 ${
              activeTab === item.id
                ? 'bg-[#2d568e] text-white rounded-md shadow-md'
                : 'text-gray-600 dark:text-gray-300 hover:bg-white/30 dark:hover:bg-gray-700/30 rounded-md'
            }`}
          >
            <item.icon size={20} />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer actions */}
      <div className="p-4 border-t border-blue-100/50 dark:border-gray-700/50">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-white/30 dark:hover:bg-gray-700/30 transition-colors"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  )
}