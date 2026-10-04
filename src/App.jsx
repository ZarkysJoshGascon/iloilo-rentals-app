import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Loader2, Sparkles } from 'lucide-react'
import { ThemeProvider } from './context/ThemeContext'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import AdminRoute from './components/admin/AdminRoute'
import { useUserRole } from './hooks/useUserRole'

// ---- Lazy-loaded pages (each becomes its own chunk) ----
const HomePage = lazy(() => import('./pages/public/HomePage'))
const LoginPage = lazy(() => import('./pages/public/LoginPage'))
const PostLoginPage = lazy(() => import('./pages/public/PostLoginPage'))
const AboutPage = lazy(() => import('./pages/public/AboutPage'))
const ContactPage = lazy(() => import('./pages/public/ContactPage'))
const ListPropertyPage = lazy(() => import('./pages/public/ListPropertyPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/public/PrivacyPolicyPage'))
const TermsPage = lazy(() => import('./pages/public/TermsPage'))
const UnsubscribePage = lazy(() => import('./pages/public/UnsubscribePage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const HousekeeperTasksPage = lazy(() => import('./pages/housekeeper/HousekeeperTasksPage'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-[#2d568e]" />
    </div>
  )
}

// ------------------------------------------------------------
// Housekeeper guard
// ------------------------------------------------------------
function HousekeeperRoute({ children }) {
  const { role, loading } = useUserRole()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#2d568e]" />
      </div>
    )
  }

  if (role !== 'housekeeper' && role !== 'both') {
    return <Navigate to="/" replace />
  }

  return children
}

// ------------------------------------------------------------
// Floating buttons
//   - My Tasks (green) — visible on all screens for housekeepers
//   - CRM (blue)      — visible on desktop ONLY for admins
// ------------------------------------------------------------
function FloatingButtons() {
  const { user } = useAuth()
  const { role } = useUserRole()
  const navigate = useNavigate()
  const location = useLocation()

  const inAdmin = location.pathname.startsWith('/admin')
  const inHk = location.pathname.startsWith('/hk')
  const inUnsubscribe = location.pathname.startsWith('/unsubscribe')

  const isAdmin = role === 'admin' || role === 'both'
  const isHousekeeper = role === 'housekeeper' || role === 'both'

  // Hide floating buttons on unsubscribe page and admin/hk routes
  const showAdmin = !!user && isAdmin && !inAdmin && !inHk && !inUnsubscribe
  const showHK = !!user && isHousekeeper && !inAdmin && !inHk && !inUnsubscribe

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">
      <AnimatePresence>
        {showHK && (
          <motion.button
            key="hk-btn"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            type="button"
            onClick={() => navigate('/hk')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-semibold hover:scale-105 active:scale-95 transition-transform"
            style={{ backgroundColor: '#059669' }}
            title="My cleaning tasks"
          >
            <Sparkles size={16} />
            <span>My Tasks</span>
          </motion.button>
        )}
        {showAdmin && (
          <motion.button
            key="crm-btn"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            type="button"
            onClick={() => navigate('/admin')}
            className="hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-semibold hover:scale-105 active:scale-95 transition-transform"
            style={{ backgroundColor: '#2d568e' }}
            title="Open Admin CRM"
          >
            <Users size={16} />
            <span>CRM</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

// ------------------------------------------------------------
// Main app
// ------------------------------------------------------------
function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isHousekeeperRoute = location.pathname.startsWith('/hk')
  const isUnsubscribeRoute = location.pathname.startsWith('/unsubscribe')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!isAdminRoute && !isHousekeeperRoute && !isUnsubscribeRoute && <Navbar />}
        <main className="flex-grow">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/post-login" element={<PostLoginPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/list-property" element={<ListPropertyPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminDashboardPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/hk"
                element={
                  <HousekeeperRoute>
                    <HousekeeperTasksPage />
                  </HousekeeperRoute>
                }
              />
            </Routes>
          </Suspense>
        </main>
        {!isAdminRoute && !isHousekeeperRoute && !isUnsubscribeRoute && <Footer />}
        <FloatingButtons />
        <Toaster position="top-right" />
      </div>
    </ThemeProvider>
  )
}

export default App