import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import Footer from '../../components/layout/Footer'
import {
  Phone, ArrowRight,
  Building2, Sparkles, TrendingUp, Users, CheckCircle2, Star, Quote,
} from 'lucide-react'

const LOGO_BLUE = '#2d568e'

// ============================================================
// SCROLL REVEAL
// ============================================================
function Reveal({ children, delay = 0, y = 50, className = '', amount = 0.6 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function RevealFromLeft({ children, delay = 0, className = '', amount = 0.6 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: -80 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function RevealFromRight({ children, delay = 0, className = '', amount = 0.6 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, x: 80 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

const getInitialMountKey = () => Date.now()

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
    image: 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/1.jpg',
    bullets: ['Guest booking & check-in', 'Maintenance coordination', 'Monthly payouts & reports'],
  },
  {
    key: 'housekeeping',
    title: 'Housekeeping',
    tagline: 'Hotel-standard cleaning, every turnaround',
    description:
      'Trained staff ensure every unit is spotless after every guest. Linen, restocking, deep cleans — all managed.',
    icon: Sparkles,
    image: 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/2.jpg',
    bullets: ['Post-checkout cleaning', 'Linens & restocking', 'Before/after photo proof'],
  },
  {
    key: 'selling',
    title: 'Selling Condos',
    tagline: 'Move your property, not your stress',
    description:
      'Thinking of selling? We connect you with serious buyers and manage the full transaction from viewing to closing.',
    icon: TrendingUp,
    image: 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/3.jpg',
    bullets: ['Buyer matching', 'Viewing coordination', 'Negotiation & closing'],
  },
  {
    key: 'affiliate',
    title: 'Affiliate Agents',
    tagline: 'Earn by referring owners',
    description:
      'Know an owner with a vacant unit? Refer them to us and earn a commission on every booking they receive.',
    icon: Users,
    image: 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/4.jpg',
    bullets: ['Simple referral link', 'Recurring commission', 'Monthly payouts'],
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

const ACTIONS = [
  { key: 'buy', label: 'Buy Property', title: 'Buy a property', description: 'Looking to invest? Our team matches serious buyers with sellers.', icon: TrendingUp, to: '/contact' },
]

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

  const heroImages = [
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/1.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/2.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/3.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/4.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/5.jpg',
  ]

  const flowImages = Array.from({ length: 2 }, () => [...heroImages]).flat()

  const { scrollYProgress } = useScroll({ container: containerRef })

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
                {flowImages.map((src, idx) => (
                  <div key={`top-${mountKey}-${idx}`} className="relative h-[95%] w-auto flex-shrink-0">
                    <img
                      src={src}
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
          <div className="absolute bottom-0 left-0 h-1/2 hidden md:block" style={clipBox}>
            <motion.div style={{ x: bottomRowX }} className="w-max h-full">
              <div
                key={`bottom-flow-${mountKey}`}
                className="flex gap-4 h-full items-center animate-flow"
                style={{ animationDirection: 'reverse' }}
              >
                {flowImages.map((src, idx) => (
                  <div key={`bottom-${mountKey}-${idx}`} className="relative h-[95%] w-auto flex-shrink-0">
                    <img
                      src={src}
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
        className="fixed top-0 left-0 w-full h-full overflow-y-scroll z-20"
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
                  <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center md:justify-start">
                    <button
                      onClick={() => navigate('/contact')}
                      className="border-2 border-[#2d568e] text-[#2d568e] px-5 sm:px-7 py-3 sm:py-4 rounded-2xl font-bold text-sm hover:bg-[#2d568e]/5 transition-all duration-300 hover:scale-105 active:scale-95 w-full sm:w-auto"
                    >
                      <Phone size={18} /> Contact Us
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-6 md:mt-8 pt-5 md:pt-6 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 sm:gap-3 text-gray-600 text-xs sm:text-sm font-semibold">
                  <span>Join our free community</span>
                  <span className="text-gray-300 hidden sm:inline">|</span>
                  <span>List your property with us</span>
                  <span className="text-gray-300 hidden sm:inline">|</span>
                  <span>Full property management services</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            CONTINUOUS CANVAS
           ============================================================ */}
        <div className="relative bg-white">
          {SERVICES.map((service, i) => {
            const Icon = service.icon
            const isEven = i % 2 === 0
            return (
              <ServiceSection key={service.key} service={service} Icon={Icon} isEven={isEven} />
            )
          })}

          <HoleSection />
          <TestimonialsCarousel />
          <ActionsSection navigate={navigate} />
          <FinalCTA navigate={navigate} />
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
function ServiceSection({ service, Icon, isEven }) {
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
        onClick={() => {}}
        className="inline-flex items-center gap-2 font-bold text-lg hover:gap-3 transition-all duration-500 ease-out"
        style={{ color: LOGO_BLUE }}
      >
        Learn more <ArrowRight size={20} />
      </button>
    </div>
  )

  const image = (
    <div className="relative">
      <div className="rounded-3xl overflow-hidden shadow-2xl border border-gray-100">
        <img
          src={service.image}
          alt={service.title}
          className="w-full h-[340px] md:h-[560px] object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    </div>
  )

  return (
    <section className="relative py-32 md:py-48">
      <div className="max-w-6xl mx-auto px-6 w-full">
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
          <div className={isEven ? '' : 'md:order-2'}>
            <Reveal amount={0.4} y={30}>{image}</Reveal>
          </div>
          <div className={isEven ? '' : 'md:order-1'}>
            {isEven ? (
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
          backgroundImage:
            'url(https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/5.jpg)',
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
// TESTIMONIALS CAROUSEL
// ============================================================
function TestimonialsCarousel() {
  const [index, setIndex] = useState(0)
  const total = TESTIMONIALS.length
  const cardsVisible = 3

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % total)
    }, 4000)
    return () => clearInterval(interval)
  }, [total])

  const visibleCards = []
  for (let i = 0; i < cardsVisible; i++) {
    visibleCards.push(TESTIMONIALS[(index + i) % total])
  }

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

        <div className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {visibleCards.map((t, i) => (
                <TestimonialCard key={`${t.id}-${i}`} testimonial={t} />
              ))}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-center gap-2 mt-12">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Show testimonial ${i + 1}`}
                className="h-1.5 rounded-full transition-all duration-500 ease-out"
                style={{
                  width: index === i ? 32 : 6,
                  backgroundColor: index === i ? LOGO_BLUE : '#d1d5db',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function TestimonialCard({ testimonial }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-shadow duration-500 p-7 flex flex-col h-full">
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-5" style={{ backgroundColor: `${LOGO_BLUE}18` }}>
        <Quote size={18} style={{ color: LOGO_BLUE }} />
      </div>
      <p className="text-gray-700 text-base leading-relaxed mb-6 flex-1">"{testimonial.quote}"</p>
      <div className="flex items-center gap-0.5 mb-5">
        {[...Array(testimonial.rating)].map((_, i) => (
          <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
        ))}
      </div>
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
// ACTIONS
// ============================================================
function ActionsSection({ navigate }) {
  return (
    <section className="relative py-32 md:py-48">
      <div className="max-w-6xl mx-auto px-6 w-full">
        <Reveal className="text-center mb-16" amount={0.5}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: LOGO_BLUE }}>
            Get Started
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-gray-900 leading-[1.05] mb-4 tracking-tight">
            Three ways to work with us.
          </h2>
          <p className="text-gray-500 text-base md:text-lg max-w-2xl mx-auto">
            Whatever brings you here, we have a path for it.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-8">
          {ACTIONS.map((action, i) => {
            const Icon = action.icon
            return (
              <Reveal key={action.key} delay={i * 0.15} amount={0.4}>
                <button
                  onClick={() => navigate(action.to)}
                  className="group w-full text-left bg-white rounded-2xl border border-gray-200 p-9 hover:border-[#2d568e] hover:shadow-2xl transition-all duration-500 ease-out h-full flex flex-col"
                >
                  <Icon size={40} style={{ color: LOGO_BLUE }} strokeWidth={1.4} className="mb-7" />
                  <h3 className="text-2xl md:text-3xl font-black text-gray-900 mb-3 tracking-tight">{action.title}</h3>
                  <p className="text-gray-600 text-base leading-relaxed mb-10 flex-1">{action.description}</p>
                  <span className="inline-flex items-center gap-2 font-bold text-lg group-hover:gap-3 transition-all duration-500 ease-out" style={{ color: LOGO_BLUE }}>
                    {action.label} <ArrowRight size={20} />
                  </span>
                </button>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FINAL CTA
// ============================================================
function FinalCTA({ navigate }) {
  return (
    <section className="relative bg-gradient-to-br from-[#1e3a5f] via-[#2d568e] to-[#1e3a5f] py-32 md:py-48">
      <div className="max-w-4xl mx-auto px-6 w-full text-center">
        <Reveal amount={0.5}>
          <h2 className="text-4xl md:text-6xl font-black text-white leading-[1.05] mb-6 tracking-tight">
            Ready to earn from your property?
          </h2>
          <p className="text-white/80 text-base md:text-lg mb-12 max-w-2xl mx-auto leading-relaxed">
            Whether you own one unit or ten, Iloilo Rentals manages the guests, cleaning, and payouts so you don't have to.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center">
            <button
              onClick={() => navigate('/contact')}
              className="bg-transparent border-2 border-white/40 text-white px-8 py-4 rounded-2xl font-bold text-sm hover:bg-white/10 transition-all duration-500 inline-flex items-center justify-center gap-2 hover:scale-105"
            >
              <Phone size={18} /> Talk to Our Team
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}