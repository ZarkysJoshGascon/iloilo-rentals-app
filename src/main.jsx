import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'   // ← change from HashRouter to BrowserRouter
import './index.css'
import App from './App.jsx'
import { CurrencyProvider } from './context/CurrencyContext'
import ErrorBoundary from './components/ErrorBoundary'

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>           {/* ← BrowserRouter, not HashRouter */}
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)