// A stand-in for the Supabase client in unit tests: nothing leaves the
// machine. Every query resolves to empty data; a test that needs more gives
// one method a new implementation (it's reset after every test, see setup.ts).
//
//   vi.mock('@/lib/supabase', () => import('../../supabaseMock'))
//   const { supabase, queryBuilder, bucket } = await import('../../supabaseMock')
//
// (the import path is the one from the test file to this file).
import { vi } from 'vitest'

type Result = { data: any; error: any; count?: number }

const FILTERS = [
  'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'is', 'not', 'ilike', 'like', 'or', 'order', 'limit', 'range', 'match', 'abortSignal',
]

/**
 * A query builder: every filter returns the builder (and is a spy, so a test
 * can check what was asked), awaiting it gives `result`.
 */
export function queryBuilder(result: Result = { data: [], error: null, count: 0 }) {
  const b: any = {}
  for (const m of FILTERS) b[m] = vi.fn(() => b)
  b.single = vi.fn(() => Promise.resolve(result))
  b.maybeSingle = vi.fn(() => Promise.resolve({ ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }))
  b.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return b
}

/** An RPC call that resolves to `result` and can still take .abortSignal(). */
export function rpcResult(result: Result) {
  const p: any = Promise.resolve(result)
  p.abortSignal = vi.fn(() => p)
  return p
}

// A realtime channel that remembers its handlers so tests can fire them.
export function fakeChannel() {
  const handlers: { filter: any; cb: (payload: any) => unknown }[] = []
  const channel: any = {
    on: vi.fn((_type: string, filter: any, cb: (payload: any) => unknown) => {
      handlers.push({ filter, cb })
      return channel
    }),
    subscribe: vi.fn(() => channel),
    emit: (table: string, payload: any) =>
      Promise.all(handlers.filter((h) => !h.filter?.table || h.filter.table === table).map((h) => h.cb(payload))),
  }
  return channel
}

// One object per storage bucket, so a test can look at what was sent to it:
//   expect(bucket('cleaning-photos').upload).toHaveBeenCalledWith(...)
const buckets = new Map<string, any>()

function makeBucket(name: string) {
  return {
    upload: vi.fn((path: string) => Promise.resolve({ data: { path }, error: null })),
    uploadToSignedUrl: vi.fn((path: string) => Promise.resolve({ data: { path }, error: null })),
    remove: vi.fn((paths: string[]) => Promise.resolve({ data: paths.map((p) => ({ name: p })), error: null })),
    list: vi.fn(() => Promise.resolve({ data: [], error: null })),
    download: vi.fn(() => Promise.resolve({ data: new Blob(['']), error: null })),
    createSignedUrl: vi.fn((path: string) => Promise.resolve({ data: { signedUrl: `https://signed.test/${name}/${path}` }, error: null })),
    createSignedUrls: vi.fn((paths: string[]) => Promise.resolve({
      data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${name}/${p}`, error: null })), error: null,
    })),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://public.test/${name}/${path}` } })),
  }
}

export function bucket(name: string) {
  if (!buckets.has(name)) buckets.set(name, makeBucket(name))
  return buckets.get(name)
}

export const supabase: any = {
  from: vi.fn(() => queryBuilder()),
  rpc: vi.fn(() => rpcResult({ data: null, error: null })),
  channel: vi.fn(() => fakeChannel()),
  removeChannel: vi.fn(),
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'test-token' } }, error: null })),
    getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  storage: { from: vi.fn((name: string) => bucket(name)) },
}

/** Back to the defaults above (setup.ts calls this after every test). */
export function resetSupabaseMock() {
  buckets.clear()
}
