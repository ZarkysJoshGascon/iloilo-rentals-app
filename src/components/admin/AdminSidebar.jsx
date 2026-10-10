// src/components/admin/AdminSidebar.jsx
import { useNavigate } from 'react-router-dom'
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  LogOut, ScrollText, Calendar, Users, Sparkles, FileText, TrendingUp,
  LayoutDashboard, Megaphone, Inbox, Palette,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

export const SIDEBAR_COLLAPSED_WIDTH = 56
export const SIDEBAR_EXPANDED_WIDTH  = 224
export const SIDEBAR_PUSH_DELTA      = SIDEBAR_EXPANDED_WIDTH - SIDEBAR_COLLAPSED_WIDTH  // 168

export const SIDEBAR_SLIDE_MS        = 620
export const SIDEBAR_SLIDE_EASE      = 'cubic-bezier(0.32, 0.72, 0, 1)'

const PILL_SPRING = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 }

const LABEL_EASE = [0.32, 0.72, 0, 1]
const LABEL_DURATION = 0.32
const LABEL_DELAY_WHEN_EXPANDING = 0.14

const ROW_PADDING_LEFT = '18px'

const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'registry',     label: 'Registry',        icon: ScrollText },
  { id: 'contracts',    label: 'Contracts',       icon: FileText },
  { id: 'accounting',   label: 'Accounting',      icon: TrendingUp },
  { id: 'bookings',     label: 'Bookings',        icon: Calendar },
  { id: 'housekeeping', label: 'Housekeeping',    icon: Sparkles },
  { id: 'inquiries',    label: 'Inquiries',       icon: Inbox },
  { id: 'interior',     label: 'Interior Design', icon: Palette },
  { id: 'campaigns',    label: 'Campaigns',       icon: Megaphone },
  { id: 'team',         label: 'Team',            icon: Users },
]

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  collapsed,
  onMouseEnter,
  onMouseLeave,
  prefetch,
}) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { isDark } = useTheme()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate('/')
  }

  const handlePrefetch = (id) => {
    if (!prefetch || !prefetch[id]) return
    try { prefetch[id]() } catch { /* ignore */ }
  }

  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH

  const labelMotion = {
    initial: { opacity: 0, x: -14 },
    animate: {
      opacity: 1,
      x: 0,
      transition: { duration: LABEL_DURATION, ease: LABEL_EASE, delay: LABEL_DELAY_WHEN_EXPANDING },
    },
    exit: {
      opacity: 0,
      x: -10,
      transition: { duration: 0.16, ease: LABEL_EASE },
    },
  }

  // Neutral dark in dark mode — no blue tint.
  const sidebarBg = isDark ? '#0a0a0a' : '#2d568e'

  return (
    <aside
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed top-0 left-0 h-full z-30 overflow-hidden"
      style={{
        width,
        backgroundColor: sidebarBg,
        transition: `width ${SIDEBAR_SLIDE_MS}ms ${SIDEBAR_SLIDE_EASE}, background-color 300ms ease`,
        willChange: 'width',
      }}
    >
      <div className="relative z-10 h-full flex flex-col">
        <div className="flex-shrink-0 h-3" />

        <nav className="flex-1 min-h-0 overflow-y-auto py-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => handlePrefetch(item.id)}
                onFocus={() => handlePrefetch(item.id)}
                onClick={() => setActiveTab(item.id)}
                title={collapsed ? item.label : undefined}
                className={[
                  'group relative flex items-center h-10 w-full text-left gap-3 pr-3',
                  'transition-colors duration-150',
                  isActive
                    ? 'text-[#2d568e] dark:text-[#0a0a0a]'
                    : 'text-white/85 dark:text-white/70 hover:text-white',
                ].join(' ')}
                style={{ paddingLeft: ROW_PADDING_LEFT }}
              >
                {!isActive && (
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 left-1 right-1 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 ring-1 ring-inset ring-white/70 dark:ring-white/25"
                  />
                )}

                {isActive && (
                  <motion.div
                    layoutId="admin-sidebar-pill"
                    className="absolute top-1 bottom-1 left-1 right-1 rounded-lg bg-white"
                    style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.12)' }}
                    transition={PILL_SPRING}
                  />
                )}

                <span className="relative z-10 flex-shrink-0 flex items-center justify-center w-5 h-5">
                  <Icon size={17} strokeWidth={1.9} />
                </span>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      key="label"
                      initial={labelMotion.initial}
                      animate={labelMotion.animate}
                      exit={labelMotion.exit}
                      className="relative z-10 text-[13px] font-medium whitespace-nowrap truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )
          })}
        </nav>

        <div className="flex-shrink-0 py-2 border-t border-white/15 dark:border-white/[0.10]">
          <button
            type="button"
            onClick={handleSignOut}
            title={collapsed ? 'Sign Out' : undefined}
            className="group relative flex items-center h-10 w-full text-left gap-3 pr-3 transition-colors duration-150 text-white/85 dark:text-white/70 hover:text-white"
            style={{ paddingLeft: ROW_PADDING_LEFT }}
          >
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-1 right-1 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 ring-1 ring-inset ring-white/70 dark:ring-white/25"
            />
            <span className="relative flex-shrink-0 flex items-center justify-center w-5 h-5">
              <LogOut size={16} strokeWidth={1.9} />
            </span>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="signout-label"
                  initial={labelMotion.initial}
                  animate={labelMotion.animate}
                  exit={labelMotion.exit}
                  className="relative text-[13px] font-medium whitespace-nowrap"
                >
                  Sign Out
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </aside>
  )
}