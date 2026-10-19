// The owner portal as a signed-in owner sees it, with a made-up owner
// (support/ownerFixture.ts: figures you can check by hand) served by a fake
// backend: nothing reaches the live data. The clock is fixed at noon on
// Tuesday, Oct 20, 2026, so "this month" and "upcoming" never drift.
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { fakeBackend, signInAs, type Handlers } from './support/fakeSupabase'
import { expectNoSeriousProblems } from './support/a11y'
import { OWNER, TODAY, UNIT_9S, ownerData, ownerHandlers, type OwnerData } from './support/ownerFixture'

async function openPortal(page: Page, data: OwnerData = ownerData(), extra: Handlers = {}, path = '/owner') {
  await page.clock.setFixedTime(TODAY)
  const user = await signInAs(page, OWNER)
  const handlers = ownerHandlers(data)
  const calls = await fakeBackend(page, user, { ...extra, rpc: { ...handlers.rpc, ...extra.rpc } })
  await page.goto(path)
  return calls
}

// Some owners live abroad: dates must still be the Manila ones. Oct 20 at
// noon in Manila is the evening of Oct 19 here.
test.use({ timezoneId: 'America/Los_Angeles' })

const hero = (page: Page, label: string | RegExp) => page.locator('section').filter({ has: page.getByText(label, { exact: true }) }).first()

test.describe('overview', () => {
  test('greets the owner and leads with her share for the year', async ({ page }) => {
    await openPortal(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Good afternoon, Maria' })).toBeVisible()

    const year = hero(page, 'Your share · Jan–Oct 2026')
    await expect(year.getByText('₱67,802', { exact: true })).toBeVisible()
    await expect(year).toContainText('This month so far ₱24,750 · last month ₱28,163')
    await expect(year.getByRole('group', { name: 'Your share by month' })).toBeVisible()
    for (const [label, value] of [['Gross income', '₱123,000'], ['Expenses', '₱32,598'], ['Net income', '₱90,402']]) {
      await expect(year.getByText(label, { exact: true }).locator('..')).toContainText(value)
    }
  })

  test('lists each unit with its share, occupancy and next check-in', async ({ page }) => {
    await openPortal(page)
    const card = page.getByRole('article', { name: 'Unit 9S' })
    await expect(card).toContainText('₱51,302')
    await expect(card).toContainText('11%')
    await expect(card).toContainText('9 of 81 nights')
    await expect(card).toContainText('Next check-in Oct 24, 2026 · 4 upcoming')
    await expect(page.getByRole('article', { name: 'Unit 12B' })).toContainText('₱16,500')
  })

  test('explains when the account isn\'t linked to a unit', async ({ page }) => {
    const data = ownerData()
    data.owners = []
    await openPortal(page, data)
    await expect(page.getByText('We couldn\'t find a unit for this account')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Use another account' })).toBeVisible()
  })

  test('offers to try again when loading fails, and recovers', async ({ page }) => {
    const data = ownerData()
    // Fails until the test says otherwise (React may load a page twice in development).
    let failing = true
    await openPortal(page, data, {
      rpc: { owner_portal_overview: () => (failing ? new Error('The database is busy') : data.overview()) },
    })
    await expect(page.getByText('Couldn\'t load your units')).toBeVisible()
    failing = false
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Good afternoon/ })).toBeVisible()
  })
})

