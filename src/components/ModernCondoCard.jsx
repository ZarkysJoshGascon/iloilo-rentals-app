import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { MapPin, Users, Bed, Bath, Star, Heart, Eye } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

export default function ModernCondoCard({ condo }) {
  const { formatPrice } = useCurrency()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [isLiked, setIsLiked] = useState(false)
  
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
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -8 }}
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link to={`/condo/${condo.id}`} className="block">
        <div className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2">
          
          {/* Image Container with Overlay Effects */}
          <div className="relative h-72 overflow-hidden bg-gray-800">
            {allImages.map((img, idx) => (
              <div
                key={idx}
                className="absolute top-0 left-0 w-full h-full transition-opacity duration-700 ease-in-out"
                style={{ opacity: idx === currentImageIndex && fade ? 1 : 0 }}
              >
                <motion.img 
                  src={img}
                  alt={`${condo.title} ${idx + 1}`}
                  className="w-full h-full object-cover"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            ))}
            
            {/* Premium Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-500"></div>
            
            {/* Price Badge - Premium */}
            <motion.div 
              className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg z-10"
              whileHover={{ scale: 1.05 }}
            >
              <span className="text-lg font-bold text-[#2d568e]">{formatPrice(condo.price_per_night)}</span>
              <span className="text-xs text-gray-500">/night</span>
            </motion.div>
            
            {/* Rating Badge */}
            {hasRating && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1 shadow-lg z-10">
                <Star size={14} className="text-yellow-500 fill-yellow-500" />
                <span className="text-sm font-semibold">{condo.rating}</span>
                <span className="text-xs text-gray-500">({condo.reviews_count})</span>
              </div>
            )}
            
            {/* Image Counter */}
            {allImages.length > 1 && (
              <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded-full text-xs z-10">
                {currentImageIndex + 1}/{allImages.length}
              </div>
            )}
            
            {/* Quick View Overlay on Hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-20">
              <div className="bg-white/90 backdrop-blur-md rounded-full px-4 py-2 text-[#2d568e] font-semibold text-sm flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                <Eye size={16} /> Quick View
              </div>
            </div>
          </div>
          
          {/* Content Area */}
          <div className="p-5">
            {/* Title and Like Button */}
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xl font-bold text-gray-800 line-clamp-1 group-hover:text-[#2d568e] transition-colors duration-300">
                {condo.title}
              </h3>
              <motion.button 
                onClick={(e) => {
                  e.preventDefault()
                  setIsLiked(!isLiked)
                }}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                whileTap={{ scale: 0.8 }}
                animate={isLiked ? { scale: [1, 1.2, 1] } : {}}
              >
                <Heart 
                  size={18} 
                  className={`transition-all duration-300 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-400'}`}
                />
              </motion.button>
            </div>
            
            {/* Location */}
            <div className="flex items-center gap-1 text-gray-500 mb-3">
              <MapPin size={14} />
              <span className="text-sm line-clamp-1">{condo.location}</span>
            </div>
            
            {/* Amenities Icons */}
            <div className="flex justify-between text-gray-500 text-sm mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <Bed size={15} className="text-[#2d568e]" />
                <span>{condo.bedroom_count} {condo.bedroom_count === 1 ? 'Bed' : 'Beds'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bath size={15} className="text-[#2d568e]" />
                <span>{condo.bathroom_count} {condo.bathroom_count === 1 ? 'Bath' : 'Baths'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users size={15} className="text-[#2d568e]" />
                <span>{condo.max_guests} Guests</span>
              </div>
            </div>
            
            {/* Perks / Highlights */}
            <div className="flex flex-wrap gap-2 mb-4">
              {condo.amenities?.slice(0, 3).map((item, idx) => (
                <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
                  {item}
                </span>
              ))}
              {condo.amenities?.length > 3 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  +{condo.amenities.length - 3} more
                </span>
              )}
            </div>
            
            {/* View Details Button - Premium */}
            <motion.button 
              className="w-full bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-2.5 rounded-xl font-semibold hover:from-[#1e3a5f] hover:to-[#0f2a4a] transition-all duration-300 shadow-md hover:shadow-lg"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              View Details
            </motion.button>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}