// src/components/public/walkthrough/kit.js
// Building blocks for the 3D unit walkthroughs: helpers to add boxes, panels,
// tubes, plants and loaded models to a scene in metres; photo textures laid on
// at their real-world size; and a few surfaces drawn on a canvas (shoji paper,
// slats, city windows, brushed steel, a cooktop). three.js is passed
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

export function createKit(THREE, renderer, { RoundedBoxGeometry } = {}) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  const textures = []
  const geometries = []
  const materials = []

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
   * Lay photo textures on at real-world size: one tile is `tile` metres.
   * Each vertex takes its UV from the two world axes across its face, so
   * neighbouring blocks line up and nothing stretches. `turn` swaps the axes
   * (e.g. floorboards running the other way).
   */
  function worldUV(g, offset, tile, turn = false) {
    const p = g.attributes.position
    const n = g.attributes.normal
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + offset.x
      const y = p.getY(i) + offset.y
      const z = p.getZ(i) + offset.z
      const ax = Math.abs(n.getX(i))
      const ay = Math.abs(n.getY(i))
      const az = Math.abs(n.getZ(i))
      let u, v
      if (ax >= ay && ax >= az) { u = z; v = y } else if (ay >= az) { u = x; v = z } else { u = x; v = y }
      if (turn) [u, v] = [v, u]
      uv[i * 2] = u / tile
      uv[i * 2 + 1] = v / tile
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
    const g = round ? new RoundedBoxGeometry(w, h, d, 3, round) : new THREE.BoxGeometry(w, h, d)
    geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    if (opts.tile) worldUV(g, m.position, opts.tile, opts.turn)
    return add(scene, m, opts)
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
  function cylinder(scene, { at: [x, y, z], r, h, mat, r2 = r, seg = 24, cast = true, open = false }) {
    const g = new THREE.CylinderGeometry(r2, r, h, seg, 1, open)
    geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y + h / 2, z)
    return add(scene, m, { cast })
  }
  function sphere(scene, { at: [x, y, z], r, mat, scale = [1, 1, 1], cast = true, detail = 16 }) {
    const g = new THREE.SphereGeometry(r, detail, Math.max(8, detail * 0.75))
    geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y, z)
    m.scale.set(...scale)
    return add(scene, m, { cast })
  }
  /** A round tube along a smooth path through `points` (a faucet, a cord). */
  function tube(scene, { points, r, mat, seg = 48, cast = true }) {
    const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    const g = new THREE.TubeGeometry(path, seg, r, 10, false)
    geometries.push(g)
    return add(scene, new THREE.Mesh(g, mat), { cast })
  }
  /** A tapered round limb from a to b (a trunk or branch): radius r0 → r1. */
  function limb(scene, a, b, r0, r1, mat) {
    const from = new THREE.Vector3(...a)
    const dir = new THREE.Vector3(...b).sub(from)
    const g = new THREE.CylinderGeometry(r1, r0, dir.length(), 8)
    geometries.push(g)
    const m = new THREE.Mesh(g, mat)
    m.position.copy(from).addScaledVector(dir, 0.5)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
    add(scene, m)
    sphere(scene, { at: b, r: r1, mat, detail: 8 }) // a smooth joint
    return m
  }

  // ── Plants ────────────────────────────────────────────────
  // One leaf, 1 m long down +y: pointed at both ends, folded along the
  // midrib and curling back toward the tip. Scaled per instance.
  let leafGeo = null
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
    geometries.push(leafGeo)
    return leafGeo
  }

  /**
   * Leaves scattered over the outside of one or more clusters (ellipsoids,
   * each { at, r: [rx, ry, rz], count }), each leaf facing outward with a
   * little twist, in shades between `colors`.
   */
  function foliage(scene, { clusters, size = 0.06, colors = [0x24391f, 0x4f6b35], seed = 1, mat }) {
    const rand = seeded(seed)
    const total = clusters.reduce((n, c) => n + c.count, 0)
    const leafMat = mat || material({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide })
    const mesh = new THREE.InstancedMesh(leafGeometry(), leafMat, total)
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
        mesh.setMatrixAt(i, dummy.matrix)
        // Lighter on top, darker underneath and inside.
        color.copy(dark).lerp(light, Math.min(1, Math.max(0, 0.35 + out.y * 0.4 + (rand() - 0.5) * 0.5)))
        mesh.setColorAt(i, color)
        i++
      }
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }

  /**
   * A copy of a loaded model's named parts, scaled to `height` metres and
   * standing at `at` (its own origin on that spot), turned `turn` radians.
   */
  function model(scene, source, { nodes, at: [x, y, z], height, turn = 0 }) {
    const group = new THREE.Group()
    for (const name of nodes) {
      const part = source.getObjectByName(name)
      if (!part) continue
      const copy = part.clone()
      copy.position.set(0, 0, 0)
      group.add(copy)
    }
    const box = new THREE.Box3().setFromObject(group)
    const s = height / Math.max(1e-6, box.max.y - box.min.y)
    group.scale.setScalar(s)
    group.rotation.y = turn
    group.position.set(x, y - box.min.y * s, z)
    group.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      geometries.push(o.geometry)
      materials.push(o.material)
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (o.material[key]) textures.push(o.material[key])
      }
    })
    scene.add(group)
    return group
  }

  function dispose() {
    new Set(textures).forEach((t) => t.dispose())
    new Set(geometries).forEach((g) => g.dispose())
    new Set(materials).forEach((m) => m.dispose())
  }

  return {
    // surfaces
    shoji, slats, windows, brushed, hob, tex,
    // materials
    material, surface, glow,
    // shapes
    block, panel, flat, cylinder, sphere, tube, limb, foliage, model, add,
    track: { textures, geometries, materials },
    dispose,
  }
}
