import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from './context/ThemeContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import BackButton from './components/BackButton'
import HomePage from './pages/HomePage'
import CondosPage from './pages/CondosPage'
import CondoDetailPage from './pages/CondoDetailPage'
import LoginPage from './pages/LoginPage'
import AboutPage from './pages/Aboutpage'
import ContactPage from './pages/ContactPage'
import MyBookingsPage from './pages/MyBookingsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsPage from './pages/TermsPage'
import ListPropertyPage from './pages/ListPropertyPage'
import AdminDashboard from './pages/AdminDashboard'
import AdminRoute from './components/AdminRoute'

function App() {
  const location = useLocation()
  const hideFooter = location.pathname.includes('/condo/')
  const isAdminRoute = location.pathname === '/admin'

  useEffect(() => {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.width = ''
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!isAdminRoute && <Navbar />}
        {!isAdminRoute && <BackButton />}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/condos" element={<CondosPage />} />
            <Route path="/condo/:id" element={<CondoDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/my-bookings" element={<MyBookingsPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/list-property" element={<ListPropertyPage />} />
            <Route 
              path="/admin" 
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } 
            />
          </Routes>
        </main>
        {!hideFooter && !isAdminRoute && <Footer />}
        <Toaster position="top-right" />
      </div>
    </ThemeProvider>
  )
}

export default App