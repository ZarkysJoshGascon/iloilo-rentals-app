import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Home, Building2, User, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function MobileBottomNav() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  const linkClass = (path) =>
    `flex flex-col items-center text-xs ${
      isActive(path) ? 'text-white' : 'text-white/60'
    }`

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
    setMenuOpen(false)
  }

  return (
    <>
      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#2d568e] backdrop-blur-md border-t border-white/10 safe-area-bottom">
        <div className="flex justify-around items-center h-16 px-2">
          <Link to="/" className={linkClass('/')}>
            <Home size={20} />
            <span className="mt-0.5">Home</span>
          </Link>

          <Link to="/condos" className={linkClass('/condos')}>
            <Building2 size={20} />
            <span className="mt-0.5">Condos</span>
          </Link>

          {user ? (
            <Link to="/my-bookings" className={linkClass('/my-bookings')}>
              <User size={20} />
              <span className="mt-0.5">Bookings</span>
            </Link>
          ) : (
            <Link to="/login" className={linkClass('/login')}>
              <User size={20} />
              <span className="mt-0.5">Sign In</span>
            </Link>
          )}

          <button
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center text-xs text-white/60 focus:outline-none"
          >
            <Menu size={20} />
            <span className="mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {/* More menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="relative w-full bg-white rounded-t-3xl shadow-2xl safe-area-bottom animate-slide-up"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-[#2d568e]">Menu</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <Link
                to="/about"
                onClick={() => setMenuOpen(false)}
                className="block py-3 px-4 rounded-xl bg-gray-50 text-gray-800 font-medium hover:bg-gray-100"
              >
                About Us
              </Link>
              <Link
                to="/contact"
                onClick={() => setMenuOpen(false)}
                className="block py-3 px-4 rounded-xl bg-gray-50 text-gray-800 font-medium hover:bg-gray-100"
              >
                Contact Us
              </Link>
              {user && (
                <Link
                  to="/list-property"
                  onClick={() => setMenuOpen(false)}
                  className="block py-3 px-4 rounded-xl bg-gray-50 text-gray-800 font-medium hover:bg-gray-100"
                >
                  List My Property
                </Link>
              )}
              <Link
                to="/privacy"
                onClick={() => setMenuOpen(false)}
                className="block py-3 px-4 rounded-xl bg-gray-50 text-gray-800 font-medium hover:bg-gray-100"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                onClick={() => setMenuOpen(false)}
                className="block py-3 px-4 rounded-xl bg-gray-50 text-gray-800 font-medium hover:bg-gray-100"
              >
                Terms & Conditions
              </Link>
              {user && (
                <button
                  onClick={handleSignOut}
                  className="w-full text-left py-3 px-4 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}