import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import CondosPage from './pages/CondosPage'
import CondoDetailPage from './pages/CondoDetailPage'
import LoginPage from './pages/LoginPage'
import AboutPage from './pages/Aboutpage'
import ContactPage from './pages/ContactPage'
import MyBookingsPage from './pages/MyBookingsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsPage from './pages/TermsPage'

function App() {
  const location = useLocation()
  const hideFooter = location.pathname.includes('/condo/')

  useEffect(() => {
    // Reset body styles on navigation to fix back button freeze
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.width = ''
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
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
        </Routes>
      </main>
      {!hideFooter && <Footer />}
      <Toaster position="top-right" />
    </div>
  )
}

export default App