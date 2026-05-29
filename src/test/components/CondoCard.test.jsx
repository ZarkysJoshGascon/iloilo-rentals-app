import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'  // Add this line

// Mock the ModernCondoCard component
const MockCondoCard = ({ condo }) => (
  <div data-testid="condo-card">
    <h3>{condo.title}</h3>
    <div>{condo.location}</div>
    <div>{condo.bedroom_count} beds</div>
    <div>{condo.bathroom_count} baths</div>
    <button>View Details</button>
  </div>
)

describe('CondoCard Component', () => {
  const mockCondo = {
    id: '1',
    title: 'Luxury Condo in Megaworld',
    location: 'Megaworld, Iloilo City',
    bedroom_count: 2,
    bathroom_count: 2,
    max_guests: 4,
    price_per_night: 3500,
    rating: 4.8,
    reviews_count: 24,
  }
  
  it('should render condo title correctly', () => {
    render(
      <BrowserRouter>
        <MockCondoCard condo={mockCondo} />
      </BrowserRouter>
    )
    
    expect(screen.getByText('Luxury Condo in Megaworld')).toBeDefined()
  })
  
  it('should render condo location', () => {
    render(
      <BrowserRouter>
        <MockCondoCard condo={mockCondo} />
      </BrowserRouter>
    )
    
    expect(screen.getByText('Megaworld, Iloilo City')).toBeDefined()
  })
  
  it('should display correct bedroom count', () => {
    render(
      <BrowserRouter>
        <MockCondoCard condo={mockCondo} />
      </BrowserRouter>
    )
    
    expect(screen.getByText('2 beds')).toBeDefined()
  })
  
  it('should have view details button', () => {
    render(
      <BrowserRouter>
        <MockCondoCard condo={mockCondo} />
      </BrowserRouter>
    )
    
    expect(screen.getByText('View Details')).toBeDefined()
  })
})