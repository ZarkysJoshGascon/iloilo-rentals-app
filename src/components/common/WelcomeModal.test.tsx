import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WelcomeModal } from './WelcomeModal'

// 9 AM on Monday, Oct 19, 2026 in Manila.
function atMorning() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-19T01:00:00Z'))
}

describe('WelcomeModal', () => {
  it('greets the person by first name with today\'s date and a line of encouragement', () => {
    atMorning()
    render(<WelcomeModal workspace="crm" userId="u1" name="Zarkys Josh Gascon" />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Good morning, Zarkys' })).toBeInTheDocument()
    expect(screen.getByText(/Monday, October 19, 2026/i)).toBeInTheDocument()
    expect(screen.getByText('Welcome to the Iloilo Rentals CRM')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Let's get to work" })).toBeInTheDocument()
  })

  it('shows once a day: closing it remembers today', async () => {
    atMorning()
    const { unmount } = render(<WelcomeModal workspace="crm" userId="u1" name="Ana" />)
    fireEvent.click(screen.getByRole('button', { name: "Let's get to work" }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(localStorage.getItem('welcome:crm:u1')).toBe('2026-10-19')
    unmount()

    render(<WelcomeModal workspace="crm" userId="u1" name="Ana" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows again the next day', () => {
    localStorage.setItem('welcome:crm:u1', '2026-10-18')
    atMorning()
    render(<WelcomeModal workspace="crm" userId="u1" name="Ana" />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('remembers each workspace and each person separately', () => {
    localStorage.setItem('welcome:crm:u1', '2026-10-19')
    atMorning()
    render(<WelcomeModal workspace="housekeeping" userId="u1" name="Ana" />)
    expect(screen.getByText('Welcome to your housekeeping page')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    atMorning()
    render(<WelcomeModal workspace="owner" userId="u2" name="Ish" />)
    expect(screen.getByRole('button', { name: 'See my units' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('waits until the page is ready and the person is known', () => {
    atMorning()
    const { rerender } = render(<WelcomeModal workspace="owner" userId="u2" name="Ish" ready={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<WelcomeModal workspace="owner" userId={null} name="Ish" ready />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<WelcomeModal workspace="owner" userId="u2" name="Ish" ready />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('says good evening at night', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:30:00Z')) // 8:30 PM Manila
    render(<WelcomeModal workspace="crm" userId="u1" name="Ana" />)
    expect(screen.getByRole('heading', { name: 'Good evening, Ana' })).toBeInTheDocument()
  })
})
