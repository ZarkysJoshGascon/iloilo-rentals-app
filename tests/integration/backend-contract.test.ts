// Every table, database function and server function the app's code calls
// must exist on the live Supabase project. A rename or a dropped table shows
// up here before a user hits a blank page. Read-only: tables are asked for
// zero rows, functions are called signed out (and refuse), server functions
// are sent a GET (which they all refuse).
//
// Each check expects the exact answer something that exists gives a visitor,
// so "not found" can't hide behind another failure (a server error, say).
import { describe, expect, it } from 'vitest'
import { SUPABASE_URL, anonHeaders, appBackendRefs } from './helpers'

const { tables, rpcs, functions } = appBackendRefs()

const PERMISSION_DENIED = '42501'

// Database functions a signed-out visitor may run. None today: the website
// sends what visitors type through server functions instead. A function
// added here must check its own input.
const OPEN_TO_VISITORS = new Set<string>()

describe('the scan found the app\'s backend calls', () => {
  it('found tables, database functions and server functions', () => {
    expect(tables.size).toBeGreaterThan(15)
    expect(rpcs.size).toBeGreaterThan(15)
    expect(functions.size).toBeGreaterThan(3)
  })
})

describe('every table the app reads or writes exists', () => {
  // A table answers with its (row-level secured) rows; a staff-only view refuses outright.
  const EXISTS = ['200 rows', `401 ${PERMISSION_DENIED}`]
  it.each([...tables.keys()].sort())('%s', async (table) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, { headers: anonHeaders })
    const body = await res.json().catch(() => null)
    const answer = `${res.status} ${Array.isArray(body) ? 'rows' : body?.code}`
    expect(EXISTS, `${table}, used in ${[...tables.get(table)!].join(', ')}, answered ${answer}: ${body?.message ?? ''}`).toContain(answer)
  })
})

describe('every database function the app calls exists with the parameters it passes, and is staff-only', () => {
  // Permission denied means the function was found with these parameters
  // (a wrong name or parameter list is "not found", PGRST202) and refused.
  it.each([...rpcs.values()].sort((a, b) => a.name.localeCompare(b.name)).map((r) => [r.name, r] as const))('%s', async (name, rpc) => {
    const args = Object.fromEntries(rpc.params.map((p) => [p, null]))
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: anonHeaders, body: JSON.stringify(args) })
    const body = await res.json().catch(() => null)
    const where = `${name}(${rpc.params.join(', ')}), called in ${rpc.files.join(', ')}: ${res.status} ${body?.code ?? ''} ${body?.message ?? ''}`
    if (OPEN_TO_VISITORS.has(name)) expect(body?.code, where).not.toBe('PGRST202')
    else expect(`${res.status} ${body?.code}`, where).toBe(`401 ${PERMISSION_DENIED}`)
  })
})

describe('every server function the app calls is deployed', () => {
  // They only take POST, so a GET is turned away: 405, not 404.
  it.each([...functions.keys()].sort())('%s', async (name) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: 'GET', headers: anonHeaders })
    expect(res.status, `${name} is called in ${[...functions.get(name)!].join(', ')}`).toBe(405)
  })
})
