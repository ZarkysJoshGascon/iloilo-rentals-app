// src/features/public/DepthWalkthrough.tsx
// The project tour's rooms in 3D. Each photo is rebuilt as a surface from its
// depth map (white = near, made with a depth-estimation model when the photo
// is added), and a camera walks into it as you scroll: near furniture slides
// past faster than the back wall, so it feels like stepping into the room
// rather than zooming a picture. The next room fades in over the last, as
// you pass through the doorway.
//
// three.js loads only when the tour is shown. A room without a depth map is a
// flat surface that still gets the camera move. If WebGL isn't available,
// onFail lets the tour fall back to its plain photos.

import { useEffect, useRef } from 'react'
import type { Texture } from 'three'

// The photos' own horizontal field of view: interior renders and wide-angle
// photos are usually around 70°.
const PHOTO_HFOV = 70
// How far away (in scene units) the nearest and farthest points of a photo are.
const NEAR = 1
const FAR = 4.5
// The view is a little narrower than the photo, so a turn never shows its edge.
const VIEW_ZOOM = 0.84
// A photo much narrower than the screen (e.g. a square house render on a wide
// monitor) is shown at full height instead of being cropped to fill it, with
// a blurred, darkened copy of itself filling the sides.
const FIT_BELOW = 0.8 // photo aspect ÷ screen aspect
const FIT_ZOOM = 0.92 // share of the photo's height in view when fitted
// Grid of the rebuilt surface (more = smoother edges, more work).
const SEG_X = 180
const SEG_Y = 120
// While leaving a room, the camera keeps walking this much further in.
const PUSH_Z = 0.22

const DEG = Math.PI / 180

// Camera moves, from → to: x / y sideways and up, z forward (negative),
// yaw / pitch in degrees (positive yaw looks left, positive pitch looks up).
export const MOVES = {
  enter:     { from: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },          to: { x: 0, y: -0.03, z: -0.5, yaw: 0, pitch: 0 } },
  lookRight: { from: { x: 0.05, y: 0, z: 0, yaw: 4, pitch: 0 },       to: { x: -0.05, y: 0, z: -0.32, yaw: -4, pitch: 0 } },
  closer:    { from: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },          to: { x: 0.05, y: -0.02, z: -0.6, yaw: -1, pitch: 0 } },
  lookLeft:  { from: { x: -0.05, y: 0, z: 0, yaw: -4, pitch: 0 },     to: { x: 0.05, y: 0, z: -0.32, yaw: 4, pitch: 0 } },
  lookUp:    { from: { x: 0, y: -0.03, z: -0.05, yaw: 0, pitch: -3 }, to: { x: 0, y: 0.03, z: -0.35, yaw: 0, pitch: 3 } },
}

const VERTEX = /* glsl */ `
  uniform sampler2D depthMap;
  uniform float hasDepth;
  uniform vec2 tanHalf;
  uniform float nearD;
  uniform float farD;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Depth maps hold inverse depth (white = near); without one the room is flat.
    float d = hasDepth > 0.5 ? texture2D(depthMap, uv).r : 0.45;
    float z = 1.0 / mix(1.0 / farD, 1.0 / nearD, d);
    vec3 p = vec3((uv.x * 2.0 - 1.0) * tanHalf.x * z, (uv.y * 2.0 - 1.0) * tanHalf.y * z, -z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    // Soft edges, so a fitted photo blends into its blurred surround.
    float edge = smoothstep(0.0, 0.035, vUv.x) * smoothstep(1.0, 0.965, vUv.x)
               * smoothstep(0.0, 0.035, vUv.y) * smoothstep(1.0, 0.965, vUv.y);
    gl_FragColor = vec4(texture2D(map, vUv).rgb, opacity * edge);
  }
`

// Behind each room: its photo stretched to cover the screen, heavily blurred
// (a low mipmap level) and darkened. Only seen beside a fitted photo.
const BACKDROP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`
const BACKDROP_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float opacity;
  uniform vec2 coverScale;
  varying vec2 vUv;
  void main() {
    vec2 uv = (vUv - 0.5) * coverScale + 0.5;
    gl_FragColor = vec4(texture2D(map, uv, 6.0).rgb * 0.42, opacity);
  }
`

