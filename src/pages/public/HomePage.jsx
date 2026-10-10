import { useState, useEffect, useRef, useLayoutEffect, createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  motion, useScroll, useTransform, useSpring, useReducedMotion, useMotionValueEvent,
  AnimatePresence, MotionConfig,
} from 'framer-motion'
import Footer from '../../components/layout/Footer'
import { HeroParallax } from '@/components/ui/hero-parallax'
import { navReveal } from '@/lib/navReveal'
import {
  Phone, ArrowRight, ArrowUpRight,
  Building2, Sofa, BedDouble, Handshake, CheckCircle2, Star, Quote,
} from 'lucide-react'

const LOGO_BLUE = '#2d568e'
const NAVY = '#0b1a2e'
const EASE = [0.16, 1, 0.3, 1]
// Scroll distance (px) over which the desktop navbar forms into its pill.
const NAV_REVEAL_DISTANCE = 260

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

function useIsDesktop() {
  const query = '(min-width: 768px)'
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}

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

// Dark section backgrounds: layered soft glows ("mesh gradient") on deep navy.
const SERVICES_BG = [
  'radial-gradient(55% 50% at 10% 15%, rgba(45, 86, 142, 0.55), transparent 70%)',
  'radial-gradient(45% 45% at 92% 85%, rgba(14, 165, 233, 0.16), transparent 70%)',
  'radial-gradient(70% 55% at 50% 115%, rgba(30, 64, 175, 0.4), transparent 70%)',
  'linear-gradient(180deg, #0a1628 0%, #0b1a2e 100%)',
].join(', ')

const CTA_BG = [
  'radial-gradient(60% 55% at 50% -5%, rgba(96, 165, 250, 0.3), transparent 70%)',
  'radial-gradient(55% 50% at 0% 100%, rgba(45, 86, 142, 0.6), transparent 70%)',
  'radial-gradient(45% 45% at 100% 95%, rgba(99, 102, 241, 0.22), transparent 70%)',
  '#0a1628',
].join(', ')

// Fine film grain over the glows — keeps big gradients from looking flat or banded.
const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

function Grain({ opacity = 0.09 }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none mix-blend-overlay"
      style={{ backgroundImage: GRAIN_SVG, opacity }}
    />
  )
}

