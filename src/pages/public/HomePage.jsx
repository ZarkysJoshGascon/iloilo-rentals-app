import { useState, useEffect, useRef, useLayoutEffect, useMemo, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  motion, useScroll, useTransform, useSpring, useReducedMotion, useMotionValueEvent,
  AnimatePresence, MotionConfig,
} from 'framer-motion'
import Footer from '../../components/layout/Footer'
import { HeroParallax } from '@/components/ui/hero-parallax'
import { navReveal } from '@/lib/navReveal'
import { Photo } from '@/components/ui/photo'
import { spot, useSitePhotos, useSiteGallery, REVIEWS } from '@/lib/siteImages'
import { WorksWheel } from '@/components/ui/works-wheel'
import { Preloader } from '@/components/ui/preloader'
import { preloadImages } from '@/lib/preloadImages'
import {
  Phone, ArrowRight,
  Building2, Sofa, BedDouble, Handshake, CheckCircle2, X,
} from 'lucide-react'

const LOGO_BLUE = '#2d568e'
// A darker shade of LOGO_BLUE for the blue section backgrounds.
const DEEP_BLUE = '#1b3a68'
const EASE = [0.16, 1, 0.3, 1]
// Scroll distance (px) over which the desktop navbar forms into its pill.
const NAV_REVEAL_DISTANCE = 260
const LOGO = '/Iloilo_rentals_img.png'
// Longest the loading screen stays up (listing the photos plus downloading
// them) before showing the page anyway; anything left keeps loading behind it.
const PRELOAD_MAX_MS = 8000
// The loading screen shows once per visit; after that the photos are cached.
let pagePreloaded = false

// The page scrolls inside a fixed container (not the window), so every
// scroll-linked animation needs a reference to it.
const ScrollContainerContext = createContext(null)

// ============================================================
// SCROLL HELPERS
// ============================================================

// Progress of `ref` travelling through the viewport: 0 when its top enters
// from the bottom, 1 when its bottom leaves through the top.
function useSectionProgress(ref, offset = ['start end', 'end start']) {
  const container = useContext(ScrollContainerContext)
  const { scrollYProgress } = useScroll({ target: ref, container, offset })
  return scrollYProgress
}

// Moves an element from +distance to -distance px as its section scrolls by.
function useParallax(ref, distance = 80) {
  const reduce = useReducedMotion()
  const progress = useSectionProgress(ref)
  const d = reduce ? 0 : distance
  return useTransform(progress, [0, 1], [d, -d])
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const onChange = (e) => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

const useIsDesktop = () => useMediaQuery('(min-width: 768px)')

// Parent/child pair that reveals children one after another.
const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}
const staggerChild = {
  hidden: { opacity: 0, y: 32, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE } },
}

function Stagger({ children, className = '', amount = 0.4 }) {
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  )
}

function Item({ children, className = '', as = 'div', ...rest }) {
  const Comp = motion[as]
  return (
    <Comp className={className} variants={staggerChild} {...rest}>
      {children}
    </Comp>
  )
}

// Blue section backgrounds: layered soft glows ("mesh gradient") on a logo-blue base.
const SERVICES_BG = [
  'radial-gradient(55% 50% at 10% 15%, rgba(45, 86, 142, 0.55), transparent 70%)',
  'radial-gradient(45% 45% at 92% 85%, rgba(14, 165, 233, 0.16), transparent 70%)',
  'radial-gradient(70% 55% at 50% 115%, rgba(30, 64, 175, 0.4), transparent 70%)',
  DEEP_BLUE,
].join(', ')

const CTA_BG = [
  'radial-gradient(60% 55% at 50% -5%, rgba(96, 165, 250, 0.3), transparent 70%)',
  'radial-gradient(55% 50% at 0% 100%, rgba(45, 86, 142, 0.6), transparent 70%)',
  'radial-gradient(45% 45% at 100% 95%, rgba(99, 102, 241, 0.22), transparent 70%)',
  DEEP_BLUE,
].join(', ')

// Fine film grain over the glows — keeps big gradients from looking flat or banded.
// Plain (normal) blending on purpose: mix-blend-overlay here made the browser
// re-blend the whole screen under it on every scroll frame.
const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

function Grain({ opacity = 0.05 }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ backgroundImage: GRAIN_SVG, opacity }}
    />
  )
}

