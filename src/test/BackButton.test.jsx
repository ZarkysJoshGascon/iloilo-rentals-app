import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import BackButton from '../components/BackButton'

// Mock MutationObserver to prevent it from interfering
beforeEach(() => {
  global.MutationObserver = class {
    observe() {}
    disconnect() {}
  }
})

afterEach(() => {
  delete global.MutationObserver
})

describe('BackButton', () => {
  it('should not render on home page', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <BackButton />
      </MemoryRouter>
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('should render on non-home page', () => {
    render(
      <MemoryRouter initialEntries={['/condos']}>
        <BackButton />
      </MemoryRouter>
    )
    expect(screen.getByRole('button')).toBeDefined()
  })

  it('should hide when mobile menu open event is dispatched', async () => {
    render(
      <MemoryRouter initialEntries={['/condos']}>
        <BackButton />
      </MemoryRouter>
    )
    expect(screen.getByRole('button')).toBeDefined()
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('mobileMenuToggle', { detail: { isOpen: true } }))
    
    // Wait for state to update
    await waitFor(() => {
      expect(screen.queryByRole('button')).toBeNull()
    })
  })
})