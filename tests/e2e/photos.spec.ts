// Photo preparation (src/lib/images.ts) in real browsers, Safari's engine
// included: large phone photos are shrunk, sideways iPhone photos come out
// upright, see-through PNGs get a white background, and HEIC files that can't
// be opened get a clear message. Photos are made in the page, so nothing is
// uploaded. Needs the dev server (it loads the module from /src).
import { test, expect, type Page } from '@playwright/test'

test.skip(!!process.env.E2E_BASE_URL && !process.env.E2E_BASE_URL.startsWith('http://localhost'), 'loads /src modules, so dev server only')

async function openModule(page: Page) {
  await page.goto('/terms')
  // A path on the dev server, so it's only resolved in the browser.
  await page.waitForFunction(async (url) => {
    try {
      (window as any).images = await import(/* @vite-ignore */ url)
      return true
    } catch { return false }
  }, '/src/lib/images.ts')
}

test('a 12 MP phone photo becomes a 1600 px JPEG of a few hundred KB', async ({ page }) => {
  await openModule(page)
  const r = await page.evaluate(async () => {
    const { preparePhoto, isPrepared, PHOTO } = (window as any).images
    // A busy 4032 × 3024 picture (like a phone photo), saved as a high quality JPEG.
    const c = document.createElement('canvas'); c.width = 4032; c.height = 3024
    const x = c.getContext('2d')!
    for (let i = 0; i < 4000; i++) {
      x.fillStyle = `hsl(${(i * 37) % 360} 70% ${30 + (i % 50)}%)`
      x.fillRect((i * 97) % 4032, (i * 61) % 3024, 40 + (i % 160), 30 + (i % 120))
    }
    const original: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.95))
    c.width = 0
    const out: Blob = await preparePhoto(original, PHOTO)
    const bmp = await createImageBitmap(out)
    const again = await preparePhoto(out, PHOTO)
    return { originalKB: Math.round(original.size / 1024), kb: Math.round(out.size / 1024), type: out.type, w: bmp.width, h: bmp.height, prepared: isPrepared(out), sameAgain: again === out }
  })
  expect(r.type).toBe('image/jpeg')
  expect([r.w, r.h]).toEqual([1600, 1200])
  expect(r.kb).toBeLessThan(r.originalKB)
  expect(r.kb).toBeLessThan(700)
  expect(r.prepared).toBe(true)
  expect(r.sameAgain).toBe(true) // not shrunk twice
})

test('a sideways iPhone photo (rotation stored in EXIF) comes out upright', async ({ page }) => {
  await openModule(page)
  const r = await page.evaluate(async () => {
    const { preparePhoto } = (window as any).images
    // A landscape 400 × 200 JPEG, then an EXIF block saying "turn 90° clockwise" (orientation 6).
    const c = document.createElement('canvas'); c.width = 400; c.height = 200
    const x = c.getContext('2d')!
    x.fillStyle = '#c00'; x.fillRect(0, 0, 200, 200)
    x.fillStyle = '#00c'; x.fillRect(200, 0, 200, 200)
    const jpeg = new Uint8Array(await (await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.9))).arrayBuffer())
    const exif = [0xff, 0xe1, 0x00, 0x22, ...'Exif'.split('').map((ch) => ch.charCodeAt(0)), 0, 0,
      0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, // big-endian TIFF header, first IFD at 8
      0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0x00, 0x06, 0, 0, // 1 entry: Orientation = 6
      0, 0, 0, 0]
    // Put it right after the JFIF block (or after the start marker if there is none).
    let at = 2
    if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5])
    const rotated = new Blob([jpeg.slice(0, at), new Uint8Array(exif), jpeg.slice(at)], { type: 'image/jpeg' })
    const out: Blob = await preparePhoto(rotated)
    const bmp = await createImageBitmap(out)
    const d = document.createElement('canvas'); d.width = bmp.width; d.height = bmp.height
    const dx = d.getContext('2d')!; dx.drawImage(bmp, 0, 0)
    const top = dx.getImageData(Math.floor(bmp.width / 2), 20, 1, 1).data
    return { w: bmp.width, h: bmp.height, topIsRed: top[0] > 150 && top[2] < 100 }
  })
  expect([r.w, r.h]).toEqual([200, 400]) // portrait now
  expect(r.topIsRed).toBe(true) // turned clockwise: the left (red) half is now on top
})

test('see-through parts of a PNG turn white, not black', async ({ page }) => {
  await openModule(page)
  const corner = await page.evaluate(async () => {
    const { preparePhoto } = (window as any).images
    const c = document.createElement('canvas'); c.width = 100; c.height = 100
    c.getContext('2d')!.fillRect(40, 40, 20, 20) // a dot on a transparent background
    const png: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
    const bmp = await createImageBitmap(await preparePhoto(png))
    const d = document.createElement('canvas'); d.width = 100; d.height = 100
    const dx = d.getContext('2d')!; dx.drawImage(bmp, 0, 0)
    return Array.from(dx.getImageData(2, 2, 1, 1).data)
  })
  expect(corner.slice(0, 3).every((v) => v > 240)).toBe(true)
})

test("a HEIC file the browser can't open gets a clear message", async ({ page }) => {
  await openModule(page)
  const message = await page.evaluate(async () => {
    const { preparePhoto } = (window as any).images
    const fake = new Blob([new Uint8Array([0, 0, 0, 0x18, ...'ftypheic'.split('').map((ch) => ch.charCodeAt(0)), 1, 2, 3, 4])])
    try { await preparePhoto(fake); return 'no error' } catch (err) { return (err as Error).message }
  })
  expect(message).toContain("Apple's HEIC format")
})

test('a 48 MP photo (newest iPhones) is shrunk too', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'making a 48 MP test picture needs a big canvas')
  await openModule(page)
  const r = await page.evaluate(async () => {
    const { preparePhoto } = (window as any).images
    const c = document.createElement('canvas'); c.width = 8064; c.height = 6048
    const x = c.getContext('2d')!
    x.fillStyle = '#7a9'; x.fillRect(0, 0, 8064, 6048)
    for (let i = 0; i < 3000; i++) { x.fillStyle = `hsl(${i % 360} 60% 50%)`; x.fillRect((i * 131) % 8064, (i * 71) % 6048, 120, 90) }
    const original: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.95))
    c.width = 0
    const bmp = await createImageBitmap(await preparePhoto(original))
    return { mb: original.size / 1024 / 1024, w: bmp.width, h: bmp.height }
  })
  expect([r.w, r.h]).toEqual([1600, 1200])
})
