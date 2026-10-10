---
name: framer-motion
description: Framer Motion animation patterns for this project — scroll reveals, staggered text, parallax, scroll-linked transforms, hero entrances, and reduced-motion handling. Use whenever adding or changing animations, parallax, scroll effects, transitions, or "make it more modern/animated" work on any page or component in src/.
---

# Framer Motion in iloilo-rentals

`framer-motion` (v12) is already installed and used across the app. Import from `'framer-motion'`, never add another animation library (GSAP, AOS, react-spring, etc.).

Reference implementation: `src/pages/public/HomePage.jsx`. Copy its helpers rather than reinventing them.

## House style

- Easing: `const EASE = [0.16, 1, 0.3, 1]` (expo-out). Use it for reveals and entrances.
- Durations: 0.7–1.4s for reveals, 0.3–0.5s for hover/UI feedback.
- Reveals play once: `viewport={{ once: true, amount: 0.3–0.6 }}`.
- Brand color: `#2d568e` (`LOGO_BLUE`).
- **Icons have no background.** Render lucide icons bare (colored stroke, `strokeWidth` ~1.4). No tinted circles/squares/pills behind them.
- Hover effects stay in Tailwind (`hover:-translate-y-1`, `hover:shadow-xl`, `group-hover:translate-x-1`) — no need for `whileHover` unless it needs spring physics.

## Critical: the homepage scrolls inside a container, not the window

`HomePage` renders a `fixed ... overflow-y-scroll` div (`containerRef`) as the scroller. `useScroll()` with no options tracks the window and will never move there. Always pass the container:

```jsx
const ScrollContainerContext = createContext(null)
// provider at page root:
<ScrollContainerContext.Provider value={containerRef}>…</ScrollContainerContext.Provider>

function useSectionProgress(ref, offset = ['start end', 'end start']) {
  const container = useContext(ScrollContainerContext)
  const { scrollYProgress } = useScroll({ target: ref, container, offset })
  return scrollYProgress
}
```

On normal pages that scroll the window, omit `container`. Check which one the page uses before writing scroll-linked code. `whileInView` works in both cases.

## Patterns

### Fade-up reveal
```jsx
<motion.div
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.5 }}
  transition={{ duration: 1, ease: EASE }}
/>
```

### Staggered children (headings, paragraphs, bullet lists)
```jsx
const staggerParent = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }
const staggerChild = {
  hidden: { opacity: 0, y: 32, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE } },
}
// <Stagger> = motion.div with variants={staggerParent} initial="hidden" whileInView="show"
// <Item as="h2"> = motion[as] with variants={staggerChild}
```
For on-load (hero) use `animate="show"` instead of `whileInView`.

### Parallax
```jsx
function useParallax(ref, distance = 80) {
  const reduce = useReducedMotion()
  const progress = useSectionProgress(ref)
  const d = reduce ? 0 : distance
  return useTransform(progress, [0, 1], [d, -d])
}
```
Layer several speeds for depth: image inside frame (60), frame (-30), decorative big number/blob (140–160). Parallax images need `overflow-hidden` on the frame and `scale: 1.2+` on the image so edges never show. Full-bleed backgrounds: make the layer `top: -20%; height: 140%` and keep `y` within ±12%.

### Clip-path image reveal
```jsx
initial={{ clipPath: 'inset(18% 18% 18% 18% round 24px)', opacity: 0.4 }}
whileInView={{ clipPath: 'inset(0% 0% 0% 0% round 24px)', opacity: 1 }}
transition={{ duration: 1.4, ease: EASE }}
```

### Scroll-linked hero exit
```jsx
const { scrollY } = useScroll({ container: containerRef })
const y = useTransform(scrollY, [0, heroHeight], [0, -160])
const scale = useTransform(scrollY, [0, heroHeight], [1, 0.88])
const opacity = useTransform(scrollY, [0, heroHeight * 0.8], [1, 0])
```
Put scroll-driven `style` on an outer `motion.div` and the entrance `initial/animate` on an inner one — mixing both on one element makes them fight.

### Scroll marquee
Two `w-max whitespace-nowrap` rows; `x` mapped from section progress to `['0%','-35%']` and the reverse. Second row uses an outlined style (`-webkit-text-stroke`).

