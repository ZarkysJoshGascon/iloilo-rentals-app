// Speed limits for the public site, measured on a phone over a slow mobile
// connection (the network Lighthouse uses for mobile: 1.6 Mbps, 150 ms).
// Run against a production build, not the dev server (it serves unbundled files):
//   npx vite build && npx vite preview --port 4173
//   E2E_BASE_URL=http://localhost:4173 npx playwright test performance --project=phone
// or against the live site with E2E_BASE_URL=https://www.iloilorental.com
import { test, expect, type Page } from '@playwright/test'

const KB = 1024
// Downloaded (compressed) size until the page has settled, and how long until
// the visitor sees the page: its heading is there and the first-visit loading
// screen has lifted (it waits for the page's photos, at most 8 seconds).
// Measured 2026-10-19 (KB total / KB scripts / seconds), plus a margin:
//   /  2528 / 206 / 10.8   (the loading screen waits for every homepage photo,
//                           so on this network it runs to its 8-second cap)
//   /about, /contact, /list-property  ~300 / ~190 / 3.5
//   /login  455 / 333 / 3.5   (150 KB of it is Google's sign-in button)
const BUDGETS: Record<string, { total: number; scripts: number; seconds: number }> = {
  '/': { total: 2800, scripts: 260, seconds: 11.5 },
  '/about': { total: 380, scripts: 240, seconds: 4.5 },
  '/contact': { total: 380, scripts: 240, seconds: 4.5 },
  '/list-property': { total: 400, scripts: 260, seconds: 4.5 },
  '/login': { total: 520, scripts: 390, seconds: 4.5 },
}

test.skip(!process.env.E2E_BASE_URL, 'needs a production build or the live site (see the top of this file)')

async function slowMobile(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

for (const [path, budget] of Object.entries(BUDGETS)) {
  test(`${path} stays within its speed limits on a phone`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'measured on the phone (Chrome) only')
    test.setTimeout(120_000)
    await slowMobile(page)
    const sizes: { type: string; bytes: number; url: string }[] = []
    page.on('requestfinished', async (req) => {
      const s = await req.sizes().catch(() => null)
      if (s) sizes.push({ type: req.resourceType(), bytes: s.responseBodySize + s.responseHeadersSize, url: req.url() })
    })
    const start = Date.now()
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 60_000 })
    await page.getByText(/^Loading, \d+%$/).waitFor({ state: 'detached', timeout: 60_000 })
    const seconds = (Date.now() - start) / 1000
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})

    const total = sizes.reduce((n, s) => n + s.bytes, 0)
    const scripts = sizes.filter((s) => s.type === 'script').reduce((n, s) => n + s.bytes, 0)
    const biggest = [...sizes].sort((a, b) => b.bytes - a.bytes).slice(0, 5)
      .map((s) => `${Math.round(s.bytes / KB)} KB ${s.type} ${s.url.split('?')[0].slice(-70)}`)
    console.log(`${path}: ${Math.round(total / KB)} KB total, ${Math.round(scripts / KB)} KB scripts, shown after ${seconds.toFixed(1)} s\n  ${biggest.join('\n  ')}`)

    expect.soft(Math.round(total / KB), 'total KB downloaded').toBeLessThanOrEqual(budget.total)
    expect.soft(Math.round(scripts / KB), 'KB of scripts').toBeLessThanOrEqual(budget.scripts)
    expect.soft(seconds, 'seconds until the page shows').toBeLessThanOrEqual(budget.seconds)
  })
}
