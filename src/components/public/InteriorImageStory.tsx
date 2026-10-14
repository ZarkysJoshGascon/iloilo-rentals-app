import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import {
  motion, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform,
  type MotionValue,
} from 'framer-motion'
import { ArrowDown, ImageOff, RotateCcw } from 'lucide-react'
import {
  INTERIOR_IMAGE_STORIES, type InteriorImageProject, type InteriorStoryFrame,
} from '@/lib/interiorImageStories'

// These are still images: scrolling changes the view without constructing a
// scene, moving a camera or downloading video. Each project has its own stage.
const INTRO_VH = 44
const VIEW_VH = 75
const END_VH = 20
const BLEND = 0.18
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const SHORT_LANDSCAPE = '(orientation: landscape) and (max-height: 599px)'

function isShortLandscape() {
  return window.matchMedia(SHORT_LANDSCAPE).matches
}

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(SHORT_LANDSCAPE)
  query.addEventListener('change', onChange)
  window.addEventListener('resize', onChange)
  return () => {
    query.removeEventListener('change', onChange)
    window.removeEventListener('resize', onChange)
  }
}

type InteriorImageStoryProps = {
  skipTo?: string
}

export default function InteriorImageStory({ skipTo }: InteriorImageStoryProps) {
  const reduce = useReducedMotion()
  // A short landscape screen cannot comfortably hold both the caption chrome
  // and a floor plan. The gallery keeps every image readable in that viewport.
  const shortLandscape = useSyncExternalStore(subscribeToViewport, isShortLandscape, () => false)
  const gallery = reduce || shortLandscape
  return (
    <div id="interior-image-stories">
      {INTERIOR_IMAGE_STORIES.map((project, index) => gallery
        ? <ProjectGallery key={project.key} project={project} index={index} skipTo={skipTo} />
        : <ProjectStory key={project.key} project={project} index={index} skipTo={skipTo} />)}
    </div>
  )
}

type ProjectProps = {
  project: InteriorImageProject
  index: number
  skipTo?: string
}

