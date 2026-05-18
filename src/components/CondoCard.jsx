import { Link } from 'react-router-dom'
import { MapPin, Users, Bed, Bath } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

export default function CondoCard({ condo }) {
  const { formatPrice, updateTrigger } = useCurrency()

  return (
    <Link to={`/condo/${condo.id}`} className="group">
      <div className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-shadow">
        <div className="relative h-56 overflow-hidden">
          <img 
            src={condo.images?.[0] || 'https://picsum.photos/id/104/400/300'} 
            alt={condo.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        
        <div className="p-5">
          <h3 className="text-xl font-semibold mb-2 group-hover:text-[#2d568e]">
            {condo.title}
          </h3>
          
          <div className="flex items-center gap-1 text-gray-500 mb-3">
            <MapPin size={16} />
            <span className="text-sm">{condo.location}</span>
          </div>
          
          <div className="flex justify-between text-gray-600 text-sm mb-4">
            <div className="flex items-center gap-1">
              <Bed size={16} /> {condo.bedroom_count} Bed
            </div>
            <div className="flex items-center gap-1">
              <Bath size={16} /> {condo.bathroom_count} Bath
            </div>
            <div className="flex items-center gap-1">
              <Users size={16} /> {condo.max_guests} Guests
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <span key={updateTrigger} className="text-2xl font-bold text-[#2d568e]">
              {formatPrice(condo.price_per_night)}<span className="text-sm text-gray-500 font-normal">/night</span>
            </span>
          </div>
          
          <button className="w-full bg-[#2d568e] text-white py-2 rounded-lg hover:bg-[#1e3a5f] transition">
            View Details
          </button>
        </div>
      </div>
    </Link>
  )
}