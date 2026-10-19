// A stand-in for the Supabase client in unit tests. Every query resolves to
// empty data; tests that need more replace single methods with vi.fn().
// Use it with:  vi.mock('@/lib/supabase', () => import('@/test/supabaseMock'))
import { vi } from 'vitest'

type Result = { data: any; error: any; count?: number }

// A query builder: every filter returns the builder, awaiting it gives `result`.
export function queryBuilder(result: Result = { data: [], error: null, count: 0 }) {
  const b: any = {}
  for (const m of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'ilike', 'like', 'or', 'order', 'limit', 'range', 'match']) {
    b[m] = vi.fn(() => b)
  }
  b.single = vi.fn(() => Promise.resolve(result))
  b.maybeSingle = vi.fn(() => Promise.resolve({ ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data }))
  b.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return b
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

export const supabase: any = {
  from: vi.fn(() => queryBuilder()),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  channel: vi.fn(() => fakeChannel()),
  removeChannel: vi.fn(),
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'test-token' } }, error: null })),
    getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
  functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/test/${path}` } })),
    })),
  },
}
