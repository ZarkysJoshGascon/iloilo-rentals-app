// src/components/public/InteriorProjectTour.tsx
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent, AnimatePresence,
  type MotionValue,
} from 'framer-motion'
import { ArrowDown, ArrowRight, Loader2 } from 'lucide-react'
import { useInteriorProjects } from '@/lib/siteImages'
import DepthWalkthrough, { supportsWebGL } from './DepthWalkthrough'

// ─────────────────────────────────────────────────────────────
// A scroll-driven walk through finished interior projects.
//
// The section pins to the screen and the scroll moves a camera:
//   1. You walk up to a doorway (the first photo, framed) and step through it.
//   2. Each photo is a room. The camera moves through it (forward, looking
//      left or right, tilting up), then pushes on past it into the next room,
//      with a darkening at the edges like passing through a door frame.
//   3. After the last room you step back out and the page offers the form.
//
// Rooms with a depth map ("<photo>.depth.png" next to the photo) are drawn in
// 3D by DepthWalkthrough, so the camera really moves through the space; it
// takes over whenever a project has depth maps and the browser has WebGL.
// Otherwise (or with reduced motion) the photos themselves are moved.
//
// Photos come from Supabase Storage (hero-images/interior/, see
// useInteriorProjects in lib/siteImages): add a folder per project and the
// tour picks it up. Until there are any, the demo below shows only with
// ?demo=photos in the URL, so visitors never see stock photos presented as our work.
// ─────────────────────────────────────────────────────────────

