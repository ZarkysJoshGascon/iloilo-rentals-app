// A fake Supabase for browser tests of the signed-in pages (owner portal,
// housekeeping). The test's user is put in the browser's storage as signed
// in, and every request to Supabase is answered here from the test's data,
// so nothing reaches the real project: a test can submit, upload or delete
// freely. Every request is recorded for the test to check.
//
//   await page.clock.setFixedTime(...)          // optional, first
//   const user = await signInAs(page, OWNER)
//   const calls = await fakeBackend(page, user, { rpc: { owner_portal_overview: () => data } })
import { existsSync, readFileSync } from 'node:fs'
import type { Page, Route } from '@playwright/test'

function supabaseUrl(): string {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
  const found = env.match(/^VITE_SUPABASE_URL=["']?([^"'\r\n]+)/m)
  if (!found) throw new Error('Browser tests need VITE_SUPABASE_URL, in .env or the environment')
  return found[1]
}

export const SUPABASE_URL = supabaseUrl()
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0]

export type TestUser = { id: string; email: string; name: string }

export type Call = {
  kind: 'auth' | 'rpc' | 'table' | 'storage' | 'function'
  name: string
  method: string
  body: any
  contentType: string | undefined
  size: number
  /** For a storage upload: the file itself (sent inside a multipart form). */
  file?: { contentType: string; bytes: Buffer }
}

// The file part of a multipart/form-data upload, as the storage client sends it.
function filePart(raw: Buffer, contentType: string): Call['file'] {
  const boundary = contentType.match(/boundary=(.+)$/)?.[1]
  if (!boundary) return undefined
  const text = raw.toString('latin1')
  for (const part of text.split(`--${boundary}`)) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0 || !/filename=/.test(part.slice(0, headerEnd))) continue
    const type = part.slice(0, headerEnd).match(/Content-Type:\s*([^\r\n]+)/i)?.[1] ?? ''
    const content = part.slice(headerEnd + 4).replace(/\r\n$/, '')
    return { contentType: type.trim(), bytes: Buffer.from(content, 'latin1') }
  }
  return undefined
}

// The body, parsed when it's JSON. A request still on its way when its page
// closes can arrive cut short; it's kept as text rather than crashing here,
// where the error would land on whichever test runs next.
function readBody(raw: Buffer | null, contentType: string | undefined) {
  if (!raw?.length || !contentType?.includes('json')) return raw
  const text = raw.toString('utf8')
  try { return JSON.parse(text) } catch { return text }
}

type TableRequest = { method: string; url: URL; body: any }
type Reply = { status?: number; body: unknown }

export type Handlers = {
  /** Database functions by name: their arguments in, the answer out. */
  rpc?: Record<string, (args: any) => unknown>
  /** Tables by name: GET reads, POST/PATCH/DELETE writes. Unlisted tables read as empty. */
  tables?: Record<string, (req: TableRequest) => unknown>
  /** Edge Functions by name. Unlisted ones answer 404. */
  functions?: Record<string, (body: any) => Reply>
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': '*',
}

// A small real PNG, served for any stored photo (receipts, cleaning photos).
const PHOTO = readFileSync('public/logo-96.png')

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Puts `user` in the browser as signed in (and the daily welcome as already seen). */
export async function signInAs(page: Page, user: TestUser) {
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, role: 'authenticated', email: user.email, exp: 4102444800 })}.test`
  const authUser = {
    id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated',
    user_metadata: { full_name: user.name }, app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z',
  }
  const session = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'test', user: authUser }
  await page.addInitScript(({ key, session, userId }) => {
    localStorage.setItem(key, JSON.stringify(session))
    // The welcome pop-up has its own tests (tests/unit); keep it out of the way.
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    for (const workspace of ['crm', 'housekeeping', 'owner']) localStorage.setItem(`welcome:${workspace}:${userId}`, day)
  }, { key: `sb-${PROJECT_REF}-auth-token`, session, userId: user.id })
  return authUser
}

/** Answers every Supabase request from `handlers`. Returns the recorded calls. */
export async function fakeBackend(page: Page, user: object, handlers: Handlers = {}) {
  const calls: Call[] = []

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    try {
      await answer(route)
    } catch (error) {
      if (page.isClosed()) return // the test is over and the request went with its page
      throw error
    }
  })

  async function answer(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const path = url.pathname
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })

    const raw = req.postDataBuffer()
    const contentType = req.headers()['content-type']
    const body = readBody(raw, contentType)
    const file = raw && contentType?.startsWith('multipart/form-data') ? filePart(raw, contentType) : undefined
    const record = (kind: Call['kind'], name: string) => calls.push({ kind, name, method, body, contentType, size: raw?.length ?? 0, file })
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(data ?? null) })

    if (path.startsWith('/auth/v1/')) {
      record('auth', path.slice('/auth/v1/'.length))
      return path.endsWith('/user') ? json(user) : json({})
    }

    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.slice('/rest/v1/rpc/'.length)
      record('rpc', name)
      const handler = handlers.rpc?.[name]
      if (!handler) return json(null)
      const result = handler(body ?? {})
      return result instanceof Error ? json({ message: result.message, code: 'P0001' }, 400) : json(result)
    }

    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length)
      record('table', table)
      const result = handlers.tables?.[table]?.({ method, url, body }) ?? (method === 'GET' ? [] : null)
      // .single() / .maybeSingle() ask for one object rather than a list.
      const wantsObject = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      if (wantsObject && Array.isArray(result)) {
        return result.length ? json(result[0]) : json({ code: 'PGRST116', message: 'No rows' }, 406)
      }
      return json(result)
    }

    if (path.startsWith('/storage/v1/object/sign/')) {
      const rest = path.slice('/storage/v1/object/sign/'.length)
      record('storage', `sign/${rest}`)
      if (method === 'GET') return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PHOTO })
      const paths: string[] | undefined = body?.paths
      if (paths) return json(paths.map((p) => ({ path: p, signedURL: `/object/sign/${rest}/${p}?token=test`, error: null })))
      return json({ signedURL: `/object/sign/${rest}?token=test` })
    }

    if (path.startsWith('/storage/v1/object/')) {
      const rest = path.slice('/storage/v1/object/'.length)
      record('storage', rest)
      if (method === 'POST' || method === 'PUT') return json({ Key: rest, Id: rest })
      if (method === 'DELETE') return json([])
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PHOTO })
    }

    if (path.startsWith('/functions/v1/')) {
      const name = path.slice('/functions/v1/'.length)
      record('function', name)
      const reply = handlers.functions?.[name]?.(body)
      return reply ? json(reply.body, reply.status ?? 200) : json({ error: 'Not found' }, 404)
    }

    return json({})
  }

  return calls
}
