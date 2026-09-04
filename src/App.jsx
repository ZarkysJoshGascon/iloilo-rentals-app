  import { Routes, Route, useLocation } from 'react-router-dom'
  import { useEffect } from 'react'
  import { Toaster } from 'react-hot-toast'
  import { ThemeProvider } from './context/ThemeContext'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import HomePage from './pages/public/HomePage'
import CondosPage from './pages/public/CondosPage'
import CondoDetailPage from './pages/public/CondoDetailPage'
import LoginPage from './pages/public/LoginPage'
import AboutPage from './pages/public/AboutPage'
import ContactPage from './pages/public/ContactPage'
import MyBookingsPage from './pages/public/MyBookingsPage'
import PrivacyPolicyPage from './pages/public/PrivacyPolicyPage'
import TermsPage from './pages/public/TermsPage'
import ListPropertyPage from './pages/public/ListPropertyPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminRoute from './components/admin/AdminRoute'
import PaymentSuccess from './pages/public/PaymentSuccess'


  function App() {
    const location = useLocation()
    const hideFooter = location.pathname.includes('/condo/')
    const isAdminRoute = location.pathname === '/admin'

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
              <Route path="/condos" element={<CondosPage />} />
              <Route path="/condo/:id" element={<CondoDetailPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/my-bookings" element={<MyBookingsPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/list-property" element={<ListPropertyPage />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentSuccess />} />
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
          {!hideFooter && !isAdminRoute && <Footer />}
          <Toaster position="top-right" />
        </div>
      </ThemeProvider>
    )
  }

  export default App