// src/components/public/walkthrough/saintHonore9S.js
// Saint Honore Unit 9S (1-bedroom, 36 sqm + 2 sqm balcony), modelled from
// its floor plan: 4.0 m wide, 9.0 m deep, rooms at 2.825 / 2.95 / 3.225 m,
// a 1.0 m balcony. Finishes, furniture and lighting follow the architect's
// renders. Units are metres: x across from the left wall, y up, z from the
// entrance toward the balcony. The photo textures and the money tree are
// CC0 from Poly Haven.

const H = 2.7   // ceiling height
const T = 0.15  // outer wall thickness
const DOOR = 2.1
const DIR = '/tours/saint-honore-9s'

// Where the camera walks (eye level) and what it looks at. A caption marks
// the start of each part of the walk.
const path = [
  { pos: [3.34, 1.6, -1.6], look: [3.0, 1.35, 3.5], caption: { title: 'The entrance', note: 'Stepping in from the corridor' } },
  { pos: [3.36, 1.6, 0.35], look: [2.6, 1.3, 3.5] },
  { pos: [3.6, 1.55, 1.0], look: [1.5, 1.22, 1.08], caption: { title: 'Kitchen', note: 'Full-height cabinets with light beneath' } },
  // Past the fridge and the kitchen wall before turning into the room.
  { pos: [3.35, 1.6, 2.55], look: [2.6, 1.3, 5.5] },
  { pos: [2.7, 1.6, 3.3], look: [0.05, 1.35, 4.25], caption: { title: 'Living room', note: 'A cherry-blossom feature wall behind a low lounge' } },
  { pos: [2.25, 1.58, 3.6], look: [0.05, 1.3, 4.25] },
  // Between the coffee table and the dining table, turning to the TV wall.
  { pos: [2.4, 1.58, 3.85], look: [1.15, 1.2, 5.78], caption: { title: 'Media wall', note: 'The TV wall, framed in the same artwork' } },
  { pos: [3.15, 1.6, 5.1], look: [3.0, 1.4, 7.6], caption: { title: 'Into the bedroom', note: 'Through the black-framed doorway' } },
  { pos: [3.1, 1.6, 6.3], look: [0.05, 1.15, 7.2], caption: { title: 'Bedroom', note: 'Soft light layered around the headboard wall' } },
  { pos: [2.95, 1.58, 7.2], look: [0.05, 1.1, 7.25] },
  { pos: [2.4, 1.6, 8.3], look: [2.3, 1.3, 14], caption: { title: 'Balcony', note: 'Out to the city lights' } },
  { pos: [2.35, 1.6, 9.55], look: [2.1, 1.0, 30] },
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
    blossom: `${DIR}/blossom.jpg`,
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
  },
  models: { pachira: `${DIR}/pachira.glb` },
  // Where the room's own reflections are captured from: mid living room.
  envAt: [2.2, 1.5, 4.3],
  path,
  build,
}

