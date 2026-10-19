// A made-up owner for the owner portal tests, with figures small enough to
// check by hand. "Today" is Tuesday, Oct 20, 2026 (the tests fix the clock).
//
// Maria Santos owns two units:
//   9S   Saint Honore, Studio      Aug 1, 2026 – Jul 31, 2027
//        Aug  gross 30,000  expenses 10,149  net 19,851  her share 14,888.25
//        Sep  gross 40,000  expenses 12,449  net 27,551  her share 20,663.25
//        Oct  gross 25,000  expenses  4,000  net 21,000  her share 15,750.00
//        → her share so far 51,301.50 (shown ₱51,302)
//   12B  Atria Tower, 1 Bedroom    Sep 15, 2026 – Sep 14, 2027
//        Sep  gross 12,000  expenses  2,000  net 10,000  her share  7,500
//        Oct  gross 16,000  expenses  4,000  net 12,000  her share  9,000
//        → 16,500
//   2026: gross 123,000, expenses 32,598, net 90,402, her share 67,801.50 (₱67,802)
//         this month 24,750, last month 28,163.25 (₱28,163)
import type { TestUser } from './fakeSupabase'

export const TODAY = new Date('2026-10-20T12:00:00+08:00')
export const OWNER: TestUser = { id: '11111111-1111-4111-8111-111111111111', email: 'maria.owner@example.com', name: 'Maria Santos' }

export const UNIT_9S = 'contract-9s'
export const UNIT_12B = 'contract-12b'

const month = (key: string, f: {
  gross: number; booking_comm?: number; affiliate_comm?: number; housekeeping?: number; laundry?: number
  electricity?: number; internet?: number; water?: number; marketing?: number; custom_total?: number
}) => {
  const lines = { booking_comm: 0, affiliate_comm: 0, housekeeping: 0, laundry: 0, electricity: 0, internet: 0, water: 0, marketing: 0, custom_total: 0, ...f }
  const total = lines.booking_comm + lines.affiliate_comm + lines.housekeeping + lines.laundry
    + lines.electricity + lines.internet + lines.water + lines.marketing + lines.custom_total
  const net = f.gross - total
  return { month: `${key}-01`, ...lines, total_expenses: total, net, owner_share: net * 0.75, company_share: net * 0.25, pm_share: 0, pm_name: null }
}

const booking = (code: string, guest: string, checkIn: string, checkOut: string, total: number, extra: Record<string, unknown> = {}) => ({
  id: `b-${code}`, booking_code: code, guest_name: guest, guests: 2, check_in: checkIn, check_out: checkOut,
  total_amount: total, amount_paid: total, balance: 0, payment_status: 'paid',
  booker_name: null, booker_commission: 0, affiliate_name: null, affiliate_commission: 0,
  cancelled_at: null, cancelled_reason: null, completed_at: null, ...extra,
})

