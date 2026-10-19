// A made-up housekeeper for the housekeeping page tests: Rosa, with one
// cleaning ready to do today in unit 9S (the guest left at 10:30 AM).
// "Today" is Tuesday, Oct 20, 2026 (the tests fix the clock).
import type { TestUser } from './fakeSupabase'

export const TODAY = new Date('2026-10-20T13:00:00+08:00')
export const HOUSEKEEPER: TestUser = { id: '22222222-2222-4222-8222-222222222222', email: 'rosa.hk@example.com', name: 'Rosa Dela Cruz' }

export function housekeeperData() {
  const profile = { id: 'hk-1', code: 'HK-0007', name: HOUSEKEEPER.name, email: HOUSEKEEPER.email, photo_url: null, status: 'active' }
  const cleaning = {
    id: 'cl-1', cleaning_code: 'CL-TEST0001', unit_id: 'unit-9s', booking_id: 'b-1', housekeeper_id: 'hk-1',
    scheduled_date: '2026-10-20', type: 'basic', status: 'ready',
    payment_amount: 500, laundry_payment_amount: null, laundry_payment_method: null, laundry_payment_reference: null,
    laundry_payment_note: null, laundry_paid_at: null, paid_at: null,
    photos_before: [], photos_after: [], photos_report: [],
    amenities_used_photo: null, amenities_replaced_photo: null, laundry_used_photo: null, laundry_replaced_photo: null,
    amenities_used_items: [], amenities_replaced_items: [], laundry_used_items: [], laundry_replaced_items: [],
    notes: null, guest_left_at: '2026-10-20T02:30:00Z', checkout_due_at: null, submitted_at: null, completed_at: null,
  }
  const details = {
    cleaning_id: 'cl-1', unit_code: '9S', building: 'Saint Honore', booking_code: 'BK-9S0004',
    check_in: '2026-10-17', check_out: '2026-10-20', next_check_in_at: null,
  }
  return { profile, cleanings: [cleaning], details: [details], submitted: [] as any[] }
}

export type HousekeeperData = ReturnType<typeof housekeeperData>

/** What the housekeeping page asks the database, answered from `data`. */
export function housekeeperHandlers(data: HousekeeperData) {
  return {
    tables: {
      housekeepers: () => [data.profile],
      cleanings: () => data.cleanings,
    },
    rpc: {
      is_owner: () => false,
      housekeeper_cleaning_details: () => data.details,
      housekeeper_submit_cleaning: (args: any) => {
        data.submitted.push(args)
        return null
      },
    },
  }
}
