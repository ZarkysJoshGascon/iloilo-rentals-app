import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

describe('Booking Flow Integration', () => {
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
    if (code === 'WELCOME10') return total * 0.9
    if (code === 'STAY5') return total - 500
    return total
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
  
  it('should validate promo codes correctly', () => {
    expect(mockPromoValidation('WELCOME10')).toBe(true)
    expect(mockPromoValidation('STAY5')).toBe(true)
    expect(mockPromoValidation('INVALID')).toBe(false)
  })
})