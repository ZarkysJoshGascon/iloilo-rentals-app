import { describe, expect, it } from 'vitest'
import { closeoutState, CLOSEOUT_FROM } from './closeout'

const ended = { expiry_date: '2026-11-15' }
const today = '2026-11-20'
// Emailed on Nov 16, 9:00 Manila (01:00 UTC): after the term was over.
const sentAfter = { status: 'sent', sent_at: '2026-11-16T01:00:00Z' }

describe('closeoutState', () => {
  it('leaves out contracts with no end, or that ended before the close-out began', () => {
    expect(closeoutState({ expiry_date: null }, [], today).kind).toBe('not-included')
    expect(closeoutState({ expiry_date: '2026-10-18' }, [], today).kind).toBe('not-included')
    expect(CLOSEOUT_FROM).toBe('2026-10-19') // must match supabase/functions/contract-closeout
  })

  it('is running until the last day is over', () => {
    expect(closeoutState({ expiry_date: '2026-11-20' }, [], today).kind).toBe('running')
    expect(closeoutState({ expiry_date: '2026-11-19' }, [], today).kind).toBe('to-send')
  })

  it('shows why a statement was held back', () => {
    const held = { status: 'held', error_message: 'The owner has no email address.' }
    expect(closeoutState(ended, [held], today)).toEqual({ kind: 'held', reason: 'The owner has no email address.' })
  })

  it('does not count a statement emailed before the term was over', () => {
    const early = { status: 'sent', sent_at: '2026-11-15T10:00:00Z' } // 18:00 Manila on the last day
    expect(closeoutState(ended, [early], today).kind).toBe('to-send')
  })

  it('clears 30 days after the statement went out', () => {
    expect(closeoutState(ended, [sentAfter], today)).toEqual({ kind: 'clears-on', date: '2026-12-16' })
  })

  it('says what the records are waiting for', () => {
    const note = 'Bookings and cleanings are kept until these are settled: 1 booking with a balance still owed.'
    expect(closeoutState({ ...ended, closeout_note: note }, [sentAfter], today)).toEqual({ kind: 'waiting', note })
  })

  it('reports what was cleared', () => {
    const cleared = { ...ended, records_cleared_at: '2026-12-16T17:00:00Z', records_cleared: { bookings: 12, cleanings: 11, photos: 140 } }
    expect(closeoutState(cleared, [sentAfter], today)).toEqual({
      kind: 'cleared', at: '2026-12-16T17:00:00Z', bookings: 12, cleanings: 11, photos: 140,
    })
  })
})