function unit9s() {
  const contract = {
    id: UNIT_9S, contract_code: 'CT-9S-0001', unit_id: 'unit-9s', effective_date: '2026-08-01', expiry_date: '2027-07-31',
    superseded_by: null, previous_expiry_dates: [], records_cleared_at: null as string | null,
    unit_code: '9S', building: 'Saint Honore', unit_type: 'Studio', marketing_title: null,
    // Booked so far: 3 + 4 nights, and 2 of Dana's (Oct 19–20); Aug 1 – Oct 20 is 81 days.
    nights_booked: 9, days_elapsed: 81, upcoming_bookings: 4, next_check_in: '2026-10-24',
  }
  return {
    contract,
    months: [
      month('2026-08', { gross: 30_000, booking_comm: 3_000, housekeeping: 1_500, laundry: 750, electricity: 2_000, internet: 1_699, water: 400, custom_total: 800 }),
      month('2026-09', { gross: 40_000, booking_comm: 4_000, affiliate_comm: 1_000, housekeeping: 2_000, laundry: 1_000, electricity: 2_300, internet: 1_699, water: 450 }),
      month('2026-10', { gross: 25_000, booking_comm: 2_500, housekeeping: 1_000, laundry: 500 }),
    ],
    bookings: [
      booking('BK-9S0001', 'Ana Reyes', '2026-08-05', '2026-08-08', 7_500, { completed_at: '2026-08-08T03:00:00Z', booker_name: 'Carlo B.', booker_commission: 750 }),
      booking('BK-9S0002', 'Ben Ong', '2026-09-10', '2026-09-14', 10_000, { completed_at: '2026-09-14T03:00:00Z', affiliate_name: 'Iloilo Travel Co.', affiliate_commission: 1_000 }),
      booking('BK-9S0003', 'Carl Diaz', '2026-10-05', '2026-10-07', 5_000, { cancelled_at: '2026-10-01T02:00:00Z', cancelled_reason: 'Flight cancelled' }),
      booking('BK-9S0004', 'Dana Cruz', '2026-10-19', '2026-10-22', 7_500),
      booking('BK-9S0005', 'Eli Tan', '2026-10-24', '2026-10-26', 5_000, { amount_paid: 2_500, balance: 2_500, payment_status: 'partial' }),
      booking('BK-9S0006', 'Faye Lim', '2026-10-28', '2026-10-30', 5_000),
      booking('BK-9S0007', 'Gio Uy', '2026-11-02', '2026-11-05', 7_500),
      booking('BK-9S0008', 'Hana Ong', '2026-11-08', '2026-11-10', 5_000),
    ],
    cleanings: [
      { id: 'c-1', cleaning_code: 'CL-9S0001', scheduled_date: '2026-08-08', type: 'basic', status: 'completed', payment_amount: 500, laundry_payment_amount: 250, booking_code: 'BK-9S0001', guest_name: 'Ana Reyes' },
      { id: 'c-2', cleaning_code: 'CL-9S0002', scheduled_date: '2026-09-14', type: 'basic', status: 'completed', payment_amount: 500, laundry_payment_amount: 250, booking_code: 'BK-9S0002', guest_name: 'Ben Ong' },
      { id: 'c-4', cleaning_code: 'CL-9S0004', scheduled_date: '2026-10-22', type: 'basic', status: 'scheduled', payment_amount: 500, laundry_payment_amount: 250, booking_code: 'BK-9S0004', guest_name: 'Dana Cruz' },
    ],
    expenses: [
      { month: '2026-08-01', electricity: 2_000, electricity_image: `${UNIT_9S}/elec-aug.jpg`, internet: 1_699, internet_image: `${UNIT_9S}/net-aug.jpg`, water: 400, water_image: `${UNIT_9S}/water-aug.jpg`, marketing: 0, marketing_image: null, custom_items: [{ name: 'Aircon cleaning', amount: 800, image: `${UNIT_9S}/aircon.jpg` }] },
      { month: '2026-09-01', electricity: 2_300, electricity_image: `${UNIT_9S}/elec-sep.jpg`, internet: 1_699, internet_image: `${UNIT_9S}/net-sep.jpg`, water: 450, water_image: null, marketing: 0, marketing_image: null, custom_items: [] },
    ],
    extensions: [],
  }
}

function unit12b() {
  const contract = {
    id: UNIT_12B, contract_code: 'CT-12B-0001', unit_id: 'unit-12b', effective_date: '2026-09-15', expiry_date: '2027-09-14',
    superseded_by: null, previous_expiry_dates: [], records_cleared_at: null as string | null,
    unit_code: '12B', building: 'Atria Tower', unit_type: '1 Bedroom', marketing_title: null,
    nights_booked: 0, days_elapsed: 36, upcoming_bookings: 1, next_check_in: '2026-10-25',
  }
  return {
    contract,
    months: [
      month('2026-09', { gross: 12_000, booking_comm: 1_200, housekeeping: 500, laundry: 300 }),
      month('2026-10', { gross: 16_000, booking_comm: 1_600, housekeeping: 1_500, laundry: 900 }),
    ],
    bookings: [booking('BK-12B0001', 'Ivy Sy', '2026-10-25', '2026-10-27', 6_400)],
    cleanings: [],
    expenses: [],
    extensions: [],
  }
}

export type OwnerData = ReturnType<typeof ownerData>

/** The owner, both units in full, and the overview the portal opens with. */
export function ownerData() {
  const units = { [UNIT_9S]: unit9s(), [UNIT_12B]: unit12b() }
  return {
    owners: [{ id: 'owner-1', name: OWNER.name, email: OWNER.email }],
    units,
    overview() {
      const list = Object.values(units)
      return {
        owners: this.owners,
        contracts: list.map((u) => u.contract),
        months: list.flatMap((u) => u.months.map((m) => ({
          contract_id: u.contract.id, month: m.month, gross: m.gross, total_expenses: m.total_expenses,
          net: m.net, owner_share: m.owner_share, pm_share: m.pm_share,
        }))),
      }
    },
  }
}

/** The database functions the owner portal calls, answered from `data`. */
export function ownerHandlers(data: OwnerData) {
  return {
    rpc: {
      is_owner: () => data.owners.length > 0,
      owner_portal_overview: () => data.overview(),
      owner_contract_detail: ({ p_contract_id }: { p_contract_id: string }) =>
        data.units[p_contract_id] ?? new Error('Contract not found'),
    },
  }
}
