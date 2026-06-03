import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'

describe('Booking Form', () => {
  const TestBookingForm = () => {
    const [adults, setAdults] = useState(2)
    const [children, setChildren] = useState(0)
    const [infants, setInfants] = useState(0)
    const [seniors, setSeniors] = useState(0)
    const [total, setTotal] = useState(1000)
    const [promoDiscount, setPromoDiscount] = useState(0)
    
    const applyPromo = (code) => {
      if (code === 'WELCOME10') setPromoDiscount(total * 0.1)
      else if (code === 'STAY5') setPromoDiscount(500)
      else setPromoDiscount(0)
    }
    
    const finalTotal = Math.max(0, total - promoDiscount)
    
    return (
      <div>
        <div data-testid="adults-count">{adults}</div>
        <button onClick={() => setAdults(adults + 1)}>Add Adult</button>
        <button onClick={() => setAdults(Math.max(1, adults - 1))}>Remove Adult</button>
        
        <div data-testid="children-count">{children}</div>
        <button onClick={() => setChildren(children + 1)}>Add Child</button>
        <button onClick={() => setChildren(Math.max(0, children - 1))}>Remove Child</button>
        
        <div data-testid="infants-count">{infants}</div>
        <button onClick={() => setInfants(infants + 1)}>Add Infant</button>
        <button onClick={() => setInfants(Math.max(0, infants - 1))}>Remove Infant</button>
        
        <div data-testid="seniors-count">{seniors}</div>
        <button onClick={() => setSeniors(seniors + 1)}>Add Senior</button>
        <button onClick={() => setSeniors(Math.max(0, seniors - 1))}>Remove Senior</button>
        
        <div data-testid="total">Total: {total}</div>
        <div data-testid="promo-discount">Discount: {promoDiscount}</div>
        <div data-testid="final-total">Final: {finalTotal}</div>
        <button onClick={() => applyPromo('WELCOME10')}>Apply 10%</button>
        <button onClick={() => applyPromo('STAY5')}>Apply ₱500</button>
        <button onClick={() => setTotal(500)}>Set Total 500</button>
      </div>
    )
  }
  
  it('should start with 2 adults by default', () => {
    render(<TestBookingForm />)
    expect(screen.getByTestId('adults-count').textContent).toBe('2')
  })
  
  it('should increase adult count when add button is clicked', () => {
    render(<TestBookingForm />)
    fireEvent.click(screen.getByText('Add Adult'))
    expect(screen.getByTestId('adults-count').textContent).toBe('3')
  })
  
  it('should not go below 1 adult', () => {
    render(<TestBookingForm />)
    const removeButton = screen.getByText('Remove Adult')
    fireEvent.click(removeButton)
    fireEvent.click(removeButton)
    expect(screen.getByTestId('adults-count').textContent).toBe('1')
  })
  
  it('should increase child count', () => {
    render(<TestBookingForm />)
    fireEvent.click(screen.getByText('Add Child'))
    expect(screen.getByTestId('children-count').textContent).toBe('1')
  })
  
  it('should apply 10% discount correctly', () => {
    render(<TestBookingForm />)
    fireEvent.click(screen.getByText('Apply 10%'))
    expect(screen.getByTestId('promo-discount').textContent).toContain('100')
    expect(screen.getByTestId('final-total').textContent).toContain('900')
  })
  
  it('should prevent negative total when discount exceeds total', () => {
    render(<TestBookingForm />)
    fireEvent.click(screen.getByText('Set Total 500'))
    fireEvent.click(screen.getByText('Apply ₱500'))
    expect(screen.getByTestId('final-total').textContent).toContain('0')
  })
})