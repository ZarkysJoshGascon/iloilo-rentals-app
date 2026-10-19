import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadImages } from '@/lib/preloadImages'

// jsdom never loads images, so Image is replaced: each decode() waits until
// the test settles it, by URL.
type Pending = { src: string; resolve: () => void; reject: () => void }
let pending: Pending[] = []

class FakeImage {
  src = ''
  decoding = ''
  decode() {
    return new Promise<void>((resolve, reject) => pending.push({ src: this.src, resolve, reject }))
  }
}

const settle = async (src: string, ok = true) => {
  const p = pending.find((x) => x.src === src)!
  if (ok) p.resolve()
  else p.reject()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  pending = []
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => { pending = [] })

describe('preloadImages', () => {
  it('resolves straight away when there is nothing to load', async () => {
    await expect(preloadImages([])).resolves.toBeUndefined()
    await expect(preloadImages([null, undefined, ''])).resolves.toBeUndefined()
  })

  it('loads each image once, however often it appears', () => {
    preloadImages(['a.jpg', 'b.jpg', 'a.jpg', null])
    expect(pending.map((p) => p.src)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('reports progress and finishes when every image is done, failed ones included', async () => {
    const onProgress = vi.fn()
    let done = false
    preloadImages(['a.jpg', 'b.jpg', 'c.jpg'], { onProgress }).then(() => { done = true })

    await settle('a.jpg')
    await settle('b.jpg', false) // a broken image still counts as done
    expect(done).toBe(false)
    await settle('c.jpg')

    expect(onProgress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]])
    expect(done).toBe(true)
  })

  it('gives up waiting after the timeout, while images keep loading', async () => {
    vi.useFakeTimers()
    let done = false
    preloadImages(['slow.jpg'], { timeout: 8_000 }).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(7_999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })
})
