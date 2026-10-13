// src/components/admin/AdminSidebar.tsx
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  LogOut, ScrollText, Calendar, Users, Sparkles, FileText, TrendingUp, Menu, X, ArrowLeft,
  LayoutDashboard, Megaphone, Inbox, Palette,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useDebouncedRealtime } from '@/hooks/useDebouncedRealtime'
import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

export const SIDEBAR_COLLAPSED_WIDTH = 56
export const SIDEBAR_EXPANDED_WIDTH  = 224
export const SIDEBAR_PUSH_DELTA      = SIDEBAR_EXPANDED_WIDTH - SIDEBAR_COLLAPSED_WIDTH  // 168

export const SIDEBAR_SLIDE_MS        = 620
export const SIDEBAR_SLIDE_EASE      = 'cubic-bezier(0.32, 0.72, 0, 1)'

// Same height as the page header, so the brand row and the header share one line.
export const SIDEBAR_BRAND_HEIGHT    = 56

const PILL_SPRING = { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as const

const LABEL_EASE = [0.32, 0.72, 0, 1] as const
const LABEL_DURATION = 0.32
const LABEL_DELAY_WHEN_EXPANDING = 0.14

// Icons sit centred in the 56px rail: 18px padding + 20px icon box = centre at 28px.
const ROW_PADDING_LEFT = '18px'

const NAV_GROUPS = [
  {
    id: 'overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'properties',
    label: 'Properties',
    items: [
      { id: 'registry',   label: 'Registry',   icon: ScrollText },
      { id: 'contracts',  label: 'Contracts',  icon: FileText },
      { id: 'accounting', label: 'Accounting', icon: TrendingUp },
    ],
  },
  {
    id: 'stays',
    label: 'Stays',
    items: [
      { id: 'bookings',     label: 'Bookings',     icon: Calendar },
      { id: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
    ],
  },
  {
    id: 'leads',
    label: 'Leads',
    items: [
      { id: 'inquiries', label: 'Inquiries',       icon: Inbox },
      { id: 'interior',  label: 'Interior Design', icon: Palette },
      { id: 'campaigns', label: 'Campaigns',       icon: Megaphone },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'team', label: 'Team', icon: Users },
    ],
  },
]

const BADGE_HINTS = {
  contracts: 'contracts for renewal or ending within 30 days',
  inquiries: 'new property inquiries',
  interior: 'new design inquiries',
  housekeeping: 'cleanings waiting for review',
}

// Work waiting in each tab: new inquiries and cleanings to review.
function useNavBadges() {
  const [counts, setCounts] = useState({})

  const load = useCallback(async () => {
    const [inquiries, interior, housekeeping] = await Promise.all([
      supabase.from('property_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('interior_design_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('cleanings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    ])
    setCounts({
      inquiries: inquiries.error ? 0 : inquiries.count || 0,
      interior: interior.error ? 0 : interior.count || 0,
      housekeeping: housekeeping.error ? 0 : housekeeping.count || 0,
    })
  }, [])

  useEffect(() => { load() }, [load])

  useDebouncedRealtime({ table: 'property_inquiries', onChange: load, debounceMs: 2000 })
  useDebouncedRealtime({ table: 'interior_design_inquiries', onChange: load, debounceMs: 2000 })
  useDebouncedRealtime({ table: 'cleanings', onChange: load, debounceMs: 2000 })

  return counts
}

type BadgeProps = {
  count: any
  active: boolean
  className?: string
  style?: CSSProperties
}

function Badge({ count, active, className, style }: BadgeProps) {
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums leading-none',
        active
          ? 'bg-brand-solid text-white dark:bg-[#0a0a0a]'
          : 'bg-white text-brand dark:text-[#0a0a0a]',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'A'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

type AdminSidebarProps = {
  activeTab: string
  setActiveTab: (tab: any) => void
  collapsed: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  prefetch: any
  user: any
  onSignOut: () => Promise<void>
  contractAlertCount?: number
}

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  collapsed,
  onMouseEnter,
  onMouseLeave,
  prefetch,
  user,
  onSignOut,
  contractAlertCount = 0,
}: AdminSidebarProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { isDark } = useTheme()
  const badges = { ...useNavBadges(), contracts: contractAlertCount }

  const handleSignOut = async () => {
    if (onSignOut) {
      await onSignOut()
    } else {
      await signOut()
      navigate('/')
    }
    toast.success('Signed out')
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
  const sidebarBg = isDark ? '#0a0a0a' : '#225193'

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
        {/* Brand */}
        <div
          className="flex-shrink-0 flex items-center gap-3 border-b border-white/10"
          style={{ height: SIDEBAR_BRAND_HEIGHT, paddingLeft: 13 }}
        >
          <img
            src="/Iloilo_rentals_img.png"
            alt="Iloilo Rentals"
            className="w-[30px] h-[30px] flex-shrink-0 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
          />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="brand"
                initial={labelMotion.initial}
                animate={labelMotion.animate}
                exit={labelMotion.exit}
                className="min-w-0 leading-none whitespace-nowrap"
              >
                <p className="text-[14px] font-semibold text-white tracking-tight">Iloilo Rentals</p>
                <p className="text-[10.5px] font-medium text-white/60 mt-1">Management System</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="space-y-0.5">
              {group.label && (
                // Fixed height in both states, so the rows never shift when the bar opens.
                <div className="relative h-7" aria-hidden={collapsed}>
                  <span
                    className="absolute left-[20px] top-1/2 w-4 h-px bg-white/20 transition-opacity duration-200"
                    style={{ opacity: collapsed ? 1 : 0 }}
                  />
                  <span
                    className="absolute left-[20px] bottom-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45 whitespace-nowrap transition-opacity"
                    style={{
                      opacity: collapsed ? 0 : 1,
                      transitionDuration: collapsed ? '120ms' : '260ms',
                      transitionDelay: collapsed ? '0ms' : `${LABEL_DELAY_WHEN_EXPANDING * 1000}ms`,
                    }}
                  >
                    {group.label}
                  </span>
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                const count = badges[item.id] || 0
                const hint = count > 0 ? `${count} ${BADGE_HINTS[item.id]}` : null

                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => handlePrefetch(item.id)}
                    onFocus={() => handlePrefetch(item.id)}
                    onClick={() => setActiveTab(item.id)}
                    title={collapsed ? [item.label, hint].filter(Boolean).join(' · ') : hint || undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={[
                      'group relative flex items-center h-10 w-full text-left gap-3 pr-3',
                      'transition-colors duration-150',
                      isActive
                        ? 'text-brand dark:text-[#0a0a0a]'
                        : 'text-white/85 dark:text-white/70 hover:text-white',
                    ].join(' ')}
                    style={{ paddingLeft: ROW_PADDING_LEFT }}
                  >
                    {!isActive && (
                      <span
                        aria-hidden
                        className="absolute top-1 bottom-1 left-1.5 right-1.5 rounded-md pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-white/[0.08] ring-1 ring-inset ring-white/25"
                      />
                    )}

                    {isActive && (
                      <motion.div
                        layoutId="admin-sidebar-pill"
                        className="absolute top-1 bottom-1 left-1.5 right-1.5 rounded-md bg-white"
                        style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.18)' }}
                        transition={PILL_SPRING}
                      />
                    )}

                    <span className="relative z-10 flex-shrink-0 flex items-center justify-center w-5 h-5">
                      <Icon size={17} strokeWidth={1.9} />
                      {count > 0 && (
                        <Badge
                          count={count}
                          active={isActive}
                          className="absolute -top-2 -right-2.5 min-w-[16px] h-4 text-[9px] transition-opacity duration-150"
                          style={{ opacity: collapsed ? 1 : 0 }}
                        />
                      )}
                    </span>

                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          key="label"
                          initial={labelMotion.initial}
                          animate={labelMotion.animate}
                          exit={labelMotion.exit}
                          className="relative z-10 flex-1 min-w-0 flex items-center justify-between gap-2"
                        >
                          <span className="text-[13px] font-medium whitespace-nowrap truncate">{item.label}</span>
                          {count > 0 && <Badge count={count} active={isActive} />}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Signed-in user */}
        <div className="flex-shrink-0 border-t border-white/15 dark:border-white/[0.10] py-2.5">
          <div className="flex items-center gap-3 h-10 pr-2" style={{ paddingLeft: 14 }}>
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt=""
                className="w-7 h-7 flex-shrink-0 rounded-full object-cover ring-1 ring-white/30"
              />
            ) : (
              <span className="w-7 h-7 flex-shrink-0 rounded-full bg-white/15 ring-1 ring-white/25 flex items-center justify-center text-[11px] font-semibold text-white">
                {initialsOf(user?.name)}
              </span>
            )}

            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  key="user"
                  initial={labelMotion.initial}
                  animate={labelMotion.animate}
                  exit={labelMotion.exit}
                  className="flex-1 min-w-0 flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0 leading-none">
                    <p className="text-[12.5px] font-semibold text-white truncate">{user?.name || 'Admin'}</p>
                    <p className="text-[10.5px] text-white/55 truncate mt-1">{user?.email || 'Administrator'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    title="Sign out"
                    aria-label="Sign out"
                    className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 ring-1 ring-inset ring-transparent hover:ring-white/25 transition-colors"
                  >
                    <LogOut size={15} strokeWidth={1.9} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ── Phones ────────────────────────────────────────────────────────
// A bottom tab bar in the sidebar's blue with the day-to-day tabs, and a
// "More" sheet with every tab (grouped as in the sidebar), the account,
// Back to site and Sign out.

export const MOBILE_NAV_HEIGHT = 60
const MOBILE_PRIMARY = ['dashboard', 'bookings', 'housekeeping', 'inquiries']
const SHORT_LABELS = { housekeeping: 'Cleanings' }
const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

type AdminMobileNavProps = {
  activeTab: string
  setActiveTab: (tab: any) => void
  prefetch: any
  user: any
  onSignOut: () => Promise<void>
  contractAlertCount?: number
}

export function AdminMobileNav({ activeTab, setActiveTab, prefetch, user, onSignOut, contractAlertCount = 0 }: AdminMobileNavProps) {
  const navigate = useNavigate()
  const badges = { ...useNavBadges(), contracts: contractAlertCount }
  const [moreOpen, setMoreOpen] = useState(false)
  const primary = MOBILE_PRIMARY.map((id) => ALL_ITEMS.find((item) => item.id === id))
  const activeInMore = !MOBILE_PRIMARY.includes(activeTab)
  const moreBadge = ALL_ITEMS.some((item) => !MOBILE_PRIMARY.includes(item.id) && badges[item.id] > 0)

  useEffect(() => {
    if (!moreOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const go = (id) => {
    try { prefetch?.[id]?.() } catch { /* ignore */ }
    setActiveTab(id)
    setMoreOpen(false)
  }
  const signOut = async () => {
    setMoreOpen(false)
    await onSignOut()
    toast.success('Signed out')
  }

  const tabClass = (active) => cn(
    'relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-full text-[10.5px] font-medium transition-colors',
    active ? 'text-white' : 'text-white/65 active:text-white',
  )

  return (
    <>
      <nav
        aria-label="CRM sections"
        className="fixed inset-x-0 bottom-0 z-40 bg-brand-solid dark:bg-[#0f1115] border-t border-white/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch px-1" style={{ height: MOBILE_NAV_HEIGHT }}>
          {primary.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button key={id} type="button" onClick={() => go(id)} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                {active && <motion.span layoutId="crm-mobile-tab" className="absolute top-0 inset-x-4 h-[3px] rounded-b-full bg-white" transition={PILL_SPRING} />}
                <span className="relative">
                  <Icon size={20} strokeWidth={active ? 2.1 : 1.8} />
                  {badges[id] > 0 && <Badge count={badges[id]} active={false} className="absolute -top-2 -right-3 min-w-[16px] h-4 text-[9px]" />}
                </span>
                <span className="truncate max-w-full px-0.5">{SHORT_LABELS[id] || label}</span>
              </button>
            )
          })}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={tabClass(activeInMore)}>
            {activeInMore && <motion.span layoutId="crm-mobile-tab" className="absolute top-0 inset-x-4 h-[3px] rounded-b-full bg-white" transition={PILL_SPRING} />}
            <span className="relative">
              <Menu size={20} strokeWidth={activeInMore ? 2.1 : 1.8} />
              {moreBadge && <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-white" aria-label="Something is waiting" />}
            </span>
            <span className="truncate max-w-full px-0.5">{activeInMore ? ALL_ITEMS.find((i) => i.id === activeTab)?.label || 'More' : 'More'}</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="All sections">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="relative w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-[#15171c] text-foreground shadow-2xl"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="w-9 h-9 flex-shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="w-9 h-9 flex-shrink-0 rounded-full bg-brand-solid text-white flex items-center justify-center text-[12px] font-semibold">
                    {initialsOf(user?.name)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold truncate">{user?.name || 'Admin'}</p>
                  <p className="text-[12px] text-foreground/75 truncate">{user?.email || 'Administrator'}</p>
                </div>
                <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="flex-shrink-0 w-9 h-9 -mr-2 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                  <X size={18} />
                </button>
              </div>

              <div className="px-3 py-2">
                {NAV_GROUPS.map((group) => (
                  <div key={group.id} className="py-1">
                    {group.label && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/70">{group.label}</p>}
                    {group.items.map(({ id, label, icon: Icon }) => {
                      const active = activeTab === id
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => go(id)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'w-full flex items-center gap-3 h-12 px-3 rounded-xl text-left text-[14px] font-medium transition-colors',
                            active ? 'text-brand font-semibold' : 'text-foreground active:bg-black/[0.04] dark:active:bg-white/[0.06]',
                          )}
                        >
                          <Icon size={19} strokeWidth={1.8} className="flex-shrink-0" />
                          <span className="flex-1 truncate">{label}</span>
                          {badges[id] > 0 && (
                            <span className="text-[12px] font-semibold tabular-nums text-brand" title={BADGE_HINTS[id]}>{badges[id]} waiting</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>

              <div className="px-5 pt-2 border-t border-border flex items-center gap-3">
                <button type="button" onClick={() => navigate('/')} className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-border text-[13px] font-medium">
                  <ArrowLeft size={15} />
                  Back to site
                </button>
                <button type="button" onClick={signOut} className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-border text-[13px] font-medium text-red-600">
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
