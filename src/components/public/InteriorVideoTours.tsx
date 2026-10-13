// src/components/public/InteriorVideoTours.tsx
import { useEffect, useRef, useState } from 'react'
import {
  motion, useScroll, useSpring, useTransform, useInView, useReducedMotion, useMotionValueEvent, AnimatePresence,
} from 'framer-motion'
import { ArrowDown, Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Video tours of homes Iloilo Rentals has designed. Each tour pins to the
// screen and scrolling scrubs its video — from the street, through the front
// door and into the rooms — while captions mark each stop along the way.
//
// Videos live in public/videos/interior/. A tour whose video isn't there yet
// hides itself, so a new tour appears as soon as its file is added. For smooth
// scrubbing, encode with a keyframe every few frames and no audio track.
// ─────────────────────────────────────────────────────────────

const DIR = '/videos/interior'
const EASE = [0.16, 1, 0.3, 1] as const

const TOURS = [
  {
    key: 'house',
    src: `${DIR}/house-tour.mp4`,
    eyebrow: 'Our work · 01',
    label: 'The house',
    title: 'Step inside a home we designed',
    subtitle: 'From the street, through the front door, and into the living spaces.',
    vh: 450,
    // `from` is the point in the scroll (0–1) where each caption takes over.
    beats: [
      { from: 0.1, title: 'Curb appeal', note: 'Facade, lighting and landscaping that welcome you home.' },
      { from: 0.4, title: 'Through the front door', note: 'Every room starts with how you arrive.' },
      { from: 0.7, title: 'The living spaces', note: 'Layout, furniture and finishes, designed as one.' },
    ],
  },
  {
    key: 'unit',
    src: `${DIR}/unit-tour.mp4`,
    eyebrow: 'Our work · 02',
    label: 'The unit',
    title: 'A condo unit, start to finish',
    subtitle: 'Through the door of a unit we designed and furnished, room by room.',
    vh: 450,
    beats: [
      { from: 0.1, title: 'The entry', note: 'A first look planned around how you live.' },
      { from: 0.4, title: 'Living & dining', note: 'Open space for guests and everyday life.' },
      { from: 0.7, title: 'The bedroom', note: 'Calm, layered and finished down to the details.' },
    ],
  },
]

// Clamped linear map of v from [a, b] to [c, d]. Scroll-linked values use the
// function form of useTransform: the array form hands opacity to the browser's
// native scroll timeline, which maps window-scroll offsets wrong.
function mapRange(v, [a, b], [c, d]) {
  const t = b === a ? 1 : Math.min(1, Math.max(0, (v - a) / (b - a)))
  return c + (d - c) * t
}

// A missing file comes back as the app's index.html with a 200, so check the type.
function isVideo(res) {
  return res.ok && (res.headers.get('content-type') ?? '').startsWith('video/')
}

function beatAt(beats, v) {
  let index = -1
  beats.forEach((b, i) => { if (v >= b.from) index = i })
  return index
}

type InteriorVideoToursProps = {
  skipTo: string
}

export default function InteriorVideoTours({ skipTo }: InteriorVideoToursProps) {
  return TOURS.map((tour) => <VideoTour key={tour.key} tour={tour} skipTo={skipTo} />)
}

type VideoTourProps = {
  tour: any
  skipTo: any
}

function VideoTour({ tour, skipTo }: VideoTourProps) {
  const reduce = useReducedMotion()
  const sectionRef = useRef(null)
  const videoRef = useRef(null)
  const near = useInView(sectionRef, { once: true, margin: '150% 0px' })
  const [videoUrl, setVideoUrl] = useState(null)
  const [missing, setMissing] = useState(false)
  const [active, setActive] = useState(-1)

  // Check right away whether the video exists, so a missing tour hides
  // before anyone scrolls to it.
  useEffect(() => {
    const controller = new AbortController()
    fetch(tour.src, { method: 'HEAD', signal: controller.signal })
      .then((res) => { if (!isVideo(res)) setMissing(true) })
      .catch((err) => { if (err.name !== 'AbortError') setMissing(true) })
    return () => controller.abort()
  }, [tour.src])

  // Download the whole file before scrubbing: seeking inside a fully loaded
  // video is instant, while seeking into a half-streamed one stalls.
  useEffect(() => {
    if (!near || reduce || missing) return
    const src = tour.srcMobile && window.matchMedia('(max-width: 767px)').matches ? tour.srcMobile : tour.src
    const controller = new AbortController()
    let url
    fetch(src, { signal: controller.signal })
      .then((res) => {
        if (!isVideo(res)) throw new Error(`No video at ${src}`)
        return res.blob()
      })
      .then((blob) => {
        url = URL.createObjectURL(blob)
        setVideoUrl(url)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setMissing(true)
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [near, reduce, missing, tour.src, tour.srcMobile])

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  // A little inertia so wheel steps glide through the frames instead of jumping.
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.0005 })

  // One seek in flight at a time; the newest target waits for it to land.
  const queued = useRef(null)
  const seek = (v) => {
    const video = videoRef.current
    if (!video || !(video.duration > 0)) return
    const t = Math.min(video.duration - 0.05, Math.max(0, v * video.duration))
    if (video.seeking) queued.current = t
    else video.currentTime = t
  }
  const onSeeked = () => {
    if (queued.current == null) return
    const t = queued.current
    queued.current = null
    videoRef.current.currentTime = t
  }
  const onLoadedData = () => {
    const video = videoRef.current
    // iOS Safari only paints seeked frames once the video has played.
    video.play().then(() => video.pause()).catch(() => {}).finally(() => seek(smooth.get()))
  }
  useMotionValueEvent(smooth, 'change', seek)

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = beatAt(tour.beats, v)
    setActive((prev) => (prev === next ? prev : next))
  })

  const firstBeat = tour.beats[0].from
  const introOpacity = useTransform(scrollYProgress, (v) => mapRange(v, [firstBeat * 0.2, firstBeat * 0.8], [1, 0]))
  const introY = useTransform(scrollYProgress, (v) => mapRange(v, [0, firstBeat], [0, -48]))
  const introPointer = useTransform(introOpacity, (o) => (o > 0.2 ? 'auto' : 'none'))
  const chromeOpacity = useTransform(scrollYProgress, (v) => mapRange(v, [firstBeat * 0.6, firstBeat], [0, 1]))

  // Reduced motion: an ordinary video player instead of a pinned scrub.
  if (reduce) {
    return (
      <section ref={sectionRef} hidden={missing} className="bg-black text-white px-6 md:px-12 pt-24 md:pt-32 pb-16 md:pb-24">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{tour.eyebrow}</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">{tour.title}</h2>
          <p className="mt-3 text-base md:text-lg text-white/80 max-w-2xl">{tour.subtitle}</p>
          <video
            src={tour.src}
            poster={tour.poster}
            controls
            muted
            playsInline
            preload="metadata"
            onError={() => setMissing(true)}
            className="mt-8 w-full rounded-2xl bg-white/5"
          />
        </div>
      </section>
    )
  }

  const beat = tour.beats[active]

  return (
    <section
      ref={sectionRef}
      hidden={missing}
      aria-label={`${tour.label}: a video tour of our interior work`}
      className="relative bg-black"
      style={{ height: `${tour.vh}vh` }}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl ?? undefined}
          poster={tour.poster}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onLoadedData={onLoadedData}
          onSeeked={onSeeked}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Legibility shades */}
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

        {/* Tour label, once the intro has gone */}
        <motion.div
          style={{ opacity: chromeOpacity }}
          className="absolute z-30 inset-x-0 top-0 px-6 md:px-12 pt-8 md:pt-28 pointer-events-none"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{tour.eyebrow}</p>
          <p className="mt-2 text-lg md:text-2xl font-bold text-white">{tour.label}</p>
          {tour.credit && <p className="md:hidden mt-1 text-[10px] text-white/60">{tour.credit}</p>}
        </motion.div>

        {/* A sample is always marked as one, with its footage credit */}
        {tour.sample && (
          <div className="absolute z-30 right-6 md:right-12 top-8 md:top-28 flex flex-col items-end gap-1.5 pointer-events-none">
            <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/30 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              Sample video
            </span>
            {tour.credit && <span className="hidden md:block text-[10px] text-white/60">{tour.credit}</span>}
          </div>
        )}

        {!videoUrl && (
          <div className={`absolute z-30 right-6 md:right-12 ${tour.sample ? 'top-24 md:top-44' : 'top-8 md:top-28'} flex items-center gap-2 text-xs font-semibold text-white/70`}>
            <Loader2 size={14} className="animate-spin" />
            Loading tour
          </div>
        )}

        {/* Intro: darkens the first frame, then lifts away as you scroll in */}
        <motion.div
          style={{ opacity: introOpacity, y: introY, pointerEvents: introPointer }}
          className="absolute z-20 inset-0 flex flex-col items-center justify-center text-center px-6 bg-black/35"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">{tour.eyebrow}</p>
          <h2 className="mt-4 text-4xl sm:text-5xl md:text-7xl font-black text-white tracking-tight leading-[1.02] max-w-4xl">
            {tour.title}
          </h2>
          <p className="mt-4 md:mt-6 text-base md:text-xl text-white/80 max-w-2xl leading-relaxed">{tour.subtitle}</p>
          {skipTo && (
            <a href={skipTo} className="mt-8 text-sm font-semibold text-white/75 hover:text-white underline-offset-4 hover:underline transition-colors">
              Skip to the inquiry form
            </a>
          )}
          <div className="absolute bottom-28 md:bottom-12 flex flex-col items-center gap-2 text-white/85">
            <span className="text-[11px] font-semibold uppercase tracking-widest">Scroll to step inside</span>
            <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
              <ArrowDown size={18} />
            </motion.span>
          </div>
        </motion.div>

        {/* Where you are on the tour */}
        <div className="absolute z-30 inset-x-0 bottom-0 px-6 md:px-12 pb-28 md:pb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6 pointer-events-none">
          <div className="max-w-xl">
            <AnimatePresence mode="wait" initial={false}>
              {beat && (
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <h3 className="text-3xl md:text-6xl font-black text-white tracking-tight leading-[1.02]">{beat.title}</h3>
                  <p className="mt-2 md:mt-3 text-base md:text-lg text-white/80">{beat.note}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.ol style={{ opacity: chromeOpacity }} className="flex md:flex-col gap-2 md:gap-2.5 md:items-end">
            {tour.beats.map((b, i) => {
              const current = i === active
              return (
                <li key={b.title} className="flex items-center gap-2.5 md:flex-row-reverse">
                  <span className={`block h-[3px] rounded-full transition-all duration-500 ${current ? 'w-10 bg-white' : 'w-4 bg-white/35'}`} />
                  <span className={`hidden md:inline text-[12px] font-semibold transition-colors duration-500 ${current ? 'text-white' : 'text-white/45'}`}>
                    {b.title}
                  </span>
                </li>
              )
            })}
          </motion.ol>
        </div>
      </div>
    </section>
  )
}
