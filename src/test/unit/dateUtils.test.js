import { describe, it, expect } from 'vitest'
import { differenceInDays, format, addDays } from 'date-fns'

describe('Date Utilities', () => {
  it('should calculate correct night count between dates', () => {
    const start = new Date('2025-06-01')
    const end = new Date('2025-06-05')
    const nights = differenceInDays(end, start)
    expect(nights).toBe(4)
  })
  
  it('should format date correctly', () => {
    const date = new Date('2025-06-01')
    const formatted = format(date, 'MMM dd, yyyy')
    expect(formatted).toBe('Jun 01, 2025')
  })
  
  it('should return 0 nights when same day', () => {
    const date = new Date('2025-06-01')
    const nights = differenceInDays(date, date)
    expect(nights).toBe(0)
  })
  
  it('should add days correctly', () => {
    const date = new Date('2025-06-01')
    const newDate = addDays(date, 3)
    expect(format(newDate, 'yyyy-MM-dd')).toBe('2025-06-04')
  })
})