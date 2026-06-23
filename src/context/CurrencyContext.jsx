import { createContext, useContext, useState } from 'react'

const EXCHANGE_RATES = {
  PHP: 1,
  USD: 0.017,
  EUR: 0.016,
  GBP: 0.014,
  JPY: 2.65,
  AUD: 0.026,
  CAD: 0.024,
  SGD: 0.023,
  KRW: 23.5,
}

const CURRENCY_SYMBOLS = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  KRW: '₩',
}

const CurrencyContext = createContext()

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    const saved = localStorage.getItem('preferredCurrency')
    return (saved && EXCHANGE_RATES[saved]) ? saved : 'PHP'
  })
  const [updateTrigger, setUpdateTrigger] = useState(0)

  const changeCurrency = (newCurrency) => {
    setCurrency(newCurrency)
    localStorage.setItem('preferredCurrency', newCurrency)
    // Force all components to re-render
    setUpdateTrigger(prev => prev + 1)
  }

  const formatPrice = (phpAmount) => {
    const rate = EXCHANGE_RATES[currency] || 1
    const symbol = CURRENCY_SYMBOLS[currency] || '₱'
    const converted = phpAmount * rate
    // Round to nearest 0.01 then format intelligently
    const rounded = Math.round(converted * 100) / 100
    // If whole number, show as integer; otherwise two decimals
    const display = rounded % 1 === 0
      ? Math.round(rounded).toLocaleString()
      : rounded.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return `${symbol}${display}`
  }

  return (
    <CurrencyContext.Provider value={{ currency, changeCurrency, formatPrice, updateTrigger }}>
      {children}
    </CurrencyContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}