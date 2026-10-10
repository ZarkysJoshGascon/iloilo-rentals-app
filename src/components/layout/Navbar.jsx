// Navbar.jsx
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useTransform, useSpring, useMotionValue } from 'framer-motion'
import { useAuth } from "../../context/AuthContext";
import { navReveal } from '../../lib/navReveal'
import {
  Menu, X, User, Home, Phone, Info, FileText, Shield, LogOut, Building2, Palette,
} from 'lucide-react'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const rowRef = useRef(null)
  const [userKey, setUserKey] = useState(0)

  const desktopLinks = [
    { path: '/',                label: 'Home',            icon: Home },
    { path: '/list-property',   label: 'List Property',   icon: Building2 },
    { path: '/interior-design', label: 'Interior Design', icon: Palette },
    { path: '/about',           label: 'About',           icon: Info },
    { path: '/contact',         label: 'Contact',         icon: Phone },
    { path: '/terms',           label: 'Terms',           icon: FileText },
    { path: '/privacy',         label: 'Privacy',         icon: Shield },
  ]

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

  // ---- Desktop navbar morph ----
  // navReveal 0 (top of the homepage): the links sit spread evenly across a
  // wide row resting on a hairline, in dark text over the page.
  // navReveal 1 (scrolled, and every other page): the row has gathered into
  // the glass pill with light text. A spring smooths out wheel-step jumps.
  const reveal = useSpring(navReveal, { stiffness: 170, damping: 26, mass: 0.6 })
  const spreadWidth = useMotionValue(0)
  const pillWidth = useMotionValue(0)

  // The pill's natural width is the row's items packed with the normal gap;
  // the spread width is the page width with a margin. Items keep their own
  // widths at any row width, so measuring them is safe mid-morph.
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
      pillWidth.set(Math.ceil(packed))
      spreadWidth.set(Math.max(Math.ceil(packed), Math.min(window.innerWidth - 64, 1280)))
    }
    measure()
    window.addEventListener('resize', measure)
    document.fonts?.ready.then(measure)
    return () => window.removeEventListener('resize', measure)
  }, [user, pillWidth, spreadWidth])

  const navWidth = useTransform([reveal, spreadWidth, pillWidth], ([v, spread, pill]) => {
    if (!pill) return 'auto'
    const t = Math.min(1, Math.max(0, v))
    return spread + (pill - spread) * t
  })
  // The glass is fully in before the text turns light, so the links stay
  // readable throughout (dark on clear → dark on glass → light on glass).
  const glassOpacity = useTransform(reveal, [0.1, 0.55], [0, 1])
  const hairlineOpacity = useTransform(reveal, [0, 0.4], [1, 0])
  // A short colour window: mid-way greys are unreadable on the glass.
  const navFg = useTransform(reveal, [0.6, 0.68], ['#374151', 'rgba(255, 255, 255, 0.72)'])
  const navFgStrong = useTransform(reveal, [0.6, 0.68], ['#111827', '#ffffff'])
  const navLine = useTransform(reveal, [0.6, 0.68], ['rgba(17, 24, 39, 0.15)', 'rgba(255, 255, 255, 0.15)'])

  const userAvatar = user?.user_metadata?.avatar_url || null
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <>
      {/* DESKTOP - Top navbar: wide row on a hairline → glass pill */}
      <motion.div
        className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 z-50"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
      >
        <motion.div
          className="relative rounded-full"
          style={{ width: navWidth, '--nav-fg': navFg, '--nav-fg-strong': navFgStrong, '--nav-line': navLine }}
        >
          {/* Glass pill, fades in as the row gathers */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/30 backdrop-blur-xl rounded-full border border-white/10 shadow-lg shadow-black/10"
            style={{ opacity: glassOpacity }}
          />
          {/* Hairline the spread-out links rest on */}
          <motion.div
            aria-hidden="true"
            className="absolute left-4 right-4 bottom-0 h-px bg-gradient-to-r from-transparent via-gray-900/25 to-transparent"
            style={{ opacity: hairlineOpacity }}
          />

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
                  className={`relative flex items-center px-4 py-2.5 text-sm font-medium rounded-full transition-colors duration-200 whitespace-nowrap ${
                    active ? 'text-[#1a3a5c]' : 'text-[color:var(--nav-fg)] hover:text-[color:var(--nav-fg-strong)] hover:bg-white/5'
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
                    <span>{link.label}</span>
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
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[color:var(--nav-line)] flex items-center justify-center flex-shrink-0 ring-1 ring-[color:var(--nav-line)]">
                    {userAvatar ? (
                      <img key={`desktop-avatar-${userKey}`} src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                    ) : (
                      <User size={15} className="text-[color:var(--nav-fg-strong)]" />
                    )}
                  </div>
                  <button onClick={handleLogout} className="text-[color:var(--nav-fg)] hover:text-red-400 transition-colors p-2 rounded-full hover:bg-white/5" title="Sign Out">
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <Link to="/login">
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/5 rounded-full transition-colors text-[color:var(--nav-fg)] hover:text-[color:var(--nav-fg-strong)]">
                    <User size={15} /><span className="text-sm font-medium">Sign In</span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* MOBILE - Bottom pill navbar */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="relative bg-white/95 backdrop-blur-xl rounded-full border border-gray-200 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-0.5 px-1.5 py-1.5">
            <Link to="/" className="flex-shrink-0 pl-1 pr-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive('/') ? 'bg-[#2d568e]/10' : ''}`}>
                <img src="/Iloilo_rentals_img.png" alt="Home" className="w-5 h-5 object-contain" />
              </div>
            </Link>

            <Link
              to="/list-property"
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full transition-all duration-300 ${
                isActive('/list-property') ? 'bg-[#2d568e] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Building2 size={14} />
              <span>List</span>
            </Link>

            <Link
              to="/interior-design"
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full transition-all duration-300 ${
                isActive('/interior-design') ? 'bg-[#2d568e] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Palette size={14} />
              <span>Design</span>
            </Link>

            {user ? (
              <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600">
                <User size={14} />
                <span className="truncate max-w-[100px]">{userName}</span>
              </div>
            ) : (
              <Link
                to="/login"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full transition-all duration-300 ${
                  isActive('/login') ? 'bg-[#2d568e] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <User size={14} />
                <span>Sign In</span>
              </Link>
            )}

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all duration-300"
            >
              <Menu size={14} />
              <span>More</span>
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE - More menu sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[200] flex items-end justify-center md:hidden">
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
              className="relative w-full bg-white rounded-t-3xl shadow-2xl pb-safe"
            >
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-[#2d568e]">Menu</h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-3 max-h-[65vh] overflow-y-auto">
                {desktopLinks.map((link) => {
                  const Icon = link.icon
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                        isActive(link.path)
                          ? 'bg-[#2d568e]/10 text-[#2d568e]'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={18} />
                      {link.label}
                    </Link>
                  )
                })}

                <div className="pt-3 mt-3 border-t border-gray-100">
                  {user ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 px-4 py-2">
                        {userAvatar ? (
                          <img key={`mobile-avatar-${userKey}`} src={userAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#2d568e] flex items-center justify-center text-white text-sm font-semibold">
                            {userName?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{userName}</p>
                          <p className="text-xs text-gray-500">{user?.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors text-sm"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  ) : (
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#2d568e] text-white font-medium text-sm"
                    >
                      <User size={18} />
                      Sign In
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}