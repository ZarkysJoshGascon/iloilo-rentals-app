// src/lib/domain/closeout.ts
// The nightly contract close-out (supabase/functions/contract-closeout), as
// the CRM describes it for one contract: is the statement emailed, and when
// are the term's bookings and cleanings cleared (or when were they).

/** Contracts that ended before this are left as they were (as in the function). */
export const CLOSEOUT_FROM = '2026-10-19'
/** Days between the statement going out and the records being cleared. */
export const CLEAR_AFTER_DAYS = 30

const DAY_MS = 86_400_000

export type CloseoutState =
  | { kind: 'not-included' }                    // no end date, or ended before CLOSEOUT_FROM
  | { kind: 'running' }                         // still running
  | { kind: 'to-send' }                         // ended: emailed tonight
  | { kind: 'held'; reason: string }            // not emailed automatically, and why
  | { kind: 'clears-on'; date: string }         // emailed: cleared on this day
  | { kind: 'waiting'; note: string }           // due, but something is unfinished
  | { kind: 'cleared'; at: string; bookings: number; cleanings: number; photos: number }

type Statement = { status: string; sent_at?: string | null; error_message?: string | null }

// When a term is over: midnight in Manila after its last day.
const termOver = (expiry: string) => Date.parse(`${expiry}T16:00:00Z`)

/** A UTC moment as the Manila date, YYYY-MM-DD. */
const manilaDate = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)

/**
 * history: the contract's statement log, newest first. today: Manila date.
 */
export function closeoutState(contract: any, history: Statement[], today: string): CloseoutState {
  if (contract?.records_cleared_at) {
    const counts = contract.records_cleared || {}
    return {
      kind: 'cleared',
      at: contract.records_cleared_at,
      bookings: Number(counts.bookings) || 0,
      cleanings: Number(counts.cleanings) || 0,
      photos: Number(counts.photos) || 0,
    }
  }
  const expiry = contract?.expiry_date
  if (!expiry || expiry < CLOSEOUT_FROM) return { kind: 'not-included' }
  if (expiry >= today) return { kind: 'running' }

  const sent = history.find((s) => s.status === 'sent' && s.sent_at && Date.parse(s.sent_at) >= termOver(expiry))
  if (!sent) {
    return history[0]?.status === 'held'
      ? { kind: 'held', reason: history[0].error_message || 'Not emailed automatically.' }
      : { kind: 'to-send' }
  }
  if (contract.closeout_note) return { kind: 'waiting', note: contract.closeout_note }
  return { kind: 'clears-on', date: manilaDate(Date.parse(sent.sent_at!) + CLEAR_AFTER_DAYS * DAY_MS) }
}
