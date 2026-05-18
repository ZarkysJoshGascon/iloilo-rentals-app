import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CondoCard from '../components/CondoCard'

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
      .limit(5)
    if (data) setFeaturedCondos(data)
  }

  // Rotate hero images every 5 seconds with fade
  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % heroImages.length)
        setFade(true)
      }, 300)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      {/* Hero Section */}
      <div style={{ position: 'relative', height: '600px', width: '100%', overflow: 'hidden' }}>
        
        {/* Image with Fade Effect and BLUR */}
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
              objectFit: 'cover',
              filter: 'blur(3px)'
            }}
          />
        </div>
        
        {/* Dark Overlay - lighter so image shows through */}
        <div style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 1
        }}></div>
        
        {/* Content - on top */}
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
                  style={{ width: '256px', height: '256px', objectFit: 'contain' }}
                  onError={(e) => {
                    e.target.src = 'https://picsum.photos/id/104/256/256'
                  }}
                />
              </div>
              
              {/* Text */}
              <div className="md:w-2/3 text-center md:text-left">
                <h1 style={{ fontSize: '3rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                  Find Your Perfect Stay in Iloilo City
                </h1>
                <p style={{ fontSize: '1.5rem', color: 'rgba(255,255,255,0.95)', marginBottom: '2rem', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
                  Premium condo units near Megaworld, Atria, and Iloilo's best locations
                </p>
                <Link to="/condos">
                  <button style={{ backgroundColor: 'white', color: '#2d568e', padding: '12px 32px', borderRadius: '8px', fontSize: '1.125rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                    Browse All Condos
                  </button>
                </Link>
              </div>
              
            </div>
          </div>
        </div>
        
      </div>

      {/* Featured Condos */}
      <div className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center text-[#2d568e] mb-12">Listings</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredCondos.map((condo) => (
            <CondoCard key={condo.id} condo={condo} />
          ))}
        </div>
      </div>

      {/* Why Choose Us */}
      <div className="bg-gray-100 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-[#2d568e] mb-12">Why Choose Iloilo Rentals?</h2>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div><div className="text-5xl mb-3">📍</div><h3 className="text-xl font-semibold mb-2">Prime Locations</h3><p className="text-gray-600">All units near business districts and malls</p></div>
            <div><div className="text-5xl mb-3">📅</div><h3 className="text-xl font-semibold mb-2">Flexible Booking</h3><p className="text-gray-600">Easy online booking with instant confirmation</p></div>
            <div><div className="text-5xl mb-3">🛡️</div><h3 className="text-xl font-semibold mb-2">24/7 Support</h3><p className="text-gray-600">Local team ready to assist you anytime</p></div>
          </div>
        </div>
      </div>
    </div>
  )
}