// src/lib/api/ownerPortal.ts
// Data for the owner portal. Owners never read the tables: two database
// functions (owner_portal_overview, owner_contract_detail) check that a
// contract belongs to the signed-in owner and return only that.
import { supabase } from '@/lib/supabase'

const num = (v) => Number(v) || 0
const monthKey = (v) => String(v || '').slice(0, 7)

function normalizeContract(c) {
  return {
    id: c.id,
    contract_code: c.contract_code,
    unit_id: c.unit_id,
    effective_date: c.effective_date,
    expiry_date: c.expiry_date,
    superseded_by: c.superseded_by,
    // Every end date before an extension, oldest first (only in the contract detail).
    previous_expiry_dates: Array.isArray(c.previous_expiry_dates) ? c.previous_expiry_dates : [],
    // When the nightly close-out cleared the term's bookings and cleanings.
    records_cleared_at: c.records_cleared_at || null,
    units: {
      unit_code: c.unit_code,
      building: c.building,
      unit_type: c.unit_type,
      marketing_title: c.marketing_title,
    },
    nightsBooked: num(c.nights_booked),
    daysElapsed: num(c.days_elapsed),
    upcomingBookings: num(c.upcoming_bookings),
    nextCheckIn: c.next_check_in || null,
  }
}

/** The owner, their contracts and every contract's monthly figures. */
export async function fetchOwnerOverview() {
  const { data, error } = await supabase.rpc('owner_portal_overview')
  if (error) throw error
  return {
    owners: data?.owners || [],
    contracts: (data?.contracts || []).map(normalizeContract),
    months: (data?.months || []).map((m) => ({
      contractId: m.contract_id,
      month: monthKey(m.month),
      gross: num(m.gross),
      expenses: num(m.total_expenses),
      net: num(m.net),
      ownerShare: num(m.owner_share),
      pmShare: num(m.pm_share),
    })),
  }
}

/** One contract in full (its owner only). */
export async function fetchOwnerContract(contractId) {
  const { data, error } = await supabase.rpc('owner_contract_detail', { p_contract_id: contractId })
  if (error) throw error
  const c = data?.contract || {}
  return {
    contract: normalizeContract(c),
    months: (data?.months || []).map((m) => ({
      month: monthKey(m.month),
      gross: num(m.gross),
      bookingComm: num(m.booking_comm),
      affiliateComm: num(m.affiliate_comm),
      housekeeping: num(m.housekeeping),
      laundry: num(m.laundry),
      electricity: num(m.electricity),
      internet: num(m.internet),
      water: num(m.water),
      marketing: num(m.marketing),
      other: num(m.custom_total),
      totalExpenses: num(m.total_expenses),
      net: num(m.net),
      ownerShare: num(m.owner_share),
      // company_share from the accounting query is what the company keeps after the PM.
      companyKeeps: num(m.company_share),
      pmShare: num(m.pm_share),
      pmName: m.pm_name || null,
    })),
    bookings: data?.bookings || [],
    // Shaped like the CRM's cleanings (booking nested) so the shared calendar works.
    cleanings: (data?.cleanings || []).map((c) => ({
      ...c,
      bookings: c.booking_code ? { booking_code: c.booking_code, guest_name: c.guest_name } : null,
    })),
    // Bills and other expenses per month, with receipt paths (expense-proofs bucket).
    expenses: (data?.expenses || []).map((e) => ({ ...e, month: monthKey(e.month) })),
  }
}

/** Is the signed-in user linked to an owner record? */
export async function checkIsOwner() {
  const { data, error } = await supabase.rpc('is_owner')
  if (error) return false
  return !!data
}
