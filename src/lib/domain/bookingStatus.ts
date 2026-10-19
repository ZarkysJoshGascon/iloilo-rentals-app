// src/lib/domain/bookingStatus.ts
// Where a booking stands, as the Bookings page shows and filters it:
//   upcoming         before the check-in day
//   in-house         from the check-in day until someone confirms the guest
//                    left, or the check-out day is over
//   checked-out      the guest has left and it's paid
//   needs-attention  the guest has left and it isn't paid
//   completed        marked done
// Dates are compared as local days (the browser in Manila).

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function parseDateOnly(d) {
  if (!d) return null
  return startOfDay(new Date(d))
}

export type BookingStatus = 'upcoming' | 'in-house' | 'checked-out' | 'needs-attention' | 'completed'

export function deriveBookingStatus(b, now: Date = new Date()): BookingStatus {
  if (b.completed_at) return 'completed'
  const t = startOfDay(now)
  const ci = parseDateOnly(b.check_in)
  const co = parseDateOnly(b.check_out)
  if (!ci || !co) return 'upcoming'
  if (t < ci) return 'upcoming'
  // In the unit until someone confirms they've left, or the check-out day is over.
  if (t <= co && !b.checked_out_at) return 'in-house'
  return b.payment_status === 'paid' ? 'checked-out' : 'needs-attention'
}
