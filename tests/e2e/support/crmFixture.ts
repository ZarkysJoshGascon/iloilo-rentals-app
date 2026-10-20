// A made-up business for browser tests of the CRM: a few buildings, owners,
// units under contract, bookings around "today", cleanings, staff, inquiries
// and campaigns. Enough of everything, with long names among them, that
// every page fills up the way it does for real and a cut-off list or a row
// too wide for a phone shows. Served by fakeBackend (fakeSupabase.ts); the
// fake answers every read of a table with all its rows, filters ignored.
import type { Handlers } from './fakeSupabase'

export const CRM_TODAY = new Date('2026-10-21T10:00:00+08:00')
export const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Ana Admin' }

const day = (offset: number) => {
  const d = new Date(Date.UTC(2026, 9, 21 + offset))
  return d.toISOString().slice(0, 10)
}
const at = (offset: number, hour = 9) => `${day(offset)}T${String(hour).padStart(2, '0')}:00:00+08:00`
// Codes as long as the real ones (BK- and 8 characters), the same each run.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const code = (prefix: string, n: number) => {
  let s = ''
  for (let i = 0, x = n * 7919 + prefix.charCodeAt(0); i < 8; i++, x = (x * 31 + 17) % 100003) s += ALPHABET[x % ALPHABET.length]
  return `${prefix}-${s}`
}

const BUILDINGS = ['Megaworld Lafayette Square Tower 3', 'Ayala Residences', 'One Madison Place Luxury Residences', 'Avida Towers Atria']
const FIRST = ['Maria Concepcion', 'Juan Miguel', 'Ana', 'Jose Rizalino', 'Kristine Joy', 'Mark', 'Bea', 'Carlos Emmanuel', 'Liza', 'Paolo']
const LAST = ['Villanueva-Dela Cruz', 'Santos', 'Reyes', 'Gonzaga', 'Lopez de Leon', 'Tan', 'Uy', 'Fernandez-Castillo', 'Lim', 'Garcia']
const person = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`
const email = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@examplemail.com`

export const OWNERS = Array.from({ length: 12 }, (_, i) => ({
  id: `owner-${i + 1}`, name: person(i + 2), email: email(person(i + 2)), phone: `+63 917 555 ${String(1000 + i)}`,
  notes: null, created_at: at(-300),
}))

const STATUSES = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'FOR_RENEWAL', 'IN_PROGRESS', 'INACTIVE']
export const UNITS = Array.from({ length: 30 }, (_, i) => {
  const owner = OWNERS[i % OWNERS.length]
  return {
    id: `unit-${i + 1}`, building: BUILDINGS[i % BUILDINGS.length], unit_code: `${10 + (i % 20)}${'ABCDEF'[i % 6]}-${1200 + i}`,
    unit_type: i % 3 ? 'Studio' : '1 Bedroom', marketing_title: `Cozy city view unit ${i + 1}`,
    status: STATUSES[i % STATUSES.length], gc_status: null, owner_id: owner.id,
    ota_listings: { airbnb: `https://www.airbnb.com/rooms/${100000 + i}`, booking: i % 2 ? `https://www.booking.com/hotel/ph/unit-${i}.html` : null },
    inventory_list: null, signed_date: day(-200), current_contract_id: i < 26 ? `c-${i + 1}` : null,
    created_at: at(-300), updated_at: at(-10),
  }
})

const unitRef = (u: (typeof UNITS)[number]) => ({ id: u.id, unit_code: u.unit_code, building: u.building })

export const CONTRACTS = UNITS.slice(0, 26).map((u, i) => {
  const owner = OWNERS.find((o) => o.id === u.owner_id)!
  // A few end within the month, so the expiring lists and alerts fill too.
  const expiry = i % 7 === 0 ? day(5 + i) : day(200 + i * 5)
  return {
    id: `c-${i + 1}`, contract_code: code('CT', i + 1), unit_id: u.id, owner_id: owner.id,
    effective_date: day(-300 + i), expiry_date: expiry, classification: i % 2 ? 'Long term' : 'Short term',
    contract_terms_months: 12, contract_pdf_url: null, contract_pdf_path: null, commission_status: null, voucher_url: null,
    notes: i % 4 ? null : 'Owner prefers updates by email at the end of each month, with receipts attached.',
    superseded_by: null, previous_expiry_dates: [], records_cleared: false, records_cleared_at: null,
    records_archive_drive_url: null, closeout_note: null, created_at: at(-300 + i),
    units: unitRef(u), owners: { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone },
  }
})

