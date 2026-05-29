import { describe, it, expect } from 'vitest'

describe('Guest Calculator', () => {
  const ADULT_RATE = 1.0
  const CHILD_RATE = 0.9
  const INFANT_RATE = 0.8
  const SENIOR_RATE = 0.8
  
  const calculateNightlyRate = (basePrice, adults, children, infants, seniors) => {
    const adultTotal = adults * basePrice * ADULT_RATE
    const childTotal = children * basePrice * CHILD_RATE
    const infantTotal = infants * basePrice * INFANT_RATE
    const seniorTotal = seniors * basePrice * SENIOR_RATE
    return adultTotal + childTotal + infantTotal + seniorTotal
  }
  
  it('should calculate correctly for 2 adults', () => {
    const result = calculateNightlyRate(1000, 2, 0, 0, 0)
    expect(result).toBe(2000)
  })
  
  it('should apply 10% discount for children', () => {
    const result = calculateNightlyRate(1000, 2, 2, 0, 0)
    // 2 adults = 2000, 2 children = 1800, total = 3800
    expect(result).toBe(3800)
  })
  
  it('should apply 20% discount for infants', () => {
    const result = calculateNightlyRate(1000, 2, 0, 1, 0)
    // 2 adults = 2000, 1 infant = 800, total = 2800
    expect(result).toBe(2800)
  })
  
  it('should apply 20% discount for seniors', () => {
    const result = calculateNightlyRate(1000, 2, 0, 0, 1)
    // 2 adults = 2000, 1 senior = 800, total = 2800
    expect(result).toBe(2800)
  })
  
  it('should calculate total guests correctly', () => {
    const totalGuests = (adults, children, seniors) => adults + children + seniors
    expect(totalGuests(2, 2, 1)).toBe(5)
  })
})