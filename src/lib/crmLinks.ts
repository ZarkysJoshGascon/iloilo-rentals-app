// src/lib/crmLinks.ts
// Links between the CRM pages, for the right-click menus on rows: a booking
// or cleaning can open its contract in Contracts or its month in Accounting
// (with it picked on the calendar), a contract can open in either page.
import { findContractForBooking } from './contracts'

const monthOf = (iso) => String(iso || '').slice(0, 7)

export const crmLink = {
  contract: (contractId) => `/admin?tab=contracts&contract=${contractId}`,
  accounting: (contractId) => `/admin?tab=accounting&contract=${contractId}`,
  /** Accounting, on the booking's check-in month, with the booking picked. */
  accountingBooking: (contractId, booking) =>
    `/admin?tab=accounting&contract=${contractId}&month=${monthOf(booking.check_in)}&booking=${booking.id}`,
  /** Accounting, on the cleaning's month, with the cleaning picked. */
  accountingCleaning: (contractId, cleaning) =>
    `/admin?tab=accounting&contract=${contractId}&month=${monthOf(cleaning.scheduled_date)}&cleaning=${cleaning.id}`,
  booking: (bookingId) => `/admin?tab=bookings&booking=${bookingId}`,
  cleaning: (cleaningId) => `/admin?tab=housekeeping&cleaning=${cleaningId}`,
}

/** The contract a cleaning falls under: the unit's contract on the cleaning's day. */
export function findContractForCleaning(cleaning, contracts) {
  if (!cleaning?.unit_id || !cleaning?.scheduled_date) return null
  return findContractForBooking({ unit_id: cleaning.unit_id, check_in: cleaning.scheduled_date }, contracts)
}
