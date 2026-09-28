import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Loader2, Sparkles } from 'lucide-react'
import { ThemeProvider } from './context/ThemeContext'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import HomePage from './pages/public/HomePage'
import LoginPage from './pages/public/LoginPage'
import AboutPage from './pages/public/AboutPage'
import ContactPage from './pages/public/ContactPage'
import ListPropertyPage from './pages/public/ListPropertyPage'
import PrivacyPolicyPage from './pages/public/PrivacyPolicyPage'
import TermsPage from './pages/public/TermsPage'
import PostLoginPage from './pages/public/PostLoginPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminRoute from './components/admin/AdminRoute'
import HouseKeeperTasksPage from './pages/housekeeper/HouseKeeperTasksPage'
import { useUserRole } from './hooks/useUserRole'

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

  const isAdmin = role === 'admin' || role === 'both'
  const isHousekeeper = role === 'housekeeper' || role === 'both'

  const showAdmin = !!user && isAdmin && !inAdmin && !inHk
  const showHK = !!user && isHousekeeper && !inAdmin && !inHk

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

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!isAdminRoute && !isHousekeeperRoute && <Navbar />}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/post-login" element={<PostLoginPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/list-property" element={<ListPropertyPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
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
        </main>
        {!isAdminRoute && !isHousekeeperRoute && <Footer />}
        <FloatingButtons />
        <Toaster position="top-right" />
      </div>
    </ThemeProvider>
  )
}

export default App