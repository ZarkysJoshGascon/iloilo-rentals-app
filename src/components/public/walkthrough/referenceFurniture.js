// Furniture details reconstructed from the two Saint Honore Unit 9S boards
// and tour-source/Saint Honore Unit 9S balcony view.jpg. Dimensions are metres.

function canvas(size) {
  const image = document.createElement('canvas')
  image.width = image.height = size
  return [image, image.getContext('2d')]
}

// The photographed stand has painted rose plates, rather than cakes or dots.
// One planar texture keeps the flowers legible on all three shallow dishes.
function rosePlate() {
  const [image, ctx] = canvas(1024)
  ctx.fillStyle = '#efeee0'
  ctx.fillRect(0, 0, 1024, 1024)
  const circle = (radius, color, width) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.arc(512, 512, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
  circle(493, '#86b2a5', 16)
  circle(477, '#dce6cc', 8)
  circle(467, '#bbc9a5', 3)
  circle(443, '#9ea895', 2)
  const leaf = (x, y, angle, length) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = '#93a388'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(length * 0.24, -length * 0.5, length * 0.77, -length * 0.3, length, 0)
    ctx.bezierCurveTo(length * 0.65, length * 0.28, length * 0.2, length * 0.27, 0, 0)
    ctx.fill()
    ctx.strokeStyle = '#677e68'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(length * 0.45, -2, length * 0.9, 0)
    ctx.stroke()
    ctx.restore()
  }
  const rose = (x, y, radius, angle) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    for (let ring = 2; ring >= 0; ring--) {
      const petals = ring === 2 ? 8 : ring === 1 ? 6 : 4
      const r = radius * (0.42 + ring * 0.28)
      for (let i = 0; i < petals; i++) {
        ctx.save()
        ctx.rotate(i * Math.PI * 2 / petals + ring * 0.35)
        ctx.fillStyle = ['#c77791', '#d597aa', '#e9bdc7'][ring]
        ctx.strokeStyle = ['#ae657e', '#be8294', '#d6a1b3'][ring]
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-r * 0.45, -r * 0.05)
        ctx.bezierCurveTo(-r * 0.86, -r * 0.75, r * 0.78, -r * 1.25, r * 0.53, -r * 0.09)
        ctx.quadraticCurveTo(0, r * 0.25, -r * 0.45, -r * 0.05)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }
    ctx.strokeStyle = '#ae647d'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.15, 0.2, Math.PI * 1.65)
    ctx.stroke()
    ctx.restore()
  }
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7 + 0.24
    const x = 512 + Math.cos(angle) * 332, y = 512 + Math.sin(angle) * 332
    leaf(x - 34, y + 31, angle + 2.1, 79)
    leaf(x + 30, y + 12, angle - 0.4, 66)
    leaf(x + 7, y - 26, angle + 3.9, 57)
    rose(x, y, 48 + (i % 2) * 10, angle)
    rose(x + Math.cos(angle + 1.2) * 69, y + Math.sin(angle + 1.2) * 69, 23, -angle)
  }
  leaf(409, 508, 1.2, 90)
  leaf(545, 578, -0.65, 81)
  rose(476, 508, 60, -0.3)
  rose(563, 553, 43, 0.75)
  rose(549, 447, 29, 1.3)
  return image
}

// Seamless, shallow hammer marks reproduce the balcony table's stippled glass.
function hammeredGlass() {
  const size = 512
  const [color, colorCtx] = canvas(size)
  const [normal, normalCtx] = canvas(size)
  const [roughness, roughCtx] = canvas(size)
  const colors = colorCtx.createImageData(size, size), normals = normalCtx.createImageData(size, size), rough = roughCtx.createImageData(size, size)
  const tau = Math.PI * 2
  const height = (x, y) => Math.sin(x * tau * 13 + Math.sin(y * tau * 7) * 1.4) * Math.cos(y * tau * 16 + Math.sin(x * tau * 5) * 1.6) * 0.6
    + Math.sin((x + y) * tau * 31) * 0.18
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v)))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, h = height(u, v), step = 1 / size
      const dx = height(u + step, v) - height(u - step, v), dy = height(u, v + step) - height(u, v - step)
      const nz = 1 / Math.sqrt(dx * dx * 9 + dy * dy * 9 + 1)
      const p = (y * size + x) * 4
      colors.data[p] = byte(210 + h * 13)
      colors.data[p + 1] = byte(221 + h * 13)
      colors.data[p + 2] = byte(218 + h * 13)
      normals.data[p] = byte((-dx * 3 * nz * 0.5 + 0.5) * 255)
      normals.data[p + 1] = byte((-dy * 3 * nz * 0.5 + 0.5) * 255)
      normals.data[p + 2] = byte((nz * 0.5 + 0.5) * 255)
      const r = byte((0.27 + h * 0.045) * 255)
      rough.data[p] = rough.data[p + 1] = rough.data[p + 2] = r
      colors.data[p + 3] = normals.data[p + 3] = rough.data[p + 3] = 255
    }
  }
  colorCtx.putImageData(colors, 0, 0)
  normalCtx.putImageData(normals, 0, 0)
  roughCtx.putImageData(rough, 0, 0)
  return { color, normal, roughness }
}

