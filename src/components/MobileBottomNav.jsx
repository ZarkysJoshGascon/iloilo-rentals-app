import { Link, useLocation } from 'react-router-dom'
import { Home, Building2, User, Menu } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function MobileBottomNav() {
  const location = useLocation()
  const { user } = useAuth()

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  const linkClass = (path) =>
    `flex flex-col items-center text-xs ${
      isActive(path) ? 'text-white' : 'text-white/60'
    }`

  return (
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

        {/* Optional: more links like menu */}
        <Link to="/about" className={linkClass('/about')}>
          <Menu size={20} />
          <span className="mt-0.5">More</span>
        </Link>
      </div>
    </nav>
  )
}