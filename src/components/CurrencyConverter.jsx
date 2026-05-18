import { useState, useEffect } from 'react'

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

export default function CurrencyConverter({ amount }) {
  const [selectedCurrency, setSelectedCurrency] = useState('PHP')
  const [convertedAmount, setConvertedAmount] = useState(amount)

  useEffect(() => {
    // Get saved currency from localStorage
    const saved = localStorage.getItem('preferredCurrency')
    if (saved && EXCHANGE_RATES[saved]) {
      setSelectedCurrency(saved)
    }

    // Listen for currency changes from navbar
    const handleCurrencyChange = (event) => {
      setSelectedCurrency(event.detail.currency)
    }
    
    window.addEventListener('currencyChange', handleCurrencyChange)
    return () => window.removeEventListener('currencyChange', handleCurrencyChange)
  }, [])

  useEffect(() => {
    const rate = EXCHANGE_RATES[selectedCurrency] || 1
    setConvertedAmount(amount * rate)
  }, [amount, selectedCurrency])

  const symbol = CURRENCY_SYMBOLS[selectedCurrency] || '₱'

  return (
    <span className="font-bold text-lg">
      {symbol}{convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}