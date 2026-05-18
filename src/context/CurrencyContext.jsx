import { createContext, useContext, useState, useEffect } from 'react'

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
  const [currency, setCurrency] = useState('PHP')
  const [updateTrigger, setUpdateTrigger] = useState(0)

  useEffect(() => {
    const saved = localStorage.getItem('preferredCurrency')
    if (saved && EXCHANGE_RATES[saved]) {
      setCurrency(saved)
    }
  }, [])

  const changeCurrency = (newCurrency) => {
    setCurrency(newCurrency)
    localStorage.setItem('preferredCurrency', newCurrency)
    // Force all components to re-render
    setUpdateTrigger(prev => prev + 1)
  }

  const formatPrice = (phpAmount) => {
    const rate = EXCHANGE_RATES[currency] || 1
    const symbol = CURRENCY_SYMBOLS[currency] || '₱'
    const converted = Math.round(phpAmount * rate)
    return `${symbol}${converted.toLocaleString()}`
  }

  return (
    <CurrencyContext.Provider value={{ currency, changeCurrency, formatPrice, updateTrigger }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}