// src/lib/stay.ts
// Where a guest is in their stay, for Bookings and Housekeeping alike.
// Someone in the CRM confirms the check-out ("Guest checked out"); that
// moment starts the cleaning. A guest may also have a late check-out on
// their last day (bookings.late_checkout_at). The database enforces the
// limits (see 20261015000001_checkout_confirmation.sql); this mirrors them
// for the screens. Times are local to the browser (Manila).
import { supabase } from './supabase'
import { STAY_TIMES } from './utils'

type StayTime = { hour: number; minute: number }

/** A stay day (YYYY-MM-DD) at a stay time, or null. */
export function stayMoment(day, time: StayTime): Date | null {
  const [y, m, d] = String(day || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, time.hour, time.minute)
}

/** When the guest has to be out: the late check-out if there is one, else 11 AM on the check-out day. */
export function checkoutDue(booking): Date | null {
  if (booking?.late_checkout_at) {
    const late = new Date(booking.late_checkout_at)
    if (!Number.isNaN(late.getTime())) return late
  }
  return stayMoment(booking?.check_out, STAY_TIMES.checkOut)
}

export type GuestState =
  | { kind: 'staying'; due: Date }                     // before their check-out time
  | { kind: 'unconfirmed'; due: Date }                 // check-out time has passed today; nobody has confirmed yet
  | { kind: 'left'; at: Date; confirmed: boolean }     // confirmed, or the check-out day is over
  | { kind: 'none' }                                   // no booking or no check-out date

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Whether the guest is still in. A confirmed check-out counts from when it
 * was confirmed. An unconfirmed one only holds things up on the check-out
 * day itself: by the next day the guest is gone, and is taken to have left
 * at their check-out time.
 */
export function guestState(booking, now = Date.now()): GuestState {
  if (!booking?.check_out) return { kind: 'none' }
  if (booking.checked_out_at) {
    const at = new Date(booking.checked_out_at)
    if (!Number.isNaN(at.getTime())) return { kind: 'left', at, confirmed: true }
  }
  const due = checkoutDue(booking)
  if (!due) return { kind: 'none' }
  if (now < due.getTime()) return { kind: 'staying', due }
  if (String(booking.check_out).slice(0, 10) < isoDay(new Date(now))) return { kind: 'left', at: due, confirmed: false }
  return { kind: 'unconfirmed', due }
}

/** Whether the guest has left (confirmed, or their check-out day is over). */
export function hasGuestLeft(booking, now = Date.now()) {
  return guestState(booking, now).kind === 'left'
}

/** The booking checking in to the same unit on this booking's check-out day, if any. */
export function sameDayArrival(booking, bookings: any[]) {
  if (!booking?.check_out || !booking?.unit_id) return null
  const day = String(booking.check_out).slice(0, 10)
  return bookings.find((b) =>
    b.id !== booking.id && !b.deleted_at && b.unit_id === booking.unit_id && String(b.check_in).slice(0, 10) === day,
  ) || null
}

/**
 * The latest a late check-out can be: the next guest's check-in if one
 * arrives that day, otherwise the end of the check-out day.
 */
export function latestCheckout(booking, bookings: any[]): Date | null {
  const next = sameDayArrival(booking, bookings)
  if (next) return stayMoment(next.check_in, STAY_TIMES.checkIn)
  return stayMoment(booking?.check_out, { hour: 23, minute: 59 })
}

/** "Guest checked out" (or undo it). The server records when and who. */
export async function confirmCheckout(bookingId, confirmed = true) {
  const { data, error } = await supabase.rpc('confirm_checkout', { p_booking: bookingId, p_confirmed: confirmed })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}

/** Late check-out until `until` on the check-out day, or back to 11 AM with null. */
export async function setLateCheckout(bookingId, until: Date | null) {
  const { data, error } = await supabase.rpc('set_late_checkout', {
    p_booking: bookingId,
    p_until: until ? until.toISOString() : null,
  })
  if (error) throw error
  return Array.isArray(data) ? data[0] : data
}
