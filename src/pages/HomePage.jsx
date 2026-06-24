import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
} from 'framer-motion'
import { supabase } from '../lib/supabase'
import ModernCondoCard from '../components/ModernCondoCard'
import Footer from '../components/Footer'
import { ChevronRight, Shield, Clock, MapPin, ArrowRight } from 'lucide-react'

function SlideUpSection({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, margin: '-100px 0px -100px 0px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm animate-pulse">
      <div className="h-56 sm:h-64 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="flex gap-4 pt-1">
          <div className="h-3 bg-gray-200 rounded w-12" />
          <div className="h-3 bg-gray-200 rounded w-12" />
          <div className="h-3 bg-gray-200 rounded w-12" />
        </div>
        <div className="h-4 bg-gray-200 rounded w-1/3 mt-2" />
        <div className="h-9 bg-gray-200 rounded-lg mt-3" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const [featuredCondos, setFeaturedCondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [isScrolled, setIsScrolled] = useState(false)
  const [heroHeight, setHeroHeight] = useState(window.innerHeight)

  const listingsScrollRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleResize = () => setHeroHeight(window.innerHeight)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [animationPlayState, setAnimationPlayState] = useState('running')
  const [hideCentral, setHideCentral] = useState(false)

  const heroImages = [
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/1.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/2.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/3.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/4.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/5.jpg',
  ]

  const flowImages = Array.from({ length: 10 }, () => [...heroImages]).flat()

  const { scrollYProgress } = useScroll({ container: containerRef })

  useLayoutEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
  }, [])

  const handleListingsScroll = (e) => setIsScrolled(e.target.scrollTop > 10)

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    if (latest > 0 && animationPlayState === 'running') setAnimationPlayState('paused')
    if (latest < 0.01 && animationPlayState === 'paused') setAnimationPlayState('running')
  })

  const easedExitProgress = useTransform(scrollYProgress, (v) => {
    const raw = Math.min(Math.max(v * 4, 0), 1)
    return raw * raw
  })

  useEffect(() => {
    const unsubscribe = easedExitProgress.on('change', (v) => {
      if (v > 0.3 && !hideCentral) setHideCentral(true)
      if (v <= 0.03 && hideCentral) setHideCentral(false)
    })
    return () => unsubscribe()
  }, [easedExitProgress, hideCentral])

  const topRowX = useTransform(easedExitProgress, (p) => -p * 200000)
  const bottomRowX = useTransform(easedExitProgress, (p) => p * 200000)

  const centralOpacity = useTransform(easedExitProgress, [0, 0.3], [1, 0])
  const centralY = useTransform(easedExitProgress, [0, 0.3], [0, -200])

  const listingsOpacity = useTransform(scrollYProgress, (v) => {
    const start = 0.65
    const end = 1.0
    const p = (v - start) / (end - start)
    return Math.min(Math.max(p, 0), 1)
  })

  useEffect(() => { fetchFeaturedCondos() }, [])

  async function fetchFeaturedCondos() {
    setLoading(true)
    const { data } = await supabase.from('condos').select('*').limit(5)
    if (data) setFeaturedCondos(data)
    setLoading(false)
  }

  return (
    <>
      <div ref={containerRef} className="fixed top-0 left-0 w-full h-full overflow-y-scroll snap-y snap-mandatory z-20">
        <div className="snap-start" style={{ height: `${heroHeight}px`, background: 'transparent' }} />

        <section className="snap-start h-screen bg-white flex flex-col">
          <div className={`flex-shrink-0 text-center px-6 pt-20 pb-3 sticky top-0 bg-white z-10 transition-shadow duration-300 border-b border-gray-200 ${isScrolled ? 'shadow-lg' : 'shadow-none'}`}>
            <h2 className="text-base font-medium text-gray-900">Featured Listings</h2>
            <p className="text-gray-500 text-xs mt-1 max-w-md mx-auto">Discover our most popular condo units in Iloilo City</p>
          </div>

          <div ref={listingsScrollRef} onScroll={handleListingsScroll} className="flex-1 overflow-y-auto px-4 md:px-8 pb-4">
            <div className="max-w-5xl mx-auto pt-4">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {featuredCondos.map((condo, index) => (
                      <SlideUpSection key={condo.id} delay={index * 0.12}><ModernCondoCard condo={condo} /></SlideUpSection>
                    ))}
                  </div>
                  <div className="text-center py-8"><p className="text-gray-400 text-xs italic">More premium listings coming soon</p></div>
                </>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-white/90 backdrop-blur-sm">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <p className="text-sm text-gray-500 hidden sm:block">Find your perfect stay in Iloilo</p>
              <Link to="/condos" className="sm:ml-auto">
                <button className="bg-[#2d568e] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition-all duration-300 inline-flex items-center gap-2 shadow-lg shadow-[#2d568e]/20 hover:shadow-xl hover:shadow-[#2d568e]/30 group">
                  View All Properties <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>
          </div>
        </section>

        <section className="snap-start h-screen bg-white flex items-center">
          <div className="max-w-7xl mx-auto px-4 w-full py-8">
            <SlideUpSection className="text-center mb-6" delay={0.1}>
              <h2 className="text-base font-medium text-gray-900">Why Choose Us</h2>
              <p className="text-gray-500 text-xs mt-1.5 max-w-md mx-auto">Experience the difference with our premium service</p>
            </SlideUpSection>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { icon: <MapPin size={22} />, title: 'Prime Locations', desc: 'Near Megaworld, Atria, and Iloilo Business Park' },
                { icon: <Shield size={22} />, title: 'Verified Properties', desc: 'Every property is personally verified and well-maintained' },
                { icon: <Clock size={22} />, title: '24/7 Support', desc: 'Local team ready to assist you anytime' },
              ].map((item, index) => (
                <SlideUpSection key={index} delay={0.2 + index * 0.15}>
                  <div className="bg-gray-50 p-5 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-center cursor-pointer">
                    <div className="w-12 h-12 bg-[#2d568e]/10 rounded-xl flex items-center justify-center mx-auto mb-3 text-[#2d568e]">{item.icon}</div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1.5">{item.title}</h3>
                    <p className="text-gray-500 text-xs">{item.desc}</p>
                  </div>
                </SlideUpSection>
              ))}
            </div>
          </div>
        </section>

        <section className="snap-start h-screen bg-[#2d568e] flex items-center">
          <div className="max-w-7xl mx-auto px-4 w-full text-center py-8">
            <SlideUpSection delay={0.1}>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-3">Ready to Find Your Perfect Stay?</h2>
              <p className="text-white/80 text-sm mb-6 max-w-2xl mx-auto">Book your premium condo today and experience the best of Iloilo City</p>
              <Link to="/condos"><button className="bg-white text-[#2d568e] px-7 py-3 rounded-xl font-semibold text-sm hover:shadow-xl transition-all duration-300">Start Exploring</button></Link>
            </SlideUpSection>
          </div>
        </section>

        <section className="snap-start min-h-screen bg-gray-800 flex items-center">
          <div className="w-full"><Footer /></div>
        </section>
      </div>

      <section className="fixed top-0 left-0 w-full h-full overflow-hidden z-10 pointer-events-none" style={{ background: 'transparent' }}>
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-0 w-full h-1/2 overflow-hidden">
            <motion.div style={{ x: topRowX }} className="w-max h-full">
              <div className="flex gap-4 h-full items-center animate-flow" style={{ animationPlayState }}>
                {flowImages.map((src, idx) => (<img key={`top-${idx}`} src={src} alt="" className="h-[95%] w-auto rounded-xl object-cover shadow-xl flex-shrink-0" />))}
              </div>
            </motion.div>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1/2 overflow-hidden">
            <motion.div style={{ x: bottomRowX }} className="w-max h-full">
              <div className="flex gap-4 h-full items-center animate-flow" style={{ animationPlayState, animationDirection: 'reverse' }}>
                {flowImages.map((src, idx) => (<img key={`bottom-${idx}`} src={src} alt="" className="h-[95%] w-auto rounded-xl object-cover shadow-xl flex-shrink-0" />))}
              </div>
            </motion.div>
          </div>
        </div>
        {!hideCentral && (
          <motion.div style={{ opacity: centralOpacity, y: centralY }} className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="max-w-7xl mx-auto px-4 w-full pointer-events-auto">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-black/30 backdrop-blur-sm rounded-3xl p-8 md:p-12">
                <div className="md:w-1/3 flex justify-center"><img src="/Iloilo_rentals_img.png" alt="Iloilo Rentals Logo" className="w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-lg" /></div>
                <div className="md:w-2/3 text-center md:text-left text-white">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">Find Your Perfect Stay in Iloilo City</h1>
                  <p className="text-lg text-white/80 mb-8 max-w-2xl">Premium condo units near Megaworld, Atria, and Iloilo's best locations. Experience luxury and comfort with our hand‑picked properties.</p>
                  <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                    <Link to="/condos"><button className="bg-[#2d568e] text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-[#1e3a5f] transition-all duration-300 flex items-center gap-2 group shadow-lg">Explore Properties <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" /></button></Link>
                    <Link to="/contact"><button className="border-2 border-white text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-white hover:text-[#2d568e] transition-all duration-300">Contact Us</button></Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </section>

      <style>{`@keyframes slide { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } .animate-flow { animation: slide 80s linear infinite; }`}</style>
    </>
  )
}