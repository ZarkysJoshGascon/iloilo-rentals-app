// Every table, database function and server function the app's code calls
// must exist on the live Supabase project. A rename or a dropped table shows
// up here before a user hits a blank page. Read-only: tables are asked for
// zero rows, functions are called signed out (and refuse), server functions
// are sent a GET (which they all refuse).
import { describe, expect, it } from 'vitest'
import { SUPABASE_URL, anonHeaders, appBackendRefs } from './helpers'

const { tables, rpcs, functions } = appBackendRefs()

describe('the scan found the app\'s backend calls', () => {
  it('found tables, database functions and server functions', () => {
    expect(tables.size).toBeGreaterThan(15)
    expect(rpcs.size).toBeGreaterThan(15)
    expect(functions.size).toBeGreaterThan(3)
  })
})

describe('every table the app reads or writes exists', () => {
  it.each([...tables.keys()].sort())('%s', async (table) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, { headers: anonHeaders })
    const body = await res.json().catch(() => ({}))
    expect(body?.code, `${table} is used in ${[...tables.get(table)!].join(', ')}`).not.toBe('PGRST205')
  })
})

describe('every database function the app calls exists with the parameters it passes', () => {
  it.each([...rpcs.values()].sort((a, b) => a.name.localeCompare(b.name)).map((r) => [r.name, r] as const))('%s', async (_name, rpc) => {
    const args = Object.fromEntries(rpc.params.map((p) => [p, null]))
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc.name}`, { method: 'POST', headers: anonHeaders, body: JSON.stringify(args) })
    const body = await res.json().catch(() => ({}))
    expect(body?.code, `${rpc.name}(${rpc.params.join(', ')}) is called in ${rpc.files.join(', ')}: ${body?.message || ''}`).not.toBe('PGRST202')
  })
})

describe('every server function the app calls is deployed', () => {
  it.each([...functions.keys()].sort())('%s', async (name) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'GET', headers: anonHeaders })
    expect(res.status, `${name} is called in ${[...functions.get(name)!].join(', ')}`).not.toBe(404)
  })
})
