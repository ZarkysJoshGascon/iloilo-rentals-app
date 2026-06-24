import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import { Menu, X } from 'lucide-react'

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

  const handleLogout = async () => {
    await signOut()
    navigate('/')
    setMobileMenuOpen(false)
  }

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  const getLinkClass = (path) => {
    const baseClass = "text-white transition text-base font-medium pb-1"
    if (isActive(path)) return `${baseClass} border-b-2 border-white`
    return `${baseClass} hover:text-gray-200`
  }

  return (
    <motion.nav
      className="shadow-2xl sticky top-0 transition-all duration-300 z-40 bg-[#2d568e] hidden md:block"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4 md:py-5">
          {/* Logo – slide from left */}
          <motion.div
            className="flex-shrink-0"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Link to="/" className="text-xl md:text-2xl font-bold text-white">Iloilo Rentals</Link>
          </motion.div>

          {/* Desktop links – slide from right */}
          <motion.div
            className="hidden md:flex items-center gap-8 lg:gap-12"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Link to="/" className={getLinkClass('/')}>Home</Link>
            <Link to="/about" className={getLinkClass('/about')}>About Us</Link>
            <Link to="/contact" className={getLinkClass('/contact')}>Contact Us</Link>
            {user && <Link to="/my-bookings" className={getLinkClass('/my-bookings')}>My Bookings</Link>}
            {user && <Link to="/list-property" className={getLinkClass('/list-property')}>List My Property</Link>}
          </motion.div>

          {/* Desktop actions – slide from right */}
          <motion.div
            className="hidden md:flex items-center gap-3"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
              className="bg-white/10 backdrop-blur-sm text-white px-3 py-2 rounded-lg font-semibold cursor-pointer text-sm border border-white/20 focus:outline-none hover:bg-white/20 transition"
            >
              {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                <option key={code} value={code} className="text-gray-900">{code} ({symbol})</option>
              ))}
            </select>
            {user ? (
              <>
                <span className="text-sm text-white hidden lg:inline">{user.email.split('@')[0]}</span>
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition text-sm font-medium"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link to="/login">
                <button className="bg-white text-[#2d568e] px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition text-sm">
                  Sign In
                </button>
              </Link>
            )}
          </motion.div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white p-2">
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#2d568e] px-4 pb-5 space-y-3 border-t border-white/10">
          <Link to="/" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-base text-white/80 hover:text-white">Home</Link>
          <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-base text-white/80 hover:text-white">About Us</Link>
          <Link to="/contact" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-base text-white/80 hover:text-white">Contact Us</Link>
          {user && <Link to="/my-bookings" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-base text-white/80 hover:text-white">My Bookings</Link>}
          {user && <Link to="/list-property" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-base text-white/80 hover:text-white">List My Property</Link>}
          <div className="pt-3 border-t border-white/10">
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
              className="w-full bg-white/10 text-white px-3 py-2 rounded-lg mb-3"
            >
              {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                <option key={code} value={code} className="text-gray-900">{code} ({symbol})</option>
              ))}
            </select>
            {user ? (
              <button onClick={handleLogout} className="w-full bg-red-600 text-white py-2 rounded-lg">Sign Out</button>
            ) : (
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                <button className="w-full bg-white text-[#2d568e] py-2 rounded-lg font-semibold">Sign In</button>
              </Link>
            )}
          </div>
        </div>
      )}
    </motion.nav>
  )
}