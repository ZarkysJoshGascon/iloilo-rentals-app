// Smoke test: the quick check to run right after every deploy.
//   E2E_BASE_URL=https://www.iloilorental.com npx playwright test smoke
// Runs against the dev server too; the hosting checks only run on the live site.
import { test, expect } from '@playwright/test'

const live = !!process.env.E2E_BASE_URL && !process.env.E2E_BASE_URL.startsWith('http://localhost')
const PAGES = ['/', '/about', '/contact', '/list-property', '/privacy', '/terms', '/login']

test.describe('every page', () => {
  for (const path of PAGES) {
    test(`${path} opens directly, with a title and no broken files`, async ({ page, baseURL }) => {
      const origin = new URL(baseURL!).origin
      const broken: string[] = []
      page.on('response', (r) => {
        if (r.url().startsWith(origin) && r.status() >= 400) broken.push(`${r.status()} ${r.url()}`)
      })
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 })
      await expect(page).toHaveTitle(/Iloilo Rentals/)
      expect(broken).toEqual([])
    })
  }
})

test('the site reaches the database and file storage', async ({ page }) => {
  const backend: number[] = []
  page.on('response', (r) => { if (r.url().includes('.supabase.co/')) backend.push(r.status()) })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => backend.length, { timeout: 15_000 }).toBeGreaterThan(0)
  expect(backend.filter((s) => s >= 500)).toEqual([])
})

test('search engines get a description, robots.txt and a sitemap', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Iloilo/)
  const robots = await request.get('/robots.txt')
  expect(robots.headers()['content-type']).toContain('text/plain')
  expect(await robots.text()).toMatch(/Disallow: \/admin[\s\S]*Sitemap: https:\/\/www\.iloilorental\.com\/sitemap\.xml/)
  const sitemap = await request.get('/sitemap.xml')
  expect(await sitemap.text()).toContain('<loc>https://www.iloilorental.com/about</loc>')
})

test.describe('hosting (live site only)', () => {
  test.skip(!live, 'only meaningful on the live site')

  test('the bare domain sends visitors to www over https', async ({ request }) => {
    const res = await request.get('https://iloilorental.com/about', { maxRedirects: 0 })
    expect([301, 308]).toContain(res.status())
    expect(res.headers()['location']).toBe('https://www.iloilorental.com/about')
  })

  test('security headers are sent', async ({ request }) => {
    const h = (await request.get('/')).headers()
    expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/)
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  })

  test('built scripts are cached by browsers for a year', async ({ request }) => {
    const html = await (await request.get('/')).text()
    const script = html.match(/\/assets\/[^"]+\.js/)?.[0]
    expect(script, 'no built script found in the page').toBeTruthy()
    expect((await request.get(script!)).headers()['cache-control']).toContain('immutable')
  })
})