function ProjectStory({ project, index, skipTo }: ProjectProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const near = useInView(sectionRef, { once: true, margin: '125% 0px' })
  const [active, setActive] = useState(0)
  const [showIntro, setShowIntro] = useState(true)
  const total = project.frames.length
  const distance = INTRO_VH + total * VIEW_VH + END_VH
  const start = INTRO_VH / distance
  const end = (INTRO_VH + total * VIEW_VH) / distance
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  const views = useTransform(scrollYProgress, (value) => clamp01((value - start) / (end - start)) * total)
  const introOpacity = useTransform(scrollYProgress, (value) => 1 - clamp01((value - start * 0.15) / (start * 0.7)))
  const introPointer = useTransform(introOpacity, (value) => value > 0.15 ? 'auto' : 'none')
  const chromeOpacity = useTransform(scrollYProgress, (value) => clamp01((value - start * 0.55) / (start * 0.4)))
  // A restrained warm pulse marks each change of image. Its peak is only
  // 0.09 opacity and it follows the scroll, with no looping animation.
  const flash = useTransform(views, (value) => {
    const boundary = Math.round(value)
    if (boundary <= 0 || boundary >= total) return 0
    return Math.max(0, 1 - Math.abs(value - boundary) / BLEND) * 0.09
  })

  useMotionValueEvent(views, 'change', (value) => {
    const next = Math.max(0, Math.min(total - 1, Math.floor(value)))
    setActive((previous) => previous === next ? previous : next)
  })
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const visible = value < start * 0.85
    setShowIntro((previous) => previous === visible ? previous : visible)
  })

  const goToView = (frameIndex: number) => {
    const section = sectionRef.current
    if (!section) return
    const track = section.offsetHeight - window.innerHeight
    const progress = start + (frameIndex + 0.2) / total * (end - start)
    window.scrollTo({
      top: window.scrollY + section.getBoundingClientRect().top + track * progress,
      behavior: 'smooth',
    })
  }
  const frame = project.frames[active]

  return (
    <section
      ref={sectionRef}
      id={`project-${project.key}`}
      aria-label={`${project.title}: design images`}
      className="relative bg-[#0b0f17] text-white"
      style={{ height: `${distance + 100}vh` }}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        {project.frames.map((view, frameIndex) => (
          <StoryFrame
            key={view.key}
            frame={view}
            index={frameIndex}
            total={total}
            views={views}
            active={frameIndex === active}
            load={near && Math.abs(frameIndex - active) <= 1}
          />
        ))}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-[#f5e4c9]" style={{ opacity: flash }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-black/70 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        <motion.div style={{ opacity: introOpacity }} className="pointer-events-none absolute inset-x-0 top-0 px-6 pt-24 text-center md:pt-28">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/70 md:text-xs">{project.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight md:text-6xl">{project.title}</h2>
          <p className="mt-3 text-sm text-white/75 md:text-base">{project.facts}</p>
        </motion.div>
        <motion.div style={{ opacity: introOpacity, pointerEvents: introPointer }} inert={!showIntro} aria-hidden={!showIntro} className="absolute inset-x-0 bottom-28 flex items-end justify-between gap-4 px-6 md:bottom-10 md:px-12">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/85"><ArrowDown size={16} aria-hidden />Scroll to explore</span>
          {skipTo && <a href={skipTo} className="text-[11px] font-semibold text-white/75 underline underline-offset-4 hover:text-white">Skip to inquiry</a>}
        </motion.div>

        <motion.div style={{ opacity: chromeOpacity }} inert={showIntro} aria-hidden={showIntro} className="pointer-events-none absolute inset-0 [text-shadow:0_1px_10px_rgba(0,0,0,0.55)]">
          <div className="absolute inset-x-0 top-0 px-6 pt-24 md:px-12 md:pt-28">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{project.eyebrow}</p>
            <p className="mt-1.5 text-xl font-bold tracking-tight md:text-3xl">{project.title}</p>
            <p className="mt-1 text-sm text-white/75 md:text-base">{project.facts}</p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Design concept · {String(index + 1).padStart(2, '0')} / {String(INTERIOR_IMAGE_STORIES.length).padStart(2, '0')}</p>
          </div>

          <div className="absolute inset-x-0 bottom-0 px-6 pb-28 md:px-12 md:pb-12">
            <div className="max-w-xl" aria-live="off">
              <h3 className="text-4xl font-black leading-[1] tracking-tight md:text-7xl">{frame.title}</h3>
              <p className="mt-2 max-w-lg text-base text-white/85 md:mt-3 md:text-lg">{frame.note}</p>
            </div>
            <div className="mt-5 flex items-center justify-between gap-4">
              <ol className="pointer-events-auto flex gap-1.5" aria-label={`${project.title} views`}>
                {project.frames.map((view, frameIndex) => (
                  <li key={view.key}>
                    <button
                      type="button"
                      onClick={() => goToView(frameIndex)}
                      aria-label={`View ${view.title}`}
                      aria-current={frameIndex === active ? 'step' : undefined}
                      title={view.title}
                      className="group flex min-h-8 min-w-8 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      <span aria-hidden className={`block h-[3px] rounded-full transition-[width,background-color] duration-300 ${frameIndex === active ? 'w-9 bg-white' : frameIndex < active ? 'w-4 bg-white/70' : 'w-4 bg-white/30 group-hover:bg-white/65'}`} />
                    </button>
                  </li>
                ))}
              </ol>
              <span className="text-[11px] font-semibold tabular-nums text-white/65">{String(active + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

type StoryFrameProps = {
  frame: InteriorStoryFrame
  index: number
  total: number
  views: MotionValue<number>
  active: boolean
  load: boolean
}

function StoryFrame({ frame, index, total, views, active, load }: StoryFrameProps) {
  const opacity = useTransform(views, (value) => {
    const fadeIn = index === 0 ? 1 : clamp01((value - index + BLEND) / (BLEND * 2))
    const fadeOut = index === total - 1 ? 1 : 1 - clamp01((value - index - 1 + BLEND) / (BLEND * 2))
    return Math.min(fadeIn, fadeOut)
  })
  return (
    <motion.div className="absolute inset-0" style={{ opacity, pointerEvents: active ? 'auto' : 'none' }} aria-hidden={!active} inert={!active}>
      <StoryImage frame={frame} load={load} presentation="stage" />
    </motion.div>
  )
}

type StoryImageProps = {
  frame: InteriorStoryFrame
  load?: boolean
  presentation: 'stage' | 'gallery'
}

function StoryImage({ frame, load = true, presentation }: StoryImageProps) {
  const [requested, setRequested] = useState(load)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { if (load) setRequested(true) }, [load])
  const plan = frame.kind === 'plan'
  const stage = presentation === 'stage'
  const position = {
    '--story-position': frame.position || '50% 50%',
    '--story-mobile-position': frame.mobilePosition || frame.position || '50% 50%',
  } as CSSProperties

  return (
    <div className={`relative h-full w-full bg-[#10151b] ${stage ? '' : 'overflow-hidden rounded-xl'}`}>
      {requested && !failed && (
        <img
          key={attempt}
          src={frame.src}
          alt={frame.alt}
          decoding="async"
          loading={stage ? 'eager' : 'lazy'}
          draggable={false}
          onError={() => setFailed(true)}
          style={position}
          className={`h-full w-full ${plan
            ? `object-contain ${stage ? 'px-5 pb-52 pt-44 md:px-24 md:pb-48 md:pt-40' : 'p-4'}`
            : stage
              ? 'object-cover object-[var(--story-mobile-position)] md:object-[var(--story-position)]'
              : 'object-contain'}`}
        />
      )}
      {failed && (
        <div className="flex h-full w-full flex-col items-center justify-center px-6 py-12 text-center text-white/75">
          <ImageOff size={30} className="text-white/35" aria-hidden />
          <p className="mt-4 text-lg font-semibold text-white">{frame.title}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed">This image couldn’t load. You can try again or continue to the next view.</p>
          <button type="button" onClick={() => { setAttempt((value) => value + 1); setFailed(false) }} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-5 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <RotateCcw size={13} aria-hidden />Try again
          </button>
        </div>
      )}
    </div>
  )
}

function ProjectGallery({ project, index, skipTo }: ProjectProps) {
  return (
    <section id={`project-${project.key}`} aria-labelledby={`heading-${project.key}`} className="bg-[#0b0f17] px-6 py-20 text-white md:px-12 md:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{project.eyebrow} · {String(index + 1).padStart(2, '0')}</p>
        <h2 id={`heading-${project.key}`} className="mt-3 text-3xl font-black tracking-tight md:text-5xl">{project.title}</h2>
        <p className="mt-3 text-sm text-white/75 md:text-base">{project.facts}</p>
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {project.frames.map((frame) => (
            <figure key={frame.key}>
              <div className={`w-full ${frame.kind === 'plan' ? 'aspect-[4/3]' : 'aspect-square'}`}><StoryImage frame={frame} presentation="gallery" /></div>
              <figcaption className="mt-4">
                <h3 className="text-2xl font-bold tracking-tight">{frame.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">{frame.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        {skipTo && <a href={skipTo} className="mt-10 inline-flex min-h-11 items-center rounded-full border border-white/30 px-6 text-sm font-semibold hover:bg-white/10">Start your project</a>}
      </div>
    </section>
  )
}
