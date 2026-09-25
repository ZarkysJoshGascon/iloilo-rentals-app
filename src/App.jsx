import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Users } from 'lucide-react'
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
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminRoute from './components/admin/AdminRoute'

function AdminCRMButton() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!user) { setIsAdmin(false); setChecking(false); return () => { cancelled = true } }
    setChecking(true)
    supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setIsAdmin(!error && !!data)
        setChecking(false)
      })
    return () => { cancelled = true }
  }, [user])

  const inAdmin = location.pathname.startsWith('/admin')
  const shouldShow = !checking && !!user && isAdmin && !inAdmin

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          type="button"
          onClick={() => navigate('/admin')}
          className="fixed bottom-6 right-6 z-[9999] inline-flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-semibold hover:scale-105 active:scale-95 transition-transform"
          style={{ backgroundColor: '#2d568e' }}
          title="Open Admin / CRM"
        >
          <Users size={16} />
          <span>CRM</span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!isAdminRoute && <Navbar />}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
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
          </Routes>
        </main>
        {!isAdminRoute && <Footer />}
        <AdminCRMButton />
        <Toaster position="top-right" />
      </div>
    </ThemeProvider>
  )
}

export default App