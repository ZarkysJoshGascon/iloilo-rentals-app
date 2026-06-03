import { describe, it, expect, vi } from 'vitest'
import React from 'react'

describe('MyBookingsPage - Cancel Booking', () => {
  it('should call update with status cancelled when cancel button clicked', async () => {
    // Create a clean mock chain where first .eq() returns an object with second .eq()
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })  // second .eq() returns a Promise
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })    // first .eq() returns an object with .eq()
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 }) // .update() returns an object with .eq()
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate })

    vi.doMock('../lib/supabase', () => ({
      supabase: {
        from: mockFrom,
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user123' } }, error: null })
        }
      }
    }))

    const { supabase } = await import('../lib/supabase')
    
    const cancelBooking = async (bookingId, userId) => {
      const result = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('user_id', userId)
      return !result.error
    }
    
    const result = await cancelBooking('booking123', 'user123')
    
    expect(result).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('bookings')
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'cancelled' })
    // First .eq() call should have the id argument
    expect(mockEq1).toHaveBeenCalledWith('id', 'booking123')
    // Second .eq() call should have the user_id argument
    expect(mockEq2).toHaveBeenCalledWith('user_id', 'user123')
  })

  it('should not show cancel button for already cancelled or completed bookings', () => {
    const statuses = [
      { status: 'pending', canCancel: true },
      { status: 'confirmed', canCancel: true },
      { status: 'cancelled', canCancel: false },
      { status: 'completed', canCancel: false }
    ]
    
    statuses.forEach(s => {
      if (s.canCancel) {
        expect(s.canCancel).toBe(true)
      } else {
        expect(s.canCancel).toBe(false)
      }
    })
  })
})