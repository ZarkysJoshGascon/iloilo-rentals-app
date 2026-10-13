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
  motion, useScroll, useSpring, useTransform, useMotionValue, useMotionValueEvent, useReducedMotion, AnimatePresence,
} from 'framer-motion'
import { ArrowDown, ArrowRight, Check, Loader2, RotateCcw } from 'lucide-react'
import { createKit } from './walkthrough/kit'
import { supportsWebGL } from './DepthWalkthrough'

const SCROLL_VH = 1000 // length of the walk, in screen heights
const WALK_FROM = 0.05 // share of the scroll before the walk starts (intro)
const WALK_TO = 0.93 // …and where it ends (outro after)
const EASE = [0.16, 1, 0.3, 1]

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const INITIAL_LOAD = { progress: 0, stage: 'engine', detail: 'Preparing your tour' }
const LOAD_STAGES = [
  { key: 'assets', title: 'Photo textures' },
  { key: 'build', title: 'Furniture & rooms' },
  { key: 'lighting', title: 'Lighting & reflections' },
  { key: 'compile', title: 'Finishing your walkthrough' },
]

function LoadingView({ unit, loading, failed, onRetry, skipTo }) {
  const active = LOAD_STAGES.findIndex(({ key }) => key === loading.stage)
  return (
    <div className="absolute z-40 inset-0 flex items-center justify-center bg-[#0b0f17] px-6 pt-20 pb-24 md:pb-12">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(156,132,94,0.18),transparent_60%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.035] p-7 md:p-9 shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#d5c5ab]">Step inside</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">{failed ? 'Your tour needs a moment' : 'Loading your walkthrough'}</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/60">{failed ? 'We couldn’t open the walkthrough. Try again, or continue exploring our design service below.' : `Bringing ${unit.title} to life, with its textures, furniture and warm lighting.`}</p>
        {!failed && (
          <>
            <div className="mt-7 flex items-center justify-between gap-4 text-xs text-white/70">
              <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin text-[#d5c5ab]" aria-hidden />{loading.detail}</span>
              <span aria-hidden className="tabular-nums">{Math.round(loading.progress * 100)}%</span>
            </div>
            <div role="progressbar" aria-label="Walkthrough loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(loading.progress * 100)} aria-valuetext={loading.detail} className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#d5c5ab] transition-[width] duration-500" style={{ width: `${Math.max(3, loading.progress * 100)}%` }} />
            </div>
            <ul className="mt-6 space-y-3">
              {LOAD_STAGES.map(({ key, title }, index) => (
                <li key={key} className={`flex items-center gap-3 text-xs ${index <= active ? 'text-white/80' : 'text-white/35'}`}>
                  <span aria-hidden className={`flex h-4 w-4 items-center justify-center rounded-full border ${index < active ? 'border-[#d5c5ab] bg-[#d5c5ab] text-[#0b0f17]' : 'border-white/20'}`}>
                    {index < active ? <Check size={10} /> : index === active ? <span className="h-1 w-1 rounded-full bg-[#d5c5ab]" /> : null}
                  </span>
                  {title}
                </li>
              ))}
            </ul>
            <p className="mt-7 text-[11px] leading-relaxed text-white/40">Your tour will open as soon as it’s ready. You can continue down the page while it loads.</p>
          </>
        )}
        {failed && (
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-full bg-[#d5c5ab] px-5 py-3 text-sm font-semibold text-[#0b0f17] transition-colors hover:bg-[#eee1cc] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><RotateCcw size={15} aria-hidden />Try again</button>
            {skipTo && <a href={skipTo} className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">Start your project<ArrowRight size={14} aria-hidden /></a>}
          </div>
        )}
        <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{failed ? 'The walkthrough could not load. You can try again.' : `${loading.detail}.`}</span>
      </div>
    </div>
  )
}

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
  const [loading, setLoading] = useState(INITIAL_LOAD)
  const [attempt, setAttempt] = useState(0)
  const readyRef = useRef(false)
  const [captionIndex, setCaptionIndex] = useState(0)

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  const walkRaw = useMotionValue(0)
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (readyRef.current) walkRaw.set(clamp01((p - WALK_FROM) / (WALK_TO - WALK_FROM)))
  })
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
    const controller = new AbortController()
    let teardown = () => {}
    const resetVisibleSection = () => {
      const rect = sectionRef.current?.getBoundingClientRect()
      if (rect && rect.top <= 0 && rect.bottom > 0) window.scrollTo({ top: window.scrollY + rect.top, behavior: 'instant' })
    }
    readyRef.current = false
    walkRaw.set(0)
    walk.jump(0)
    setStatus('loading')
    setLoading({ progress: 0.04, stage: 'engine', detail: 'Preparing your tour' })
    Promise.all([
      import('three'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/lights/RectAreaLightUniformsLib.js'),
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/loaders/GLTFLoader.js'),
    ])
      .then(async ([THREE, { RoomEnvironment }, { RectAreaLightUniformsLib }, { RoundedBoxGeometry }, { GLTFLoader }]) => {
        if (controller.signal.aborted || !mountRef.current) return
        const addons = { RoomEnvironment, RectAreaLightUniformsLib, RoundedBoxGeometry, GLTFLoader }
        await startScene(THREE, addons, mountRef.current, unit, walk, dotRef, onRoute, {
          signal: controller.signal,
          onCleanup: (cleanup) => { teardown = cleanup },
          onProgress: (next) => { if (!controller.signal.aborted) setLoading(next) },
          onError: () => {
            if (controller.signal.aborted) return
            resetVisibleSection()
            controller.abort()
            teardown()
            readyRef.current = false
            setStatus('failed')
          },
        })
        if (controller.signal.aborted) return
        // Loading occupies one screen, so the rest of the page stays usable.
        // Begin at the entrance only when the visitor is still at the loader.
        resetVisibleSection()
        readyRef.current = true
        setStatus('ready')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        console.warn('Unit walkthrough failed to load:', err)
        controller.abort()
        teardown()
        readyRef.current = false
        setStatus('failed')
      })
    return () => {
      controller.abort()
      readyRef.current = false
      teardown()
    }
  }, [near, unit, walk, walkRaw, onRoute, attempt])

  const caption = captions[captionIndex] || captions[0]
  const { plan } = unit

  return (
    <section
      ref={sectionRef}
      aria-label={`Walk through ${unit.title}`}
      aria-busy={status === 'idle' || status === 'loading'}
      className="relative bg-[#0b0f17]"
      style={{ height: status === 'ready' ? `${SCROLL_VH}vh` : '100svh' }}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />
        {status !== 'ready' && <LoadingView unit={unit} loading={loading} failed={status === 'failed'} onRetry={() => setAttempt((value) => value + 1)} skipTo={skipTo} />}
        {status === 'ready' && <>
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
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
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
        </>}
      </div>
    </section>
  )
}

