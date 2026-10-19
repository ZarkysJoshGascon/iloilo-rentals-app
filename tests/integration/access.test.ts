// What a signed-out visitor can do through the real API, using the same
// Supabase client the website uses. Private data must come back empty and
// every write and staff action must be refused. Nothing is changed: every
// write here is one that must fail.
//
// Each refusal is checked for the exact reason (Postgres code 42501:
// permission denied / row-level security), so a test can't pass because of
// some other error, like a misspelt column.
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, ANON_KEY, appBackendRefs } from './helpers'

const visitor = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
const { tables } = appBackendRefs()

const PERMISSION_DENIED = '42501'
const NO_ID = '00000000-0000-0000-0000-000000000000'

describe('a signed-out visitor reads nothing private', () => {
  it.each([...tables.keys()].sort())('%s', async (table) => {
    const { data, error } = await visitor.from(table).select('*').limit(5)
    const rows = error ? 0 : (data?.length ?? 0)
    expect(rows, `${table} returned ${rows} row(s) to a signed-out visitor`).toBe(0)
  })
})

describe('a signed-out visitor can\'t change anything', () => {
  it('can\'t add a booking', async () => {
    const { error } = await visitor.from('bookings')
      .insert({ guest_name: 'Intruder', check_in: '2031-01-01', check_out: '2031-01-02', total_amount: 1 })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  // Row-level security hides every row from a visitor, so an update or a
  // delete finds nothing to change: no error, and no rows back.
  it.each([
    ['units', { unit_code: 'HACKED' }],
    ['contracts', { contract_code: 'HACKED' }],
    ['cleanings', { notes: 'hacked' }],
    ['bookings', { guest_name: 'hacked' }],
  ])('can\'t change %s', async (table, change) => {
    const { data, error } = await visitor.from(table).update(change).neq('id', NO_ID).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it.each(['bookings', 'cleanings', 'contracts'])('can\'t delete %s', async (table) => {
    const { data, error } = await visitor.from(table).delete().neq('id', NO_ID).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('can\'t write to the work log', async () => {
    const { error } = await visitor.from('audit_logs').insert({ action: 'FAKE', table_name: 'bookings' })
    expect(error?.code).toBe(PERMISSION_DENIED)
  })
})

describe('a signed-out visitor can\'t run staff actions', () => {
  it.each([
    ['crm_access_add', { p_email: 'intruder@example.com' }],
    ['admin_approve_and_pay_cleaning', {
      p_cleaning_id: NO_ID, p_payment_amount: 1, p_payment_method: 'cash', p_payment_reference: null, p_payment_note: null,
    }],
    ['team_totals_bulk', {}],
    ['owner_portal_overview', {}],
    ['owner_contract_detail', { p_contract_id: NO_ID }],
    // The nightly contract close-out: only the server may run these.
    ['closeout_scope', { p_contract_id: NO_ID }],
    ['closeout_delete_records', { p_contract_id: NO_ID, p_archive_path: 'x', p_archive_drive_url: null, p_photos: 0 }],
    ['closeout_set_note', { p_contract_id: NO_ID, p_note: 'x' }],
  ])('%s is refused', async (fn, args) => {
    const { error } = await visitor.rpc(fn, args)
    expect(error?.code).toBe(PERMISSION_DENIED)
  })

  it('is not an admin', async () => {
    const { data, error } = await visitor.rpc('is_admin')
    expect(error).toBeNull()
    expect(data).toBe(false)
  })
})

describe('private files stay private', () => {
  it.each(['contract-statements', 'expense-proofs', 'cleaning-photos', 'contract-pdfs'])('%s can\'t be listed', async (bucket) => {
    const { data } = await visitor.storage.from(bucket).list()
    expect(data ?? []).toEqual([])
  })

  it('a kept statement has no public link', async () => {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/contract-statements/any/statement.xlsx`)
    expect(res.ok).toBe(false)
  })
})
