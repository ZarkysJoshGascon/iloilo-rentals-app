import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  formatMoney, formatPeso, formatDate, formatManilaDate, monthLabel, nightsBetween, moneyTone, bookingStatus, todayISO,
  changeNote, ShareHero, BookingRow, CleaningRow, OWNER_PCT, COMPANY_PCT,
} from '@/owner/ownerUi'
import { makeBooking, makeCleaning } from '../factories'

describe('formats', () => {
  it('splits the money 75 / 25', () => {
    expect(OWNER_PCT + COMPANY_PCT).toBe(100)
  })

  it('shows pesos, with a real minus sign for a loss', () => {
    expect(formatMoney(21375)).toBe('₱21,375.00')
    expect(formatMoney(-750.5)).toBe('−₱750.50')
    expect(formatMoney(null)).toBe('₱0.00')
    expect(formatPeso(250565.4)).toBe('₱250,565')
    expect(formatPeso(-1234.6)).toBe('−₱1,235')
  })

  it('shows dates and months', () => {
    expect(formatDate('2026-10-23')).toBe('Oct 23, 2026')
    expect(formatDate('2026-10-23T22:00:00Z', false)).toBe('Oct 23')
    expect(formatDate(null)).toBe('—')
    expect(monthLabel('2026-10')).toBe('Oct 2026')
    expect(monthLabel('2026-10', true)).toBe('October 2026')
    expect(nightsBetween('2026-10-23', '2026-10-24')).toBe(1)
  })

  it('gives the Manila date of a moment, not the UTC one', () => {
    // The nightly close-out runs at 1 AM Manila: still the day before in UTC.
    expect(formatManilaDate('2026-10-18T17:00:00Z')).toBe('Oct 19, 2026')
    expect(formatManilaDate(null)).toBe('—')
    expect(formatManilaDate('garbage')).toBe('—')
  })

  it('colours profit green, loss red, nothing plain', () => {
    expect(moneyTone(10)).toMatch(/emerald/)
    expect(moneyTone(-10)).toMatch(/red/)
    expect(moneyTone(0)).toBe('text-foreground')
  })
})

describe('bookingStatus (what the owner sees)', () => {
  const today = '2026-10-20'
  it.each([
    [{ check_in: '2026-10-23', check_out: '2026-10-25' }, 'upcoming'],
    [{ check_in: '2026-10-19', check_out: '2026-10-21' }, 'inhouse'],
    [{ check_in: '2026-10-19', check_out: '2026-10-21', completed_at: '2026-10-20T03:00:00Z' }, 'completed'],
    [{ check_in: '2026-10-10', check_out: '2026-10-12' }, 'completed'],
    [{ check_in: '2026-10-23', check_out: '2026-10-25', cancelled_at: '2026-10-01T00:00:00Z' }, 'cancelled'],
  ])('%o is %s', (booking, status) => {
    expect(bookingStatus(booking, today)).toBe(status)
  })

  it('goes by the Manila date, a day ahead of UTC until 8 AM', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T17:30:00Z')) // 1:30 AM, Oct 20, in Manila
    expect(todayISO()).toBe('2026-10-20')
    expect(bookingStatus({ check_in: '2026-10-20', check_out: '2026-10-22' })).toBe('inhouse')
  })
})

describe('changeNote', () => {
  const text = (node: ReturnType<typeof changeNote>) => (node ? render(<p>{node}</p>).container.textContent : null)

  it('shows the change from last month, up or down', () => {
    expect(text(changeNote(13800, 10000, 'Sep'))).toBe('↗ 38% vs Sep')
    expect(text(changeNote(5000, 10000, 'Sep'))).toBe('↘ 50% vs Sep')
    expect(text(changeNote(10000, 10000, 'Sep'))).toBe('Same as Sep')
  })

  it('compares against a loss by its size', () => {
    expect(text(changeNote(500, -1000, 'Aug'))).toBe('↗ 150% vs Aug')
  })

  it('shows nothing when there\'s nothing to compare with', () => {
    expect(changeNote(5000, 0, 'Sep')).toBeNull()
    expect(changeNote(5000, null, 'Sep')).toBeNull()
  })
})

