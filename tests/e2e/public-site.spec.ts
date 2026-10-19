// The public website as a visitor sees it: every page loads without errors,
// navigation works, forms explain what's wrong, nothing scrolls sideways on a
// phone, and the private workspaces stay closed when signed out.
import { test, expect, type Page } from '@playwright/test'

// Firefox reports the sign-in library's skipped token-refresh round as
// uncaught, though the library catches it; nothing breaks.
const KNOWN_NOISE = /Navigator LockManager lock .* immediately failed/

// Errors the page itself logs (third-party noise is ignored).
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => { if (!KNOWN_NOISE.test(e.message)) errors.push(e.message) })
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|google|gsi|accounts\.google|ERR_BLOCKED|Failed to load resource/i.test(m.text())) errors.push(m.text())
  })
  return errors
}

const PAGES = [
  { path: '/about', heading: 'About Iloilo Rentals' },
  { path: '/contact', heading: 'Contact Us' },
  { path: '/privacy', heading: 'Privacy Policy' },
  { path: '/terms', heading: 'Terms & Conditions' },
]

test.describe('public pages', () => {
  for (const p of PAGES) {
    test(`${p.path} loads with its heading and no errors`, async ({ page }) => {
      const errors = watchErrors(page)
      await page.goto(p.path)
      await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible()
      expect(errors).toEqual([])
    })
  }

  test('the homepage loads its main heading within 15 seconds', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
  })

  test('the List Property page loads', async ({ page }) => {
    await page.goto('/list-property')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('the privacy policy has no Messenger section', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
    await expect(page.getByText(/Messenger/i)).toHaveCount(0)
  })

  test('a mistyped address says the page wasn\'t found', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.getByText(/page not found|can.t find|doesn.t exist|404/i).first()).toBeVisible()
  })
})

test.describe('navigation', () => {
  test('the menu goes to About and Contact', async ({ page, isMobile }) => {
    await page.goto('/about')
    if (isMobile) {
      // Phones: the bottom bar's "More" opens the menu sheet.
      await page.getByRole('button', { name: /^more$/i }).click()
      await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /contact/i }).click()
    } else {
      await page.getByRole('link', { name: /^contact/i }).first().click()
    }
    await expect(page).toHaveURL(/\/contact$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Contact Us' })).toBeVisible()
  })
})

test.describe('phone layout', () => {
  test('no page scrolls sideways', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone only')
    for (const path of ['/', '/about', '/contact', '/list-property', '/privacy']) {
      await page.goto(path)
      // Sections slide in from the side; once they've arrived nothing may stick out.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
        message: `${path} is wider than the screen`, timeout: 10_000,
      }).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('workspaces are closed when signed out', () => {
  test('the CRM does not open', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).not.toHaveURL(/\/admin/)
  })

  test('the housekeeping page asks to sign in and comes back afterwards', async ({ page }) => {
    await page.goto('/housekeeping')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fhousekeeping|\/login\?redirect=\/housekeeping/)
  })

  test('the owner portal asks to sign in and comes back afterwards', async ({ page }) => {
    await page.goto('/owner')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)owner/)
  })

  test('the login page offers Google sign-in', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText(/google/i).first()).toBeVisible()
  })
})
