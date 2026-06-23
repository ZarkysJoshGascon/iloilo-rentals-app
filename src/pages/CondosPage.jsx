import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Search, Loader2 } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import ModernCondoCard from '../components/ModernCondoCard'

export default function CondosPage() {
  const [condos, setCondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [priceRange, setPriceRange] = useState(5000)
  const [isSearching, setIsSearching] = useState(false)
  const { formatPrice } = useCurrency()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 1000)
    return () => clearTimeout(timer)
  }, [search])

  const [debouncedPriceRange, setDebouncedPriceRange] = useState(priceRange)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPriceRange(priceRange)
    }, 500)
    return () => clearTimeout(timer)
  }, [priceRange])

  // fetchCondos defined BEFORE the effect, wrapped in useCallback
  const fetchCondos = useCallback(async () => {
    setIsSearching(true)
    setLoading(true)
    
    let query = supabase.from('condos').select('*')
    
    if (debouncedSearch) {
      query = query.ilike('title', `%${debouncedSearch}%`)
    }
    if (debouncedPriceRange) {
      query = query.lte('price_per_night', debouncedPriceRange)
    }
    
    const { data } = await query
    setCondos(data || [])
    setLoading(false)
    setTimeout(() => setIsSearching(false), 300)
  }, [debouncedSearch, debouncedPriceRange])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCondos()
  }, [fetchCondos])

  const handleClearFilters = () => {
    setSearch('')
    setPriceRange(10000)
  }

  if (loading && condos.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen flex items-center justify-center"
      >
        <div className="text-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="rounded-full h-12 w-12 border-b-2 border-[#2d568e] mx-auto mb-4"
          />
          <p className="text-gray-600">Loading condos...</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-50"
    >
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        <motion.div 
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-[#2d568e] mb-2">All Condos in Iloilo</h1>
          <p className="text-gray-500">Find your perfect stay from our collection of premium condos</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8"
        >
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by condo name or location..."
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2d568e] focus:border-transparent transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && search !== debouncedSearch && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                </div>
              )}
            </div>
            <div className="w-full md:w-80">
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm text-gray-500">Max Price: {formatPrice(priceRange)}/night</label>
                {priceRange !== debouncedPriceRange && (
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                )}
              </div>
              <input
                type="range"
                min="500"
                max="10000"
                step="100"
                value={priceRange}
                onChange={(e) => setPriceRange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2d568e] transition-all"
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
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-6 flex justify-between items-center"
        >
          <p className="text-gray-500">
            Found <span className="font-semibold text-[#2d568e]">{condos.length}</span> condos
          </p>
          {isSearching && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              <span>Refreshing...</span>
            </div>
          )}
        </motion.div>

        {/* Show skeleton ONLY while searching AND there are no existing condos */}
        {isSearching && condos.length === 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="h-64 bg-gray-200"></div>
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="flex gap-4">
                    <div className="h-4 bg-gray-200 rounded w-12"></div>
                    <div className="h-4 bg-gray-200 rounded w-12"></div>
                    <div className="h-4 bg-gray-200 rounded w-12"></div>
                  </div>
                  <div className="h-10 bg-gray-200 rounded-xl"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results message - only show when not searching */}
        {!isSearching && condos.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 bg-white rounded-2xl"
          >
            <div className="text-6xl mb-4">🏢</div>
            <p className="text-gray-500 text-lg">No condos found matching your criteria.</p>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleClearFilters}
              className="mt-4 text-[#2d568e] hover:underline transition-all"
            >
              Clear filters
            </motion.button>
          </motion.div>
        )}

        {/* Condos grid - shown when results exist */}
        {condos.length > 0 && (
          <div className={`grid md:grid-cols-2 lg:grid-cols-3 gap-8 transition-opacity duration-300 ${isSearching ? 'opacity-50' : 'opacity-100'}`}>
            {condos.map((condo) => (
              <ModernCondoCard key={condo.id} condo={condo} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}