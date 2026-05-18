import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Users, Bed, Bath, Star } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

export default function ModernCondoCard({ condo }) {
  const { formatPrice } = useCurrency()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)
  
  const getCondoImages = (condoCode) => {
    if (!condoCode) return []
    const STORAGE_URL = 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/'
    return [
      `${STORAGE_URL}${condoCode}_1.jpg`,
      `${STORAGE_URL}${condoCode}_2.jpg`,
      `${STORAGE_URL}${condoCode}_3.jpg`,
      `${STORAGE_URL}${condoCode}_4.jpg`,
      `${STORAGE_URL}${condoCode}_5.jpg`
    ]
  }
  
  const condoImages = condo?.code ? getCondoImages(condo.code) : []
  const allImages = condoImages.length > 0 ? condoImages : [condo.images?.[0] || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop']
  
  useEffect(() => {
    if (allImages.length <= 1) return
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % allImages.length)
        setFade(true)
      }, 300)
    }, 4000)
    return () => clearInterval(interval)
  }, [allImages.length])
  
  const hasRating = condo.rating > 0

  return (
    <Link to={`/condo/${condo.id}`} className="block group">
      <div className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
        
        <div className="relative h-64 overflow-hidden bg-gray-800">
          {allImages.map((img, idx) => (
            <div
              key={idx}
              className="absolute top-0 left-0 w-full h-full transition-opacity duration-500 ease-in-out"
              style={{ opacity: idx === currentImageIndex && fade ? 1 : 0 }}
            >
              <img 
                src={img}
                alt={`${condo.title} ${idx + 1}`}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
            </div>
          ))}
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
          
          <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg z-10">
            <span className="text-lg font-bold text-[#2d568e]">{formatPrice(condo.price_per_night)}</span>
            <span className="text-xs text-gray-500">/night</span>
          </div>
          
          {hasRating && (
            <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1 shadow-lg z-10">
              <Star size={14} className="text-yellow-500 fill-yellow-500" />
              <span className="text-sm font-semibold">{condo.rating}</span>
              <span className="text-xs text-gray-500">({condo.reviews_count})</span>
            </div>
          )}
          
          {allImages.length > 1 && (
            <div className="absolute bottom-4 right-4 bg-black/50 text-white px-2 py-0.5 rounded-full text-xs z-10 backdrop-blur-sm">
              {currentImageIndex + 1}/{allImages.length}
            </div>
          )}
        </div>
        
        <div className="p-5">
          <h3 className="text-xl font-semibold mb-2 line-clamp-1 group-hover:text-[#2d568e] transition-colors">
            {condo.title}
          </h3>
          
          <div className="flex items-center gap-1 text-gray-500 mb-3">
            <MapPin size={16} />
            <span className="text-sm line-clamp-1">{condo.location}</span>
          </div>
          
          <div className="flex justify-between text-gray-600 text-sm mb-4">
            <div className="flex items-center gap-1"><Bed size={16} /> {condo.bedroom_count}</div>
            <div className="flex items-center gap-1"><Bath size={16} /> {condo.bathroom_count}</div>
            <div className="flex items-center gap-1"><Users size={16} /> {condo.max_guests}</div>
          </div>
          
          <button className="w-full bg-[#2d568e] text-white py-2.5 rounded-xl font-semibold hover:bg-[#1e3a5f] transition">
            View Details
          </button>
        </div>
      </div>
    </Link>
  )
}