// ============================================================
// IMAGES — how to use your own photos
//
//   HERO_IMG(6)            → 6.jpg uploaded to Supabase Storage › hero-images
//   '/images/unit-1.jpg'   → file saved at public/images/unit-1.jpg
//   UNSPLASH('…')          → free stock photo
//
// All photos are placeholders for now. Landscape photos work best.
// ============================================================
const HERO_IMG = (n) => `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/${n}.jpg`
const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=1200&q=75&auto=format&fit=crop`

// Hero parallax cards — 2 rows of 5 photos, in this order.
const HERO_ROWS = 2
const HERO_PRODUCTS = [
  // ── Top row ──
  HERO_IMG(1),
  UNSPLASH('1502672260266-1c1ef2d93688'),
  HERO_IMG(2),
  UNSPLASH('1522708323590-d24dbb6b0267'),
  HERO_IMG(5),

  // ── Bottom row ──
  HERO_IMG(3),
  UNSPLASH('1493809842364-78817add7ffb'),
  UNSPLASH('1505691938895-1758d7feb511'),
  HERO_IMG(4),
  UNSPLASH('1484154218962-a197022b5858'),

  // Example — your own photo from the public folder:
  // '/images/one-madison-living.jpg',
].map((thumbnail, i) => ({
  title: `Featured Stay ${String(i + 1).padStart(2, '0')}`,
  link: '/contact',
  thumbnail,
}))

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
    image: HERO_IMG(2),
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
    image: HERO_IMG(5),
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
    image: HERO_IMG(1),
    bullets: ['Fully furnished units', 'Hotel-standard cleaning', 'Smooth, guided check-in'],
    cta: 'Book a stay',
    to: '/contact',
  },
  {
    key: 'affiliate',
    title: 'Affiliate Agents',
    tagline: 'Earn from bookings and property sales',
    description:
      'Refer guests looking for a stay or buyers looking for a property, and earn a commission on every successful booking and sale.',
    icon: Handshake,
    image: HERO_IMG(4),
    bullets: ['Simple referral link', 'Commission on bookings', 'Commission on property sales'],
    cta: 'Become an affiliate',
    to: '/contact',
  },
]

const TESTIMONIALS = [
  { id: 1, name: 'Maria Santos', role: 'Condo Owner · One Madison', avatar: 'https://i.pravatar.cc/150?img=1', quote: "I used to stress about guest turnover. Now I just check my monthly payout. Best decision I made for my unit.", rating: 5 },
  { id: 2, name: 'John Reyes', role: 'Condo Owner · Lafayette', avatar: 'https://i.pravatar.cc/150?img=12', quote: "The housekeeping team is exceptional. Every single review mentions how clean the unit is. That's on them.", rating: 5 },
  { id: 3, name: 'Anna Cruz', role: 'Guest · Stayed at WV Towers', avatar: 'https://i.pravatar.cc/150?img=5', quote: 'Check-in was seamless, the unit was exactly as pictured, and the location was perfect. Will book again.', rating: 5 },
  { id: 4, name: 'Robert Lim', role: 'Condo Owner · Avida', avatar: 'https://i.pravatar.cc/150?img=13', quote: "They sold my unit in under 30 days. Fair price, no drama, paperwork handled. Professional from start to finish.", rating: 5 },
  { id: 5, name: 'Christine Tan', role: 'Affiliate Agent', avatar: 'https://i.pravatar.cc/150?img=9', quote: 'Referred two owners, and the commissions have been steady for months. The referral system just works.', rating: 5 },
  { id: 6, name: 'David Ong', role: 'Guest · Stayed at The Palladium', avatar: 'https://i.pravatar.cc/150?img=15', quote: 'Great support when I had a late arrival. Local team actually answered the phone at midnight. Rare these days.', rating: 5 },
]

// "Four ways to work with us" — bento order: large, wide, small, small.
const ACTIONS = [
  {
    key: 'book',
    eyebrow: 'For guests',
    title: 'Book a stay',
    description: 'Fully furnished, professionally cleaned units across Iloilo City.',
    image: HERO_IMG(4),
    to: '/contact',
  },
  {
    key: 'list',
    eyebrow: 'For owners',
    title: 'List your property',
    description: 'We manage the guests, cleaning, and payouts.',
    image: HERO_IMG(2),
    to: '/list-property',
  },
  {
    key: 'design',
    eyebrow: 'For your space',
    title: 'Design your space',
    description: 'Full design, furnishing, and styling.',
    image: HERO_IMG(5),
    to: '/interior-design',
  },
  {
    key: 'buy',
    eyebrow: 'For investors',
    title: 'Buy a property',
    description: 'We match serious buyers with sellers.',
    image: UNSPLASH('1545324418-cc1a3fa10c00'),
    to: '/contact',
  },
]

const ACTION_LAYOUT = [
  'h-[380px] md:h-auto md:col-span-2 md:row-span-2',
  'h-[240px] md:h-auto md:col-span-2',
  'h-[240px] md:h-auto',
  'h-[240px] md:h-auto',
]

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

  return (
    <MotionConfig reducedMotion="user">
      <ScrollContainerContext.Provider value={containerRef}>
        {/* ============== SCROLL PROGRESS ============== */}
        <motion.div
          className="fixed top-0 left-0 right-0 h-1 z-50 origin-left"
          style={{ scaleX: progressBar, background: `linear-gradient(90deg, ${LOGO_BLUE}, #60a5fa)` }}
        />

        {/* ============== SCROLL CONTAINER ============== */}
        <div
          ref={containerRef}
          className="fixed top-0 left-0 w-full h-full overflow-y-scroll overflow-x-hidden z-20 bg-white"
        >
          {/* ---------- HERO ---------- */}
          <HeroParallax
            products={HERO_PRODUCTS}
            rows={HERO_ROWS}
            container={containerRef}
            // Height follows the content (header + rows + the rows' 500px slide-down),
            // so the bottom row is never cut off by the next section.
            className="bg-white h-auto pt-32 pb-[600px] md:pt-48 md:pb-[640px]"
          >
            <HeroHeader navigate={navigate} />
          </HeroParallax>

          {/* ---------- SERVICES (pinned) ---------- */}
          <ServicesShowcase />

          {/* ---------- DETAILS ---------- */}
          <TestimonialsSection />
          <ActionsSection navigate={navigate} />
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
function HeroHeader({ navigate }) {
  return (
    <div className="max-w-7xl relative mx-auto px-6 w-full pb-16 md:pb-28 flex flex-col md:flex-row items-center gap-8 md:gap-16">
      <motion.div
        className="relative shrink-0"
        initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 1.2, ease: EASE }}
      >
        <div className="absolute inset-0 rounded-full bg-blue-400/30 blur-3xl scale-125" />
        <img
          src="/Iloilo_rentals_img.png"
          alt="Iloilo Rentals Logo"
          className="relative w-40 h-40 sm:w-52 sm:h-52 md:w-72 md:h-72 lg:w-80 lg:h-80 object-contain drop-shadow-2xl"
        />
      </motion.div>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
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
// How "inside the hole" works: every element is drawn twice in identical
// stage-sized frames. Copy A is the element in place, clipped at the opening.
// Copy B sits inside the hole (clipped to the half-pill) and shows the part
// that has gone in. Both copies get the same variants, so they move as one.
// ============================================================

// The stage is a size container so hole frames can use cqw/cqh to line up
// with it. CSS variables: hole width, gap between the holes, and the space
// between each element and its hole at rest.
const STAGE_CLASSES =
  '[container-type:size] [--hole-w:18px] md:[--hole-w:36px] [--hole-gap:0px] md:[--hole-gap:40px] [--hole-space:14px] md:[--hole-space:32px]'

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

// Copy A reaches this far past the opening, over copy B. Where the two meet,
// both edges are anti-aliased; at fractional zoom (e.g. 110%) the opening lands
// between pixels and a faint line of background showed through. The overlap
// hides it, and both copies show identical pixels there.
const SEAM = '2px'

// Where the element, its hole, and its in-place clip sit — all in stage
// percentages / container units. `dir` is the way the element slides in.
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
        frame: { left: `calc(-50cqw + ${half})`, top: 0 },
        clip: `inset(0 calc(50% + ${half} - ${SEAM}) 0 0)`,
      }
    }
    return {
      dir: 'left',
      box: { right: 0, top: 0, bottom: 0, width: `calc(50% - ${half} - ${S})` },
      hole: { left: 'calc(50% + var(--hole-gap) / 2)', width: W, top: 0, bottom: 0 },
      frame: { left: 'calc(-50cqw - var(--hole-gap) / 2)', top: 0 },
      clip: `inset(0 0 0 calc(50% + ${half} - ${SEAM}))`,
    }
  }
  if (kind === 'photo') {
    // Top row; hole at the right edge.
    return {
      dir: 'right',
      box: { left: 0, top: 0, height: '50%', width: `calc(100% - ${W} - ${S})` },
      hole: { left: `calc(100% - ${W})`, width: W, top: 0, height: '50%' },
      frame: { left: `calc(-100cqw + ${W})`, top: 0 },
      clip: `inset(0 calc(${W} - ${SEAM}) 0 0)`,
    }
  }
  // Bottom row; hole at the left edge.
  return {
    dir: 'left',
    box: { left: `calc(${W} + ${S})`, right: 0, top: '54%', bottom: 0 },
    hole: { left: 0, width: W, top: '54%', bottom: 0 },
    frame: { left: 0, top: '-54cqh' },
    clip: `inset(0 0 0 calc(${W} - ${SEAM}))`,
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
      style={{ height: `${(total + 1) * 100}vh`, backgroundColor: NAVY }}
    >
      <div className="sticky top-0 h-svh overflow-hidden rounded-t-[2.5rem]" style={{ background: SERVICES_BG }}>
        <Grain />

        <div className="relative h-full max-w-7xl mx-auto px-5 md:px-10 pt-6 pb-28 md:pt-24 md:pb-8 flex flex-col gap-4 md:gap-5">
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest">
            <span className="text-sky-300">What We Offer</span>
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
                  {() => <ServicePhoto service={service} number={number} />}
                </HoleLane>
                <HoleLane geometry={laneGeometry(textSide, desktop, 'text')}>
                  {(copy) => (
                    <ServiceText
                      service={service}
                      desktop={desktop}
                      side={textSide}
                      onCta={copy ? undefined : () => navigate(service.to)}
                    />
                  )}
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

// One element plus the hole it slides into. `children(isCopy)` renders the
// element; it's called twice (in place, and inside the hole).
function HoleLane({ geometry, children }) {
  const { dir, box, hole, frame, clip } = geometry
  const shape = HOLE_SHAPES[dir]
  const slider = (isCopy) => (
    <motion.div custom={{ dir }} variants={slideVariants} className="absolute pointer-events-auto" style={box}>
      {children(isCopy)}
    </motion.div>
  )

  return (
    <>
      {/* The hole: a half-pill cut into the background. Copy B shows what has gone in. */}
      <div
        aria-hidden="true"
        className={`absolute overflow-hidden pointer-events-none ${shape.radius}`}
        style={{ ...hole, background: shape.fill }}
      >
        <div inert className="absolute" style={{ ...frame, width: '100cqw', height: '100cqh' }}>
          {slider(true)}
        </div>
        {/* The curved ")" lip — over the content, which slips under it */}
        <div className={`absolute inset-0 ${shape.radius} ${shape.lip} border-white/15`} style={{ boxShadow: shape.shade }} />
      </div>

      {/* Copy A — in place, cut off at the opening */}
      <div className="absolute inset-0 pointer-events-none" style={{ clipPath: clip }}>
        {slider(false)}
      </div>
    </>
  )
}

function ServicePhoto({ service, number }) {
  return (
    <div className="relative h-full w-full rounded-[28px] overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/10">
      <img src={service.image} alt={service.title} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 px-4 py-2 rounded-full bg-black/45 ring-1 ring-white/20 text-white text-xs md:text-sm font-semibold">
        <span className="tabular-nums text-sky-200 mr-2">{number}</span>
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
      <Icon size={40} strokeWidth={1.4} className="hidden md:block mb-5 text-sky-300 [@media(max-height:760px)]:hidden" />
      <h2 className="text-[1.6rem] sm:text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight">
        {service.title}
      </h2>
      <p className="mt-2 md:mt-4 text-base md:text-xl lg:text-2xl font-bold text-sky-300">{service.tagline}</p>
      <p className="mt-3 md:mt-5 text-white/90 text-sm md:text-lg leading-relaxed max-w-xl line-clamp-3 md:line-clamp-none">
        {service.description}
      </p>
      <ul className="hidden md:block mt-5 space-y-3 [@media(max-height:820px)]:hidden">
        {service.bullets.map((b) => (
          <li key={b} className="flex items-center gap-3 text-base text-white">
            <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
            {b}
          </li>
        ))}
      </ul>
      <button
        onClick={onCta}
        tabIndex={onCta ? undefined : -1}
        className="group mt-4 md:mt-7 self-start inline-flex items-center gap-2 text-sm md:text-base font-bold text-white hover:text-sky-300 transition-colors"
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
        <motion.div className="h-full bg-sky-300 origin-left" style={{ scaleX: fill }} />
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
// TESTIMONIALS — two rows drifting in opposite directions. Overlaps the
// bottom of the services section as a rounded white sheet.
// ============================================================
function TestimonialsSection() {
  const fade = 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)'

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
        <MarqueeRow items={TESTIMONIALS} />
        <MarqueeRow items={[...TESTIMONIALS].reverse()} reverse />
      </div>
    </section>
  )
}

function MarqueeRow({ items, reverse = false }) {
  return (
    <div className="marquee-row overflow-hidden">
      <div
        className="flex w-max animate-marquee"
        style={{ animationDirection: reverse ? 'reverse' : 'normal' }}
      >
        {/* Two copies so the -50% loop is seamless; padding (not gap) keeps both halves equal. */}
        {[0, 1].map((copy) =>
          items.map((t) => (
            <div key={`${copy}-${t.id}`} className="pr-6" aria-hidden={copy === 1}>
              <TestimonialCard testimonial={t} />
            </div>
          )),
        )}
      </div>
    </div>
  )
}

function TestimonialCard({ testimonial }) {
  return (
    <div className="w-[300px] md:w-[380px] h-full bg-white/80 backdrop-blur rounded-3xl border border-gray-200/80 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-500 p-7 flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <Quote size={28} style={{ color: LOGO_BLUE }} strokeWidth={1.4} />
        <div className="flex items-center gap-0.5">
          {[...Array(testimonial.rating)].map((_, i) => (
            <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
          ))}
        </div>
      </div>
      <p className="text-gray-700 text-base leading-relaxed mb-6 flex-1">"{testimonial.quote}"</p>
      <div className="flex items-center gap-3 pt-5 border-t border-gray-100">
        <img src={testimonial.avatar} alt={testimonial.name} className="w-11 h-11 rounded-full object-cover ring-2 ring-gray-100" loading="lazy" decoding="async" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{testimonial.name}</p>
          <p className="text-xs text-gray-500 truncate">{testimonial.role}</p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ACTIONS — bento of photo cards with a cursor spotlight
// ============================================================
function ActionsSection({ navigate }) {
  return (
    <section className="relative py-28 md:py-40">
      <div className="max-w-6xl mx-auto px-6 w-full">
        <Stagger className="text-center mb-14 md:mb-16" amount={0.5}>
          <Item className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: LOGO_BLUE }}>
            Get Started
          </Item>
          <Item as="h2" className="text-4xl md:text-6xl font-black text-gray-900 leading-[1.05] mb-4 tracking-tight">
            Four ways to work with us.
          </Item>
          <Item as="p" className="text-gray-500 text-base md:text-lg max-w-2xl mx-auto">
            Whatever brings you here, we have a path for it.
          </Item>
        </Stagger>

        <div className="grid gap-5 md:gap-6 md:grid-cols-4 md:grid-rows-2 md:h-[640px]">
          {ACTIONS.map((action, i) => (
            <ActionCard
              key={action.key}
              action={action}
              index={i}
              layout={ACTION_LAYOUT[i]}
              large={i === 0}
              onClick={() => navigate(action.to)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ActionCard({ action, index, layout, large, onClick }) {
  const trackSpotlight = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`)
    e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`)
  }

  return (
    <motion.button
      onClick={onClick}
      onMouseMove={trackSpotlight}
      initial={{ opacity: 0, y: 60, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 1, delay: index * 0.1, ease: EASE }}
      className={`group relative overflow-hidden rounded-3xl text-left shadow-xl ${layout}`}
    >
      <img
        src={action.image}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      {/* Spotlight that follows the cursor */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(420px circle at var(--x, 50%) var(--y, 50%), rgba(255,255,255,0.22), transparent 45%)' }}
      />

      <ArrowUpRight
        size={large ? 36 : 28}
        strokeWidth={1.6}
        className="absolute top-6 right-6 text-white drop-shadow transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
      />

      <div className="absolute inset-x-0 bottom-0 p-6 md:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-200 mb-2">{action.eyebrow}</p>
        <h3 className={`font-black text-white tracking-tight leading-tight ${large ? 'text-3xl md:text-5xl' : 'text-2xl'}`}>
          {action.title}
        </h3>
        <p className={`mt-2 text-white/85 leading-relaxed ${large ? 'text-base md:text-lg max-w-md' : 'text-sm'}`}>
          {action.description}
        </p>
      </div>
    </motion.button>
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
        className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full bg-sky-500/30 blur-3xl"
      />
      <motion.div
        style={{ y: blobBY }}
        aria-hidden="true"
        className="absolute -bottom-32 -right-24 w-[32rem] h-[32rem] rounded-full bg-indigo-500/30 blur-3xl"
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
    <motion.span aria-hidden="true" style={{ opacity }}>
      {children}
    </motion.span>
  )
}
