import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ModernCondoCard from '../components/ModernCondoCard'

export default function HomePage() {
  const [featuredCondos, setFeaturedCondos] = useState([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)

  const heroImages = [
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/1.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/2.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/3.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/4.jpg',
    'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/5.jpg',
  ]

  useEffect(() => {
    fetchFeaturedCondos()
  }, [])

  async function fetchFeaturedCondos() {
    const { data } = await supabase
      .from('condos')
      .select('*')
      .limit(3)
    if (data) setFeaturedCondos(data)
  }

  // Rotate hero images every 5 seconds with fade
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
      {/* Hero Section - Larger (occupies ~1/2 of screen) */}
      <div style={{ position: 'relative', height: '80vh', minHeight: '550px', width: '100%', overflow: 'hidden' }}>
        
        {/* Image with Fade Effect */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transition: 'opacity 0.5s ease-in-out',
          opacity: fade ? 1 : 0
        }}>
          <img 
            src={heroImages[currentImageIndex]}
            alt="Hero"
            style={{ 
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        </div>
        
        {/* Dark Overlay */}
        <div style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 1
        }}></div>
        
        {/* Content */}
        <div style={{ 
          position: 'relative', 
          zIndex: 2, 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center' 
        }}>
          <div className="max-w-7xl mx-auto px-4 w-full">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              
              {/* Logo */}
              <div className="md:w-1/3 flex justify-center">
                <img 
                  src="/Iloilo_rentals_img.png" 
                  alt="Logo" 
                  style={{ width: '400px', height: '400px', objectFit: 'contain' }}
                  onError={(e) => {
                    e.target.src = 'https://picsum.photos/id/104/200/200'
                  }}
                />
              </div>
              
              {/* Text */}
              <div className="md:w-2/3 text-center md:text-left">
                <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
                  Find Your Perfect Stay in Iloilo City
                </h1>
                <p className="text-xl md:text-2xl text-white/90 mb-8 drop-shadow-md">
                  Premium condo units near Megaworld, Atria, and Iloilo's best locations
                </p>
                <Link to="/condos">
                  <button className="bg-white text-[#2d568e] px-8 py-3 rounded-xl font-semibold text-lg hover:bg-gray-100 transition shadow-lg">
                    Browse All Condos
                  </button>
                </Link>
              </div>
              
            </div>
          </div>
        </div>
        
      </div>

      {/* Featured Condos - Modern Cards */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-[#2d568e] mb-3">Featured Listings</h2>
          <p className="text-gray-500">Discover our most popular condo units in Iloilo City</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredCondos.map((condo) => (
            <ModernCondoCard key={condo.id} condo={condo} />
          ))}
        </div>
      </div>

      {/* Why Choose Us */}
      <div className="bg-gray-100 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-[#2d568e] mb-12">Why Choose Iloilo Rentals?</h2>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <div className="text-5xl mb-3">📍</div>
              <h3 className="text-xl font-semibold mb-2">Prime Locations</h3>
              <p className="text-gray-600">All units near business districts and malls</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <div className="text-5xl mb-3">📅</div>
              <h3 className="text-xl font-semibold mb-2">Flexible Booking</h3>
              <p className="text-gray-600">Easy online booking with instant confirmation</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <div className="text-5xl mb-3">🛡️</div>
              <h3 className="text-xl font-semibold mb-2">24/7 Support</h3>
              <p className="text-gray-600">Local team ready to assist you anytime</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}