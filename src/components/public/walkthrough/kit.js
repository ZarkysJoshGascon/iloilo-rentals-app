// src/components/public/walkthrough/kit.js
// Building blocks for the 3D unit walkthroughs: helpers to add boxes, panels,
// tubes, plants and loaded models to a scene in metres; photo textures laid on
// at their real-world size; and a few surfaces drawn on a canvas (shoji paper,
// slats, city windows, brushed steel, a cooktop, quartz). three.js is passed
// in, so it loads only with the walkthrough.

/** Seeded random numbers, so a surface looks the same on every visit. */
function seeded(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`
function shade(color, amount) {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 255) + amount))
  const g = Math.max(0, Math.min(255, ((color >> 8) & 255) + amount))
  const b = Math.max(0, Math.min(255, (color & 255) + amount))
  return `rgb(${r},${g},${b})`
}

// Fine speckle, for shoji paper.
function speckle(ctx, w, h, rand, alpha, count) {
  for (let i = 0; i < count; i++) {
    const v = rand() < 0.5 ? 0 : 255
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5)
  }
}

// Smooth noise wraps in both directions, including its slope at the join.
// Sampling the endpoints together also keeps opposite canvas edges identical.
function periodicNoise(cells, seed) {
  const rand = seeded(seed)
  const values = Float32Array.from({ length: cells * cells }, () => rand() * 2 - 1)
  return (x, y) => {
    const sx = x * cells, sy = y * cells
    const ix = Math.floor(sx), iy = Math.floor(sy)
    const fx = sx - ix, fy = sy - iy
    const tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy)
    const at = (a, b) => values[((b % cells + cells) % cells) * cells + (a % cells + cells) % cells]
    const a = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx
    const b = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx
    return a * (1 - ty) + b * ty
  }
}

// A paired colour/data surface. Roughness is linear [0, 1]; use
// tex(pair.roughness, { color: false }) so it is not converted from sRGB.
function finishCanvases(base, size, sample) {
  const edge = Math.min(512, Math.max(64, Math.round(size)))
  const [color, colorCtx] = canvas(edge, edge)
  const [roughness, roughCtx] = canvas(edge, edge)
  const colorPixels = colorCtx.createImageData(edge, edge)
  const roughPixels = roughCtx.createImageData(edge, edge)
  const rgb = [(base >> 16) & 255, (base >> 8) & 255, base & 255]
  const byte = (v) => Math.min(255, Math.max(0, Math.round(v)))
  for (let y = 0; y < edge; y++) {
    for (let x = 0; x < edge; x++) {
      const [tone, finish] = sample(x / (edge - 1), y / (edge - 1))
      const i = (y * edge + x) * 4
      for (let channel = 0; channel < 3; channel++) colorPixels.data[i + channel] = byte(rgb[channel] + tone)
      const r = byte(finish * 255)
      roughPixels.data[i] = roughPixels.data[i + 1] = roughPixels.data[i + 2] = r
      colorPixels.data[i + 3] = roughPixels.data[i + 3] = 255
    }
  }
  colorCtx.putImageData(colorPixels, 0, 0)
  roughCtx.putImageData(roughPixels, 0, 0)
  return { color, roughness }
}

export function createKit(THREE, renderer, { RoundedBoxGeometry } = {}) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  const textures = []
  const geometries = []
  const materials = []
  const instances = []
  const shapeCache = new Map()
  const seamMaterials = new WeakMap()

  // Only local, immutable shapes are shared. World-aligned texture geometry
  // stays private to its mesh so one object's UVs cannot alter its neighbour.
  function shape(key, build) {
    if (!shapeCache.has(key)) {
      const geometry = build()
      geometries.push(geometry)
      shapeCache.set(key, geometry)
    }
    return shapeCache.get(key)
  }

  function tex(c, { repeat = [1, 1], color = true } = {}) {
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
    t.anisotropy = maxAniso
    if (color) t.colorSpace = THREE.SRGBColorSpace
    textures.push(t)
    return t
  }

  // ── Surfaces drawn on a canvas ────────────────────────────
  /** Shoji paper with a dark wooden grid (cols × rows panes). */
  function shoji({ cols = 4, rows = 3, paper = 0xf3ede1, wood = 0x6b4a33, line = 10 } = {}) {
    const [c, ctx] = canvas(512, 512)
    ctx.fillStyle = hex(paper)
    ctx.fillRect(0, 0, 512, 512)
    speckle(ctx, 512, 512, seeded(13), 0.04, 3000)
    ctx.fillStyle = hex(wood)
    for (let i = 0; i <= cols; i++) ctx.fillRect(Math.min(512 - line, (i * 512) / cols - line / 2), 0, line, 512)
    for (let j = 0; j <= rows; j++) ctx.fillRect(0, Math.min(512 - line, (j * 512) / rows - line / 2), 512, line)
    return c
  }

  /** Vertical slats, e.g. upholstered wall panels or curtain folds. */
  function slats({ base = 0x6f6a66, count = 10 } = {}) {
    const [c, ctx] = canvas(512, 256)
    const rand = seeded(17)
    const w = 512 / count
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = shade(base, Math.round((rand() - 0.5) * 10))
      ctx.fillRect(i * w, 0, w, 256)
      const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0)
      g.addColorStop(0, 'rgba(0,0,0,0.35)')
      g.addColorStop(0.12, 'rgba(0,0,0,0)')
      g.addColorStop(0.85, 'rgba(255,255,255,0.06)')
      g.addColorStop(1, 'rgba(0,0,0,0.3)')
      ctx.fillStyle = g
      ctx.fillRect(i * w, 0, w, 256)
    }
    return c
  }

  /** Night-time windows on a tower: one tile is 16 bays by 10 floors, about 32 m square. */
  function windows({ seed = 23, lit = 0.3 } = {}) {
    const [c, ctx] = canvas(512, 512)
    ctx.fillStyle = '#0e1014'
    ctx.fillRect(0, 0, 512, 512)
    const rand = seeded(seed)
    for (let f = 0; f < 10; f++) {
      const y = Math.round(f * 51.2) + 14
      const floorLit = rand() < 0.8 // some floors are dark altogether
      for (let b = 0; b < 16; b++) {
        if (floorLit && rand() < lit / 0.8) {
          ctx.fillStyle = rand() < 0.8 ? `rgb(255,${178 + Math.round(rand() * 52)},${105 + Math.round(rand() * 65)})` : 'rgb(196,222,255)'
        } else {
          const v = 22 + Math.round(rand() * 12)
          ctx.fillStyle = `rgb(${v},${v + 4},${v + 11})`
        }
        ctx.fillRect(b * 32 + 4, y, 24, 30)
      }
    }
    return c
  }

  /** Brushed steel: fine vertical streaks, used as a roughness map. */
  function brushed(seed = 29) {
    const [c, ctx] = canvas(256, 256)
    ctx.fillStyle = '#7a7a7a'
    ctx.fillRect(0, 0, 256, 256)
    const rand = seeded(seed)
    for (let i = 0; i < 1600; i++) {
      const v = 90 + Math.round(rand() * 90)
      ctx.fillStyle = `rgba(${v},${v},${v},${0.2 + rand() * 0.4})`
      ctx.fillRect(rand() * 256, 0, 0.5 + rand(), 256)
    }
    return c
  }

  /** A black-glass induction cooktop, two faint cooking zones one behind the other. */
  function hob() {
    const [c, ctx] = canvas(256, 512)
    ctx.fillStyle = '#0b0b0c'
    ctx.fillRect(0, 0, 256, 512)
    ctx.strokeStyle = 'rgba(150,150,150,0.35)'
    ctx.lineWidth = 3
    for (const [y, r] of [[140, 82], [370, 70]]) {
      ctx.beginPath()
      ctx.arc(128, y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(150,150,150,0.4)'
    for (let i = 0; i < 4; i++) ctx.fillRect(226, 220 + i * 20, 4, 10)
    return c
  }

  /** Engineered quartz: a pale ground with fine grey, white and dark grains. */
  function quartz({ base = 0xcfccc9, seed = 31 } = {}) {
    const [c, ctx] = canvas(512, 512)
    ctx.fillStyle = hex(base)
    ctx.fillRect(0, 0, 512, 512)
    const rand = seeded(seed)
    for (let i = 0; i < 16000; i++) {
      const v = rand()
      if (v < 0.6) ctx.fillStyle = `rgba(120,116,112,${0.12 + rand() * 0.3})`
      else if (v < 0.9) ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.4})`
      else ctx.fillStyle = `rgba(70,66,62,${0.25 + rand() * 0.4})`
      const s = 0.8 + rand() * 1.8
      ctx.fillRect(rand() * 512, rand() * 512, s, s)
    }
    return c
  }

  /**
   * Fine painted plaster: { base: hex colour, grain: detail strength,
   * roughness: 0..1, seed, size: 64..512 }. Returns { color, roughness }.
   * Ivory and greige surfaces use low variation to retain the reference hue.
   */
  function plaster({ base = 0xe9e3da, grain = 0.45, roughness = 0.94, seed = 47, size = 256 } = {}) {
    const broad = periodicNoise(8, seed)
    const grainNoise = periodicNoise(128, seed + 1)
    const fine = periodicNoise(32, seed + 2)
    return finishCanvases(base, size, (x, y) => {
      const b = broad(x, y), f = fine(x, y), g = grainNoise(x, y)
      return [(b * 1.8 + f + g * 2.2) * grain, roughness + (f * 0.015 + g * 0.02) * grain]
    })
  }

  /**
   * Real-scale woven cloth, with paired colour, linear roughness and a
   * tangent-space normal derived from the same yarn relief. `tile` is the
   * physical tile width in metres; use that value on the upholstered mesh.
   * Broad pile/yarn variation survives mipmapping, while fine cross-weave
   * appears when approaching the furniture. All three maps are periodic.
   */
  function fabric({ base = 0xebe8e2, weave = 'linen', threads = 72, contrast = 1, roughness = 0.92, seed = 53, size = 1024, tile = 0.27 } = {}) {
    const edge = Math.min(1024, Math.max(128, Math.round(size)))
    const count = Math.min(Math.floor(edge / 12) * 2, Math.max(8, Math.round(threads / 2) * 2))
    const tau = Math.PI * 2
    const [color, colorCtx] = canvas(edge, edge)
    const [rough, roughCtx] = canvas(edge, edge)
    const [normal, normalCtx] = canvas(edge, edge)
    const colorPixels = colorCtx.createImageData(edge, edge)
    const roughPixels = roughCtx.createImageData(edge, edge)
    const normalPixels = normalCtx.createImageData(edge, edge)
    const heights = new Float32Array(edge * edge)
    const rgb = [(base >> 16) & 255, (base >> 8) & 255, base & 255]
    const broad = periodicNoise(7, seed)
    const yarn = periodicNoise(27, seed + 1)
    const fiber = periodicNoise(121, seed + 2)
    const byte = (v) => Math.min(255, Math.max(0, Math.round(v)))
    const relief = weave === 'mesh' ? 0.00034 : weave === 'knit' ? 0.00052 : weave === 'velvet' ? 0.000065 : 0.00017
    const warp = Float32Array.from({ length: edge }, (_, i) => Math.cos(i / (edge - 1) * count * tau))
    const crossing = Float32Array.from({ length: edge }, (_, i) => Math.cos(i / (edge - 1) * count * Math.PI))
    for (let y = 0; y < edge; y++) {
      const v = y / (edge - 1)
      for (let x = 0; x < edge; x++) {
        const u = x / (edge - 1)
        const b = broad(u, v), f = fiber(u, v), n = yarn(u, v)
        const wx = warp[x], wy = warp[y], over = crossing[x] * crossing[y]
        let h, tone, finish
        if (weave === 'velvet') {
          // Short directional nap: mottled highlights, never a painted grid.
          const pile = Math.sin(u * tau * 5 + Math.sin(v * tau * 3) * 0.55)
          h = f * 0.48 + n * 0.14 + wx * 0.04
          tone = b * 8 + pile * 2.6 + n * 4 + f * 3
          finish = roughness + b * 0.045 + pile * 0.025 + f * 0.025
        } else if (weave === 'knit') {
          const loops = Math.max(4, Math.round(count / 3))
          const row = Math.cos(v * loops * tau)
          const stitch = Math.cos(u * loops * tau + Math.sin(v * loops * tau) * 0.8)
          h = stitch * 0.5 + row * 0.28 + f * 0.12
          tone = stitch * 10 + row * 4 + b * 5 + n * 4 + f * 2
          finish = roughness + stitch * 0.035 + f * 0.025
        } else if (weave === 'mesh') {
          const hole = Math.max(0, -wx) * Math.max(0, -wy)
          h = (wx + wy) * 0.32 - hole * 0.65 + f * 0.07
          tone = (wx + wy) * 8 - hole * 28 + b * 4 + f * 2
          finish = roughness + hole * 0.065 - (wx + wy) * 0.018
        } else {
          // Alternating warp and weft crowns form an actual plain weave.
          const crowned = (wx + wy) * 0.27 + over * 0.2
          const wool = weave === 'wool'
          h = crowned + f * (wool ? 0.32 : 0.13) + n * 0.12
          tone = crowned * (wool ? 12 : 16) + b * 6 + n * (wool ? 7 : 4) + f * (wool ? 5 : 2.5)
          finish = roughness - crowned * 0.032 + f * 0.032 + b * 0.012
        }
        const i = (y * edge + x) * 4
        heights[y * edge + x] = h
        for (let c = 0; c < 3; c++) colorPixels.data[i + c] = byte(rgb[c] + tone * contrast)
        const r = byte(finish * 255)
        roughPixels.data[i] = roughPixels.data[i + 1] = roughPixels.data[i + 2] = r
        colorPixels.data[i + 3] = roughPixels.data[i + 3] = normalPixels.data[i + 3] = 255
      }
    }
    const at = (x, y) => heights[((y + edge - 1) % (edge - 1)) * edge + (x + edge - 1) % (edge - 1)]
    const slope = relief / Math.max(0.01, Array.isArray(tile) ? tile[0] : tile) * (edge - 1) / 2
    for (let y = 0; y < edge; y++) {
      for (let x = 0; x < edge; x++) {
        const nx = -(at(x + 1, y) - at(x - 1, y)) * slope
        // Canvas rows run down; CanvasTexture.flipY makes the tangent +v
        // direction run up. Its normal component therefore has this sign.
        const ny = (at(x, y + 1) - at(x, y - 1)) * slope
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
        const i = (y * edge + x) * 4
        normalPixels.data[i] = byte((nx * inv * 0.5 + 0.5) * 255)
        normalPixels.data[i + 1] = byte((ny * inv * 0.5 + 0.5) * 255)
        normalPixels.data[i + 2] = byte((inv * 0.5 + 0.5) * 255)
      }
    }
    colorCtx.putImageData(colorPixels, 0, 0)
    roughCtx.putImageData(roughPixels, 0, 0)
    normalCtx.putImageData(normalPixels, 0, 0)
    return { color, roughness: rough, normal }
  }

  /**
   * Satin painted cabinetry: { base: hex colour, grain: detail strength,
   * roughness: 0..1, seed, size: 64..512 }. Returns { color, roughness }.
   * The minute finish variation stays visible in reflected light.
   */
  function lacquer({ base = 0x857d79, grain = 0.35, roughness = 0.58, seed = 59, size = 256 } = {}) {
    const broad = periodicNoise(8, seed)
    const fine = periodicNoise(128, seed + 1)
    return finishCanvases(base, size, (x, y) => {
      const b = broad(x, y), f = fine(x, y)
      return [(b * 0.5 + f * 0.6) * grain, roughness + f * 0.04 * grain]
    })
  }

  // ── Materials ─────────────────────────────────────────────
  function material(params, Kind = THREE.MeshStandardMaterial) {
    const m = new Kind(params)
    materials.push(m)
    return m
  }
  /** A canvas surface as a material, tiled `repeat` times. */
  function surface(c, params = {}, repeat = [1, 1]) {
    return material({ map: tex(c, { repeat }), ...params })
  }
  function glow(color, intensity = 2) {
    return material({ color: 0x000000, emissive: color, emissiveIntensity: intensity, toneMapped: true })
  }

  /**
   * Lay textures on at real size: `tile` is metres per square, or a
   * [width, height] pair for a rectangular texture's physical dimensions.
   * Each vertex takes its UV from the two world axes across its face, so
   * neighbouring blocks line up and nothing stretches. `turn` swaps the axes
   * (e.g. floorboards running the other way).
   */
  function worldUV(g, offset, tile, turn = false) {
    const p = g.attributes.position
    const n = g.attributes.normal
    const [tileU, tileV] = Array.isArray(tile) ? tile : [tile, tile]
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + offset.x
      const y = p.getY(i) + offset.y
      const z = p.getZ(i) + offset.z
      // RoundedBoxGeometry keeps six independent sewn/milled faces. A
      // curved corner's normal must not suddenly select a different UV
      // projection within one face: that made upholstered arms smear.
      const face = g.type === 'RoundedBoxGeometry' ? Math.floor(i / (p.count / 6)) : -1
      const ax = face >= 0 ? Number(face < 2) : Math.abs(n.getX(i))
      const ay = face >= 0 ? Number(face === 2 || face === 3) : Math.abs(n.getY(i))
      const az = face >= 0 ? Number(face >= 4) : Math.abs(n.getZ(i))
      let u, v
      if (ax >= ay && ax >= az) { u = z; v = y } else if (ay >= az) { u = x; v = z } else { u = x; v = y }
      if (turn) [u, v] = [v, u]
      uv[i * 2] = u / tileU
      uv[i * 2 + 1] = v / tileV
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }

  // ── Shapes, in metres: blocks span their min → max corners ─
  function add(scene, mesh, { cast = true, receive = true } = {}) {
    mesh.castShadow = cast
    mesh.receiveShadow = receive
    scene.add(mesh)
    return mesh
  }
  // opts.round softens the edges (metres), for cushions, mattresses and the
  // like; opts.tile lays photo textures on at that size (see worldUV).
  function block(scene, [x0, y0, z0], [x1, y1, z1], mat, opts = {}) {
    const [w, h, d] = [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)]
    const round = opts.round && RoundedBoxGeometry ? Math.min(opts.round, w / 2, h / 2, d / 2) : 0
    const shared = !round && !opts.tile
    const g = shared ? shape('box', () => new THREE.BoxGeometry(1, 1, 1))
      : round ? new RoundedBoxGeometry(w, h, d, Math.min(8, Math.max(2, opts.segments ?? 3)), round) : new THREE.BoxGeometry(w, h, d)
    if (!shared) geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    if (shared) m.scale.set(w, h, d)
    if (opts.tile) worldUV(g, m.position, opts.tile, opts.turn)
    return add(scene, m, opts)
  }

  /**
   * A soft rectangular cushion, pillow or mattress. `at` is its centre;
   * `size` is [width, height, depth] in metres. The smallest axis is the
   * thickness unless `axis` is x/y/z. `puff` and `tuft` are thickness
   * fractions; `droop` is metres. `rotation` is radians. A cheap optional
   * seam follows the pinched edge. `kind` distinguishes a tailored seat or
   * back from a stuffed pillow. Pillow crease fans deform the geometry and
   * their sewn edge has physical piping, so both survive changes in light.
   * Identical local shapes reuse geometry; the fabric UVs never switch axes.
   */
  function cushion(scene, { at, size, mat, tile = 0.27, rotation = [0, 0, 0], puff = 0.12, droop = 0, tuft = 0, segments, seam = true, seamMat, cast = true, receive = true, axis, kind, wrinkles, seed = 1 } = {}) {
    const thickness = axis ? { x: 0, y: 1, z: 2 }[axis] : size.indexOf(Math.min(...size))
    const across = [0, 1, 2].filter((a) => a !== thickness)
    const style = kind || (puff >= 0.28 ? 'pillow' : thickness === 1 ? 'seat' : 'back')
    const folds = wrinkles ?? (style === 'pillow' ? 0.75 : style === 'seat' ? 0.16 : 0.12)
    const steps = Math.min(32, Math.max(8, Math.round(segments ?? (style === 'pillow' ? 24 : 14))))
    const key = JSON.stringify(['cushion', size, thickness, puff, droop, tuft, steps, tile, style, folds, seed])
    const phase = seeded(seed)() * Math.PI * 2
    const pillow = style === 'pillow'
    const edge = pillow ? Math.max(0.075, 0.18 - puff * 0.2) : style === 'seat' ? 0.7 : 0.54
    const [tileU, tileV] = Array.isArray(tile) ? tile : [tile, tile]
    const point = (u, v, side) => {
      const centre = Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), pillow ? 0.46 : 0.26)
      const cu = 1 - Math.abs(u), cv = 1 - Math.abs(v)
      const corner = Math.exp(-(cu * cu + cv * cv) * 5.5)
      // Narrow diagonal and splayed folds meet each sewn pillow corner.
      const fan = Math.exp(-(((cu - cv * 0.58) / 0.062) ** 2))
        + Math.exp(-(((cv - cu * 0.7) / 0.065) ** 2)) * 0.65
      const wave = Math.sin(u * 7 + v * 4 + phase) * Math.sin(v * 6 - u * 3 + phase * 0.6)
      const indentU = u - Math.sin(phase) * 0.16
      const indentV = v - Math.cos(phase) * 0.13
      const foldDepth = folds * (fan * corner * (pillow ? 0.105 : 0.018) + wave * centre * 0.014)
      const dome = edge + (1 - edge) * centre - Math.max(0, tuft) * Math.exp(-10 * (indentU * indentU + indentV * indentV)) - foldDepth
      const p = [0, 0, 0]
      p[across[0]] = u * Math.sqrt(1 - (pillow ? 0.04 : 0.025) * v * v) * size[across[0]] / 2
      p[across[1]] = v * Math.sqrt(1 - (pillow ? 0.04 : 0.025) * u * u) * size[across[1]] / 2
      p[thickness] = side * size[thickness] / 2 * Math.max(edge, dome)
      p[1] -= droop * centre
      return p
    }
    const perimeter = []
    for (let x = 0; x <= steps; x++) perimeter.push(x)
    for (let y = 1; y <= steps; y++) perimeter.push(y * (steps + 1) + steps)
    for (let x = steps - 1; x >= 0; x--) perimeter.push(steps * (steps + 1) + x)
    for (let y = steps - 1; y > 0; y--) perimeter.push(y * (steps + 1))
    const geometry = shape(key, () => {
      const positions = [], index = [], uvs = []
      const faceCount = (steps + 1) ** 2
      const positive = thickness !== 1
      const triangle = (a, b, c, forward) => index.push(a, forward ? b : c, forward ? c : b)
      for (const side of [1, -1]) {
        for (let y = 0; y <= steps; y++) {
          for (let x = 0; x <= steps; x++) {
            const u = x / steps * 2 - 1, v = y / steps * 2 - 1
            const p = point(u, v, side)
            positions.push(...p)
            // A single fabric direction across each curved sewn face avoids
            // dominant-normal projection seams around a bulging pillow.
            uvs.push(p[across[0]] / (tileU || 1), p[across[1]] / (tileV || 1))
          }
        }
      }
      for (let face = 0; face < 2; face++) {
        for (let y = 0; y < steps; y++) {
          for (let x = 0; x < steps; x++) {
            const a = face * faceCount + y * (steps + 1) + x
            const b = a + 1, c = a + steps + 1, d = c + 1
            const forward = face === 0 ? positive : !positive
            triangle(a, b, c, forward)
            triangle(b, d, c, forward)
          }
        }
      }
      let distance = 0
      for (let i = 0; i < perimeter.length; i++) {
        const ia = perimeter[i], ib = perimeter[(i + 1) % perimeter.length]
        const a = positions.slice(ia * 3, ia * 3 + 3), b = positions.slice(ib * 3, ib * 3 + 3)
        const aBack = positions.slice((ia + faceCount) * 3, (ia + faceCount) * 3 + 3)
        const bBack = positions.slice((ib + faceCount) * 3, (ib + faceCount) * 3 + 3)
        const length = Math.hypot(...a.map((value, axis) => value - b[axis]))
        const start = positions.length / 3
        positions.push(...a, ...aBack, ...b, ...bBack)
        uvs.push(distance / (tileU || 1), size[thickness] * edge / (tileV || 1),
          distance / (tileU || 1), 0, (distance + length) / (tileU || 1), size[thickness] * edge / (tileV || 1),
          (distance + length) / (tileU || 1), 0)
        triangle(start, start + 1, start + 2, positive)
        triangle(start + 2, start + 1, start + 3, positive)
        distance += length
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      g.setIndex(index)
      g.computeVertexNormals()
      g.computeBoundingBox()
      g.computeBoundingSphere()
      return g
    })
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.fromArray(at)
    mesh.rotation.set(...rotation)
    if (seam) {
      const seamGeometry = shape(`${key}:seam`, () => {
        const points = perimeter.map((i) => new THREE.Vector3(...point((i % (steps + 1)) / steps * 2 - 1, Math.floor(i / (steps + 1)) / steps * 2 - 1, 0)))
        const path = new THREE.CatmullRomCurve3(points, true, 'centripetal')
        const radius = Math.min(0.0018, Math.min(...size) * 0.035)
        return new THREE.TubeGeometry(path, perimeter.length * 2, radius, 5, true)
      })
      if (!seamMat && !seamMaterials.has(mat)) {
        seamMaterials.set(mat, material({ color: mat.color?.clone().multiplyScalar(0.88) || 0xaaa298, map: mat.map, roughness: 0.98 }))
      }
      const piping = new THREE.Mesh(seamGeometry, seamMat || seamMaterials.get(mat))
      piping.castShadow = cast
      piping.receiveShadow = receive
      mesh.add(piping)
    }
    return add(scene, mesh, { cast, receive })
  }
  /** A flat picture/panel facing +x, −x, +z or −z, centred at (x, y, z). */
  function panel(scene, { at: [x, y, z], size: [w, h], facing, mat, cast = false, tile }) {
    const g = new THREE.PlaneGeometry(w, h)
    g.rotateY({ '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[facing])
    geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y, z)
    if (tile) worldUV(g, m.position, tile)
    return add(scene, m, { cast, receive: true })
  }
  /** A flat rectangle lying on the floor (or on the ceiling, facing down). */
  function flat(scene, { x0, z0, x1, z1, y, mat, down = false, tile, turn }) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
    g.rotateX(down ? Math.PI / 2 : -Math.PI / 2)
    geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
    if (tile) worldUV(g, m.position, tile, turn)
    return add(scene, m, { cast: false, receive: true })
  }
  function cylinder(scene, { at: [x, y, z], r, h, mat, r2 = r, seg = 24, cast = true, receive = true, open = false, tile }) {
    const ratio = r2 / r
    const key = `cylinder:${ratio}:${seg}:${open}`
    const source = shape(key, () => new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, open))
    const g = tile ? shape(`${key}:${r}:${h}:tile:${tile}`, () => {
      const copy = source.clone()
      const [tileU, tileV] = Array.isArray(tile) ? tile : [tile, tile]
      const uv = copy.attributes.uv, p = copy.attributes.position, n = copy.attributes.normal
      for (let i = 0; i < uv.count; i++) {
        if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i) * r / tileU, p.getZ(i) * r / tileV)
        else uv.setXY(i, uv.getX(i) * Math.PI * (r + r2) / tileU, uv.getY(i) * h / tileV)
      }
      return copy
    }) : source
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y + h / 2, z)
    m.scale.set(r, h, r)
    return add(scene, m, { cast, receive })
  }
  function sphere(scene, { at: [x, y, z], r, mat, scale = [1, 1, 1], cast = true, receive = true, detail = 16, tile }) {
    const key = `sphere:${detail}`
    const source = shape(key, () => new THREE.SphereGeometry(1, detail, Math.max(8, detail * 0.75)))
    const g = tile ? shape(`${key}:${r}:${scale}:tile:${tile}`, () => {
      const copy = source.clone()
      const [tileU, tileV] = Array.isArray(tile) ? tile : [tile, tile]
      const uv = copy.attributes.uv
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * Math.PI * r * (scale[0] + scale[2]) / tileU, uv.getY(i) * Math.PI * r * scale[1] / tileV)
      }
      return copy
    }) : source
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y, z)
    m.scale.set(scale[0] * r, scale[1] * r, scale[2] * r)
    return add(scene, m, { cast, receive })
  }
  /** A round tube along a smooth path through `points` (a faucet, a cord). */
  function tube(scene, { points, r, mat, seg = 48, cast = true, tile }) {
    const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    const g = new THREE.TubeGeometry(path, seg, r, 10, false)
    if (tile) {
      const [tileU, tileV] = Array.isArray(tile) ? tile : [tile, tile]
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * path.getLength() / tileU, uv.getY(i) * Math.PI * 2 * r / tileV)
    }
    geometries.push(g)
    return add(scene, new THREE.Mesh(g, mat), { cast })
  }
  /** A tapered round limb from a to b (a trunk or branch): radius r0 → r1. */
  function limb(scene, a, b, r0, r1, mat, { tile, seg = 8, joints = true } = {}) {
    const from = new THREE.Vector3(...a)
    const dir = new THREE.Vector3(...b).sub(from)
    const height = dir.length()
    const ratio = r1 / r0
    const key = `cylinder:${ratio}:${seg}:false`
    const source = shape(key, () => new THREE.CylinderGeometry(ratio, 1, 1, seg))
    const g = tile ? shape(`${key}:${r0}:${height}:tile:${tile}`, () => {
      const copy = source.clone()
      const [tileU, tileV] = Array.isArray(tile) ? tile : [tile, tile]
      const uv = copy.attributes.uv, p = copy.attributes.position, n = copy.attributes.normal
      for (let i = 0; i < uv.count; i++) {
        if (Math.abs(n.getY(i)) > 0.9) uv.setXY(i, p.getX(i) * r0 / tileU, p.getZ(i) * r0 / tileV)
        else uv.setXY(i, uv.getX(i) * Math.PI * (r0 + r1) / tileU, uv.getY(i) * height / tileV)
      }
      return copy
    }) : source
    const m = new THREE.Mesh(g, mat)
    m.scale.set(r0, height, r0)
    m.position.copy(from).addScaledVector(dir, 0.5)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    add(scene, m)
    if (joints) sphere(scene, { at: b, r: r1, mat, detail: 8, tile })
    return m
  }
  /** Many plain boxes ([min, max] corner pairs) as one mesh: a lattice, railing bars. */
  function boxes(scene, list, mat, opts = {}) {
    const pos = []
    const nrm = []
    const index = []
    for (const [[x0, y0, z0], [x1, y1, z1]] of list) {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      const base = pos.length / 3
      pos.push(...g.attributes.position.array)
      nrm.push(...g.attributes.normal.array)
      for (const k of g.index.array) index.push(base + k)
      g.dispose()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    g.setIndex(index)
    worldUV(g, new THREE.Vector3(), opts.tile || 1, opts.turn)
    geometries.push(g)
    return add(scene, new THREE.Mesh(g, mat), opts)
  }
  /** A pleated curtain hanging in the plane z, across x0 → x1, from y0 up to y1. */
  function drape(scene, { x0, x1, y0, y1, z, folds = 6, depth = 0.06, mat, tile }) {
    const w = x1 - x0
    const g = new THREE.PlaneGeometry(w, y1 - y0, folds * 12, 1)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w + 0.5
      p.setZ(i, Math.sin(u * folds * Math.PI * 2) * depth * 0.5)
    }
    g.computeVertexNormals()
    geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z)
    if (tile) {
      const [tileU, tileV] = Array.isArray(tile) ? tile : [tile, tile]
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + m.position.x) / tileU, (p.getY(i) + m.position.y) / tileV)
    }
    return add(scene, m)
  }

  // ── Plants ────────────────────────────────────────────────
  // One leaf, 1 m long down +y: pointed at both ends, folded along the
  // midrib and curling back toward the tip. Scaled per instance.
  let leafGeo = null
  let leafMaterial = null
  function leafGeometry() {
    if (leafGeo) return leafGeo
    const rows = 7
    const pos = []
    for (let i = 0; i <= rows; i++) {
      const t = i / rows
      const w = 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.8)
      const curl = -0.22 * t * t
      pos.push(-w, t, curl + w * 0.35, 0, t, curl, w, t, curl + w * 0.35)
    }
    const index = []
    for (let i = 0; i < rows; i++) {
      const a = i * 3
      const b = a + 3
      index.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1)
    }
    leafGeo = new THREE.BufferGeometry()
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    leafGeo.setIndex(index)
    leafGeo.computeVertexNormals()
    leafGeo.computeBoundingBox()
    geometries.push(leafGeo)
    return leafGeo
  }

  /**
   * Leaves scattered over the outside of one or more clusters (ellipsoids,
   * each { at, r: [rx, ry, rz], count }), each leaf facing outward with a
   * little twist, in shades between `colors`. Optional `bounds` (or
   * `clipBox`) is a world-space [min, max] box: entire leaves must fit.
   * Tiny leaves receive shadows but do not cast them by default.
   */
  function foliage(scene, { clusters, size = 0.045, colors = [0x24391f, 0x4f6b35], seed = 1, mat, bounds, clipBox, cast = false, receive = true }) {
    const rand = seeded(seed)
    const total = clusters.reduce((n, c) => n + c.count, 0)
    if (!mat && !leafMaterial) leafMaterial = material({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide })
    const leafMat = mat || leafMaterial
    const mesh = new THREE.InstancedMesh(leafGeometry(), leafMat, total)
    instances.push(mesh)
    const limit = bounds || clipBox
    const box = limit ? (limit.isBox3 ? limit : new THREE.Box3(new THREE.Vector3(...limit[0]), new THREE.Vector3(...limit[1]))) : null
    const leafBox = new THREE.Box3()
    const dummy = new THREE.Object3D()
    const out = new THREE.Vector3()
    const dark = new THREE.Color(colors[0])
    const light = new THREE.Color(colors[1])
    const color = new THREE.Color()
    let i = 0
    for (const { at, r, count } of clusters) {
      for (let k = 0; k < count; k++) {
        // A direction biased upward and outward; leaves sit near the surface.
        out.set(rand() * 2 - 1, rand() * 1.6 - 0.5, rand() * 2 - 1).normalize()
        const depth = 0.7 + rand() * 0.3
        dummy.position.set(at[0] + out.x * r[0] * depth, at[1] + out.y * r[1] * depth, at[2] + out.z * r[2] * depth)
        dummy.lookAt(dummy.position.x + out.x, dummy.position.y + out.y + 0.4, dummy.position.z + out.z)
        dummy.rotateZ(rand() * Math.PI * 2)
        dummy.rotateX((rand() - 0.5) * 0.9)
        const s = size * (0.7 + rand() * 0.6)
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        if (box && !box.containsBox(leafBox.copy(mesh.geometry.boundingBox).applyMatrix4(dummy.matrix))) continue
        mesh.setMatrixAt(i, dummy.matrix)
        // Lighter on top, darker underneath and inside.
        color.copy(dark).lerp(light, Math.min(1, Math.max(0, 0.35 + out.y * 0.4 + (rand() - 0.5) * 0.5)))
        mesh.setColorAt(i, color)
        i++
      }
    }
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
    mesh.castShadow = cast
    mesh.receiveShadow = receive
    scene.add(mesh)
    return mesh
  }

  /**
   * Named model parts retain transforms relative to their source scene.
   * Copies stand at `at`, with height constrained by optional fitWidth and
   * fitDepth (metres after turning). clipBounds is [min,max], in world
   * space by default, or model-local space with clipSpace: 'local'.
   * Alpha-tested leaves write depth to prevent transparent sorting flicker.
   */
  function model(scene, source, { nodes, at: [x, y, z], height, turn = 0, fitWidth, fitDepth, cast = false, receive = true, clipBounds, clipSpace = 'world' }) {
    const group = new THREE.Group()
    const content = new THREE.Group()
    group.add(content)
    source.updateWorldMatrix(true, true)
    const relative = new THREE.Matrix4().copy(source.matrixWorld).invert()
    const parts = nodes ? nodes.map((name) => source.getObjectByName(name)).filter(Boolean) : [source]
    // Selecting both a group and its descendant must not duplicate leaves.
    const selected = parts.filter((part) => {
      for (let parent = part.parent; parent && parent !== source.parent; parent = parent.parent) {
        if (parts.includes(parent)) return false
      }
      return true
    })
    for (const part of selected) {
      const copy = part.clone()
      copy.matrix.copy(relative).multiply(part.matrixWorld)
      copy.matrix.decompose(copy.position, copy.quaternion, copy.scale)
      content.add(copy)
    }
    const box = new THREE.Box3().setFromObject(content)
    if (box.isEmpty()) return add(scene, group, { cast, receive })
    const extent = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    let s = height / Math.max(1e-6, extent.y)
    const c = Math.abs(Math.cos(turn)), t = Math.abs(Math.sin(turn))
    if (fitWidth > 0) s = Math.min(s, fitWidth / Math.max(1e-6, extent.x * c + extent.z * t))
    if (fitDepth > 0) s = Math.min(s, fitDepth / Math.max(1e-6, extent.x * t + extent.z * c))
    content.position.set(-centre.x, -box.min.y, -centre.z)
    group.scale.setScalar(s)
    group.rotation.y = turn
    group.position.set(x, y, z)
    group.updateMatrixWorld(true)
    let planes = null
    if (clipBounds) {
      const [min, max] = clipBounds.isBox3 ? [clipBounds.min.toArray(), clipBounds.max.toArray()] : clipBounds
      planes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -min[0]), new THREE.Plane(new THREE.Vector3(-1, 0, 0), max[0]),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -min[1]), new THREE.Plane(new THREE.Vector3(0, -1, 0), max[1]),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -min[2]), new THREE.Plane(new THREE.Vector3(0, 0, -1), max[2]),
      ]
      if (clipSpace === 'local') planes.forEach((plane) => plane.applyMatrix4(group.matrixWorld))
      renderer.localClippingEnabled = true
    }
    const copies = new Map()
    group.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = cast
      o.receiveShadow = receive
      geometries.push(o.geometry)
      const cloneMaterial = (original) => {
        if (copies.has(original)) return copies.get(original)
        const m = original.clone()
        const cutout = m.alphaTest > 0 || (m.opacity >= 0.98 && (m.alphaMap || /leaf|leaves|foliage/i.test(o.name)) && m.map)
        if (cutout) {
          m.transparent = false
          m.opacity = 1
          m.alphaTest = Math.max(m.alphaTest, 0.45)
          m.depthWrite = true
          m.side = THREE.DoubleSide
        }
        if (planes) { m.clippingPlanes = planes; m.clipShadows = true }
        copies.set(original, m)
        materials.push(m)
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap']) {
          if (m[key]) textures.push(m[key])
        }
        return m
      }
      o.material = Array.isArray(o.material) ? o.material.map(cloneMaterial) : cloneMaterial(o.material)
    })
    scene.add(group)
    return group
  }

  /**
   * Merge finished static opaque meshes sharing a material and render flags.
   * Call once after the scene is built. Positions, normals, tangents and UVs
   * retain their world transforms; instancing, animation, transparent
   * surfaces, custom shaders and meshes carrying children stay separate.
   */
  function batch(scene) {
    scene.updateMatrixWorld(true)
    const inverse = new THREE.Matrix4().copy(scene.matrixWorld).invert()
    const groups = new Map()
    let before = 0
    const visible = (object) => {
      for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false
      return true
    }
    scene.traverse((mesh) => {
      if (!mesh.isMesh || !visible(mesh)) return
      before++
      const { geometry, material: mat } = mesh
      if (mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.children.length || Array.isArray(mat)
        || mat.transparent || mat.isShaderMaterial || mat.isRawShaderMaterial
        || mesh.morphTargetInfluences?.length || Object.keys(geometry.morphAttributes).length) return
      const attrs = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
      if (!geometry.attributes.position || attrs.some(([, attr]) => attr.itemSize > 4 || attr.isInstancedBufferAttribute
        || attr.count !== geometry.attributes.position.count)) return
      const available = geometry.index?.count ?? geometry.attributes.position.count
      if (geometry.drawRange.start !== 0 || geometry.drawRange.count < available) return
      const signature = attrs.map(([name, attr]) => `${name}:${attr.itemSize}`).join(',')
      const key = `${mat.id}:${mesh.castShadow}:${mesh.receiveShadow}:${mesh.renderOrder}:${mesh.layers.mask}:${mesh.frustumCulled}:${signature}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(mesh)
    })
    let merged = 0, batches = 0
    const matrix = new THREE.Matrix4()
    for (const members of groups.values()) {
      if (members.length < 2) continue
      const vertexCount = members.reduce((n, mesh) => n + mesh.geometry.attributes.position.count, 0)
      const indexCount = members.reduce((n, mesh) => n + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count), 0)
      const attributes = Object.fromEntries(Object.entries(members[0].geometry.attributes).map(([name, attr]) => [name, {
        size: attr.itemSize, values: new Float32Array(vertexCount * attr.itemSize),
      }]))
      const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount)
      const components = ['getX', 'getY', 'getZ', 'getW']
      let vertexOffset = 0, indexOffset = 0
      for (const source of members) {
        matrix.copy(inverse).multiply(source.matrixWorld)
        const reflected = matrix.determinant() < 0
        const copy = source.geometry.clone().applyMatrix4(matrix)
        const count = copy.attributes.position.count
        for (const [name, { size, values }] of Object.entries(attributes)) {
          const attr = copy.attributes[name]
          for (let v = 0; v < count; v++) {
            for (let c = 0; c < size; c++) values[(vertexOffset + v) * size + c] = attr[components[c]](v) * (name === 'tangent' && c === 3 && reflected ? -1 : 1)
          }
        }
        const countIndices = copy.index?.count ?? count
        for (let i = 0; i < countIndices; i++) {
          const sourceIndex = reflected && i % 3 !== 0 ? i + (i % 3 === 1 ? 1 : -1) : i
          indices[indexOffset + i] = vertexOffset + (copy.index ? copy.index.getX(sourceIndex) : sourceIndex)
        }
        vertexOffset += count
        indexOffset += countIndices
        copy.dispose()
      }
      const geometry = new THREE.BufferGeometry()
      for (const [name, { size, values }] of Object.entries(attributes)) geometry.setAttribute(name, new THREE.BufferAttribute(values, size))
      geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      geometries.push(geometry)
      const first = members[0]
      const mesh = new THREE.Mesh(geometry, first.material)
      mesh.castShadow = first.castShadow
      mesh.receiveShadow = first.receiveShadow
      mesh.renderOrder = first.renderOrder
      mesh.layers.mask = first.layers.mask
      mesh.frustumCulled = first.frustumCulled
      mesh.name = `batch:${first.material.name || first.material.id}`
      mesh.userData.mergedMeshes = members.length
      members.forEach((source) => source.removeFromParent())
      scene.add(mesh)
      merged += members.length
      batches++
    }
    return { before, after: before - merged + batches, merged, batches }
  }

  function dispose() {
    instances.forEach((m) => m.dispose())
    new Set(textures).forEach((t) => t.dispose())
    new Set(geometries).forEach((g) => g.dispose())
    new Set(materials).forEach((m) => m.dispose())
  }

  return {
    // surfaces
    shoji, slats, windows, brushed, hob, quartz, plaster, fabric, lacquer, tex,
    // materials
    material, surface, glow,
    // shapes
    block, cushion, panel, flat, cylinder, sphere, tube, limb, boxes, drape, foliage, model, add, batch,
    track: { textures, geometries, materials },
    dispose,
  }
}