export const SPECIALISTS = Array.from({ length: 25 }, (_, i) => ({
  id: `sp-${i + 1}`, code: code('SP', i + 1), name: `${person(i)} (Specialist)`, email: `specialist${i + 1}@examplemail.com`,
  phone: `+63 918 555 ${2000 + i}`, photo_url: null, status: 'active', user_id: null, created_at: at(-200),
}))
export const AFFILIATES = Array.from({ length: 8 }, (_, i) => ({
  id: `af-${i + 1}`, code: code('AF', i + 1), name: `${person(i + 5)} Travel`, email: `affiliate${i + 1}@examplemail.com`,
  phone: null, photo_url: null, status: 'active', user_id: null, created_at: at(-200),
}))
export const HOUSEKEEPERS = Array.from({ length: 6 }, (_, i) => ({
  id: `hk-${i + 1}`, code: code('HK', i + 1), name: person(i + 7), email: `housekeeper${i + 1}@examplemail.com`,
  phone: null, photo_url: null, status: 'active', user_id: null, created_at: at(-200),
}))
export const MANAGERS = Array.from({ length: 3 }, (_, i) => ({
  id: `pm-${i + 1}`, code: code('PM', i + 1), name: person(i + 3), email: `manager${i + 1}@examplemail.com`,
  phone: '+63 919 555 3000', photo_url: null, status: 'active', created_at: at(-200),
}))
export const PM_CONTRACTS = MANAGERS.map((pm, i) => ({
  id: `pmc-${i + 1}`, pm_id: pm.id, unit_id: UNITS[i].id, pm_contract_code: code('PMC', i + 1), pm_share_of_company_pct: 20,
  effective_date: day(-100), expiry_date: day(265), status: 'active', terminated_at: null, termination_effective_date: null,
  pm_pdf_path: null, created_at: at(-100), units: unitRef(UNITS[i]),
}))

// Bookings from two weeks ago to a month ahead: some arriving or leaving
// today, some in the unit now, some coming up, a few paid off and done.
export const BOOKINGS = Array.from({ length: 40 }, (_, i) => {
  const u = UNITS[i % 26]
  const start = -14 + i
  const nights = 1 + (i % 4)
  const total = 2500 * nights + (i % 3) * 750
  const paid = i % 3 === 0 ? total : i % 3 === 1 ? Math.round(total / 2) : 0
  const sp = SPECIALISTS[i % SPECIALISTS.length]
  const af = i % 4 === 0 ? AFFILIATES[i % AFFILIATES.length] : null
  const past = start + nights < 0
  return {
    id: `b-${i + 1}`, booking_code: code('BK', i + 1), unit_id: u.id, units: unitRef(u),
    guest_name: i % 5 === 0 ? 'Maximiliano Alejandro Fernandez-Castillo y Villanueva' : person(i + 1),
    guest_email: email(person(i + 1)), guest_contact: '+63 917 123 4567', guests: 1 + (i % 4),
    check_in: day(start), check_out: day(start + nights),
    total_amount: total, amount_paid: paid, balance: total - paid,
    payment_status: paid === total ? 'paid' : paid ? 'partial' : 'unpaid',
    booker_name: sp.name, booker_code: sp.code, booker_rate: 10, booker_commission: total * 0.1,
    affiliate_name: af?.name ?? null, affiliate_code: af?.code ?? null, affiliate_rate: af ? 5 : null, affiliate_commission: af ? total * 0.05 : 0,
    notes: i % 6 ? null : 'Early check-in requested; arriving on the 6 am flight from Manila with two big suitcases.',
    transactions: paid ? [{ amount: paid, method: 'GCash', paid_at: at(start - 3), reference: `GC${900000 + i}` }] : [],
    created_at: at(start - 10), updated_at: at(start - 5),
    completed_at: past && i % 2 === 0 ? at(start + nights, 15) : null,
    checked_out_at: past ? at(start + nights, 11) : null, checked_out_by_name: past ? ADMIN.name : null,
    late_checkout_at: null, late_checkout_by_name: null,
    cancelled_at: i === 33 ? at(-2) : null, cancelled_reason: i === 33 ? 'Flight cancelled' : null, deleted_at: null,
  }
})

