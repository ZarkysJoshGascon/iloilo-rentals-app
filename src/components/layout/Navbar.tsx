// Navbar.tsx
import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { Link, useNavigate, useLocation } from 'react-router'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import { useAuth } from "../../context/AuthContext";
import { useUserRole } from '@/hooks/useUserRole'
import {
  Menu, X, User, Home, Phone, Info, FileText, Shield, LogOut, Building2, Palette, LayoutDashboard,
  KeyRound, ChevronRight,
} from 'lucide-react'

// Mobile pill buttons, and the full-width buttons in the mobile menu.
const pillClass = (active) =>
  `flex items-center gap-1 px-2.5 max-[374px]:px-2 py-2.5 text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0 transition-all duration-300 ${
    active ? 'bg-[#2d568e] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
  }`
const sheetButton = 'w-full flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-[#2d568e] text-white font-medium text-sm'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const { role, isOwner } = useUserRole()
  // Admins get a CRM link in the navbar's account area (and in the mobile menu);
  // unit owners get a link to their owner portal.
  const isAdmin = !!user && (role === 'admin' || role === 'both')
  const showOwnerLink = !!user && isOwner
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const rowRef = useRef(null)
  const [userKey, setUserKey] = useState(0)

  // `main` links keep their label on laptop-width screens; the rest show only
  // their icon until the screen is wide enough for every label.
  const desktopLinks = [
    { path: '/',                label: 'Home',            icon: Home,      main: true },
    { path: '/list-property',   label: 'List Property',   icon: Building2, main: true },
    { path: '/interior-design', label: 'Interior Design', icon: Palette,   main: true },
    { path: '/about',           label: 'About',           icon: Info },
    { path: '/contact',         label: 'Contact',         icon: Phone },
    { path: '/terms',           label: 'Terms',           icon: FileText },
    { path: '/privacy',         label: 'Privacy',         icon: Shield },
  ]

  // The mobile menu lists the pages, with Terms and Privacy as small links under them.
  const legalPaths = ['/terms', '/privacy']
  const mobileLinks = desktopLinks.filter((l) => !legalPaths.includes(l.path))
  const legalLinks = desktopLinks.filter((l) => legalPaths.includes(l.path))
  const sheetDrag = useDragControls()

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileMenuOpen])

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    if (path === '/condos') return location.pathname === '/condos'
    return location.pathname.startsWith(path)
  }

  useEffect(() => {
    setUserKey(prev => prev + 1)
  }, [user])

  const handleLogout = async () => {
    await signOut()
    navigate('/')
    setMobileMenuOpen(false)
  }

  // ---- Desktop navbar ----
  // A wide frosted-white bar with the links spread evenly across it, in dark
  // text. It keeps the same look on every page and while scrolling.
  // Its width is the page width with a margin, but never narrower than the
  // links packed together.
  const [barWidth, setBarWidth] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current
      if (!row) return
      const items = [...row.children]
      const css = getComputedStyle(row)
      const packed =
        items.reduce((sum, el) => sum + el.offsetWidth, 0) +
        4 * (items.length - 1) +
        parseFloat(css.paddingLeft) + parseFloat(css.paddingRight)
      setBarWidth(Math.max(Math.ceil(packed), Math.min(window.innerWidth - 64, 1280)))
    }
    measure()
    window.addEventListener('resize', measure)
    document.fonts?.ready.then(measure)
    return () => window.removeEventListener('resize', measure)
  }, [user, isAdmin, showOwnerLink])

  const userAvatar = user?.user_metadata?.avatar_url || null
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <>
      {/* DESKTOP - Top navbar: wide frosted-white bar */}
      <motion.div
        className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 z-50"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
      >
        <div
          className="relative rounded-full bg-white/80 backdrop-blur-xl border border-gray-200/70 shadow-lg shadow-black/5"
          style={{ width: barWidth ?? 'auto', '--nav-fg': '#374151', '--nav-fg-strong': '#111827', '--nav-line': 'rgba(17, 24, 39, 0.15)' } as CSSProperties}
        >
          <div ref={rowRef} className="relative flex items-center justify-between gap-1 px-2 py-1.5">
            <Link to="/" className="flex-shrink-0 pl-1.5 pr-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-105 transition-transform">
                <img src="/Iloilo_rentals_img.png" alt="IR" className="w-7 h-7 object-contain" />
              </div>
            </Link>

            {desktopLinks.map((link) => {
              const Icon = link.icon
              const active = isActive(link.path)
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  title={link.label}
                  aria-label={link.label}
                  className={`relative flex items-center px-3 xl:px-4 py-2.5 text-sm font-medium rounded-full transition-colors duration-200 whitespace-nowrap ${
                    active ? 'text-[#1a3a5c]' : 'text-[color:var(--nav-fg)] hover:text-[color:var(--nav-fg-strong)] hover:bg-gray-900/5'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="desktop-nav-active"
                      className="absolute inset-0 rounded-full bg-gradient-to-b from-white/95 via-white to-white/90 shadow-lg"
                      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    <Icon size={15} />
                    {/* Narrower screens show the icon only (the name is in the tooltip). */}
                    <span className={link.main ? 'hidden lg:inline' : 'hidden xl:inline'}>{link.label}</span>
                  </span>
                </Link>
              )
            })}

            <div className="px-2">
              <div className="w-px h-7 bg-[color:var(--nav-line)]" />
            </div>

            <div className="pr-2">
              {user ? (
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Link
                      to="/admin"
                      title="Open the admin CRM"
                      aria-label="CRM"
                      className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors text-[color:var(--nav-fg)] hover:text-[color:var(--nav-fg-strong)] hover:bg-gray-900/5"
                    >
                      <LayoutDashboard size={15} />
                      <span className="hidden lg:inline">CRM</span>
                    </Link>
                  )}
                  {showOwnerLink && (
                    <Link
                      to="/owner"
                      title="Your units and earnings"
                      aria-label="My units"
                      className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-colors text-[color:var(--nav-fg)] hover:text-[color:var(--nav-fg-strong)] hover:bg-gray-900/5"
                    >
                      <KeyRound size={15} />
                      <span className="hidden lg:inline">My units</span>
                    </Link>
                  )}
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[color:var(--nav-line)] flex items-center justify-center flex-shrink-0 ring-1 ring-[color:var(--nav-line)]">
                    {userAvatar ? (
                      <img key={`desktop-avatar-${userKey}`} src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                    ) : (
                      <User size={15} className="text-[color:var(--nav-fg-strong)]" />
                    )}
                  </div>
                  <button onClick={handleLogout} className="text-[color:var(--nav-fg)] hover:text-red-400 transition-colors p-2 rounded-full hover:bg-gray-900/5" title="Sign Out">
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <Link to="/login">
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-900/5 rounded-full transition-colors text-[color:var(--nav-fg)] hover:text-[color:var(--nav-fg-strong)]">
                    <User size={15} /><span className="text-sm font-medium">Sign In</span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* MOBILE - Bottom pill navbar. The fourth slot is the signed-in person's
          own place: the CRM for admins, their units for owners, else the menu. */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-[calc(100vw-16px)]" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="relative bg-white/95 backdrop-blur-xl rounded-full border border-gray-200 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-0.5 px-1.5 py-1.5">
            <Link to="/" aria-label="Home" className="flex-shrink-0 pl-0.5 pr-0.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isActive('/') ? 'bg-[#2d568e]/10' : ''}`}>
                <img src="/Iloilo_rentals_img.png" alt="" className="w-6 h-6 object-contain" />
              </div>
            </Link>

            <Link to="/list-property" className={pillClass(isActive('/list-property'))}>
              <Building2 size={15} />
              <span>List</span>
            </Link>

            <Link to="/interior-design" className={pillClass(isActive('/interior-design'))}>
              <Palette size={15} />
              <span>Design</span>
            </Link>

            {!user ? (
              <Link to="/login" className={pillClass(isActive('/login'))}>
                <User size={15} />
                <span>Sign In</span>
              </Link>
            ) : isAdmin ? (
              <Link to="/admin" className={pillClass(false)}>
                <LayoutDashboard size={15} />
                <span>CRM</span>
              </Link>
            ) : showOwnerLink ? (
              <Link to="/owner" className={pillClass(false)}>
                <KeyRound size={15} />
                <span>My units</span>
              </Link>
            ) : (
              <button type="button" onClick={() => setMobileMenuOpen(true)} className={pillClass(false)}>
                <User size={15} />
                <span>Account</span>
              </button>
            )}

            <button type="button" onClick={() => setMobileMenuOpen(true)} className={pillClass(false)} aria-haspopup="dialog" aria-expanded={mobileMenuOpen}>
              <Menu size={15} />
              <span>More</span>
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE - Menu sheet: the account and its shortcuts first, so signing
          out never needs a scroll, then the pages. */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[200] flex items-end justify-center md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              drag="y"
              dragControls={sheetDrag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_e, info) => { if (info.offset.y > 80 || info.velocity.y > 500) setMobileMenuOpen(false) }}
              className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[88vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
            >
              {/* Drag the handle down to close. */}
              <div className="flex justify-center pt-2.5 pb-2 touch-none cursor-grab" aria-hidden onPointerDown={(e) => sheetDrag.start(e)}>
                <span className="w-10 h-1 rounded-full bg-gray-300" />
              </div>

              {/* Account */}
              <div className="flex items-center gap-3 px-5 py-3">
                {user ? (
                  <>
                    {userAvatar ? (
                      <img key={`mobile-avatar-${userKey}`} src={userAvatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#2d568e] flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                        {userName?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </>
                ) : (
                  <p className="flex-1 text-base font-bold text-[#2d568e]">Menu</p>
                )}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex-shrink-0 p-2 -mr-2 rounded-full text-gray-500 hover:bg-gray-100"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Shortcuts */}
              <div className={`px-5 pb-3 grid gap-2 ${isAdmin && showOwnerLink ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {!user && (
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className={sheetButton}>
                    <User size={16} />
                    Sign In
                  </Link>
                )}
                {isAdmin && (
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className={sheetButton}>
                    <LayoutDashboard size={16} />
                    Open CRM
                  </Link>
                )}
                {showOwnerLink && (
                  <Link to="/owner" onClick={() => setMobileMenuOpen(false)} className={sheetButton}>
                    <KeyRound size={16} />
                    My units
                  </Link>
                )}
              </div>

              {/* Pages */}
              <nav className="px-3 pt-2 border-t border-gray-100">
                {mobileLinks.map((link) => {
                  const Icon = link.icon
                  const active = isActive(link.path)
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 h-12 px-3 rounded-xl text-sm font-medium transition-colors ${
                        active ? 'bg-[#2d568e]/10 text-[#2d568e]' : 'text-gray-700 active:bg-gray-50'
                      }`}
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      <span className="flex-1">{link.label}</span>
                      <ChevronRight size={16} className={active ? 'text-[#2d568e]' : 'text-gray-400'} />
                    </Link>
                  )
                })}
              </nav>

              <div className="flex items-center justify-center gap-5 px-5 pt-3 text-xs font-medium text-gray-500">
                {legalLinks.map((link) => (
                  <Link key={link.path} to={link.path} onClick={() => setMobileMenuOpen(false)} className={`py-2 ${isActive(link.path) ? 'text-[#2d568e]' : ''}`}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}