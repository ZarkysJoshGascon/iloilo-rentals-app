import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { ThemeProvider } from './context/ThemeContext'
import { supabase } from './lib/supabase'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import AdminRoute from './components/admin/AdminRoute'
import { Preloader } from './components/ui/preloader'
import { PageImagesProbe } from './components/common/PageImagesProbe'
import { PageRevealContext } from './lib/pageReveal'

// ---- Lazy-loaded pages (each becomes its own chunk) ----
const HomePage = lazy(() => import('./pages/public/HomePage'))
const LoginPage = lazy(() => import('./pages/public/LoginPage'))
const PostLoginPage = lazy(() => import('./pages/public/PostLoginPage'))
const AboutPage = lazy(() => import('./pages/public/AboutPage'))
const ContactPage = lazy(() => import('./pages/public/ContactPage'))
const ListPropertyPage = lazy(() => import('./pages/public/ListPropertyPage'))
const InteriorDesignPage = lazy(() => import('./pages/public/InteriorDesignPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/public/PrivacyPolicyPage'))
const TermsPage = lazy(() => import('./pages/public/TermsPage'))
const UnsubscribePage = lazy(() => import('./pages/public/UnsubscribePage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))

// First visit only: a loading screen covers the site until the page and every
// image on it have loaded, so no photo is seen half-loaded. It gives up after
// this long and shows the page anyway; anything left keeps loading behind it.
const PRELOAD_MAX_MS = 8000
const LOGO = '/Iloilo_rentals_img.png'

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-[#2d568e]" />
    </div>
  )
}

function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isUnsubscribeRoute = location.pathname.startsWith('/unsubscribe')

  // The CRM has its own loading states, so the loading screen is for the public site.
  const [preloaded, setPreloaded] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState(0)
  const finishPreload = useCallback(() => setPreloaded(true), [])
  const showPreloader = !preloaded && !isAdminRoute

  useEffect(() => {
    if (!showPreloader) return
    const cap = setTimeout(finishPreload, PRELOAD_MAX_MS)
    return () => clearTimeout(cap)
  }, [showPreloader, finishPreload])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <ThemeProvider>
      <PageRevealContext.Provider value={!showPreloader}>
      <Preloader show={showPreloader} progress={preloadProgress} logo={LOGO} />
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!isAdminRoute && !isUnsubscribeRoute && <Navbar />}
        <main className="flex-grow">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/post-login" element={<PostLoginPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/list-property" element={<ListPropertyPage />} />
              <Route path="/interior-design" element={<InteriorDesignPage />} />
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
              {/* The housekeeper task page is switched off for now; its code is kept in
                  src/pages/housekeeper/HousekeeperTasksPage.jsx. Old links go home. */}
              <Route path="/hk" element={<Navigate to="/" replace />} />
            </Routes>
            {showPreloader && <PageImagesProbe onProgress={setPreloadProgress} onDone={finishPreload} />}
          </Suspense>
        </main>
        {!isAdminRoute && !isUnsubscribeRoute && <Footer />}
        <Toaster position="top-right" />
      </div>
      </PageRevealContext.Provider>
    </ThemeProvider>
  )
}

export default App