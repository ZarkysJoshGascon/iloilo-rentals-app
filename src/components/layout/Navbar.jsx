// Navbar.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from "../../context/AuthContext";
import { Menu, X, User, Home, Phone, Info, FileText, Shield, LogOut } from 'lucide-react'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const [userKey, setUserKey] = useState(0)

  const desktopLinks = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/about', label: 'About', icon: Info },
    { path: '/contact', label: 'Contact', icon: Phone },
    { path: '/terms', label: 'Terms', icon: FileText },
    { path: '/privacy', label: 'Privacy', icon: Shield },
  ]

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    if (path === '/condos') return location.pathname === '/condos'
    return location.pathname.startsWith(path)
  }

  useEffect(() => {
    if (!navRef.current) return
    const activeLink = navRef.current.querySelector('[data-active="true"]')
    if (activeLink) {
      const navRect = navRef.current.getBoundingClientRect()
      const linkRect = activeLink.getBoundingClientRect()
      setIndicatorStyle({ left: linkRect.left - navRect.left, width: linkRect.width })
    } else {
      setIndicatorStyle({ left: 0, width: 0 })
    }
  }, [location.pathname, user])

  useEffect(() => {
    setUserKey(prev => prev + 1)
  }, [user])

  const handleLogout = async () => {
    await signOut()
    navigate('/')
    setMobileMenuOpen(false)
  }

  const userAvatar = user?.user_metadata?.avatar_url || null
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <>
      {/* DESKTOP - Top pill navbar */}
      <motion.div
        className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 z-50"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
      >
        <div className="relative bg-black/30 backdrop-blur-xl rounded-full border border-white/10 shadow-lg shadow-black/10">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <Link to="/" className="flex-shrink-0 pl-1.5 pr-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-105 transition-transform">
                <img src="/Iloilo_rentals_img.png" alt="IR" className="w-7 h-7 object-contain" />
              </div>
            </Link>

            <div ref={navRef} className="relative flex items-center gap-1">
              <motion.div
                className="absolute top-0.5 h-[calc(100%-4px)] bg-gradient-to-b from-white/95 via-white to-white/90 rounded-full shadow-lg z-0"
                animate={{ left: indicatorStyle.left, width: indicatorStyle.width }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
              {desktopLinks.map((link) => {
                const Icon = link.icon
                const active = isActive(link.path)
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    data-active={active}
                    className={`relative z-10 flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all duration-300 whitespace-nowrap ${
                      active ? 'text-[#1a3a5c]' : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="w-px h-7 bg-white/15 mx-2" />

            <div className="pr-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
                    {userAvatar ? (
                      <img key={`desktop-avatar-${userKey}`} src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                    ) : (
                      <User size={15} className="text-white" />
                    )}
                  </div>
                  <button onClick={handleLogout} className="text-white/50 hover:text-red-300 transition-colors p-2 rounded-full hover:bg-white/5" title="Sign Out">
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <Link to="/login">
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/5 rounded-full transition-colors">
                    <User size={15} className="text-white/70" /><span className="text-sm font-medium text-white/70">Sign In</span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
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