/**
 * Supply the scene's existing whiteFrame, blackFrame, chrome, steel,
 * ceramicDark, tex and mirror array when available. All generated resources
 * are tracked by kit. Call kit.batch(scene) after building the furniture.
 */
export function createReferenceFurniture(THREE, kit, options = {}) {
  const { tex = {}, mirror = [] } = options
  const geometryCache = new Map(), clothCache = new Map()
  const frame = options.whiteFrame || kit.material({ color: 0xe7e5df, roughness: 0.43 })
  const metal = options.blackFrame || kit.material({ color: 0x222528, metalness: 0.28, roughness: 0.42 })
  const chrome = options.chrome || kit.material({ color: 0xd6dadd, metalness: 1, roughness: 0.22 })
  const steel = options.steel || kit.material({ color: 0xa9afb0, metalness: 0.9, roughness: 0.36 })
  const rubber = kit.material({ color: 0x25282a, roughness: 0.96 })
  const coffee = kit.material({ color: 0x211a15, roughness: 0.16 })
  const reflected = (material, amount) => {
    material.userData.mirror = amount
    mirror.push(material)
    return material
  }
  const geometry = (key, build) => {
    if (!geometryCache.has(key)) {
      const g = build()
      g.computeBoundingBox()
      g.computeBoundingSphere()
      kit.track.geometries.push(g)
      geometryCache.set(key, g)
    }
    return geometryCache.get(key)
  }
  const mesh = (group, g, mat, { at = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], cast = true, name = '' } = {}) => {
    const m = new THREE.Mesh(g, mat)
    m.position.fromArray(at)
    m.rotation.set(...rotation)
    m.scale.fromArray(scale)
    m.name = name
    return kit.add(group, m, { cast, receive: true })
  }
  const tube = (group, key, points, radius, mat, segments = 24) => {
    const g = geometry(key, () => {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal')
      const shape = new THREE.TubeGeometry(curve, segments, radius, 8, false)
      const uv = shape.attributes.uv, length = curve.getLength()
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * length / 0.18, uv.getY(i) * Math.PI * 2 * radius / 0.18)
      return shape
    })
    return mesh(group, g, mat, { name: key })
  }
  const cylinder = (group, key, radius, height, mat, at, axis = 'y', cast = true) => {
    const g = geometry(key, () => new THREE.CylinderGeometry(radius, radius, height, 24))
    return mesh(group, g, mat, { at, rotation: axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0], cast, name: key })
  }
  const planarUV = (g, tile) => {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
      if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile)
      else if (ax >= az) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile)
      else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile)
    }
    return g
  }
  const fabric = (color, weave = 'velvet') => {
    const key = `${color}:${weave}`
    if (!clothCache.has(key)) {
      const pair = kit.fabric({ base: color, weave, threads: weave === 'mesh' ? 90 : 112, contrast: weave === 'mesh' ? 0.9 : 1.15, roughness: weave === 'mesh' ? 0.77 : 0.92, size: 1024 })
      const normalMap = pair.normal ? kit.tex(pair.normal, { color: false }) : weave === 'mesh' ? tex.linenN : tex.velvetN
      clothCache.set(key, kit.material({
        map: kit.tex(pair.color), roughnessMap: kit.tex(pair.roughness, { color: false }), roughness: 1,
        ...(normalMap ? { normalMap, normalScale: new THREE.Vector2(weave === 'mesh' ? 0.8 : 0.45, weave === 'mesh' ? 0.8 : 0.45) } : {}),
        sheen: weave === 'mesh' ? 0.12 : 0.5, sheenColor: new THREE.Color(color), sheenRoughness: 0.76,
        side: weave === 'mesh' ? THREE.DoubleSide : THREE.FrontSide,
      }, THREE.MeshPhysicalMaterial))
    }
    return clothCache.get(key)
  }
  const roundedPath = (w, d, r) => {
    const s = new THREE.Shape()
    s.moveTo(-w / 2 + r, -d / 2)
    s.lineTo(w / 2 - r, -d / 2)
    s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r)
    s.lineTo(w / 2, d / 2 - r)
    s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2)
    s.lineTo(-w / 2 + r, d / 2)
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r)
    s.lineTo(-w / 2, -d / 2 + r)
    s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2)
    return s
  }

  function diningChair(scene, { at, facing = [0, 1], color = 0x92969a } = {}) {
    const group = new THREE.Group()
    group.name = 'Reference dining chair'
    group.position.fromArray(at)
    group.rotation.y = Math.atan2(facing[0], facing[1])
    scene.add(group)
    const cloth = fabric(color), tile = 0.18
    // Rear tubes are continuous from floor to bolster, crossing the seat
    // cradle. There is no detached post beginning above the upholstery.
    for (const side of [-1, 1]) {
      tube(group, `dining-rear:${side}`, [[side * 0.183, 0.012, -0.207], [side * 0.176, 0.41, -0.185], [side * 0.176, 0.63, -0.197], [side * 0.185, 0.806, -0.206]], 0.0095, frame, 28)
      tube(group, `dining-front:${side}`, [[side * 0.183, 0.012, 0.175], [side * 0.176, 0.419, 0.171]], 0.0095, frame, 8)
      cylinder(group, 'dining-foot', 0.011, 0.014, rubber, [side * 0.183, 0.008, -0.207])
      cylinder(group, 'dining-foot', 0.011, 0.014, rubber, [side * 0.183, 0.008, 0.175])
    }
    const cradle = roundedPath(0.368, 0.364, 0.027).getSpacedPoints(48).map((p) => [p.x, 0.419, p.y])
    tube(group, 'dining-seat-cradle', cradle, 0.009, frame, 56)
    tube(group, 'dining-seat-front-rail', [[-0.176, 0.419, 0.171], [0.176, 0.419, 0.171]], 0.009, frame, 8)
    const seat = geometry('dining-sculpted-seat', () => {
      const points = roundedPath(0.416, 0.398, 0.052).getSpacedPoints(64).slice(0, -1)
      const profiles = [[0.87, -0.024], [0.975, -0.024], [1, -0.009], [1, 0.007], [0.965, 0.019], [0.76, 0.027], [0.32, 0.027], [0.025, 0.023]]
      const positions = [], indices = [], count = points.length
      for (const [scale, y] of profiles) for (const p of points) positions.push(p.x * scale, y, p.y * scale)
      for (let j = 0; j < profiles.length - 1; j++) {
        for (let i = 0; i < count; i++) {
          const a = j * count + i, b = j * count + (i + 1) % count, c = a + count, d = b + count
          indices.push(a, c, b, b, c, d)
        }
      }
      const bottom = positions.length / 3; positions.push(0, -0.024, 0)
      const top = positions.length / 3; positions.push(0, 0.023, 0)
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count
        indices.push(bottom, i, next, top, (profiles.length - 1) * count + next, (profiles.length - 1) * count + i)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2))
      g.setIndex(indices)
      g.computeVertexNormals()
      return planarUV(g, tile)
    })
    mesh(group, seat, cloth, { at: [0, 0.45, 0], name: 'Textured padded dining seat' })
    const piping = roundedPath(0.41, 0.392, 0.05).getSpacedPoints(64).map((p) => [p.x, 0.456, p.y])
    tube(group, 'dining-seat-sewn-edge', piping, 0.0015, cloth, 72)
    const bolster = geometry('dining-velvet-bolster', () => {
      const profile = [[0.044, -0.212], [0.048, -0.198], [0.05, -0.12], [0.05, 0.12], [0.048, 0.198], [0.044, 0.212]].map(([r, y]) => new THREE.Vector2(r, y))
      const g = new THREE.LatheGeometry(profile, 40)
      const uv = g.attributes.uv, p = g.attributes.position
      for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 0.1 / tile, (p.getY(i) + 0.212) / tile)
      g.rotateZ(-Math.PI / 2)
      return g
    })
    mesh(group, bolster, cloth, { at: [0, 0.806, -0.206], name: 'Textured velvet bolster' })
    const cap = geometry('dining-bolster-end', () => {
      const g = new THREE.CircleGeometry(0.044, 32)
      const p = g.attributes.position, uv = g.attributes.uv
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile)
      return g
    })
    const endSeam = geometry('dining-bolster-end-seam', () => new THREE.TorusGeometry(0.0434, 0.0014, 6, 32))
    for (const side of [-1, 1]) {
      mesh(group, cap, cloth, { at: [side * 0.212, 0.806, -0.206], rotation: [0, side * Math.PI / 2, 0], name: 'Bolster stitched end cap' })
      mesh(group, endSeam, cloth, { at: [side * 0.212, 0.806, -0.206], rotation: [0, Math.PI / 2, 0], name: 'Bolster end piping' })
      cylinder(group, 'dining-back-fastener', 0.006, 0.004, chrome, [side * 0.186, 0.757, -0.206], 'z', false)
    }
    group.userData.reference = { seatCradleY: 0.419, seatBottomY: 0.426, rearTubeRadius: 0.0095, rearPosts: [[-0.176, 0.45, -0.187], [0.176, 0.45, -0.187]], bolsterSupports: [[-0.185, 0.806, -0.206], [0.185, 0.806, -0.206]], clothTile: tile }
    return group
  }

  let glass, plateMaterial, cupMaterial, clearGlass
  function outdoorMaterials() {
    if (glass) return
    const hammered = hammeredGlass()
    glass = reflected(kit.material({ map: kit.tex(hammered.color), roughnessMap: kit.tex(hammered.roughness, { color: false }), roughness: 1,
      normalMap: kit.tex(hammered.normal, { color: false }), normalScale: new THREE.Vector2(0.8, 0.8), metalness: 0.03,
      clearcoat: 0.35, clearcoatRoughness: 0.24, transparent: true, opacity: 0.66, depthWrite: false,
    }, THREE.MeshPhysicalMaterial), 0.55)
    plateMaterial = kit.material({ map: kit.tex(rosePlate()), roughness: 0.26, clearcoat: 0.3, clearcoatRoughness: 0.3 }, THREE.MeshPhysicalMaterial)
    cupMaterial = reflected(kit.material({ color: 0x151719, roughness: 0.24, clearcoat: 0.38, clearcoatRoughness: 0.2 }, THREE.MeshPhysicalMaterial), 0.55)
    clearGlass = reflected(kit.material({ color: 0xd3ddd8, roughness: 0.12, transparent: true, opacity: 0.36, depthWrite: false }, THREE.MeshPhysicalMaterial), 0.65)
  }

  function balconyChair(scene, { at, facing = [1, 0] } = {}) {
    const group = new THREE.Group()
    group.name = 'Reference folding sling chair'
    group.position.fromArray(at)
    group.rotation.y = Math.atan2(facing[0], facing[1])
    scene.add(group)
    const sling = fabric(0xa8b1b1, 'mesh'), tile = 0.16
    for (const side of [-1, 1]) {
      tube(group, `balcony-chair-front-stay:${side}`, [[side * 0.22, 0.016, 0.215], [side * 0.22, 0.423, 0.003], [side * 0.22, 0.53, -0.195], [side * 0.22, 0.55, -0.1975], [side * 0.22, 0.89, -0.24], [side * 0.22, 0.92, -0.244]], 0.011, metal, 40)
      tube(group, `balcony-chair-rear-stay:${side}`, [[side * 0.22, 0.016, -0.213], [side * 0.22, 0.423, 0.003], [side * 0.22, 0.439, 0.215]], 0.011, metal, 20)
      cylinder(group, 'balcony-chair-pivot', 0.018, 0.013, metal, [side * 0.226, 0.423, 0.003], 'x')
      cylinder(group, 'balcony-chair-pivot-screw', 0.006, 0.004, steel, [side * 0.235, 0.423, 0.003], 'x', false)
      for (const z of [-0.213, 0.215]) cylinder(group, 'balcony-chair-rubber-foot', 0.014, 0.023, rubber, [side * 0.22, 0.0115, z])
      tube(group, `balcony-chair-seat-side:${side}`, [[side * 0.22, 0.426, -0.198], [side * 0.22, 0.432, 0.215]], 0.009, metal, 8)
    }
    for (const [y, z, label] of [[0.92, -0.244, 'back-top'], [0.53, -0.195, 'back-lower'], [0.433, 0.215, 'seat-front'], [0.426, -0.198, 'seat-rear']]) {
      tube(group, `balcony-chair:${label}`, [[-0.22, y, z], [0.22, y, z]], 0.009, metal, 12)
    }
    const slingSurface = (back) => geometry(`balcony-sling:${back}`, () => {
      const g = new THREE.PlaneGeometry(0.424, back ? 0.4 : 0.398, 24, 28), p = g.attributes.position, uv = g.attributes.uv
      for (let i = 0; i < p.count; i++) {
        const u = uv.getX(i), v = uv.getY(i), sag = Math.sin(u * Math.PI) * Math.sin(v * Math.PI)
        if (back) p.setXYZ(i, (u - 0.5) * 0.424, 0.532 + v * 0.386, -0.195 - v * 0.048 - sag * 0.008)
        else p.setXYZ(i, (u - 0.5) * 0.424, 0.432 - v * 0.006 - sag * 0.016, (0.5 - v) * 0.398 + 0.008)
        uv.setXY(i, u * 0.424 / tile, v * (back ? 0.389 : 0.398) / tile)
      }
      g.computeVertexNormals()
      return g
    })
    mesh(group, slingSurface(false), sling, { name: 'Woven sagging sling seat' })
    mesh(group, slingSurface(true), sling, { name: 'Woven sling back' })
    group.userData.reference = { clothTile: tile, hinge: [0, 0.423, 0.003], folding: true }
    return group
  }

  function floralPlate(group, radius, y) {
    const g = geometry(`rose-dish:${radius}`, () => {
      const profile = [[0, -0.006], [radius * 0.18, -0.006], [radius * 0.8, -0.003], [radius * 0.96, 0.001], [radius, 0.008], [radius * 0.985, 0.015], [radius * 0.935, 0.013], [radius * 0.86, 0.004], [radius * 0.4, 0.003], [0, 0.003]]
      const dish = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(...p)), 64), p = dish.attributes.position, uv = dish.attributes.uv
      for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (radius * 2), 0.5 + p.getZ(i) / (radius * 2))
      return dish
    })
    return mesh(group, g, plateMaterial, { at: [-0.055, y, 0.015], name: 'Painted rose porcelain tier' })
  }

  function mug(group, x, z) {
    const profile = [[0, 0], [0.03, 0], [0.039, 0.007], [0.044, 0.045], [0.045, 0.062], [0.04, 0.062], [0.036, 0.014], [0, 0.014]]
    const g = geometry('balcony-teacup-body', () => new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(...p)), 32))
    const cup = new THREE.Group()
    cup.position.set(x, 0.744, z)
    group.add(cup)
    mesh(cup, g, cupMaterial, { name: 'Glazed open teacup' })
    tube(cup, 'balcony-teacup-handle', [[0.041, 0.05, 0], [0.065, 0.047, 0], [0.064, 0.019, 0], [0.039, 0.019, 0]], 0.0045, cupMaterial, 20)
    const liquid = geometry('balcony-coffee', () => new THREE.CircleGeometry(0.037, 32))
    mesh(cup, liquid, coffee, { at: [0, 0.04, 0], rotation: [-Math.PI / 2, 0, 0], cast: false })
  }

  function balconyTable(scene, { at } = {}) {
    outdoorMaterials()
    const group = new THREE.Group()
    group.name = 'Reference glass bistro table and floral stand'
    group.position.fromArray(at)
    scene.add(group)
    const rim = geometry('balcony-table-hollow-rim', () => new THREE.TorusGeometry(0.317, 0.013, 8, 80))
    mesh(group, rim, metal, { at: [0, 0.736, 0], rotation: [Math.PI / 2, 0, 0], name: 'Hollow powder-coated table rim' })
    const tableGlass = geometry('balcony-table-hammered-glass', () => planarUV(new THREE.CylinderGeometry(0.309, 0.309, 0.006, 80), 0.085))
    mesh(group, tableGlass, glass, { at: [0, 0.741, 0], cast: false, name: 'Stippled translucent glass top' })
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        tube(group, `balcony-table-leg:${sx}:${sz}`, [[sx * 0.224, 0.02, sz * 0.224], [sx * 0.163, 0.36, sz * 0.164], [sx * 0.188, 0.726, sz * 0.19]], 0.014, metal, 20)
        cylinder(group, 'balcony-table-rubber-foot', 0.018, 0.023, rubber, [sx * 0.224, 0.012, sz * 0.224])
        cylinder(group, 'balcony-table-glass-pad', 0.017, 0.012, rubber, [sx * 0.188, 0.732, sz * 0.19])
        tube(group, `balcony-table-rim-bracket:${sx}:${sz}`, [[sx * 0.188, 0.724, sz * 0.19], [sx * 0.22, 0.724, sz * 0.227]], 0.007, metal, 8)
      }
      tube(group, `balcony-table-cross-stay:${sx}`, [[sx * 0.188, 0.708, -0.19], [-sx * 0.188, 0.708, 0.19]], 0.009, metal, 12)
    }
    tube(group, 'balcony-table-lower-crossbar', [[-0.16, 0.36, -0.16], [0.16, 0.36, 0.16]], 0.008, metal, 12)
    tube(group, 'balcony-table-lower-crossbar-2', [[-0.16, 0.36, 0.16], [0.16, 0.36, -0.16]], 0.008, metal, 12)
    cylinder(group, 'balcony-table-joint-bolt', 0.008, 0.012, steel, [0, 0.361, 0], 'y', false)
    for (const [y, radius] of [[0.758, 0.17], [0.943, 0.13], [1.113, 0.09]]) {
      floralPlate(group, radius, y)
      cylinder(group, 'rose-stand-washer', 0.011, 0.005, chrome, [-0.055, y - 0.005, 0.015])
    }
    cylinder(group, 'rose-stand-base', 0.025, 0.008, chrome, [-0.055, 0.748, 0.015])
    cylinder(group, 'rose-stand-stem', 0.0045, 0.438, chrome, [-0.055, 0.965, 0.015])
    const ring = geometry('rose-stand-handle', () => new THREE.TorusGeometry(0.035, 0.0035, 8, 36))
    mesh(group, ring, chrome, { at: [-0.055, 1.217, 0.015], name: 'Cake stand ring handle' })
    mug(group, 0.08, -0.175)
    mug(group, 0.23, -0.045)
    const press = new THREE.Group()
    press.position.set(0.17, 0.747, 0.11)
    group.add(press)
    cylinder(press, 'press-glass-body', 0.047, 0.13, clearGlass, [0, 0.075, 0], 'y', false)
    cylinder(press, 'press-bottom-band', 0.05, 0.018, steel, [0, 0.009, 0])
    cylinder(press, 'press-top-band', 0.05, 0.008, steel, [0, 0.136, 0])
    cylinder(press, 'press-lid', 0.051, 0.014, metal, [0, 0.147, 0])
    cylinder(press, 'press-plunger', 0.003, 0.132, chrome, [0, 0.09, 0], 'y', false)
    cylinder(press, 'press-plunger-knob', 0.011, 0.012, metal, [0, 0.164, 0])
    tube(press, 'press-connected-handle', [[0.047, 0.13, 0], [0.079, 0.128, 0], [0.09, 0.09, 0], [0.08, 0.033, 0], [0.046, 0.03, 0]], 0.008, metal, 28)
    const saucer = geometry('press-saucer', () => new THREE.CylinderGeometry(0.071, 0.071, 0.005, 40))
    mesh(group, saucer, clearGlass, { at: [0.17, 0.7445, 0.11], cast: false })
    group.userData.reference = { tableRadius: 0.33, glassRadius: 0.309, glassTile: 0.085, tiers: 3, paintedRoses: true }
    return group
  }

  function balconySet(scene, { tableAt = [1.83, 0, 9.72], chairAt = [1.3, 0, 9.56], chairFacing = [1, 0] } = {}) {
    return { table: balconyTable(scene, { at: tableAt }), chair: balconyChair(scene, { at: chairAt, facing: chairFacing }) }
  }

  return { diningChair, balconyChair, balconyTable, balconySet }
}
