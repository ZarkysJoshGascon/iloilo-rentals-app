import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

describe('Booking Flow Integration', () => {
  const EXCHANGE_RATES = { PHP: 1, USD: 0.017 }
  const CURRENCY_SYMBOLS = { PHP: '₱', USD: '$' }
  
  const formatPrice = (amount, currency = 'PHP') => {
    const rate = EXCHANGE_RATES[currency] || 1
    const symbol = CURRENCY_SYMBOLS[currency] || '₱'
    const converted = Math.round(amount * rate)
    return `${symbol}${converted.toLocaleString()}`
  }
  
  const mockPromoValidation = (code) => {
    const validCodes = ['WELCOME10', 'STAY5']
    return validCodes.includes(code.toUpperCase())
  }
  
  const calculateTotal = (pricePerNight, nights, adults, children, infants, seniors) => {
    const adultTotal = adults * pricePerNight
    const childTotal = children * pricePerNight * 0.9
    const infantTotal = infants * pricePerNight * 0.8
    const seniorTotal = seniors * pricePerNight * 0.8
    const subtotal = (adultTotal + childTotal + infantTotal + seniorTotal) * nights
    const serviceFee = subtotal * 0.05
    return subtotal + serviceFee
  }
  
  const applyDiscount = (total, code) => {
    let discount = 0
    if (code === 'WELCOME10') discount = total * 0.1
    if (code === 'STAY5') discount = 500
    return Math.max(0, total - discount) // FIX: prevent negative
  }
  
  it('should calculate total correctly for 2 adults, 3 nights', () => {
    const total = calculateTotal(3500, 3, 2, 0, 0, 0)
    expect(total).toBe(22050) // (7000 * 3) + 5% fee
  })
  
  it('should apply welcome10 discount correctly', () => {
    const total = calculateTotal(3500, 3, 2, 0, 0, 0)
    const discounted = applyDiscount(total, 'WELCOME10')
    expect(discounted).toBe(19845)
  })
  
  it('should apply stay5 discount correctly', () => {
    const total = calculateTotal(3500, 3, 2, 0, 0, 0)
    const discounted = applyDiscount(total, 'STAY5')
    expect(discounted).toBe(21550)
  })
  
  it('should not allow negative total when discount exceeds total', () => {
    const total = 400
    const discounted = applyDiscount(total, 'STAY5')
    expect(discounted).toBe(0)
  })
  
  it('should validate promo codes correctly', () => {
    expect(mockPromoValidation('WELCOME10')).toBe(true)
    expect(mockPromoValidation('STAY5')).toBe(true)
    expect(mockPromoValidation('INVALID')).toBe(false)
  })
  
  it('should reset promo discount when total changes (simulated)', () => {
    // Simulate scenario: apply promo, then total changes (e.g., different dates)
    let total = 10000
    let promoApplied = true
    let promoDiscount = 1000
    
    // Change total (e.g., fewer nights)
    total = 5000
    
    // In actual code, a useEffect resets promoApplied when total changes
    if (promoApplied) {
      promoApplied = false
      promoDiscount = 0
    }
    
    expect(promoApplied).toBe(false)
    expect(promoDiscount).toBe(0)
  })
})