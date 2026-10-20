// Every CRM page on a computer and on a phone, the way a person sees it, with
// a made-up business on a fake backend (support/crmFixture.ts: long names,
// real-length codes, enough rows to scroll), so nothing reaches the live data.
// For each page, its form and the panel a row opens:
//   • nothing sticks out past the screen's sides
//   • no code is cut short
//   • every list, menu and calendar opens fully on screen and on top, and Esc
//     closes it, not the form it's in
//   • on phones, no field small enough that iPhone Safari zooms in on it
//   • no serious accessibility problems (support/a11y.ts), but for two known
//     ones still to fix across the CRM: rows that are buttons holding copy
//     buttons (nested-interactive), and amber and green status text too light
//     on white (color-contrast)
// See support/layout.ts for how each is measured.
import { test, expect, type Page } from '@playwright/test'
import { fakeBackend, signInAs } from './support/fakeSupabase'
import { ADMIN, BOOKINGS, CLEANINGS, CONTRACTS, UNITS, crmRpc, crmTables } from './support/crmFixture'
import { cutCodes, installLayoutProbes, popupProblems, sticksOut, zoomingFields } from './support/layout'
import { seriousProblems } from './support/a11y'

// No fixed clock: a frozen clock stalls the calendars' fade, so they never
// finish closing. The made-up data is dated around Oct 21, 2026, and every
// check here holds on any day.
async function openCrm(page: Page, tab: string) {
  const user = await signInAs(page, ADMIN)
  await fakeBackend(page, user, { tables: crmTables(), rpc: crmRpc() })
  await installLayoutProbes(page)
  await page.goto(`/admin?tab=${tab}`)
  await expect(page.locator('[data-page-scroll]').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

/** The page's own content: its scrolling area, without the menu or the header. */
const content = (page: Page) => page.locator('[data-page-scroll]').first()

const KNOWN = ['nested-interactive', 'color-contrast']

/** Serious accessibility problems, scanned until the page settles (text fades in). */
async function expectAccessible(page: Page) {
  await expect.poll(() => seriousProblems(page, { skip: KNOWN }), { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toEqual([])
}

async function expectFitsTheScreen(page: Page, isMobile: boolean) {
  expect(await sticksOut(page), 'sticks out past the screen').toEqual([])
  expect(await cutCodes(page), 'codes cut short').toEqual([])
  if (isMobile) expect(await zoomingFields(page), 'fields iPhone Safari zooms into').toEqual([])
}

// Each page, the button that opens its form, and a row that opens a panel.
const PAGES: { tab: string; form?: RegExp; row?: string }[] = [
  { tab: 'dashboard' },
  { tab: 'registry', form: /^Add unit$/i, row: UNITS[0].unit_code },
  { tab: 'contracts', form: /^Add contract$/i, row: CONTRACTS[0].contract_code },
  { tab: 'accounting' },
  { tab: 'bookings', form: /^New booking$/i, row: BOOKINGS[15].booking_code },
  { tab: 'housekeeping', form: /^New cleaning$/i, row: CLEANINGS[1].cleaning_code },
  { tab: 'inquiries' },
  { tab: 'interior' },
  { tab: 'campaigns' },
  { tab: 'team', form: /^New booking specialist$/i },
]

for (const { tab, form, row } of PAGES) {
  test.describe(tab, () => {
    test('the page fits the screen, and its lists open fully on screen', async ({ page, isMobile }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await openCrm(page, tab)
      await expectFitsTheScreen(page, isMobile)
      expect(await popupProblems(page, content(page))).toEqual([])
      await expectAccessible(page)
      expect(errors).toEqual([])
    })

    if (form) {
      test('its form fits the screen, and its lists open on top of it', async ({ page, isMobile }) => {
        await openCrm(page, tab)
        await page.getByRole('button', { name: form }).click()
        const dialog = page.getByRole('dialog').last()
        await expect(dialog).toBeVisible()
        await expectFitsTheScreen(page, isMobile)
        expect(await popupProblems(page, dialog)).toEqual([])
        await expectAccessible(page)
      })
    }

    if (row) {
      test('a row opens its panel with every code whole', async ({ page, isMobile }) => {
        await openCrm(page, tab)
        const target = page.locator('[data-row]').filter({ hasText: row }).first()
        await target.scrollIntoViewIfNeeded()
        await target.click({ position: { x: 6, y: 6 } }) // the row's corner, away from its copy buttons
        await expect(page.getByRole('button', { name: 'Close' }).first()).toBeVisible()
        await page.waitForTimeout(400) // the panel settles; the list makes room for it
        await expectFitsTheScreen(page, isMobile)
        await expectAccessible(page)
      })
    }
  })
}
