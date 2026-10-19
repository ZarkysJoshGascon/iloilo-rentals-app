// What a signed-out visitor can do through the real API, using the same
// Supabase client the website uses. Private data must come back empty and
// every write and staff action must be refused. Nothing is changed: every
// write here is one that must fail.
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, ANON_KEY, appBackendRefs } from './helpers'

const visitor = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
const { tables } = appBackendRefs()

describe('a signed-out visitor reads nothing private', () => {
  it.each([...tables.keys()].sort())('%s', async (table) => {
    const { data, error } = await visitor.from(table).select('*').limit(5)
    const rows = error ? 0 : (data?.length ?? 0)
    expect(rows, `${table} returned ${rows} row(s) to a signed-out visitor`).toBe(0)
  })
})

describe('a signed-out visitor can\'t change anything', () => {
  it('can\'t add a booking', async () => {
    const { data, error } = await visitor.from('bookings').insert({ guest_name: 'Intruder', check_in: '2031-01-01', check_out: '2031-01-02', total_amount: 1 }).select()
    expect(error ?? (data?.length === 0 ? 'no row' : null)).toBeTruthy()
  })

  it('can\'t change units, contracts or cleanings', async () => {
    for (const table of ['units', 'contracts', 'cleanings']) {
      const { data, error } = await visitor.from(table).update({ notes: 'x' }).neq('id', '00000000-0000-0000-0000-000000000000').select('id')
      expect(error || (data ?? []).length === 0, `${table} was changed`).toBeTruthy()
    }
  })

  it('can\'t delete bookings', async () => {
    const { data, error } = await visitor.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id')
    expect(error || (data ?? []).length === 0).toBeTruthy()
  })

  it('can\'t write to the work log', async () => {
    const { error } = await visitor.from('audit_logs').insert({ action: 'FAKE', table_name: 'bookings' })
    expect(error).toBeTruthy()
  })

  it('can\'t grant itself CRM access', async () => {
    const { error } = await visitor.rpc('crm_access_add', { p_email: 'intruder@example.com' })
    expect(error).toBeTruthy()
  })

  it('can\'t approve and pay a cleaning', async () => {
    const { error } = await visitor.rpc('admin_approve_and_pay_cleaning', {
      p_cleaning_id: '00000000-0000-0000-0000-000000000000', p_payment_amount: 1, p_payment_method: 'cash', p_payment_reference: null, p_payment_note: null,
    })
    expect(error).toBeTruthy()
  })

  it('can\'t read the owner portal or team totals', async () => {
    const owner = await visitor.rpc('owner_portal_overview')
    expect(owner.error || (owner.data?.contracts ?? []).length === 0).toBeTruthy()
    const team = await visitor.rpc('team_totals_bulk')
    expect(team.error).toBeTruthy()
  })

  it('is not an admin', async () => {
    const { data } = await visitor.rpc('is_admin')
    expect(data).toBeFalsy()
  })
})

describe('private files stay private', () => {
  it.each(['cleaning-photos', 'contract-pdfs', 'expense-proofs'])('%s can\'t be listed', async (bucket) => {
    const { data } = await visitor.storage.from(bucket).list('', { limit: 5 })
    expect(data ?? []).toHaveLength(0)
  })

  it('a visitor can\'t upload into private buckets', async () => {
    const { error } = await visitor.storage.from('cleaning-photos').upload(`intruder-${Date.now()}.txt`, new Blob(['x'], { type: 'text/plain' }))
    expect(error).toBeTruthy()
  })
})