// Yield to the browser between costly preparation steps, with cancellation
// even if a visitor leaves the page before the next animation frame.
function nextPaint(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Walkthrough cancelled', 'AbortError')); return }
    const cancel = () => {
      cancelAnimationFrame(id)
      reject(new DOMException('Walkthrough cancelled', 'AbortError'))
    }
    const id = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    })
    signal.addEventListener('abort', cancel, { once: true })
  })
}

function disposeResources(roots, tracked = {}) {
  const geometries = new Set(tracked.geometries)
  const materials = new Set(tracked.materials)
  const textures = new Set(tracked.textures)
  roots.forEach((root) => root?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry)
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material))
    object.shadow?.dispose?.()
    if (object.isInstancedMesh) object.dispose()
  }))
  materials.forEach((material) => {
    Object.values(material).forEach((value) => { if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value) })
    material.dispose()
  })
  geometries.forEach((geometry) => geometry.dispose())
  textures.forEach((texture) => texture.dispose())
}

async function startScene(THREE, addons, mount, unit, walk, dotRef, onRoute, { signal, onCleanup, onProgress, onError }) {
  const mobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
  const maxRatio = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1))
  const minRatio = 1
  let pixelRatio = maxRatio
  // Native multisampling cleans silhouette edges without FXAA blurring the
  // fabric weave and photo textures across the whole image.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false })
  let scene, kit, pmrem, environment, roomReflection, observer, unsubscribe
  let frame = 0
  let settleTimer = 0
  let disposed = false
  let rendering = false
  const modelSources = []
  const contextLost = (event) => { event.preventDefault(); onError() }
  const cleanup = () => {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', cleanup)
    renderer.domElement.removeEventListener('webglcontextlost', contextLost)
    if (frame) cancelAnimationFrame(frame)
    if (settleTimer) window.clearTimeout(settleTimer)
    unsubscribe?.()
    observer?.disconnect()
    disposeResources([scene, ...modelSources], kit?.track)
    roomReflection?.dispose()
    environment?.dispose()
    pmrem?.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
  // Register before the first await: StrictMode, retries and navigation can
  // dispose an in-flight scene, and late assets dispose themselves below.
  onCleanup(cleanup)
  signal.addEventListener('abort', cleanup, { once: true })
  renderer.domElement.addEventListener('webglcontextlost', contextLost)
  const checkpoint = () => { if (signal.aborted || disposed) throw new DOMException('Walkthrough cancelled', 'AbortError') }
  try {
    renderer.setPixelRatio(pixelRatio)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    // Filter the static maps for soft light transitions. Their depth maps
    // are cached; only the camera moves after the room is built.
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    renderer.info.autoReset = false
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'
    renderer.domElement.dataset.quality = pixelRatio.toFixed(2)
    renderer.domElement.dataset.samples = String(renderer.getContext().getParameter(renderer.getContext().SAMPLES))
    renderer.domElement.dataset.frames = '0'
    mount.appendChild(renderer.domElement)
    addons.RectAreaLightUniformsLib.init()
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b0f17)
    kit = createKit(THREE, renderer, { RoundedBoxGeometry: addons.RoundedBoxGeometry })

    const loader = new THREE.TextureLoader()
    const gltf = new addons.GLTFLoader()
    const textures = Object.entries(unit.textures || {})
    const modelEntries = Object.entries(unit.models || {})
    const assetCount = Math.max(1, textures.length + modelEntries.length)
    let loaded = 0
    const assetReady = () => {
      loaded++
      if (!signal.aborted) onProgress({ progress: 0.1 + (loaded / assetCount) * 0.48, stage: 'assets', detail: `Loading textures and details (${loaded}/${assetCount})` })
    }
    onProgress({ progress: 0.1, stage: 'assets', detail: 'Loading photo textures and details' })
    const [tex, models] = await Promise.all([
      Promise.all(textures.map(async ([name, entry]) => {
        const texture = await loader.loadAsync(typeof entry === 'string' ? entry : entry.src)
        if (signal.aborted || disposed) { texture.dispose(); checkpoint() }
        if (typeof entry === 'string' || !entry.data) texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        kit.track.textures.push(texture)
        assetReady()
        return [name, texture]
      })).then(Object.fromEntries),
      Promise.all(modelEntries.map(async ([name, src]) => {
        const loadedModel = (await gltf.loadAsync(src)).scene
        if (signal.aborted || disposed) { disposeResources([loadedModel]); checkpoint() }
        modelSources.push(loadedModel)
        assetReady()
        return [name, loadedModel]
      })).then(Object.fromEntries),
    ])
    checkpoint()
    onProgress({ progress: 0.62, stage: 'build', detail: 'Arranging furniture and rooms' })
    await nextPaint(signal)
    const built = unit.build(THREE, kit, scene, { tex, models })
    if (mobile) built?.spots?.forEach((spot) => { if (spot.castShadow) spot.shadow.mapSize.set(1024, 1024) })
    checkpoint()

    onProgress({ progress: 0.76, stage: 'lighting', detail: 'Setting the lighting and reflections' })
    await nextPaint(signal)
    pmrem = new THREE.PMREMGenerator(renderer)
    const studio = new addons.RoomEnvironment()
    try { environment = pmrem.fromScene(studio, 0.04) } finally { studio.dispose() }
    scene.environment = environment.texture
    scene.environmentIntensity = 0.15
    if (built?.mirror?.length) {
      roomReflection = pmrem.fromScene(scene, 0, 0.05, 60, { position: new THREE.Vector3(...unit.envAt) })
      built.mirror.forEach((material) => {
        material.envMap = roomReflection.texture
        material.envMapIntensity = material.userData.mirror ?? 1
        material.needsUpdate = true
      })
    }
    checkpoint()

    const camera = new THREE.PerspectiveCamera(60, 1, 0.06, 120)
    const posCurve = new THREE.CatmullRomCurve3(unit.path.map((point) => new THREE.Vector3(...point.pos)), false, 'centripetal')
    const lookCurve = new THREE.CatmullRomCurve3(unit.path.map((point) => new THREE.Vector3(...point.look)), false, 'centripetal')
    const SAMPLES = 800
    const lengths = new Float32Array(SAMPLES + 1)
    const prev = posCurve.getPoint(0)
    const prevDir = lookCurve.getPoint(0).sub(prev).normalize()
    const samplePos = new THREE.Vector3()
    const sampleDir = new THREE.Vector3()
    for (let i = 1; i <= SAMPLES; i++) {
      posCurve.getPoint(i / SAMPLES, samplePos)
      lookCurve.getPoint(i / SAMPLES, sampleDir).sub(samplePos).normalize()
      lengths[i] = lengths[i - 1] + samplePos.distanceTo(prev) + 0.9 * sampleDir.angleTo(prevDir)
      prev.copy(samplePos)
      prevDir.copy(sampleDir)
    }
    const total = Math.max(1e-6, lengths[SAMPLES])
    const sAt = (t) => {
      const distance = clamp01(t) * total
      let lo = 0, hi = SAMPLES
      while (lo < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] < distance) lo = mid + 1; else hi = mid }
      const i = Math.max(1, lo)
      const fraction = (distance - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1])
      return (i - 1 + fraction) / SAMPLES
    }
    const count = unit.path.length
    const lengthAt = (i) => lengths[Math.round((i / (count - 1)) * SAMPLES)]
    onRoute(unit.path.map((point, i) => ({ point, i })).filter(({ point }) => point.caption).map(({ i }) => (i === 0 ? 0 : (lengthAt(i - 1) + lengthAt(i)) / 2) / total))

    // Render straight into the multisampled canvas. ACES and sRGB conversion
    // happen once in the material shaders, with no full-screen blur pass.
    const position = new THREE.Vector3()
    const lookAt = new THREE.Vector3()
    const previousPosition = new THREE.Vector3(...unit.path[0].pos)
    let marker = null, cone = null
    let frames = 0, lastDrawAt = 0, averageWork = 0, averageFrame = 16.7, qualitySamples = 0
    let width = 1, height = 1
    const updateCamera = () => {
      const s = sAt(walk.get())
      posCurve.getPoint(s, position)
      lookCurve.getPoint(s, lookAt)
      built?.constrainCamera?.(position, previousPosition, lookAt)
      camera.position.copy(position)
      camera.lookAt(lookAt)
      previousPosition.copy(position)
    }
    const resize = () => {
      width = Math.max(1, mount.clientWidth)
      height = Math.max(1, mount.clientHeight)
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(width, height, false)
      renderer.domElement.dataset.quality = pixelRatio.toFixed(2)
      camera.aspect = width / height
      camera.fov = width / height < 0.8 ? 76 : 64
      camera.updateProjectionMatrix()
      schedule()
    }
    const draw = (now) => {
      if (disposed || signal.aborted) return
      const started = performance.now()
      updateCamera()
      renderer.info.reset()
      renderer.render(scene, camera)
      // Furniture and lamps stay fixed: their shadow maps need only one draw.
      renderer.shadowMap.autoUpdate = false
      renderer.shadowMap.needsUpdate = false
      const work = performance.now() - started
      const interval = lastDrawAt ? now - lastDrawAt : 0
      const continuous = interval > 0 && interval < 90
      lastDrawAt = now
      frames++
      averageWork = averageWork ? averageWork * 0.88 + work * 0.12 : work
      if (continuous) { averageFrame = averageFrame * 0.88 + interval * 0.12; qualitySamples++ }
      const dot = dotRef.current
      if (dot) {
        if (marker !== dot) { marker = dot; cone = dot.querySelector('[data-cone]') }
        const { plan } = unit
        dot.style.left = `${(plan.x0 + (position.x / plan.width) * (plan.x1 - plan.x0)) * 100}%`
        dot.style.top = `${(plan.y0 + (position.z / plan.depth) * (plan.y1 - plan.y0)) * 100}%`
        if (cone) cone.style.transform = `rotate(${Math.atan2(lookAt.z - position.z, lookAt.x - position.x) * 180 / Math.PI}deg)`
      }
      // Keep diagnostics off the UI; QA can inspect the canvas while walking.
      if (frames === 1 || frames % 12 === 0) {
        const data = renderer.domElement.dataset
        data.frames = String(frames)
        data.renderMs = averageWork.toFixed(2)
        data.frameMs = averageFrame.toFixed(2)
        data.quality = pixelRatio.toFixed(2)
        data.drawCalls = String(renderer.info.render.calls)
        data.triangles = String(renderer.info.render.triangles)
        data.walk = walk.get().toFixed(4)
        data.cameraX = position.x.toFixed(3)
        data.cameraY = position.y.toFixed(3)
        data.cameraZ = position.z.toFixed(3)
        data.lookX = lookAt.x.toFixed(3)
        data.lookY = lookAt.y.toFixed(3)
        data.lookZ = lookAt.z.toFixed(3)
      }
      // Moving views may shed supersampling, but never render below one
      // physical pixel per CSS pixel. Restore full detail when motion rests.
      if (frames > 24 && qualitySamples >= 24) {
        let nextRatio = pixelRatio
        if (averageWork > 12.5 || averageFrame > 17.8) nextRatio = Math.max(minRatio, pixelRatio * 0.85)
        // Recover detail slowly after sustained 60 FPS; RAF itself is capped
        // at 16.7 ms on a 60 Hz display, so require stable pacing and low work.
        else if (averageWork < 5.5 && averageFrame < 17.2 && qualitySamples >= 240) nextRatio = Math.min(maxRatio, pixelRatio + 0.04)
        if (Math.abs(nextRatio - pixelRatio) > 0.02) { pixelRatio = nextRatio; qualitySamples = 0; resize() }
      }
    }
    function schedule() {
      if (!rendering || frame || disposed || signal.aborted) return
      frame = requestAnimationFrame((now) => {
        frame = 0
        try { draw(now) } catch (error) { console.warn('Unit walkthrough could not render:', error); onError() }
      })
    }
    const onMotion = () => {
      schedule()
      if (settleTimer) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        settleTimer = 0
        if (disposed || signal.aborted || pixelRatio === maxRatio) return
        pixelRatio = maxRatio
        qualitySamples = 0
        resize()
      }, 180)
    }
    resize()
    updateCamera()
    onProgress({ progress: 0.88, stage: 'compile', detail: 'Preparing the final view' })
    await nextPaint(signal)
    // Warm the same screen/ACES shader variants used by the first frame.
    renderer.setRenderTarget(null)
    await renderer.compileAsync(scene, camera)
    checkpoint()
    onProgress({ progress: 0.96, stage: 'compile', detail: 'Opening your walkthrough' })
    await nextPaint(signal)
    draw(performance.now())
    // Keep the loader until the fully textured first frame reaches the screen.
    await nextPaint(signal)
    checkpoint()
    rendering = true
    observer = new ResizeObserver(resize)
    observer.observe(mount)
    unsubscribe = walk.on('change', onMotion)
    onProgress({ progress: 1, stage: 'ready', detail: 'Your walkthrough is ready' })
    return cleanup
  } catch (error) {
    cleanup()
    throw error
  }
}
