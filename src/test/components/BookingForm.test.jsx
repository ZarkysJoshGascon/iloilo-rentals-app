import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'

describe('Booking Form', () => {
  const TestBookingForm = () => {
    const [adults, setAdults] = useState(2)
    const [children, setChildren] = useState(0)
    
    return (
      <div>
        <div data-testid="adults-count">{adults}</div>
        <button onClick={() => setAdults(adults + 1)}>Add Adult</button>
        <button onClick={() => setAdults(Math.max(1, adults - 1))}>Remove Adult</button>
        
        <div data-testid="children-count">{children}</div>
        <button onClick={() => setChildren(children + 1)}>Add Child</button>
        <button onClick={() => setChildren(Math.max(0, children - 1))}>Remove Child</button>
      </div>
    )
  }
  
  it('should start with 2 adults by default', () => {
    render(<TestBookingForm />)
    expect(screen.getByTestId('adults-count').textContent).toBe('2')
  })
  
  it('should increase adult count when add button is clicked', () => {
    render(<TestBookingForm />)
    const addButton = screen.getByText('Add Adult')
    fireEvent.click(addButton)
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
    const addButton = screen.getByText('Add Child')
    fireEvent.click(addButton)
    expect(screen.getByTestId('children-count').textContent).toBe('1')
  })
})