// ============================================================
// IMAGES — managed in Supabase Storage
//
// Every photo spot on this page has its own file in the `hero-images` bucket,
// in the `home/` folder. Upload (or replace) a photo with that name (JPG, PNG
// or WebP) in the Supabase dashboard and the page shows it, no code changes.
// Until a file is uploaded, the spot shows the placeholder written next to it.
//
//   home/hero-01.jpg … hero-10.jpg   hero cards (01–05 top row, 06–10 bottom row)
//   home/offer-<name>.jpg            "What We Offer" (management, interior, stays, affiliate)
//   home/card-<name>.jpg             "Four ways" cards (book, list, design, buy)
//
// Uploads can be full size: the page asks Supabase for a copy resized to
// 1200px wide. A replaced photo shows on the next page load (see
// src/lib/siteImages.js). Placeholders are stock photos.
// ============================================================
const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=1200&q=75&auto=format&fit=crop`

// Hero parallax cards — 2 rows of 5, in this order.
//   title — the text that shows when you hover the card
//   link  — where clicking the card goes
//   image — its file in Supabase, and the placeholder until that's uploaded
const HERO_ROWS = 2
const HERO_CARDS = [
  // ── Top row ──
  { title: 'Featured Stay 01', link: '/contact', image: spot('hero-01', UNSPLASH('1600607687939-ce8a6c25118c')) },
  { title: 'Featured Stay 02', link: '/contact', image: spot('hero-02', UNSPLASH('1502672260266-1c1ef2d93688')) },
  { title: 'Featured Stay 03', link: '/contact', image: spot('hero-03', UNSPLASH('1586023492125-27b2c045efd7')) },
  { title: 'Featured Stay 04', link: '/contact', image: spot('hero-04', UNSPLASH('1522708323590-d24dbb6b0267')) },
  { title: 'Featured Stay 05', link: '/contact', image: spot('hero-05', UNSPLASH('1560448204-e02f11c3d0e2')) },

  // ── Bottom row ──
  { title: 'Featured Stay 06', link: '/contact', image: spot('hero-06', UNSPLASH('1556911220-bff31c812dba')) },
  { title: 'Featured Stay 07', link: '/contact', image: spot('hero-07', UNSPLASH('1493809842364-78817add7ffb')) },
  { title: 'Featured Stay 08', link: '/contact', image: spot('hero-08', UNSPLASH('1505691938895-1758d7feb511')) },
  { title: 'Featured Stay 09', link: '/contact', image: spot('hero-09', UNSPLASH('1545324418-cc1a3fa10c00')) },
  { title: 'Featured Stay 10', link: '/contact', image: spot('hero-10', UNSPLASH('1484154218962-a197022b5858')) },
]

// "What We Offer" — one photo per service. Even entries put the photo on the
// right, odd entries on the left; they swap sides through the "door".
const SERVICES = [
  {
    key: 'management',
    title: 'Property Management',
    tagline: 'Hands-off ownership, guaranteed returns',
    description:
      'We handle guest bookings, check-ins, maintenance, and payouts so you can earn without lifting a finger.',
    icon: Building2,
    image: spot('offer-management', UNSPLASH('1560448204-e02f11c3d0e2')),
    bullets: ['Guest booking & check-in', 'Maintenance coordination', 'Monthly payouts & reports'],
    cta: 'List your property',
    to: '/list-property',
  },
  {
    key: 'interior',
    title: 'Interior Design',
    tagline: 'Spaces guests remember',
    description:
      'From concept and layout to sourcing and styling, we design units that photograph beautifully and rent faster.',
    icon: Sofa,
    image: spot('offer-interior', UNSPLASH('1586023492125-27b2c045efd7')),
    bullets: ['Full interior design', 'Furnishing & styling', 'Renovation planning'],
    cta: 'Design your space',
    to: '/interior-design',
  },
  {
    key: 'stays',
    title: 'Booking Stays',
    tagline: 'Handpicked condos across Iloilo City',
    description:
      'Book a fully furnished, professionally cleaned unit for a night, a week, or longer — with a local team ready to help.',
    icon: BedDouble,
    image: spot('offer-stays', UNSPLASH('1505691938895-1758d7feb511')),
    bullets: ['Fully furnished units', 'Hotel-standard cleaning', 'Smooth, guided check-in'],
    cta: 'Book a stay',
    to: '/contact',
  },
  {
    key: 'affiliate',
    title: 'Affiliate Partner',
    tagline: 'Earn from bookings and property sales',
    description:
      'Refer guests looking for a stay or buyers looking for a property, and earn a commission on every successful booking and sale.',
    icon: Handshake,
    image: spot('offer-affiliate', UNSPLASH('1545324418-cc1a3fa10c00')),
    bullets: ['Simple referral link', 'Commission on bookings', 'Commission on property sales'],
    cta: 'Become an affiliate partner',
    to: '/contact',
  },
]

// "Four ways to work with us" — in the order they come round on the wheel.
const ACTIONS = [
  {
    key: 'book',
    eyebrow: 'For guests',
    title: 'Book a stay',
    description: 'Fully furnished, professionally cleaned units across Iloilo City.',
    image: spot('card-book', UNSPLASH('1522708323590-d24dbb6b0267')),
    to: '/contact',
  },
  {
    key: 'list',
    eyebrow: 'For owners',
    title: 'List your property',
    description: 'We manage the guests, cleaning, and payouts.',
    image: spot('card-list', UNSPLASH('1600607687939-ce8a6c25118c')),
    to: '/list-property',
  },
  {
    key: 'design',
    eyebrow: 'For your space',
    title: 'Design your space',
    description: 'Full design, furnishing, and styling.',
    image: spot('card-design', UNSPLASH('1556911220-bff31c812dba')),
    to: '/interior-design',
  },
  {
    key: 'buy',
    eyebrow: 'Brokerage',
    title: 'Buy or sell a property',
    description: 'Our brokerage team matches serious buyers with sellers.',
    image: spot('card-buy', UNSPLASH('1545324418-cc1a3fa10c00')),
    to: '/contact',
  },
]

// The same four, as cards on the wheel.
const wheelItems = (photo) =>
  ACTIONS.map((a) => {
    const { src, fallback } = photo(a.image)
    return { title: a.title, eyebrow: a.eyebrow, description: a.description, image: src, fallback, href: a.to }
  })


// ============================================================
// MAIN PAGE
// ============================================================
export default function HomePage() {
  const navigate = useNavigate()
  const containerRef = useRef(null)

  const { scrollY, scrollYProgress } = useScroll({ container: containerRef })

  // Hide the desktop navbar at the top of the page; it forms into its pill
  // as you scroll. Restore it for every other page on the way out.
  useLayoutEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
    navReveal.set(0)
    return () => navReveal.set(1)
  }, [])
  useMotionValueEvent(scrollY, 'change', (v) => {
    navReveal.set(Math.min(1, Math.max(0, v / NAV_REVEAL_DISTANCE)))
  })

  // Thin progress bar along the top of the page.
  const progressBar = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 })

  const photo = useSitePhotos()
  const reviews = useSiteGallery(REVIEWS)
  const heroProducts = useMemo(
    () => HERO_CARDS.map(({ image, ...card }) => {
      const { src, fallback } = photo(image)
      return { ...card, thumbnail: src, fallback }
    }),
    [photo],
  )

  // Loading screen: hold the page until every photo on it has downloaded, so
  // nothing pops in while scrolling. Capped at PRELOAD_MAX_MS.
  const [ready, setReady] = useState(pagePreloaded)
  const [loaded, setLoaded] = useState(0)

  // Every photo the page shows, once both photo folders have been listed.
  const pageImages = useMemo(() => {
    if (photo(HERO_CARDS[0].image).src === undefined || reviews === undefined) return null
    return [
      LOGO,
      ...[...HERO_CARDS, ...SERVICES, ...ACTIONS].map((item) => photo(item.image).src),
      ...reviews.map((r) => r.thumb),
    ]
  }, [photo, reviews])

  useEffect(() => {
    if (ready || !pageImages) return
    let cancelled = false
    preloadImages(pageImages, { onProgress: (done, total) => !cancelled && setLoaded(done / total) })
      .then(() => !cancelled && setReady(true))
    return () => { cancelled = true }
  }, [pageImages, ready])

  useEffect(() => {
    if (ready) {
      pagePreloaded = true
      return
    }
    const cap = setTimeout(() => setReady(true), PRELOAD_MAX_MS)
    return () => clearTimeout(cap)
  }, [ready])

  // Full-size review screenshots are only needed on click: fetch them after.
  useEffect(() => {
    if (ready && reviews?.length) preloadImages(reviews.map((r) => r.full))
  }, [ready, reviews])

  return (
    <MotionConfig reducedMotion="user">
      <Preloader show={!ready} progress={loaded} logo={LOGO} brandColor={LOGO_BLUE} />
      <ScrollContainerContext.Provider value={containerRef}>
        {/* ============== SCROLL PROGRESS ============== */}
        <motion.div
          className="fixed top-0 left-0 right-0 h-1 z-50 origin-left will-change-transform"
          style={{ scaleX: progressBar, background: `linear-gradient(90deg, ${LOGO_BLUE}, #60a5fa)` }}
        />

        {/* ============== SCROLL CONTAINER ============== */}
        <div
          ref={containerRef}
          className="fixed top-0 left-0 w-full h-full overflow-y-scroll overflow-x-hidden z-20 bg-white"
        >
          {/* ---------- HERO ---------- */}
          <HeroParallax
            products={heroProducts}
            rows={HERO_ROWS}
            container={containerRef}
            // Height follows the content (header + rows + the rows' slide-down:
            // 500px on desktop, 60px on phones), so the bottom row is never cut off.
            className="bg-white h-auto pt-32 pb-[160px] md:pt-48 md:pb-[640px]"
          >
            <HeroHeader navigate={navigate} ready={ready} />
          </HeroParallax>

          {/* ---------- SERVICES (pinned) ---------- */}
          <ServicesShowcase />

          {/* ---------- DETAILS ---------- */}
          <TestimonialsSection />
          <ActionsSection />
          <FinalCTA navigate={navigate} />

          {/* ---------- FOOTER ---------- */}
          <div className="relative bg-gray-900">
            <Footer />
          </div>
        </div>

        {/* ============== ANIMATION KEYFRAMES ============== */}
        <style>{`
          @keyframes shine {
            to { background-position: 200% center; }
          }
          .animate-shine {
            animation: shine 6s linear infinite;
          }
          @keyframes marquee {
            to { transform: translateX(-50%); }
          }
          .animate-marquee {
            animation: marquee 50s linear infinite;
          }
          .marquee-row:hover .animate-marquee {
            animation-play-state: paused;
          }
          .text-outline-light {
            -webkit-text-stroke: 1px rgba(255, 255, 255, 0.12);
            color: transparent;
          }
          @media (prefers-reduced-motion: reduce) {
            .animate-shine, .animate-marquee { animation: none; }
          }
        `}</style>
      </ScrollContainerContext.Provider>
    </MotionConfig>
  )
}

