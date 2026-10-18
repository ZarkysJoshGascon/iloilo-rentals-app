import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { UserRoleProvider } from './context/UserRoleContext'
import ErrorBoundary from './components/common/ErrorBoundary'
import '@/styles/scrollbar.css'

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <UserRoleProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UserRoleProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)