// The nightly contract close-out's decisions (contract-closeout/rules.js):
// when a statement is emailed, when a term's records are cleared, and why
// either waits. These decide what gets deleted, so every edge is pinned down.
import { describe, expect, it } from 'vitest'
import {
  CLOSEOUT_FROM, CLEAR_AFTER_DAYS, termOver, statementForTerm, nextStep, holdReason, unfinishedNote, photoPaths, PHOTO_COLUMNS,
} from '../../../../supabase/functions/contract-closeout/rules.js'
import * as crm from '@/lib/domain/closeout'

const at = (iso) => Date.parse(iso)
const ended = { expiry_date: '2026-11-15', records_cleared_at: null }
// The term is over at midnight Manila after Nov 15 = Nov 15, 16:00 UTC.
const sentAfterEnd = { status: 'sent', sent_at: '2026-11-15T17:00:00Z' }

describe('termOver', () => {
  it('is midnight in Manila after the last day', () => {
    expect(new Date(termOver('2026-11-15')).toISOString()).toBe('2026-11-15T16:00:00.000Z')
  })
})

describe('statementForTerm', () => {
  it('is the newest statement emailed after the term was over', () => {
    const later = { status: 'sent', sent_at: '2026-11-20T01:00:00Z' }
    expect(statementForTerm([later, sentAfterEnd], '2026-11-15')).toBe(later)
  })

  it('ignores statements sent before the end, and ones that weren\'t sent', () => {
    expect(statementForTerm([
      { status: 'sent', sent_at: '2026-11-15T15:59:59Z' }, // 11:59 PM on the last day
      { status: 'held', sent_at: null },
      { status: 'failed', sent_at: '2026-11-16T01:00:00Z' },
      { status: 'queued', sent_at: null },
    ], '2026-11-15')).toBeNull()
    expect(statementForTerm(null, '2026-11-15')).toBeNull()
  })
})

describe('nextStep', () => {
  it.each([
    ['has no end date', { expiry_date: null }],
    ['ended before the close-out began', { expiry_date: '2026-10-18' }],
    ['was already cleared', { ...ended, records_cleared_at: '2026-12-20T17:00:00Z' }],
  ])('skips a contract that %s', (_why, contract) => {
    expect(nextStep(contract, [], at('2027-06-01T00:00:00Z'))).toBe('skip')
  })

  it('waits until the last day is over', () => {
    expect(nextStep(ended, [], at('2026-11-15T15:59:59Z'))).toBe('skip')
    expect(nextStep(ended, [], at('2026-11-15T16:00:00Z'))).toBe('send')
  })

  it('includes a contract ending on the first day of the close-out', () => {
    expect(nextStep({ expiry_date: CLOSEOUT_FROM }, [], at('2026-10-20T00:00:00Z'))).toBe('send')
  })

  it('emails the statement while none covers the term', () => {
    expect(nextStep(ended, [{ status: 'held', sent_at: null }], at('2026-11-16T17:00:00Z'))).toBe('send')
  })

  it('keeps the records for 30 days after the statement went out, then clears them', () => {
    const sentMs = at(sentAfterEnd.sent_at)
    const day = 86_400_000
    expect(nextStep(ended, [sentAfterEnd], sentMs + 1)).toBe('wait')
    expect(nextStep(ended, [sentAfterEnd], sentMs + CLEAR_AFTER_DAYS * day - 1)).toBe('wait')
    expect(nextStep(ended, [sentAfterEnd], sentMs + CLEAR_AFTER_DAYS * day)).toBe('clear')
    expect(nextStep(ended, [sentAfterEnd], sentMs + 90 * day)).toBe('clear')
  })
})

describe('holdReason', () => {
  it('holds a statement for an owner with no email', () => {
    expect(holdReason({ hasEmail: false, warnings: [] })).toMatch(/no email address/)
  })

  it('holds one whose figures differ from Accounting, counting months once', () => {
    const warnings = [
      { month: 'Oct 2026', label: 'Gross income' },
      { month: 'Oct 2026', label: 'Net income' },
      { month: 'Nov 2026', label: 'Gross income' },
    ]
    expect(holdReason({ hasEmail: true, warnings })).toBe(
      'Its figures differ from the Accounting page for 2 months. Download it to check, then email it from the contract.')
    expect(holdReason({ hasEmail: true, warnings: warnings.slice(0, 1) })).toMatch(/for 1 month\./)
  })

  it('lets a clean statement go', () => {
    expect(holdReason({ hasEmail: true, warnings: [] })).toBeNull()
    expect(holdReason({ hasEmail: true, warnings: undefined })).toBeNull()
  })
})

describe('unfinishedNote', () => {
  it('lists everything still unsettled, in plain words', () => {
    expect(unfinishedNote({ unpaid_bookings: 1, open_cleanings: 2, unpaid_cleanings: 0 })).toBe(
      'Bookings and cleanings are kept until these are settled: 1 booking with a balance still owed; 2 cleanings not yet approved.')
    expect(unfinishedNote({ unpaid_bookings: 0, open_cleanings: 0, unpaid_cleanings: 3 })).toMatch(/3 cleanings with housekeeping or laundry pay not yet paid\.$/)
  })

  it('is nothing when all is settled', () => {
    expect(unfinishedNote({ unpaid_bookings: 0, open_cleanings: 0, unpaid_cleanings: 0 })).toBeNull()
  })
})

describe('photoPaths', () => {
  it('collects every photo of every cleaning, lists and single photos alike', () => {
    expect(PHOTO_COLUMNS).toHaveLength(7)
    expect(photoPaths([
      { photos_before: [{ path: 'c1/b1.jpg' }, { path: 'c1/b2.jpg' }], photos_after: [], photos_report: null, amenities_used_photo: { path: 'c1/am.jpg' } },
      { laundry_replaced_photo: { path: 'c2/lr.jpg' }, photos_after: [{ path: '' }, null, { path: 42 }] },
    ])).toEqual(['c1/b1.jpg', 'c1/b2.jpg', 'c1/am.jpg', 'c2/lr.jpg'])
  })

  it('is empty for no cleanings', () => {
    expect(photoPaths(null)).toEqual([])
    expect(photoPaths([{}])).toEqual([])
  })
})

describe('the CRM shows what the nightly job does', () => {
  it('uses the same start date and waiting time', () => {
    expect(crm.CLOSEOUT_FROM).toBe(CLOSEOUT_FROM)
    expect(crm.CLEAR_AFTER_DAYS).toBe(CLEAR_AFTER_DAYS)
  })

  // The CRM's state for a contract must match the job's next step.
  const EXPECTED = { 'not-included': ['skip'], running: ['skip'], 'to-send': ['send'], held: ['send'], 'clears-on': ['wait', 'clear'], cleared: ['skip'] }
  it.each([
    ['no end date', { expiry_date: null }, []],
    ['ended before the close-out', { expiry_date: '2026-10-01' }, []],
    ['still running', { expiry_date: '2026-12-31' }, []],
    ['ended, nothing sent', ended, []],
    ['ended, statement held', ended, [{ status: 'held', error_message: 'No email' }]],
    ['statement sent last week', ended, [sentAfterEnd]],
    ['already cleared', { ...ended, records_cleared_at: '2026-12-20T17:00:00Z', records_cleared: {} }, [sentAfterEnd]],
  ])('%s', (_case, contract, statements) => {
    const now = at('2026-11-22T04:00:00Z')
    const state = crm.closeoutState(contract, statements, '2026-11-22')
    expect(EXPECTED[state.kind], `CRM says ${state.kind}`).toContain(nextStep(contract, statements, now))
  })
})