// ============================================================
// HERO HEADER — big logo with the headline beside it, above the parallax rows
// ============================================================
function HeroHeader({ navigate, ready }) {
  return (
    <div className="max-w-7xl relative mx-auto px-6 w-full pb-16 md:pb-28 flex flex-col md:flex-row items-center gap-8 md:gap-16">
      <motion.div
        className="relative shrink-0"
        initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
        animate={ready ? { opacity: 1, scale: 1, rotate: 0 } : undefined}
        transition={{ duration: 1.2, ease: EASE }}
      >
        <div className="absolute inset-0 rounded-full bg-blue-400/30 blur-3xl scale-125" />
        <img
          src={LOGO}
          alt="Iloilo Rentals Logo"
          className="relative w-40 h-40 sm:w-52 sm:h-52 md:w-72 md:h-72 lg:w-80 lg:h-80 object-contain drop-shadow-2xl"
        />
      </motion.div>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate={ready ? 'show' : 'hidden'}
        className="text-center md:text-left"
      >
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
          <Item as="span" className="block text-gray-900">Find Your Perfect</Item>
          <Item
            as="span"
            className="block bg-gradient-to-r from-[#2d568e] via-[#60a5fa] to-[#2d568e] bg-clip-text text-transparent bg-[length:200%_auto] animate-shine"
          >
            Stay in Iloilo City
          </Item>
        </h1>

        <Item as="p" className="max-w-2xl mx-auto md:mx-0 text-base md:text-xl mt-5 md:mt-6 text-gray-500 font-medium leading-relaxed">
          Connecting you to the best rentals in Iloilo
        </Item>

        <Item className="mt-7 md:mt-8">
          <button
            onClick={() => navigate('/contact')}
            className="group inline-flex items-center justify-center gap-2 bg-[#2d568e] text-white px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl font-bold text-sm shadow-lg shadow-[#2d568e]/30 hover:shadow-xl hover:shadow-[#2d568e]/40 transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
          >
            <Phone size={18} /> Contact Us
            <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        </Item>

        <Item className="mt-7 md:mt-8 flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1 text-gray-600 text-xs sm:text-sm font-semibold">
          <span>Join our free community</span>
          <span className="text-gray-300">|</span>
          <span>List your property with us</span>
          <span className="text-gray-300">|</span>
          <span>Full property management services</span>
        </Item>
      </motion.div>
    </div>
  )
}

