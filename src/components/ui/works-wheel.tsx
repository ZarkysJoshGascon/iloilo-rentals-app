// A portfolio index built as a wheel you turn. Adapted from crafterui's
// WorksWheel. Changes for this site:
// - photos take a `fallback` (see Photo) and internal links use the router
// - pass `progress` (a 0–1 motion value, e.g. a pinned section's scroll
//   progress) and the page's own scrolling turns the wheel — works with touch,
//   and never takes the scroll away from the page
// - without `progress` it turns with the mouse wheel and by dragging; it only
//   takes the wheel once the section fills the screen, and a drag starts only
//   after the pointer moves, so a plain click still opens a card
// - portrait screens get a wider card, a ring that fits, and the caption below
// - the front card's title can carry an `eyebrow` and a `description`
//
// At rest the work sits in a ring around a title, each card tangent to the
// circle. The first notch of scroll blows the ring open into a vertical drum:
// the card at the front lies flat and full size, the ones above and below
// rotate away into hard perspective and run off the top and bottom of the
// frame. Keep turning and the drum carries the next piece round to the front.
//
// The whole thing is one number - `turn` - read by a single rAF pass that writes
// transforms straight to the DOM. 0 is the ring, 1 is the drum with item 0 at
// the front, and every whole number after that is one more item turned past.
import * as React from 'react'
import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Photo } from '@/components/ui/photo'

/* Geometry. The card is measured against the stage; everything else is measured
   against the card, so a narrow stage - where the card is capped by width, not
   height - scales the whole wheel down with it instead of leaving a small card
   swinging on a huge drum. The three that matter are tuned together: STEP
   against DRUM sets how hard the neighbours rotate away, and DRUM against LENS
   decides whether they land inside the frame or run off it. */
const CARD_H = 0.38 // front card height, of the stage
const CARD_MAX_W = 0.34 // ... but never wider than this much of the stage
const CARD_MAX_W_NARROW = 0.84 // ... or this much, on a portrait screen
const CARD_RATIO = 1.45 // card width / height
const STEP = 40 // degrees between cards on the drum
const DRUM = 2.22 // drum radius, in card heights - and everything below likewise
const LENS = 2.7 // perspective distance
const RING_R = 0.8 // ring radius
/** Largest a card gets on the ring. With only a few pieces they would otherwise
    stay full size and cross at the corners instead of reading as a ring. */
const RING_MAX_SCALE = 0.6
/** The ring (cards included) never reaches past this much of the stage's
    half-width or half-height; on a narrow screen it shrinks to fit. */
const RING_ROOM = 0.9
/* The drum alone hangs the work on a plumb line. It isn't one: the strip curves
   away round an arc whose centre sits off to the LEFT, so the piece at the front
   is at the arc's near point - dead centre - and its neighbours have already
   swung back left as well as up and down. BOW is that arc's radius; nothing else
   makes the difference between a stack of cards and a wheel seen side on. */
const BOW = 1.82
const TITLE = 0.124 // ring label and front-card title
const INDEX = 0.04 // the index down the right-hand side
/** Items either side of the front still worth drawing. Past this a card is
    edge-on, and further round it would stack up on the vanishing point. */
const CULL = 1.6
/** Portrait: where the wheel's centre sits, as a fraction of the stage height.
    Higher than the middle to leave room for the caption under the front card. */
const NARROW_CENTER = 0.42

/** How much of a dragged pixel counts as one item. */
const DRAG_UNITS = 420
/** Pixels a press has to move before it counts as a drag rather than a click. */
const DRAG_SLOP = 6
/** Quiet time after the last wheel event before the wheel settles on an item. */
const SETTLE = 140
/** Fraction of the remaining distance closed each frame. 1 = no smoothing. */
const EASE = 0.12
/** How far (of the viewport height) the section may sit off-frame and still
    take the wheel. It is squared up to the frame as it does. */
const FRAME_SLACK = 0.15

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const lerp = (a, b, t) => a + (b - a) * t

const rad = (deg) => (deg * Math.PI) / 180

/** How far left the arc has carried something that has turned `drumDeg` off the
    front. Zero at the front, so the piece being read stays centred. */
const bowAt = (drumDeg, bow) => -bow * (1 - Math.cos(rad(drumDeg)))

/** Both states in one chain: the ring terms fall away as `m` reaches the drum,
    and the drum terms are still zero while the ring is up. The bow is applied
    first, in the wheel's own plane, so it slides the card sideways rather than
    turning with it - and perspective still shrinks it with distance. */
