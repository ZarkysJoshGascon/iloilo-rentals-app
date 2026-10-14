// Crops the inspected enhanced presentation boards into web assets.
// Original sources are untouched. See image-story-enhancement-prompts.json.
// Install sharp outside the app and pass its module directory:
// node scripts/prepare-image-story-assets.mjs /path/to/tools/node_modules
import { createRequire } from 'node:module'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const sharp = process.argv[2]
  ? require(path.resolve(process.argv[2], 'sharp'))
  : require('sharp')
const outDir = 'public/tours/image-stories'
await mkdir(outDir, { recursive: true })

// Pixel rectangles are measured from the final generated boards, not guessed
// from the originals. Keep the model's native detail; no synthetic upscaling.
const renderBoards = [
  {
    source: 'tour-source/enhanced/saint-honore-5b-enhanced.png',
    nativeSize: [1669, 942],
    panels: [
      ['saint-honore-5b-bedroom', 0, 0, 648, 475],
      ['saint-honore-5b-living', 0, 479, 648, 463],
      ['saint-honore-5b-dining', 1019, 0, 650, 484],
      ['saint-honore-5b-kitchen', 1019, 489, 650, 453],
    ],
  },
  {
    source: 'tour-source/enhanced/casa-john-enhanced.png',
    nativeSize: [1935, 813],
    panels: [
      ['casa-john-front', 0, 207, 627, 606],
      ['casa-john-angle', 629, 207, 644, 606],
      ['casa-john-detail', 1276, 207, 659, 606],
    ],
  },
  {
    source: 'tour-source/enhanced/casa-matthew-enhanced.png',
    nativeSize: [1926, 817],
    panels: [
      ['casa-matthew-front', 0, 205, 591, 612],
      ['casa-matthew-angle', 594, 205, 636, 612],
      ['casa-matthew-detail', 1233, 205, 693, 612],
    ],
  },
]

const assets = []
for (const board of renderBoards) {
  const metadata = await sharp(board.source).metadata()
  if (metadata.width !== board.nativeSize[0] || metadata.height !== board.nativeSize[1]) {
    throw new Error(`Board size changed; inspect and remeasure crops: ${board.source}`)
  }
  for (const [name, left, top, width, height] of board.panels) {
    const output = `${outDir}/${name}.webp`
    const individualSource = `tour-source/enhanced/panels/${name}.png`
    const hasIndividual = await access(individualSource).then(() => true, () => false)
    const source = hasIndividual ? individualSource : board.source
    const image = hasIndividual
      ? sharp(individualSource).resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      : sharp(board.source).extract({ left, top, width, height })
    const info = await image
      .webp({ quality: hasIndividual ? 88 : 91, effort: 6 })
      .toFile(output)
    assets.push({ source, referenceBoard: board.source, output, referenceCrop: { left, top, width, height }, width: info.width, height: info.height, bytes: info.size, treatment: hasIndividual ? 'Built-in imagegen individual high-resolution restoration; same original camera and design' : 'Built-in imagegen board enhancement; native-resolution crop' })
  }
}

// Floor plans retain all original geometry, labels and scale annotations.
// Trim only the outer title/logo area; preserve both ground and second floor.
const floorPlans = [
  ['Casa John2.png', 'casa-john-plan', 106, 82, 703, 479],
  ['Cass Matthew2.png', 'casa-matthew-plan', 94, 78, 650, 431],
]
for (const [file, name, left, top, width, height] of floorPlans) {
  const source = `tour-source/${file}`
  const output = `${outDir}/${name}.webp`
  const info = await sharp(source)
    .extract({ left, top, width, height })
    .resize({ width: 1400, kernel: 'lanczos3' })
    .sharpen({ sigma: 0.35 })
    .webp({ quality: 98, effort: 6 })
    .toFile(output)
  assets.push({ source, output, crop: { left, top, width, height }, width: info.width, height: info.height, bytes: info.size, treatment: 'Original floor-plan crop, faithful Lanczos resize and light sharpening; no generative edits' })
}

await writeFile('scripts/image-story-assets-manifest.json', `${JSON.stringify({ assets }, null, 2)}\n`)
console.log(assets.map(({ output, width, height, bytes }) => `${output} ${width}x${height} ${Math.round(bytes / 1024)} KB`).join('\n'))