// ============================================================
// SERVICES SHOWCASE — pinned. Each scroll step shows one service.
//
// Two holes are cut into the blue background, each half a pill cut top to
// bottom:  |)(|  — the flat "|" is the opening, the curved ")" the back.
// Each hole is exactly as tall as the content beside it, so on a swap the
// text and photo simply slide in sideways: OVER the "|" opening, visible
// inside the hole, then UNDER the curved ")" edge until gone. The next pair
// slides back out on swapped sides.
// Desktop: the holes sit in the middle with a wide gap between them.
// Mobile (photo stacked over text): each row has its own hole at the screen
// edge — the photo slides right into one, the text left into the other.
//
// How "inside the hole" works: each element is drawn once, clipped by a
// rectangle that ends at the hole's curved back with the same rounded corners
// as the hole. So it passes over the opening, stays visible inside the hole,
// and is cut off at the curve. The hole's shade is drawn under it and the
// curved lip over it. (An earlier version drew everything twice, one copy each
// side of the opening; the two copies rounded to different pixels and left a
// faint "|" line at the opening as content passed through.)
// ============================================================

// Stage CSS variables: hole width, gap between the holes, and the space
// between each element and its hole at rest.
const STAGE_CLASSES =
  '[--hole-w:18px] md:[--hole-w:36px] [--hole-gap:0px] md:[--hole-gap:40px] [--hole-space:14px] md:[--hole-space:32px]'