describe('ShareHero', () => {
  const stats = [
    { label: 'Gross income', value: '₱473,800', sub: 'All bookings' },
    { label: 'Expenses', value: '₱139,713' },
    { label: 'Net income', value: '₱334,087', tone: 'text-emerald-600' },
  ]
  const bars = ['Aug', 'Sep', 'Oct'].map((m, i) => ({ key: `2026-${8 + i}`, label: `${m} 2026`, value: [-500, 900, 1500][i] }))

  it('leads with the owner\'s share, the figures behind it underneath', () => {
    render(<ShareHero label="Your share · Jan–Oct 2026" value={250565} note="This month so far ₱54,563" stats={stats} />)
    expect(screen.getByText('Your share · Jan–Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('₱250,565')).toHaveClass('text-emerald-700')
    expect(screen.getByText('This month so far ₱54,563')).toBeInTheDocument()
    for (const s of stats) {
      const term = screen.getByText(s.label)
      expect(within(term.parentElement!).getByText(s.value)).toBeInTheDocument()
    }
  })

  it('shows a bar per month, losses in red, and opens a month when one is tapped', () => {
    const onBarClick = vi.fn()
    render(<ShareHero label="Your share" value={1900} stats={stats} bars={bars} selectedBar="2026-10" onBarClick={onBarClick} />)
    const group = screen.getByRole('group', { name: 'Your share by month' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Aug 2026: −₱500.00', 'Sep 2026: ₱900.00', 'Oct 2026: ₱1,500.00'])
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[0].querySelector('span')).toHaveClass('bg-red-600')

    fireEvent.click(buttons[1])
    expect(onBarClick).toHaveBeenCalledWith('2026-9')
  })

  it('shows bars without buttons when they can\'t be tapped, and none for a single month', () => {
    const { rerender } = render(<ShareHero label="Your share" value={1900} stats={stats} bars={bars} />)
    expect(screen.getByRole('group')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    rerender(<ShareHero label="Your share" value={1900} stats={stats} bars={bars.slice(0, 1)} />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})

describe('BookingRow', () => {
  it('shows the guest, the stay, the amount, the status and the commissions', () => {
    render(<BookingRow booking={makeBooking({
      guest_name: 'Ana Reyes', check_in: '2099-01-10', check_out: '2099-01-13', guests: 3, total_amount: 7500,
      payment_status: 'partial', booker_name: 'Carlo B.', booker_commission: 750, affiliate_commission: 0,
    })} />)
    expect(screen.getByText('Ana Reyes')).toBeInTheDocument()
    expect(screen.getByText(/3 nights · 3 guests/)).toBeInTheDocument()
    expect(screen.getByText('₱7,500.00')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Partly paid')).toBeInTheDocument()
    expect(screen.getByText(/Booker Carlo B\./)).toHaveTextContent('₱750.00')
    expect(screen.queryByText(/Affiliate/)).not.toBeInTheDocument()
  })

  it('crosses out a cancelled stay and gives the reason, without a payment label', () => {
    render(<BookingRow booking={makeBooking({ cancelled_at: '2026-10-01T00:00:00Z', cancelled_reason: 'Guest changed plans', payment_status: 'unpaid' })} />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Reason: Guest changed plans')).toBeInTheDocument()
    expect(screen.queryByText('Unpaid')).not.toBeInTheDocument()
  })
})

describe('CleaningRow', () => {
  it('shows what the cleaning cost: housekeeping plus laundry', () => {
    render(<CleaningRow cleaning={makeCleaning({ type: 'deep', status: 'submitted', payment_amount: 500, laundry_payment_amount: 250, booking_code: 'BK-AAAA2222', guest_name: 'Ana Reyes' })} />)
    expect(screen.getByText('deep')).toBeInTheDocument()
    expect(screen.getByText('₱750.00')).toBeInTheDocument()
    expect(screen.getByText('In review')).toBeInTheDocument()
    expect(screen.getByText(/\(Ana Reyes\)/)).toBeInTheDocument()
  })
})