function clamp01(v) { return Math.min(1, Math.max(0, v)) }
function mapRange(v, [a, b], [c, d]) {
  const t = b === a ? 1 : clamp01((v - a) / (b - a))
  return c + (d - c) * t
}
const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2
const lerp = (a, b, t) => a + (b - a) * t

/** Can this browser draw WebGL at all? */
export function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

type DepthWalkthroughProps = {
  rooms: any
  walk: any
  pass: number
  onFail: () => void
}

/**
 * rooms  [{ id, src, depth?, move }] in walk order (move is a key of MOVES)
 * walk   motion value, 0 → 1 across the rooms
 * pass   share of a room's span spent fading in over the room before
 */
export default function DepthWalkthrough({ rooms, walk, pass, onFail }: DepthWalkthroughProps) {
  const mountRef = useRef(null)

  useEffect(() => {
    let stopped = false
    let teardown = () => {}
    import('three')
      .then((THREE) => {
        if (stopped || !mountRef.current) return
        try {
          teardown = startScene(THREE, mountRef.current, rooms, walk, pass)
        } catch (err) {
          console.warn('3D walkthrough unavailable:', err)
          onFail?.()
        }
      })
      .catch((err) => {
        console.warn('3D walkthrough failed to load:', err)
        onFail?.()
      })
    return () => {
      stopped = true
      teardown()
    }
  }, [rooms, walk, pass, onFail])

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />
}