// A hole reads as a hole when it deepens away from you: the flat "|" opening
// is fully clear (no edge, it melts into the background) and the shade grows
// toward the curved back. It's translucent black, so it keeps the background's
// own blues, plus a little shadow under the curved lip and a faint highlight on it.
const HOLE_SHAPES = {
  // ")" — opening on its left, curved back on its right. Content moving right.
  right: {
    radius: 'rounded-r-full',
    lip: 'border-r',
    fill: 'linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.18) 40%, rgba(0, 0, 0, 0.6) 100%)',
    shade: 'inset -10px 0 14px -8px rgba(0, 0, 0, 0.5)',
  },
  // "(" — mirror image. Content moving left.
  left: {
    radius: 'rounded-l-full',
    lip: 'border-l',
    fill: 'linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.18) 40%, rgba(0, 0, 0, 0.6) 100%)',
    shade: 'inset 10px 0 14px -8px rgba(0, 0, 0, 0.5)',
  },
}

// Where the element, its hole, and its clip sit — all in stage percentages /
// container units. `dir` is the way the element slides in. The clip's rounded
// corners match the hole's: rounded-*-full on a narrow box rounds to its width.
function laneGeometry(side, desktop, kind) {
  const W = 'var(--hole-w)'
  const S = 'var(--hole-space)'
  const half = `(var(--hole-gap) / 2 + ${W})` // centre → outer edge of a hole
  if (desktop) {
    if (side === 'left') {
      return {
        dir: 'right',
        box: { left: 0, top: 0, bottom: 0, width: `calc(50% - ${half} - ${S})` },
        hole: { left: `calc(50% - ${half})`, width: W, top: 0, bottom: 0 },
        clip: `inset(0 calc(50% + var(--hole-gap) / 2) 0 0 round 0 ${W} ${W} 0)`,
      }
    }
    return {
      dir: 'left',
      box: { right: 0, top: 0, bottom: 0, width: `calc(50% - ${half} - ${S})` },
      hole: { left: 'calc(50% + var(--hole-gap) / 2)', width: W, top: 0, bottom: 0 },
      clip: `inset(0 0 0 calc(50% + var(--hole-gap) / 2) round ${W} 0 0 ${W})`,
    }
  }
  if (kind === 'photo') {
    // Top row; hole at the right edge.
    return {
      dir: 'right',
      box: { left: 0, top: 0, height: '50%', width: `calc(100% - ${W} - ${S})` },
      hole: { left: `calc(100% - ${W})`, width: W, top: 0, height: '50%' },
      clip: `inset(0 0 50% 0 round 0 ${W} ${W} 0)`,
    }
  }
  // Bottom row; hole at the left edge.
  return {
    dir: 'left',
    box: { left: `calc(${W} + ${S})`, right: 0, top: '54%', bottom: 0 },
    hole: { left: 0, width: W, top: '54%', bottom: 0 },
    clip: `inset(54% 0 0 0 round ${W} 0 0 ${W})`,
  }
}

// Slide distance: past 100% so the trailing edge also crosses the space and clears the hole.
const SLIDE_OUT = 0.7
const SLIDE_IN = 0.8
const slid = ({ dir }) => ({ x: dir === 'right' ? '120%' : '-120%' })

const slideVariants = {
  enter: (c) => slid(c),
  center: { x: '0%', transition: { duration: SLIDE_IN, ease: [0.22, 0.9, 0.36, 1] } },
  exit: (c) => ({ ...slid(c), transition: { duration: SLIDE_OUT, ease: [0.6, 0, 0.85, 0.35] } }),
}

