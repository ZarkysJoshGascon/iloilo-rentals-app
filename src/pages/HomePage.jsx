import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ModernCondoCard from '../components/ModernCondoCard'
import { ChevronRight, Sparkles, Shield, Clock, MapPin } from 'lucide-react'

export default function HomePage() {
  const [featuredCondos, setFeaturedCondos] = useState([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)
  const [stats, setStats] = useState({ guests: 0, condos: 0, rating: 0 })

  const heroImages = [
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/1.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/2.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/3.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/4.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/5.jpg',
  ]

  useEffect(() => {
    fetchFeaturedCondos()
    fetchStats()
  }, [])

  async function fetchFeaturedCondos() {
    const { data } = await supabase.from('condos').select('*').limit(3)
    if (data) setFeaturedCondos(data)
  }

  async function fetchStats() {
    const { count: bookingCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true })
    const { count: condoCount } = await supabase.from('condos').select('*', { count: 'exact', head: true })
    
    setStats({
      guests: bookingCount || 0,
      condos: condoCount || 0,
      rating: 4.8
    })
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % heroImages.length)
        setFade(true)
      }, 500)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      {/* Hero Section */}
      <div className="relative h-screen min-h-[600px] max-h-[900px] w-full overflow-hidden">
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
              
              {/* LOGO */}
              <div className="md:w-1/3 flex justify-center">
                <img 
                  src="/Iloilo_rentals_img.png" 
                  alt="Iloilo Rentals Logo" 
                  className="w-48 h-48 md:w-64 md:h-64 object-contain"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/256x256?text=ILOILO+RENTALS'
                  }}
                />
              </div>
              
              {/* Text Content */}
              <div className="md:w-2/3 text-center md:text-left">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                  Find Your Perfect Stay in Iloilo City
                </h1>
                
                <p className="text-lg text-white/90 mb-8 max-w-2xl">
                  Premium condo units near Megaworld, Atria, and Iloilo's best locations. 
                  Experience luxury and comfort with our hand-picked properties.
                </p>
                
                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                  <Link to="/condos">
                    <button className="bg-white text-[#2d568e] px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-gray-100 transition-all duration-300 flex items-center gap-2 group shadow-lg">
                      Explore Properties
                      <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </Link>
                  <Link to="/contact">
                    <button className="bg-[#2d568e] text-white px-8 py-3.5 rounded-xl font-semibold text-lg hover:bg-[#1e3a5f] transition-all duration-300">
                      Contact Us
                    </button>
                  </Link>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-white border-b border-gray-100 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="p-4">
              <div className="text-3xl font-bold text-[#2d568e]">{stats.condos}+</div>
              <div className="text-gray-500 text-sm">Premium Condos</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-[#2d568e]">{stats.guests}+</div>
              <div className="text-gray-500 text-sm">Happy Guests</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-[#2d568e]">{stats.rating}★</div>
              <div className="text-gray-500 text-sm">Average Rating</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-[#2d568e]">24/7</div>
              <div className="text-gray-500 text-sm">Guest Support</div>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Condos Section */}
      <div className="max-w-7xl mx-auto px-4 py-16 md:py-20">
        <div className="text-center mb-12">
          <span className="text-[#2d568e] font-semibold text-sm uppercase tracking-wider">Handpicked For You</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
            Featured Listings
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Discover our most popular condo units in Iloilo City, carefully selected for quality and comfort
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredCondos.map((condo) => (
            <ModernCondoCard key={condo.id} condo={condo} />
          ))}
        </div>
        
        <div className="text-center mt-12">
          <Link to="/condos">
            <button className="border-2 border-[#2d568e] text-[#2d568e] px-8 py-3 rounded-xl font-semibold hover:bg-[#2d568e] hover:text-white transition-all duration-300 inline-flex items-center gap-2 group">
              View All Properties
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
        </div>
      </div>

      {/* Why Choose Us */}
      <div className="bg-gray-50 py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="text-[#2d568e] font-semibold text-sm uppercase tracking-wider">Why Choose Us</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-2 mb-4">
              The Iloilo Rentals Advantage
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto">
              Experience the difference with our premium service and carefully curated properties
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-[#2d568e]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MapPin size={28} className="text-[#2d568e]" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3">Prime Locations</h3>
              <p className="text-gray-500 leading-relaxed">
                All units near Megaworld, Atria Park District, and Iloilo Business Park
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-[#2d568e]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Shield size={28} className="text-[#2d568e]" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3">Verified Properties</h3>
              <p className="text-gray-500 leading-relaxed">
                Every property is personally verified and well-maintained
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 text-center">
              <div className="w-16 h-16 bg-[#2d568e]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Clock size={28} className="text-[#2d568e]" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3">24/7 Support</h3>
              <p className="text-gray-500 leading-relaxed">
                Local team ready to assist you anytime
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-[#2d568e] py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
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
        </div>
      </div>
    </div>
  )
}