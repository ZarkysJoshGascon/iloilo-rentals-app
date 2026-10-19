import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

vi.mock('@/lib/supabase', () => import('@/test/supabaseMock'))

const { supabase, queryBuilder } = await import('@/test/supabaseMock')
const { ActivityPills } = await import('./ActivityPills')

const ME = 'me-uuid'
const ANA = 'ana-uuid'

function Where() {
  const loc = useLocation()
  return <p data-testid="where">{loc.pathname + loc.search}</p>
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/admin?tab=dashboard']}>
      <Routes>
        <Route path="*" element={<><ActivityPills userId={ME} bottom="20px" /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  )
  const channel = supabase.channel.mock.results.at(-1).value
  return (row: Record<string, any>) => act(() => channel.emit('audit_logs', {
    new: {
      id: `log-${Math.random()}`,
      created_at: new Date().toISOString(),
      user_id: ME,
      action: 'UPDATE',
      table_name: 'bookings',
      record_id: 'booking-1',
      details: { label: 'BK-ABCD2345', changes: { notes: { from: null, to: 'VIP' } } },
      ...row,
    },
  }))
}

beforeEach(() => {
  supabase.channel.mockClear()
  // Profiles look-up: Ana is a known person.
  supabase.from.mockImplementation((table: string) =>
    table === 'profiles'
      ? queryBuilder({ data: [{ id: ANA, full_name: 'Ana Reyes', email: 'ana@example.com', avatar_url: null }], error: null })
      : queryBuilder())
})

describe('ActivityPills', () => {
  it('listens to the work log', () => {
    setup()
    const channel = supabase.channel.mock.results.at(-1).value
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ event: 'INSERT', table: 'audit_logs' }), expect.any(Function))
  })

  it('shows your own change as "You edited booking …" with the first change', async () => {
    const emit = setup()
    await emit({})
    const pill = await screen.findByText(/You/)
    expect(pill.closest('button')).toHaveTextContent('You edited booking BK-ABCD2345 · Notes: — → VIP')
  })

  it('names other people', async () => {
    const emit = setup()
    await emit({ user_id: ANA, action: 'INSERT', table_name: 'cleanings', record_id: 'cl-1', details: { label: 'CL-XYZ', changes: {} } })
    expect(await screen.findByText(/Ana Reyes/)).toBeInTheDocument()
    expect(screen.getByText('added')).toBeInTheDocument()
  })

  it('colours additions green, edits blue and removals red', async () => {
    const emit = setup()
    await emit({ action: 'INSERT', details: { label: 'BK-1', changes: {} } })
    await emit({ action: 'UPDATE', details: { label: 'BK-2', changes: { notes: { from: 'a', to: 'b' } } } })
    await emit({ action: 'DELETE', details: { label: 'BK-3', changes: {} } })
    expect(screen.getByText('created').className).toMatch(/emerald/)
    expect(screen.getByText('edited').className).toMatch(/blue/)
    expect(screen.getByText('deleted').className).toMatch(/red/)
  })

  it('skips the page\'s own named log entries (only row changes become pills)', async () => {
    const emit = setup()
    await emit({ action: 'CREATE_BOOKING' })
    expect(screen.queryByText(/You/)).not.toBeInTheDocument()
  })

  it('leaves website inquiries to their own notice', async () => {
    const emit = setup()
    await emit({ user_id: null, action: 'INSERT', table_name: 'property_inquiries', details: { label: 'Juan Cruz', changes: {} } })
    expect(screen.queryByText(/Juan Cruz/)).not.toBeInTheDocument()
  })

  it('opens the record when clicked', async () => {
    const emit = setup()
    await emit({})
    fireEvent.click((await screen.findByText(/You/)).closest('button')!)
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/admin?tab=bookings&booking=booking-1'))
  })

  it('keeps at most three on screen, newest last', async () => {
    const emit = setup()
    for (const code of ['BK-1', 'BK-2', 'BK-3', 'BK-4']) await emit({ details: { label: code, changes: { notes: { from: null, to: 'x' } } } })
    expect(screen.queryByText('BK-1')).not.toBeInTheDocument()
    expect(screen.getByText('BK-4')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(3)
  })

  it('can be dismissed, and fades on its own after 5 seconds', async () => {
    const emit = setup()
    await emit({ details: { label: 'BK-1', changes: {} } })
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByText('BK-1')).not.toBeInTheDocument())

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await emit({ details: { label: 'BK-2', changes: {} } })
    expect(screen.getByText('BK-2')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(5_000) })
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByText('BK-2')).not.toBeInTheDocument())
  })
})