const CLEANING_STATUSES = ['scheduled', 'ready', 'submitted', 'completed', 'completed', 'cancelled']
export const CLEANINGS = BOOKINGS.slice(0, 30).map((b, i) => {
  const hk = HOUSEKEEPERS[i % HOUSEKEEPERS.length]
  const status = CLEANING_STATUSES[i % CLEANING_STATUSES.length]
  return {
    id: `cl-${i + 1}`, cleaning_code: code('CL', i + 1), unit_id: b.unit_id, units: b.units, booking_id: b.id, booking_code: b.booking_code,
    bookings: { id: b.id, booking_code: b.booking_code, guest_name: b.guest_name, check_in: b.check_in, check_out: b.check_out, checked_out_at: b.checked_out_at, checked_out_by_name: b.checked_out_by_name, late_checkout_at: null },
    housekeeper_id: hk.id, housekeepers: { id: hk.id, code: hk.code, name: hk.name, photo_url: null },
    scheduled_date: b.check_out, type: i % 4 ? 'basic' : 'deep', status,
    payment_amount: i % 4 ? 500 : 1200, laundry_payment_amount: 150, payment_method: status === 'completed' ? 'GCash' : null,
    payment_reference: null, payment_note: null, paid_at: status === 'completed' ? at(-1) : null,
    laundry_payment_method: null, laundry_payment_reference: null, laundry_payment_note: null, laundry_paid_at: null,
    notes: i % 5 ? null : 'Replace the shower curtain and check the aircon remote batteries.',
    photos_before: [], photos_after: [], photos_report: [],
    amenities_used_items: [], amenities_replaced_items: [], laundry_used_items: [], laundry_replaced_items: [],
    amenities_used_photo: null, amenities_replaced_photo: null, laundry_used_photo: null, laundry_replaced_photo: null,
    submitted_at: status === 'submitted' || status === 'completed' ? at(-1, 14) : null,
    completed_at: status === 'completed' ? at(-1, 16) : null, guest_left_at: null, checkout_due_at: null,
    created_at: at(-20),
  }
})

const INQUIRY_STAGES = ['new', 'new', 'contacted', 'discussed', 'proposal', 'won', 'lost']
export const PROPERTY_INQUIRIES = Array.from({ length: 14 }, (_, i) => ({
  id: `pi-${i + 1}`, owner_name: person(i + 4), owner_email: email(person(i + 4)), owner_phone: '+63 917 222 3333',
  property_address: `${BUILDINGS[i % 4]}, Unit ${1500 + i}, Iloilo Business Park, Mandurriao, Iloilo City`,
  building: BUILDINGS[i % 4], property_type: i % 2 ? 'Condominium' : 'House and lot', bedrooms: 1 + (i % 3), bathrooms: 1,
  square_meters: 32 + i, price_per_night: 2800, message: 'We just got the keys and would like you to manage it for short stays. It comes fully furnished with a washing machine and a balcony.',
  images: [], status: INQUIRY_STAGES[i % INQUIRY_STAGES.length], admin_notes: null,
  contacted_at: i % 7 > 1 ? at(-5) : null, closed_at: i % 7 > 4 ? at(-1) : null, follow_up_on: i % 3 ? day(i - 4) : null,
  created_at: at(-i * 2),
}))
export const DESIGN_INQUIRIES = Array.from({ length: 8 }, (_, i) => ({
  id: `di-${i + 1}`, client_name: person(i + 6), client_email: email(person(i + 6)), client_phone: '+63 917 444 5555',
  property_address: `${BUILDINGS[i % 4]}, Unit ${800 + i}`, property_type: 'Condominium', service_type: 'full_design',
  room_scope: 'whole_unit', budget_range: '100k_300k', timeline: '1_3_months', inquiry_type: 'design',
  message: 'Looking for a warm, modern look for a studio we plan to rent out on Airbnb.', images: [],
  status: INQUIRY_STAGES[i % INQUIRY_STAGES.length], admin_notes: null, contacted_at: null, closed_at: null, follow_up_on: null,
  created_at: at(-i * 3),
}))

export const CAMPAIGNS = Array.from({ length: 6 }, (_, i) => ({
  id: `camp-${i + 1}`, name: `Holiday promo for returning guests, batch ${i + 1}`, subject: 'Your favourite Iloilo stay is 15% off this December',
  recipient_count: 120 + i, sent_count: i % 2 ? 120 + i : 0, failed_count: i % 3 === 0 ? 2 : 0, status: i % 2 ? 'sent' : 'draft',
  created_at: at(-i * 7), sent_at: i % 2 ? at(-i * 7 + 1) : null, created_by_email: ADMIN.email,
  body_html: '<p>Hello!</p>', reply_to: 'hello@iloilorental.com', data: null, error: null,
}))

export const PROFILES = [
  { id: ADMIN.id, full_name: ADMIN.name, email: ADMIN.email, avatar_url: null },
  ...SPECIALISTS.slice(0, 5).map((s, i) => ({ id: `profile-${i + 1}`, full_name: s.name, email: s.email, avatar_url: null })),
]

