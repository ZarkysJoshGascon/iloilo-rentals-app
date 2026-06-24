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
  const [imgError, setImgError] = useState(false)

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

  useEffect(() => {
    setImgError(false)
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
      {/* Single unified pill */}
      <motion.div
        className="hidden md:block fixed top-4 left-1/2 -translate-x-1/2 z-50"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
      >
        <div className="relative bg-black/30 backdrop-blur-xl rounded-full border border-white/10 shadow-lg shadow-black/10">
          <div className="flex items-center gap-1 px-2 py-1.5">
            {/* Logo - no outline */}
            <Link to="/" className="flex-shrink-0 pl-1.5 pr-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center hover:scale-105 transition-transform">
                <img src="/Iloilo_rentals_img.png" alt="IR" className="w-7 h-7 object-contain" />
              </div>
            </Link>

            {/* Nav links */}
            <div ref={navRef} className="relative flex items-center gap-1">
              {/* Taller indicator */}
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

            {/* Divider */}
            <div className="w-px h-7 bg-white/15 mx-2" />

            {/* Currency */}
            <div className="relative">
              <button
                onClick={() => setCurrencyOpen(!currencyOpen)}
                className="px-3 py-2.5 text-white/70 hover:text-white transition-colors flex items-center gap-1.5 rounded-full hover:bg-white/5"
              >
                <Globe size={15} />
                <span className="text-sm font-medium">{currency}</span>
              </button>
              <AnimatePresence>
                {currencyOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className="absolute top-full right-0 mt-2 bg-[#1a1a2e] backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-2 min-w-[130px]"
                  >
                    {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                      <button
                        key={code}
                        onClick={() => { changeCurrency(code); setCurrencyOpen(false) }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
                          currency === code ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {symbol} {code}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User / Sign In */}
            <div className="pr-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
                    {userAvatar && !imgError ? (
                      <img
                        src={userAvatar}
                        alt={userName}
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <User size={15} className="text-white" />
                    )}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-white/50 hover:text-red-300 transition-colors p-2 rounded-full hover:bg-white/5"
                    title="Sign Out"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <Link to="/login">
                  <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/5 rounded-full transition-colors">
                    <User size={15} className="text-white/70" />
                    <span className="text-sm font-medium text-white/70">Sign In</span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Mobile */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40">
        <div className="bg-gradient-to-b from-[#2d568e] to-[#1a3a5c] backdrop-blur-xl border-b border-white/10">
          <div className="flex justify-between items-center px-4 py-3">
            <Link to="/" className="text-lg font-bold text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center">
                <img src="/Iloilo_rentals_img.png" alt="IR" className="w-6 h-6 object-contain" />
              </div>
              Iloilo Rentals
            </Link>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white p-2 hover:bg-white/10 rounded-full">
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-4 pb-5 space-y-1">
                  {desktopLinks.map((link) => {
                    const Icon = link.icon
                    return (
                      <Link key={link.path} to={link.path} onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 py-3 px-4 rounded-xl text-base transition-all ${
                          isActive(link.path) ? 'bg-white/15 text-white font-semibold' : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`}>
                        <Icon size={18} />{link.label}
                      </Link>
                    )
                  })}
                  <div className="pt-3 mt-3 border-t border-white/10 space-y-2">
                    <select value={currency} onChange={(e) => changeCurrency(e.target.value)}
                      className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm">
                      {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                        <option key={code} value={code} className="text-gray-900">{code} ({symbol})</option>
                      ))}
                    </select>
                    {user ? (
                      <button onClick={handleLogout} className="w-full bg-red-500/20 text-red-300 py-3 rounded-xl font-medium hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2">
                        <LogOut size={16} />Sign Out
                      </button>
                    ) : (
                      <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                        <button className="w-full bg-white text-[#2d568e] py-3 rounded-xl font-semibold">Sign In</button>
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}