### Progress bar
```jsx
const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 })
<motion.div className="fixed top-0 inset-x-0 h-1 origin-left z-50" style={{ scaleX }} />
```

### Pinned scroll-driven section (homepage `ServicesShowcase`)
Section stays still on screen while scrolling steps through items, then releases to the content below.
```jsx
<section ref={ref} style={{ height: `${(items.length + 1) * 100}vh` }}>   {/* ~100vh of scroll per item */}
  <div className="sticky top-0 h-svh overflow-hidden">…</div>
</section>

const progress = useSectionProgress(ref, ['start start', 'end end'])   // 0 = pinned, 1 = releasing
useMotionValueEvent(progress, 'change', (v) => {
  const next = Math.min(n - 1, Math.floor(v * n))
  setActive((prev) => (prev === next ? prev : next))                  // re-render only on index change
})
```
Swap content with `<AnimatePresence mode="wait">` keyed by the active item. Progress bars: one child component per segment using `useTransform(progress, [i/n, (i+1)/n], [0, 1])` as `scaleX` (hooks can't be called inside `.map`). Sticky breaks if any ancestor between it and the scroller has `overflow: hidden` — put `overflow-hidden` on the sticky child, never on the tall section.

**Hole transition** (current homepage version — took many rounds, so follow it exactly). Spec: `|)(|`, two holes **cut into the blue background**, each half a pill cut top to bottom. The flat `|` is the opening, the curved `)` the back. Each hole is **exactly as tall as the content beside it**, so on a swap the text and photo **just slide sideways** into it: **no shrinking or backing up first**, no scale, no shadows, darkening or glows. Content passes **over** the `|`, stays visible inside the hole, and slips **under** the `)`. Holes are narrow (desktop `--hole-w: 36px`) with a modest gap (`--hole-gap: 40px`). They must look natural. The fill is a translucent-black gradient, **fully clear at the `|` opening** (no line there; it melts into the background) and darkest at the curved back, so the background blues show through. Add a soft inset shade under the curved lip and a faint `border-white/15` highlight on the curve only. Nothing heavy.

Rejected earlier versions:
- a pillar the content hid behind;
- full `()()` pills;
- squeezing into a slit;
- shrinking to fit a shorter hole (read as "backing up");
- solid black holes with heavy darkening;
- white holes.

Implementation (`ServicesShowcase` / `HoleLane` / `laneGeometry`): the stage is a size container (`[container-type:size]`). Each element is rendered twice in identical stage-sized frames:
- **Copy A** in place, `clipPath` cut at the opening.
- **Copy B** inside the hole: a `rounded-r-full`/`rounded-l-full` `overflow-hidden` white half-pill holding a `100cqw × 100cqh` frame shifted to line up with the stage.

Elements sit `--hole-space` (desktop 32px, mobile 14px) back from their hole so they don't touch it at rest; the clip stays at the opening, not the element edge. Both copies get `slideVariants` (`x: ±120%`, enough for the trailing edge to cross the space and clear the hole). Copy A's clip reaches `SEAM` (2px) past the opening, over copy B. Without that overlap, the two abutting anti-aliased edges leave a faint visible line at fractional zoom (110%, DPR 1.1). Test that with `deviceScaleFactor: 1.1`. **Never use `backdrop-filter` (e.g. `backdrop-blur`) on anything that slides into a hole.** Copy B samples a different backdrop, so it renders differently and shows a seam at the opening. Use a plain translucent fill (the photo label uses `bg-black/45`). Desktop: holes in the middle, photo and text swap sides each step. Mobile (photo stacked over text): each row has its own hole at the screen edge: the photo slides right into a right-edge hole, the text left into a left-edge hole. Holes are always visible; there are no timers.
Short screens (110% zoom laptops): hide bullets at `max-height:820px` and the icon at `max-height:760px`. Verify with headless-Chrome frame captures mid-swap (≈300/420/560/900 ms).

### See-through windows (homepage `WindowSection`)
Absolutely positioned pills (`rounded-full overflow-hidden`) each hold the same `<img>`, sized and offset in % so the photo lines up across all of them: `width: 100/W*100%`, `left: -(L/W)*100%` (same for height/top). To make pills move while the photo stays fixed, give the pill `y` and the img `useTransform(y, v => -v)`.

### Infinite marquee (testimonials)
CSS keyframe `translateX(-50%)` over two copies of the items. Space items with per-item padding, not `gap`, or the loop jumps by half a gap. Pause on hover with `animation-play-state`; edge fade via `mask-image` linear gradient.

### Scroll-filled headline (homepage `FinalCTA`)
Split the headline into words; each word is a small component with `opacity = useTransform(progress, [i/n, (i+1)/n], [0.15, 1])`. Put `aria-label` with the full text on the heading and `aria-hidden` on the word spans.

### Navbar that forms on scroll (`src/lib/navReveal.js`)
`navReveal` is a shared `motionValue` (0 = top of homepage, 1 = full pill). HomePage sets it from its container's `scrollY` (0–260px) and resets it to 1 on unmount. `Navbar.jsx` smooths it with `useSpring` (overdamped, no overshoot) and maps it to: row `width` (measured spread width → measured packed pill width; links use `justify-between` so they spread evenly), glass layer opacity, a hairline under the spread row, and CSS variables for text colour (dark on the white hero → light on the glass, with a short colour window so mid-greys never show). The active-link highlight uses `layoutId` inside the link so it follows the link as the row narrows. The user wants the links visible at the top, not hidden. Use the same module for any other component outside the homepage tree that needs the homepage's scroll position.

### Carousels / swapping content
`<AnimatePresence mode="popLayout" initial={false}>` with a `key` that changes per slide; enter from `x: 40`, exit to `x: -40`.

## Porting components (21st.dev, Aceternity, shadcn blocks)

- Project is JavaScript + Vite (`components.json` has `tsx: false`): convert to `.jsx` in `src/components/ui/`, strip types and `"use client"`.
- Replace `next/image` → `<img loading="lazy">`, `next/link` → react-router `Link` (internal) or `<a>` (external).
- Any `useScroll({ target })` inside the component needs a `container` prop when used on the homepage.
- Existing ports: `hero-parallax.jsx` (tilted rows under a header, takes `children` as header; used by the homepage hero) and `tilted-grid-hero.jsx` (curved CSS-3D image band; currently unused — the user preferred a static photo per service over a moving band).

### Scroll walkthrough (`src/components/public/InteriorWalkthrough.jsx`, List Property page)
A pinned section (`VH_PER_SHOT` × stops tall) where scroll drives a camera through photos of a unit. Each stop has a camera move (`enter` = dolly forward, `lookRight`/`lookLeft` = pan + small `rotateY` under `perspective`, `lookUp` = tilt, `closer` = push in). Photos are scaled so a move never shows an edge: keep |x|,|y| under (scale − 1) / 2 in %. The next stop fades in **on top** while the previous one keeps moving underneath; there's no fade-out, which would dip to black.

**Gotcha: window-scroll `useScroll({ target, offset })` + array-form `useTransform`.** Framer hands opacity to the browser's native ScrollTimeline, which mapped the offsets wrong: a hint meant to fade by 4% was still 48% visible halfway down. The inline style said 1 while the computed opacity was wrong. Use the **function form** (`useTransform(p, v => mapRange(v, …))`), which always runs in JS. Check with `getComputedStyle(el).opacity` vs `el.style.opacity` if values look off.

## Accessibility & performance

- Wrap the page in `<MotionConfig reducedMotion="user">` and zero out `useTransform` distances when `useReducedMotion()` is true (MotionConfig does not affect scroll-linked transforms).
- Disable CSS keyframe loops under `@media (prefers-reduced-motion: reduce)`.
- Animate only `transform`, `opacity`, `clipPath`, `filter`. Never animate `width/height/top/left` on scroll.
- Prefer `useTransform`/`useSpring` motion values over React state for anything driven by scroll — no `setState` in scroll handlers.
- Decorative animated layers get `aria-hidden="true"` and `pointer-events-none`.
- Add `overflow-hidden` to sections containing parallax layers so they don't cause horizontal scroll on mobile.

## Verify

Run `npx eslint <file>` after edits, then check the page at http://localhost:5173 (dev server: `npm run dev`). Test a mobile width too.
