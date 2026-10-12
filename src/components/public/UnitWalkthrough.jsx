// src/components/public/UnitWalkthrough.jsx
// A walk through a unit built in 3D from its floor plan (see walkthrough/).
// The section pins to the screen and the scroll walks a camera, at eye level,
// along the unit's route: through the door, past the kitchen, into the living
// room and on to the bedroom and balcony. The floor plan in the corner shows
// where you are and which way you're looking.
//
// three.js and the model load only when the section comes near; the scene
// is drawn only when the scroll moves.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  motion, useScroll, useSpring, useTransform, useMotionValueEvent, useReducedMotion, AnimatePresence,
} from 'framer-motion'
import { ArrowDown, Loader2 } from 'lucide-react'
import { createKit } from './walkthrough/kit'
import { supportsWebGL } from './DepthWalkthrough'

const SCROLL_VH = 1000 // length of the walk, in screen heights
const WALK_FROM = 0.05 // share of the scroll before the walk starts (intro)
const WALK_TO = 0.93 // …and where it ends (outro after)
const EASE = [0.16, 1, 0.3, 1]

const clamp01 = (v) => Math.min(1, Math.max(0, v))

export default function UnitWalkthrough({ unit, skipTo }) {
  const [webgl] = useState(supportsWebGL)
  if (!webgl) return null
  return <Walk unit={unit} skipTo={skipTo} />
}