const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=1800&q=80&auto=format&fit=crop`
const DEMO_DEPTH = (id) => `/tours/demo/${id}.depth.png`
const demoShot = (key, id, room, note) => ({ key, src: UNSPLASH(id), depth: DEMO_DEPTH(id), room, note })

const DEMO_PROJECTS = [
  {
    key: 'demo-studio',
    title: 'Studio makeover',
    location: 'Megaworld, Iloilo City',
    shots: [
      demoShot('a', '1522708323590-d24dbb6b0267', 'Living & dining', 'Stepping in from the door'),
      demoShot('b', '1502672260266-1c1ef2d93688', 'Sleeping area', 'Turning toward the bed'),
      demoShot('c', '1493809842364-78817add7ffb', 'Bed styling', 'Linens, art and light, up close'),
    ],
  },
  {
    key: 'demo-one-bedroom',
    title: 'One-bedroom refresh',
    location: 'Mandurriao, Iloilo City',
    shots: [
      demoShot('a', '1600607687939-ce8a6c25118c', 'Open living area', 'Walking in toward the kitchen'),
      demoShot('b', '1484154218962-a197022b5858', 'Dining nook', 'Looking across the table'),
      demoShot('c', '1505691938895-1758d7feb511', 'Lounge', 'Taking in the feature wall'),
      demoShot('d', '1586023492125-27b2c045efd7', 'Reading corner', 'A closer look at the details'),
    ],
  },
]

// Camera moves, as from → to. x / y are % of the frame; the photo is scaled up
// enough that a move never shows its edges (|x| and |y| stay under (scale − 1) / 2).
const CAMERAS = {
  enter:     { from: { scale: 1.1, x: 0, y: 0, rotateY: 0, rotateX: 0 },   to: { scale: 1.4, x: 0, y: -2, rotateY: 0, rotateX: 0 } },
  lookRight: { from: { scale: 1.3, x: 7, y: 0, rotateY: -5, rotateX: 0 },  to: { scale: 1.34, x: -7, y: 0, rotateY: 5, rotateX: 0 } },
  closer:    { from: { scale: 1.14, x: 0, y: 0, rotateY: 0, rotateX: 0 },  to: { scale: 1.58, x: -3, y: 2, rotateY: 0, rotateX: 0 } },
  lookLeft:  { from: { scale: 1.3, x: -7, y: 0, rotateY: 5, rotateX: 0 },  to: { scale: 1.34, x: 7, y: 0, rotateY: -5, rotateX: 0 } },
  lookUp:    { from: { scale: 1.32, x: 0, y: 8, rotateY: 0, rotateX: 4 },  to: { scale: 1.32, x: 0, y: -8, rotateY: 0, rotateX: -4 } },
}
// Each project opens by walking in; later rooms cycle through the other moves.
const ROOM_CAMERAS = ['lookRight', 'closer', 'lookLeft', 'lookUp']

// Scroll lengths, in viewport heights.
const INTRO_VH = 70     // walking up to the door and through it
const VH_PER_ROOM = 85  // each room
const OUTRO_VH = 70     // stepping back out
// Share of a room's span spent passing into it from the room before.
const PASS = 0.3

const EASE = [0.16, 1, 0.3, 1] as const

// tour.json "type" → what the project is.
const TYPE_LABEL = { house: 'House design', condo: 'Interior design · Condominium' }

// Clamped linear map of v from [a, b] to [c, d]. Scroll-linked values use the
// function form of useTransform: the array form hands opacity to the browser's
// native scroll timeline, which maps window-scroll offsets wrong.
function mapRange(v: number, [a, b]: number[], [c, d]: number[]) {
  const t = b === a ? 1 : Math.min(1, Math.max(0, (v - a) / (b - a)))
  return c + (d - c) * t
}

type InteriorProjectTourProps = {
  skipTo: string
}

export default function InteriorProjectTour({ skipTo }: InteriorProjectTourProps) {
  const loaded = useInteriorProjects()

  if (loaded === undefined) {
    return (
      <div className="h-svh bg-[#0b0f17] flex items-center justify-center" aria-hidden="true">
        <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
      </div>
    )
  }

  const demo = new URLSearchParams(window.location.search).get('demo') === 'photos'
  const projects = loaded.length > 0 ? loaded : demo ? DEMO_PROJECTS : []
  if (projects.length === 0) return null
  return <Tour projects={projects} skipTo={skipTo} demo={loaded.length === 0} />
}

type TourProps = {
  projects: any
  skipTo: any
  demo: boolean
}

function Tour({ projects, skipTo, demo }: TourProps) {
  const reduce = useReducedMotion()
  const sectionRef = useRef(null)

  // Every room in walk order, with its camera move and project.
  const rooms = useMemo(() => projects.flatMap((project, projectIndex) =>
    project.shots.map((shot, roomIndex) => ({
      ...shot,
      id: `${project.key}/${shot.key}`,
      projectIndex,
      roomIndex,
      camera: roomIndex === 0 ? 'enter' : ROOM_CAMERAS[(roomIndex - 1) % ROOM_CAMERAS.length],
    }))), [projects])
  const firstRoomOf = useMemo(() => {
    const starts = []
    rooms.forEach((r, i) => { if (r.roomIndex === 0) starts.push(i) })
    return starts
  }, [rooms])

  // 3D when the rooms have depth maps and the browser can draw them.
  const [webgl] = useState(supportsWebGL)
  const [failed3d, setFailed3d] = useState(false)
  const onFail3d = useCallback(() => setFailed3d(true), [])
  const use3d = !reduce && webgl && !failed3d && rooms.some((r) => r.depth)
  const rooms3d = useMemo(
    () => rooms.map((r) => ({ id: r.id, src: r.src, depth: r.depth, move: r.camera })),
    [rooms],
  )

  const total = rooms.length
  const distance = INTRO_VH + total * VH_PER_ROOM + OUTRO_VH
  const introEnd = INTRO_VH / distance
  const walkEnd = (INTRO_VH + total * VH_PER_ROOM) / distance

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  // 0 → 1 across the rooms only.
  const walk = useTransform(scrollYProgress, (p) => mapRange(p, [introEnd, walkEnd], [0, 1]))

  const [active, setActive] = useState(0)
  const [outro, setOutro] = useState(false)
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    const w = mapRange(p, [introEnd, walkEnd], [0, 1])
    const next = Math.min(total - 1, Math.max(0, Math.floor(w * total)))
    setActive((prev) => (prev === next ? prev : next))
    const atEnd = p > walkEnd + (1 - walkEnd) * 0.35
    setOutro((prev) => (prev === atEnd ? prev : atEnd))
  })

  // The doorway: the photo starts framed in the middle and opens to fill the
  // screen as you step through; it closes in a little again on the way out.
  const frame = useTransform(scrollYProgress, (p) => {
    if (reduce) return 0
    if (p < introEnd) return mapRange(p, [0, introEnd * 0.9], [1, 0])
    return mapRange(p, [walkEnd, 1], [0, 0.55])
  })
  // Framed low on the screen, under the intro heading; door-shaped on phones.
  const clipPath = useTransform(frame, (f) => {
    const top = f * 36
    const bottom = f * 12
    const side = f * 26
    return `inset(${top}% ${side}% ${bottom}% ${side}% round ${Math.round(f * 28)}px)`
  })
  const introOpacity = useTransform(scrollYProgress, (p) => mapRange(p, [introEnd * 0.15, introEnd * 0.6], [1, 0]))
  const introY = useTransform(scrollYProgress, (p) => mapRange(p, [0, introEnd * 0.6], [0, -40]))
  const hudOpacity = useTransform(scrollYProgress, (p) =>
    Math.min(mapRange(p, [introEnd * 0.75, introEnd], [0, 1]), mapRange(p, [walkEnd, walkEnd + (1 - walkEnd) * 0.3], [1, 0])))
  const outroOpacity = useTransform(scrollYProgress, (p) => mapRange(p, [walkEnd + (1 - walkEnd) * 0.2, walkEnd + (1 - walkEnd) * 0.6], [0, 1]))

  // Edges darken as you pass from one room into the next, like a door frame.
  const span = 1 / total
  const doorShade = useTransform(walk, (w) => {
    if (reduce || total < 2) return 0
    const nearest = Math.round(w * total) / total
    if (nearest <= 0 || nearest >= 1) return 0
    const d = Math.abs(w - (nearest - span * PASS * 0.5))
    return Math.max(0, 1 - d / (span * PASS * 0.75)) * 0.85
  })

  const room = rooms[active]
  const project = projects[room.projectIndex]
  const roomsInProject = project.shots.length

  // Jump the scroll to a room (index in walk order), or to the start of a project.
  const goToRoom = (index) => {
    const section = sectionRef.current
    if (!section) return
    const vh = window.innerHeight / 100
    const into = (INTRO_VH + index * VH_PER_ROOM + VH_PER_ROOM * PASS) * vh
    window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY + into, behavior: 'smooth' })
  }
  const goToProject = (projectIndex) => goToRoom(firstRoomOf[projectIndex])
  const stopWord = project.type === 'house' ? 'View' : 'Room'

  return (
    <section
      ref={sectionRef}
      aria-label="Interior projects by Iloilo Rentals"
      className="relative bg-[#0b0f17]"
      style={{ height: `${distance + 100}vh` }}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* Rooms, framed by the doorway */}
        <motion.div className="absolute inset-0 bg-black" style={{ clipPath, perspective: '1200px' }}>
          {use3d ? (
            <DepthWalkthrough rooms={rooms3d} walk={walk} pass={PASS} onFail={onFail3d} />
          ) : (
            rooms.map((r, i) => (
              <Room key={r.id} room={r} index={i} total={total} walk={walk} reduce={reduce} />
            ))
          )}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: total + 1, opacity: doorShade, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.9) 100%)' }}
          />
          {/* Legibility shades for the text on top */}
          <motion.div aria-hidden="true" style={{ zIndex: total + 2, opacity: hudOpacity }} className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-black/65 to-transparent pointer-events-none" />
          <motion.div aria-hidden="true" style={{ zIndex: total + 2, opacity: hudOpacity }} className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />
          {/* Dims the last room behind the closing message */}
          <motion.div aria-hidden="true" style={{ zIndex: total + 3, opacity: outroOpacity }} className="absolute inset-0 bg-black/55 pointer-events-none" />
        </motion.div>

        {/* Intro: walking up to the door */}
        <motion.div
          style={{ opacity: introOpacity, y: introY }}
          className="absolute z-[70] inset-x-0 top-0 pt-24 md:pt-28 px-6 text-center pointer-events-none"
        >
          <p className="text-[11px] md:text-xs font-bold uppercase tracking-[0.25em] text-white/60">Our interior work</p>
          <h2 className="mt-3 text-3xl md:text-6xl font-black text-white tracking-tight leading-[1.05]">
            Walk through spaces we&apos;ve designed
          </h2>
          <p className="mt-3 text-sm md:text-base text-white/70">
            {projects.length} project{projects.length === 1 ? '' : 's'} · {total} views
            {demo && <span className="ml-2 text-amber-300">(sample photos)</span>}
          </p>
        </motion.div>
        <motion.div
          style={{ opacity: introOpacity }}
          className="absolute z-[70] left-1/2 -translate-x-1/2 bottom-28 md:bottom-10 flex flex-col items-center gap-2 text-white/80 pointer-events-none"
        >
          <span className="text-[11px] font-semibold uppercase tracking-widest">Scroll to step inside</span>
          <motion.span animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
            <ArrowDown size={18} />
          </motion.span>
        </motion.div>
        {skipTo && (
          <motion.a
            href={skipTo}
            style={{ opacity: introOpacity }}
            className="absolute z-[71] right-4 md:right-8 bottom-28 md:bottom-10 text-[12px] font-semibold text-white/70 hover:text-white underline underline-offset-4"
          >
            Skip to the form
          </motion.a>
        )}

        {/* During the walk: project, rooms, progress */}
        {/* A soft shadow keeps the text readable over bright photos */}
        <motion.div style={{ opacity: hudOpacity }} className="absolute z-[70] inset-0 pointer-events-none [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
          <div className={`absolute left-0 right-0 top-0 px-6 md:px-12 pt-24 md:pt-28 ${project.plan ? 'pr-36 md:pr-12' : ''}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={room.projectIndex}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/65">
                  Project {String(room.projectIndex + 1).padStart(2, '0')} of {String(projects.length).padStart(2, '0')}
                  {TYPE_LABEL[project.type] && <span className="block md:inline md:before:content-['·'] md:before:mx-2">{TYPE_LABEL[project.type]}</span>}
                </p>
                <p className="mt-1.5 text-xl md:text-3xl font-bold text-white tracking-tight">{project.title}</p>
                {project.location && <p className="text-sm md:text-base text-white/70">{project.location}</p>}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* The floor plan, marking where you are; tap a marker to go there.
              Top right on phones, under the project's name on larger screens. */}
          {project.plan && (
            <div className="absolute right-4 top-24 md:right-auto md:left-12 md:top-[13.5rem]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={room.projectIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  <FloorPlan
                    project={project}
                    roomIndex={room.roomIndex}
                    onPick={(i) => goToRoom(firstRoomOf[room.projectIndex] + i)}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* Projects, with how far through each one you are (desktop) */}
          {projects.length > 1 && (
            <ol className="hidden lg:flex flex-col gap-3 absolute right-12 top-1/2 -translate-y-1/2 w-56 pointer-events-auto">
              {projects.map((p, i) => {
                const current = i === room.projectIndex
                const done = i < room.projectIndex
                const fill = done ? 1 : current ? (room.roomIndex + 1) / roomsInProject : 0
                return (
                  <li key={p.key}>
                    <button type="button" onClick={() => goToProject(i)} className="group w-full text-right">
                      <span className={`block text-[12px] font-semibold transition-colors duration-500 ${current ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`}>
                        <span className="tabular-nums mr-1.5">{String(i + 1).padStart(2, '0')}</span>{p.title}
                      </span>
                      <span className="mt-1.5 block h-[3px] rounded-full bg-white/20 overflow-hidden">
                        <span className="block h-full rounded-full bg-white origin-right transition-transform duration-700" style={{ transform: `scaleX(${fill})` }} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}

          {/* Phones: clear of the bottom navigation bar */}
          <div className="absolute left-0 right-0 bottom-0 px-6 md:px-12 pb-28 md:pb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
                transition={{ duration: 0.5, ease: EASE }}
                className="max-w-xl"
              >
                <h3 className="text-4xl md:text-7xl font-black text-white tracking-tight leading-[1]">{room.room}</h3>
                {room.note && <p className="mt-2 md:mt-3 text-base md:text-lg text-white/80">{room.note}</p>}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center gap-3">
              <span className="text-[12px] font-semibold tabular-nums text-white/75">
                {stopWord} {room.roomIndex + 1} / {roomsInProject}
              </span>
              <span className="flex gap-1.5">
                {project.shots.map((s, i) => (
                  <span
                    key={s.key}
                    className={`block h-[3px] rounded-full transition-all duration-500 ${i === room.roomIndex ? 'w-9 bg-white' : i < room.roomIndex ? 'w-4 bg-white/70' : 'w-4 bg-white/30'}`}
                  />
                ))}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Outro: stepping back out */}
        <motion.div
          style={{ opacity: outroOpacity }}
          className={`absolute z-[72] inset-0 flex flex-col items-center justify-center text-center px-6 ${outro ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          <p className="text-[11px] md:text-xs font-bold uppercase tracking-[0.25em] text-white/70">Your space could be next</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
            Let&apos;s design it together
          </h2>
          {skipTo && (
            <a
              href={skipTo}
              tabIndex={outro ? 0 : -1}
              className="mt-7 inline-flex items-center gap-2 h-12 px-7 rounded-full bg-white text-[#0b0f17] text-sm font-bold shadow-xl hover:bg-white/90 transition-colors"
            >
              Start your project <ArrowRight size={16} />
            </a>
          )}
        </motion.div>
      </div>
    </section>
  )
}

type FloorPlanProps = {
  project: any
  roomIndex: any
  onPick: (i: any) => void
}

// The project's floor plan with a marker for each photo that has one
// (tour.json); the one you're looking at glows. Tapping a marker goes there.
function FloorPlan({ project, roomIndex, onPick }: FloorPlanProps) {
  return (
    <div className="pointer-events-auto rounded-lg bg-black/45 backdrop-blur-md p-1.5 md:p-2 shadow-lg ring-1 ring-white/15">
      <p className="hidden md:block px-0.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 [text-shadow:none]">
        Floor plan
      </p>
      <div className="relative inline-block align-top">
        <img
          src={project.plan}
          alt={`${project.title} floor plan`}
          draggable={false}
          className="block w-auto h-auto max-w-[7rem] max-h-[8rem] md:max-w-[15rem] md:max-h-[30vh] rounded"
        />
        {project.shots.map((shot, i) => {
          if (!shot.marker) return null
          const here = i === roomIndex
          return (
            <button
              key={shot.key}
              type="button"
              onClick={() => onPick(i)}
              title={shot.room}
              aria-label={`Go to ${shot.room}`}
              aria-current={here ? 'step' : undefined}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center"
              style={{ left: `${shot.marker.x * 100}%`, top: `${shot.marker.y * 100}%` }}
            >
              {here && <span aria-hidden className="absolute w-5 h-5 rounded-full bg-white/50 animate-ping" />}
              <span
                aria-hidden
                className={here
                  ? 'relative w-3.5 h-3.5 rounded-full bg-white ring-2 ring-[#2d568e] shadow'
                  : 'relative w-2.5 h-2.5 rounded-full bg-white/80 ring-1 ring-black/40'}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

type RoomProps = {
  room: any
  index: any
  total: any
  walk: MotionValue<number>
  reduce: boolean
}

// One room. The camera moves through it from just before you enter until its
// span ends; then, as the next room comes in on top, it keeps pushing forward
// and blurs, so it feels like walking on past it.
function Room({ room, index, total, walk, reduce }: RoomProps) {
  const span = 1 / total
  const start = index * span
  const end = start + span
  const passStart = start - span * PASS
  const last = index === total - 1
  const cam = CAMERAS[room.camera]
  const from = reduce ? CAMERAS.enter.from : cam.from
  const to = reduce ? CAMERAS.enter.from : cam.to
  const range = [Math.max(0, passStart), last ? 1 : end]

  const opacity = useTransform(walk, (w) => (index === 0 ? 1 : mapRange(w, [passStart, start], [0, 1])))
  // Walking on past this room as the next one comes in.
  const push = (w) => (reduce || last ? 0 : mapRange(w, [end - span * PASS, end], [0, 1]))
  const scale = useTransform(walk, (w) => mapRange(w, range, [from.scale, to.scale]) * (1 + push(w) * 0.25))
  const x = useTransform(walk, (w) => `${mapRange(w, range, [from.x, to.x])}%`)
  const y = useTransform(walk, (w) => `${mapRange(w, range, [from.y, to.y])}%`)
  const rotateY = useTransform(walk, (w) => mapRange(w, range, [from.rotateY, to.rotateY]))
  const rotateX = useTransform(walk, (w) => mapRange(w, range, [from.rotateX, to.rotateX]))
  const filter = useTransform(walk, (w) => {
    const b = push(w) * 8
    return b > 0.05 ? `blur(${b.toFixed(1)}px)` : 'none'
  })

  return (
    <motion.div className="absolute inset-0" style={{ opacity, zIndex: index }}>
      <motion.img
        src={room.src}
        alt={room.note ? `${room.room}: ${room.note}` : room.room}
        loading={index < 2 ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
        style={{ scale, x, y, rotateY, rotateX, filter }}
      />
    </motion.div>
  )
}
