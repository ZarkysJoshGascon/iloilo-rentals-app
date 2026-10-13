import { Fragment, useEffect, useState, useRef, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { motion, useScroll, useTransform, useReducedMotion, AnimatePresence } from 'framer-motion'
import Footer from '../../components/layout/Footer'
import { Photo } from '@/components/ui/photo'
import { WorksWheel } from '@/components/ui/works-wheel'
import { spot, useSitePhotos, useSiteGallery, REVIEWS } from '@/lib/siteImages'
import { usePageRevealed } from '@/lib/pageReveal'
import {
  ArrowRight,
  Building2, Sofa, BedDouble, Handshake, Palette, CheckCircle2, X,
} from 'lucide-react'

const LOGO_BLUE = '#2d568e'
const EASE = [0.16, 1, 0.3, 1]

// Background tones the content shifts between as you scroll (see ToneZone).
const TONE_WHITE = '#ffffff'
const TONE_GREY = '#eef0f3'

// ============================================================
// SCROLL REVEAL
// ============================================================
// Entrance animations hold until the loading screen has gone (usePageRevealed).
function Reveal({ children, delay = 0, y = 50, className = '', amount = 0.6 }) {
  const revealed = usePageRevealed()
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={revealed ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, amount }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function RevealFromLeft({ children, delay = 0, className = '', amount = 0.6 }) {
  const revealed = usePageRevealed()
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: -80 }}
      whileInView={revealed ? { opacity: 1, x: 0 } : undefined}
      viewport={{ once: true, amount }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function RevealFromRight({ children, delay = 0, className = '', amount = 0.6 }) {
  const revealed = usePageRevealed()
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: 80 }}
      whileInView={revealed ? { opacity: 1, x: 0 } : undefined}
      viewport={{ once: true, amount }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

// True on screens at least Tailwind's `md` wide (768px), kept up to date on resize.
const DESKTOP_QUERY = '(min-width: 768px)'

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = (e) => setDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}

const getInitialMountKey = () => Date.now()

// ============================================================
// IMAGES — managed in Supabase Storage
//
// Every photo spot on this page has its own file in the `hero-images` bucket,
// in the `home/` folder. Upload (or replace) a photo with that name (JPG, PNG
// or WebP) in the Supabase dashboard and the page shows it, no code changes.
//
//   home/hero-01.jpg … hero-10.jpg   photos drifting behind the hero (01–05 top row, 06–10 bottom row)
//   home/offer-<name>.jpg            service sections (management, interior, stays, affiliate)
//   home/view.jpg                    "Look out the window" banner
//   home/card-<name>.jpg             "Four ways" wheel cards (book, list, design, buy)
//   home/reviews/                    review screenshots for "What They Say", newest first
//
// view.jpg hasn't been uploaded yet, so the banner borrows hero-10 (the spot
// inside spot(...)) until it is. Spots with nothing uploaded show the stock
// photo written next to them.
// A replaced photo shows on the next page load (see src/lib/siteImages.js).
// ============================================================
const UNSPLASH = (id) => `https://images.unsplash.com/photo-${id}?w=1200&q=75&auto=format&fit=crop`

const HERO_TOP_ROW = [
  spot('hero-01', UNSPLASH('1600607687939-ce8a6c25118c')),
  spot('hero-02', UNSPLASH('1502672260266-1c1ef2d93688')),
  spot('hero-03', UNSPLASH('1586023492125-27b2c045efd7')),
  spot('hero-04', UNSPLASH('1522708323590-d24dbb6b0267')),
  spot('hero-05', UNSPLASH('1560448204-e02f11c3d0e2')),
]
const HERO_BOTTOM_ROW = [
  spot('hero-06', UNSPLASH('1556911220-bff31c812dba')),
  spot('hero-07', UNSPLASH('1493809842364-78817add7ffb')),
  spot('hero-08', UNSPLASH('1505691938895-1758d7feb511')),
  spot('hero-09', UNSPLASH('1545324418-cc1a3fa10c00')),
  spot('hero-10', UNSPLASH('1484154218962-a197022b5858')),
]

const VIEW_IMAGE = spot('view', HERO_BOTTOM_ROW[4])

// Hero card buttons (the first is filled) and the line of points under them.
const HERO_BUTTONS = [
  { label: 'List Property', to: '/list-property', icon: Building2 },
  { label: 'Interior Design', to: '/interior-design', icon: Palette },
  { label: 'Book Staycation', to: '/contact', icon: BedDouble },
]
const HERO_POINTS = [
  'Book staycation',
  'List your property with us',
  'Full property management services',
  'Interior design',
]

// ============================================================
// DATA
// ============================================================
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
  const [heroHeight, setHeroHeight] = useState(window.innerHeight)
  const [mountKey, setMountKey] = useState(getInitialMountKey)
  const [isScrolling, setIsScrolling] = useState(false)
  const containerRef = useRef(null)
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef(null)

  useEffect(() => {
    const h = () => setHeroHeight(window.innerHeight)
    window.addEventListener('resize', h)
    setMountKey(Date.now())
    return () => window.removeEventListener('resize', h)
  }, [])

  // Each row twice over, so its -50% loop is seamless.
  const photo = useSitePhotos()
  const topFlow = [...HERO_TOP_ROW, ...HERO_TOP_ROW].map(photo)
  const bottomFlow = [...HERO_BOTTOM_ROW, ...HERO_BOTTOM_ROW].map(photo)

  const { scrollYProgress } = useScroll({ container: containerRef })
  const [tone, setTone] = useState(TONE_WHITE)

  useLayoutEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      if (!isScrollingRef.current) {
        isScrollingRef.current = true
        setIsScrolling(true)
      }
      clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false
        setIsScrolling(false)
      }, 200)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  const easedExitProgress = useTransform(scrollYProgress, (v) => {
    const r = Math.min(Math.max(v * 4, 0), 1)
    return r * r
  })

  const topRowX = useTransform(easedExitProgress, (p) => -p * 200000)
  const bottomRowX = useTransform(easedExitProgress, (p) => p * 200000)

  const clipBox = {
    width: '100vw',
    maxWidth: '100vw',
    overflow: 'hidden',
    contain: 'strict',
    clipPath: 'inset(0)',
  }

  return (
    <>
      {/* ============== ANIMATED HERO BACKDROP ============== */}
      <section
        className={`fixed top-0 left-0 h-full overflow-hidden z-10 ${isScrolling ? 'scrolling' : ''}`}
        style={{ background: '#ffffff', ...clipBox }}
      >
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-0 h-1/2" style={clipBox}>
            <motion.div style={{ x: topRowX }} className="w-max h-full">
              <div key={`top-flow-${mountKey}`} className="flex gap-4 h-full items-center animate-flow">
                {topFlow.map((image, idx) => (
                  <div key={`top-${mountKey}-${idx}`} className="relative h-[95%] w-auto flex-shrink-0">
                    <Photo
                      {...image}
                      alt=""
                      className="h-full w-auto rounded-2xl object-cover shadow-2xl ring-1 ring-white/15"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
          <div className="absolute bottom-0 left-0 h-1/2" style={clipBox}>
            <motion.div style={{ x: bottomRowX }} className="w-max h-full">
              <div
                key={`bottom-flow-${mountKey}`}
                className="flex gap-4 h-full items-center animate-flow"
                style={{ animationDirection: 'reverse' }}
              >
                {bottomFlow.map((image, idx) => (
                  <div key={`bottom-${mountKey}-${idx}`} className="relative h-[95%] w-auto flex-shrink-0">
                    <Photo
                      {...image}
                      alt=""
                      className="h-full w-auto rounded-2xl object-cover shadow-2xl ring-1 ring-white/15"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============== SCROLL CONTAINER ============== */}
      <div
        ref={containerRef}
        className="fixed top-0 left-0 w-full h-full overflow-y-scroll overflow-x-hidden z-20"
        style={{ background: 'transparent', scrollBehavior: 'smooth' }}
      >
        {/* ---------- HERO ---------- */}
        <div
          className="snap-start snap-always relative"
          style={{ height: `${heroHeight}px`, background: 'transparent' }}
        >
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 md:p-10 lg:p-14 w-full max-w-5xl border border-gray-200 shadow-2xl">
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
                <div className="flex-shrink-0">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-400/30 rounded-full blur-3xl scale-150" />
                    <img
                      src="/Iloilo_rentals_img.png"
                      alt="Iloilo Rentals Logo"
                      className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:w-52 lg:h-52 object-contain drop-shadow-2xl relative z-10"
                    />
                  </div>
                </div>
                <div className="text-center md:text-left flex-1">
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black mb-3 md:mb-4 leading-[1.05] tracking-tight">
                    <span className="text-gray-900">Find Your Perfect</span>
                    <br />
                    <span className="bg-gradient-to-r from-[#2d568e] via-[#1e3a5f] to-[#2d568e] bg-clip-text text-transparent">
                      Stay in Iloilo City
                    </span>
                  </h1>
                  <p className="text-gray-500 text-sm sm:text-base md:text-lg mb-6 md:mb-8 max-w-xl leading-relaxed font-medium mx-auto md:mx-0">
                    Connecting you to the best rentals in Iloilo
                  </p>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center md:justify-start">
                    {HERO_BUTTONS.map(({ label, to, icon: Icon }, i) => (
                      <button
                        key={to + label}
                        onClick={() => navigate(to)}
                        className={`inline-flex items-center justify-center gap-2 border-2 border-[#2d568e] px-5 py-3 rounded-2xl font-bold text-sm transition-all duration-300 hover:scale-105 active:scale-95 w-full sm:w-auto ${
                          i === 0 ? 'bg-[#2d568e] text-white hover:bg-[#244876]' : 'text-[#2d568e] hover:bg-[#2d568e]/5'
                        }`}
                      >
                        <Icon size={17} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 md:mt-8 pt-5 md:pt-6 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 sm:gap-3 text-gray-600 text-xs sm:text-sm font-semibold">
                  {HERO_POINTS.map((point, i) => (
                    <Fragment key={point}>
                      {i > 0 && <span className="text-gray-300 hidden sm:inline">|</span>}
                      <span>{point}</span>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            CONTINUOUS CANVAS
           ============================================================ */}
        {/* The background eases between white and grey as each section reaches
            the middle of the screen: white, grey, white, grey… */}
        <div className="relative" style={{ backgroundColor: tone, transition: 'background-color 0.9s ease' }}>
          {SERVICES.map((service, i) => {
            const Icon = service.icon
            const isEven = i % 2 === 0
            return (
              <ToneZone key={service.key} tone={isEven ? TONE_WHITE : TONE_GREY} onTone={setTone}>
                <ServiceSection service={service} Icon={Icon} isEven={isEven} />
              </ToneZone>
            )
          })}

          <HoleSection />
          <ToneZone tone={TONE_WHITE} onTone={setTone}>
            <TestimonialsSection />
          </ToneZone>
          <ToneZone tone={TONE_GREY} onTone={setTone}>
            <ActionsSection container={containerRef} />
          </ToneZone>
          <FinalCTA />
        </div>

        {/* ---------- FOOTER ---------- */}
        <div className="relative bg-gray-900">
          <Footer />
        </div>
      </div>

      {/* ============== ANIMATION KEYFRAMES ============== */}
      <style>{`
        @keyframes slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-flow {
          animation: slide 80s linear infinite;
        }
        .scrolling .animate-flow {
          animation-play-state: paused;
        }

        @media (max-width: 767px) {
          .hole-image-bg {
            will-change: transform;
          }
        }

        @media (min-width: 768px) {
          .hole-image-bg {
            background-attachment: fixed;
            height: 100% !important;
            top: 0 !important;
            transform: none !important;
            will-change: auto !important;
          }
        }
      `}</style>
    </>
  )
}

// ============================================================
// SERVICE SECTION
// ============================================================
// Service photos are cards seen in a slight isometric tilt (kept mild so the
// photo stays easy to see). Coming into view, each flips over into place
// around its upright edge, then floats: a slow bob up and down over a soft
// shadow on the "ground" that shrinks and fades as the card rises.
const FLOAT_SECONDS = 6
const FLOAT_HEIGHT = 16 // px
const TILT = { x: 10, y: 15, z: 2 } // degrees, at rest
// The flip starts this far past the resting angle: just beyond edge-on, back
// to the viewer (hidden), so the card swings round into view.
const FLIP_FROM = 105 // degrees
const FLIP_SECONDS = 1.6
// Gentler than EASE (whose turn is over in a blink): the flip stays readable.
const FLIP_EASE = [0.3, 0.7, 0.25, 1]

function FloatingPhoto({ facing, children }) {
  const reduce = useReducedMotion()
  const revealed = usePageRevealed()
  const dir = facing === 'right' ? 1 : -1
  const loop = { duration: FLOAT_SECONDS, ease: 'easeInOut', repeat: Infinity }
  const land = { duration: FLIP_SECONDS, ease: FLIP_EASE }
  const card = {
    flipped: { rotateX: TILT.x + 12, rotateY: dir * (TILT.y - FLIP_FROM), rotateZ: -dir * TILT.z },
    rest: { rotateX: TILT.x, rotateY: dir * TILT.y, rotateZ: -dir * TILT.z },
  }
  const ground = { flipped: { opacity: 0, scale: 0.6 }, rest: { opacity: 1, scale: 1 } }

  return (
    <motion.div
      className="relative pb-12 md:pb-16"
      initial={reduce ? 'rest' : 'flipped'}
      whileInView={revealed ? 'rest' : undefined}
      viewport={{ once: true, amount: 0.35 }}
    >
      {/* Float */}
      <motion.div className="relative z-10" animate={reduce ? undefined : { y: [0, -FLOAT_HEIGHT, 0] }} transition={loop}>
        {/* Flip into the tilt */}
        <motion.div style={{ transformPerspective: 1400, backfaceVisibility: 'hidden' }} variants={card} transition={land}>
          {children}
        </motion.div>
      </motion.div>
      {/* Ground shadow: comes in as the card lands, then breathes with the float */}
      <motion.div aria-hidden="true" className="absolute left-[16%] right-[16%] bottom-2 h-6 md:h-8" variants={ground} transition={land}>
        <motion.div
          className="h-full w-full rounded-[50%] bg-black/40 blur-xl"
          animate={reduce ? undefined : { scale: [1, 0.85, 1], opacity: [0.9, 0.5, 0.9] }}
          transition={loop}
        />
      </motion.div>
    </motion.div>
  )
}

// Reports its tone while it crosses the middle of the screen, so the page
// background shifts white → grey → white from one section to the next.
function ToneZone({ tone, onTone, children }) {
  return (
    <motion.div viewport={{ margin: '-49% 0px -50% 0px' }} onViewportEnter={() => onTone(tone)}>
      {children}
    </motion.div>
  )
}

function ServiceSection({ service, Icon, isEven }) {
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const photo = useSitePhotos()
  const text = (
    <div>
      <Icon size={44} style={{ color: LOGO_BLUE }} className="mb-7" strokeWidth={1.4} />
      <h2 className="text-4xl md:text-6xl font-black text-gray-900 leading-[1.05] mb-4 tracking-tight">
        {service.title}
      </h2>
      <p className="font-semibold text-lg md:text-xl mb-5 tracking-tight" style={{ color: LOGO_BLUE }}>
        {service.tagline}
      </p>
      <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-10 max-w-lg">
        {service.description}
      </p>
      <ul className="space-y-4 mb-12">
        {service.bullets.map((b) => (
          <li key={b} className="flex items-start gap-3 text-base text-gray-700">
            <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            {b}
          </li>
        ))}
      </ul>
      <button
        onClick={() => navigate(service.to)}
        className="inline-flex items-center gap-2 font-bold text-lg hover:gap-3 transition-all duration-500 ease-out"
        style={{ color: LOGO_BLUE }}
      >
        {service.cta} <ArrowRight size={20} />
      </button>
    </div>
  )

  const image = (
    // Turned toward the text beside it (on phones the text is below, so either way reads fine).
    <FloatingPhoto facing={isEven ? 'right' : 'left'}>
      <div className="rounded-3xl overflow-hidden shadow-xl border border-gray-100 bg-gray-100">
        <Photo
          {...photo(service.image)}
          alt={service.title}
          className="w-full h-[340px] md:h-[560px] object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    </FloatingPhoto>
  )

  return (
    <section className="relative py-32 md:py-48">
      <div className="max-w-6xl mx-auto px-6 w-full">
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <div className={isEven ? '' : 'md:order-2'}>
            {image}
          </div>
          <div className={isEven ? '' : 'md:order-1'}>
            {/* Phones: the text sits under the photo and is taller than half the
                screen, so it fades up as soon as it starts to show instead of
                waiting to be mostly in view and sliding in from the side. */}
            {!desktop ? (
              <Reveal amount={0.15} y={30}>{text}</Reveal>
            ) : isEven ? (
              <RevealFromRight amount={0.7} delay={0.1}>{text}</RevealFromRight>
            ) : (
              <RevealFromLeft amount={0.7} delay={0.1}>{text}</RevealFromLeft>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// HOLE SECTION
// ============================================================
function HoleSection() {
  const photo = useSitePhotos()
  const view = photo(VIEW_IMAGE)
  const sectionRef = useRef(null)
  const bgRef = useRef(null)
  const tickingRef = useRef(false)
  const rafRef = useRef(null)

  useEffect(() => {
    const section = sectionRef.current
    const bg = bgRef.current
    if (!section || !bg) return

    const mq = window.matchMedia('(min-width: 768px)')
    if (mq.matches) return

    const update = () => {
      tickingRef.current = false
      const rect = section.getBoundingClientRect()
      const vh = window.innerHeight

      if (rect.bottom < -100 || rect.top > vh + 100) return

      const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height)))

      const bgHeight = bg.offsetHeight
      const maxShift = Math.max(0, bgHeight - rect.height)
      const shift = progress * maxShift * 1.2

      bg.style.transform = `translate3d(0, -${shift}px, 0)`
    }

    const onScroll = () => {
      if (tickingRef.current) return
      tickingRef.current = true
      rafRef.current = requestAnimationFrame(update)
    }

    let scrollParent = section.parentElement
    while (scrollParent && scrollParent !== document.body) {
      const style = window.getComputedStyle(scrollParent)
      if (/(auto|scroll)/.test(style.overflowY)) break
      scrollParent = scrollParent.parentElement
    }
    const target = scrollParent || window

    target.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()

    return () => {
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden"
      style={{ height: '40vh', minHeight: 260 }}
    >
      <div
        ref={bgRef}
        className="absolute left-0 w-full bg-cover bg-center hole-image-bg"
        style={{
          top: '-20%',
          height: '140%',
          // The stand-in goes underneath, so the banner still has a photo if the main one fails.
          backgroundImage: [view.src, view.fallback].filter(Boolean).map((u) => `url("${u}")`).join(', ') || undefined,
        }}
      />
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative h-full flex flex-col items-center justify-center text-center px-6">
        <Reveal amount={0.5}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-3">
            A View From Here
          </p>
          <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight">
            Look out the window.
          </h2>
          <p className="text-white/80 text-sm md:text-base mt-2 max-w-xl">
            Every unit we manage opens onto something worth looking at.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================================
// TESTIMONIALS — "What They Say": every review screenshot in Supabase
// (`hero-images/home/reviews/`, newest first) as a card. Click one to read it
// full size. Hidden until at least one screenshot is uploaded.
// ============================================================
// Reviews shown before "Show all".
const REVIEWS_SHOWN = 8

function TestimonialsSection() {
  const reviews = useSiteGallery(REVIEWS)
  const [open, setOpen] = useState(null)
  const [showAll, setShowAll] = useState(false)

  if (!reviews?.length) return null
  const shown = showAll ? reviews : reviews.slice(0, REVIEWS_SHOWN)

  return (
    <section className="relative py-32 md:py-48 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 w-full">
        <Reveal className="text-center mb-16" amount={0.5}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: LOGO_BLUE }}>
            What They Say
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-gray-900 leading-[1.05] mb-4 tracking-tight">
            Owners. Guests. Agents.
          </h2>
          <p className="text-gray-500 text-base md:text-lg max-w-2xl mx-auto">
            Real words from the people we work with every day.
          </p>
        </Reveal>

        {/* Flex rather than grid so a short last row sits centred. */}
        <Reveal amount={0.2} y={30} className="flex flex-wrap justify-center gap-4 md:gap-6">
          {shown.map((review) => (
            <button
              key={review.key}
              type="button"
              onClick={() => setOpen(review)}
              aria-label="Read this review"
              className="w-[calc(50%-0.5rem)] md:w-[calc((100%-3rem)/3)] lg:w-[calc((100%-4.5rem)/4)] aspect-[4/3] p-1.5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-lg transition-shadow duration-500 cursor-zoom-in"
            >
              {/* Whole screenshot, never cropped: they're meant to be read. */}
              <Photo src={review.thumb} alt="Client review" loading="lazy" className="h-full w-full object-contain" />
            </button>
          ))}
        </Reveal>

        {reviews.length > REVIEWS_SHOWN && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-2 font-bold text-lg hover:gap-3 transition-all duration-500 ease-out"
              style={{ color: LOGO_BLUE }}
            >
              {showAll ? 'Show fewer reviews' : `Show all ${reviews.length} reviews`} <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>

      <ReviewLightbox review={open} onClose={() => setOpen(null)} />
    </section>
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
          <img
            src={review.full}
            alt="Client review"
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

function ActionsSection({ container }) {
  const sectionRef = useRef(null)
  // 0 when the section pins to the top, 1 when it is about to release. The
  // page scrolls inside its own container, so useScroll has to be told which.
  const { scrollYProgress: progress } = useScroll({ target: sectionRef, container, offset: ['start start', 'end end'] })
  const photo = useSitePhotos()
  const items = useMemo(() => wheelItems(photo), [photo])
  // Turns: ring → first card, then one per card after it.
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
    <div ref={sectionRef} className="relative" style={{ height: `${turns * WHEEL_VH_PER_ITEM + 100}vh` }}>
      <div className="sticky top-0 h-svh overflow-hidden">
        <WorksWheel
          items={items}
          progress={progress}
          onPick={goTo}
          label="Four ways to work with us."
          action="Explore"
          className="bg-transparent text-gray-900"
        />
      </div>
    </div>
  )
}

// ============================================================
// FINAL CTA
// ============================================================
function FinalCTA() {
  return (
    <section className="relative bg-gradient-to-br from-[#1e3a5f] via-[#2d568e] to-[#1e3a5f] py-32 md:py-48">
      <div className="max-w-4xl mx-auto px-6 w-full text-center">
        <Reveal amount={0.5}>
          <h2 className="text-4xl md:text-6xl font-black text-white leading-[1.05] mb-6 tracking-tight">
            Ready to earn from your property?
          </h2>
          <p className="text-white/80 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Whether you own one unit or ten, Iloilo Rentals manages the guests, cleaning, and payouts so you don't have to.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