function Walk({ unit, skipTo }) {
  const reduce = useReducedMotion()
  const sectionRef = useRef(null)
  const mountRef = useRef(null)
  const dotRef = useRef(null)
  const [near, setNear] = useState(false)
  const [status, setStatus] = useState('idle') // loading | ready | failed
  const [captionIndex, setCaptionIndex] = useState(0)

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  const walkRaw = useTransform(scrollYProgress, (p) => clamp01((p - WALK_FROM) / (WALK_TO - WALK_FROM)))
  // A little inertia, so the camera eases like walking rather than jumping with each wheel tick.
  const walk = useSpring(walkRaw, { stiffness: 90, damping: 26, mass: 0.7, restDelta: 0.0001 })
  const introOpacity = useTransform(scrollYProgress, (p) => 1 - clamp01((p - 0.005) / 0.035))
  const hudOpacity = useTransform(scrollYProgress, (p) => Math.min(clamp01((p - 0.03) / 0.03), 1 - clamp01((p - WALK_TO - 0.01) / 0.03)))
  const outroOpacity = useTransform(scrollYProgress, (p) => clamp01((p - WALK_TO) / 0.04))

  // Start loading when the section is about a screen away.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return undefined
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: '100% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Captions sit at the waypoints that carry one; their place in the walk is
  // set once the route's lengths are known (onRoute).
  const [captionAt, setCaptionAt] = useState([])
  const captions = useMemo(() => unit.path.filter((p) => p.caption).map((p) => p.caption), [unit])
  const onRoute = useCallback((ts) => setCaptionAt(ts), [])
  useMotionValueEvent(walk, 'change', (t) => {
    let i = 0
    captionAt.forEach((at, k) => { if (t >= at - 0.005) i = k })
    setCaptionIndex((prev) => (prev === i ? prev : i))
  })

  useEffect(() => {
    if (!near) return undefined
    let stopped = false
    let teardown = () => {}
    setStatus('loading')
    Promise.all([
      import('three'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/lights/RectAreaLightUniformsLib.js'),
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/GTAOPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/loaders/GLTFLoader.js'),
    ])
      .then(async ([THREE, { RoomEnvironment }, { RectAreaLightUniformsLib }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { GTAOPass }, { OutputPass }, { RoundedBoxGeometry }, { GLTFLoader }]) => {
        if (stopped || !mountRef.current) return
        const addons = { RoomEnvironment, RectAreaLightUniformsLib, EffectComposer, RenderPass, UnrealBloomPass, GTAOPass, OutputPass, RoundedBoxGeometry, GLTFLoader }
        teardown = await startScene(THREE, addons, mountRef.current, unit, walk, dotRef, onRoute, () => !stopped)
        if (!stopped) setStatus('ready')
      })
      .catch((err) => {
        console.warn('Unit walkthrough failed to load:', err)
        if (!stopped) setStatus('failed')
      })
    return () => {
      stopped = true
      teardown()
    }
  }, [near, unit, walk, onRoute])

  if (status === 'failed') return null
  const caption = captions[captionIndex] || captions[0]
  const { plan } = unit

  return (
    <section
      ref={sectionRef}
      aria-label={`Walk through ${unit.title}`}
      className="relative bg-[#0b0f17]"
      style={{ height: `${SCROLL_VH}vh` }}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f17]">
            <Loader2 className="w-6 h-6 text-white/60 animate-spin" />
          </div>
        )}
        {/* Legibility shades */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/70 via-black/25 to-transparent pointer-events-none" />

        {/* Intro */}
        <motion.div style={{ opacity: introOpacity }} className="absolute z-20 inset-x-0 top-0 pt-24 md:pt-28 px-6 text-center pointer-events-none">
          <p className="text-[11px] md:text-xs font-bold uppercase tracking-[0.25em] text-white/70">{unit.eyebrow}</p>
          <h2 className="mt-3 text-3xl md:text-6xl font-black text-white tracking-tight leading-[1.05]">Walk through {unit.title}</h2>
          <p className="mt-3 text-sm md:text-base text-white/75">{unit.facts}</p>
        </motion.div>
        <motion.div style={{ opacity: introOpacity }} className="absolute z-20 left-1/2 -translate-x-1/2 bottom-28 md:bottom-10 flex flex-col items-center gap-2 text-white/85 pointer-events-none">
          <span className="text-[11px] font-semibold uppercase tracking-widest">Scroll to step inside</span>
          <motion.span animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
            <ArrowDown size={18} />
          </motion.span>
        </motion.div>

        {/* During the walk */}
        <motion.div style={{ opacity: hudOpacity }} className="absolute z-20 inset-0 pointer-events-none [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
          <div className="absolute left-0 right-0 top-0 px-6 md:px-12 pt-24 md:pt-28 pr-36 md:pr-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{unit.eyebrow}</p>
            <p className="mt-1.5 text-xl md:text-3xl font-bold text-white tracking-tight">{unit.title}</p>
            <p className="text-sm md:text-base text-white/75">{unit.facts}</p>
          </div>

          {/* Floor plan with a "you are here" marker and view cone */}
          <div className="absolute right-4 top-24 md:right-auto md:left-12 md:top-[13.5rem] rounded-lg bg-black/45 backdrop-blur-md p-1.5 md:p-2 shadow-lg ring-1 ring-white/15">
            <p className="hidden md:block px-0.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 [text-shadow:none]">Floor plan</p>
            <div className="relative inline-block align-top">
              <img src={plan.src} alt={`${unit.title} floor plan`} draggable={false} className="block w-auto h-auto max-w-[6.5rem] max-h-[8.5rem] md:max-w-[13rem] md:max-h-[34vh] rounded" />
              <div ref={dotRef} className="absolute w-0 h-0" style={{ left: '0%', top: '0%' }}>
                <span aria-hidden className="absolute -left-[22px] -top-[22px] w-[44px] h-[44px]" style={{ background: 'conic-gradient(from 60deg, rgba(255,255,255,0.55) 0deg 60deg, transparent 60deg)', borderRadius: '50%', maskImage: 'radial-gradient(circle, black 55%, transparent 72%)', WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 72%)' }} data-cone />
                <span aria-hidden className="absolute -left-[6px] -top-[6px] w-3 h-3 rounded-full bg-white ring-2 ring-[#2d568e] shadow" />
              </div>
            </div>
          </div>

          <div className="absolute left-0 right-0 bottom-0 px-6 md:px-12 pb-28 md:pb-12">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={captionIndex}
                initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
                transition={{ duration: 0.5, ease: EASE }}
                className="max-w-xl"
              >
                <h3 className="text-4xl md:text-7xl font-black text-white tracking-tight leading-[1]">{caption?.title}</h3>
                {caption?.note && <p className="mt-2 md:mt-3 text-base md:text-lg text-white/85">{caption.note}</p>}
              </motion.div>
            </AnimatePresence>
            <div className="mt-5 flex gap-1.5">
              {captions.map((c, i) => (
                <span key={c.title} className={`block h-[3px] rounded-full transition-all duration-500 ${i === captionIndex ? 'w-9 bg-white' : i < captionIndex ? 'w-4 bg-white/70' : 'w-4 bg-white/30'}`} />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Outro */}
        <motion.div style={{ opacity: outroOpacity }} className="absolute z-30 inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          <p className="text-[11px] md:text-xs font-bold uppercase tracking-[0.25em] text-white/75">Designed by Iloilo Rentals</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">Your space could be next</h2>
          {skipTo && (
            <a href={skipTo} className="pointer-events-auto mt-7 inline-flex items-center h-12 px-7 rounded-full bg-white text-[#0b0f17] text-sm font-bold shadow-xl hover:bg-white/90 transition-colors">
              Start your project
            </a>
          )}
        </motion.div>
      </div>
    </section>
  )
}

async function startScene(THREE, addons, mount, unit, walk, dotRef, onRoute, alive) {
  const mobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'
  mount.appendChild(renderer.domElement)

  addons.RectAreaLightUniformsLib.init()
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0f17)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new addons.RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.environmentIntensity = 0.15

  const kit = createKit(THREE, renderer, { RoundedBoxGeometry: addons.RoundedBoxGeometry })
  // The unit's photo textures (a plain path is a colour image; { src, data }
  // is a normal or roughness map) and its models, all fetched together.
  const loader = new THREE.TextureLoader()
  const gltf = new addons.GLTFLoader()
  const [tex, models] = await Promise.all([
    Promise.all(Object.entries(unit.textures || {}).map(async ([name, entry]) => {
      const t = await loader.loadAsync(typeof entry === 'string' ? entry : entry.src)
      if (typeof entry === 'string' || !entry.data) t.colorSpace = THREE.SRGBColorSpace
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      kit.track.textures.push(t)
      return [name, t]
    })).then(Object.fromEntries),
    Promise.all(Object.entries(unit.models || {}).map(async ([name, src]) => [name, (await gltf.loadAsync(src)).scene])).then(Object.fromEntries),
  ])
  if (!alive()) { kit.dispose(); renderer.dispose(); renderer.domElement.remove(); return () => {} }
  const built = unit.build(THREE, kit, scene, { tex, models })
  if (mobile) built?.spots?.forEach((s) => { if (s.castShadow) s.shadow.mapSize.set(512, 512) })
  // Reflections: shiny surfaces (floor, steel, lacquer, glass) mirror a
  // capture of the finished room itself, its own lamps and walls, rather
  // than the neutral studio that lights everything else.
  let roomEnv = null
  if (built?.mirror?.length) {
    roomEnv = pmrem.fromScene(scene, 0, 0.05, 60, { position: new THREE.Vector3(...unit.envAt) }).texture
    built.mirror.forEach((m) => {
      m.envMap = roomEnv
      m.envMapIntensity = m.userData.mirror ?? 1
      m.needsUpdate = true
    })
  }

  const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 400)

  // The route: positions and look-at points, walked at an even pace. Turning
  // counts as walking too (TURN metres per radian), so looking around a room
  // gets its share of the scroll instead of flashing past.
  const posCurve = new THREE.CatmullRomCurve3(unit.path.map((p) => new THREE.Vector3(...p.pos)), false, 'centripetal')
  const lookCurve = new THREE.CatmullRomCurve3(unit.path.map((p) => new THREE.Vector3(...p.look)), false, 'centripetal')
  const SAMPLES = 800
  const TURN = 0.9
  const lengths = [0]
  let prev = posCurve.getPoint(0)
  let prevDir = lookCurve.getPoint(0).sub(prev).normalize()
  for (let i = 1; i <= SAMPLES; i++) {
    const p = posCurve.getPoint(i / SAMPLES)
    const dir = lookCurve.getPoint(i / SAMPLES).sub(p).normalize()
    lengths.push(lengths[i - 1] + p.distanceTo(prev) + TURN * dir.angleTo(prevDir))
    prev = p
    prevDir = dir
  }
  const total = lengths[SAMPLES]
  const sAt = (t) => {
    const target = t * total
    let lo = 0, hi = SAMPLES
    while (lo < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] < target) lo = mid + 1; else hi = mid }
    const i = Math.max(1, lo)
    const f = (target - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1])
    return (i - 1 + f) / SAMPLES
  }
  // A caption comes up halfway along the walk to its waypoint, as that part
  // of the unit comes into view.
  const n = unit.path.length
  const lengthAt = (i) => lengths[Math.round((i / (n - 1)) * SAMPLES)]
  onRoute(unit.path.map((p, i) => ({ p, i })).filter(({ p }) => p.caption).map(({ i }) => (i === 0 ? 0 : (lengthAt(i - 1) + lengthAt(i)) / 2) / total))

  // Post-processing: ambient occlusion (desktop), a soft glow on lights.
  const size = new THREE.Vector2()
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: mobile ? 0 : 4, type: THREE.HalfFloatType })
  const composer = new addons.EffectComposer(renderer, target)
  composer.addPass(new addons.RenderPass(scene, camera))
  let gtao = null
  if (!mobile) {
    gtao = new addons.GTAOPass(scene, camera, 1, 1)
    gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.6, thickness: 1.2, scale: 1.1, samples: 12 })
    gtao.blendIntensity = 0.85
    composer.addPass(gtao)
  }
  const bloom = new addons.UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.45, 1.05)
  composer.addPass(bloom)
  composer.addPass(new addons.OutputPass())

  const lookAt = new THREE.Vector3()
  let frame = 0
  function draw() {
    const t = walk.get()
    const s = sAt(t)
    const pos = posCurve.getPoint(s)
    lookCurve.getPoint(s, lookAt)
    camera.position.copy(pos)
    camera.lookAt(lookAt)
    composer.render()
    // "You are here" on the floor plan, turned the way you're looking.
    const dot = dotRef.current
    if (dot) {
      const { plan } = unit
      const fx = plan.x0 + (pos.x / plan.width) * (plan.x1 - plan.x0)
      const fy = plan.y0 + (pos.z / plan.depth) * (plan.y1 - plan.y0)
      dot.style.left = `${fx * 100}%`
      dot.style.top = `${fy * 100}%`
      const angle = (Math.atan2(lookAt.z - pos.z, lookAt.x - pos.x) * 180) / Math.PI
      const cone = dot.querySelector('[data-cone]')
      if (cone) cone.style.transform = `rotate(${angle}deg)`
    }
  }
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; draw() })
  }

  function resize() {
    const w = Math.max(1, mount.clientWidth)
    const h = Math.max(1, mount.clientHeight)
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    renderer.getDrawingBufferSize(size)
    bloom.resolution.set(size.x, size.y)
    camera.aspect = w / h
    // A narrow phone screen gets a taller view so rooms don't feel cramped.
    camera.fov = w / h < 0.8 ? 76 : 64
    camera.updateProjectionMatrix()
    schedule()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(mount)
  resize()
  const unsubscribe = walk.on('change', schedule)
  draw()

  return () => {
    unsubscribe()
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
    kit.dispose()
    roomEnv?.dispose()
    envTexture.dispose()
    pmrem.dispose()
    gtao?.dispose?.()
    bloom.dispose()
    target.dispose()
    composer.dispose?.()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
