// The housekeeping page as a signed-in housekeeper sees it, with a made-up
// housekeeper (support/housekeeperFixture.ts) on a fake backend: nothing
// reaches the live data, so a cleaning can really be submitted. Runs in
// Chrome, Firefox and iPhone Safari's engine: most housekeepers use iPhones.
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { fakeBackend, signInAs } from './support/fakeSupabase'
import { expectNoSeriousProblems } from './support/a11y'
import { HOUSEKEEPER, TODAY, housekeeperData, housekeeperHandlers, type HousekeeperData } from './support/housekeeperFixture'

async function openTasks(page: Page, data: HousekeeperData = housekeeperData()) {
  await page.clock.setFixedTime(TODAY)
  const user = await signInAs(page, HOUSEKEEPER)
  const calls = await fakeBackend(page, user, housekeeperHandlers(data))
  await page.goto('/housekeeping')
  return { calls, data }
}

// Opens a cleaning from the task list, tapping the row in its corner, away
// from its codes (a tap on a code copies it instead).
async function openCleaning(page: Page, code: string) {
  await page.getByRole('button', { name: `Open ${code}` }).click({ position: { x: 6, y: 6 } })
  await expect(page.getByText('Cleaning photos')).toBeVisible()
}

// A 4032 × 3024 photo, the size an iPhone takes, drawn in the page (Node can't draw).
async function phonePhoto(page: Page) {
  const base64 = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4032; c.height = 3024
    const x = c.getContext('2d')!
    x.fillStyle = '#3a7'; x.fillRect(0, 0, c.width, c.height)
    x.fillStyle = '#fff'; x.fillRect(1000, 800, 2000, 1400)
    const blob: Blob = await new Promise((done) => c.toBlob((b) => done(b!), 'image/jpeg', 0.95))
    let text = ''
    for (const byte of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(byte)
    return btoa(text)
  })
  return { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(base64, 'base64') }
}

/** "width×height" from a JPEG's frame header. */
function jpegSize(bytes: Buffer) {
  for (let i = 2; i + 9 < bytes.length; i += 2 + bytes.readUInt16BE(i + 2)) {
    const marker = bytes[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return `${bytes.readUInt16BE(i + 7)}×${bytes.readUInt16BE(i + 5)}`
  }
  throw new Error('no frame header: not a JPEG')
}

async function pickFromGallery(page: Page, files: Parameters<import('@playwright/test').FileChooser['setFiles']>[0]) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Gallery' }).first().click()
  await (await chooser).setFiles(files)
}

test('lists the housekeeper\'s cleanings', async ({ page }) => {
  await openTasks(page)
  const row = page.locator('[data-row]').filter({ hasText: 'CL-TEST0001' }).first()
  await expect(row).toContainText('9S')
  await expect(row).toContainText('BK-9S0004')
})

test('adds photos, shrinks them to JPEG in the browser, and submits the cleaning', async ({ page, browserName }) => {
  const { calls, data } = await openTasks(page)
  await openCleaning(page, 'CL-TEST0001')

  // From the "gallery": a small PNG (turned into a JPEG, never enlarged) and
  // a full-size phone photo (shrunk to 1600 px on its long side).
  await pickFromGallery(page, [{ name: 'logo.png', mimeType: 'image/png', buffer: readFileSync('public/logo-96.png') }, await phonePhoto(page)])
  await expect(page.getByText('New', { exact: true })).toHaveCount(2)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Submit cleaning' }).click()
  await expect(page.getByText('Cleaning submitted')).toBeVisible()

  const uploads = calls.filter((c) => c.kind === 'storage' && c.method === 'POST' && c.name.startsWith('cleaning-photos/'))
  expect(uploads).toHaveLength(2)
  for (const upload of uploads) {
    expect(upload.name).toMatch(/^cleaning-photos\/cl-1\/before\/[a-z0-9]{16}\.jpg$/)
    expect(upload.file?.contentType).toBe('image/jpeg')
  }
  // WebKit gives Playwright the uploaded file's type but not its bytes;
  // photos.spec.ts checks the JPEGs WebKit makes directly.
  if (browserName !== 'webkit') expect(uploads.map((u) => jpegSize(u.file!.bytes)).sort()).toEqual(['1600×1200', '96×96'])
  expect(data.submitted).toHaveLength(1)
  expect(data.submitted[0].p_cleaning_id).toBe('cl-1')
  expect(data.submitted[0].p_photos_before.map((p: { path: string }) => `cleaning-photos/${p.path}`)).toEqual(uploads.map((u) => u.name))
})

test('turns away a file that isn\'t a photo, saying why', async ({ page }) => {
  await openTasks(page)
  await openCleaning(page, 'CL-TEST0001')
  await pickFromGallery(page, { name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a photo') })
  await expect(page.getByText(/Unsupported image format/)).toBeVisible()
  await expect(page.getByText('New', { exact: true })).toHaveCount(0)
})

test('an approved cleaning can\'t be changed', async ({ page }) => {
  const data = housekeeperData()
  Object.assign(data.cleanings[0], { status: 'completed', submitted_at: '2026-10-20T05:00:00Z', completed_at: '2026-10-20T06:00:00Z' })
  await openTasks(page, data)
  await page.getByRole('button', { name: 'Open CL-TEST0001' }).click({ position: { x: 6, y: 6 } })
  await expect(page.getByText(/approved/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit cleaning' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Gallery' })).toHaveCount(0)
})

test('has no serious accessibility problems', async ({ page }) => {
  await openTasks(page)
  await expect(page.locator('[data-row]').first()).toBeVisible()
  await expectNoSeriousProblems(page)
})
