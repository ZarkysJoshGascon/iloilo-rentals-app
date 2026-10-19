// src/lib/domain/cleaningStatus.ts
// A cleaning's status is a small state machine: scheduled → ready (the guest
// left) → submitted (the housekeeper sent photos; "to be evaluated") →
// completed (approved and paid). It can't move backward from completed, and
// the submit → approve step can't be skipped. The Housekeeping page shows a
// status that also accounts for the guest having left.
import { hasGuestLeft } from '@/lib/domain/stay'

export const VALID_CLEANING_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['ready', 'cancelled'],
  ready:     ['submitted', 'cancelled'],
  submitted: ['completed', 'ready'],
  completed: [],
  cancelled: [],
}

export function canCleaningTransition(from, to) {
  if (from === to) return true
  const allowed = VALID_CLEANING_TRANSITIONS[from] || []
  return allowed.includes(to)
}

export function getEffectiveStatus(cleaning) {
  if (cleaning.status === 'completed') return 'completed'
  if (cleaning.status === 'cancelled') return 'cancelled'
  if (cleaning.status === 'submitted') return 'to-be-evaluated'
  if (!cleaning.bookings?.check_out) return 'ready'
  // Ready once the guest has left: confirmed in Bookings, or their check-out day is over.
  return hasGuestLeft(cleaning.bookings) ? 'ready' : 'scheduled'
}

export function isPendingEvaluation(cleaning) {
  return cleaning.status === 'submitted'
}