function startScene(THREE, mount, rooms, walk, pass) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.setClearColor(0x000000, 1)
  renderer.autoClear = false
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.display = 'block'
  mount.appendChild(renderer.domElement)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
  camera.rotation.order = 'YXZ'
  const geometry = new THREE.PlaneGeometry(1, 1, SEG_X, SEG_Y)
  const backdropGeometry = new THREE.PlaneGeometry(2, 2)
  const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  const total = rooms.length
  const span = 1 / total
  const slots = new Array(total).fill(null)
  let frame = 0
  let width = 1
  let height = 1

  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      draw()
    })
  }

  function loadRoom(i) {
    if (i < 0 || i >= total || slots[i]) return
    const room = rooms[i]
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      uniforms: {
        map: { value: null },
        depthMap: { value: null },
        hasDepth: { value: 0 },
        tanHalf: { value: new THREE.Vector2(1, 1) },
        nearD: { value: NEAR },
        farD: { value: FAR },
        opacity: { value: 1 },
      },
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(mesh)
    const backdropMaterial = new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERTEX,
      fragmentShader: BACKDROP_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        map: { value: null },
        opacity: { value: 1 },
        coverScale: { value: new THREE.Vector2(1, 1) },
      },
    })
    const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial)
    backdrop.frustumCulled = false
    const backdropScene = new THREE.Scene()
    backdropScene.add(backdrop)
    const slot = { scene, material, backdropScene, backdropMaterial, ready: false, aspect: 1, textures: [] }
    slots[i] = slot

    const photo = new Promise<Texture<HTMLImageElement>>((resolve, reject) => loader.load(room.src, resolve, undefined, reject))
    const depth = room.depth
      ? new Promise<Texture<HTMLImageElement> | null>((resolve) => loader.load(room.depth, resolve, undefined, () => resolve(null)))
      : Promise.resolve(null)

    Promise.all([photo, depth])
      .then(([map, depthMap]) => {
        if (slots[i] !== slot) { map.dispose(); depthMap?.dispose(); return }
        map.colorSpace = THREE.NoColorSpace
        map.anisotropy = maxAniso
        map.needsUpdate = true
        material.uniforms.map.value = map
        backdropMaterial.uniforms.map.value = map
        slot.textures.push(map)
        if (depthMap) {
          depthMap.colorSpace = THREE.NoColorSpace
          depthMap.generateMipmaps = false
          depthMap.minFilter = THREE.LinearFilter
          depthMap.magFilter = THREE.LinearFilter
          depthMap.needsUpdate = true
          material.uniforms.depthMap.value = depthMap
          material.uniforms.hasDepth.value = 1
          slot.textures.push(depthMap)
        }
        slot.aspect = map.image.width / map.image.height
        const tx = Math.tan((PHOTO_HFOV / 2) * DEG)
        material.uniforms.tanHalf.value.set(tx, tx / slot.aspect)
        slot.ready = true
        schedule()
      })
      .catch((err) => console.warn('Tour photo failed to load:', room.src, err))
  }

  // Where the camera is in room i at this point of the walk.
  function pose(i, w) {
    const start = i * span
    const end = start + span
    const passStart = start - span * pass
    const last = i === total - 1
    const move = MOVES[rooms[i].move] || MOVES.enter
    const t = easeInOut(clamp01((w - Math.max(0, passStart)) / ((last ? 1 : end) - Math.max(0, passStart))))
    const push = last ? 0 : easeInOut(clamp01((w - (end - span * pass)) / (span * pass)))
    return {
      t,
      x: lerp(move.from.x, move.to.x, t),
      y: lerp(move.from.y, move.to.y, t),
      z: lerp(move.from.z, move.to.z, t) - push * PUSH_Z,
      yaw: lerp(move.from.yaw, move.to.yaw, t),
      pitch: lerp(move.from.pitch, move.to.pitch, t),
    }
  }

  const opacityOf = (i, w) => (i === 0 ? 1 : mapRange(w, [i * span - span * pass, i * span], [0, 1]))

  function renderRoom(i, w, opacity) {
    const slot = slots[i]
    if (!slot?.ready) return
    const p = pose(i, w)
    const canvasAspect = width / height
    const tx = Math.tan((PHOTO_HFOV / 2) * DEG)
    const ty = tx / slot.aspect
    // Usually fill the screen like object-fit: cover, a little inside the
    // photo. A photo much narrower than the screen is fitted to its height
    // instead, with the blurred backdrop beside it.
    const fit = slot.aspect < canvasAspect * FIT_BELOW
    const viewTanY = fit ? ty * FIT_ZOOM : (Math.min(tx, ty * canvasAspect) * VIEW_ZOOM) / canvasAspect
    const viewTanX = viewTanY * canvasAspect
    // A tall screen sees only a slice of a wide room: turn across it as you
    // walk (alternating direction room to room), as far as the photo allows.
    const spareDeg = fit ? 0 : (Math.atan(tx) - Math.atan(viewTanX)) / DEG
    const sweep = Math.max(0, spareDeg - 6) * 0.75
    const yaw = p.yaw + sweep * (1 - 2 * p.t) * (i % 2 === 0 ? 1 : -1)
    camera.aspect = canvasAspect
    camera.fov = 2 * Math.atan(viewTanY) / DEG
    camera.updateProjectionMatrix()
    camera.position.set(p.x, p.y, p.z)
    camera.rotation.set(p.pitch * DEG, yaw * DEG, 0)

    const cover = slot.backdropMaterial.uniforms.coverScale.value
    if (slot.aspect > canvasAspect) cover.set(canvasAspect / slot.aspect, 1)
    else cover.set(1, slot.aspect / canvasAspect)
    slot.backdropMaterial.uniforms.opacity.value = opacity
    slot.material.uniforms.opacity.value = opacity
    renderer.clearDepth()
    renderer.render(slot.backdropScene, screenCamera)
    renderer.render(slot.scene, camera)
  }

  function draw() {
    const w = walk.get()
    // The room you're in is the last one fully faded in; the next may be fading in over it.
    let base = 0
    for (let i = total - 1; i >= 0; i--) {
      if (opacityOf(i, w) >= 1) { base = i; break }
    }
    for (let i = base - 1; i <= base + 2; i++) loadRoom(i)
    renderer.clear()
    renderRoom(base, w, 1)
    const next = base + 1
    if (next < total) {
      const o = opacityOf(next, w)
      if (o > 0.001) renderRoom(next, w, o)
    }
  }

  const resize = () => {
    width = Math.max(1, mount.clientWidth)
    height = Math.max(1, mount.clientHeight)
    renderer.setSize(width, height, false)
    schedule()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(mount)
  resize()
  loadRoom(0)
  loadRoom(1)
  const unsubscribe = walk.on('change', schedule)

  return () => {
    unsubscribe()
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
    for (const slot of slots) {
      if (!slot) continue
      slot.textures.forEach((t) => t.dispose())
      slot.material.dispose()
      slot.backdropMaterial.dispose()
    }
    geometry.dispose()
    backdropGeometry.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
