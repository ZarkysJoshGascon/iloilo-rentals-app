// scripts/interior-upscale.mjs
// Enlarges a small render 4× with an AI super-resolution model (Swin2SR,
// real-world variant: also cleans up compression), for the interior tours
// when only small images are available. Runs on this computer, in tiles.
//
//   npm i --no-save @huggingface/transformers@3.7.1   (once; not a site dependency)
//   node scripts/interior-upscale.mjs "in.png" "out.png"
//
// Then make its depth map with scripts/interior-depth-maps.mjs.
import { pipeline, RawImage } from '@huggingface/transformers'
import sharp from 'sharp'
const [inFile, outFile, model = 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr'] = process.argv.slice(2)
const t0 = Date.now()
const up = await pipeline('image-to-image', model, { dtype: 'fp32' })
const src = await RawImage.read(inFile)
const rgb = src.channels === 4 ? src.rgb() : src
const TILE = 96, PAD = 8
const W = rgb.width, H = rgb.height, S = 4
const out = Buffer.alloc(W * S * H * S * 3)
for (let ty = 0; ty < H; ty += TILE) {
  for (let tx = 0; tx < W; tx += TILE) {
    const x0 = Math.max(0, tx - PAD), y0 = Math.max(0, ty - PAD)
    const x1 = Math.min(W, tx + TILE + PAD), y1 = Math.min(H, ty + TILE + PAD)
    const tile = await rgb.crop([x0, y0, x1 - 1, y1 - 1])
    const res = await up(tile)
    const r = Array.isArray(res) ? res[0] : res
    // Copy the tile's centre (without its padding) into place.
    const cx0 = (tx - x0) * S, cy0 = (ty - y0) * S
    const cw = Math.min(TILE, W - tx) * S, ch = Math.min(TILE, H - ty) * S
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const si = ((cy0 + y) * r.width + (cx0 + x)) * r.channels
        const di = (((ty * S) + y) * W * S + (tx * S) + x) * 3
        out[di] = r.data[si]; out[di + 1] = r.data[si + 1]; out[di + 2] = r.data[si + 2]
      }
    }
  }
}
await sharp(out, { raw: { width: W * S, height: H * S, channels: 3 } }).png().toFile(outFile)
console.log(`${inFile.split('/').pop()} ${W}×${H} → ${W * S}×${H * S} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
