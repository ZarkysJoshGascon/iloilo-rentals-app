// src/components/public/InteriorWalkthrough.jsx
import { useRef, useState } from 'react'
import { motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent, AnimatePresence } from 'framer-motion'
import { ArrowDown } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// A walk through units Iloilo Rentals has designed. The section pins to the
// screen while you scroll, and the scroll drives a "camera": each photo is a
// stop in the walk, and the camera moves through it — stepping forward,
// turning to look around, tilting up — before the next room fades in on top
// while the last one keeps moving past you.
// ─────────────────────────────────────────────────────────────

const HERO_IMG = (n) => `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/${n}.jpg`
const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=1800&q=80&auto=format&fit=crop`

// Camera moves, as from → to. x / y are % of the frame; the photo is scaled up
// enough that a move never shows its edges (|x| and |y| stay under (scale − 1) / 2).
const CAMERAS = {
  enter:    { from: { scale: 1.08, x: 0, y: 0, rotateY: 0, rotateX: 0 },   to: { scale: 1.42, x: 0, y: -2, rotateY: 0, rotateX: 0 } },
  lookRight: { from: { scale: 1.3, x: 7, y: 0, rotateY: -5, rotateX: 0 }, to: { scale: 1.34, x: -7, y: 0, rotateY: 5, rotateX: 0 } },
  lookLeft: { from: { scale: 1.3, x: -7, y: 0, rotateY: 5, rotateX: 0 },  to: { scale: 1.34, x: 7, y: 0, rotateY: -5, rotateX: 0 } },
  lookUp:   { from: { scale: 1.32, x: 0, y: 8, rotateY: 0, rotateX: 4 },   to: { scale: 1.32, x: 0, y: -8, rotateY: 0, rotateX: -4 } },
  closer:   { from: { scale: 1.12, x: 0, y: 0, rotateY: 0, rotateX: 0 },   to: { scale: 1.6, x: -3, y: 2, rotateY: 0, rotateX: 0 } },
}

// Past projects. Photos are placeholders — swap in real before/after shots of
// each unit. Several angles of the same unit make the walk feel continuous.
const PROJECTS = [
  {
    title: 'Studio makeover',
    shots: [
      { image: HERO_IMG(5), room: 'Living & dining', note: 'Stepping in from the door', camera: 'enter' },
      { image: HERO_IMG(4), room: 'Sleeping area', note: 'Turning toward the bed', camera: 'lookRight' },
      { image: HERO_IMG(1), room: 'Bed styling', note: 'Up close: linens, art and light', camera: 'closer' },
    ],
  },
  {
    title: 'One-bedroom refresh',
    shots: [
      { image: UNSPLASH('1600607687939-ce8a6c25118c'), room: 'Open living area', note: 'Walking in toward the kitchen', camera: 'enter' },
      { image: HERO_IMG(2), room: 'Dining nook', note: 'Looking across the table', camera: 'lookLeft' },
      { image: UNSPLASH('1505691938895-1758d7feb511'), room: 'Lounge', note: 'Taking in the feature wall', camera: 'lookUp' },
      { image: UNSPLASH('1586023492125-27b2c045efd7'), room: 'Reading corner', note: 'A closer look at the details', camera: 'closer' },
    ],
  },
]

const SHOTS = PROJECTS.flatMap((p, projectIndex) =>
  p.shots.map((s, shotIndex) => ({ ...s, projectIndex, shotIndex, key: `${projectIndex}-${shotIndex}` })),
)

// Scroll length per stop (in viewport heights) and how much of a stop the
// cross-fade into it takes.
const VH_PER_SHOT = 75
const FADE = 0.25

// Clamped linear map of v from [a, b] to [c, d].
// Every scroll-linked value here uses the function form of useTransform on
// purpose: with the array form, Framer Motion hands opacity to the browser's
// native scroll timeline, which got this section's offsets wrong (the hint was
// still half visible mid-walk). Function transforms always run in JS.
function mapRange(v, [a, b], [c, d]) {
  const t = b === a ? 1 : Math.min(1, Math.max(0, (v - a) / (b - a)))
  return c + (d - c) * t
}

export default function InteriorWalkthrough() {
  const sectionRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  const total = SHOTS.length
  const [active, setActive] = useState(0)

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(total - 1, Math.max(0, Math.floor(v * total)))
    setActive((prev) => (prev === next ? prev : next))
  })

  const shot = SHOTS[active]
  const project = PROJECTS[shot.projectIndex]
  const hintOpacity = useTransform(scrollYProgress, (v) => mapRange(v, [0, 0.04], [1, 0]))

  return (
    <section
      ref={sectionRef}
      aria-label="Interior design work by Iloilo Rentals"
      className="relative"
      style={{ height: `${total * VH_PER_SHOT + 60}vh` }}
    >
      <div className="sticky top-0 h-svh overflow-hidden bg-black" style={{ perspective: '1200px' }}>
        {SHOTS.map((s, i) => (
          <Shot key={s.key} shot={s} index={i} total={total} progress={scrollYProgress} />
        ))}

        {/* Legibility shades and text sit above every photo (photos are z 0..n) */}
        <div className="absolute z-20 inset-x-0 top-0 h-48 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute z-20 inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

        {/* Project */}
        <div className="absolute z-30 left-0 right-0 top-0 px-6 md:px-12 pt-8 md:pt-28 pointer-events-none">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Inside our interior work</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={shot.projectIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="mt-2 text-lg md:text-2xl font-bold text-white"
            >
              <span className="tabular-nums text-white/60 mr-2">{String(shot.projectIndex + 1).padStart(2, '0')}</span>
              {project.title}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Where you are in the unit */}
        <div className="absolute z-30 left-0 right-0 bottom-0 px-6 md:px-12 pb-28 md:pb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6 pointer-events-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={shot.key}
              initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-xl"
            >
              <h3 className="text-3xl md:text-6xl font-black text-white tracking-tight leading-[1.02]">{shot.room}</h3>
              <p className="mt-2 md:mt-3 text-base md:text-lg text-white/80">{shot.note}</p>
            </motion.div>
          </AnimatePresence>

          {/* The rooms of this project, current one marked */}
          <ol className="flex md:flex-col gap-2 md:gap-2.5 md:items-end">
            {project.shots.map((s, i) => {
              const current = i === shot.shotIndex
              return (
                <li key={s.room} className="flex items-center gap-2.5 md:flex-row-reverse">
                  <span
                    className={`block h-[3px] rounded-full transition-all duration-500 ${current ? 'w-10 bg-white' : 'w-4 bg-white/35'}`}
                  />
                  <span className={`hidden md:inline text-[12px] font-semibold transition-colors duration-500 ${current ? 'text-white' : 'text-white/45'}`}>
                    {s.room}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        {/* First-screen hint */}
        <motion.div
          style={{ opacity: hintOpacity }}
          className="absolute z-30 left-1/2 -translate-x-1/2 bottom-48 md:bottom-12 flex flex-col items-center gap-2 text-white/85 pointer-events-none"
        >
          <span className="text-[11px] font-semibold uppercase tracking-widest">Scroll to walk through</span>
          <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
            <ArrowDown size={18} />
          </motion.span>
        </motion.div>
      </div>
    </section>
  )
}

// One stop of the walk. The camera moves through it from just before it fades
// in until its own scroll span ends — so it is still moving, underneath, while
// the next stop fades in on top.
function Shot({ shot, index, total, progress }) {
  const reduce = useReducedMotion()
  const span = 1 / total
  const start = index * span
  const end = start + span
  const fadeStart = start - span * FADE
  const cam = CAMERAS[shot.camera]
  const from = reduce ? CAMERAS.enter.from : cam.from
  const to = reduce ? CAMERAS.enter.from : cam.to
  const range = [Math.max(0, fadeStart), end]

  const opacity = useTransform(progress, (v) => (index === 0 ? 1 : mapRange(v, [fadeStart, start], [0, 1])))
  const scale = useTransform(progress, (v) => mapRange(v, range, [from.scale, to.scale]))
  const x = useTransform(progress, (v) => `${mapRange(v, range, [from.x, to.x])}%`)
  const y = useTransform(progress, (v) => `${mapRange(v, range, [from.y, to.y])}%`)
  const rotateY = useTransform(progress, (v) => mapRange(v, range, [from.rotateY, to.rotateY]))
  const rotateX = useTransform(progress, (v) => mapRange(v, range, [from.rotateX, to.rotateX]))

  return (
    <motion.div className="absolute inset-0" style={{ opacity, zIndex: index }}>
      <motion.img
        src={shot.image}
        alt={`${shot.room} — ${shot.note}`}
        loading={index < 2 ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
        style={{ scale, x, y, rotateY, rotateX }}
      />
    </motion.div>
  )
}
