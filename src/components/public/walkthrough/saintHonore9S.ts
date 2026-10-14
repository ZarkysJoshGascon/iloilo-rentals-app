// src/components/public/walkthrough/saintHonore9S.ts
// Saint Honore Unit 9S (1-bedroom, 36 sqm + 2 sqm balcony), modelled from
// its floor plan: 4.0 m wide, 9.0 m deep, rooms at 2.825 / 2.95 / 3.225 m,
// a 1.0 m balcony. Finishes, furniture and lighting follow the architect's
// renders in tour-source/Saint Honore unit 9S1.png and Unit9S2.png. Units
// are metres: x across from the left wall, y up, z toward the balcony.
// Timber/normal maps are CC0 from Poly Haven; the
// reconstructed blossom artwork and finish colours follow the Unit 9S boards.

import { createReferenceLighting } from './referenceLighting'
import { createReferenceFurniture } from './referenceFurniture'
import { createDetails } from './details'

const H = 2.7   // ceiling height
const T = 0.15  // outer wall thickness
const DOOR = 2.1
const DIR = '/tours/saint-honore-9s'

// Where the camera walks (eye level) and what it looks at. A caption marks
// the start of each part of the walk.
const path = [
  { pos: [3.34, 1.6, -1.6], look: [3.0, 1.35, 3.5], caption: { title: 'The entrance', note: 'Stepping in from the corridor' } },
  { pos: [3.36, 1.6, 0.35], look: [2.6, 1.3, 3.5] },
  { pos: [3.35, 1.55, 1.0], look: [1.5, 1.22, 1.08], caption: { title: 'Kitchen', note: 'Full-height cabinets with light beneath' } },
  // Past the fridge and the kitchen wall before turning into the room.
  { pos: [3.35, 1.6, 3.15], look: [2.6, 1.3, 5.5] },
  { pos: [2.22, 1.6, 3.48], look: [0.05, 1.35, 4.25], caption: { title: 'Living room', note: 'A cherry-blossom feature wall behind a low lounge' } },
  { pos: [2.15, 1.58, 4.05], look: [0.05, 1.3, 4.3] },
  // In the middle of the room, turning one way all round: back toward the
  // lattice wall, across to the dining wall, then to the TV.
  { pos: [2.15, 1.5, 4.95], look: [1.9, 1.3, 2.93], caption: { title: 'Feature wall', note: 'A timber lattice beside the blossom panel' } },
  { pos: [2.18, 1.45, 4.2], look: [4.0, 1.25, 4.2], caption: { title: 'Dining', note: 'An oak table under a cluster of globe lights' } },
  { pos: [2.22, 1.58, 4.92], look: [1.15, 1.2, 5.78], caption: { title: 'Media wall', note: 'The TV wall, framed in the same artwork' } },
  { pos: [2.95, 1.6, 5.45], look: [3.0, 1.4, 7.6], caption: { title: 'Into the bedroom', note: 'Through the black-framed doorway' } },
  { pos: [3.1, 1.6, 6.3], look: [0.05, 1.15, 7.2], caption: { title: 'Bedroom', note: 'Soft light layered around the headboard wall' } },
  { pos: [2.95, 1.58, 7.2], look: [0.05, 1.1, 7.25] },
  { pos: [3.02, 1.6, 7.98], look: [0.05, 1.15, 7.4] },
  { pos: [2.53, 1.6, 8.01], look: [2.35, 1.3, 13] },
]

const data = (name) => ({ src: `${DIR}/tex/${name}.jpg`, data: true })

export const SAINT_HONORE_9S = {
  key: 'saint-honore-9s',
  eyebrow: 'Interior design · Condominium',
  title: 'Saint Honore Unit 9S',
  facts: '1-bedroom unit · 36 sqm + 2 sqm balcony',
  // The floor plan image and where the unit's inside corners sit on it
  // (fractions of the image), for the "you are here" marker.
  plan: { src: `${DIR}/plan.png`, x0: 0.3152, x1: 0.6576, y0: 0.222, y1: 0.9002, width: 4, depth: 9 },
  textures: {
    blossom: `${DIR}/tex/blossom-9s.jpg`,
    blossomWide: `${DIR}/tex/blossom-9s-wide.jpg`,
    floor: `${DIR}/tex/floor.jpg`,
    floorN: data('floor-n'),
    floorR: data('floor-r'),
    stuccoN: data('stucco-n'),
    plasterN: data('plaster-n'),
    linenN: data('linen-n'),
    jerseyN: data('jersey-n'),
    knitN: data('knit-n'),
    woolN: data('wool-n'),
    walnut: `${DIR}/tex/walnut.jpg`,
    walnutR: data('walnut-r'),
    teak: `${DIR}/tex/teak.jpg`,
    oak: `${DIR}/tex/oak.jpg`,
    oakR: data('oak-r'),
    velvetN: data('velvet-n'),
  },
  // Where the room's own reflections are captured from: mid living room.
  envAt: [2.2, 1.5, 4.3],
  path,
  build,
}

