import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'  // This imports the default export
import { CurrencyProvider } from './context/CurrencyContext'

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <CurrencyProvider>
        <App />  {/* This uses the default export */}
      </CurrencyProvider>
    </BrowserRouter>
  </StrictMode>,
)