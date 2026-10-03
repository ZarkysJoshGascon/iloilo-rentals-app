import { useNavigate } from 'react-router-dom'
import { useAuth } from "../../context/AuthContext";
import {
  LogOut, ScrollText, Calendar, Users, Sparkles, FileText, TrendingUp,
  LayoutDashboard,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

// ============================================================
// MOTION + THEME CONSTANTS
// ============================================================
const BRAND = '#2d568e'

const SHELL_EASE = [0.4, 0, 0.2, 1]

const LABEL_EXPAND_DELAY_S = 0.08
const LABEL_EXPAND_DURATION_S = 0.18
const LABEL_COLLAPSE_DURATION_S = 0.10

const PILL_SPRING = { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 }

export default function AdminSidebar({ activeTab, setActiveTab, collapsed, onMouseEnter, onMouseLeave, style }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/')
  }

  const navItems = [
    { id: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'registry',     label: 'Registry',     icon: ScrollText },
    { id: 'contracts',    label: 'Contracts',    icon: FileText },
    { id: 'accounting',   label: 'Accounting',   icon: TrendingUp },
    { id: 'bookings',     label: 'Bookings',     icon: Calendar },
    { id: 'team',         label: 'Team',         icon: Users },
    { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
  ]

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className="h-full bg-blue-50/70 dark:bg-gray-800/70 backdrop-blur-sm shadow-md flex flex-col overflow-hidden rounded-tl-xl"
    >
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`group relative w-full flex items-center gap-3 px-3 py-3 text-left rounded-xl text-sm font-medium ${
                isActive
                  ? 'text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-[#2d568e] dark:hover:text-blue-300'
              }`}
            >
              {/* Hover ring — brand color, drawn as an inset outline.
                  Uses ::before via a pseudo-like span so the ring sits
                  *inside* the rounded-xl shape and doesn't affect layout. */}
              {!isActive && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-xl pointer-events-none
                    opacity-0 group-hover:opacity-100 transition-opacity duration-150
                    ring-1 ring-inset"
                  style={{ '--tw-ring-color': BRAND }}
                />
              )}

              {/* Active pill — springs between rows */}
              {isActive && (
                <motion.div
                  layoutId="activePill"
                  className="absolute inset-0 bg-[#2d568e] rounded-xl shadow-md"
                  transition={PILL_SPRING}
                />
              )}

              {/* Icon — subtle scale on hover */}
              <motion.span
                className="relative z-10 flex-shrink-0 flex items-center justify-center"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <Icon size={20} />
              </motion.span>

              {/* Label */}
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6, transition: { duration: LABEL_COLLAPSE_DURATION_S } }}
                    transition={{
                      duration: LABEL_EXPAND_DURATION_S,
                      delay: LABEL_EXPAND_DELAY_S,
                      ease: SHELL_EASE,
                    }}
                    className="relative z-10 whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </nav>

      <div className="p-3 border-t border-blue-100/50 dark:border-gray-700/50">
        <button
          onClick={handleSignOut}
          className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-sm font-medium"
        >
          {/* Hover ring for sign-out — red instead of brand blue, since
              it's a destructive-ish action */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-xl pointer-events-none
              opacity-0 group-hover:opacity-100 transition-opacity duration-150
              ring-1 ring-inset ring-red-400/60 dark:ring-red-400/40"
          />

          <LogOut size={18} className="relative z-10 flex-shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="signout-label"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6, transition: { duration: LABEL_COLLAPSE_DURATION_S } }}
                transition={{
                  duration: LABEL_EXPAND_DURATION_S,
                  delay: LABEL_EXPAND_DELAY_S,
                  ease: SHELL_EASE,
                }}
                className="relative z-10 whitespace-nowrap"
              >
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  )
}