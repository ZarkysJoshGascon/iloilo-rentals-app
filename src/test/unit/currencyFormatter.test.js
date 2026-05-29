import { describe, it, expect, beforeEach } from 'vitest'

describe('Currency Formatter', () => {
  let formatPrice
  
  beforeEach(() => {
    // Mock currency context
    const currencyRates = {
      PHP: 1,
      USD: 0.017,
      EUR: 0.016,
    }
    
    formatPrice = (amount, currency = 'PHP') => {
      const rate = currencyRates[currency] || 1
      const symbols = { PHP: '₱', USD: '$', EUR: '€' }
      const converted = Math.round(amount * rate)
      return `${symbols[currency]}${converted.toLocaleString()}`
    }
  })
  
  it('should format PHP currency correctly', () => {
    const result = formatPrice(2500, 'PHP')
    expect(result).toBe('₱2,500')
  })
  
  it('should format USD currency correctly', () => {
    const result = formatPrice(2500, 'USD')
    expect(result).toBe('$43')
  })
  
  it('should format EUR currency correctly', () => {
    const result = formatPrice(2500, 'EUR')
    expect(result).toBe('€40')
  })
  
  it('should handle zero amount', () => {
    const result = formatPrice(0, 'PHP')
    expect(result).toBe('₱0')
  })
  
  it('should handle large numbers', () => {
    const result = formatPrice(1000000, 'PHP')
    expect(result).toBe('₱1,000,000')
  })
})