function place(ringDeg, drumDeg, ringR, drumR, bow, m) {
  return (
    `translateX(${m * bowAt(drumDeg, bow)}px)` +
    ` rotateZ(${(1 - m) * ringDeg}deg) translateY(${-(1 - m) * ringR}px)` +
    ` rotateX(${m * drumDeg}deg) translateZ(${m * drumR}px)`
  )
}

/** Scroll position (0–1) → turn, with a dwell at every whole turn: the wheel
    eases in and out of each one, so a card rests at the front for a moment
    instead of sliding straight past. */
function dwell(v, turns) {
  const raw = clamp(v, 0, 1) * turns
  return raw - Math.sin(2 * Math.PI * raw) / (2 * Math.PI)
}

type WorksWheelProps = {
  items: any
  label?: string
  action?: string
  progress: any
  onPick: (i: any) => void
  wheelUnits?: number
  className: string
  [key: string]: any
}

/**
 * items      — [{ title, image, fallback?, href?, eyebrow?, description? }]
 * label      — sits in the middle of the ring
 * action     — label on a card's hover affordance; omit to drop it
 * progress   — optional 0–1 motion value that drives the wheel (see above)
 * onPick     — optional; called with an item's index when it is picked in the
 *              index, instead of turning to it (with `progress`, scroll there)
 * wheelUnits — how much wheel delta turns one item, without `progress`
 */
