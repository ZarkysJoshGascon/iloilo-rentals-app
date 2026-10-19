// The parts of photo preparation that need no real image decoding. Decoding,
// shrinking and rotation are checked in real browsers: tests/e2e/photos.spec.ts.
import { describe, expect, it, vi } from 'vitest'
import { fitWithin, isPrepared, preparePhoto, preparePhotos, sniffPhotoFormat, PHOTO_MAX_BYTES } from '@/lib/images'

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))

describe('sniffPhotoFormat', () => {
  it('knows JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffPhotoFormat(bytes([0xff, 0xd8, 0xff, 0xe0], '\0\x10JFIF\0\x01'))).toBe('image/jpeg')
    expect(sniffPhotoFormat(bytes([0x89], 'PNG\r\n\x1a\n\0\0\0\r'))).toBe('image/png')
    expect(sniffPhotoFormat(bytes('RIFF\x24\0\0\0WEBP'))).toBe('image/webp')
  })

  it("knows Apple's HEIC photos", () => {
    expect(sniffPhotoFormat(bytes('\0\0\0\x18ftypheic'))).toBe('image/heic')
    expect(sniffPhotoFormat(bytes('\0\0\0\x18ftypmif1'))).toBe('image/heic')
  })

  it('rejects anything else, whatever the file is called', () => {
    expect(sniffPhotoFormat(bytes('%PDF-1.7\n%abc'))).toBeNull()
    expect(sniffPhotoFormat(bytes('\0\0\0\x18ftypmp42'))).toBeNull() // a video
    expect(sniffPhotoFormat(bytes([1, 2, 3]))).toBeNull()
  })
})

describe('fitWithin', () => {
  it('shrinks the long side to the limit, keeping the shape', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 }) // 12 MP iPhone photo
    expect(fitWithin(6048, 8064, 1600)).toEqual({ width: 1200, height: 1600 }) // 48 MP, upright
  })

  it('never makes a photo bigger', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('can limit width and height separately', () => {
    expect(fitWithin(1000, 4000, 1200, 1800)).toEqual({ width: 450, height: 1800 })
    expect(fitWithin(3000, 1000, 1200, 1800)).toEqual({ width: 1200, height: 400 })
  })
})

describe('preparePhoto', () => {
  it('refuses photos over 60 MB before opening them', async () => {
    class Huge extends Blob { get size() { return PHOTO_MAX_BYTES + 1 } }
    await expect(preparePhoto(new Huge(['x']))).rejects.toThrow('over 60 MB')
  })

  it('refuses files that are not photos', async () => {
    await expect(preparePhoto(new Blob(['%PDF-1.7 not a photo']))).rejects.toThrow('Unsupported image format')
  })

  it('refuses things that are not files', async () => {
    await expect(preparePhoto('photo.jpg' as unknown as Blob)).rejects.toThrow('Invalid file')
  })

  it('only marks photos it made itself as prepared', () => {
    expect(isPrepared(new Blob(['x']))).toBe(false)
    expect(isPrepared(null)).toBe(false)
  })
})

describe('preparePhotos', () => {
  it('keeps going past photos it cannot use, and reports each one', async () => {
    const onEach = vi.fn()
    const { photos, errors } = await preparePhotos([new Blob(['not a photo']), new Blob(['nor this'])], undefined, onEach)
    expect(photos).toEqual([])
    expect(errors).toEqual([
      'Unsupported image format. Use JPEG, PNG, or WebP.',
      'Unsupported image format. Use JPEG, PNG, or WebP.',
    ])
    expect(onEach.mock.calls).toEqual([[1], [2]])
  })
})
