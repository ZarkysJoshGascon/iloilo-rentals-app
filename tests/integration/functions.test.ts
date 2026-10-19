// The live server functions (supabase/functions), called the way a browser
// would. Only requests that must be refused are sent, so nothing is saved
// and no email goes out.
import { describe, expect, it } from 'vitest'
import { SUPABASE_URL, anonHeaders } from './helpers'

const url = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`
const post = (name: string, body: unknown, headers: Record<string, string> = anonHeaders) =>
  fetch(url(name), { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
const json = async (res: Response) => res.json().catch(() => ({}))

// contract-closeout: the nightly job's key or an admin (who only gets a dry run).
const ADMIN_ONLY = ['send-booking-confirmation', 'send-contract-statement', 'send-promo-campaign', 'backup-to-sheets', 'contract-closeout']
const SIGNED_IN_FORMS = ['submit-property-inquiry', 'submit-interior-inquiry', 'inquiry-upload-url']
const ALL = [...ADMIN_ONLY, ...SIGNED_IN_FORMS, 'submit-contact-message', 'unsubscribe']

describe('every function refuses the wrong kind of request', () => {
  it.each(ALL)('%s refuses GET', async (name) => {
    expect((await fetch(url(name), { headers: anonHeaders })).status).toBe(405)
  })
  it.each(ALL)('%s answers the browser\'s CORS check', async (name) => {
    const res = await fetch(url(name), { method: 'OPTIONS', headers: { Origin: 'https://www.iloilorental.com', 'Access-Control-Request-Method': 'POST' } })
    expect(res.status).toBeLessThan(300)
  })
})

describe('admin-only functions', () => {
  it.each(ADMIN_ONLY)('%s refuses a call with no login', async (name) => {
    expect((await post(name, {}, { 'Content-Type': 'application/json' })).status).toBe(401)
  })
  it.each(ADMIN_ONLY)('%s refuses the public key', async (name) => {
    const res = await post(name, { booking_id: '00000000-0000-0000-0000-000000000000', mode: 'preview' })
    expect(res.status).toBe(401)
  })
})

describe('forms that need a Google sign-in', () => {
  it.each(SIGNED_IN_FORMS)('%s asks the visitor to sign in', async (name) => {
    const res = await post(name, {})
    expect(res.status).toBe(401)
    expect((await json(res)).error).toMatch(/sign in with Google/i)
  })
})

describe('contact form', () => {
  it('asks for a name', async () => {
    const res = await post('submit-contact-message', { email: 'a@b.co', message: 'Hello' })
    expect(res.status).toBe(400)
    expect((await json(res)).error).toMatch(/name/i)
  })
  it('rejects a bad email', async () => {
    const res = await post('submit-contact-message', { name: 'Test', email: 'not-an-email', message: 'Hello' })
    expect(res.status).toBe(400)
    expect((await json(res)).error).toMatch(/valid email/i)
  })
  it('rejects a body that isn\'t JSON', async () => {
    const res = await post('submit-contact-message', 'this is not json')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

describe('unsubscribe', () => {
  it('needs an email and a token', async () => {
    const res = await post('unsubscribe', {})
    expect(res.status).toBe(400)
  })
  it('refuses a made-up link', async () => {
    const res = await post('unsubscribe', { email: 'nobody@example.com', token: 'a'.repeat(24) })
    expect(res.status).toBe(403)
    expect((await json(res)).error).toMatch(/invalid or has expired/i)
  })
})
