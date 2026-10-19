// src/lib/images.ts
// Every photo is shrunk in the browser before it's kept or uploaded. Phone
// photos, iPhones' especially, are 12 to 48 megapixels and often over 10 MB:
// holding several at full size can make Safari reload the page (losing what
// was typed), and sending them is slow on mobile data.
//
// preparePhoto() turns one photo into a JPEG that fits the given size. It
// opens the photo through an object URL (a data URL would double the memory),
// draws it once at the final size (iPhones cap a canvas at about 16.7 million
// pixels, so there's never a full-size canvas), and frees the canvas at once.
// Sideways phone photos come out upright: browsers apply the photo's own
// rotation when they open it.
//
// iPhones convert their HEIC photos to JPEG when a page asks for JPEG, PNG or
// WebP (as every upload here does), so HEIC only arrives from a computer.

/** Ordinary photos: cleaning photos, receipts. About 300 KB each. */
export const PHOTO = { maxSide: 1600, quality: 0.75 }
/** Photos of papers (signed contracts), where small print must stay readable. */
export const DOCUMENT_PHOTO = { maxSide: 2400, quality: 0.85 }

/** Largest photo accepted before shrinking: room for 48 MP iPhone photos. */
export const PHOTO_MAX_BYTES = 60 * 1024 * 1024

export type PhotoFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'

export type PhotoOptions = {
  maxSide?: number
  maxWidth?: number
  maxHeight?: number
  quality?: number
}

const HEIC_MESSAGE = "This photo is in Apple's HEIC format, which this browser can't open. Upload it from the iPhone itself, or save it as JPEG first."

/** The real format, from a file's first 12 bytes (not its name or type). */
export function sniffPhotoFormat(head: Uint8Array): PhotoFormat | null {
  if (!head || head.length < 12) return null
  const text = (from: number, to: number) => String.fromCharCode(...head.slice(from, to))
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head[0] === 0x89 && text(1, 4) === 'PNG') return 'image/png'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  // HEIC / HEIF: a "ftyp" box naming one of the HEIF brands.
  if (text(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(text(8, 12))) return 'image/heic'
  return null
}

/** The size to draw at: scaled down to fit, never up. */
export function fitWithin(width: number, height: number, maxWidth: number, maxHeight = maxWidth) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// Photos this module made, so preparing one again is free (and doesn't
// re-compress it).
const prepared = new WeakSet<Blob>()
export const isPrepared = (blob: unknown) => blob instanceof Blob && prepared.has(blob)

function openImage(file: Blob): Promise<{ image: HTMLImageElement; close: () => void }> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  const close = () => { image.onload = image.onerror = null; image.src = ''; URL.revokeObjectURL(url) }
  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ image, close })
    image.onerror = () => { close(); reject(new Error('Could not open the photo')) }
    image.src = url
  })
}

/** One photo as a JPEG that fits the given size. Throws with a message to show. */
export async function preparePhoto(file: Blob, options: PhotoOptions = PHOTO): Promise<Blob> {
  if (isPrepared(file)) return file
  if (!(file instanceof Blob)) throw new Error('Invalid file')
  if (file.size > PHOTO_MAX_BYTES) throw new Error('This photo is over 60 MB. Choose a smaller one.')

  const format = sniffPhotoFormat(new Uint8Array(await file.slice(0, 12).arrayBuffer()))
  if (!format) throw new Error('Unsupported image format. Use JPEG, PNG, or WebP.')

  let opened: Awaited<ReturnType<typeof openImage>>
  try {
    opened = await openImage(file)
  } catch {
    throw new Error(format === 'image/heic' ? HEIC_MESSAGE : 'Could not open this photo. Try another one.')
  }

  const maxSide = options.maxSide ?? PHOTO.maxSide
  const { image, close } = opened
  const size = fitWithin(image.naturalWidth, image.naturalHeight, options.maxWidth ?? maxSide, options.maxHeight ?? maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare this photo. Try again.')
    ctx.fillStyle = '#ffffff' // JPEG has no transparency: see-through parts turn white, not black
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', options.quality ?? PHOTO.quality))
    // Safari can fail here when the phone is short of memory.
    if (!blob) throw new Error('Could not prepare this photo. Close other apps and try again.')
    prepared.add(blob)
    return blob
  } finally {
    close()
    // Safari only gives a canvas's memory back once its size is zero.
    canvas.width = 0
    canvas.height = 0
  }
}

/**
 * Several photos, strictly one after another so only one is ever open at
 * full size. Never throws: photos that can't be used come back in `errors`.
 */
export async function preparePhotos(
  files: Blob[],
  options: PhotoOptions = PHOTO,
  onEach?: (done: number) => void,
): Promise<{ photos: Blob[]; errors: string[] }> {
  const photos: Blob[] = []
  const errors: string[] = []
  for (let i = 0; i < files.length; i++) {
    try {
      photos.push(await preparePhoto(files[i], options))
    } catch (err) {
      errors.push((err as Error)?.message || 'Could not prepare this photo.')
    }
    onEach?.(i + 1)
  }
  return { photos, errors }
}
