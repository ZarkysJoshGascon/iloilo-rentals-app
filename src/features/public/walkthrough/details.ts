// src/features/public/walkthrough/details.ts
// Furniture and styling built for close inspection: bevelled edges, shadow
// gaps between doors and drawers, piped cushions, turned ceramics, real
// door hardware, books and small objects. Everything is in metres and in
// the unit's coordinates (x across from the left wall, y up, z toward the
// balcony); the scene passes in its materials.

export function createDetails(THREE, kit, scene, m) {
  const { block, cylinder, limb, cushion, add, material } = kit

  /** A turned object (vase, bowl, lamp base) from a [radius, height] profile. */
  function lathe(at, profile, mat, { seg = 40, cast = true } = {}) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg)
    kit.track.geometries.push(g)
    const mesh = new THREE.Mesh(g, mat)
    mesh.position.set(...at)
    return add(scene, mesh, { cast })
  }

  // Thin-walled ceramics: outer profile up, then back down inside.
  const VASES = {
    bottle: [[0, 0], [0.042, 0], [0.058, 0.012], [0.066, 0.05], [0.062, 0.1], [0.04, 0.15], [0.02, 0.18], [0.017, 0.215], [0.022, 0.225], [0.016, 0.225], [0.012, 0.19], [0.012, 0.02]],
    jar: [[0, 0], [0.05, 0], [0.068, 0.02], [0.078, 0.08], [0.072, 0.14], [0.052, 0.168], [0.05, 0.178], [0.044, 0.178], [0.044, 0.02]],
    bud: [[0, 0], [0.03, 0], [0.042, 0.03], [0.045, 0.07], [0.03, 0.11], [0.012, 0.135], [0.013, 0.15], [0.009, 0.15], [0.008, 0.12]],
    bowl: [[0, 0], [0.035, 0], [0.05, 0.005], [0.068, 0.025], [0.078, 0.048], [0.073, 0.048], [0.062, 0.03], [0.04, 0.012], [0, 0.012]],
  }
  function vessel(at, kind, mat, scale = 1) {
    return lathe(at, VASES[kind].map(([r, y]) => [r * scale, y * scale]), mat)
  }

  // Hardback books: a coloured case around cream pages, stacked flat or in
  // a row. `turn` swings the stack about y.
  const pageMat = material({ color: 0xece4d3, roughness: 0.9 })
  const bookColors = [0x2d3a3f, 0x8b7a63, 0xd8d0c2, 0x5b4636, 0x3e4a3a]
  const bookMats = bookColors.map((color) => material({ color, roughness: 0.75 }))
  function books(at, { count = 2, turn = 0, seed = 0 } = {}) {
    const group = new THREE.Group()
    let y = 0
    for (let i = 0; i < count; i++) {
      const w = 0.21 - ((i + seed) % 3) * 0.018, d = 0.15 - ((i + seed) % 2) * 0.014, h = 0.022 + ((i + seed) % 3) * 0.006
      const twist = (((i * 7 + seed * 3) % 5) - 2) * 0.05
      const cover = new THREE.Mesh(boxGeometry(w, h, d), bookMats[(i + seed) % bookMats.length])
      cover.position.set(0, y + h / 2, 0)
      cover.rotation.y = twist
      const pages = new THREE.Mesh(boxGeometry(w - 0.01, h - 0.005, d - 0.006), pageMat)
      pages.position.set(0.006, y + h / 2, 0)
      pages.rotation.y = twist
      group.add(cover, pages)
      y += h
    }
    group.position.set(...at)
    group.rotation.y = turn
    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    scene.add(group)
    return group
  }
  const boxCache = new Map()
  function boxGeometry(w, h, d) {
    const key = `${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`
    if (!boxCache.has(key)) {
      const g = kit.RoundedBox ? new kit.RoundedBox(w, h, d, 2, Math.min(0.003, h / 3)) : new THREE.BoxGeometry(w, h, d)
      kit.track.geometries.push(g)
      boxCache.set(key, g)
    }
    return boxCache.get(key)
  }

  /**
   * A three-seat lounge against the wall at x0, from z0 to z1: low legs, a
   * base rail, deep rounded arms, a back frame, piped seat and back
   * cushions, and a throw pillow at each arm.
   */
  function sofa({ x0, x1, z0, z1, fabric, legs, pillows }) {
    const F = { tile: 0.27 }
    const arm = 0.16, back = 0.16, base = 0.08
    for (const [x, z] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) {
      limb(scene, [x, 0, z], [x, base + 0.005, z], 0.012, 0.017, legs)
    }
    block(scene, [x0 + 0.02, base, z0 + 0.03], [x1 - 0.015, base + 0.19, z1 - 0.03], fabric, { round: 0.03, segments: 3, ...F })
    for (const [a, b] of [[z0, z0 + arm], [z1 - arm, z1]]) {
      block(scene, [x0, base, a], [x1, 0.6, b], fabric, { round: 0.07, segments: 5, ...F })
    }
    block(scene, [x0, base + 0.18, z0 + arm - 0.01], [x0 + back, 0.8, z1 - arm + 0.01], fabric, { round: 0.06, segments: 4, ...F })
    const seatLen = (z1 - z0 - 2 * arm) / 2
    const seatX0 = x0 + back
    for (let i = 0; i < 2; i++) {
      const zc = z0 + arm + seatLen * (i + 0.5)
      cushion(scene, { at: [(seatX0 + x1) / 2 + 0.005, base + 0.19 + 0.1, zc], size: [x1 - seatX0 - 0.01, 0.2, seatLen - 0.008], mat: fabric, kind: 'seat', puff: 0.11, tuft: 0.015, wrinkles: 0.3, segments: 22, seed: 31 + i })
      cushion(scene, { at: [seatX0 + 0.11, base + 0.39 + 0.23, zc], size: [0.21, 0.46, seatLen - 0.02], mat: fabric, kind: 'back', puff: 0.13, rotation: [0, 0, 0.09], wrinkles: 0.26, segments: 22, seed: 47 + i })
    }
    // Throw pillows leaning into each arm.
    pillows.forEach((mat, i) => {
      const z = i === 0 ? z0 + arm + 0.24 : z1 - arm - 0.24
      cushion(scene, { at: [seatX0 + 0.25, base + 0.52, z], size: [0.13, 0.42, 0.42], mat, kind: 'pillow', puff: 0.3, tuft: 0.04, rotation: [i === 0 ? -0.22 : 0.22, 0, 0.32], droop: 0.01, wrinkles: 0.85, segments: 26, seed: 61 + i })
    })
  }

  /** A long low table: a bevelled top on two end panels joined by a rail. */
  function lowTable({ x0, x1, z0, z1, top, topMat, frameMat }) {
    block(scene, [x0, top - 0.035, z0], [x1, top, z1], topMat, { round: 0.009, segments: 3, tile: 1 })
    for (const zc of [z0 + 0.09, z1 - 0.09]) {
      block(scene, [x0 + 0.05, 0, zc - 0.024], [x1 - 0.05, top - 0.035, zc + 0.024], frameMat, { round: 0.005, tile: 1 })
    }
    block(scene, [(x0 + x1) / 2 - 0.018, 0.06, z0 + 0.09], [(x0 + x1) / 2 + 0.018, 0.1, z1 - 0.09], frameMat, { round: 0.004, tile: 1 })
    block(scene, [x0 + 0.03, top - 0.075, z0 + 0.03], [x1 - 0.03, top - 0.035, z1 - 0.03], frameMat, { round: 0.004, tile: 1 })
  }

  /** A slim wall-hung TV facing -z on the wall at z: dark body, glass front. */
  function tv({ x0, x1, y0, y1, z, body, glassMat }) {
    block(scene, [x0, y0, z - 0.03], [x1, y1, z - 0.004], body, { round: 0.004, segments: 2 })
    block(scene, [x0 + 0.006, y0 + 0.01, z - 0.0315], [x1 - 0.006, y1 - 0.006, z - 0.029], glassMat, { cast: false })
    // A small status light under the bottom bezel.
    block(scene, [(x0 + x1) / 2 - 0.004, y0 + 0.003, z - 0.0316], [(x0 + x1) / 2 + 0.004, y0 + 0.006, z - 0.03], m.led, { cast: false })
  }

  /**
   * A floating media console fronting -z: top slab, sides, four doors with
   * shadow gaps, a finger-pull recess under the top, a soft LED wash beneath
   * and a slim soundbar on top.
   */
  function mediaConsole({ x0, x1, y0, y1, z0, z1, mat, recess, soundbar }) {
    const T = 0.025
    block(scene, [x0, y1 - T, z0], [x1, y1, z1], mat, { round: 0.004, tile: 0.6 })
    block(scene, [x0, y0, z0 + 0.012], [x1, y0 + 0.02, z1], mat, { round: 0.003, tile: 0.6 })
    for (const x of [x0, x1 - 0.02]) block(scene, [x, y0, z0 + 0.005], [x + 0.02, y1 - T, z1], mat, { round: 0.003, tile: 0.6 })
    block(scene, [x0 + 0.02, y0 + 0.02, z0 + 0.02], [x1 - 0.02, y1 - T, z1], recess, { cast: false })
    const doors = 4
    const w = (x1 - x0 - 0.04) / doors
    for (let i = 0; i < doors; i++) {
      const a = x0 + 0.02 + i * w
      block(scene, [a + 0.0015, y0 + 0.022, z0], [a + w - 0.0015, y1 - T - 0.03, z0 + 0.019], mat, { round: 0.003, tile: 0.6 })
    }
    block(scene, [x0 + 0.04, y0 - 0.004, z1 - 0.07], [x1 - 0.04, y0, z1 - 0.05], m.led, { cast: false })
    const sx0 = (x0 + x1) / 2 - 0.36
    block(scene, [sx0, y1, z0 + 0.12], [sx0 + 0.72, y1 + 0.058, z0 + 0.2], soundbar, { round: 0.012, segments: 3 })
  }

  /**
   * The headboard as a row of vertical upholstered channels, against the
   * wall at x = 0, centred on z, from y0 to y1.
   */
  function channelHeadboard({ z, width, y0, y1, depth, count, mat }) {
    const w = width / count
    for (let i = 0; i < count; i++) {
      const zc = z - width / 2 + w * (i + 0.5)
      cushion(scene, { at: [depth / 2 + 0.03, (y0 + y1) / 2, zc], size: [depth, y1 - y0, w - 0.004], mat, kind: 'back', puff: 0.06, wrinkles: 0.08, seam: false, segments: 18, seed: 90 + i })
    }
    block(scene, [0.02, y0 - 0.03, z - width / 2 - 0.02], [0.05, y0, z + width / 2 + 0.02], mat, { round: 0.005 })
  }

  /** A knitted throw folded across the foot of the bed. */
  function throwBlanket({ x0, x1, z0, z1, y, mat }) {
    cushion(scene, { at: [(x0 + x1) / 2, y + 0.016, (z0 + z1) / 2], size: [x1 - x0, 0.032, z1 - z0], mat, kind: 'pillow', puff: 0.5, tuft: 0.01, wrinkles: 0.95, seam: false, segments: 30, seed: 7 })
  }

  /**
   * A floating bedside drawer on the wall at x = 0, z0 → z1, with a pull, a
   * ceramic table lamp under a linen shade, and a book.
   */
  function nightstand({ z0, z1, y0, y1, depth, wood, pull, lamp }) {
    block(scene, [0.02, y0, z0], [depth, y1, z1], wood, { round: 0.006, tile: 1 })
    block(scene, [depth, y0 + 0.012, z0 + 0.01], [depth + 0.001, y1 - 0.03, z1 - 0.01], m.shadowGap, { cast: false })
    block(scene, [depth + 0.001, y0 + 0.016, z0 + 0.012], [depth + 0.018, y1 - 0.034, z1 - 0.012], wood, { round: 0.003, tile: 1 })
    const zc = (z0 + z1) / 2
    block(scene, [depth + 0.018, y1 - 0.06, zc - 0.05], [depth + 0.026, y1 - 0.05, zc + 0.05], pull, { round: 0.002 })
    const lx = depth * 0.5, lz = zc - 0.04
    lathe([lx, y1, lz], [[0, 0], [0.045, 0], [0.062, 0.03], [0.07, 0.08], [0.058, 0.13], [0.03, 0.16], [0.012, 0.17], [0, 0.17]], lamp.base)
    cylinder(scene, { at: [lx, y1 + 0.165, lz], r: 0.006, h: 0.06, mat: pull })
    cylinder(scene, { at: [lx, y1 + 0.2, lz], r: 0.115, r2: 0.098, h: 0.17, mat: lamp.shade, cast: false, open: true })
    cylinder(scene, { at: [lx, y1 + 0.205, lz], r: 0.022, h: 0.05, mat: lamp.bulb, cast: false })
    books([depth * 0.42, y1, z1 - 0.07], { count: 2, turn: 0.25, seed: 2 })
  }

  /**
   * Door furniture on a leaf whose face is at z (facing +z or -z): a lever
   * on a round rose at the lock edge, and hinge knuckles on the other edge.
   */
  function doorHardware({ face, lockX, hingeX, y = 1.0, metal, dir = 1 }) {
    const out = face + dir * 0.004
    limb(scene, [lockX, y, face], [lockX, y, out + dir * 0.008], 0.026, 0.026, metal, { seg: 24 })
    limb(scene, [lockX, y, out + dir * 0.008], [lockX, y, out + dir * 0.05], 0.008, 0.008, metal, { seg: 16 })
    const lever = [lockX + Math.sign(hingeX - lockX) * 0.125, y - 0.004, out + dir * 0.055]
    limb(scene, [lockX, y, out + dir * 0.05], lever, 0.0085, 0.0075, metal, { seg: 16 })
    limb(scene, [lockX, y - 0.07, face], [lockX, y - 0.07, out + dir * 0.006], 0.012, 0.012, metal, { seg: 16 }) // lock turn
    for (const hy of [0.22, 1.05, 1.88]) {
      cylinder(scene, { at: [hingeX, hy, face + dir * 0.002], r: 0.007, h: 0.1, mat: metal, seg: 12 })
    }
  }

  /** A light switch plate on a wall, facing `facing`. */
  function switchPlate({ at: [x, y, z], facing, plate, rocker }) {
    const [nx, nz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[facing]
    const w = 0.086, h = 0.086, t = 0.008
    const a = [x - (nz ? w / 2 : 0), y - h / 2, z - (nx ? w / 2 : 0)]
    const b = [x + (nz ? w / 2 : 0) + nx * t, y + h / 2, z + (nx ? w / 2 : 0) + nz * t]
    block(scene, [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], [Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])], plate, { round: 0.003, cast: false })
    const r0 = [x - (nz ? 0.02 : 0) + nx * t, y - 0.028, z - (nx ? 0.02 : 0) + nz * t]
    const r1 = [x + (nz ? 0.02 : 0) + nx * (t + 0.006), y + 0.028, z + (nx ? 0.02 : 0) + nz * (t + 0.006)]
    block(scene, [Math.min(r0[0], r1[0]), r0[1], Math.min(r0[2], r1[2])], [Math.max(r0[0], r1[0]), r1[1], Math.max(r0[2], r1[2])], rocker, { round: 0.002, cast: false })
  }

  /** The cut edge of a rug whose top is at height h: thin strips round it. */
  function rugEdge({ x0, z0, x1, z1, h, mat }) {
    const t = 0.008
    for (const [a, b] of [
      [[x0, 0, z0], [x1, h, z0 + t]], [[x0, 0, z1 - t], [x1, h, z1]],
      [[x0, 0, z0], [x0 + t, h, z1]], [[x1 - t, 0, z0], [x1, h, z1]],
    ]) block(scene, a, b, mat, { round: 0.003, cast: false, tile: 0.27 })
  }

  /**
   * A two-door wardrobe fronting -z at z0: carcass, a recessed plinth, doors
   * with shadow gaps and a pair of long bar handles on standoffs.
   */
  function wardrobe({ x0, x1, z0, z1, y1, mat, gap, handle }) {
    block(scene, [x0, 0.06, z0 + 0.02], [x1, y1, z1], mat, { round: 0.004, tile: 1 })
    block(scene, [x0 + 0.03, 0, z0 + 0.06], [x1 - 0.03, 0.06, z1], gap, { cast: false })
    const mid = (x0 + x1) / 2
    for (const [a, b] of [[x0, mid], [mid, x1]]) {
      block(scene, [a + 0.0015, 0.064, z0], [b - 0.0015, y1 - 0.003, z0 + 0.02], mat, { round: 0.003, tile: 1 })
    }
    for (const x of [mid - 0.045, mid + 0.045]) {
      limb(scene, [x, 0.78, z0 - 0.03], [x, 1.52, z0 - 0.03], 0.0065, 0.0065, handle, { seg: 12 })
      for (const y of [0.83, 1.47]) limb(scene, [x, y, z0], [x, y, z0 - 0.03], 0.0045, 0.0045, handle, { seg: 10 })
    }
  }

  /** Books standing in a row along +x from `at`, spines facing +z. */
  function bookRow(at, { count = 5, seed = 0 } = {}) {
    let x = at[0]
    for (let i = 0; i < count; i++) {
      const k = i + seed
      const w = 0.022 + (k % 3) * 0.006, h = 0.2 + ((k * 5) % 4) * 0.014, d = 0.15 - (k % 2) * 0.012
      const lean = i === count - 1 ? 0.12 : 0
      const cover = new THREE.Mesh(boxGeometry(w, h, d), bookMats[k % bookMats.length])
      const pages = new THREE.Mesh(boxGeometry(w - 0.005, h - 0.008, d - 0.008), pageMat)
      const group = new THREE.Group()
      group.add(cover, pages)
      pages.position.z = -0.005
      group.position.set(x + w / 2 + (lean ? h * 0.06 : 0), at[1] + h / 2, at[2])
      group.rotation.z = -lean
      group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      scene.add(group)
      x += w + 0.002
    }
  }

  return { lathe, vessel, books, bookRow, sofa, lowTable, tv, mediaConsole, channelHeadboard, throwBlanket, nightstand, doorHardware, switchPlate, rugEdge, wardrobe }
}
