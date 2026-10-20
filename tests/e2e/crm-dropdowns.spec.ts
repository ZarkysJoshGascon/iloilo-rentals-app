// Dropdowns in the CRM, as an admin on a computer and on a phone: a list
// opens fully on screen and on top of the form it's in (never cut off by the
// form's edges or hidden behind it), scrolls to its last item, and fits above
// a phone's keyboard. A made-up admin on a fake backend (support/), so
// nothing reaches the live data.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { fakeBackend, signInAs, type Handlers } from './support/fakeSupabase'

const TODAY = new Date('2026-10-20T12:00:00+08:00')
const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Ana Admin' }
const SPECIALISTS = Array.from({ length: 25 }, (_, i) => ({
  id: `sp-${i + 1}`, code: `SP-${String(i + 1).padStart(4, '0')}`, name: `Specialist ${i + 1}`, photo_url: null,
}))
const UNITS = Array.from({ length: 30 }, (_, i) => ({
  id: `unit-${i + 1}`, unit_code: `${i + 1}S`, building: 'Megaworld Tower', status: 'ACTIVE', current_contract_id: null,
}))
// Every unit under a running contract (only those can be booked).
const UNIT_CONTRACTS = UNITS.map((u, i) => ({
  id: `c-${i + 1}`, contract_code: `CT-${String(i + 1).padStart(4, '0')}`, unit_id: u.id, effective_date: '2026-01-01', expiry_date: '2026-12-31',
}))
const OWNERS = [{ id: 'owner-1', name: 'Maria Santos', email: 'maria@example.com', phone: null }]
const CONTRACTS = [
  { ...UNIT_CONTRACTS[0], owner_id: 'owner-1', units: { id: 'unit-1', building: 'Megaworld Tower', unit_code: '1S' }, owners: OWNERS[0] },
  { ...UNIT_CONTRACTS[1], owner_id: null, units: { id: 'unit-2', building: 'Ayala Residences', unit_code: '2S' }, owners: null },
]

async function openCrm(page: Page, path: string, tables: NonNullable<Handlers['tables']> = {}) {
  await page.clock.setFixedTime(TODAY)
  const user = await signInAs(page, ADMIN)
  await fakeBackend(page, user, { tables: { admin_users: () => [{ user_id: ADMIN.id }], ...tables } })
  await page.goto(path)
}

async function openBookingForm(page: Page) {
  await openCrm(page, '/admin?tab=bookings', { specialists: () => SPECIALISTS, units: () => UNITS, contracts: () => UNIT_CONTRACTS })
  await page.getByRole('button', { name: 'New booking' }).click()
  await expect(page.getByRole('heading', { name: 'New Booking' })).toBeVisible()
}

/** What covers the middle of `target`, or null when nothing does (it's on top). */
const coveredBy = (target: Locator) => target.evaluate((el) => {
  const r = el.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  if (hit && el.contains(hit)) return null
  if (!hit) return 'nothing there (off screen)'
  const slot = hit.getAttribute('data-slot')
  return `<${hit.tagName.toLowerCase()}${slot ? ` data-slot="${slot}"` : ''} class="${String(hit.getAttribute('class') || '').slice(0, 80)}">: ${(hit.textContent || '').trim().slice(0, 40)}`
})

/** How far `target` sticks out past the screen's edges (0 when it's fully on screen). */
async function overflow(page: Page, target: Locator) {
  const box = (await target.boundingBox())!
  const { width, height } = page.viewportSize()!
  return Math.max(0, -box.x, -box.y, box.x + box.width - width, box.y + box.height - height)
}

