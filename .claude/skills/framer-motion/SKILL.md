---
name: framer-motion
description: Framer Motion animation patterns for this project — scroll reveals, staggered text, parallax, scroll-linked transforms, hero entrances, and reduced-motion handling. Use whenever adding or changing animations, parallax, scroll effects, transitions, or "make it more modern/animated" work on any page or component in src/.
---

# Framer Motion in iloilo-rentals

`framer-motion` (v12) is already installed and used across the app. Import from `'framer-motion'`, never add another animation library (GSAP, AOS, react-spring, etc.).

Reference implementation: `src/pages/public/HomePage.tsx`. Copy its helpers rather than reinventing them.

> **Note (Oct 2026):** the homepage went back to its layout from before the parallax redesign (parent of commit `593ba63`): the hero card over two drifting photo rows, alternating service sections that slide in from the sides, the "Look out the window" banner, the closing section with no buttons and no hero button. It scrolls inside its own container (`containerRef`, passed as a prop, with no `ScrollContainerContext`). From the redesign it kept:
> - the redesign's service content (Property Management, Interior Design, Booking Stays, Affiliate Partner), shown in the old layout;
> - the navbar is a static frosted-white bar on every page (wide, links spread evenly, dark text). It no longer morphs on scroll: the user asked for it to stay white. `navReveal` was removed. Don't push the hero's photo rows down to make room for it: the user saw that as empty space;
> - service photos are isometric cards (`FloatingPhoto`): they flip into place around the upright axis when scrolled into view (from ~105° past rest, back hidden, 1.6s on a gentle ease; the expo `EASE` made the flip too quick to see), then float with a 6s bob at a mild tilt (rotateX 10 / rotateY ±15 / rotateZ ∓2, facing the text) over a blurred ground shadow that shrinks as the card rises. Keep the tilt mild: the user wants the photo easy to see;
> - the page background eases between white and grey (`#eef0f3`) section by section (`ToneZone`: `onViewportEnter` on a band across the middle of the screen sets the canvas colour, with a 0.9s CSS transition). Sections on the canvas stay transparent; the wheel gets `bg-transparent`;
> - phones: the scroll container has `overflow-x-hidden` (the side-sliding reveals pushed the page 56px wide); service text uses a plain fade-up with `amount: 0.15` below `md` (`useIsDesktop`), because at 0.7 the tall stacked text stayed invisible under its photo; both hero photo rows show on phones so the area around the card isn't blank. Check phone changes with a mid-animation sideways-overflow scan, not just a settled screenshot;
> - the scroll-driven `WorksWheel` for "Four ways to work with us";
> - the Supabase photo spots (`Photo` + `useSitePhotos`/`useSiteGallery`);
> - a still grid of review screenshots for "What They Say" (click to enlarge).
>
> These redesign sections described below are no longer on the page: `HeroParallax` hero, `ServicesShowcase` holes, `Preloader`, review marquee, scroll-filled CTA. They live in git at commit `ce5a844`, and `hero-parallax.tsx`, `preloader.tsx` and `preloadImages.ts` are kept but unused.

## House style

- Easing: `const EASE = [0.16, 1, 0.3, 1]` (expo-out). Use it for reveals and entrances.
- Durations: 0.7–1.4s for reveals, 0.3–0.5s for hover/UI feedback.
- Reveals play once: `viewport={{ once: true, amount: 0.3–0.6 }}`.
- Brand color: `#2d568e` (`LOGO_BLUE`).
- **Icons have no background.** Render lucide icons bare (colored stroke, `strokeWidth` ~1.4). No tinted circles/squares/pills behind them.
- Hover effects stay in Tailwind (`hover:-translate-y-1`, `hover:shadow-xl`, `group-hover:translate-x-1`) — no need for `whileHover` unless it needs spring physics.

## Critical: the homepage scrolls inside a container, not the window

`HomePage` renders a `fixed ... overflow-y-scroll` div (`containerRef`) as the scroller. `useScroll()` with no options tracks the window and will never move there. Always pass the container:

```tsx
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
```tsx
<motion.div
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.5 }}
  transition={{ duration: 1, ease: EASE }}
/>
```

### Staggered children (headings, paragraphs, bullet lists)
```tsx
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
```tsx
function useParallax(ref, distance = 80) {
  const reduce = useReducedMotion()
  const progress = useSectionProgress(ref)
  const d = reduce ? 0 : distance
  return useTransform(progress, [0, 1], [d, -d])
}
```
Layer several speeds for depth: image inside frame (60), frame (-30), decorative big number/blob (140–160). Parallax images need `overflow-hidden` on the frame and `scale: 1.2+` on the image so edges never show. Full-bleed backgrounds: make the layer `top: -20%; height: 140%` and keep `y` within ±12%.