test.describe('a unit', () => {
  test('opens from its card with the share so far, the stays and this month', async ({ page }) => {
    await openPortal(page)
    await page.getByRole('button', { name: 'Open unit 9S' }).click()
    await expect(page).toHaveURL(new RegExp(`contract=${UNIT_9S}`))

    await expect(hero(page, 'Your share · this contract so far').getByText('₱51,302', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'October 2026' })).toBeVisible()
    const month = hero(page, 'Your share · October 2026')
    await expect(month.getByText('₱15,750', { exact: true })).toBeVisible()
    await expect(month).toContainText('↘ 24% vs Sep')
  })

  test('steps to another month and shows how it was worked out', async ({ page }) => {
    await openPortal(page, ownerData(), {}, `/owner?contract=${UNIT_9S}`)
    await page.getByRole('button', { name: 'Previous month' }).last().click()
    await expect(page.getByRole('heading', { level: 2, name: 'September 2026' })).toBeVisible()

    const worked = page.locator('section').filter({ hasText: 'How this month was worked out' })
    await expect(worked).toContainText('Gross income₱40,000.00')
    await expect(worked).toContainText('Booking commission · 1 booking−₱4,000.00')
    await expect(worked).toContainText('Affiliate commission · 1 booking via affiliates−₱1,000.00')
    await expect(worked).toContainText('Your share (75% of net)₱20,663.25')
  })

  test('shows each bill with its receipt, full size on tap', async ({ page }) => {
    await openPortal(page, ownerData(), {}, `/owner?contract=${UNIT_9S}`)
    await page.getByRole('button', { name: 'Previous month' }).last().click()
    const expenses = page.locator('section').filter({ hasText: 'tap a receipt to see it' })
    await expect(expenses).toContainText('Water')
    await expect(expenses).toContainText('No receipt')

    await expenses.getByRole('button', { name: 'View receipt' }).first().click()
    const lightbox = page.getByRole('dialog', { name: 'Receipt' })
    await expect(lightbox.getByRole('img', { name: 'Receipt' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(lightbox).toBeHidden()
  })

  test('lists the next stays, three at a time on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phones only: the list scrolls beside the chart on a computer')
    await openPortal(page, ownerData(), {}, `/owner?contract=${UNIT_9S}`)
    const stays = page.locator('section').filter({ hasText: 'Guests staying now and upcoming stays' })
    await expect(stays.getByText('Dana Cruz')).toBeVisible() // in the unit now
    await expect(stays.getByText('Hana Ong')).toBeHidden()
    await stays.getByRole('button', { name: 'Show all 5' }).click()
    await expect(stays.getByText('Hana Ong')).toBeVisible()
  })

  test('downloads the Excel statement exactly as the server made it', async ({ page }) => {
    // A zip header then every byte value: any slip turning the reply into a file shows.
    const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array.from({ length: 256 }, (_, i) => i)])
    const calls = await openPortal(page, ownerData(), {
      functions: {
        'send-contract-statement': () => ({ body: { filename: 'Statement-9S-CT-9S-0001.xlsx', file: workbook.toString('base64'), warnings: [] } }),
      },
    }, `/owner?contract=${UNIT_9S}`)
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Statement' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe('Statement-9S-CT-9S-0001.xlsx')
    expect(readFileSync(await download.path())).toEqual(workbook)
    expect(calls.find((c) => c.kind === 'function')?.body).toEqual({ contract_id: UNIT_9S, mode: 'download' })
  })

  test('says when the term\'s records were archived, on the Manila date', async ({ page }) => {
    const data = ownerData()
    data.units[UNIT_9S].contract.records_cleared_at = '2026-10-18T17:00:00Z' // 1 AM Oct 19 in Manila
    await openPortal(page, data, {}, `/owner?contract=${UNIT_9S}`)
    await expect(page.getByRole('status').filter({ hasText: 'archived' })).toContainText('archived on Oct 19, 2026')
  })

  test('shows the overview instead of a contract that isn\'t hers', async ({ page }) => {
    await openPortal(page, ownerData(), {}, '/owner?contract=someone-elses-contract')
    await expect(page.getByRole('heading', { level: 1, name: /Good afternoon/ })).toBeVisible()
  })
})

test.describe('accessibility', () => {
  for (const [name, path] of [['overview', '/owner'], ['unit page', `/owner?contract=${UNIT_9S}`]]) {
    test(`the ${name} has no serious problems`, async ({ page }) => {
      await openPortal(page, ownerData(), {}, path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoSeriousProblems(page)
    })
  }
})