test.describe('in the booking form', () => {
  test('the specialists list opens fully on screen and on top, and scrolls to the last one', async ({ page }) => {
    await openBookingForm(page)
    const field = page.getByRole('button', { name: 'Booked by: No specialist' })
    await field.scrollIntoViewIfNeeded()
    await field.click()

    const list = page.getByRole('dialog', { name: 'Booked by' })
    await expect(list).toBeVisible()
    await expect.poll(() => overflow(page, list)).toBe(0)
    expect(await coveredBy(list.getByText('Specialist 1', { exact: true }))).toBeNull()

    const last = list.getByText('Specialist 25', { exact: true })
    await last.scrollIntoViewIfNeeded()
    expect(await coveredBy(last)).toBeNull() // not behind the form's buttons
    await last.click()
    await expect(list).toBeHidden()
    await expect(page.getByRole('button', { name: 'Booked by: Specialist 25' })).toBeVisible()
  })

  test('the specialists list fits above a phone\'s keyboard', async ({ page }) => {
    await openBookingForm(page)
    const field = page.getByRole('button', { name: /^Booked by:/ })
    await field.scrollIntoViewIfNeeded()
    await field.click()
    const list = page.getByRole('dialog', { name: 'Booked by' })
    await expect(list).toBeVisible()

    // The keyboard takes half the screen: the list makes do with what's left.
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 430 })
    await expect.poll(() => overflow(page, list)).toBe(0)
    const last = list.getByText('Specialist 25', { exact: true })
    await last.scrollIntoViewIfNeeded()
    expect(await coveredBy(last)).toBeNull()
  })

  test('Esc closes the list, not the booking form', async ({ page }) => {
    await openBookingForm(page)
    const field = page.getByRole('button', { name: /^Booked by:/ })
    await field.scrollIntoViewIfNeeded()
    await field.click()
    await expect(page.getByRole('dialog', { name: 'Booked by' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Booked by' })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'New Booking' })).toBeVisible()
  })

  test('the unit list opens on top of the form, not behind it', async ({ page }) => {
    await openBookingForm(page)
    await page.getByText('Select a unit...').click()

    // A select menu lays an invisible guard over itself while it opens, so a
    // pixel check misreads it; a click only lands once nothing covers the
    // option (Playwright checks), and fails naming what's in the way.
    const last = page.getByRole('option', { name: 'Megaworld Tower — 30S' })
    await last.click()
    await expect(last).toBeHidden()
    await expect(page.locator('[data-slot="select-value"]').first()).toHaveText('Megaworld Tower — 30S')
  })
})

test.describe('filters', () => {
  test('picking from a select inside the contracts filter keeps the filter open, and shows names', async ({ page }) => {
    await openCrm(page, '/admin?tab=contracts', { contracts: () => CONTRACTS, units: () => UNITS, owners: () => OWNERS })
    await page.getByRole('button', { name: 'Filter' }).click()
    const filters = page.getByRole('dialog', { name: 'Filters' })
    await expect(filters).toBeVisible()
    await expect.poll(() => overflow(page, filters)).toBe(0)

    await filters.getByText('All buildings').click()
    await page.getByRole('option', { name: 'Ayala Residences' }).click() // lands only if above the filter panel
    await expect(filters).toBeVisible()
    await expect(filters.getByText('Ayala Residences')).toBeVisible()

    // An owner is picked by id; the filter shows the name.
    await filters.getByText('All owners').click()
    await page.getByRole('option', { name: 'Maria Santos' }).click()
    await expect(filters.getByText('Maria Santos')).toBeVisible()
    await expect(filters.getByText('owner-1')).toHaveCount(0)
  })

  test('the bookings date filter opens on screen, and picking a day keeps it open', async ({ page }) => {
    await openCrm(page, '/admin?tab=bookings')
    await page.getByRole('button', { name: /^Check-in dates:/ }).click()
    const filter = page.getByRole('dialog', { name: 'Booking check-in range' })
    await expect(filter).toBeVisible()
    await expect.poll(() => overflow(page, filter)).toBe(0)

    await filter.getByRole('button', { name: 'Check-in from' }).click()
    const calendar = page.getByRole('dialog', { name: 'Check-in from' })
    await calendar.getByRole('button', { name: /^Oct 1, 2026/ }).click()
    await calendar.getByRole('button', { name: 'Done' }).click()
    await expect(filter).toBeVisible()
    await expect(filter.getByRole('button', { name: 'Check-in from' })).toHaveText('Oct 1, 2026')
  })
})
