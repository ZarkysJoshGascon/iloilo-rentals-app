import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'
import { useCurrency } from '../context/CurrencyContext'

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
  const [user, setUser] = useState(null)
  const { currency, changeCurrency } = useCurrency()
  const navigate = useNavigate()

  useEffect(() => {
    // Check session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    navigate('/')
  }

  return (
    <nav className="shadow-lg sticky top-0 z-50" style={{ backgroundColor: '#2d568e' }}>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-5 gap-4 md:gap-8">
          
          {/* Left: Logo */}
          <Link to="/" className="text-xl md:text-2xl lg:text-3xl font-bold text-white whitespace-nowrap flex-shrink-0 tracking-wide">
            Iloilo Rentals
          </Link>
          
          {/* Center: Navigation Links */}
          <div className="flex gap-6 md:gap-10 lg:gap-12 flex-shrink-0">
            <Link to="/" className="text-white hover:text-gray-200 transition whitespace-nowrap text-base md:text-lg font-medium">
              Home
            </Link>
            <Link to="/about" className="text-white hover:text-gray-200 transition whitespace-nowrap text-base md:text-lg font-medium">
              About Us
            </Link>
            <Link to="/contact" className="text-white hover:text-gray-200 transition whitespace-nowrap text-base md:text-lg font-medium">
              Contact Us
            </Link>
          </div>
          
          {/* Right: Currency & Sign In */}
          <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
            {/* Currency Selector */}
            <select
              value={currency}
              onChange={(e) => changeCurrency(e.target.value)}
              className="bg-white text-[#2d568e] px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-semibold cursor-pointer hover:bg-gray-100 transition text-sm md:text-base"
            >
              {Object.entries(CURRENCIES).map(([code, { symbol }]) => (
                <option key={code} value={code}>
                  {code} ({symbol})
                </option>
              ))}
            </select>
            
            {/* Sign In / User Menu */}
            {user ? (
              <>
                <span className="text-sm md:text-base text-white hidden md:inline font-medium">
                  {user.email.split('@')[0]}
                </span>
                <button 
                  onClick={handleLogout} 
                  className="bg-red-600 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-xl hover:bg-red-700 transition text-sm md:text-base font-medium whitespace-nowrap"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link to="/login">
                <button className="bg-white text-[#2d568e] px-4 md:px-5 py-2 md:py-2.5 rounded-xl font-semibold hover:bg-gray-100 transition flex items-center gap-2 text-sm md:text-base whitespace-nowrap">
                  <svg className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              </Link>
            )}
          </div>
          
        </div>
      </div>
    </nav>
  )
}