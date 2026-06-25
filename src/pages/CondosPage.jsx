import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Search, Loader2, SlidersHorizontal, X } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import ModernCondoCard from '../components/ModernCondoCard'

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm animate-pulse">
      <div className="h-56 sm:h-64 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        <div className="flex gap-4 pt-1"><div className="h-3 bg-gray-200 rounded w-12" /><div className="h-3 bg-gray-200 rounded w-12" /><div className="h-3 bg-gray-200 rounded w-12" /></div>
        <div className="h-4 bg-gray-200 rounded w-1/3 mt-2" />
        <div className="h-9 bg-gray-200 rounded-lg mt-3" />
      </div>
    </div>
  )
}

export default function CondosPage() {
  const [condos, setCondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [priceRange, setPriceRange] = useState(10000)
  const [isSearching, setIsSearching] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const { formatPrice } = useCurrency()

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 500); return () => clearTimeout(t) }, [search])
  const [debouncedPriceRange, setDebouncedPriceRange] = useState(priceRange)
  useEffect(() => { const t = setTimeout(() => setDebouncedPriceRange(priceRange), 300); return () => clearTimeout(t) }, [priceRange])

  const fetchCondos = useCallback(async () => {
    setIsSearching(true); setLoading(true)
    let query = supabase.from('condos').select('*')
    if (debouncedSearch) query = query.ilike('title', `%${debouncedSearch}%`)
    if (debouncedPriceRange < 10000) query = query.lte('price_per_night', debouncedPriceRange)
    const { data } = await query
    setCondos(data || []); setLoading(false)
    setTimeout(() => setIsSearching(false), 300)
  }, [debouncedSearch, debouncedPriceRange])

  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      await fetchCondos()
    }
    if (!cancelled) loadData()
    return () => { cancelled = true }
  }, [fetchCondos])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pt-6 md:pt-20 pb-24 md:pb-8">
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-4 md:mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#2d568e] mb-1 md:mb-2">All Condos in Iloilo</h1>
          <p className="text-gray-500 text-xs md:text-sm">Find your perfect stay from our collection of premium condos</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 md:p-4 mb-4 md:mb-6">
          <div className="flex flex-col md:flex-row gap-2 md:gap-3">
            <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="Search by condo name or location..." className="w-full pl-10 pr-10 py-2.5 md:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2d568e] focus:border-transparent text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={16} /></button>}</div>
            <button onClick={() => setShowFilters(!showFilters)} className={`md:w-auto px-4 py-2.5 md:py-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 justify-center ${showFilters || priceRange < 10000 ? 'border-[#2d568e] bg-[#2d568e]/5 text-[#2d568e]' : 'border-gray-200 text-gray-600'}`}><SlidersHorizontal size={16} />Filters{priceRange < 10000 && <span className="w-2 h-2 bg-[#2d568e] rounded-full" />}</button>
          </div>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
              <div className="pt-4 mt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-2"><label className="text-sm font-medium text-gray-700">Max Price: {formatPrice(priceRange)}/night</label>{priceRange < 10000 && <button onClick={() => setPriceRange(10000)} className="text-xs text-[#2d568e] hover:underline">Reset</button>}</div>
                <input type="range" min="500" max="10000" step="100" value={priceRange} onChange={(e) => setPriceRange(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg accent-[#2d568e]" />
                <div className="flex justify-between text-xs text-gray-400 mt-1"><span>{formatPrice(500)}</span><span>{formatPrice(2500)}</span><span>{formatPrice(5000)}</span><span>{formatPrice(7500)}</span><span>{formatPrice(10000)}+</span></div>
              </div>
            </motion.div>
          )}
        </motion.div>
        <div className="mb-4 md:mb-6 flex justify-between items-center"><p className="text-gray-500 text-xs md:text-sm">Found <span className="font-semibold text-[#2d568e]">{condos.length}</span> condos</p>{isSearching && <div className="flex items-center gap-2 text-xs md:text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /><span>Refreshing...</span></div>}</div>
        {loading && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8">{[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}</div>}
        {!loading && condos.length === 0 && <div className="text-center py-12 md:py-16 bg-white rounded-2xl"><div className="text-4xl md:text-6xl mb-4">🏢</div><p className="text-gray-500 text-base md:text-lg">No condos found matching your criteria.</p><button onClick={() => { setSearch(''); setPriceRange(10000) }} className="mt-4 text-[#2d568e] hover:underline font-medium text-sm">Clear filters</button></div>}
        {condos.length > 0 && <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 transition-opacity duration-300 ${isSearching ? 'opacity-50' : 'opacity-100'}`}>{condos.map(condo => <ModernCondoCard key={condo.id} condo={condo} />)}</div>}
      </div>
    </motion.div>
  )
}