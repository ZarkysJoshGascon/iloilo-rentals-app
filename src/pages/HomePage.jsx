import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  motion,
  useScroll,
  useTransform,
  useInView,
} from 'framer-motion'
import { supabase } from '../lib/supabase'
import ModernCondoCard from '../components/ModernCondoCard'
import { ChevronRight, Shield, Clock, MapPin } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Fade‑in component for sections below hero                         */
/* ------------------------------------------------------------------ */
function FadeInSection({ children, className = '', delay = 0 }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px 0px' })
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/* Skeleton card for loading state */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
      <div className="h-64 bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="flex gap-4">
          <div className="h-4 bg-gray-200 rounded w-12" />
          <div className="h-4 bg-gray-200 rounded w-12" />
          <div className="h-4 bg-gray-200 rounded w-12" />
        </div>
        <div className="h-10 bg-gray-200 rounded-xl" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const [featuredCondos, setFeaturedCondos] = useState([])
  const [loading, setLoading] = useState(true)

  const heroImages = [
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/1.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/2.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/3.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/4.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/5.jpg',
  ]

  const flowImages = [
    ...heroImages,
    ...heroImages,
    ...heroImages,
    ...heroImages,
  ]

  const heroRef = useRef(null)
  const [heroHeight, setHeroHeight] = useState(0)

  // Measure hero height after mount (and on resize)
  useEffect(() => {
    const updateHeight = () => {
      if (heroRef.current) {
        setHeroHeight(heroRef.current.offsetHeight)
      }
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  // Window scroll Y
  const { scrollY } = useScroll()

  // Progress from 0 (hero fully visible) to 1 (hero completely scrolled out)
  const heroProgress = useTransform(
    scrollY,
    [0, heroHeight],
    [0, 1]
  )

  // Top row exits LEFT (negative X) with opacity fade
  const topRowX = useTransform(heroProgress, [0, 1], [0, -500])
  const topRowOpacity = useTransform(heroProgress, [0, 0.85], [1, 0])

  // Bottom row exits RIGHT (positive X) with opacity fade
  const bottomRowX = useTransform(heroProgress, [0, 1], [0, 500])
  const bottomRowOpacity = useTransform(heroProgress, [0, 0.85], [1, 0])

  // Central content fades and moves up
  const centralOpacity = useTransform(heroProgress, [0, 0.7], [1, 0])
  const centralY = useTransform(heroProgress, [0, 0.7], [0, -100])

  // Listings section fades in smoothly after hero
  const listingsOpacity = useTransform(heroProgress, [0.6, 1], [0, 1])

  useEffect(() => {
    fetchFeaturedCondos()
  }, [])

  async function fetchFeaturedCondos() {
    setLoading(true)
    const { data } = await supabase.from('condos').select('*').limit(3)
    if (data) setFeaturedCondos(data)
    setLoading(false)
  }

  return (
    <div className="bg-white scroll-smooth" style={{ scrollBehavior: 'smooth', scrollSnapType: 'y mandatory' }}>
      {/* ==================== HERO (STICKY) ==================== */}
      <section
        ref={heroRef}
        className="sticky top-0 h-[calc(100vh-4rem)] overflow-hidden bg-white z-10"
        style={{ scrollSnapAlign: 'start' }}
      >
        <div className="absolute inset-0 z-0">
          {/* Top row – exits RIGHT */}
          <div className="absolute top-0 left-0 w-full h-1/2 overflow-hidden">
            <motion.div style={{ x: topRowX, opacity: topRowOpacity }} className="w-max h-full">
              <div className="flex gap-2 h-full items-center animate-flow-left">
                {flowImages.map((src, idx) => (
                  <img
                    key={`top-${idx}`}
                    src={src}
                    alt=""
                    className="h-[95%] w-auto rounded-xl object-cover shadow-lg flex-shrink-0"
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* Bottom row – exits LEFT */}
          <div className="absolute bottom-0 left-0 w-full h-1/2 overflow-hidden">
            <motion.div style={{ x: bottomRowX, opacity: bottomRowOpacity }} className="w-max h-full">
              <div className="flex gap-2 h-full items-center animate-flow-right">
                {flowImages.map((src, idx) => (
                  <img
                    key={`bottom-${idx}`}
                    src={src}
                    alt=""
                    className="h-[95%] w-auto rounded-xl object-cover shadow-lg flex-shrink-0"
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Central logo + text */}
        <motion.div
          style={{ opacity: centralOpacity, y: centralY }}
          className="absolute inset-0 z-10 flex items-center justify-center"
        >
          <div className="max-w-7xl mx-auto px-4 w-full">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-black/30 backdrop-blur-sm rounded-3xl p-8 md:p-12">
              <div className="md:w-1/3 flex justify-center">
                <img
                  src="/Iloilo_rentals_img.png"
                  alt="Iloilo Rentals Logo"
                  className="w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-lg"
                />
              </div>

              <div className="md:w-2/3 text-center md:text-left text-white">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                  Find Your Perfect Stay in Iloilo City
                </h1>
                <p className="text-lg text-white/80 mb-8 max-w-2xl">
                  Premium condo units near Megaworld, Atria, and Iloilo's best
                  locations. Experience luxury and comfort with our hand-picked
                  properties.
                </p>
                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                  <Link to="/condos">
                    <button className="bg-[#2d568e] text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-[#1e3a5f] transition-all duration-300 flex items-center gap-2 group shadow-lg">
                      Explore Properties
                      <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </Link>
                  <Link to="/contact">
                    <button className="border-2 border-white text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-white hover:text-[#2d568e] transition-all duration-300">
                      Contact Us
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <style>{`
          .animate-flow-left {
            animation: flowLeft 80s linear infinite;
          }
          .animate-flow-right {
            animation: flowRight 80s linear infinite;
          }
          @keyframes flowLeft {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @keyframes flowRight {
            0% { transform: translateX(-50%); }
            100% { transform: translateX(0); }
          }
        `}</style>
      </section>

      {/* ==================== FEATURED LISTINGS (appears after hero exits) ==================== */}
      <motion.div
        style={{ opacity: listingsOpacity }}
        className="relative z-20 bg-white"
        data-scroll-section
      >
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-20">
          <FadeInSection className="text-center mb-12">
            <span className="text-[#2d568e] font-semibold text-sm uppercase tracking-wider inline-block">
              Handpicked For You
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
              Featured Listings
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Discover our most popular condo units in Iloilo City, carefully selected for quality and comfort
            </p>
          </FadeInSection>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredCondos.map((condo, index) => (
                <FadeInSection key={condo.id} delay={index * 0.15}>
                  <ModernCondoCard condo={condo} />
                </FadeInSection>
              ))}
            </div>
          )}

          <FadeInSection className="text-center mt-12" delay={0.2}>
            <Link to="/condos">
              <button className="border-2 border-[#2d568e] text-[#2d568e] px-8 py-3 rounded-xl font-semibold hover:bg-[#2d568e] hover:text-white transition-all duration-300 inline-flex items-center gap-2 group">
                View All Properties
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
          </FadeInSection>
        </div>
      </motion.div>

      {/* ==================== WHY CHOOSE US ==================== */}
      <div className="bg-white py-16 md:py-20 relative z-20" style={{ scrollSnapAlign: 'start' }}>
        <div className="max-w-7xl mx-auto px-4">
          <FadeInSection className="text-center mb-12">
            <span className="text-[#2d568e] font-semibold text-sm uppercase tracking-wider">Why Choose Us</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
              The Iloilo Rentals Advantage
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Experience the difference with our premium service and carefully curated properties
            </p>
          </FadeInSection>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <MapPin size={28} className="text-[#2d568e]" />, title: 'Prime Locations', desc: 'All units near Megaworld, Atria Park District, and Iloilo Business Park' },
              { icon: <Shield size={28} className="text-[#2d568e]" />, title: 'Verified Properties', desc: 'Every property is personally verified and well-maintained' },
              { icon: <Clock size={28} className="text-[#2d568e]" />, title: '24/7 Support', desc: 'Local team ready to assist you anytime' },
            ].map((item, index) => (
              <FadeInSection key={index} delay={index * 0.15}>
                <div className="bg-gray-50 p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-center cursor-pointer">
                  <div className="w-16 h-16 bg-[#2d568e]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-3">{item.title}</h3>
                  <p className="text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== CTA ==================== */}
      <div className="bg-[#2d568e] py-16 md:py-20 relative z-20" style={{ scrollSnapAlign: 'start' }}>
        <div className="max-w-7xl mx-auto px-4 text-center">
          <FadeInSection>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Find Your Perfect Stay?
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
              Book your premium condo today and experience the best of Iloilo City
            </p>
            <Link to="/condos">
              <button className="bg-white text-[#2d568e] px-8 py-3.5 rounded-xl font-semibold text-lg hover:shadow-xl transition-all duration-300">
                Start Exploring
              </button>
            </Link>
          </FadeInSection>
        </div>
      </div>
    </div>
  )
}