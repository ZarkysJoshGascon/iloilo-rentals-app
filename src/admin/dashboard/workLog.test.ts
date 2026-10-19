import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('@/test/supabaseMock'))

const { manilaToday, manilaDayStart, manilaMonthRange, describeEntry, fieldLabel } = await import('./workLog')

const people = { u1: { id: 'u1', name: 'Ana Reyes', avatar: null } }

function entry(over: Record<string, any>) {
  return {
    id: 'e1',
    created_at: '2026-10-19T03:05:00Z',
    user_id: 'u1',
    action: 'UPDATE',
    table_name: 'bookings',
    record_id: 'r1',
    details: { label: 'BK-ABCD2345', changes: {} },
    ...over,
  } as any
}

describe('Manila dates', () => {
  afterEach(() => vi.useRealTimers())

  it('is still yesterday in UTC but already today in Manila at 7 AM', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T23:00:00Z')) // 7 AM Oct 19 in Manila
    expect(manilaToday()).toBe('2026-10-19')
  })
  it('starts the Manila day at 16:00 UTC the evening before', () => {
    expect(manilaDayStart('2026-10-19')).toBe('2026-10-18T16:00:00.000Z')
  })
  it('gives this month and the next, across a year end', () => {
    expect(manilaMonthRange('2026-12-05')).toEqual({ start: '2026-12-01', next: '2027-01-01' })
    expect(manilaMonthRange('2026-10-19')).toEqual({ start: '2026-10-01', next: '2026-11-01' })
  })
})

describe('describeEntry', () => {
  it('names the person, the verb, the record and the change', () => {
    const d = describeEntry(entry({ details: { label: 'BK-ABCD2345', guest: 'Maria Santos', unit: 'S1 408', changes: { notes: { from: null, to: 'Late arrival' } } } }), people)
    expect(d).toMatchObject({ actor: 'Ana Reyes', verb: 'edited', noun: 'booking', label: 'BK-ABCD2345', area: 'bookings' })
    expect(d.context).toEqual(['Maria Santos', 'S1 408'])
    expect(d.changes).toEqual([{ key: 'notes', label: 'Notes', from: '—', to: 'Late arrival', list: false }])
    expect(d.href).toBe('/admin?tab=bookings&booking=r1')
  })

  it('says "created" for a new booking and links to it', () => {
    const d = describeEntry(entry({ action: 'INSERT' }), people)
    expect(d.verb).toBe('created')
    expect(d.href).toBe('/admin?tab=bookings&booking=r1')
  })

  it('has no link once something is deleted', () => {
    expect(describeEntry(entry({ action: 'DELETE' }), people)).toMatchObject({ verb: 'deleted', href: null })
  })

  it.each([
    [{ deleted_at: { from: null, to: '2026-10-19T03:00:00Z' } }, 'deleted'],
    [{ cancelled_at: { from: null, to: '2026-10-19T03:00:00Z' } }, 'cancelled'],
    [{ completed_at: { from: null, to: '2026-10-19T03:00:00Z' } }, 'completed'],
    [{ checked_out_at: { from: null, to: '2026-10-19T03:00:00Z' } }, 'confirmed check-out on'],
    [{ checked_out_at: { from: '2026-10-19T03:00:00Z', to: null } }, 'undid the check-out on'],
    [{ late_checkout_at: { from: null, to: '2026-10-19T05:00:00Z' } }, 'set a late check-out on'],
    [{ transactions: {}, amount_paid: { from: 0, to: 2000 } }, 'recorded a payment on'],
  ])('reads booking change %o as "%s"', (changes, verb) => {
    expect(describeEntry(entry({ details: { label: 'BK-1', changes } }), people).verb).toBe(verb)
  })

  it('reads a cleaning approval and a housekeeper submission', () => {
    const paid = describeEntry(entry({ table_name: 'cleanings', details: { label: 'CL-1', changes: { paid_at: { from: null, to: '2026-10-19T03:00:00Z' }, status: { from: 'submitted', to: 'completed' } } } }), people)
    expect(paid.verb).toBe('approved and paid')
    expect(paid.changes.map((c) => c.key)).not.toContain('status')
    const sub = describeEntry(entry({ table_name: 'cleanings', details: { label: 'CL-1', changes: { submitted_at: { from: null, to: '2026-10-19T03:00:00Z' } } } }), people)
    expect(sub.verb).toBe('submitted')
  })

  it('shows a cleaning\'s "submitted" status as "To be evaluated"', () => {
    const d = describeEntry(entry({ table_name: 'cleanings', details: { label: 'CL-1', changes: { status: { from: 'ready', to: 'submitted' } } } }), people)
    expect(d.changes[0]).toMatchObject({ label: 'Status', from: 'Ready', to: 'To be evaluated' })
  })

  it('formats money, dates and percentages', () => {
    const d = describeEntry(entry({ details: { label: 'BK-1', changes: {
      total_amount: { from: 5000, to: 6500.5 },
      check_out: { from: '2026-10-22', to: '2026-10-24' },
      booker_rate: { from: 10, to: 8 },
    } } }), people)
    const byKey = Object.fromEntries(d.changes.map((c) => [c.key, c]))
    expect(byKey.total_amount).toMatchObject({ from: '₱5,000', to: '₱6,500.5' })
    expect(byKey.check_out.to).toMatch(/Oct 24, 2026/)
    expect(byKey.booker_rate).toMatchObject({ from: '10%', to: '8%' })
  })

  it('shows an uploaded photo or PDF as added / replaced / removed, once', () => {
    const d = describeEntry(entry({ table_name: 'contract_monthly_expenses', details: { contract: 'CT-9', month: '2026-10', changes: {
      electricity_image: { from: null, to: 'https://x/a.jpg' },
      contract_pdf_url: { from: 'https://x/old.pdf', to: 'https://x/new.pdf' },
      contract_pdf_path: { from: 'old.pdf', to: 'new.pdf' },
    } } }), people)
    expect(d.label).toBe('CT-9')
    expect(d.changes.map((c) => `${c.label} ${c.note}`)).toEqual(['Electricity image added', 'Contract PDF replaced'])
  })

  it('calls a website submission by the visitor\'s name and groups it under Website', () => {
    const d = describeEntry(entry({ user_id: null, action: 'INSERT', table_name: 'property_inquiries', details: { label: 'Juan Cruz', changes: {} } }), people)
    expect(d).toMatchObject({ actor: 'Juan Cruz', verb: 'sent a', noun: 'property inquiry', label: '', actorKey: 'website', groupName: 'Website' })
    expect(d.context).toContain('Website')
  })

  it('calls an unattributed change System', () => {
    expect(describeEntry(entry({ user_id: null }), people)).toMatchObject({ actor: 'System', actorKey: 'system' })
  })

  it('shows the time in Manila', () => {
    expect(describeEntry(entry({ created_at: '2026-10-19T03:05:00Z' }), people).time).toMatch(/11:05\s?(AM|am)/)
  })
})

describe('fieldLabel', () => {
  it('uses friendly names, falling back to the column name in words', () => {
    expect(fieldLabel('check_in')).toBe('Check-in')
    expect(fieldLabel('housekeeper_id')).toBe('Housekeeper')
    expect(fieldLabel('submitted_at')).toBe('Submitted')
    expect(fieldLabel('some_new_column')).toBe('Some new column')
  })
})
