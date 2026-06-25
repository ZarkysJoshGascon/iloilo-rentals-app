import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import { Menu, X, User, Globe, Home, Building, Calendar, Phone, Info, FileText, Shield, LogOut } from 'lucide-react'

const CURRENCIES = {
  PHP: { symbol: '₱', name: 'PHP' },
  USD: { symbol: '$', name: 'USD' },
  EUR: { symbol: '€', name: 'EUR' },
  GBP: { symbol: '£', name: 'GBP' },
  JPY: { symbol: '¥', name: 'JPY' },
  AUD: { symbol: 'A$', name: 'AUD' },
  CAD: { symbol: 'C$', name: 'CAD' },
  SGD: { symbol: 'S$', name: 'SGD' },
  KRW: { symbol: '₩', name: 'KRW' },
}

export default function Navbar() {
  const { user, signOut } = useAuth()
  const { currency, changeCurrency } = useCurrency()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const navRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const [userKey, setUserKey] = useState(0)

  const desktopLinks = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/condos', label: 'Listings', icon: Building },
    ...(user ? [{ path: '/my-bookings', label: 'My Bookings', icon: Calendar }] : []),
    ...(user ? [{ path: '/list-property', label: 'List Property', icon: Building }] : []),
    { path: '/about', label: 'About', icon: Info },
    { path: '/contact', label: 'Contact', icon: Phone },
    { path: '/terms', label: 'Terms', icon: FileText },
    { path: '/privacy', label: 'Privacy', icon: Shield },
  ]

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  useEffect(() => {
    if (!navRef.current) return
    const activeLink = navRef.current.querySelector('[data-active="true"]')
    if (activeLink) {
      const navRect = navRef.current.getBoundingClientRect()
      const linkRect = activeLink.getBoundingClientRect()
      setIndicatorStyle({ left: linkRect.left - navRect.left, width: linkRect.width })
    }
  }, [location.pathname, user])

  // Reset avatar key when user changes - intentional mount effect
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    data-active={isActive(link.path)}
                    className={`relative z-10 flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all duration-300 whitespace-nowrap ${
                      isActive(link.path) ? 'text-[#1a3a5c]' : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </div>

            <div className="w-px h-7 bg-white/15 mx-2" />

            <div className="relative">
              <button onClick={() => setCurrencyOpen(!currencyOpen)} className="px-3 py-2.5 text-white/70 hover:text-white transition-colors flex items-center gap-1.5 rounded-full hover:bg-white/5">
                <Globe size={15} /><span className="text-sm font-medium">{currency}</span>
              </button>
              <AnimatePresence>
                {currencyOpen && (
                  <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className="absolute top-full right-0 mt-2 bg-[#1a1a2e] backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-2 min-w-[130px]">
                    {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                      <button key={code} onClick={() => { changeCurrency(code); setCurrencyOpen(false) }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${currency === code ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                        {symbol} {code}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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

            <Link
              to="/condos"
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full transition-all duration-300 ${
                isActive('/condos') ? 'bg-[#2d568e] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Building size={14} />
              <span>Condos</span>
            </Link>

            {user ? (
              <Link
                to="/my-bookings"
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full transition-all duration-300 ${
                  isActive('/my-bookings') ? 'bg-[#2d568e] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Calendar size={14} />
                <span>Bookings</span>
              </Link>
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

                <div className="pt-3 mt-3 border-t border-gray-100 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Currency</p>
                  <div className="flex flex-wrap gap-2 px-1">
                    {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                      <button
                        key={code}
                        onClick={() => { changeCurrency(code); setMobileMenuOpen(false) }}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          currency === code
                            ? 'bg-[#2d568e] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {symbol} {code}
                      </button>
                    ))}
                  </div>
                </div>

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