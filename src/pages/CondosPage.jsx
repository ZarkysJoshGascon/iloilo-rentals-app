import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

export default function CondosPage() {
  const [condos, setCondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [priceRange, setPriceRange] = useState(5000)
  const { formatPrice, updateTrigger } = useCurrency()

  useEffect(() => {
    fetchCondos()
  }, [])

  async function fetchCondos() {
    let query = supabase.from('condos').select('*')
    
    if (search) {
      query = query.ilike('title', `%${search}%`)
    }
    if (priceRange) {
      query = query.lte('price_per_night', priceRange)
    }
    
    const { data } = await query
    setCondos(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchCondos()
  }, [search, priceRange])

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-[#2d568e] mb-8">All Condos in Iloilo</h1>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by condo name..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2d568e]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full md:w-64">
            <input
              type="range"
              min="500"
              max="5000"
              step="100"
              value={priceRange}
              onChange={(e) => setPriceRange(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-sm text-gray-600 mt-1">Max price: {formatPrice(priceRange)}/night</p>
          </div>
        </div>
      </div>

      {/* Condos Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {condos.map((condo) => (
          <Link key={condo.id} to={`/condo/${condo.id}`}>
            <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow">
              <div className="h-48 bg-gray-300 flex items-center justify-center text-4xl">
                🏢
              </div>
              <div className="p-5">
                <h3 className="text-xl font-semibold group-hover:text-[#2d568e]">{condo.title}</h3>
                <p className="text-gray-500 text-sm mt-1">📍 {condo.location}</p>
                <div className="flex gap-4 mt-3 text-sm text-gray-600">
                  <span>🛏️ {condo.bedroom_count} Bed</span>
                  <span>🚽 {condo.bathroom_count} Bath</span>
                  <span>👥 {condo.max_guests} Guests</span>
                </div>
                <p key={updateTrigger} className="text-[#2d568e] font-bold text-xl mt-3">
                  {formatPrice(condo.price_per_night)}<span className="text-sm text-gray-500 font-normal">/night</span>
                </p>
                <button className="w-full mt-4 bg-[#2d568e] text-white py-2 rounded-lg hover:bg-[#1e3a5f] transition">
                  View Details
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {condos.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No condos found matching your criteria.</p>
        </div>
      )}
    </div>
  )
}