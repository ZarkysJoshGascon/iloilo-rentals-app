// scripts/interior-depth-maps.mjs
// Makes the depth maps for the 3D interior walkthrough (InteriorProjectTour).
// For every photo in a folder it writes "<photo>.depth.png" next to it
// (white = near), using the Depth Anything V2 model on this computer.
//
//   npm i --no-save @huggingface/transformers@3.7.1   (once; not a site dependency)
//   node scripts/interior-depth-maps.mjs "tour-source/01 Project - Location"
//
// Then upload the photos and their depth maps together to
// hero-images/interior/<NN Project - Location>/ (see lib/siteImages.js).
import { pipeline, RawImage } from '@huggingface/transformers'
import { readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const [inDir, outDir = inDir] = process.argv.slice(2)
if (!inDir) { console.error("Usage: node scripts/interior-depth-maps.mjs <folder of photos> [output folder]"); process.exit(1) }
mkdirSync(outDir, { recursive: true })
const estimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'fp32' })

function boxBlur(data, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    let acc = 0
    for (let x = -r; x <= r; x++) acc += data[y * w + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1)
      acc += data[y * w + Math.min(w - 1, x + r + 1)] - data[y * w + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1)
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

for (const file of readdirSync(inDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !/\.depth\.png$/i.test(f))) {
  const t0 = Date.now()
  const image = await RawImage.read(path.join(inDir, file))
  const { depth } = await estimator(image)
  const w = 768, h = Math.round((768 * image.height) / image.width)
  const small = await depth.resize(w, h)
  const gray = small.channels === 1 ? small.data : small.grayscale().data
  const smooth = boxBlur(gray, w, h, 2)
  const out = new RawImage(smooth, w, h, 1)
  const name = file.replace(/\.(jpe?g|png|webp)$/i, '.depth.png')
  await out.save(path.join(outDir, name))
  console.log(`${file} → ${name} (${w}×${h}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}