const MONTHS = Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`)

/** The tables, for fakeBackend. */
export function crmTables(): NonNullable<Handlers['tables']> {
  const list = (rows: unknown[]) => () => rows
  return {
    admin_users: () => [{ user_id: ADMIN.id }],
    owners: list(OWNERS),
    units: list(UNITS),
    contracts: list(CONTRACTS),
    bookings: list(BOOKINGS),
    cleanings: list(CLEANINGS),
    specialists: list(SPECIALISTS),
    affiliates: list(AFFILIATES),
    housekeepers: list(HOUSEKEEPERS),
    property_managers: list(MANAGERS),
    pm_contracts: list(PM_CONTRACTS),
    property_inquiries: list(PROPERTY_INQUIRIES),
    interior_design_inquiries: list(DESIGN_INQUIRIES),
    email_campaigns: list(CAMPAIGNS),
    profiles: list(PROFILES),
    ota_channel_names: list([{ name: 'Airbnb' }, { name: 'Booking.com' }, { name: 'Agoda' }]),
    v_pipeline: list(UNITS.map((u) => {
      const c = CONTRACTS.find((x) => x.id === u.current_contract_id)
      const o = OWNERS.find((x) => x.id === u.owner_id)!
      return {
        ...u, owner_name: o.name, owner_email: o.email, owner_phone: o.phone,
        effective_date: c?.effective_date ?? null, expiry_date: c?.expiry_date ?? null, classification: c?.classification ?? null,
        contract_pdf_url: null, days_until_expiry: c ? Math.round((Date.parse(c.expiry_date) - CRM_TODAY.getTime()) / 864e5) : null,
        pipeline_status: c ? 'active' : 'lead', last_interaction_at: null, next_follow_up_date: null,
      }
    })),
    v_expiring: list(CONTRACTS.filter((c) => c.expiry_date < day(90)).map((c) => ({
      contract_id: c.id, unit_id: c.unit_id, unit_code: c.units.unit_code, building: c.units.building, unit_type: 'Studio',
      effective_date: c.effective_date, expiry_date: c.expiry_date, classification: c.classification, contract_pdf_url: null,
      owner_id: c.owner_id, owner_name: c.owners.name, owner_email: c.owners.email, owner_phone: c.owners.phone,
      days_until_expiry: Math.round((Date.parse(c.expiry_date) - CRM_TODAY.getTime()) / 864e5),
    }))),
  }
}

/** The database functions the CRM's pages call, for fakeBackend. */
export function crmRpc(): NonNullable<Handlers['rpc']> {
  return {
    dashboard_analytics_year: () => MONTHS.map((month, i) => ({
      month, bookings: 20 + i, revenue: 180000 + i * 9000, nights: 90 + i, occupancy: 0.6 + i * 0.02,
      gross: 180000 + i * 9000, net: 120000 + i * 6000,
    })),
    accounting_analytics_by_year: () => MONTHS.map((month, i) => ({
      month, gross: 180000 + i * 9000, expenses: 40000 + i * 1000, net: 140000 + i * 8000, bookings: 20 + i, nights: 90 + i,
    })),
    contracts_lifetime_bulk: (args: { p_contract_ids?: string[] }) => (args.p_contract_ids ?? []).map((id, i) => ({
      contract_id: id, gross: 250000 + i * 1000, expenses: 60000, net: 190000 + i * 1000,
      owner_share: 133000, company_share: 57000, pm_share: 0, months_count: 10,
    })),
    contract_monthly_breakdown: () => MONTHS.map((month, i) => ({
      month, gross: 25000 + i * 500, booking_comm: 2500, affiliate_comm: 500, housekeeping: 1500, laundry: 600,
      electricity: 1800, internet: 1299, water: 300, marketing: 0, custom_total: 0, total_expenses: 8499,
      net: 16501 + i * 500, owner_share: 11550, company_share: 4951, pm_share: 0, pm_id: null, pm_name: null,
    })),
    team_totals_bulk: () => [],
    team_completed_counts: () => [],
    pm_earnings_bulk: () => [],
    crm_access_list: () => [
      { user_id: ADMIN.id, email: ADMIN.email, full_name: ADMIN.name, kind: 'admin', added_at: at(-100) },
      { user_id: null, email: 'invited.manager.with.a.long.address@examplemail.com', full_name: null, kind: 'invite', added_at: at(-3) },
    ],
    is_owner: () => false,
    link_staff_on_login: () => null,
  }
}