export function WorksWheel({
  items,
  label = "Works '26",
  action = 'View',
  progress,
  onPick,
  wheelUnits = 900,
  className,
  ...props
}: WorksWheelProps) {
  const sectionRef = React.useRef(null)
  const stageRef = React.useRef(null)
  const wheelRef = React.useRef(null)
  const cardRefs = React.useRef([])
  const labelRef = React.useRef(null)
  const titleRef = React.useRef(null)

  // The wheel's position, and where it is heading. Only `active` is state -
  // everything else is written to the DOM, so turning the wheel is not a render.
  const turn = React.useRef(0)
  const target = React.useRef(0)
  const [active, setActive] = React.useState(0)
  const [stage, setStage] = React.useState({ w: 0, h: 0 })

  const count = items.length
  const last = Math.max(count - 1, 0)
  const scrolled = Boolean(progress)

  // Reduced motion drops the easing, so the wheel lands where it is put
  // instead of gliding there.
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => setReduced(query.matches)
    read()
    query.addEventListener('change', read)
    return () => query.removeEventListener('change', read)
  }, [])

  React.useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const read = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const metrics = React.useMemo(() => {
    const { w, h } = stage
    const narrow = w < h * 0.8
    const cardW = Math.min(h * CARD_H * CARD_RATIO, w * (narrow ? CARD_MAX_W_NARROW : CARD_MAX_W))
    const cardH = cardW / CARD_RATIO
    const drumR = cardH * DRUM
    let ringR = cardH * RING_R
    // Shrink the ring's cards until the circle reads as a closed loop rather
    // than beads on a wire, however many pieces the wheel is given.
    let ringScale = count
      ? clamp((((2 * Math.PI * ringR) / count) * 0.82) / (cardW || 1), 0.16, RING_MAX_SCALE)
      : 1
    // Then shrink the whole ring until it fits the stage.
    const fit = Math.min(1, ((Math.min(w, h) / 2) * RING_ROOM) / (ringR + (ringScale * cardH) / 2 || 1))
    ringR *= fit
    ringScale *= fit
    return {
      narrow,
      centerY: narrow ? NARROW_CENTER : 0.5,
      cardW,
      cardH,
      ringR,
      ringScale,
      drumR,
      bow: cardH * BOW,
      depth: cardH * LENS,
      title: cardH * TITLE,
      label: cardH * TITLE * fit,
      // The open middle of the ring, so the label stays inside it.
      labelW: 2 * (ringR - (ringScale * cardH) / 2) * 0.9,
      index: cardH * INDEX,
      // The front card's left edge, so the title beside it never runs under it.
      cardLeft: (w - cardW) / 2,
    }
  }, [stage, count])

  // One pass per frame: ease toward the target, then write every transform.
  // Once the wheel is at rest the frame does nothing.
  React.useEffect(() => {
    if (!stage.h) return
    let frame = 0
    let drawn = false
    const { ringR, ringScale, drumR, bow, narrow } = metrics

    const draw = () => {
      frame = requestAnimationFrame(draw)
      if (drawn && turn.current === target.current) return
      drawn = true
      const gap = target.current - turn.current
      if (Math.abs(gap) < 0.0005) turn.current = target.current
      else turn.current += gap * (reduced ? 1 : EASE)

      const t = turn.current
      const m = clamp(t, 0, 1)
      const pos = Math.max(0, t - 1)

      // The drum is pulled back so its front face lands on the picture plane.
      // That set-back has to arrive with the drum, or the ring would sit at the
      // far side of the perspective and render at half its size.
      if (wheelRef.current) {
        wheelRef.current.style.transform = `translateZ(${-m * drumR}px)`
      }

      for (let i = 0; i < count; i++) {
        const d = i - pos
        const drumDeg = d * STEP
        const card = cardRefs.current[i]
        if (card) {
          card.style.transform = place(d * (360 / count), drumDeg, ringR, drumR, bow, m)
          // Culled by distance, not by angle: at a full turn the far side comes
          // back round to face us, and everything past the neighbours lands on
          // the vanishing point in a heap. On a portrait screen the caption sits
          // under the front card, so pieces already turned past fade out there.
          let opacity = m > 0.5 && Math.abs(d) > CULL ? 0 : 1
          if (narrow && m > 0.5 && d < 0) opacity = clamp(1 + d * 1.6, 0, 1)
          card.style.opacity = String(opacity)
          card.style.zIndex = String(Math.round(100 - Math.abs(d) * 2))
        }
        const face = card?.firstElementChild
        if (face) face.style.transform = `scale(${lerp(ringScale, 1, m)})`
      }

      if (labelRef.current) labelRef.current.style.opacity = String(1 - m)
      if (titleRef.current) titleRef.current.style.opacity = String(m)
      const near = clamp(Math.round(pos), 0, last)
      setActive((prev) => (prev === near ? prev : near))
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [metrics, stage.h, count, last, reduced])

  // Scroll-driven: follow the motion value.
  React.useEffect(() => {
    if (!progress) return
    const follow = (v) => {
      target.current = dwell(v, last + 1)
    }
    follow(progress.get())
    return progress.on('change', follow)
  }, [progress, last])

  const to = React.useCallback(
    (next) => {
      target.current = clamp(next, 0, last + 1)
    },
    [last],
  )

  const settling = React.useRef(0)

  // Native listener, because the wheel has to be cancellable - and it only
  // cancels while it still has somewhere to go, so the page scrolls on at
  // either end instead of trapping the reader.
  React.useEffect(() => {
    const el = stageRef.current
    const section = sectionRef.current
    if (!el || !section || scrolled) return
    const onWheel = (event) => {
      // Until the section fills the screen, the page keeps scrolling.
      const box = section.getBoundingClientRect()
      const slack = window.innerHeight * FRAME_SLACK
      if (box.top < -slack || box.bottom > window.innerHeight + slack) return

      const next = target.current + event.deltaY / wheelUnits
      if (next > 0 && next < last + 1) {
        event.preventDefault()
        if (Math.abs(box.top) > 1) section.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
      to(next)
      // A wheel gesture arrives as a burst of events with no end of its own, so
      // the rest position is whatever notch it happened to stop on. Left there
      // the drum sits between two cards - nothing at the front, and the pair
      // either side of the gap both turned half away. Settle onto an item.
      window.clearTimeout(settling.current)
      settling.current = window.setTimeout(() => to(Math.round(target.current)), SETTLE)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.clearTimeout(settling.current)
    }
  }, [to, last, wheelUnits, scrolled])

  // A press only becomes a drag once it moves; until then it is a click.
  const drag = React.useRef(null)
  const dragged = React.useRef(false)

  const turning = scrolled
    ? {}
    : {
        onPointerDown: (event) => {
          if (event.button !== 0) return
          drag.current = event.clientY
          dragged.current = false
        },
        onPointerMove: (event) => {
          if (drag.current === null) return
          if (!dragged.current) {
            if (Math.abs(event.clientY - drag.current) < DRAG_SLOP) return
            dragged.current = true
            event.currentTarget.setPointerCapture(event.pointerId)
          }
          to(target.current + (drag.current - event.clientY) / DRAG_UNITS)
          drag.current = event.clientY
        },
        onPointerUp: () => {
          // Land on an item rather than between two.
          drag.current = null
          if (dragged.current && target.current > 1) to(Math.round(target.current))
        },
        onPointerCancel: () => {
          drag.current = null
        },
        onClickCapture: (event) => {
          // The end of a drag is not a click on the card under it.
          if (!dragged.current) return
          dragged.current = false
          event.preventDefault()
          event.stopPropagation()
        },
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown') to(Math.round(target.current) + 1)
          else if (event.key === 'ArrowUp') to(Math.round(target.current) - 1)
          else return
          event.preventDefault()
        },
      }

  const front = items[active]
  const { narrow, centerY } = metrics

  return (
    <section
      ref={sectionRef}
      aria-label={label}
      className={cn(
        'bg-background text-foreground relative h-full min-h-[24rem] w-full overflow-hidden select-none',
        className,
      )}
      {...props}
    >
      <div
        ref={stageRef}
        tabIndex={scrolled ? undefined : 0}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`works-wheel-${active}`}
        className={cn(
          'focus-visible:outline-foreground absolute inset-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-4',
          !scrolled && 'cursor-grab touch-pan-x active:cursor-grabbing',
        )}
        style={{ perspective: `${metrics.depth}px`, perspectiveOrigin: `50% ${centerY * 100}%` }}
        {...turning}
      >
        <div
          ref={wheelRef}
          className="absolute left-1/2 [transform-style:preserve-3d]"
          style={{ top: `${centerY * 100}%` }}
        >
          {items.map((item, i) => {
            const internal = item.href?.startsWith('/')
            const Tag: React.ElementType = internal ? Link : item.href ? 'a' : 'div'
            const linkProps = internal ? { to: item.href } : item.href ? { href: item.href } : {}
            return (
              <Tag
                key={item.title}
                {...linkProps}
                id={`works-wheel-${i}`}
                role="option"
                aria-selected={i === active}
                draggable={false}
                ref={(node) => {
                  cardRefs.current[i] = node
                }}
                className="group absolute [backface-visibility:hidden]"
                style={{
                  width: metrics.cardW,
                  height: metrics.cardH,
                  marginLeft: -metrics.cardW / 2,
                  marginTop: -metrics.cardH / 2,
                }}
              >
                <span className="bg-muted shadow-foreground/12 relative block size-full overflow-hidden rounded-lg shadow-[0_18px_40px_-18px_var(--tw-shadow-color)]">
                  <Photo
                    src={item.image}
                    fallback={item.fallback}
                    alt={item.title}
                    draggable={false}
                    className="size-full object-cover"
                  />
                  {action && item.href ? (
                    <span className="bg-background/80 text-foreground pointer-events-none absolute right-3 bottom-3 flex translate-y-1 items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] opacity-0 backdrop-blur-sm transition group-hover:translate-y-0 group-hover:opacity-100">
                      <ArrowUpRight className="size-3" strokeWidth={2} aria-hidden="true" />
                      {action}
                    </span>
                  ) : null}
                </span>
              </Tag>
            )
          })}
        </div>
      </div>

      {/* Ring title and front-card title trade places across the transition.
          Type is sized off the measured stage, not vh, so the wheel keeps its
          proportions inside a card as well as at full bleed. */}
      <div
        ref={labelRef}
        className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 justify-center"
        style={{ top: `${centerY * 100}%` }}
      >
        <span
          className="text-center font-black leading-[1.05] tracking-tight"
          style={{ fontSize: metrics.label, maxWidth: metrics.labelW }}
        >
          {label}
        </span>
      </div>

      {narrow ? (
        // Portrait: the caption sits under the front card.
        <div
          ref={titleRef}
          className="pointer-events-none absolute inset-x-[7%] text-center opacity-0"
          style={{ top: stage.h * centerY + metrics.cardH / 2 + 24 }}
        >
          {front?.eyebrow ? (
            <p className="text-muted-foreground mb-1.5 text-[11px] font-bold tracking-widest uppercase">{front.eyebrow}</p>
          ) : null}
          <p className="text-2xl font-black leading-tight tracking-tight">{front?.title}</p>
          {front?.description ? (
            <p className="text-muted-foreground mx-auto mt-2 max-w-xs text-sm leading-relaxed">{front.description}</p>
          ) : null}
        </div>
      ) : (
        <div
          ref={titleRef}
          className="pointer-events-none absolute top-1/2 left-[8%] -translate-y-1/2 opacity-0"
          style={{ fontSize: metrics.title, maxWidth: Math.max(0, metrics.cardLeft - stage.w * 0.08 - metrics.cardH * 0.12) }}
        >
          {front?.eyebrow ? (
            <p className="text-muted-foreground mb-[0.5em] text-[0.3em] font-bold tracking-widest uppercase">{front.eyebrow}</p>
          ) : null}
          <p className="font-black leading-[1.05] tracking-tight">{front?.title}</p>
          {front?.description ? (
            <p className="text-muted-foreground mt-[0.6em] text-[0.38em] leading-relaxed">{front.description}</p>
          ) : null}
        </div>
      )}

      {narrow ? null : (
        <ol
          className="text-muted-foreground absolute top-[7.5%] right-[2.5%] text-right leading-[1.75]"
          style={{ fontSize: metrics.index }}
        >
          {items.map((item, i) => (
            <li key={item.title}>
              <button
                type="button"
                onClick={() => (onPick ? onPick(i) : to(i + 1))}
                className={cn(
                  'focus-visible:outline-foreground cursor-pointer transition-colors outline-none focus-visible:outline-1',
                  i === active && 'text-foreground font-medium',
                )}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default WorksWheel
