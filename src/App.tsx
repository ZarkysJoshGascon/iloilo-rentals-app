import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router'
import { AppToaster } from './components/common/AppToaster'
import { Loader2 } from 'lucide-react'
import { ThemeProvider } from './context/ThemeContext'
import { supabase } from './lib/supabase'
import Navbar from './components/layout/Navbar'
import Footer from './components/layout/Footer'
import AdminRoute from '@/features/admin/shell/AdminRoute'
import HousekeeperRoute from '@/features/housekeeper/HousekeeperRoute'
import { Preloader } from './components/ui/preloader'
import { PageImagesProbe } from './components/common/PageImagesProbe'
import { TouchScrollIndicator } from './components/common/TouchScrollIndicator'
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
const OwnerPortalPage = lazy(() => import('./pages/owner/OwnerPortalPage'))
const HousekeeperTasksPage = lazy(() => import('./pages/housekeeper/HousekeeperTasksPage'))

// First visit only: a loading screen covers the site until the page and every
// image on it have loaded, so no photo is seen half-loaded. It gives up after
// this long and shows the page anyway; anything left keeps loading behind it.
const PRELOAD_MAX_MS = 8000
const LOGO = '/Iloilo_rentals_img.png'

type PageLoaderProps = {
  walkthrough?: boolean
}

function PageLoader({ walkthrough = false }: PageLoaderProps) {
  return (
    <div role="status" aria-live="polite" className={`min-h-screen flex flex-col items-center justify-center gap-4 ${walkthrough ? 'bg-[#0b0f17] text-white' : 'bg-gray-50 text-[#2d568e]'}`}>
      <Loader2 className="w-8 h-8 animate-spin" aria-hidden />
      {walkthrough ? <><p className="text-lg font-semibold">Loading your walkthrough</p><p className="text-sm text-white/60">Preparing Saint Honore Unit 9S</p></> : <span className="sr-only">Loading page</span>}
    </div>
  )
}

function App() {
  const location = useLocation()
  // The CRM, the owner portal and the housekeeping tasks have their own shell
  // (no public navbar, footer or loading screen).
  const isAdminRoute = ['/admin', '/owner', '/housekeeping'].some((p) => location.pathname.startsWith(p))
  const isUnsubscribeRoute = location.pathname.startsWith('/unsubscribe')
  const isWalkthroughRoute = location.pathname.replace(/\/+$/, '') === '/interior-design'

  // The CRM has its own loading states, so the loading screen is for the public site.
  const [preloaded, setPreloaded] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState(0)
  const finishPreload = useCallback(() => setPreloaded(true), [])
  // The walkthrough reports its own asset and scene loading. Let that
  // progress appear immediately instead of hiding it behind site photos.
  const showPreloader = !preloaded && !isAdminRoute && !isWalkthroughRoute

  useEffect(() => {
    if (isWalkthroughRoute) finishPreload()
  }, [isWalkthroughRoute, finishPreload])

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
          <Suspense fallback={<PageLoader walkthrough={isWalkthroughRoute} />}>
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
              <Route path="/owner" element={<OwnerPortalPage />} />
              {/* Housekeepers' assigned cleanings; /hk was its old address. */}
              <Route
                path="/housekeeping"
                element={
                  <HousekeeperRoute>
                    <HousekeeperTasksPage />
                  </HousekeeperRoute>
                }
              />
              <Route path="/hk" element={<Navigate to="/housekeeping" replace />} />
            </Routes>
            {showPreloader && <PageImagesProbe onProgress={setPreloadProgress} onDone={finishPreload} />}
          </Suspense>
        </main>
        {!isAdminRoute && !isUnsubscribeRoute && <Footer />}
        <AppToaster />
        <TouchScrollIndicator />
      </div>
      </PageRevealContext.Provider>
    </ThemeProvider>
  )
}

export default App
