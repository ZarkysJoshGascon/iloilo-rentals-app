// Faithful portrait enhancement: original photo pixels only, no face restoration.
// Keep the original assets and JPEGs intact. Install sharp outside the app, then:
// node scripts/prepare-design-team-portraits.mjs /path/to/tools/node_modules
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const sharp = process.argv[2]
  ? require(path.resolve(process.argv[2], 'sharp'))
  : require('sharp')

const portraits = [
  {
    source: 'tour-source/ishCEO.jpg',
    output: 'public/tours/design-team/ismael-bebita-enhanced.webp',
    width: 421,
    height: 365,
  },
  {
    source: 'tour-source/HERNANARCHITECT.jpg',
    output: 'public/tours/design-team/hernando-parreno-enhanced.webp',
    width: 523,
    height: 332,
  },
]

for (const portrait of portraits) {
  // Match the existing crop exactly, excluding only the original title strip.
  // Sharpen existing edges gently at source resolution, without regenerating
  // detail, smoothing skin, changing color, or changing any facial geometry.
  const sharpened = await sharp(portrait.source)
    .extract({ left: 0, top: 0, width: portrait.width, height: portrait.height })
    .sharpen({ sigma: 0.8, m1: 0.35, m2: 1.5, x1: 3, y2: 4, y3: 6 })
    .png()
    .toBuffer()

  // A 2x Lanczos export gives the browser a smooth high-density image; it
  // cannot recover detail absent from the source. Lossless WebP avoids adding
  // another generation of lossy compression to the original JPEG photograph.
  const info = await sharp(sharpened)
    .resize({ width: portrait.width * 2, height: portrait.height * 2, kernel: 'lanczos3' })
    .webp({ lossless: true, effort: 6 })
    .toFile(portrait.output)

  console.log(`${portrait.output}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`)
}
