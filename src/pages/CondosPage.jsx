import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import ModernCondoCard from '../components/ModernCondoCard'

export default function CondosPage() {
  const [condos, setCondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [priceRange, setPriceRange] = useState(5000)
  const { formatPrice } = useCurrency()

  useEffect(() => {
    fetchCondos()
  }, [search, priceRange])

  async function fetchCondos() {
    setLoading(true)
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2d568e] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading condos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#2d568e] mb-2">All Condos in Iloilo</h1>
          <p className="text-gray-500">Find your perfect stay from our collection of premium condos</p>
        </div>
        
        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by condo name or location..."
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full md:w-80">
              <label className="text-sm text-gray-500 mb-1 block">Max Price: {formatPrice(priceRange)}/night</label>
              <input
                type="range"
                min="500"
                max="10000"
                step="100"
                value={priceRange}
                onChange={(e) => setPriceRange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2d568e]"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{formatPrice(500)}</span>
                <span>{formatPrice(2000)}</span>
                <span>{formatPrice(4000)}</span>
                <span>{formatPrice(6000)}</span>
                <span>{formatPrice(8000)}</span>
                <span>{formatPrice(10000)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-500">
            Found <span className="font-semibold text-[#2d568e]">{condos.length}</span> condos
          </p>
        </div>

        {/* Condos Grid - Using the same ModernCondoCard as homepage */}
        {condos.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl">
            <div className="text-6xl mb-4">🏢</div>
            <p className="text-gray-500 text-lg">No condos found matching your criteria.</p>
            <button 
              onClick={() => {
                setSearch('')
                setPriceRange(10000)
              }}
              className="mt-4 text-[#2d568e] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {condos.map((condo) => (
              <ModernCondoCard key={condo.id} condo={condo} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}