import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { MapPin, Bed, Bath, Users, Eye } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import { getCondoImages } from '../utils/condoImages'

export default function ModernCondoCard({ condo }) {
  const { formatPrice } = useCurrency()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)

  const condoImages = condo?.code ? getCondoImages(condo.code) : []
  const allImages =
    condoImages.length > 0
      ? condoImages
      : [condo.images?.[0] || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop']

  // Auto‑rotate images every 4 seconds
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -6 }}
      className="group h-full"
    >
      <Link to={`/condo/${condo.id}`} className="block h-full">
        {/* Card – bigger, corners slightly less round */}
        <div className="relative h-full rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300">
          <div className="relative h-64 sm:h-72 w-full">
            {allImages.map((img, idx) => (
              <div
                key={idx}
                className="absolute inset-0 transition-opacity duration-500"
                style={{ opacity: idx === currentImageIndex && fade ? 1 : 0 }}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </div>
            ))}

            {/* Quick‑view hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20">
              <span className="bg-white/90 text-[#2d568e] text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1">
                <Eye size={14} /> Quick View
              </span>
            </div>

            {/* Image counter */}
            {allImages.length > 1 && (
              <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
                {currentImageIndex + 1}/{allImages.length}
              </div>
            )}

            {/* Dark gradient with details – compact, left-aligned */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pt-8 pb-3">
              {/* Unit name – bigger font */}
              <h3 className="text-base font-semibold text-white truncate leading-tight">
                {condo.title}
              </h3>

              {/* Location – smaller font */}
              <div className="flex items-center gap-1 mt-0.5 text-white/80 text-xs">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{condo.location}</span>
              </div>

              {/* Key stats with labels */}
              <div className="mt-2 flex items-center gap-3 text-xs text-white/90">
                <span className="flex items-center gap-1">
                  <Bed size={14} className="text-white/80" />
                  {condo.bedroom_count} {condo.bedroom_count === 1 ? 'bed' : 'beds'}
                </span>
                <span className="flex items-center gap-1">
                  <Bath size={14} className="text-white/80" />
                  {condo.bathroom_count} {condo.bathroom_count === 1 ? 'bath' : 'baths'}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={14} className="text-white/80" />
                  {condo.max_guests} {condo.max_guests === 1 ? 'guest' : 'guests'}
                </span>
              </div>

              {/* Price – bigger, left-aligned */}
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-bold text-white">
                  {formatPrice(condo.price_per_night)}
                </span>
                <span className="text-xs text-white/70">/ night</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}