function build(THREE, kit, scene, { tex, models }) {
  const { block, panel, flat, cylinder, sphere, tube, limb, foliage, model, material, surface, glow } = kit
  // Shiny materials reflect a capture of the room itself (UnitWalkthrough
  // makes it once the room is built); `amount` scales the reflection.
  const mirror = []
  const shiny = (m, amount = 1) => {
    m.userData.mirror = amount
    mirror.push(m)
    return m
  }
  const bump = (t, s) => ({ normalMap: t, normalScale: new THREE.Vector2(s, s) })

  // ── Materials ─────────────────────────────────────────────
  // Photo textures go on at real size (the `tile` option, in metres):
  // floorboards 1.7 m, plaster 2–3 m, fabric weaves 0.27 m, veneers 1 m.
  const wall = material({ color: 0xe9e3da, roughness: 0.92, ...bump(tex.stuccoN, 0.3) })
  const W = { tile: 2 }
  const taupe = material({ color: 0x7c736a, roughness: 0.9, ...bump(tex.plasterN, 0.7) })
  const ceiling = material({ color: 0xf2eee8, roughness: 0.96 })
  const floor = shiny(material({ map: tex.floor, roughnessMap: tex.floorR, roughness: 0.9, ...bump(tex.floorN, 0.5), clearcoat: 0.25, clearcoatRoughness: 0.3 }, THREE.MeshPhysicalMaterial), 0.8)
  const walnut = material({ map: tex.walnut, roughnessMap: tex.walnutR, roughness: 0.85 })
  const lacquer = shiny(material({ map: tex.walnut, color: 0x6e6e6e, roughness: 0.45, clearcoat: 0.9, clearcoatRoughness: 0.12 }, THREE.MeshPhysicalMaterial), 0.7)
  const teak = material({ map: tex.teak, roughness: 0.55 })
  const blackFrame = material({ color: 0x171513, roughness: 0.55 })
  const concrete = material({ color: 0xb9b3aa, roughness: 0.95 })
  const sofa = material({ color: 0xebe8e2, roughness: 1, ...bump(tex.linenN, 0.8) })
  const linen = material({ color: 0xf1efea, roughness: 1, ...bump(tex.jerseyN, 0.8) })
  const duvet = material({ color: 0x8b847b, roughness: 1, ...bump(tex.jerseyN, 0.8) })
  const cocoa = material({ color: 0x5b4334, roughness: 1, ...bump(tex.woolN, 0.8) })
  const upholstery = material({ color: 0x8b847f, roughness: 1, ...bump(tex.woolN, 0.7) })
  const wallPanel = material({ color: 0x766d66, roughness: 0.95, ...bump(tex.woolN, 0.6) })
  const rugMat = material({ color: 0xe6dfd2, roughness: 1, ...bump(tex.knitN, 1) })
  const rugBand = material({ color: 0xcdc2b0, roughness: 1, ...bump(tex.knitN, 1) })
  const consoleMat = material({ color: 0x57524e, roughness: 0.62 })
  const screen = shiny(material({ color: 0x050506, roughness: 0.1, metalness: 0.3 }))
  const potWhite = material({ color: 0xe9e6e0, roughness: 0.5 })
  const potDark = material({ color: 0x2b2927, roughness: 0.7, flatShading: true })
  const soil = material({ color: 0x2a2018, roughness: 1 })
  const bark = material({ color: 0x4a3a2c, roughness: 0.9 })
  const steel = shiny(material({ color: 0xa8acaf, metalness: 1, roughness: 0.42, roughnessMap: kit.tex(kit.brushed(), { color: false }), anisotropy: 0.5 }, THREE.MeshPhysicalMaterial), 0.7)
  const hoodSteel = shiny(material({ color: 0x9a9da0, metalness: 1, roughness: 0.3 }), 0.8)
  const chrome = shiny(material({ color: 0xe0e3e6, metalness: 1, roughness: 0.12 }))
  const glass = shiny(material({ color: 0xc8dbe2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }))
  const doorWhite = material({ color: 0xe6e1d9, roughness: 0.5 })
  const curtain = surface(kit.slats({ base: 0x3d3128, count: 9 }), { roughness: 1 })
  const blossomMat = material({ map: tex.blossom, roughness: 0.75 })
  // The bedroom's blossom paper runs wall to wall: the upper middle of the
  // artwork, mirrored side to side so the repeats meet without a seam.
  const blossomWide = tex.blossom.clone()
  blossomWide.wrapS = THREE.MirroredRepeatWrapping
  blossomWide.repeat.set(2.5, 0.37)
  blossomWide.offset.set(0, 0.5)
  blossomWide.needsUpdate = true
  kit.track.textures.push(blossomWide)
  const blossomPaper = material({ map: blossomWide, roughness: 0.8 })
  const shojiTex = kit.tex(kit.shoji({ cols: 4, rows: 3 }))
  const shojiLight = material({ map: shojiTex, emissive: 0xffe3bd, emissiveMap: shojiTex, emissiveIntensity: 1.1, roughness: 1 })
  const shojiScreen = material({ map: kit.tex(kit.shoji({ cols: 3, rows: 6, wood: 0x1d1a17, line: 8 })), roughness: 0.95, transparent: true, opacity: 0.96 })
  const led = glow(0xffd29a, 2.2)
  const bulb = glow(0xfff0d6, 2.6)
  const lampGlass = glow(0xffd8a6, 1.5)
  const bronze = material({ color: 0x6b5233, metalness: 0.8, roughness: 0.4 })
  const corridorTile = material({ color: 0x9a948c, roughness: 0.7 })
  // Kitchen finishes, from the render.
  const lowerFront = material({ color: 0x857d79, roughness: 0.6 })
  const upperFront = material({ color: 0xdcd1cb, roughness: 0.5 })
  const carcass = material({ color: 0x1d1a18, roughness: 0.8 })
  const bulkhead = material({ color: 0x2b2522, roughness: 0.75 })
  const counterTop = shiny(material({ color: 0xcfccc9, roughness: 0.3 }), 0.5)
  const splash = shiny(material({ color: 0xdedbd8, roughness: 0.1 }), 0.6)
  const hobGlass = shiny(material({ map: kit.tex(kit.hob()), roughness: 0.08 }))
  const ceramicWhite = material({ color: 0xece8e2, roughness: 0.35 })
  const ceramicDark = material({ color: 0x1e1c1b, roughness: 0.45 })
  const spoonWood = material({ color: 0x9a7653, roughness: 0.6 })
  const berry = material({ color: 0xd2562a, roughness: 0.5 })

  // ── Shell: floor, ceiling, outer walls ────────────────────
  flat(scene, { x0: -T, z0: -T, x1: 4 + T, z1: 9 + T, y: 0, mat: floor, tile: 1.7, turn: true })
  flat(scene, { x0: -T, z0: -T, x1: 4 + T, z1: 9 + T, y: H, mat: ceiling, down: true })
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
  sphere(scene, { at: [1.3, 1.0, 2.93], r: 0.025, mat: chrome })
  doorFrame(0.7, 1.425, 2.825, 2.925, 'z')
  block(scene, [2.24, 0, 2.825], [2.86, H, 2.925], wall, W)
  kitchen()
  fridge()
  flat(scene, { x0: 2.22, z0: 0.42, x1: 2.8, z1: 1.55, y: 0.008, mat: rugMat, tile: 0.27 }) // mat at the counter

  // ── Living & dining (2.825 → 5.775 m) ─────────────────────
  // Feature wall behind the sofa: taupe, a cherry-blossom panel, a cove above.
  block(scene, [0, 0, 2.93], [0.02, 2.5, 5.77], taupe, { cast: false, tile: 3 })
  panel(scene, { at: [0.035, 1.3, 4.25], size: [1.25, 2.4], facing: '+x', mat: blossomMat })
  block(scene, [0.02, 0.1, 3.6], [0.05, 2.5, 3.625], led, { cast: false })
  block(scene, [0.02, 0.1, 4.875], [0.05, 2.5, 4.9], led, { cast: false })
  block(scene, [0, 2.5, 2.93], [0.3, H, 5.77], ceiling)
  block(scene, [0.29, 2.49, 2.95], [0.3, 2.5, 5.75], led, { cast: false })
  // Sofa: white linen, two seats with tall back cushions, slim arms, on legs.
  const F = { tile: 0.27 }
  block(scene, [0.12, 0.12, 3.3], [0.98, 0.4, 5.2], sofa, { round: 0.04, ...F })
  block(scene, [0.12, 0.4, 3.3], [0.3, 0.74, 5.2], sofa, { round: 0.04, ...F })
  block(scene, [0.12, 0.12, 3.2], [0.98, 0.64, 3.31], sofa, { round: 0.035, ...F })
  block(scene, [0.12, 0.12, 5.19], [0.98, 0.64, 5.3], sofa, { round: 0.035, ...F })
  for (const [z0, z1] of [[3.33, 4.24], [4.26, 5.17]]) {
    block(scene, [0.3, 0.4, z0], [0.97, 0.53, z1], sofa, { round: 0.05, ...F })
    block(scene, [0.3, 0.5, z0 + 0.04], [0.5, 1.0, z1 - 0.04], sofa, { round: 0.07, ...F })
  }
  for (const [x, z] of [[0.18, 3.26], [0.92, 3.26], [0.18, 5.24], [0.92, 5.24]]) cylinder(scene, { at: [x, 0, z], r: 0.012, h: 0.12, mat: chrome, seg: 10 })
  // Rug: cream knit with a soft band near the edge.
  flat(scene, { x0: 0.75, z0: 3.15, x1: 2.55, z1: 5.35, y: 0.006, mat: rugMat, ...F })
  for (const [x0, z0, x1, z1] of [[0.85, 3.25, 2.45, 3.31], [0.85, 5.19, 2.45, 5.25], [0.85, 3.25, 0.91, 5.25], [2.39, 3.25, 2.45, 5.25]]) {
    flat(scene, { x0, z0, x1, z1, y: 0.008, mat: rugBand, ...F })
  }
  // Low coffee table in dark lacquered walnut, legs joined by stretchers.
  block(scene, [1.16, 0.34, 3.6], [1.72, 0.39, 4.9], lacquer, { round: 0.01, tile: 1 })
  block(scene, [1.22, 0.29, 3.68], [1.66, 0.34, 4.82], walnut, { tile: 1 })
  for (const [x, z] of [[1.24, 3.7], [1.64, 3.7], [1.24, 4.8], [1.64, 4.8]]) block(scene, [x - 0.025, 0, z - 0.025], [x + 0.025, 0.29, z + 0.025], walnut, { tile: 1 })
  for (const z of [3.7, 4.8]) block(scene, [1.24, 0.07, z - 0.012], [1.64, 0.1, z + 0.012], walnut, { tile: 1 })
  bonsai(1.44, 0.39, 4.25)
  // Money trees in white pots at either end of the sofa.
  tree(0.32, 3.12, 1.0, { potMat: potWhite })
  tree(0.32, 5.47, 0.95, { potMat: potWhite, turn: 2.2 })
  // Pendants over the coffee table: white globes with dark caps.
  for (const [x, y, z] of [[0.95, 1.95, 4.12], [1.06, 1.72, 4.32], [0.9, 1.6, 3.98]]) {
    cylinder(scene, { at: [x, y + 0.08, z], r: 0.003, h: H - y - 0.08, mat: blackFrame, seg: 4, cast: false })
    sphere(scene, { at: [x, y, z], r: 0.075, mat: bulb, cast: false })
    sphere(scene, { at: [x, y + 0.085, z], r: 0.03, mat: blackFrame })
  }
  // Shoji ceiling light.
  block(scene, [1.45, 2.62, 3.75], [2.55, 2.7, 4.65], teak, { cast: false, tile: 1 })
  flat(scene, { x0: 1.5, z0: 3.8, x1: 2.5, z1: 4.6, y: 2.615, mat: shojiLight, down: true })
  // Dining table for four.
  block(scene, [2.6, 0.72, 3.8], [3.7, 0.76, 4.6], teak, { round: 0.012, tile: 1 })
  for (const [x, z] of [[2.66, 3.86], [3.64, 3.86], [2.66, 4.54], [3.64, 4.54]]) block(scene, [x - 0.025, 0, z - 0.025], [x + 0.025, 0.72, z + 0.025], walnut, { tile: 1 })
  for (const [x, z, back] of [[2.85, 3.47, -1], [3.45, 3.47, -1], [2.85, 4.93, 1], [3.45, 4.93, 1]]) {
    block(scene, [x - 0.21, 0.43, z - 0.2], [x + 0.21, 0.47, z + 0.2], walnut, { tile: 1 })
    block(scene, [x - 0.19, 0, z - 0.18], [x + 0.19, 0.43, z + 0.18], blackFrame, { cast: false })
    block(scene, [x - 0.21, 0.47, z + back * 0.18 - 0.02], [x + 0.21, 0.92, z + back * 0.18 + 0.02], walnut, { tile: 1 })
  }
  cylinder(scene, { at: [3.15, 1.95, 4.2], r: 0.003, h: H - 1.95, mat: blackFrame, seg: 4, cast: false })
  cylinder(scene, { at: [3.15, 1.82, 4.2], r: 0.16, r2: 0.05, h: 0.13, mat: blackFrame })
  sphere(scene, { at: [3.15, 1.84, 4.2], r: 0.05, mat: bulb, cast: false })

  // ── Wall between living room and bedroom (5.775 m) ────────
  block(scene, [0, 0, 5.775], [2.15, H, 5.875], wall, W)
  block(scene, [2.15, 2.2, 5.775], [3.6, H, 5.875], wall, W)
  block(scene, [3.6, 0, 5.775], [4, H, 5.875], wall, W)
  doorFrame(2.15, 3.6, 5.775, 5.875, 'z', 2.2)
  block(scene, [2.18, 0, 5.74], [2.75, 2.18, 5.77], shojiScreen, { cast: false }) // sliding screen, open
  // Media wall: blossom panel lit from both sides between dark trims, the TV,
  // a long floating console with small trees, glass lanterns either side.
  panel(scene, { at: [1.15, 1.3, 5.765], size: [1.25, 2.4], facing: '-z', mat: blossomMat })
  block(scene, [0.5, 0.1, 5.745], [0.525, 2.5, 5.77], led, { cast: false })
  block(scene, [1.775, 0.1, 5.745], [1.8, 2.5, 5.77], led, { cast: false })
  block(scene, [0.47, 0.1, 5.735], [0.5, 2.5, 5.775], blackFrame, { cast: false })
  block(scene, [1.8, 0.1, 5.735], [1.83, 2.5, 5.775], blackFrame, { cast: false })
  block(scene, [0.57, 0.86, 5.7], [1.73, 1.52, 5.74], screen)
  block(scene, [0.3, 0.28, 5.36], [2.05, 0.74, 5.775], consoleMat)
  block(scene, [0.3, 0.655, 5.354], [2.05, 0.667, 5.36], blackFrame, { cast: false }) // handle groove
  block(scene, [1.597, 0.28, 5.354], [1.603, 0.655, 5.36], blackFrame, { cast: false })
  tree(0.42, 5.56, 0.42, { variant: 'b', round: true, y: 0.74 })
  tree(1.92, 5.56, 0.4, { variant: 'b', round: true, y: 0.74, turn: 1.4 })
  for (const [x, y] of [[0.36, 1.75], [0.46, 1.55], [1.94, 1.75], [2.04, 1.55]]) lantern(x, y, 5.6)

  // ── Bedroom (5.775 → 9.0 m) ───────────────────────────────
  // Headboard wall: upholstered vertical panels to 1.72 m, a dark ledge, and
  // the cherry-blossom paper above, wall to wall, under a lit cove.
  for (let z = 5.875; z < 8.99; z += 0.26) {
    block(scene, [0, 0, z + 0.003], [0.045, 1.72, Math.min(9, z + 0.257)], wallPanel, { round: 0.012, ...F })
  }
  block(scene, [0, 1.72, 5.875], [0.07, 1.755, 9], walnut, { tile: 1 })
  panel(scene, { at: [0.004, 2.1275, 7.4375], size: [3.125, 0.745], facing: '+x', mat: blossomPaper })
  block(scene, [0, 2.5, 5.88], [0.3, H, 9], ceiling)
  block(scene, [0.29, 2.49, 5.9], [0.3, 2.5, 8.98], led, { cast: false })
  // Bed: a dark walnut platform on tapered legs, an upholstered headboard,
  // white and cocoa pillows, a grey duvet.
  block(scene, [0.05, 0.28, 6.35], [0.15, 1.32, 8.05], upholstery, { round: 0.03, ...F })
  block(scene, [0.145, 0.3, 7.198], [0.152, 1.3, 7.202], blackFrame, { cast: false }) // seam
  block(scene, [0.1, 0.16, 6.3], [2.25, 0.3, 8.1], walnut, { tile: 1 })
  for (const [x, z] of [[0.28, 6.45], [2.08, 6.45], [0.28, 7.95], [2.08, 7.95]]) limb(scene, [x, 0, z], [x, 0.16, z], 0.022, 0.032, walnut)
  block(scene, [0.16, 0.3, 6.4], [2.1, 0.5, 8.0], linen, { round: 0.05, ...F })
  block(scene, [0.8, 0.48, 6.36], [2.14, 0.57, 8.04], duvet, { round: 0.03, ...F })
  block(scene, [0.76, 0.48, 6.35], [0.88, 0.6, 8.05], duvet, { round: 0.04, ...F })
  for (const [z0, z1] of [[6.5, 7.17], [7.23, 7.9]]) block(scene, [0.18, 0.5, z0], [0.37, 0.88, z1], linen, { round: 0.08, ...F })
  for (const [z0, z1] of [[6.74, 7.17], [7.23, 7.66]]) block(scene, [0.37, 0.5, z0], [0.49, 0.8, z1], cocoa, { round: 0.06, ...F })
  // Teak bench at the foot of the bed, with a vase of berry branches.
  block(scene, [2.32, 0.4, 6.6], [2.74, 0.45, 7.8], teak, { round: 0.008, tile: 1 })
  for (const [x, z] of [[2.38, 6.68], [2.68, 6.68], [2.38, 7.72], [2.68, 7.72]]) limb(scene, [x, 0, z], [x, 0.4, z], 0.018, 0.026, teak)
  vase(2.52, 0.45, 6.92)
  // Floating shelf with a table lamp (balcony side); a money tree on the
  // other side of the bed; clusters of glass lanterns both sides.
  block(scene, [0.02, 0.5, 8.12], [0.44, 0.54, 8.5], walnut, { tile: 1 })
  cylinder(scene, { at: [0.24, 0.54, 8.31], r: 0.05, h: 0.012, mat: bronze })
  cylinder(scene, { at: [0.24, 0.55, 8.31], r: 0.008, h: 0.22, mat: bronze })
  cylinder(scene, { at: [0.24, 0.7, 8.31], r: 0.12, r2: 0.1, h: 0.17, mat: lampGlass, cast: false, open: true })
  tree(0.36, 6.1, 1.15, { potMat: potDark, pot: [0.11, 0.13, 0.3], turn: 0.6 })
  for (const [x, y, z] of [[0.3, 1.32, 8.22], [0.44, 1.5, 8.36], [0.28, 1.66, 8.5], [0.3, 1.32, 6.22], [0.44, 1.5, 6.06], [0.28, 1.66, 5.98]]) lantern(x, y, z)
  // Floating shelf on the partition wall, lit underneath, a few things on it.
  block(scene, [0.95, 0.72, 5.875], [2.1, 0.76, 6.2], walnut, { tile: 1 })
  block(scene, [1.0, 0.712, 6.14], [2.05, 0.72, 6.16], led, { cast: false })
  block(scene, [1.1, 0.76, 5.9], [1.13, 0.98, 6.08], ceramicWhite)
  block(scene, [1.13, 0.76, 5.9], [1.16, 0.96, 6.08], cocoa)
  sphere(scene, { at: [1.55, 0.83, 6.0], r: 0.07, mat: ceramicWhite, scale: [1, 1.1, 1] })
  cylinder(scene, { at: [1.85, 0.76, 6.02], r: 0.04, h: 0.08, mat: ceramicDark })
  // Wardrobe and desk.
  block(scene, [2.86, 0, 8.4], [3.76, 2.4, 9], walnut, { tile: 1 })
  block(scene, [3.305, 0.05, 8.395], [3.315, 2.35, 8.4], blackFrame, { cast: false })
  block(scene, [3.55, 0.72, 6.8], [4, 0.76, 7.6], teak, { tile: 1 })
  block(scene, [3.97, 0.95, 6.9], [3.99, 1.75, 7.5], screen, { cast: false }) // mirror
  // Shoji ceiling light.
  block(scene, [0.9, 2.62, 6.75], [2.0, 2.7, 7.65], teak, { cast: false, tile: 1 })
  flat(scene, { x0: 0.95, z0: 6.8, x1: 1.95, z1: 7.6, y: 2.615, mat: shojiLight, down: true })
  // Curtains either side of the balcony doors.
  panel(scene, { at: [1.0, 1.25, 8.93], size: [0.45, 2.5], facing: '-z', mat: curtain, cast: true })
  panel(scene, { at: [3.0, 1.25, 8.93], size: [0.45, 2.5], facing: '-z', mat: curtain, cast: true })

  // ── Balcony and the view ──────────────────────────────────
  block(scene, [1.0, -0.2, 9.15], [3.1, 0, 10.15], concrete)
  block(scene, [0.9, 0, 9.15], [1.0, H, 10.15], wall, W)
  block(scene, [3.1, 0, 9.15], [3.2, H, 10.15], wall, W)
  block(scene, [1.0, 0, 10.1], [3.1, 1.08, 10.12], glass, { cast: false })
  block(scene, [1.0, 1.08, 10.08], [3.1, 1.12, 10.14], blackFrame)
  block(scene, [1.0, 2.6, 9.15], [3.1, 2.75, 10.15], concrete)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 horizon = vec3(0.96, 0.62, 0.42), mid = vec3(0.36, 0.42, 0.62), top = vec3(0.07, 0.1, 0.2);
        vec3 c = h < 0.12 ? mix(horizon * 0.7, horizon, smoothstep(-0.2, 0.12, h)) : mix(mix(horizon, mid, smoothstep(0.12, 0.35, h)), top, smoothstep(0.35, 0.9, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
    }),
  )
  sky.position.set(2, 0, 9)
  scene.add(sky)
  kit.track.geometries.push(sky.geometry)
  kit.track.materials.push(sky.material)
  // Haze the same colour as the sky just below the horizon, so the city
  // fades into it and the far edge of the ground never shows.
  scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.78, 0.5, 0.34), 45, 380)
  city()

  // ── Corridor outside the front door ───────────────────────
  block(scene, [2.4, -0.01, -3], [4.4, 0, -T], corridorTile, { cast: false })
  block(scene, [2.3, 0, -3], [2.4, H, -T], wall, W)
  block(scene, [4.4, 0, -3], [4.5, H, -T], wall, W)
  block(scene, [2.3, H, -3], [4.5, H + 0.05, -T], ceiling)

  // ── Lights ────────────────────────────────────────────────
  const L = 0.2 // overall brightness of the lamps (one dial for all of them)
  scene.add(new THREE.HemisphereLight(0xf2e6d6, 0x2a2119, 0.3))
  const spots = []
  function spot(from, to, color, intensity, shadow = false, angle = 0.62) {
    const s = new THREE.SpotLight(color, intensity * L, 7, angle, 0.85, 2)
    s.position.set(...from)
    s.target.position.set(...to)
    scene.add(s, s.target)
    if (shadow) {
      s.castShadow = true
      s.shadow.mapSize.set(1024, 1024)
      s.shadow.bias = -0.0004
      s.shadow.normalBias = 0.02
    }
    spots.push(s)
    // A small downlight fitting in the ceiling.
    cylinder(scene, { at: [from[0], H - 0.005, from[2]], r: 0.04, h: 0.005, mat: bulb, cast: false })
    return s
  }
  spot([0.55, 2.62, 4.25], [0.0, 1.1, 4.25], 0xffd09a, 26, true)
  spot([1.15, 2.62, 5.35], [1.15, 1.1, 5.775], 0xffd09a, 18)
  spot([0.5, 2.62, 7.2], [0.0, 1.0, 7.2], 0xffd09a, 22, true)
  // Kitchen: downlights washing the upper doors, as in the render.
  spot([2.2, 2.62, 0.45], [1.9, 1.5, 0.45], 0xfff0dc, 13, true, 0.5)
  spot([2.2, 2.62, 1.5], [1.9, 1.5, 1.5], 0xfff0dc, 13, false, 0.5)
  spot([3.2, 2.62, 0.6], [3.2, 0, 0.9], 0xfff0dc, 10)
  spot([3.0, 2.62, 4.2], [3.0, 0.7, 4.2], 0xffe2bd, 12)
  function point(at, color, intensity, distance = 5) {
    const p = new THREE.PointLight(color, intensity * L, distance, 2)
    p.position.set(...at)
    scene.add(p)
    return p
  }
  point([1.0, 1.8, 4.15], 0xffcf9a, 5)
  point([3.15, 1.75, 4.2], 0xffd4a3, 3)
  point([0.4, 1.7, 5.6], 0xffcf9a, 1.2, 2.5)
  point([2.0, 1.7, 5.6], 0xffcf9a, 1.2, 2.5)
  point([0.24, 0.78, 8.31], 0xffc98f, 2, 3) // bedside lamp
  point([0.4, 1.5, 6.1], 0xffcf9a, 1, 2.5) // lantern clusters
  point([0.4, 1.5, 8.36], 0xffcf9a, 1, 2.5)
  point([2.0, 2.2, 1.3], 0xfff0dc, 3, 6)
  point([2.0, 2.3, 4.3], 0xffe2bd, 5, 7)
  point([1.6, 2.3, 7.3], 0xffe2bd, 4, 6)
  point([3.4, 2.4, -1.5], 0xfff0dc, 3, 5)
  for (const [x, z] of [[2.0, 4.2], [1.45, 7.2]]) {
    const a = new THREE.RectAreaLight(0xffe4c0, 6 * L, 1.0, 0.8)
    a.position.set(x, 2.6, z)
    a.lookAt(x, 0, z)
    scene.add(a)
  }
  // Under-cabinet strip: a long thin light facing down onto the worktop.
  const under = new THREE.RectAreaLight(0xffd6a0, 50 * L, 0.06, 1.9)
  under.position.set(1.82, 1.54, 0.99)
  under.rotation.x = -Math.PI / 2
  scene.add(under)
  const dusk = new THREE.RectAreaLight(0x8ea4d8, 4 * L, 1.6, 2.3)
  dusk.position.set(1.99, 1.2, 9.2)
  dusk.lookAt(1.99, 1.2, 0)
  scene.add(dusk)

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
    const lower = (z0, z1, y0, y1) => block(scene, [FRONT, y0, z0 + 0.002], [FRONT + 0.018, y1, z1 - 0.002], lowerFront)
    lower(1.65, Z1, 0.1, 0.82) // two doors under the sink
    lower(1.32, 1.65, 0.1, 0.82)
    lower(0.66, 1.32, 0.64, 0.82) // three drawers
    lower(0.66, 1.32, 0.45, 0.62)
    lower(0.66, 1.32, 0.1, 0.43)
    lower(0.33, 0.66, 0.1, 0.82) // two doors under the hob
    lower(0, 0.33, 0.1, 0.82)
    // Worktop around an undermount sink; a low glass splash with a dark edge.
    const top = (x0, z0, x1, z1) => block(scene, [x0, 0.86, z0], [x1, 0.9, z1], counterTop)
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
    const upper = (z0, z1, y0) => block(scene, [UF, y0, z0 + 0.002], [UF + 0.018, 2.418, z1 - 0.002], upperFront)
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
      clusters: [{ at: [x, y + 0.3, z], r: [0.13, 0.1, 0.13], count: 170 }, { at: [x + 0.03, y + 0.38, z - 0.03], r: [0.08, 0.06, 0.08], count: 70 }],
      size: 0.05,
      colors: [0x1b2c18, 0x3d5530],
      seed: 41,
    })
  }

  // A potted money tree (the model) standing on y: `round` gives it a dark
  // faceted bowl, otherwise a straight pot of [bottom radius, top radius,
  // height]. `height` is the tree's own height above the soil.
  function tree(x, z, height, { variant = 'a', potMat = potDark, pot = [0.12, 0.15, 0.3], round = false, y = 0, turn = 0 } = {}) {
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
    if (!models.pachira) return
    model(scene, models.pachira, { nodes: [`pachira_aquatica_01_bark_${variant}`, `pachira_aquatica_01_leaves_${variant}`], at: [x, soilAt, z], height, turn })
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
        { at: [x - 0.02, t + 0.24, z + 0.03], r: [0.08, 0.035, 0.09], count: 150 },
        { at: [x - 0.03, t + 0.15, z + 0.27], r: [0.07, 0.03, 0.09], count: 120 },
        { at: [x + 0.02, t + 0.22, z - 0.12], r: [0.06, 0.03, 0.06], count: 80 },
      ],
      size: 0.024,
      colors: [0x1c301d, 0x3e5a30],
      seed: 5,
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

  // The city nine floors down: blocks of low and mid-rise buildings with the
  // odd tower, streets lined with lamps. Every building goes into one mesh
  // (facades and roofs) so the whole city costs a few draw calls.
  function city() {
    const GROUND = -26
    const CELL = 70 // a city block plus its street
    const ROAD = 14
    const rand = (() => { let s = 99; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })()
    flat(scene, { x0: -440, z0: 10, x1: 440, z1: 420, y: GROUND, mat: material({ color: 0x17140f, roughness: 1 }) })

    const pos = [], nrm = [], uv = [], col = [], sides = [], roofs = []
    function building(x, z, w, d, h) {
      const g = new THREE.BoxGeometry(w, h, d)
      const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv
      const base = pos.length / 3
      const du = Math.floor(rand() * 16) / 16
      const dv = Math.floor(rand() * 10) / 10
      const tone = 0.7 + rand() * 0.6
      for (let i = 0; i < p.count; i++) {
        const face = Math.floor(i / 4) // +x, −x, top, bottom, +z, −z
        const across = face < 2 ? d : w
        pos.push(p.getX(i) + x, p.getY(i) + GROUND + h / 2, p.getZ(i) + z)
        nrm.push(n.getX(i), n.getY(i), n.getZ(i))
        uv.push(t.getX(i) * across / 32 + du, t.getY(i) * h / 32 + dv)
        col.push(tone, tone, tone)
      }
      for (const k of g.index.array) {
        const face = Math.floor(k / 4)
        if (face === 2 || face === 3) roofs.push(base + k)
        else sides.push(base + k)
      }
      g.dispose()
    }
    // Fill each block with one to four buildings; nearer blocks stay lower so
    // the view opens out over the city.
    for (let cx = -420; cx < 420; cx += CELL) {
      for (let cz = 30; cz < 400; cz += CELL) {
        const lot = CELL - ROAD
        const split = rand() < 0.6 ? 2 : 1
        for (let a = 0; a < split; a++) {
          for (let b = 0; b < split; b++) {
            if (rand() < 0.15) continue // an empty lot
            const size = lot / split
            const w = size * (0.6 + rand() * 0.35)
            const d = size * (0.6 + rand() * 0.35)
            const r = rand()
            let h = r < 0.6 ? 6 + rand() * 12 : r < 0.9 ? 18 + rand() * 22 : 40 + rand() * 40
            if (cz < 120) h = Math.min(h, 24)
            const x = cx + ROAD / 2 + size * a + size / 2
            const z = cz + ROAD / 2 + size * b + size / 2
            building(x, z, w, d, h)
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex([...sides, ...roofs])
    geo.addGroup(0, sides.length, 0)
    geo.addGroup(sides.length, roofs.length, 1)
    kit.track.geometries.push(geo)
    const windowTex = kit.tex(kit.windows())
    const facade = material({ color: 0x0c0d10, vertexColors: true, emissive: 0xffffff, emissiveMap: windowTex, emissiveIntensity: 0.9, roughness: 0.85 })
    const roof = material({ color: 0x2a2724, vertexColors: true, roughness: 1 })
    scene.add(new THREE.Mesh(geo, [facade, roof]))

    // Street lamps along every street, both sides.
    const lampAt = []
    for (let x = -420; x <= 420; x += CELL) {
      for (let z = 20; z < 400; z += 22) lampAt.push([x + 2, z], [x + ROAD - 2, z])
    }
    for (let z = 30; z <= 400; z += CELL) {
      for (let x = -420; x < 420; x += 22) lampAt.push([x, z + 2], [x, z + ROAD - 2])
    }
    const lampGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7)
    kit.track.geometries.push(lampGeo)
    const lamps = new THREE.InstancedMesh(lampGeo, glow(0xffb468, 6), lampAt.length)
    const dummy = new THREE.Object3D()
    lampAt.forEach(([x, z], i) => {
      dummy.position.set(x, GROUND + 6, z)
      dummy.updateMatrix()
      lamps.setMatrixAt(i, dummy.matrix)
    })
    scene.add(lamps)
  }

  // A doorway trim in black around an opening in a wall along x (axis 'z').
  function doorFrame(x0, x1, z0, z1, axis, top = DOOR) {
    if (axis !== 'z') return
    const w = 0.05
    block(scene, [x0, 0, z0 - 0.01], [x0 + w, top, z1 + 0.01], blackFrame)
    block(scene, [x1 - w, 0, z0 - 0.01], [x1, top, z1 + 0.01], blackFrame)
    block(scene, [x0, top - w, z0 - 0.01], [x1, top, z1 + 0.01], blackFrame)
  }

  return { spots, mirror }
}
