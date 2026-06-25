import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { supabase } from '../lib/supabase'
import ModernCondoCard from '../components/ModernCondoCard'
import Footer from '../components/Footer'
import { ChevronRight, Shield, Clock, MapPin, ArrowRight, Search, Phone } from 'lucide-react'

function SlideUpSection({ children, className = '', delay = 0 }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, margin: '-100px 0px -100px 0px' }} transition={{ duration: 0.6, delay, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm animate-pulse">
      <div className="h-56 sm:h-64 bg-gray-200" />
      <div className="p-4 space-y-3"><div className="h-4 bg-gray-200 rounded w-3/4" /><div className="h-3 bg-gray-200 rounded w-1/2" /><div className="flex gap-4 pt-1"><div className="h-3 bg-gray-200 rounded w-12" /><div className="h-3 bg-gray-200 rounded w-12" /><div className="h-3 bg-gray-200 rounded w-12" /></div><div className="h-4 bg-gray-200 rounded w-1/3 mt-2" /><div className="h-9 bg-gray-200 rounded-lg mt-3" /></div>
    </div>
  )
}

const getInitialMountKey = () => Date.now()

export default function HomePage() {
  const navigate = useNavigate()
  const [featuredCondos, setFeaturedCondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [heroHeight, setHeroHeight] = useState(window.innerHeight)
  const [mountKey, setMountKey] = useState(getInitialMountKey)
  const containerRef = useRef(null)

  useEffect(() => { 
    const h = () => setHeroHeight(window.innerHeight)
    window.addEventListener('resize', h)
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const flowImages = Array.from({ length: 10 }, () => [...heroImages]).flat()
  const { scrollYProgress } = useScroll({ container: containerRef })

  useLayoutEffect(() => { if (containerRef.current) containerRef.current.scrollTop = 0 }, [])

  const easedExitProgress = useTransform(scrollYProgress, (v) => { const r = Math.min(Math.max(v * 4, 0), 1); return r * r })

  const topRowX = useTransform(easedExitProgress, (p) => -p * 200000)
  const bottomRowX = useTransform(easedExitProgress, (p) => p * 200000)

  async function fetchFeaturedCondos() {
    setLoading(true)
    const { data } = await supabase.from('condos').select('*').limit(5)
    if (data) setFeaturedCondos(data)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFeaturedCondos()
  }, [])

  return (
    <>
      {/* Hero Section - background only, behind the snap container */}
      <section className="fixed top-0 left-0 w-full h-full overflow-hidden z-10" style={{ background: '#ffffff' }}>
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-0 w-full h-1/2 overflow-hidden">
            <motion.div style={{ x: topRowX }} className="w-max h-full">
              <div key={`top-flow-${mountKey}`} className="flex gap-4 h-full items-center animate-flow">
                {flowImages.map((src, idx) => (
                  <div key={`top-${mountKey}-${idx}`} className="relative h-[95%] w-auto flex-shrink-0">
                    <img src={src} alt="" className="h-full w-auto rounded-2xl object-cover shadow-2xl ring-1 ring-white/15" />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-1/2 overflow-hidden">
            <motion.div style={{ x: bottomRowX }} className="w-max h-full">
              <div key={`bottom-flow-${mountKey}`} className="flex gap-4 h-full items-center animate-flow" style={{ animationDirection: 'reverse' }}>
                {flowImages.map((src, idx) => (
                  <div key={`bottom-${mountKey}-${idx}`} className="relative h-[95%] w-auto flex-shrink-0">
                    <img src={src} alt="" className="h-full w-auto rounded-2xl object-cover shadow-2xl ring-1 ring-white/15" />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Snap container */}
      <div ref={containerRef} className="fixed top-0 left-0 w-full h-full overflow-y-scroll snap-y snap-mandatory z-20" style={{ background: 'transparent' }}>
        
        {/* Hero overlay */}
        <div className="snap-start relative" style={{ height: `${heroHeight}px`, background: 'transparent' }}>
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 sm:p-8 md:p-10 lg:p-14 w-full max-w-5xl border border-gray-200 shadow-2xl">
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
                <div className="flex-shrink-0">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-400/30 rounded-full blur-3xl scale-150" />
                    <img src="/Iloilo_rentals_img.png" alt="Iloilo Rentals Logo" className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:w-52 lg:h-52 object-contain drop-shadow-2xl relative z-10" />
                  </div>
                </div>
                <div className="text-center md:text-left flex-1">
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black mb-3 md:mb-4 leading-[1.05] tracking-tight">
                    <span className="text-gray-900">Find Your Perfect</span>
                    <br />
                    <span className="bg-gradient-to-r from-[#2d568e] via-[#1e3a5f] to-[#2d568e] bg-clip-text text-transparent">Stay in Iloilo City</span>
                  </h1>
                  <p className="text-gray-500 text-sm sm:text-base md:text-lg mb-6 md:mb-8 max-w-xl leading-relaxed font-medium mx-auto md:mx-0">Connecting you to the best rentals in Iloilo</p>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 justify-center md:justify-start">
                    <button 
                      onClick={() => navigate('/condos')} 
                      className="bg-[#2d568e] text-white px-5 sm:px-7 py-3 sm:py-4 rounded-2xl font-bold text-sm hover:bg-[#1e3a5f] transition-all duration-300 flex items-center justify-center gap-2 shadow-xl shadow-[#2d568e]/20 hover:scale-105 active:scale-95 w-full sm:w-auto"
                    >
                      <Search size={18} /> Explore Listings <ChevronRight size={18} />
                    </button>
                    <button 
                      onClick={() => navigate('/contact')} 
                      className="border-2 border-[#2d568e] text-[#2d568e] px-5 sm:px-7 py-3 sm:py-4 rounded-2xl font-bold text-sm hover:bg-[#2d568e]/5 transition-all duration-300 hover:scale-105 active:scale-95 w-full sm:w-auto"
                    >
                      <Phone size={18} /> Contact Us
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Tagline */}
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

        {/* Featured Listings */}
        <section className="snap-start min-h-screen bg-white flex flex-col">
          <div className="flex-shrink-0 text-center px-6 pt-6 sm:pt-16 md:pt-20 pb-3 bg-white z-10 border-b border-gray-200">
            <h2 className="text-base font-medium text-gray-900">Featured Listings</h2>
            <p className="text-gray-500 text-xs mt-1 max-w-md mx-auto">Discover our most popular condo units in Iloilo City</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-4">
            <div className="max-w-5xl mx-auto pt-4">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{featuredCondos.map((condo, index) => (<SlideUpSection key={condo.id} delay={index * 0.12}><ModernCondoCard condo={condo} /></SlideUpSection>))}</div>
                  <div className="text-center py-8"><p className="text-gray-400 text-xs italic">More premium listings coming soon</p></div>
                </>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 px-4 sm:px-6 py-4 pb-24 sm:pb-4 border-t border-gray-100 bg-white/90 backdrop-blur-sm">
            <div className="max-w-5xl mx-auto flex items-center justify-between">
              <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Find your perfect stay in Iloilo</p>
              <button onClick={() => navigate('/condos')} className="sm:ml-auto w-full sm:w-auto bg-[#2d568e] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#1e3a5f] transition-all duration-300 inline-flex items-center justify-center gap-2 shadow-lg shadow-[#2d568e]/20 hover:shadow-xl hover:shadow-[#2d568e]/30 group">View All Properties <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></button>
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section className="snap-start min-h-screen bg-white flex items-center">
          <div className="max-w-7xl mx-auto px-4 w-full py-8">
            <SlideUpSection className="text-center mb-6" delay={0.1}><h2 className="text-base font-medium text-gray-900">Why Choose Us</h2><p className="text-gray-500 text-xs mt-1.5 max-w-md mx-auto">Experience the difference with our premium service</p></SlideUpSection>
            <div className="grid md:grid-cols-3 gap-4">
              {[{ icon: <MapPin size={22} />, title: 'Prime Locations', desc: 'Near Megaworld, Atria, and Iloilo Business Park' },{ icon: <Shield size={22} />, title: 'Verified Properties', desc: 'Every property is personally verified and well-maintained' },{ icon: <Clock size={22} />, title: '24/7 Support', desc: 'Local team ready to assist you anytime' }].map((item, index) => (
                <SlideUpSection key={index} delay={0.2 + index * 0.15}>
                  <div className="bg-gray-50 p-5 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-center cursor-pointer"><div className="w-12 h-12 bg-[#2d568e]/10 rounded-xl flex items-center justify-center mx-auto mb-3 text-[#2d568e]">{item.icon}</div><h3 className="text-sm font-semibold text-gray-800 mb-1.5">{item.title}</h3><p className="text-gray-500 text-xs">{item.desc}</p></div>
                </SlideUpSection>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="snap-start min-h-screen bg-[#2d568e] flex items-center">
          <div className="max-w-7xl mx-auto px-4 w-full text-center py-8">
            <SlideUpSection delay={0.1}><h2 className="text-xl md:text-2xl font-bold text-white mb-3">Ready to Find Your Perfect Stay?</h2><p className="text-white/80 text-sm mb-6 max-w-2xl mx-auto">Book your premium condo today and experience the best of Iloilo City</p><button onClick={() => navigate('/condos')} className="bg-white text-[#2d568e] px-7 py-3 rounded-xl font-semibold text-sm hover:shadow-xl transition-all duration-300">Start Exploring</button></SlideUpSection>
          </div>
        </section>

        {/* Footer */}
        <section className="snap-start min-h-screen bg-gray-800 flex items-center"><div className="w-full"><Footer /></div></section>
      </div>

      <style>{`@keyframes slide { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } .animate-flow { animation: slide 80s linear infinite; }`}</style>
    </>
  )
}