function ServicesShowcase() {
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  const sectionRef = useRef(null)
  const container = useContext(ScrollContainerContext)
  const total = SERVICES.length
  // 0 when the section pins to the top, 1 when it is about to release.
  const progress = useSectionProgress(sectionRef, ['start start', 'end end'])
  const [active, setActive] = useState(0)

  useMotionValueEvent(progress, 'change', (v) => {
    const next = Math.min(total - 1, Math.max(0, Math.floor(v * total)))
    setActive((prev) => (prev === next ? prev : next))
  })

  // Jump to the middle of a service's scroll span.
  const goTo = (i) => {
    const el = sectionRef.current
    const scroller = container?.current
    if (!el || !scroller) return
    const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    const span = el.offsetHeight - scroller.clientHeight
    scroller.scrollTo({ top: top + (span * (i + 0.5)) / total, behavior: 'smooth' })
  }

  const service = SERVICES[active]
  const number = String(active + 1).padStart(2, '0')
  // Desktop: photo and text swap sides every step.
  const photoSide = active % 2 === 0 ? 'right' : 'left'
  const textSide = photoSide === 'right' ? 'left' : 'right'

  return (
    <section
      ref={sectionRef}
      className="relative rounded-t-[2.5rem]"
      style={{ height: `${(total + 1) * 100}vh`, backgroundColor: DEEP_BLUE }}
    >
      <div className="sticky top-0 h-svh overflow-hidden rounded-t-[2.5rem]" style={{ background: SERVICES_BG }}>
        <Grain />

        <div className="relative h-full max-w-7xl mx-auto px-5 md:px-10 pt-6 pb-28 md:pt-24 md:pb-8 flex flex-col gap-4 md:gap-5">
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest">
            <span className="text-white">What We Offer</span>
            <span className="h-px w-8 bg-white/30" />
            <span className="tabular-nums text-white">
              {number} <span className="text-white/50">/ {String(total).padStart(2, '0')}</span>
            </span>
          </div>

          {/* Stage */}
          <div className={`relative flex-1 min-h-0 ${STAGE_CLASSES}`}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={service.key} initial="enter" animate="center" exit="exit" className="absolute inset-0">
                <HoleLane geometry={laneGeometry(photoSide, desktop, 'photo')}>
                  <ServicePhoto service={service} number={number} />
                </HoleLane>
                <HoleLane geometry={laneGeometry(textSide, desktop, 'text')}>
                  <ServiceText
                    service={service}
                    desktop={desktop}
                    side={textSide}
                    onCta={() => navigate(service.to)}
                  />
                </HoleLane>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Progress */}
          <div className="grid gap-2 md:gap-3" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}>
            {SERVICES.map((s, i) => (
              <ProgressSegment
                key={s.key}
                progress={progress}
                index={i}
                total={total}
                label={s.title}
                active={i === active}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// One element plus the hole it slides into.
function HoleLane({ geometry, children }) {
  const { dir, box, hole, clip } = geometry
  const shape = HOLE_SHAPES[dir]

  return (
    <>
      {/* The hole: a half-pill cut into the background, under the element */}
      <div
        aria-hidden="true"
        className={`absolute pointer-events-none ${shape.radius}`}
        style={{ ...hole, background: shape.fill }}
      />

      {/* The element, cut off at the hole's curved back */}
      <div className="absolute inset-0 pointer-events-none" style={{ clipPath: clip }}>
        <motion.div custom={{ dir }} variants={slideVariants} className="absolute pointer-events-auto" style={box}>
          {children}
        </motion.div>
      </div>

      {/* The curved ")" lip — over the element, which slips under it */}
      <div
        aria-hidden="true"
        className={`absolute pointer-events-none ${shape.radius} ${shape.lip} border-white/15`}
        style={{ ...hole, boxShadow: shape.shade }}
      />
    </>
  )
}

function ServicePhoto({ service, number }) {
  const photo = useSitePhotos()
  return (
    <div className="relative h-full w-full rounded-[28px] overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/10">
      <Photo {...photo(service.image)} alt={service.title} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 px-4 py-2 rounded-full bg-black/45 ring-1 ring-white/20 text-white text-xs md:text-sm font-semibold">
        <span className="tabular-nums text-white mr-2">{number}</span>
        {service.title}
      </div>
    </div>
  )
}

function ServiceText({ service, desktop, side, onCta }) {
  const Icon = service.icon
  // Extra breathing room on the hole side on desktop (on top of --hole-space).
  const pad = desktop ? (side === 'left' ? 'pr-6' : 'pl-6') : ''
  return (
    <div className={`h-full flex flex-col ${desktop ? 'justify-center' : 'justify-start'} ${pad}`}>
      <Icon size={40} strokeWidth={1.4} className="hidden md:block mb-5 text-white [@media(max-height:760px)]:hidden" />
      <h2 className="text-[1.6rem] sm:text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight">
        {service.title}
      </h2>
      <p className="mt-2 md:mt-4 text-base md:text-xl lg:text-2xl font-bold text-white">{service.tagline}</p>
      <p className="mt-3 md:mt-5 text-white/90 text-sm md:text-lg leading-relaxed max-w-xl line-clamp-3 md:line-clamp-none">
        {service.description}
      </p>
      {/* Bullets: desktop unless the screen is short; phones only when tall
          enough (Pro Max / Plus size) for them to fit under the text. */}
      <ul className="hidden [@media(min-height:880px)]:block md:block md:[@media(max-height:820px)]:hidden mt-3 md:mt-5 space-y-2 md:space-y-3">
        {service.bullets.map((b) => (
          <li key={b} className="flex items-center gap-2.5 md:gap-3 text-sm md:text-base text-white">
            <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
            {b}
          </li>
        ))}
      </ul>
      <button
        onClick={onCta}
        className="group mt-4 md:mt-7 self-start inline-flex items-center gap-2 text-sm md:text-base font-bold text-white hover:text-white/75 transition-colors"
      >
        {service.cta}
        <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
      </button>
    </div>
  )
}

function ProgressSegment({ progress, index, total, label, active, onClick }) {
  const fill = useTransform(progress, [index / total, (index + 1) / total], [0, 1])
  return (
    <button onClick={onClick} className="group text-left py-2" aria-label={`Show ${label}`}>
      <div className="h-1 rounded-full bg-white/20 overflow-hidden">
        <motion.div className="h-full bg-white origin-left will-change-transform" style={{ scaleX: fill }} />
      </div>
      <span
        className={`hidden md:block mt-2 text-xs font-semibold truncate transition-colors duration-300 ${
          active ? 'text-white' : 'text-white/50 group-hover:text-white/80'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

// ============================================================
// TESTIMONIALS — "What They Say": every review screenshot in Supabase
// (`hero-images/home/reviews/`, newest first) as a card, in two rows drifting
// in opposite directions. Click a card to read it full size. Hidden until at
// least one screenshot is uploaded. Overlaps the bottom of the services
// section as a rounded white sheet.
// ============================================================
// Cards per marquee copy, at least: a few reviews are repeated so a row is
// always wider than the screen (otherwise the loop shows a gap).
const MARQUEE_MIN_CARDS = 8
// Seconds each card takes to drift past, so the speed doesn't depend on how
// many reviews there are.
const MARQUEE_SECONDS_PER_CARD = 7

function TestimonialsSection() {
  const fade = 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)'
  const reviews = useSiteGallery(REVIEWS)
  const [open, setOpen] = useState(null)

  if (!reviews?.length) return null

  return (
    <section className="relative z-10 -mt-10 rounded-t-[2.5rem] py-28 md:py-40 overflow-hidden bg-gradient-to-b from-white via-[#eef4fb] to-white">

      <div className="relative max-w-6xl mx-auto px-6 w-full">
        <Stagger className="text-center mb-14 md:mb-20" amount={0.5}>
          <Item className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: LOGO_BLUE }}>
            What They Say
          </Item>
          <Item as="h2" className="text-4xl md:text-6xl font-black text-gray-900 leading-[1.05] mb-4 tracking-tight">
            Owners. Guests. Agents.
          </Item>
          <Item as="p" className="text-gray-500 text-base md:text-lg max-w-2xl mx-auto">
            Real words from the people we work with every day.
          </Item>
        </Stagger>
      </div>

      <div className="relative space-y-6" style={{ maskImage: fade, WebkitMaskImage: fade }}>
        <MarqueeRow items={reviews} onOpen={setOpen} />
        {/* The same reviews again, drifting the other way — hidden from screen readers. */}
        <MarqueeRow items={[...reviews].reverse()} onOpen={setOpen} reverse decorative />
      </div>

      <ReviewLightbox review={open} onClose={() => setOpen(null)} />
    </section>
  )
}

function MarqueeRow({ items, onOpen, reverse = false, decorative = false }) {
  const cards = Array.from({ length: Math.ceil(MARQUEE_MIN_CARDS / items.length) }, () => items).flat()
  return (
    <div className="marquee-row overflow-hidden">
      <div
        className="flex w-max animate-marquee"
        style={{
          animationDirection: reverse ? 'reverse' : 'normal',
          animationDuration: `${cards.length * MARQUEE_SECONDS_PER_CARD}s`,
        }}
      >
        {/* Two copies so the -50% loop is seamless; padding (not gap) keeps both halves equal.
            Only the first appearance of each review is announced and focusable. */}
        {[0, 1].map((copy) =>
          cards.map((review, i) => {
            const hidden = decorative || copy === 1 || i >= items.length
            return (
              <div key={`${copy}-${i}-${review.key}`} className="pr-6" aria-hidden={hidden || undefined}>
                <ReviewCard review={review} hidden={hidden} onOpen={() => onOpen(review)} />
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}

function ReviewCard({ review, hidden, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      tabIndex={hidden ? -1 : undefined}
      aria-label={hidden ? undefined : 'Read this review'}
      className="flex h-[280px] md:h-[360px] min-w-[160px] items-center justify-center overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl cursor-zoom-in"
    >
      <Photo
        src={review.thumb}
        alt="Client review"
        decoding="async"
        draggable={false}
        className="h-full w-auto max-w-[80vw] md:max-w-[520px] object-cover object-top"
      />
    </button>
  )
}

// Full-size review over the page. Rendered into <body>: inside the page's
// scroll container it would sit under the navbar.
function ReviewLightbox({ review, onClose }) {
  useEffect(() => {
    if (!review) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [review, onClose])

  return createPortal(
    <AnimatePresence>
      {review && (
        <motion.div
          key={review.key}
          role="dialog"
          aria-modal="true"
          aria-label="Client review"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 md:p-10 cursor-zoom-out"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <motion.img
            src={review.full}
            alt="Client review"
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="max-h-full max-w-full rounded-xl object-contain shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close review"
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors"
          >
            <X size={28} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ============================================================
// ACTIONS — "Four ways to work with us" as a wheel of photo cards. The
// section pins while scrolling turns the wheel: first a ring around the
// heading, then each card in turn at the front, then it releases.
// ============================================================
// Scroll length per card, in viewport heights.
const WHEEL_VH_PER_ITEM = 70

function ActionsSection() {
  const sectionRef = useRef(null)
  const container = useContext(ScrollContainerContext)
  // 0 when the section pins to the top, 1 when it is about to release.
  const progress = useSectionProgress(sectionRef, ['start start', 'end end'])
  // Turns: ring → first card, then one per card after it.
  const photo = useSitePhotos()
  const items = useMemo(() => wheelItems(photo), [photo])
  const turns = items.length

  // Scroll to where card i rests at the front.
  const goTo = (i) => {
    const el = sectionRef.current
    const scroller = container?.current
    if (!el || !scroller) return
    const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    const span = el.offsetHeight - scroller.clientHeight
    scroller.scrollTo({ top: top + (span * (i + 1)) / turns, behavior: 'smooth' })
  }

  return (
    <div ref={sectionRef} className="relative bg-white" style={{ height: `${turns * WHEEL_VH_PER_ITEM + 100}vh` }}>
      <div className="sticky top-0 h-svh overflow-hidden">
        <WorksWheel
          items={items}
          progress={progress}
          onPick={goTo}
          label="Four ways to work with us."
          action="Explore"
          className="bg-white text-gray-900"
        />
      </div>
    </div>
  )
}

// ============================================================
// FINAL CTA — headline words light up as you scroll
// ============================================================
const CTA_HEADLINE = 'Ready to earn from your property?'

function FinalCTA({ navigate }) {
  const sectionRef = useRef(null)
  const blobAY = useParallax(sectionRef, 140)
  const blobBY = useParallax(sectionRef, -140)
  const fill = useSectionProgress(sectionRef, ['start 0.9', 'center 0.55'])
  const words = CTA_HEADLINE.split(' ')

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden py-32 md:py-52"
      style={{ background: CTA_BG }}
    >
      <motion.div
        style={{ y: blobAY }}
        aria-hidden="true"
        className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-sky-500/30 blur-3xl will-change-transform"
      />
      <motion.div
        style={{ y: blobBY }}
        aria-hidden="true"
        className="absolute -bottom-32 -right-24 w-[32rem] h-[32rem] rounded-full bg-indigo-500/30 blur-3xl will-change-transform"
      />
      <Grain />

      <div className="relative max-w-5xl mx-auto px-6 w-full text-center">
        <h2
          aria-label={CTA_HEADLINE}
          className="text-4xl sm:text-5xl md:text-7xl font-black text-white leading-[1.05] tracking-tight flex flex-wrap justify-center gap-x-[0.25em]"
        >
          {words.map((word, i) => (
            <ScrollWord key={i} progress={fill} range={[i / words.length, (i + 1) / words.length]}>
              {word}
            </ScrollWord>
          ))}
        </h2>

        <Stagger amount={0.5}>
          <Item as="p" className="text-white/80 text-base md:text-lg mt-8 mb-12 max-w-2xl mx-auto leading-relaxed">
            Whether you own one unit or ten, Iloilo Rentals manages the guests, cleaning, and payouts so you don't have to.
          </Item>
          <Item className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
            <button
              onClick={() => navigate('/contact')}
              className="group bg-white text-[#2d568e] px-8 py-4 rounded-2xl font-bold text-sm shadow-xl hover:shadow-2xl hover:shadow-sky-500/30 transition-all duration-500 inline-flex items-center justify-center gap-2 hover:-translate-y-0.5"
            >
              <Phone size={18} /> Talk to Our Team
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => navigate('/list-property')}
              className="px-8 py-4 rounded-2xl font-bold text-sm text-white border border-white/30 hover:bg-white/10 transition-all duration-500 inline-flex items-center justify-center gap-2"
            >
              List Your Property
            </button>
          </Item>
        </Stagger>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute inset-x-0 bottom-0 translate-y-[28%] text-center font-black leading-none whitespace-nowrap text-[10.5vw] text-outline-light"
      >
        ILOILO RENTALS
      </div>
    </section>
  )
}

function ScrollWord({ children, progress, range }) {
  const opacity = useTransform(progress, range, [0.15, 1])
  return (
    <motion.span aria-hidden="true" className="will-change-[opacity]" style={{ opacity }}>
      {children}
    </motion.span>
  )
}
