import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { supabase } from '../lib/supabase'
import ModernCondoCard from '../components/ModernCondoCard'
import { ChevronRight, Shield, Clock, MapPin } from 'lucide-react'

export default function HomePage() {
  const [featuredCondos, setFeaturedCondos] = useState([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)
  const [stats, setStats] = useState({ guests: 0, condos: 0, rating: 0 })
  const targetRef = useRef(null)

  const heroImages = [
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/1.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/2.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/3.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/4.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/5.jpg',
  ]

  // Scroll animations
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end start"]
  })

  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8])

  // -------- data fetching functions (defined before effects) --------
  const fetchFeaturedCondos = useCallback(async () => {
    const { data } = await supabase.from('condos').select('*').limit(3)
    if (data) setFeaturedCondos(data)
  }, [])

  const fetchStats = useCallback(async () => {
    const { count: bookingCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true })
    const { count: condoCount } = await supabase.from('condos').select('*', { count: 'exact', head: true })
    
    setStats({
      guests: bookingCount || 0,
      condos: condoCount || 0,
      rating: 4.8
    })
  }, [])

  // -------- effects --------
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFeaturedCondos()
    fetchStats()
  }, [fetchFeaturedCondos, fetchStats])

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % heroImages.length)
        setFade(true)
      }, 500)
    }, 5000)
    return () => clearInterval(interval)
  }, [heroImages.length])

  return (
    <div ref={targetRef}>
      {/* Hero Section with parallax animation */}
      <motion.div 
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative h-screen min-h-[600px] max-h-[900px] w-full overflow-hidden"
      >
        <div 
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: fade ? 1 : 0 }}
        >
          <img 
            src={heroImages[currentImageIndex]} 
            alt="Hero" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-black/50"></div>
        
        <div className="relative h-full flex items-center">
          <div className="max-w-7xl mx-auto px-4 w-full">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              
              {/* LOGO with pulse animation */}
              <motion.div 
                className="md:w-1/3 flex justify-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                whileHover={{ scale: 1.05, rotate: 5 }}
              >
                <img 
                  src="/Iloilo_rentals_img.png" 
                  alt="Iloilo Rentals Logo" 
                  className="w-48 h-48 md:w-64 md:h-64 object-contain"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/256x256?text=ILOILO+RENTALS'
                  }}
                />
              </motion.div>
              
              {/* Text Content with staggered animations */}
              <div className="md:w-2/3 text-center md:text-left">
                <motion.h1 
                  className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  Find Your Perfect Stay in Iloilo City
                </motion.h1>
                
                <motion.p 
                  className="text-lg text-white/90 mb-8 max-w-2xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  Premium condo units near Megaworld, Atria, and Iloilo's best locations. 
                  Experience luxury and comfort with our hand-picked properties.
                </motion.p>
                
                <motion.div 
                  className="flex flex-wrap gap-4 justify-center md:justify-start"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                >
                  <Link to="/condos">
                    <motion.button 
                      className="bg-white text-[#2d568e] px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-all duration-300 flex items-center gap-2 group shadow-lg"
                      whileHover={{ scale: 1.05, backgroundColor: "#f0f0f0" }}
                      whileTap={{ scale: 0.98 }}
                      animate={{ 
                        boxShadow: ["0px 0px 0px rgba(0,0,0,0)", "0px 0px 20px rgba(255,255,255,0.5)", "0px 0px 0px rgba(0,0,0,0)"]
                      }}
                      transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
                    >
                      Explore Properties
                      <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </motion.button>
                  </Link>
                  <Link to="/contact">
                    <motion.button 
                      className="bg-[#2d568e] text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-[#1e3a5f] transition-all duration-300"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Contact Us
                    </motion.button>
                  </Link>
                </motion.div>
              </div>
              
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Section with fade in on scroll */}
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true, margin: "-100px" }}
        className="bg-white border-b border-gray-100 py-8"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: stats.condos + '+', label: 'Premium Condos' },
              { value: stats.guests + '+', label: 'Happy Guests' },
              { value: stats.rating + '★', label: 'Average Rating' },
              { value: '24/7', label: 'Guest Support' }
            ].map((stat, index) => (
              <motion.div 
                key={index}
                className="p-4 rounded-xl cursor-pointer"
                whileHover={{ scale: 1.1, backgroundColor: "#f3f4f6" }}
                transition={{ type: "spring", stiffness: 400 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                viewport={{ once: true }}
              >
                <motion.div 
                  className="text-3xl font-bold text-[#2d568e]"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2, repeatDelay: 3, delay: index * 0.5 }}
                >
                  {stat.value}
                </motion.div>
                <div className="text-gray-500 text-sm">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Featured Condos Section */}
      <div className="max-w-7xl mx-auto px-4 py-16 md:py-20">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <motion.span 
            className="text-[#2d568e] font-semibold text-sm uppercase tracking-wider inline-block"
            animate={{ letterSpacing: ["0em", "0.1em", "0em"] }}
            transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
          >
            Handpicked For You
          </motion.span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
            Featured Listings
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Discover our most popular condo units in Iloilo City, carefully selected for quality and comfort
          </p>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredCondos.map((condo, index) => (
            <ModernCondoCard key={condo.id} condo={condo} index={index} />
          ))}
        </div>
        
        <motion.div 
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          viewport={{ once: true }}
        >
          <Link to="/condos">
            <motion.button 
              className="border-2 border-[#2d568e] text-[#2d568e] px-8 py-3 rounded-xl font-semibold hover:bg-[#2d568e] hover:text-white transition-all duration-300 inline-flex items-center gap-2 group"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              animate={{ 
                borderColor: ["#2d568e", "#1e3a5f", "#2d568e"],
              }}
              transition={{ repeat: Infinity, duration: 2, repeatDelay: 2 }}
            >
              View All Properties
              <motion.div
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1, repeatDelay: 2 }}
              >
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </motion.div>
            </motion.button>
          </Link>
        </motion.div>
      </div>

      {/* Why Choose Us */}
      <div className="bg-gray-50 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <span className="text-[#2d568e] font-semibold text-sm uppercase tracking-wider">Why Choose Us</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
              The Iloilo Rentals Advantage
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Experience the difference with our premium service and carefully curated properties
            </p>
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <MapPin size={28} className="text-[#2d568e]" />, title: "Prime Locations", desc: "All units near Megaworld, Atria Park District, and Iloilo Business Park" },
              { icon: <Shield size={28} className="text-[#2d568e]" />, title: "Verified Properties", desc: "Every property is personally verified and well-maintained" },
              { icon: <Clock size={28} className="text-[#2d568e]" />, title: "24/7 Support", desc: "Local team ready to assist you anytime" }
            ].map((item, index) => (
              <motion.div 
                key={index}
                className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-center cursor-pointer"
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true, margin: "-100px" }}
                whileHover={{ y: -15, scale: 1.02, transition: { duration: 0.2 } }}
              >
                <motion.div 
                  className="w-16 h-16 bg-[#2d568e]/10 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  whileHover={{ rotate: 360, backgroundColor: "#2d568e" }}
                  transition={{ duration: 0.5 }}
                >
                  <motion.div whileHover={{ color: "white" }}>
                    {item.icon}
                  </motion.div>
                </motion.div>
                <h3 className="text-xl font-bold text-gray-800 mb-3">{item.title}</h3>
                <p className="text-gray-500 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <motion.div 
        className="bg-[#2d568e] py-16 md:py-20 overflow-hidden"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
      >
        <div className="max-w-7xl mx-auto px-4 text-center relative">
          <motion.div
            animate={{ 
              scale: [1, 1.02, 1],
              opacity: [1, 0.95, 1]
            }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)"
            }}
          />
          
          <motion.h2 
            className="text-3xl md:text-4xl font-bold text-white mb-4 relative z-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            viewport={{ once: true }}
          >
            Ready to Find Your Perfect Stay?
          </motion.h2>
          
          <motion.p 
            className="text-white/80 text-lg mb-8 max-w-2xl mx-auto relative z-10"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            viewport={{ once: true }}
          >
            Book your premium condo today and experience the best of Iloilo City
          </motion.p>
          
          <Link to="/condos">
            <motion.button 
              className="bg-white text-[#2d568e] px-8 py-3.5 rounded-xl font-semibold text-lg hover:shadow-xl transition-all duration-300 relative z-10"
              whileHover={{ scale: 1.05, backgroundColor: "#f0f0f0" }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              viewport={{ once: true }}
              animate={{
                boxShadow: ["0px 0px 0px rgba(0,0,0,0)", "0px 10px 30px rgba(255,255,255,0.3)", "0px 0px 0px rgba(0,0,0,0)"]
              }}
              transition={{ repeat: Infinity, duration: 2, repeatDelay: 2 }}
            >
              Start Exploring
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}