### Clip-path image reveal
```tsx
initial={{ clipPath: 'inset(18% 18% 18% 18% round 24px)', opacity: 0.4 }}
whileInView={{ clipPath: 'inset(0% 0% 0% 0% round 24px)', opacity: 1 }}
transition={{ duration: 1.4, ease: EASE }}
```

### Scroll-linked hero exit
```tsx
const { scrollY } = useScroll({ container: containerRef })
const y = useTransform(scrollY, [0, heroHeight], [0, -160])
const scale = useTransform(scrollY, [0, heroHeight], [1, 0.88])
const opacity = useTransform(scrollY, [0, heroHeight * 0.8], [1, 0])
```
Put scroll-driven `style` on an outer `motion.div` and the entrance `initial/animate` on an inner one — mixing both on one element makes them fight.

### Scroll marquee
Two `w-max whitespace-nowrap` rows; `x` mapped from section progress to `['0%','-35%']` and the reverse. Second row uses an outlined style (`-webkit-text-stroke`).

### Progress bar
```tsx
const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 })
<motion.div className="fixed top-0 inset-x-0 h-1 origin-left z-50" style={{ scaleX }} />
```

### Pinned scroll-driven section (homepage `ServicesShowcase`)
Section stays still on screen while scrolling steps through items, then releases to the content below.
```tsx
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

Implementation (`ServicesShowcase` / `HoleLane` / `laneGeometry`): each element is drawn **once**, in a full-stage wrapper whose `clipPath` is a rounded `inset()` ending at the hole's **curved back**, with the hole's own corner radius (`round 0 W W 0` / `round W 0 0 W`; `rounded-*-full` on a narrow box rounds to its width `W`). So the element passes over the opening, stays visible inside the hole, and is cut off at the curve. Layering, bottom to top: the hole's fill (`background: shape.fill`), the clipped element, then the lip (`border-white/15` + inset `shade`, same box as the hole) so the element slips under the curve.

**Don't go back to drawing the element twice** (one copy clipped at the opening, a second inside an `overflow-hidden` hole frame). That was the earlier version: the two copies rasterise at slightly different subpixel positions while sliding, so a faint `|` line showed at the opening as content crossed it, even with an overlap. One copy has no seam to show.

Elements sit `--hole-space` (desktop 32px, mobile 14px) back from their hole so they don't touch it at rest. Elements get `slideVariants` (`x: ±120%`, enough for the trailing edge to cross the space and clear the hole). Use a plain translucent fill on anything that slides into a hole (the photo label uses `bg-black/45`). Desktop: holes in the middle, photo and text swap sides each step. Mobile (photo stacked over text): each row has its own hole at the screen edge: the photo slides right into a right-edge hole, the text left into a left-edge hole; their clips also cut at the row's top/bottom (`inset(0 0 50% 0 …)`, `inset(54% 0 0 0 …)`). Holes are always visible; there are no timers. Test at `deviceScaleFactor: 1.1` (110% zoom).
Short screens (110% zoom laptops): hide bullets at `max-height:820px` and the icon at `max-height:760px`. Verify with headless-Chrome frame captures mid-swap (≈300/420/560/900 ms).

### See-through windows (homepage `WindowSection`)
Absolutely positioned pills (`rounded-full overflow-hidden`) each hold the same `<img>`, sized and offset in % so the photo lines up across all of them: `width: 100/W*100%`, `left: -(L/W)*100%` (same for height/top). To make pills move while the photo stays fixed, give the pill `y` and the img `useTransform(y, v => -v)`.

### Infinite marquee (testimonials)
CSS keyframe `translateX(-50%)` over two copies of the items. Space items with per-item padding, not `gap`, or the loop jumps by half a gap. Pause on hover with `animation-play-state`; edge fade via `mask-image` linear gradient.

### Scroll-filled headline (homepage `FinalCTA`)
Split the headline into words; each word is a small component with `opacity = useTransform(progress, [i/n, (i+1)/n], [0.15, 1])`. Put `aria-label` with the full text on the heading and `aria-hidden` on the word spans.

### Navbar
The desktop navbar is a static frosted-white bar (see the note at the top). It used to form from a spread row into a glass pill on scroll via a shared `navReveal` motion value. That code is in git at commit `ce5a844` if it is ever wanted again.

### Carousels / swapping content
`<AnimatePresence mode="popLayout" initial={false}>` with a `key` that changes per slide; enter from `x: 40`, exit to `x: -40`.

## Porting components (21st.dev, Aceternity, shadcn blocks)

- Project is TypeScript + Vite (`components.json` has `tsx: true`): port to `.tsx` in `src/components/ui/`, keep the types, strip `"use client"`.
- Replace `next/image` → `<img loading="lazy">`, `next/link` → react-router `Link` (internal) or `<a>` (external).
- Any `useScroll({ target })` inside the component needs a `container` prop when used on the homepage.
- `hero-parallax.tsx` on phones (`max-width: 767px`): the rows drop 60px instead of 500px and slide ±600px instead of ±1000px, because the stacked header is much taller (500px left a half-screen gap). The homepage's hero bottom padding matches (`pb-[160px] md:pb-[640px]`).
- Scroll performance (tested on Intel UHD, which Chrome uses by default on hybrid laptops): every element moved by a scroll-linked motion value needs its own layer (`will-change-transform` / `will-change-[opacity]`), or the browser repaints everything around it each frame; the hero header also has `will-change-transform` because the moving rows under it forced full repaints. No `mix-blend-mode` on large overlays (the grain is normal-blended for this reason). Verify with paint flashing (`Overlay.setShowPaintRects`) while scrolling.
- Existing ports: `hero-parallax.tsx` (tilted rows under a header, takes `children` as header; used by the homepage hero), `works-wheel.tsx` (crafterui WorksWheel: ring of cards that opens into a 3D drum; used by the homepage "Four ways to work with us") and `tilted-grid-hero.tsx` (curved CSS-3D image band; currently unused — the user preferred a static photo per service over a moving band).
- `works-wheel.tsx` on the homepage is **scroll-driven**: a pinned section (`sticky h-svh` inside a tall wrapper) passes its `useSectionProgress(..., ['start start', 'end end'])` as `progress`, and the wheel follows it with a dwell at each card. Don't switch it back to its own wheel/drag capture there: on touch screens vertical drags would trap the page's scrolling, and the user wants it on mobile. Portrait screens get a wider card, a ring scaled to fit, and the caption under the front card.
- Photos go through `Photo` (`src/components/ui/photo.tsx`): Supabase file first, `fallback` if it's missing, hidden if both fail.
- The homepage holds behind a loading screen (`Preloader`, `src/components/ui/preloader.tsx`) until every photo it uses is downloaded (`preloadImages`, `src/lib/preloadImages.ts`), capped at `PRELOAD_MAX_MS` (8s), once per visit. Any new photo on the page must be added to `pageImages` in `HomePage`, or it will pop in while scrolling. Entrance animations that play on mount (the hero) must wait for `ready`, or they play behind the loading screen.
- Homepage photo spots are resolved by `useSitePhotos()` (`src/lib/siteImages.ts`): it lists `hero-images/home/` and adds each file's `updated_at` to its URL (`&v=`), so a photo replaced under the same name shows on the next load instead of after Supabase's 1-hour cache. Keep `resize=contain` in the transform; the default `cover` keeps the original height and crops the sides. Don't hardcode Supabase photo URLs in components.

### Interior Design page tours (`src/components/public/InteriorVideoTours.tsx`, `InteriorProjectTour.tsx`)
The List Property page is just its form (the walkthrough there was removed at the user's request; it belongs on Interior Design only).
- **Video tours** (the user's preferred "cinematic stroll"): a pinned section scrubs a walkthrough video with the scroll. Videos must be encoded for seeking: short keyframe interval (`-g 6`), no audio, `+faststart`. The whole file is fetched as a blob before scrubbing. A stock **sample** tour (clearly labelled, credited) shows only in dev or with `?demo` in the URL, so visitors never see stock footage presented as Iloilo Rentals work.
- **Photo tour**: a pinned section where scroll drives a camera through each project's photos (from Supabase `hero-images/interior/<project>/`). Each photo has a camera move (`enter` = dolly forward, `lookRight`/`lookLeft` = pan + small `rotateY` under `perspective`, `lookUp` = tilt, `closer` = push in). Photos are scaled so a move never shows an edge: keep |x|,|y| under (scale − 1) / 2 in %. The next room fades in **on top** while the previous one pushes forward and blurs underneath; there's no fade-out, which would dip to black.

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
