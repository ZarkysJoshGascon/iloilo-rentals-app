import { supabase } from '../lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, CalendarDays, DoorOpen, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminSidebar({ activeTab, setActiveTab }) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    toast.success('Signed out')
    navigate('/')
  }

  const navItems = [
    { id: 'leads', label: 'Leads & CRM', icon: Users },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'availability', label: 'Condo Availability', icon: DoorOpen },
  ]

  return (
    <div className="w-64 bg-[#2d568e] text-white flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-white/20">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={24} />
          <h1 className="text-xl font-bold">Admin CRM</h1>
        </div>
      </div>

      <nav className="flex-1 py-6">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
              activeTab === item.id
                ? 'bg-white/20 border-l-4 border-white'
                : 'hover:bg-white/10'
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/20">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  )
}