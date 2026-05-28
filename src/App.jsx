import { Routes, Route, useLocation } from 'react-router-dom'
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

function App() {
  const location = useLocation()
  const hideFooter = location.pathname.includes('/condo/')

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
        </Routes>
      </main>
      {!hideFooter && <Footer />}
      <Toaster position="top-right" />
    </div>
  )
}

export default App