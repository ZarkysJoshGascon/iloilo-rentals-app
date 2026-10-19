// The CRM in a real browser, signed in as an admin. Read-only: it opens pages,
// menus and previews, and never saves, sends or deletes anything.
// Needs a saved session (tests/e2e/.auth/admin.json); see tests/e2e/README.md.
// Without one these tests are skipped.
import { test, expect, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'

const SESSION = 'tests/e2e/.auth/admin.json'
// How long a finger must stay down to open a row's menu (ContextMenu).
const LONG_PRESS_MS = 500
test.skip(!existsSync(SESSION), `No signed-in session at ${SESSION}; see tests/e2e/README.md`)
test.use({ storageState: existsSync(SESSION) ? SESSION : undefined })

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|google|gsi|Failed to load resource/i.test(m.text())) errors.push(m.text())
  })
  return errors
}

// The welcome pop-up shows once a day; close it if it's there.
async function dismissWelcome(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: /Welcome to the Iloilo Rentals CRM/ })
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: "Let's get to work" }).click()
    await expect(dialog).toBeHidden()
  }
}

test.describe('CRM', () => {
  test('the welcome pop-up greets you with today\'s date, once', async ({ page }) => {
    await page.addInitScript(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('welcome:')) localStorage.removeItem(k)
    })
    await page.goto('/admin?tab=dashboard')
    const dialog = page.getByRole('dialog').filter({ hasText: /Welcome to the Iloilo Rentals CRM/ })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(new Date().getFullYear().toString())
    await dialog.getByRole('button', { name: "Let's get to work" }).click()
    await expect(dialog).toBeHidden()
  })

  test('the dashboard shows the overview, today\'s tiles and the work log', async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/admin?tab=dashboard')
    await dismissWelcome(page)
    for (const tile of ['Total bookings', 'In-house now', 'Upcoming', 'Unpaid bookings', 'Bookings created', 'Bookings edited', 'Cleanings today', 'To be evaluated', 'Cleanings done']) {
      await expect(page.getByRole('button', { name: new RegExp(tile) }).first()).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Work done today' })).toBeVisible()
    await expect(page.getByText('In-house', { exact: true }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('"To be evaluated" opens Housekeeping already filtered', async ({ page }) => {
    await page.goto('/admin?tab=dashboard')
    await dismissWelcome(page)
    await page.getByRole('button', { name: /To be evaluated/ }).first().click()
    await expect(page).toHaveURL(/tab=housekeeping.*filter=to-be-evaluated/)
    await expect(page.getByRole('button', { name: /To be evaluated/, pressed: true }).first()).toBeVisible()
  })

  for (const tab of ['registry', 'contracts', 'accounting', 'bookings', 'housekeeping', 'inquiries', 'interior', 'campaigns', 'team']) {
    test(`the ${tab} page opens without errors`, async ({ page }) => {
      const errors = watchErrors(page)
      await page.goto(`/admin?tab=${tab}`)
      await dismissWelcome(page)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/Couldn't load|Something went wrong/i)).toHaveCount(0)
      expect(errors).toEqual([])
    })
  }

  test('Bookings shows check-ins, check-outs and in-house side by side', async ({ page }) => {
    await page.goto('/admin?tab=bookings')
    await dismissWelcome(page)
    for (const col of ['Check-ins', 'Check-outs', 'In-house']) {
      await expect(page.getByText(col, { exact: true }).first()).toBeVisible()
    }
  })

  test('right-click (or a long press on a phone) on a booking opens its menu', async ({ page, isMobile }) => {
    await page.goto('/admin?tab=dashboard')
    await dismissWelcome(page)
    const row = page.locator('.long-press').first()
    test.skip(!(await row.count()), 'no booking rows on the dashboard today')
    if (isMobile) {
      const box = (await row.boundingBox())!
      await row.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: box.x + 20, clientY: box.y + 10, bubbles: true })
      await page.waitForTimeout(LONG_PRESS_MS + 150) // holding is the gesture itself
      await row.dispatchEvent('pointerup', { pointerType: 'touch', bubbles: true })
    } else {
      await row.click({ button: 'right' })
    }
    await expect(page.getByRole('button', { name: /See in (Bookings|Housekeeping|Contracts|Accounting)/ }).first()).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('a campaign can be previewed exactly as guests will see it (nothing is sent)', async ({ page }) => {
    await page.goto('/admin?tab=campaigns')
    await dismissWelcome(page)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.frameLocator('iframe[title="Email preview"]').getByText('ILOILO RENTALS')).toBeVisible({ timeout: 20_000 })
  })
})