function build(THREE, kit, scene, { tex }) {
  const { block, panel, flat, cylinder, sphere, tube, limb, boxes, drape, foliage, cushion, material, glow } = kit
  // Shiny materials reflect a capture of the room itself (UnitWalkthrough
  // makes it once the room is built); `amount` scales the reflection.
  const mirror = []
  const lighting = createReferenceLighting(THREE, kit, mirror)
  const wallBake = (mesh, start, end, axis = 2, top = 2.6, strength = 1.5, scallops = []) => lighting.bake(mesh, {
    axes: [axis, 1], bounds: [start, 0, end, H], size: [512, 768],
    light: (across, height) => lighting.wallLight(across, height, { start, end, top, strength, scallops }),
    occlusion: (across, height) => 1 - 0.18 * Math.exp(-height / 0.06),
  })
  const groundBake = (mesh, x0, z0, x1, z1) => lighting.bake(mesh, {
    axes: [0, 2], bounds: [x0, z0, x1, z1], size: [512, 512],
    light: () => [0.2, 0.175, 0.135], occlusion: lighting.floorOcclusion,
  })
  const shiny = (m, amount = 1) => {
    m.userData.mirror = amount
    mirror.push(m)
    return m
  }
  const bump = (t, s) => ({ normalMap: t, normalScale: new THREE.Vector2(s, s) })

  // ── Materials ─────────────────────────────────────────────
  // Colour and roughness vary together, so the source boards' fine plaster,
  // woven upholstery and satin cabinetry stay tactile in the grazing light.
  const finish = ({ color, roughness }) => ({
    map: kit.tex(color), roughnessMap: kit.tex(roughness, { color: false }), roughness: 1,
  })
  const plaster = (base, normal, strength, grain = 0.4) => material({
    ...finish(kit.plaster({ base, grain })), ...bump(normal, strength),
  })
  const cloth = (base, _normal, { weave = 'linen', strength = 0.75, sheen = 0.2, threads = 72 } = {}) => {
    const maps = kit.fabric({ base, weave, threads, contrast: 1.05, size: 1024 })
    return material({
      ...finish(maps), normalMap: kit.tex(maps.normal, { color: false }), normalScale: new THREE.Vector2(strength, strength),
      sheen, sheenColor: new THREE.Color(base), sheenRoughness: 0.78,
    }, THREE.MeshPhysicalMaterial)
  }
  const satin = (base, roughness = 0.58) => shiny(material({
    ...finish(kit.lacquer({ base, roughness })),
    clearcoat: 0.12, clearcoatRoughness: 0.48,
  }, THREE.MeshPhysicalMaterial), 0.28)
  const wall = plaster(0xe6e3dc, tex.stuccoN, 0.12)
  const W = { tile: 2 }
  const taupe = plaster(0x969087, tex.plasterN, 0.16, 0.55)
  const ceiling = plaster(0xf0eee8, tex.plasterN, 0.08, 0.2)
  const floor = shiny(material({ map: tex.floor, color: 0xd5d8c4, roughnessMap: tex.floorR, roughness: 0.72, ...bump(tex.floorN, 0.22), clearcoat: 0.32, clearcoatRoughness: 0.38 }, THREE.MeshPhysicalMaterial), 0.2)
  const walnut = material({ map: tex.walnut, roughnessMap: tex.walnutR, roughness: 0.85 })
  const lacquer = shiny(material({ map: tex.walnut, color: 0x6e6e6e, roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.12 }, THREE.MeshPhysicalMaterial), 0.7)
  const teak = material({ map: tex.teak, roughness: 0.55 })
  const oak = material({ map: tex.oak, roughnessMap: tex.oakR, roughness: 0.75 })
  // Pale lattice timber (birch/maple, as in the render), with a fine grain.
  const latticeWood = material({ ...finish(kit.lacquer({ base: 0xd9c8a8, grain: 0.28, roughness: 0.62 })) })
  const blackFrame = material({ color: 0x171513, roughness: 0.55 })
  const concrete = material({ color: 0xb9b3aa, roughness: 0.95 })
  const sofa = cloth(0xe9e7e1, tex.linenN, { strength: 0.82, threads: 88 })
  const linen = cloth(0xf4f2ec, tex.jerseyN, { strength: 0.64, threads: 96 })
  const duvet = cloth(0xbdb9b1, tex.jerseyN, { strength: 0.85, threads: 80 })
  const cocoa = cloth(0x514539, tex.velvetN, { weave: 'velvet', strength: 0.64, sheen: 0.32 })
  const upholstery = cloth(0x979997, tex.woolN, { weave: 'wool', strength: 0.75 })
  const wallPanel = cloth(0x7e807b, tex.woolN, { weave: 'wool', strength: 0.65, sheen: 0.1 })
  const rugMat = cloth(0xe3ded2, tex.knitN, { weave: 'knit', strength: 0.85, threads: 48, sheen: 0.08 })
  const rugBand = cloth(0xcac1af, tex.knitN, { weave: 'knit', strength: 0.8, threads: 48, sheen: 0.08 })
  const consoleMat = satin(0x66625e, 0.56)
  const screen = shiny(material({ color: 0x050506, roughness: 0.1, metalness: 0.3 }))
  const potWhite = material({ color: 0xe9e6e0, roughness: 0.5 })
  const potDark = material({ color: 0x2b2927, roughness: 0.7, flatShading: true })
  const soil = material({ color: 0x2a2018, roughness: 1 })
  const bark = material({ color: 0x4a3a2c, roughness: 0.9 })
  const leafMat = material({ color: 0xffffff, roughness: 0.86, side: THREE.DoubleSide })
  const steel = shiny(material({ color: 0xa8acaf, metalness: 1, roughness: 0.42, roughnessMap: kit.tex(kit.brushed(), { color: false }), anisotropy: 0.5 }, THREE.MeshPhysicalMaterial), 0.7)
  const hoodSteel = shiny(material({ color: 0x9a9da0, metalness: 1, roughness: 0.3 }), 0.8)
  const chrome = shiny(material({ color: 0xe0e3e6, metalness: 1, roughness: 0.12 }))
  const glass = shiny(material({ color: 0xc8dbe2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }))
  const doorWhite = material({ color: 0xe6e1d9, roughness: 0.5 })
  // Curtains: dark brown velvet drapes and a warm sheer, both double-sided.
  const drapeMat = cloth(0x39352b, tex.velvetN, { weave: 'velvet', strength: 0.18, sheen: 0.38 })
  drapeMat.side = THREE.DoubleSide
  const sheer = cloth(0xe9e3d4, tex.linenN, { strength: 0.12, threads: 80, sheen: 0.1 })
  Object.assign(sheer, { side: THREE.DoubleSide, transparent: true, opacity: 0.48, depthWrite: false })
  // Paper relief has its own physical scale, independent of artwork cropping.
  // The bedroom uses a dedicated panorama at its natural aspect, cropped
  // to the wall instead of stretching or mirroring the portrait artwork.
  const paperGrain = kit.plaster({ base: 0xd5cdbf, grain: 0.65, roughness: 0.79 })
  const paperMaterial = (map, w, h) => {
    const normalMap = tex.plasterN.clone()
    normalMap.repeat.set(w / 0.35, h / 0.35)
    kit.track.textures.push(normalMap)
    // A cool grey tint brings the reconstruction toward the boards' grey-sage paper.
    return material({ map, color: 0xe2e4de, roughnessMap: kit.tex(paperGrain.roughness, { color: false, repeat: [w / 0.35, h / 0.35] }), roughness: 1, ...bump(normalMap, 0.1) })
  }
  // The same artwork on a panel of any shape: cropped to fill it without
  // stretching, from `across` (0 left → 1 right), optionally flipped.
  const blossomPanel = (w, h, { across = 0.5, flip = false, source = tex.blossom } = {}) => {
    const t = source.clone()
    const a = source.image.width / source.image.height
    const rx = Math.min(1, w / h / a)
    const ry = Math.min(1, a / (w / h))
    t.repeat.set(flip ? -rx : rx, ry)
    t.offset.set((1 - rx) * across + (flip ? rx : 0), (1 - ry) / 2)
    t.needsUpdate = true
    kit.track.textures.push(t)
    return paperMaterial(t, w, h)
  }
  const blossomMat = blossomPanel(1.25, 2.4)
  const blossomPaper = blossomPanel(3.125, 0.745, { source: tex.blossomWide })
  const shojiTex = kit.tex(kit.shoji({ cols: 4, rows: 3 }))
  const shojiLight = material({ map: shojiTex, emissive: 0xffe3bd, emissiveMap: shojiTex, emissiveIntensity: 1.1, roughness: 1 })
  const shojiScreen = material({ map: kit.tex(kit.shoji({ cols: 3, rows: 6, wood: 0x1d1a17, line: 8 })), roughness: 0.95, transparent: true, opacity: 0.96 })
  const led = glow(0xffe7be, 1.25)
  const bulb = glow(0xfff3df, 1.4)
  const globe = glow(0xfff1da, 0.82)
  const lampGlass = glow(0xffe7c2, 0.95)
  const bronze = material({ color: 0x6b5233, metalness: 0.8, roughness: 0.4 })
  const corridorTile = material({ color: 0x9a948c, roughness: 0.7 })
  const whiteFrame = material({ color: 0xecebe7, roughness: 0.4 })
  const darkBacking = material({ color: 0x15120f, roughness: 0.95 })
  // Kitchen finishes, from the render.
  const lowerFront = satin(0x98948e, 0.62)
  const upperFront = satin(0xd0c8be, 0.54)
  const carcass = material({ color: 0x1d1a18, roughness: 0.8 })
  const bulkhead = material({ color: 0x2b2522, roughness: 0.75 })
  const counterTop = shiny(material({ map: kit.tex(kit.quartz()), roughness: 0.3 }), 0.5)
  const splash = shiny(material({ color: 0xdedbd8, roughness: 0.1 }), 0.6)
  const hobGlass = shiny(material({ map: kit.tex(kit.hob()), roughness: 0.08 }))
  const ceramicWhite = material({ color: 0xece8e2, roughness: 0.35 })
  const ceramicDark = material({ color: 0x1e1c1b, roughness: 0.45 })
  const spoonWood = material({ color: 0x9a7653, roughness: 0.6 })
  const berry = material({ color: 0xd2562a, roughness: 0.5 })
  const furniture = createReferenceFurniture(THREE, kit, { tex, whiteFrame, blackFrame, chrome, steel, ceramicDark, mirror })
  // Finishes for the detailed pieces.
  const stone = cloth(0xb3aa9c, tex.woolN, { weave: 'wool', strength: 0.7 })
  const knit = cloth(0xa49888, tex.knitN, { weave: 'knit', strength: 0.95, threads: 34, sheen: 0.12 })
  const speakerCloth = cloth(0x2a2a2c, tex.woolN, { weave: 'wool', strength: 0.4 })
  const tvBody = material({ color: 0x18191b, metalness: 0.6, roughness: 0.38 })
  const lampCeramic = material({ color: 0xd9d3c7, roughness: 0.42 })
  const switchWhite = material({ color: 0xf1efe9, roughness: 0.4 })
  const details = createDetails(THREE, kit, scene, { led, shadowGap: darkBacking })

  // ── Shell: floor, ceiling, outer walls ────────────────────
  const floorMesh = flat(scene, { x0: -T, z0: -T, x1: 4 + T, z1: 9 + T, y: 0, mat: floor, tile: [2.8, 1.9] })
  lighting.bake(floorMesh, { axes: [0, 2], bounds: [-T, -T, 4 + T, 9 + T], size: [768, 1536], light: () => [0.2, 0.175, 0.135], occlusion: lighting.floorOcclusion })
  const ceilingMesh = flat(scene, { x0: -T, z0: -T, x1: 4 + T, z1: 9 + T, y: H, mat: ceiling, down: true, ...W })
  lighting.bake(ceilingMesh, { axes: [0, 2], bounds: [-T, -T, 4 + T, 9 + T], size: [768, 1536], light: lighting.ceilingLight })
  block(scene, [-T - 0.1, 0, -T], [-T, H, 9 + T], wall, W) // left (outside face)
  block(scene, [-T, 0, -T], [0, H, 9 + T], wall, W) // left
  block(scene, [4, 0, -T], [4 + T, H, 9 + T], wall, W) // right
  // Entrance wall with the front door (opening 2.86 → 3.82, door swung open).
  block(scene, [-T, 0, -T], [2.86, H, 0], wall, W)
  block(scene, [2.86, DOOR, -T], [3.82, H, 0], wall, W)
  block(scene, [3.82, 0, -T], [4.5, H, 0], wall, W)
  block(scene, [3.78, 0, 0.02], [3.82, DOOR - 0.02, 0.92], doorWhite) // open door leaf
  doorFrame(2.86, 3.82, -T, 0, 'z')
  // Balcony wall: sliding glass doors between 1.18 and 2.80.
  block(scene, [-T, 0, 9], [1.18, H, 9 + T], wall, W)
  block(scene, [1.18, 2.35, 9], [2.8, H, 9 + T], wall, W)
  block(scene, [2.8, 0, 9], [4 + T, H, 9 + T], wall, W)
  block(scene, [1.18, 0, 9.06], [2.0, 2.35, 9.09], glass, { cast: false }) // fixed pane
  block(scene, [1.98, 0, 9.06], [2.02, 2.35, 9.09], blackFrame)
  block(scene, [1.18, 2.31, 9.0], [2.8, 2.35, 9.15], blackFrame)
  block(scene, [1.18, 0, 9.0], [1.22, 2.35, 9.15], blackFrame)
  block(scene, [2.76, 0, 9.0], [2.8, 2.35, 9.15], blackFrame)
  // Structural columns on the right wall.
  block(scene, [3.76, 0, 4.99], [4, H, 5.84], concrete, W)
  block(scene, [3.76, 0, 8.4], [4, H, 9], concrete, W)
  // Baseboards.
  for (const [a, b] of [[[0, 0, 2.93], [0.03, 0.08, 5.77]], [[0, 0, 5.88], [0.03, 0.08, 9]], [[3.97, 0, 2.9], [4, 0.08, 4.99]], [[3.97, 0, 5.84], [4, 0.08, 8.4]]]) {
    block(scene, a, b, blackFrame, { cast: false })
  }

  // ── Kitchen, toilet & bath (top 2.825 m) ──────────────────
  block(scene, [1.425, 0, 0], [1.525, H, 1.98], wall, W) // T&B / kitchen wall
  block(scene, [1.425, 0, 1.98], [2.24, H, 2.825], wall, W) // washer closet
  block(scene, [0, 0, 2.825], [0.7, H, 2.925], wall, W) // T&B front wall
  block(scene, [0.7, DOOR, 2.825], [1.425, H, 2.925], wall, W)
  block(scene, [0.72, 0, 2.86], [1.405, DOOR - 0.02, 2.9], walnut, { tile: 1 }) // T&B door (closed)
  details.doorHardware({ face: 2.9, lockX: 1.33, hingeX: 0.728, metal: chrome, dir: 1 })
  doorFrame(0.7, 1.425, 2.825, 2.925, 'z')
  block(scene, [1.425, 0, 2.825], [2.24, H, 2.925], wall, W) // closet face, flush
  block(scene, [2.24, 0, 2.825], [2.86, H, 2.925], wall, W)
  // The opening from the kitchen passage, framed in black like the others.
  block(scene, [2.86, 2.4, 2.825], [4, H, 2.925], wall, W)
  doorFrame(2.86, 4, 2.825, 2.925, 'z', 2.4)
  // Feature wall facing the living room, as in the render: a timber lattice
  // and a blossom panel floor to ceiling beside the T&B door, and a tree in
  // a rock pot against the white wall next to them.
  block(scene, [1.425, 0, 2.925], [1.81, H, 2.932], darkBacking, { cast: false })
  lattice(1.43, 1.805, 2.932, 2.952)
  wallBake(panel(scene, { at: [2.075, H / 2, 2.934], size: [0.53, H], facing: '+z', mat: blossomPanel(0.53, H, { across: 0.42 }) }), 1.81, 2.34, 0)
  block(scene, [2.338, 0, 2.925], [2.346, H, 2.94], blackFrame, { cast: false })
  rockTree(2.6, 3.13)
  details.switchPlate({ at: [2.76, 1.2, 2.925], facing: '+z', plate: switchWhite, rocker: switchWhite })
  kitchen()
  fridge()
  flat(scene, { x0: 2.22, z0: 0.42, x1: 2.8, z1: 1.55, y: 0.011, mat: rugMat, tile: 0.27 }) // mat at the counter
  details.rugEdge({ x0: 2.22, z0: 0.42, x1: 2.8, z1: 1.55, h: 0.011, mat: rugMat })

  // ── Living & dining (2.825 → 5.775 m) ─────────────────────
  // Feature wall behind the sofa: taupe, a cherry-blossom panel, a cove above.
  // Downlights either side of the panel scallop the taupe wall, as in the render.
  wallBake(block(scene, [0, 0, 2.93], [0.02, 2.5, 5.77], taupe, { cast: false, tile: 3 }), 2.93, 5.77, 2, 2.6, 1.5, [{ at: 3.27 }, { at: 5.33 }])
  for (const z of [3.27, 5.33]) cylinder(scene, { at: [0.32, H - 0.005, z], r: 0.035, h: 0.005, mat: bulb, cast: false })
  wallBake(panel(scene, { at: [0.035, 1.3, 4.25], size: [1.25, 2.4], facing: '+x', mat: blossomMat }), 2.93, 5.77)
  block(scene, [0.02, 0.1, 3.6], [0.05, 2.5, 3.625], led, { cast: false })
  block(scene, [0.02, 0.1, 4.875], [0.05, 2.5, 4.9], led, { cast: false })
  coveCeiling(2.94, 5.76)
  // Sofa: white linen, two seats with tall back cushions, slim arms, on legs.
  const F = { tile: 0.27 }
  details.sofa({ x0: 0.13, x1: 0.98, z0: 3.2, z1: 5.3, fabric: sofa, legs: blackFrame, pillows: [cocoa, stone] })
  // Rug: cream knit with a soft band near the edge.
  groundBake(flat(scene, { x0: 0.75, z0: 3.15, x1: 2.55, z1: 5.35, y: 0.013, mat: rugMat, ...F }), 0.75, 3.15, 2.55, 5.35)
  details.rugEdge({ x0: 0.75, z0: 3.15, x1: 2.55, z1: 5.35, h: 0.013, mat: rugBand })
  for (const [x0, z0, x1, z1] of [[0.85, 3.25, 2.45, 3.31], [0.85, 5.19, 2.45, 5.25], [0.85, 3.25, 0.91, 5.25], [2.39, 3.25, 2.45, 5.25]]) {
    flat(scene, { x0, z0, x1, z1, y: 0.0145, mat: rugBand, ...F })
  }
  // Low coffee table in dark lacquered walnut, legs joined by stretchers.
  details.lowTable({ x0: 1.16, x1: 1.72, z0: 3.6, z1: 4.9, top: 0.39, topMat: lacquer, frameMat: walnut })
  details.books([1.44, 0.39, 3.8], { count: 3, turn: 0.15 })
  details.vessel([1.46, 0.39, 4.73], 'bowl', ceramicDark)
  bonsai(1.44, 0.39, 4.25)
  // Money tree in a white pot at the kitchen end of the sofa. The TV end has
  // no floor space: the floating console reaches the sofa there and carries
  // its own small tree.
  tree(0.36, 3.06, 0.9, { potMat: potWhite, width: 0.42, bounds: [[0.07, 0, 2.95], [0.74, 1.4, 3.42]] }) // the crown clears the sofa arm (top 0.6 m)
  // Pendants over the coffee table: white globes with dark caps.
  for (const [x, y, z] of [[0.8, 2.16, 4.12], [0.84, 1.99, 4.28], [0.79, 1.84, 4.05]]) {
    cylinder(scene, { at: [x, y + 0.05, z], r: 0.002, h: H - y - 0.05, mat: blackFrame, seg: 4, cast: false })
    sphere(scene, { at: [x, y, z], r: 0.046, mat: globe, cast: false })
    sphere(scene, { at: [x, y + 0.048, z], r: 0.018, mat: blackFrame })
  }
  // Shoji ceiling light.
  block(scene, [1.45, 2.62, 3.75], [2.55, 2.7, 4.65], teak, { cast: false, tile: 1 })
  flat(scene, { x0: 1.5, z0: 3.8, x1: 2.5, z1: 4.6, y: 2.615, mat: shojiLight, down: true })
  // Dining, as in the render: the wall behind papered floor to ceiling in the
  // blossom artwork under a lit cove, a light oak table on splayed legs, four
  // chairs with white frames and velvet bolster backs, globe lights hung in a
  // cluster, and a cloud-pruned pine in the middle of the table.
  wallBake(panel(scene, { at: [3.995, H / 2, 3.975], size: [1.95, H], facing: '-x', mat: blossomPanel(1.95, H) }), 3.0, 4.95)
  block(scene, [3.975, 2.64, 3.0], [3.99, 2.65, 4.95], led, { cast: false })
  groundBake(flat(scene, { x0: 2.62, z0: 3.12, x1: 3.95, z1: 5.28, y: 0.013, mat: rugMat, ...F }), 2.62, 3.12, 3.95, 5.28)
  details.rugEdge({ x0: 2.62, z0: 3.12, x1: 3.95, z1: 5.28, h: 0.013, mat: rugMat })
  block(scene, [2.95, 0.72, 3.5], [3.75, 0.755, 4.9], oak, { round: 0.01, tile: 1.83 })
  for (const [x, z, dx, dz] of [[3.05, 3.62, -1, -1], [3.65, 3.62, 1, -1], [3.05, 4.78, -1, 1], [3.65, 4.78, 1, 1]]) {
    limb(scene, [x + dx * 0.05, 0, z + dz * 0.05], [x, 0.72, z], 0.013, 0.021, oak)
  }
  furniture.diningChair(scene, { at: [2.68, 0, 3.92], facing: [1, 0], color: 0x8a8c8f })
  furniture.diningChair(scene, { at: [2.68, 0, 4.48], facing: [1, 0], color: 0x7d8590 })
  furniture.diningChair(scene, { at: [3.35, 0, 3.27], facing: [0, 1], color: 0x9aa592 })
  furniture.diningChair(scene, { at: [3.35, 0, 5.13], facing: [0, -1], color: 0xa47b5a })
  cloudPine(3.35, 0.755, 4.2)
  for (const [x, y, z] of [[3.3, 2.16, 4.08], [3.4, 1.99, 4.22], [3.29, 1.84, 4.35]]) {
    cylinder(scene, { at: [x, y + 0.05, z], r: 0.002, h: H - y - 0.05, mat: blackFrame, seg: 4, cast: false })
    sphere(scene, { at: [x, y, z], r: 0.046, mat: globe, cast: false })
    sphere(scene, { at: [x, y + 0.05, z], r: 0.018, mat: blackFrame })
  }

  // ── Wall between living room and bedroom (5.775 m) ────────
  block(scene, [0, 0, 5.775], [2.15, H, 5.875], wall, W)
  block(scene, [2.15, 2.2, 5.775], [3.6, H, 5.875], wall, W)
  block(scene, [3.6, 0, 5.775], [4, H, 5.875], wall, W)
  doorFrame(2.15, 3.6, 5.775, 5.875, 'z', 2.2)
  block(scene, [2.18, 0, 5.74], [2.75, 2.18, 5.77], shojiScreen, { cast: false }) // sliding screen, open
  // Media wall: blossom panel lit from both sides between dark trims, the TV,
  // a long floating console with small trees, glass lanterns either side.
  wallBake(panel(scene, { at: [1.15, 1.3, 5.765], size: [1.25, 2.4], facing: '-z', mat: blossomMat }), 0.47, 1.83, 0)
  block(scene, [0.5, 0.1, 5.745], [0.525, 2.5, 5.77], led, { cast: false })
  block(scene, [1.775, 0.1, 5.745], [1.8, 2.5, 5.77], led, { cast: false })
  block(scene, [0.47, 0.1, 5.735], [0.5, 2.5, 5.775], blackFrame, { cast: false })
  block(scene, [1.8, 0.1, 5.735], [1.83, 2.5, 5.775], blackFrame, { cast: false })
  details.tv({ x0: 0.57, x1: 1.73, y0: 0.86, y1: 1.52, z: 5.74, body: tvBody, glassMat: screen })
  details.mediaConsole({ x0: 0.3, x1: 2.05, y0: 0.28, y1: 0.74, z0: 5.36, z1: 5.775, mat: consoleMat, recess: carcass, soundbar: speakerCloth })
  details.vessel([1.68, 0.74, 5.6], 'bud', ceramicWhite)
  tree(0.43, 5.53, 0.45, { round: true, y: 0.74, width: 0.26, bounds: [[0.3, 0.74, 5.37], [0.565, 1.4, 5.7]] }) // clear of the TV and the lanterns
  tree(1.9, 5.53, 0.45, { round: true, y: 0.74, width: 0.26, bounds: [[1.745, 0.74, 5.37], [2.05, 1.4, 5.7]], turn: 1.4 })
  for (const [x, y] of [[0.36, 1.75], [0.46, 1.55], [1.94, 1.75], [2.04, 1.55]]) lantern(x, y, 5.6)

  // ── Bedroom (5.775 → 9.0 m) ───────────────────────────────
  // Headboard wall: upholstered vertical panels to 1.72 m, a dark ledge, and
  // the cherry-blossom paper above, wall to wall, under a lit cove.
  for (let z = 5.875; z < 8.99; z += 0.26) {
    block(scene, [0, 0, z + 0.003], [0.045, 1.72, Math.min(9, z + 0.257)], wallPanel, { round: 0.012, ...F })
  }
  block(scene, [0, 1.72, 5.875], [0.07, 1.755, 9], walnut, { tile: 1 })
  wallBake(panel(scene, { at: [0.049, 2.1275, 7.4375], size: [3.125, 0.745], facing: '+x', mat: blossomPaper }), 5.88, 9)
  coveCeiling(5.9, 8.98, 3.73)
  details.switchPlate({ at: [3.76, 1.2, 5.875], facing: '+z', plate: switchWhite, rocker: switchWhite })
  // Bed: a dark walnut platform on tapered legs, an upholstered headboard,
  // white and cocoa pillows, a grey duvet.
  groundBake(flat(scene, { x0: 0.85, z0: 6.11, x1: 3.05, z1: 8.24, y: 0.013, mat: rugMat, ...F }), 0.85, 6.11, 3.05, 8.24)
  details.rugEdge({ x0: 0.85, z0: 6.11, x1: 3.05, z1: 8.24, h: 0.013, mat: rugBand })
  for (const [x0, z0, x1, z1] of [[0.92, 6.18, 2.98, 6.23], [0.92, 8.12, 2.98, 8.17], [0.92, 6.18, 0.97, 8.17], [2.93, 6.18, 2.98, 8.17]]) {
    groundBake(flat(scene, { x0, z0, x1, z1, y: 0.0145, mat: rugBand, ...F }), x0, z0, x1, z1)
  }
  details.channelHeadboard({ z: 7.2, width: 1.7, y0: 0.445, y1: 1.245, depth: 0.12, count: 7, mat: upholstery })
  block(scene, [0.1, 0.16, 6.3], [2.25, 0.3, 8.1], walnut, { tile: 1 })
  for (const [x, z] of [[0.28, 6.45], [2.08, 6.45], [0.28, 7.95], [2.08, 7.95]]) limb(scene, [x, 0, z], [x, 0.16, z], 0.022, 0.032, walnut)
  cushion(scene, { at: [1.13, 0.42, 7.2], size: [1.94, 0.2, 1.6], mat: linen, kind: 'seat', puff: 0.05, wrinkles: 0.16, segments: 24 })
  bedCover()
  details.throwBlanket({ x0: 1.62, x1: 2.04, z0: 6.32, z1: 8.08, y: 0.565, mat: knit })
  for (const [z, tilt] of [[6.84, -0.045], [7.56, 0.035]]) {
    cushion(scene, { at: [0.38, 0.73, z], size: [0.17, 0.38, 0.61], mat: linen, kind: 'pillow', puff: 0.28, tuft: 0.035, rotation: [tilt, 0, 0.17], droop: 0.008, wrinkles: 0.8, segments: 28, seed: Math.round(z * 100) })
  }
  for (const [z, tilt] of [[6.99, -0.09], [7.45, 0.08]]) {
    cushion(scene, { at: [0.59, 0.72, z], size: [0.13, 0.34, 0.35], mat: cocoa, kind: 'pillow', puff: 0.32, tuft: 0.06, rotation: [tilt, 0, 0.15], wrinkles: 0.95, segments: 28, seed: Math.round(z * 101) })
  }
  // Teak bench at the foot of the bed, with a vase of berry branches.
  block(scene, [2.32, 0.4, 6.6], [2.74, 0.45, 7.8], teak, { round: 0.008, tile: 1 })
  for (const [x, z] of [[2.38, 6.68], [2.68, 6.68], [2.38, 7.72], [2.68, 7.72]]) limb(scene, [x, 0, z], [x, 0.4, z], 0.018, 0.026, teak)
  vase(2.52, 0.45, 6.92)
  details.books([2.52, 0.45, 7.5], { count: 2, turn: 1.3, seed: 1 })
  // Floating shelf with a table lamp (balcony side); a money tree on the
  // other side of the bed; clusters of glass lanterns both sides.
  details.nightstand({ z0: 8.1, z1: 8.52, y0: 0.42, y1: 0.56, depth: 0.44, wood: walnut, pull: bronze, lamp: { base: lampCeramic, shade: lampGlass, bulb } })
  tree(0.38, 6.12, 0.91, { potMat: potDark, pot: [0.09, 0.11, 0.26], width: 0.3, bounds: [[0.1, 0, 5.95], [0.74, 1.3, 6.3]], turn: 0.6 })
  for (const [x, y, z] of [[0.3, 1.32, 8.22], [0.44, 1.5, 8.36], [0.28, 1.66, 8.5], [0.3, 1.32, 6.22], [0.44, 1.5, 6.06], [0.28, 1.66, 5.98]]) lantern(x, y, z)
  // Floating shelf on the partition wall, lit underneath, a few things on it.
  block(scene, [0.95, 0.72, 5.875], [2.1, 0.76, 6.2], walnut, { tile: 1 })
  block(scene, [1.0, 0.712, 6.14], [2.05, 0.72, 6.16], led, { cast: false })
  details.bookRow([1.02, 0.76, 6.02], { count: 6, seed: 3 })
  details.vessel([1.55, 0.76, 6.03], 'jar', ceramicWhite)
  details.vessel([1.86, 0.76, 6.03], 'bud', ceramicDark)
  // Wardrobe (where the plan puts it, clear of the window wall) and desk.
  details.wardrobe({ x0: 2.86, x1: 3.76, z0: 8.25, z1: 8.85, y1: 2.4, mat: walnut, gap: darkBacking, handle: blackFrame })
  block(scene, [3.55, 0.72, 6.8], [4, 0.76, 7.6], teak, { tile: 1 })
  block(scene, [3.97, 0.95, 6.9], [3.99, 1.75, 7.5], screen, { cast: false }) // mirror
  // Shoji ceiling light.
  block(scene, [0.9, 2.62, 6.75], [2.0, 2.7, 7.65], teak, { cast: false, tile: 1 })
  flat(scene, { x0: 0.95, z0: 6.8, x1: 1.95, z1: 7.6, y: 2.615, mat: shojiLight, down: true })
  // Curtains either side of the balcony doors, on a slim black track:
  // pleated velvet drapes in front of warm sheers.
  block(scene, [0.68, 2.5, 8.86], [3.34, 2.52, 8.98], blackFrame, { cast: false })
  drape(scene, { x0: 0.7, x1: 1.28, y0: 0.02, y1: 2.5, z: 8.88, folds: 5, depth: 0.08, mat: drapeMat, tile: 0.28 })
  drape(scene, { x0: 2.76, x1: 3.34, y0: 0.02, y1: 2.5, z: 8.88, folds: 5, depth: 0.08, mat: drapeMat, tile: 0.28 })
  drape(scene, { x0: 1.15, x1: 1.62, y0: 0.02, y1: 2.5, z: 8.95, folds: 7, depth: 0.04, mat: sheer, tile: 0.27 })
  drape(scene, { x0: 2.76, x1: 3.1, y0: 0.02, y1: 2.5, z: 8.95, folds: 5, depth: 0.04, mat: sheer, tile: 0.27 })

  // ── Balcony: rebuilt from "Saint Honore Unit 9S balcony view.jpg" ──
  balcony()
  // Soft daylight beyond the doors; the walk ends here and fades into the
  // project images instead of displaying the balcony panorama photograph.
  scene.background = new THREE.Color(0xe7e4dc)

  // ── Corridor outside the front door ───────────────────────
  block(scene, [2.4, -0.01, -3], [4.4, 0, -T], corridorTile, { cast: false })
  block(scene, [2.3, 0, -3], [2.4, H, -T], wall, W)
  block(scene, [4.4, 0, -3], [4.5, H, -T], wall, W)
  block(scene, [2.3, H, -3], [4.5, H + 0.05, -T], ceiling)

  // ── Lights ────────────────────────────────────────────────
  const L = 0.2 // overall brightness of the lamps (one dial for all of them)
  scene.add(new THREE.HemisphereLight(0xf1f0e8, 0x5b554c, 0.35))
  const spots = []
  function spot(from, to, color, intensity, shadow = false, angle = 0.62) {
    const s = new THREE.SpotLight(color, intensity * L, 7, angle, 0.85, 2)
    s.position.set(...from)
    s.target.position.set(...to)
    scene.add(s, s.target)
    if (shadow) {
      s.castShadow = true
      s.shadow.mapSize.set(2048, 2048)
      s.shadow.bias = -0.0004
      s.shadow.normalBias = 0.006
      s.shadow.radius = 3
    }
    spots.push(s)
    // A small downlight fitting in the ceiling.
    cylinder(scene, { at: [from[0], H - 0.005, from[2]], r: 0.04, h: 0.005, mat: bulb, cast: false })
    return s
  }
  spot([0.85, 2.62, 4.25], [0.7, 0, 4.25], 0xffead0, 20, true)
  spot([1.15, 2.62, 5.35], [1.15, 1.1, 5.775], 0xffead0, 14)
  spot([0.5, 2.62, 7.2], [0.0, 1.0, 7.2], 0xffead0, 18, true)
  // Kitchen: downlights washing the upper doors, as in the render.
  spot([2.2, 2.62, 0.99], [1.9, 1.25, 0.99], 0xfff1e0, 22, true, 0.66)
  spot([2.75, 2.62, 1.0], [1.88, 1.75, 1.0], 0xfff1e0, 16, false, 0.8) // washes the upper doors
  // Downlights grazing the dining wall's artwork.
  spot([3.62, 2.62, 4.0], [4.0, 1.1, 4.0], 0xffead0, 18, false, 0.65)
  function point(at, color, intensity, distance = 5) {
    const p = new THREE.PointLight(color, intensity * L, distance, 2)
    p.position.set(...at)
    scene.add(p)
    return p
  }
  // Shared room fills keep the warm ceiling bounce without shading an area
  // light for every fixture on every fabric and wall fragment.
  point([0.24, 0.78, 8.31], 0xffe1b5, 1.6, 2.5)
  point([2.0, 2.2, 1.3], 0xfff1e2, 4, 6)
  point([2.0, 2.45, 4.3], 0xffefdb, 8, 6)
  point([1.6, 2.45, 7.3], 0xffefdb, 7, 5)
  point([3.4, 2.4, -1.5], 0xfff1e2, 3, 5)
  // Under-cabinet strip: a long thin light facing down onto the worktop.
  const under = new THREE.RectAreaLight(0xffe7c2, 70 * L, 0.09, 1.9)
  under.position.set(1.82, 1.54, 0.99)
  under.rotation.x = -Math.PI / 2
  scene.add(under)
  point([1.99, 2.0, 9.4], 0xd6eafa, 6, 4)

  function bedCover() {
    // A tailored grey cover with an actual folded-over upper layer and a
    // softly hanging hem. The weave follows the fabric continuously.
    const hem = duvet.clone()
    hem.color.multiplyScalar(0.87)
    kit.track.materials.push(hem)
    function surface(x0, x1, z0, z1, folded = false) {
      const w = x1 - x0, d = z1 - z0
      const geometry = new THREE.PlaneGeometry(w, d, folded ? 16 : 64, 72)
      geometry.rotateX(-Math.PI / 2)
      const positions = geometry.attributes.position, uv = geometry.attributes.uv
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i) + (x0 + x1) / 2
        const z = positions.getZ(i) + (z0 + z1) / 2
        const side = Math.min(1, Math.max(0, Math.abs(z - 7.2) - 0.77) / 0.17)
        const foot = Math.min(1, Math.max(0, x - 2.07) / 0.21)
        const corner = Math.max(side, foot)
        const softFold = Math.sin((z - 6.3) * 12 + x * 4) * 0.008
          + Math.sin(z * 23 - x * 5) * 0.003
          + Math.sin(x * 8 + z * 5) * 0.006
        const gather = Math.exp(-(((x - 1.12) / 0.25) ** 2)) * Math.sin((z - 6.35) * 16) * 0.012
        const bow = Math.sin(Math.min(1, Math.max(0, (x - 0.66) / 1.43)) * Math.PI) * 0.013
        const foldRoll = folded ? Math.sin((x - x0) / w * Math.PI) * 0.023 + 0.03 : 0
        positions.setXYZ(i,
          x - foot * 0.085,
          0.553 + bow + softFold + gather + foldRoll - corner * corner * 0.245,
          z - Math.sign(z - 7.2) * side * 0.037)
        uv.setXY(i, (x - 0.66) / 0.27, (z - 6.26) / 0.27)
      }
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
      kit.track.geometries.push(geometry)
      const cover = new THREE.Mesh(geometry, duvet)
      cover.castShadow = true
      cover.receiveShadow = true
      scene.add(cover)
      const row = geometry.parameters.widthSegments + 1
      const points = []
      // Sewn edge around both long sides and the foot; no thick foam roll.
      for (let i = 0; i < row; i++) points.push([positions.getX(i), positions.getY(i), positions.getZ(i)])
      for (let i = 1; i <= 72; i++) {
        const k = i * row + row - 1
        points.push([positions.getX(k), positions.getY(k), positions.getZ(k)])
      }
      for (let i = row - 2; i >= 0; i--) {
        const k = 72 * row + i
        points.push([positions.getX(k), positions.getY(k), positions.getZ(k)])
      }
      tube(scene, { points, r: 0.0012, mat: hem, seg: 144, tile: 0.27, cast: false })
    }
    surface(0.66, 2.28, 6.26, 8.14)
    surface(0.66, 0.93, 6.26, 8.14, true)
  }

  function coveCeiling(z0, z1, right = 3.98) {
    // Recessed perimeter with a plaster shelf, a raised lip, and an upward
    // facing diffuser hidden in its channel. The warm ceiling/wall bounce
    // is baked separately, rather than a line that cannot light the room.
    const edge = 0.24, bottom = 2.51, tray = 2.565, lip = 2.61
    for (const [a, b] of [
      [[0.02, bottom, z0], [edge, tray, z1]],
      [[right - edge, bottom, z0], [right, tray, z1]],
      [[edge, bottom, z0], [right - edge, tray, z0 + edge]],
      [[edge, bottom, z1 - edge], [right - edge, tray, z1]],
    ]) {
      const shelf = block(scene, a, b, ceiling, { round: 0.004, tile: 2 })
      lighting.bake(shelf, { axes: [0, 2], bounds: [0, z0, 4, z1], size: [512, 384], light: lighting.ceilingLight })
    }
    for (const [a, b] of [
      [[edge - 0.025, tray, z0 + edge], [edge, lip, z1 - edge]],
      [[right - edge, tray, z0 + edge], [right - edge + 0.025, lip, z1 - edge]],
      [[edge, tray, z0 + edge - 0.025], [right - edge, lip, z0 + edge]],
      [[edge, tray, z1 - edge], [right - edge, lip, z1 - edge + 0.025]],
    ]) block(scene, a, b, ceiling, { round: 0.003, tile: 2 })
    for (const [x0, za, x1, zb] of [
      [0.08, z0 + edge, 0.19, z1 - edge],
      [right - 0.19, z0 + edge, right - 0.08, z1 - edge],
      [edge, z0 + 0.08, right - edge, z0 + 0.19],
      [edge, z1 - 0.19, right - edge, z1 - 0.08],
    ]) flat(scene, { x0, z0: za, x1, z1: zb, y: tray + 0.004, mat: led })
  }

  function balcony() {
    const tile = material({ ...finish(kit.plaster({ base: 0xc9ccc7, grain: 0.65, roughness: 0.86 })), ...bump(tex.plasterN, 0.18) })
    const grout = material({ color: 0x8d938e, roughness: 0.95 })
    block(scene, [1, -0.15, 9.15], [3.1, 0, 10.15], tile, { tile: 0.5 })
    for (let x = 1.5; x < 3.1; x += 0.5) block(scene, [x, 0.001, 9.15], [x + 0.003, 0.003, 10.15], grout, { cast: false })
    block(scene, [1, 0.001, 9.65], [3.1, 0.003, 9.653], grout, { cast: false })
    block(scene, [0.9, 0, 9.15], [1, H, 10.15], wall, W)
    block(scene, [3.1, 0, 9.15], [3.2, H, 10.15], wall, W)
    block(scene, [1, 2.6, 9.15], [3.1, 2.75, 10.15], concrete)
    const rail = []
    for (const y of [0.12, 0.74, 1.12]) rail.push([[1, y, 10.09], [3.1, y + (y === 1.12 ? 0.065 : 0.028), 10.15]])
    for (let x = 1.03; x < 3.1; x += 0.14) rail.push([[x, 0.12, 10.1], [x + 0.022, 1.12, 10.135]])
    rail.push([[1, 0, 10.06], [1.055, 1.17, 10.15]], [[3.045, 0, 10.06], [3.1, 1.17, 10.15]])
    boxes(scene, rail, blackFrame)
    furniture.balconySet(scene, { tableAt: [1.83, 0, 9.72], chairAt: [1.3, 0, 9.56], chairFacing: [1, 0] })
  }

  // Kitchen run along the T&B wall, as in the render: warm-grey doors and
  // drawers below, pale doors above with an open dish niche and a slim steel
  // hood, a dark bulkhead to the ceiling and light washing the wall between.
  // Its back is at x 1.525; it runs from the entrance wall to the washer
  // closet (z 0 → 1.98).
  function kitchen() {
    const [BACK, FRONT, Z1] = [1.525, 2.105, 1.98]
    // Base cabinets: a dark carcass and toe kick; the gaps between the
    // fronts and under the worktop read as handle grooves.
    block(scene, [BACK, 0.1, 0], [FRONT, 0.86, Z1], carcass, { cast: false })
    block(scene, [BACK, 0, 0], [FRONT - 0.06, 0.1, Z1], carcass, { cast: false })
    const lower = (z0, z1, y0, y1) => block(scene, [FRONT, y0, z0 + 0.002], [FRONT + 0.018, y1, z1 - 0.002], lowerFront, { tile: 0.6 })
    lower(1.65, Z1, 0.1, 0.82) // two doors under the sink
    lower(1.32, 1.65, 0.1, 0.82)
    lower(0.66, 1.32, 0.64, 0.82) // three drawers
    lower(0.66, 1.32, 0.45, 0.62)
    lower(0.66, 1.32, 0.1, 0.43)
    lower(0.33, 0.66, 0.1, 0.82) // two doors under the hob
    lower(0, 0.33, 0.1, 0.82)
    // Slim black bar pulls along the top of each drawer.
    for (const top of [0.82, 0.62, 0.43]) block(scene, [FRONT + 0.018, top - 0.034, 0.74], [FRONT + 0.027, top - 0.025, 1.24], blackFrame, { round: 0.002 })
    // Worktop around an undermount sink; a low glass splash with a dark edge.
    const top = (x0, z0, x1, z1) => block(scene, [x0, 0.86, z0], [x1, 0.9, z1], counterTop, { tile: 0.6 })
    top(1.51, 0, 2.145, 1.42)
    top(1.51, 1.86, 2.145, Z1)
    top(1.51, 1.42, 1.66, 1.86)
    top(2.0, 1.42, 2.145, 1.86)
    block(scene, [1.66, 0.7, 1.42], [2.0, 0.71, 1.86], steel, { cast: false })
    for (const [a, b] of [[[1.66, 0.71, 1.42], [1.67, 0.9, 1.86]], [[1.99, 0.71, 1.42], [2.0, 0.9, 1.86]], [[1.66, 0.71, 1.42], [2.0, 0.9, 1.43]], [[1.66, 0.71, 1.85], [2.0, 0.9, 1.86]]]) {
      block(scene, a, b, steel, { cast: false })
    }
    cylinder(scene, { at: [1.83, 0.711, 1.64], r: 0.03, h: 0.002, mat: carcass, cast: false })
    block(scene, [BACK, 0.9, 0], [BACK + 0.012, 1.07, Z1], splash, { cast: false })
    block(scene, [BACK, 1.07, 0], [BACK + 0.016, 1.078, Z1], carcass, { cast: false })
    const backsplash = panel(scene, { at: [BACK + 0.003, 1.332, Z1 / 2], size: [Z1, 0.504], facing: '+x', mat: wall, tile: 2 })
    lighting.bake(backsplash, {
      axes: [2, 1], bounds: [0, 1.08, Z1, 1.584], size: [768, 256],
      light: (z, y) => {
        const end = Math.min(1, z / 0.08, (Z1 - z) / 0.08)
        const wash = 2.4 * Math.exp(-(1.584 - y) / 0.29) * end
        return [0.18 + wash, 0.155 + wash * 0.79, 0.13 + wash * 0.49]
      },
      occlusion: (z, y) => 1 - 0.15 * Math.exp(-(y - 1.08) / 0.035),
    })
    // Gooseneck tap.
    cylinder(scene, { at: [1.6, 0.9, 1.64], r: 0.022, h: 0.06, mat: chrome })
    tube(scene, { points: [[1.6, 0.95, 1.64], [1.6, 1.2, 1.64], [1.63, 1.3, 1.64], [1.71, 1.32, 1.64], [1.78, 1.26, 1.64], [1.8, 1.16, 1.64]], r: 0.011, mat: chrome })
    block(scene, [1.59, 1.0, 1.66], [1.6, 1.012, 1.73], chrome)
    // Induction hob with a dark pot, a steel crock of wooden spoons, a plant.
    flat(scene, { x0: 1.6, z0: 0.1, x1: 2.05, z1: 0.62, y: 0.902, mat: hobGlass })
    cylinder(scene, { at: [1.82, 0.902, 0.34], r: 0.1, h: 0.1, mat: ceramicDark })
    cylinder(scene, { at: [1.82, 1.0, 0.34], r: 0.085, h: 0.01, mat: ceramicDark })
    cylinder(scene, { at: [1.66, 0.9, 0.8], r: 0.055, h: 0.15, mat: steel })
    for (const [dx, dz, h] of [[-0.02, -0.02, 0.3], [0.025, 0.01, 0.32], [0, 0.03, 0.28]]) {
      limb(scene, [1.66, 0.92, 0.8], [1.66 + dx, 0.9 + h, 0.8 + dz], 0.007, 0.006, spoonWood)
      sphere(scene, { at: [1.66 + dx * 1.1, 0.92 + h, 0.8 + dz * 1.1], r: 0.022, mat: spoonWood, scale: [0.3, 1.5, 0.9] })
    }
    potPlant(1.76, 0.9, 1.08)
    // Upper cabinets: the right half sits over a slim steel hood; the left
    // half has an open niche with dishes under four short doors.
    const UF = 1.875
    block(scene, [BACK, 1.66, 0], [UF, 2.42, 0.99], carcass, { cast: false })
    block(scene, [BACK, 1.95, 0.99], [UF, 2.42, Z1], carcass, { cast: false })
    block(scene, [BACK, 1.55, 0.99], [BACK + 0.02, 1.95, Z1], carcass, { cast: false }) // niche back
    block(scene, [BACK, 1.55, 0.99], [UF + 0.018, 1.575, Z1], upperFront) // niche floor
    block(scene, [BACK, 1.55, Z1 - 0.018], [UF + 0.018, 2.42, Z1], upperFront) // end panel
    block(scene, [BACK, 2.42, 0], [UF + 0.018, H, Z1], bulkhead)
    const upper = (z0, z1, y0) => block(scene, [UF, y0, z0 + 0.002], [UF + 0.018, 2.418, z1 - 0.002], upperFront, { tile: 0.6 })
    for (let k = 0; k < 4; k++) upper(k * 0.2475, (k + 1) * 0.2475, 1.66)
    for (let k = 0; k < 4; k++) upper(0.99 + k * 0.2475, Math.min(Z1 - 0.018, 0.99 + (k + 1) * 0.2475), 1.95)
    block(scene, [BACK, 1.6, 0.01], [1.93, 1.66, 0.98], hoodSteel) // slim hood
    block(scene, [1.91, 1.585, 0.01], [1.935, 1.62, 0.98], hoodSteel)
    block(scene, [1.78, 1.542, 0.99], [1.86, 1.548, 1.96], led, { cast: false }) // under-cabinet strips
    block(scene, [1.8, 1.592, 0.03], [1.88, 1.598, 0.96], led, { cast: false })
    // Dishes in the niche: dark cups, stacked white bowls, a glass jar.
    for (const z of [1.1, 1.22]) cylinder(scene, { at: [1.7, 1.575, z], r: 0.04, r2: 0.042, h: 0.095, mat: ceramicDark })
    for (const [z, n] of [[1.42, 3], [1.62, 2]]) {
      for (let k = 0; k < n; k++) cylinder(scene, { at: [1.7, 1.575 + k * 0.035, z], r: 0.045, r2: 0.075, h: 0.035, mat: ceramicWhite })
    }
    cylinder(scene, { at: [1.68, 1.575, 1.82], r: 0.05, h: 0.16, mat: glass, cast: false })
  }

  // Fridge: brushed steel with a bottom freezer, beside the run and facing
  // the passage as in the render; handles on the entrance side.
  function fridge() {
    const [x0, x1, z0, z1] = [2.26, 2.86, 2.19, 2.79]
    block(scene, [x0, 0.04, z0], [x1 - 0.05, 1.86, z1], steel, { round: 0.02 })
    block(scene, [x1 - 0.06, 0.04, z0], [x1, 0.645, z1], steel, { round: 0.012 })
    block(scene, [x1 - 0.06, 0.655, z0], [x1, 1.86, z1], steel, { round: 0.012 })
    for (const [y0, y1] of [[0.95, 1.55], [0.38, 0.6]]) {
      block(scene, [x1 + 0.012, y0, z0 + 0.035], [x1 + 0.026, y1, z0 + 0.05], chrome)
      for (const y of [y0 + 0.02, y1 - 0.04]) block(scene, [x1, y, z0 + 0.037], [x1 + 0.012, y + 0.02, z0 + 0.048], chrome)
    }
    for (const x of [x0 + 0.05, x1 - 0.06]) {
      for (const z of [z0 + 0.05, z1 - 0.05]) cylinder(scene, { at: [x, 0, z], r: 0.015, h: 0.04, mat: carcass })
    }
  }

  // A small bushy plant in a dark faceted pot (kitchen worktop).
  function potPlant(x, y, z) {
    sphere(scene, { at: [x, y + 0.06, z], r: 0.075, mat: potDark, scale: [1, 0.8, 1], detail: 6 })
    for (const [dx, dz, h] of [[0.03, 0.01, 0.16], [-0.03, 0.02, 0.2], [0, -0.03, 0.22]]) {
      limb(scene, [x, y + 0.1, z], [x + dx, y + 0.1 + h, z + dz], 0.007, 0.005, bark)
    }
    foliage(scene, {
      clusters: [{ at: [x, y + 0.3, z], r: [0.13, 0.1, 0.13], count: 900 }, { at: [x + 0.03, y + 0.38, z - 0.03], r: [0.08, 0.06, 0.08], count: 380 }],
      size: 0.034,
      fine: true,
      lumps: 0.035,
      colors: [0x13240f, 0x2c4a22, 0x6f8c3c],
      seed: 41,
      mat: leafMat,
      bounds: [[1.61, y + 0.1, 0.91], [1.96, y + 0.49, 1.29]],
    })
  }

  // Fine-leaved trees match the reference silhouette. Leaf instances stay
  // inside each furnishing's clear bounds, with no alpha-sorting artefacts.
  function tree(x, z, height, { potMat = potDark, pot = [0.1, 0.12, 0.24], round = false, y = 0, turn = 0, width = 0.34, bounds }: {
    potMat?: any
    pot?: number[]
    round?: boolean
    y?: number
    turn?: number
    width?: number
    bounds?: number[][]
  } = {}) {
    let soilAt
    if (round) {
      sphere(scene, { at: [x, y + 0.055, z], r: 0.07, mat: potDark, scale: [1, 0.8, 1], detail: 6 })
      soilAt = y + 0.1
    } else {
      const [rb, rt, ph] = pot
      cylinder(scene, { at: [x, y, z], r: rb, r2: rt, h: ph, mat: potMat })
      cylinder(scene, { at: [x, y + ph - 0.03, z], r: rt - 0.012, h: 0.025, mat: soil, cast: false })
      soilAt = y + ph - 0.01
    }
    const trunk = [x, soilAt + height * 0.61, z]
    limb(scene, [x, soilAt, z], [x + width * 0.06, soilAt + height * 0.32, z], width * 0.05, width * 0.038, bark)
    limb(scene, [x + width * 0.06, soilAt + height * 0.32, z], trunk, width * 0.038, width * 0.019, bark)
    const clusters = []
    for (let i = 0; i < 7; i++) {
      const angle = turn + i * 2.39996
      const radius = width * (i === 6 ? 0.1 : 0.32)
      const tip = [x + Math.cos(angle) * radius, soilAt + height * (0.67 + (i % 3) * 0.095), z + Math.sin(angle) * radius * 0.48]
      limb(scene, trunk, tip, width * 0.017, width * 0.007, bark)
      clusters.push({ at: tip, r: [width * 0.19, height * 0.1, width * 0.14], count: round ? 260 : 420 })
    }
    foliage(scene, { clusters, size: round ? 0.02 : 0.028, fine: true, lumps: round ? 0.025 : 0.04, flatBottom: 0.35, colors: [0x13240f, 0x2c4a22, 0x6f8c3c], seed: Math.round(x * 100 + z * 100), mat: leafMat, bounds, cast: false })
  }

  // A cascading bonsai in a shallow cream pot, as on the render's coffee
  // table: a twisting trunk spilling to one side, flat pads of foliage.
  function bonsai(x, y, z) {
    block(scene, [x - 0.07, y, z - 0.11], [x + 0.07, y + 0.055, z + 0.11], potWhite, { round: 0.012 })
    const t = y + 0.055
    const trunk = [[x, t, z], [x + 0.01, t + 0.1, z - 0.03], [x - 0.02, t + 0.18, z + 0.02], [x - 0.01, t + 0.2, z + 0.12], [x - 0.03, t + 0.13, z + 0.24], [x - 0.04, t + 0.08, z + 0.32]]
    let r = 0.024
    for (let i = 1; i < trunk.length; i++) {
      limb(scene, trunk[i - 1], trunk[i], r, r * 0.75, bark)
      r *= 0.75
    }
    limb(scene, trunk[2], [x + 0.02, t + 0.2, z - 0.1], 0.011, 0.006, bark)
    foliage(scene, {
      clusters: [
        { at: [x - 0.02, t + 0.24, z + 0.03], r: [0.08, 0.035, 0.09], count: 720 },
        { at: [x - 0.03, t + 0.15, z + 0.27], r: [0.07, 0.03, 0.09], count: 560 },
        { at: [x + 0.02, t + 0.22, z - 0.12], r: [0.06, 0.03, 0.06], count: 380 },
      ],
      size: 0.02,
      fine: true,
      lumps: 0.022,
      flatBottom: 0.65,
      colors: [0x13240f, 0x2c4a22, 0x6f8c3c],
      seed: 5,
      mat: leafMat,
      bounds: [[1.18, t, 3.65], [1.7, t + 0.4, 4.82]],
    })
  }

  // A floor-to-ceiling timber lattice of small square openings, x0 → x1,
  // standing between z0 and z1 (one mesh).
  function lattice(x0, x1, z0, z1) {
    const cols = 9
    const pitch = (x1 - x0) / cols
    const bar = 0.011
    const list = []
    for (let i = 0; i <= cols; i++) {
      const x = x0 + i * pitch
      list.push([[Math.max(x0, x - bar / 2), 0, z0], [Math.min(x1, x + bar / 2), H, z1]])
    }
    for (let y = 0; y <= H; y += pitch) list.push([[x0, Math.max(0, y - bar / 2), z0], [x1, Math.min(H, y + bar / 2), z1]])
    boxes(scene, list, latticeWood, { tile: 0.6 })
  }

  // A delicate, wide-crowned tree in a dark rock of a pot (the feature wall).
  function rockTree(x, z) {
    sphere(scene, { at: [x, 0.11, z], r: 0.15, mat: potDark, scale: [1.15, 0.75, 0.95], detail: 5 })
    const crown = [x - 0.03, 0.62, z + 0.02]
    limb(scene, [x, 0.17, z], [x + 0.02, 0.45, z], 0.03, 0.022, bark)
    limb(scene, [x + 0.02, 0.45, z], crown, 0.022, 0.016, bark)
    for (const tip of [[x - 0.3, 0.9, z + 0.05], [x + 0.32, 0.86, z], [x - 0.05, 1.04, z + 0.03], [x + 0.15, 0.97, z + 0.08], [x - 0.18, 0.8, z - 0.02]]) {
      limb(scene, crown, tip, 0.012, 0.005, bark)
    }
    foliage(scene, {
      clusters: [
        { at: [x - 0.22, 0.95, z + 0.04], r: [0.2, 0.09, 0.14], count: 760 },
        { at: [x + 0.24, 0.92, z + 0.02], r: [0.2, 0.08, 0.13], count: 760 },
        { at: [x, 1.05, z + 0.03], r: [0.18, 0.1, 0.13], count: 700 },
      ],
      size: 0.026,
      fine: true,
      lumps: 0.045,
      flatBottom: 0.5,
      colors: [0x13240f, 0x2c4a22, 0x6f8c3c],
      seed: 61,
      mat: leafMat,
      bounds: [[2.18, 0.15, 2.99], [2.96, 1.22, 3.36]],
    })
  }


  // A cloud-pruned pine in a small white pot (the dining table): a twisting
  // trunk with flat tiers of needles spreading to either side.
  function cloudPine(x, y, z) {
    cylinder(scene, { at: [x, y, z], r: 0.07, r2: 0.08, h: 0.07, mat: potWhite })
    const t = y + 0.07
    const trunk = [[x, t, z], [x, t + 0.12, z + 0.03], [x + 0.02, t + 0.24, z - 0.02], [x - 0.01, t + 0.36, z + 0.02], [x, t + 0.48, z]]
    let r = 0.022
    for (let i = 1; i < trunk.length; i++) {
      limb(scene, trunk[i - 1], trunk[i], r, r * 0.8, bark)
      r *= 0.8
    }
    // [centre, radii, needle count, trunk point it grows from]
    const pads: [number[], number[], number, number][] = [
      [[x + 0.02, t + 0.2, z - 0.18], [0.1, 0.045, 0.13], 260, 1],
      [[x - 0.02, t + 0.27, z + 0.16], [0.09, 0.045, 0.12], 240, 2],
      [[x + 0.03, t + 0.36, z - 0.11], [0.09, 0.04, 0.1], 200, 3],
      [[x - 0.02, t + 0.43, z + 0.1], [0.08, 0.04, 0.09], 180, 3],
      [[x, t + 0.53, z], [0.08, 0.045, 0.08], 170, 4],
    ]
    for (const [at, , , from] of pads) limb(scene, trunk[from], at, 0.009, 0.004, bark)
    foliage(scene, {
      clusters: pads.map(([at, size, count]) => ({ at, r: size, count: count * 4 })),
      size: 0.02,
      fine: true,
      lumps: 0.03,
      flatBottom: 0.75,
      colors: [0x10220f, 0x264224, 0x5c7a38],
      seed: 77,
      mat: leafMat,
      bounds: [[3.1, t, 3.74], [3.63, t + 0.65, 4.65]],
    })
  }

  // A glass lantern pendant on a cord: warm glass between bronze rims.
  function lantern(x, y, z, h = 0.2) {
    cylinder(scene, { at: [x, y + h, z], r: 0.003, h: H - y - h, mat: blackFrame, seg: 4, cast: false })
    cylinder(scene, { at: [x, y, z], r: 0.042, h, mat: lampGlass, cast: false })
    cylinder(scene, { at: [x, y + h - 0.014, z], r: 0.047, h: 0.018, mat: bronze, cast: false })
    cylinder(scene, { at: [x, y - 0.006, z], r: 0.047, h: 0.012, mat: bronze, cast: false })
  }

  // A round cream vase with a few bare branches of orange berries.
  function vase(x, y, z) {
    sphere(scene, { at: [x, y + 0.07, z], r: 0.07, mat: ceramicWhite, scale: [1, 1.05, 1] })
    cylinder(scene, { at: [x, y + 0.13, z], r: 0.022, r2: 0.018, h: 0.04, mat: ceramicWhite })
    for (const [dx, dy, dz] of [[0.12, 0.32, 0.08], [-0.06, 0.38, -0.04], [0.04, 0.28, -0.14]]) {
      limb(scene, [x, y + 0.15, z], [x + dx, y + 0.15 + dy, z + dz], 0.004, 0.0025, bark)
      for (let k = 0; k < 6; k++) {
        const f = 0.45 + k * 0.1
        sphere(scene, { at: [x + dx * f + (k % 2 ? 0.015 : -0.012), y + 0.15 + dy * f, z + dz * f + ((k % 3) - 1) * 0.012], r: 0.011, mat: berry, detail: 8 })
      }
    }
  }

  // A doorway trim in black around an opening in a wall along x (axis 'z').
  function doorFrame(x0, x1, z0, z1, axis, top = DOOR) {
    if (axis !== 'z') return
    const w = 0.05
    block(scene, [x0, 0, z0 - 0.01], [x0 + w, top, z1 + 0.01], blackFrame)
    block(scene, [x1 - w, 0, z0 - 0.01], [x1, top, z1 + 0.01], blackFrame)
    block(scene, [x0, top - w, z0 - 0.01], [x1, top, z1 + 0.01], blackFrame)
  }

  // Keep the camera inside clear aisles, including through the doorway and
  // around the bedroom bench. This also prevents curve overshoot into props.
  const aisles = [
    [3.12, -1.8, 3.59, 3.18],
    [2.02, 3.0, 3.5, 3.56],
    [2.02, 3.48, 2.3, 5.18],
    [2.02, 5.05, 3.35, 5.52],
    [2.94, 5.45, 3.35, 6.42],
    [2.91, 6.2, 3.32, 8.03],
    [2.43, 7.96, 3.3, 8.08],
    [2.43, 8.04, 2.69, 9.18],
    [2.23, 9.15, 2.75, 9.86],
  ]
  const constrainCamera = (position) => {
    let nearestX = position.x, nearestZ = position.z, distance = Infinity
    for (const [x0, z0, x1, z1] of aisles) {
      const x = Math.max(x0, Math.min(x1, position.x))
      const z = Math.max(z0, Math.min(z1, position.z))
      const d = (x - position.x) ** 2 + (z - position.z) ** 2
      if (d < distance) { distance = d; nearestX = x; nearestZ = z }
      if (d === 0) break
    }
    position.x = nearestX
    position.z = nearestZ
  }
  const batches = kit.batch(scene)
  // `floor` gets planar reflections from the walkthrough (see floorReflection).
  return { spots, mirror, constrainCamera, batches, floor: floorMesh }
}
