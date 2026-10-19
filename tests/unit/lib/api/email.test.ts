import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeBooking } from '../../factories'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))
vi.mock('@/lib/images', () => ({ preparePhoto: vi.fn(async (f: Blob) => f) }))

const { supabase, queryBuilder } = await import('../../supabaseMock')
const {
  formatDateLong, formatMoney, computeNights, sendBookingConfirmation,
  downloadContractStatement, sendContractStatement, listContractStatements,
  listPastGuests, listPastGuestsFiltered,
} = await import('@/lib/api/email')

// The app calls fetch(url, { headers, body }) with a JSON body.
type Fetch = (url: string, init: { headers: Record<string, string>; body: string }) => Promise<Response>
const respond = (status: number, body: unknown) => vi.fn<Fetch>(async () => new Response(JSON.stringify(body), { status }))
const sentBody = (fetch: ReturnType<typeof respond>) => JSON.parse(fetch.mock.calls[0][1].body)

beforeEach(() => {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'admin-token' } } })
})

describe('formatters', () => {
  it('writes dates out in full, in the Philippines style', () => {
    expect(formatDateLong('2026-10-19')).toBe('Mon, Oct 19, 2026')
    expect(formatDateLong('')).toBe('—')
    expect(formatDateLong('not a date')).toBe('not a date')
  })

  it('shows pesos and counts nights', () => {
    expect(formatMoney(7500)).toBe('₱7,500')
    expect(computeNights('2026-10-19', '2026-10-22')).toBe(3)
    expect(computeNights('2026-10-22', '2026-10-19')).toBe(0)
    expect(computeNights(null, '2026-10-22')).toBe(0)
  })
})

describe('sendBookingConfirmation', () => {
  it('sends as the signed-in admin', async () => {
    const fetch = respond(200, { ok: true, to: 'guest@example.com' })
    vi.stubGlobal('fetch', fetch)
    expect(await sendBookingConfirmation('b1')).toEqual({ ok: true, to: 'guest@example.com' })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-token')
    expect(sentBody(fetch)).toEqual({ booking_id: 'b1' })
  })

  it('shows the server\'s reason, or the status if it gave none', async () => {
    vi.stubGlobal('fetch', respond(400, { error: 'The guest has no email address.' }))
    await expect(sendBookingConfirmation('b1')).rejects.toThrow('The guest has no email address.')
    vi.stubGlobal('fetch', respond(502, {}))
    await expect(sendBookingConfirmation('b1')).rejects.toThrow('Send failed (502)')
  })

  it('needs a booking and a signed-in admin', async () => {
    await expect(sendBookingConfirmation(null)).rejects.toThrow('Missing booking id')
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    await expect(sendBookingConfirmation('b1')).rejects.toThrow('Not signed in')
  })
})

describe('owner statements', () => {
  it('downloads the statement as an Excel file with the server\'s name for it', async () => {
    const fetch = respond(200, { filename: 'Statement-9S-CT-0001.xlsx', file: btoa('xlsx bytes'), warnings: [] })
    vi.stubGlobal('fetch', fetch)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let saved: Blob | null = null
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn((b: Blob) => { saved = b; return 'blob:statement' }), revokeObjectURL: vi.fn() })

    const result = await downloadContractStatement('c1')

    expect(sentBody(fetch)).toEqual({ contract_id: 'c1', mode: 'download' })
    expect(click).toHaveBeenCalledTimes(1)
    expect(saved!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(await saved!.text()).toBe('xlsx bytes')
    expect(result).toEqual({ filename: 'Statement-9S-CT-0001.xlsx', warnings: [], archived: false })
  })

  it('says when the download is the copy kept after the records were cleared', async () => {
    vi.stubGlobal('fetch', respond(200, { filename: 'kept.xlsx', file: btoa('x'), archived: true }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    expect((await downloadContractStatement('c1')).archived).toBe(true)
  })

  it('emails the statement, forcing it past a mismatch only when asked', async () => {
    const fetch = respond(200, { ok: true, to: 'owner@example.com' })
    vi.stubGlobal('fetch', fetch)
    await sendContractStatement('c1')
    await sendContractStatement('c1', { force: true })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ contract_id: 'c1', mode: 'send' })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ contract_id: 'c1', mode: 'send', force: true })
  })

  it('turns "figures differ from Accounting" into an error the page can ask about', async () => {
    const warnings = [{ month: 'Oct 2026', label: 'Gross income', sheet: 35000, accounting: 32000 }]
    vi.stubGlobal('fetch', respond(409, { error: 'The statement differs from the Accounting page for some months.', code: 'mismatch', warnings }))
    await expect(sendContractStatement('c1')).rejects.toMatchObject({
      message: 'The statement differs from the Accounting page for some months.', code: 'mismatch', warnings,
    })
  })

  it('explains a missing function', async () => {
    vi.stubGlobal('fetch', respond(404, {}))
    await expect(sendContractStatement('c1')).rejects.toThrow('The statement function is not deployed yet.')
  })

  it('lists past statement emails, or nothing if the history can\'t be read', async () => {
    const rows = [{ id: 's1', status: 'sent', automatic: true }]
    supabase.from.mockReturnValue(queryBuilder({ data: rows, error: null }))
    expect(await listContractStatements('c1')).toEqual(rows)

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabase.from.mockReturnValue(queryBuilder({ data: null, error: { message: 'relation does not exist' } }))
    expect(await listContractStatements('c1')).toEqual([])
    expect(await listContractStatements(null)).toEqual([])
  })
})

describe('past guests (campaign audience)', () => {
  const stays = [
    makeBooking({ guest_email: ' Ana@Example.com ', guest_name: 'Ana Reyes', check_out: '2026-10-01', units: { unit_code: '9S', building: 'Saint Honore' } }),
    makeBooking({ guest_email: 'ana@example.com', guest_name: 'Ana R.', check_out: '2026-04-01', units: { unit_code: '12B', building: 'Atria' } }),
    makeBooking({ guest_email: 'ben@example.com', guest_name: 'Ben Ong', check_out: '2025-12-01', units: null }),
    makeBooking({ guest_email: '   ', guest_name: 'No email' }),
  ]

  it('lists each guest once, by their latest stay (newest first from the database)', async () => {
    supabase.from.mockReturnValue(queryBuilder({ data: stays, error: null }))
    expect(await listPastGuests()).toEqual([
      { email: 'ana@example.com', name: 'Ana Reyes', last_check_out: '2026-10-01', last_unit: '9S', last_building: 'Saint Honore' },
      { email: 'ben@example.com', name: 'Ben Ong', last_check_out: '2025-12-01', last_unit: '', last_building: '' },
    ])
  })

  it('can keep only guests who stayed within the last few months', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T04:00:00Z'))
    supabase.from.mockReturnValue(queryBuilder({ data: stays, error: null }))
    expect((await listPastGuestsFiltered(6)).map((g) => g.email)).toEqual(['ana@example.com'])
    expect((await listPastGuestsFiltered(null)).map((g) => g.email)).toEqual(['ana@example.com', 'ben@example.com'])
  })
})
