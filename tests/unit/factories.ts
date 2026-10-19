// Test data builders: a valid record with sensible defaults, and only the
// fields a test cares about given explicitly.
//
//   makeBooking({ check_in: '2026-03-05', total_amount: 10_000 })
//
// Ids come from a counter, not Math.random(), so every run builds the same data.
let seq = 0
const nextId = (prefix: string) => `${prefix}-${++seq}`

type Row = Record<string, any>

export function makeBooking(over: Row = {}): Row {
  const id = over.id ?? nextId('booking')
  return {
    id,
    booking_code: `BK-${id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-8).padStart(8, 'A')}`,
    unit_id: 'unit-1',
    guest_name: 'Maria Santos',
    guests: 2,
    check_in: '2026-10-19',
    check_out: '2026-10-22',
    total_amount: 7_500,
    amount_paid: 0,
    balance: 7_500,
    payment_status: 'unpaid',
    booker_commission: 0,
    affiliate_commission: 0,
    cancelled_at: null,
    completed_at: null,
    deleted_at: null,
    ...over,
  }
}

export function makeCleaning(over: Row = {}): Row {
  const id = over.id ?? nextId('cleaning')
  return {
    id,
    cleaning_code: `CL-${String(seq).padStart(8, '2')}`,
    unit_id: 'unit-1',
    booking_id: null,
    scheduled_date: '2026-10-22',
    type: 'basic',
    status: 'scheduled',
    payment_amount: 500,
    laundry_payment_amount: 0,
    photos_before: [],
    photos_after: [],
    photos_report: [],
    amenities_used_photo: null,
    amenities_replaced_photo: null,
    laundry_used_photo: null,
    laundry_replaced_photo: null,
    ...over,
  }
}

export function makeContract(over: Row = {}): Row {
  const id = over.id ?? nextId('contract')
  return {
    id,
    contract_code: `CT-${String(seq).padStart(8, '3')}`,
    unit_id: 'unit-1',
    effective_date: '2026-01-01',
    expiry_date: '2026-12-31',
    superseded_by: null,
    records_cleared_at: null,
    closeout_note: null,
    ...over,
  }
}

/** A photo as stored on a cleaning: where it is, when and how big. */
export function makePhoto(path: string): Row {
  return { path, uploaded_at: '2026-10-19T03:00:00.000Z', size: 120_000 }
}
