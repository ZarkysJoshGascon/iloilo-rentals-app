import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  Check, X, Trash2, AlertTriangle, ChevronDown, ChevronRight,
  Mail, Phone, Search, ArrowUpDown, RefreshCw, Calendar,
  Users, DollarSign, Home, Clock, Eye, Building2, User, Baby, PersonStanding, Hash
} from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

const AVATAR_PALETTES = [
  ['#EAF3DE', '#3B6D11'],
  ['#E6F1FB', '#185FA5'],
  ['#FAEEDA', '#854F0B'],
  ['#EEEDFE', '#3C3489'],
  ['#FBEAF0', '#993556'],
  ['#FFF4E6', '#B45309'],
  ['#F0FDF4', '#166534'],
  ['#FEF2F2', '#991B1B'],
  ['#F3E8FF', '#6B21A8'],
  ['#ECFEFF', '#155E75'],
]
function avatarColors(name) {
  return AVATAR_PALETTES[name.charCodeAt(0) % AVATAR_PALETTES.length]
}
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const TruncateTooltip = ({ text, maxLength = 20, className = '' }) => {
  const [showFull, setShowFull] = useState(false)
  if (!text || text.length <= maxLength) {
    return <span className={className}>{text || '—'}</span>
  }
  return (
    <span className="relative inline-block">
      <span 
        className={`${className} cursor-help border-b border-dotted border-gray-400 dark:border-gray-500 hover:border-gray-600 dark:hover:border-gray-300 transition-colors`}
        onClick={(e) => { e.stopPropagation(); setShowFull(!showFull) }}
        title="Click to see full text"
      >
        {showFull ? text : `${text.substring(0, maxLength)}...`}
      </span>
      {showFull && (
        <span className="absolute z-50 left-0 top-full mt-1 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg px-3 py-2 shadow-xl max-w-xs break-words font-medium">
          {text}
          <button onClick={(e) => { e.stopPropagation(); setShowFull(false) }} className="block mt-1 text-gray-400 dark:text-gray-500 hover:text-white dark:hover:text-gray-900 text-xs">Close</button>
        </span>
      )}
    </span>
  )
}

function SummaryCards({ totalCount, pendingCount, confirmedCount, totalRevenue, rejectedCount, conflictCount, formatPrice }) {
  const cards = [
    {
      label: 'Total Bookings', value: totalCount, sub: `${confirmedCount} confirmed · ${pendingCount} pending`,
      icon: Calendar, color: 'from-blue-500 to-blue-600', bgLight: 'bg-blue-50 dark:bg-blue-900/20',
      iconBg: 'bg-blue-100 dark:bg-blue-800', iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Conflicts', value: conflictCount, sub: 'Requires attention',
      icon: AlertTriangle, color: 'from-red-500 to-red-600', bgLight: 'bg-red-50 dark:bg-red-900/20',
      iconBg: 'bg-red-100 dark:bg-red-800', iconColor: 'text-red-600 dark:text-red-400', highlight: conflictCount > 0,
    },
    {
      label: 'Pending Review', value: pendingCount, sub: totalCount > 0 ? `${Math.round((pendingCount/totalCount)*100)}% of total` : 'None',
      icon: Clock, color: 'from-amber-500 to-amber-600', bgLight: 'bg-amber-50 dark:bg-amber-900/20',
      iconBg: 'bg-amber-100 dark:bg-amber-800', iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Revenue', value: formatPrice(totalRevenue), sub: `${confirmedCount} confirmed bookings`,
      icon: DollarSign, color: 'from-emerald-500 to-emerald-600', bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconBg: 'bg-emerald-100 dark:bg-emerald-800', iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} whileHover={{ y: -2 }}
          className={`relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700 ${card.bgLight} p-5 transition-shadow duration-200 hover:shadow-lg`}>
          <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${card.color} opacity-10 rounded-bl-full`}></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{card.label}</p>
              <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center`}><card.icon size={18} className={card.iconColor} /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{card.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.sub}</p>
            {card.highlight && <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

const UnitImage = ({ condo }) => {
  const [imgError, setImgError] = useState(false)
  if (!condo) return null
  const imageUrl = condo.images?.[0] || (condo.code ? `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_1.jpg` : null)
  if (!imageUrl || imgError) {
    return <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center flex-shrink-0"><Building2 size={20} className="text-blue-600 dark:text-blue-400" /></div>
  }
  return <img src={imageUrl} alt={condo.title || 'Unit'} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-sm" onError={() => setImgError(true)} />
}

function ConfirmationModal({ isOpen, onClose, onConfirm, booking, action, formatPrice }) {
  if (!isOpen) return null
  const actionConfig = {
    confirm: { title: 'Confirm Booking', description: 'Approve this booking and mark it as confirmed.', icon: Check, headerPattern: 'from-emerald-600 to-emerald-500', lightBg: 'bg-emerald-50 dark:bg-emerald-900/30', buttonColor: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200 dark:shadow-emerald-900/30', borderColor: 'border-emerald-200 dark:border-emerald-700', iconBg: 'bg-white/30' },
    reject: { title: 'Reject Booking', description: 'Decline this booking request.', icon: X, headerPattern: 'from-red-600 to-red-500', lightBg: 'bg-red-50 dark:bg-red-900/30', buttonColor: 'bg-red-500 hover:bg-red-600 shadow-red-200 dark:shadow-red-900/30', borderColor: 'border-red-200 dark:border-red-700', iconBg: 'bg-white/30' },
    delete: { title: 'Delete Booking', description: 'Permanently remove this booking.', icon: Trash2, headerPattern: 'from-gray-700 to-gray-600', lightBg: 'bg-gray-50 dark:bg-gray-900/30', buttonColor: 'bg-gray-600 hover:bg-gray-700 shadow-gray-200 dark:shadow-gray-900/30', borderColor: 'border-gray-200 dark:border-gray-700', iconBg: 'bg-white/30' },
  }
  const config = actionConfig[action]

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] max-w-md w-full overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
          <div className={`bg-gradient-to-br ${config.headerPattern} p-8 text-center relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
            <div className={`relative w-20 h-20 rounded-2xl ${config.iconBg} flex items-center justify-center mx-auto mb-4 backdrop-blur-sm shadow-lg`}><config.icon size={32} className="text-white" /></div>
            <h3 className="text-2xl font-bold text-white">{config.title}</h3>
            <p className="text-white/90 text-sm mt-2 font-medium">{config.description}</p>
          </div>
          <div className="p-6">
            <div className={`${config.lightBg} rounded-2xl p-5 space-y-4 border ${config.borderColor}`}>
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2"><Hash size={14} /> Booking Code</span><span className="text-base font-mono font-bold text-gray-900 dark:text-gray-100">{booking?.booking_code}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2"><User size={14} /> Guest</span><span className="text-base font-bold text-gray-900 dark:text-gray-100">{booking?.guest_name}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2"><Building2 size={14} /> Unit</span><span className="text-base font-bold text-gray-900 dark:text-gray-100">{booking?.condos?.code || '—'}</span></div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-600"><span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2"><DollarSign size={14} /> Amount</span><span className="text-xl font-extrabold text-gray-900 dark:text-gray-100">{formatPrice(booking?.total_amount || 0)}</span></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 px-5 py-3.5 border-2 border-gray-300 dark:border-gray-600 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all font-bold text-base">Cancel</button>
              <button onClick={() => { onConfirm(); onClose(); }} className={`flex-1 px-5 py-3.5 rounded-2xl text-white font-bold text-base transition-all shadow-xl hover:shadow-2xl active:scale-95 ${config.buttonColor}`}>{action === 'confirm' ? '✓ Confirm' : action === 'reject' ? '✗ Reject' : '🗑 Delete'}</button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default function BookingsList({ searchTerm: externalSearchTerm = '' }) {
  const [bookings, setBookings] = useState([])
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [activeGroup, setActiveGroup] = useState('all')
  const [sortBy, setSortBy] = useState('latest')
  const [searchText, setSearchText] = useState('')
  const [modalConfig, setModalConfig] = useState({ isOpen: false, booking: null, action: null })
  const { formatPrice } = useCurrency()
  const effectiveSearch = externalSearchTerm || searchText

  const fetchConfirmedBookings = async () => {
    const { data, error } = await supabase.from('bookings').select('id, condo_id, start_date, end_date, status').eq('status', 'confirmed')
    if (!error) setConfirmedBookings(data || [])
  }

  const fetchBookings = async () => {
    setLoading(true)
    try {
      let query = supabase.from('bookings').select('*, condos:condo_id(code, title, location, images, status)')
      if (sortBy === 'latest') query = query.order('created_at', { ascending: false })
      if (sortBy === 'oldest') query = query.order('created_at', { ascending: true })
      if (sortBy === 'price_high') query = query.order('total_amount', { ascending: false })
      if (sortBy === 'price_low') query = query.order('total_amount', { ascending: true })
      const { data, error } = await query
      if (error) throw error
      setBookings(data || [])
      await fetchConfirmedBookings()
    } catch (err) { console.error(err); toast.error('Failed to load bookings') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchBookings()
    const sub = supabase.channel('bookings-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchBookings).subscribe()
    return () => sub.unsubscribe()
  }, [sortBy])

  const handleConfirmAction = async () => {
    const { booking, action } = modalConfig
    if (!booking || !action) return
    setActionLoading(booking.id)
    try {
      if (action === 'delete') {
        const { error } = await supabase.from('bookings').delete().eq('id', booking.id)
        if (error) throw error
        toast.success(`Booking ${booking.booking_code} deleted`)
      } else {
        const newStatus = action === 'confirm' ? 'confirmed' : 'rejected'
        const { error } = await supabase.from('bookings').update({ status: newStatus }).eq('id', booking.id)
        if (error) throw error
        toast.success(`Booking ${booking.booking_code} ${newStatus}`)
      }
      fetchBookings()
    } catch (err) { toast.error('Failed to update booking') }
    finally { setActionLoading(null) }
  }

  const openModal = (booking, action) => {
    if (action === 'confirm' && hasOverlap(booking)) { toast.error('Cannot confirm: This unit already has a confirmed booking for these dates'); return }
    setModalConfig({ isOpen: true, booking, action })
  }

  const closeModal = () => setModalConfig({ isOpen: false, booking: null, action: null })

  const hasOverlap = (booking) => {
    if (booking.status !== 'pending') return false
    const start = new Date(booking.start_date), end = new Date(booking.end_date)
    return confirmedBookings.some(cb => cb.condo_id === booking.condo_id && cb.id !== booking.id && start <= new Date(cb.end_date) && end >= new Date(cb.start_date))
  }

  const toggleRow = (id) => setExpandedRows(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const getRowBorderColor = (booking) => {
    if (booking.status === 'pending' && hasOverlap(booking)) return 'border-l-4 border-l-red-500 dark:border-l-red-400'
    if (booking.status === 'confirmed') return 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400'
    if (booking.status === 'pending') return 'border-l-4 border-l-amber-400 dark:border-l-amber-300'
    if (booking.status === 'rejected') return 'border-l-4 border-l-gray-400 dark:border-l-gray-500'
    return ''
  }

  const getFilteredBookings = () => {
    let filtered = [...bookings]
    if (effectiveSearch) filtered = filtered.filter(b => b.guest_name?.toLowerCase().includes(effectiveSearch.toLowerCase()) || b.booking_code?.toLowerCase().includes(effectiveSearch.toLowerCase()) || b.condos?.code?.toLowerCase().includes(effectiveSearch.toLowerCase()))
    if (activeGroup === 'conflicts') filtered = filtered.filter(b => b.status === 'pending' && hasOverlap(b))
    else if (activeGroup !== 'all') filtered = filtered.filter(b => b.status === activeGroup)
    filtered.sort((a, b) => { const aC = a.status === 'pending' && hasOverlap(a), bC = b.status === 'pending' && hasOverlap(b); if (aC && !bC) return -1; if (!aC && bC) return 1; return new Date(b.created_at) - new Date(a.created_at) })
    return filtered
  }

  const getNightsCount = (booking) => Math.ceil((new Date(booking.end_date) - new Date(booking.start_date)) / (1000 * 60 * 60 * 24))

  const pendingCount = bookings.filter(b => b.status === 'pending').length
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length
  const totalRevenue = bookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + (b.total_amount || 0), 0)
  const totalCount = bookings.length
  const rejectedCount = bookings.filter(b => b.status === 'rejected').length
  const conflictCount = bookings.filter(b => b.status === 'pending' && hasOverlap(b)).length

  const tabs = [
    { id: 'all', label: 'All', count: totalCount, dot: 'bg-blue-500', badge: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700' },
    { id: 'pending', label: 'Pending', count: pendingCount, dot: 'bg-amber-400', badge: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700' },
    { id: 'confirmed', label: 'Confirmed', count: confirmedCount, dot: 'bg-emerald-500', badge: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700' },
    { id: 'rejected', label: 'Rejected', count: rejectedCount, dot: 'bg-gray-400', badge: 'bg-gray-50 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' },
    { id: 'conflicts', label: 'Conflicts', count: conflictCount, dot: 'bg-red-500', badge: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700' },
  ]

  const filteredBookings = getFilteredBookings()

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700"><div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" /><div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2" /><div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" /></div>)}</div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-64"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-5">
      {/* Summary Cards */}
      <SummaryCards totalCount={totalCount} pendingCount={pendingCount} confirmedCount={confirmedCount} totalRevenue={totalRevenue} rejectedCount={rejectedCount} conflictCount={conflictCount} formatPrice={formatPrice} />

      {/* Search and Sort Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input type="text" placeholder="Search by guest, booking ID, or unit..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-600 transition-colors" />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="pl-9 pr-8 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 hover:bg-white dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 appearance-none cursor-pointer">
                <option value="latest">Latest first</option><option value="oldest">Oldest first</option><option value="price_high">Price: High → Low</option><option value="price_low">Price: Low → High</option>
              </select>
            </div>
            <button onClick={fetchBookings} className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-all bg-gray-50 dark:bg-gray-700" title="Refresh"><RefreshCw size={16} /></button>
          </div>
        </div>
      </div>

      {/* TABLE - takes remaining height */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
        
        {/* STICKY: Status Tabs + Column Headers - stays below "Bookings Management" title */}
        <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          {/* Status Tabs */}
          <div className="px-4 py-3 flex gap-1.5 overflow-x-auto">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveGroup(tab.id)} className={`relative flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 whitespace-nowrap ${activeGroup === tab.id ? 'bg-gray-100 dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${tab.dot}`} />{tab.label}<span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tab.badge}`}>{tab.count}</span>
              </button>
            ))}
          </div>
          {/* Column Headers */}
          <div className="bg-gray-50/80 dark:bg-gray-700/80 backdrop-blur-sm border-y border-gray-100 dark:border-gray-700">
            <div className="flex items-center px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <div className="w-[300px] flex-shrink-0">Guest</div><div className="flex-1 min-w-0">Booking Details</div><div className="w-[200px] flex-shrink-0 hidden md:block">Unit</div><div className="flex-shrink-0 hidden lg:block" style={{width: '180px'}}>Dates</div><div className="w-[120px] flex-shrink-0 text-right">Amount</div><div className="w-[150px] flex-shrink-0 text-center">Actions</div>
            </div>
          </div>
        </div>

        {/* SCROLLABLE: Table Body */}
        <div className="flex-1 overflow-y-auto">
          {filteredBookings.length === 0 ? (
            <div className="flex items-center justify-center min-h-[300px]"><div className="text-center py-16"><div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4"><Calendar size={28} className="text-gray-400 dark:text-gray-500" /></div><p className="text-base font-semibold text-gray-500 dark:text-gray-400">No bookings found</p><p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search or filters</p></div></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredBookings.map(booking => {
                    const guestName = booking.guest_name || '—', [bg, fg] = avatarColors(guestName)
                    const isPending = booking.status === 'pending', showDelete = booking.status === 'confirmed' || booking.status === 'rejected'
                    const overlap = hasOverlap(booking), isExpanded = expandedRows.has(booking.id), isLoading = actionLoading === booking.id
                    const guestAvatar = booking.avatar_url, canConfirm = !(isPending && overlap)

                    return (
                      <React.Fragment key={booking.id}>
                        <tr className={`group transition-all duration-200 cursor-pointer ${getRowBorderColor(booking)} ${isExpanded ? 'bg-blue-50/30 dark:bg-blue-900/20 shadow-inner' : overlap ? 'bg-red-50/40 dark:bg-red-900/20 hover:bg-red-50/60 dark:hover:bg-red-900/30' : 'hover:bg-gray-50/50 dark:hover:bg-gray-700/30'}`} onClick={() => toggleRow(booking.id)}>
                          <td className="px-5 py-4" style={{width: '300px'}}>
                            <div className="flex items-center gap-3">
                              {overlap && <div className="flex-shrink-0 w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center" title="Booking conflict"><AlertTriangle size={14} className="text-red-600 dark:text-red-400" /></div>}
                              {!overlap && booking.status === 'confirmed' && <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center" title="Confirmed"><Check size={14} className="text-emerald-600 dark:text-emerald-400" /></div>}
                              {!overlap && booking.status === 'pending' && <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center" title="Pending"><Clock size={14} className="text-amber-600 dark:text-amber-400" /></div>}
                              {!overlap && booking.status === 'rejected' && <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center" title="Rejected"><X size={14} className="text-gray-500 dark:text-gray-400" /></div>}
                              {guestAvatar ? <img src={guestAvatar} alt={guestName} className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-gray-800 shadow-md" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} /> : null}
                              <div style={{ background: bg, color: fg }} className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold select-none flex-shrink-0 ring-2 ring-white dark:ring-gray-800 shadow-md ${guestAvatar ? 'hidden' : ''}`}>{initials(guestName)}</div>
                              <div className="min-w-0 flex-1"><TruncateTooltip text={guestName} maxLength={22} className="text-sm font-bold text-gray-900 dark:text-gray-100 block" /><TruncateTooltip text={booking.guest_email || 'No email'} maxLength={25} className="text-xs text-gray-600 dark:text-gray-300 block mt-0.5 font-medium" /></div>
                            </div>
                          </td>
                          <td className="px-5 py-4"><div className="space-y-1.5"><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{booking.booking_code}</span>{overlap && <span className="inline-flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-700 font-bold"><AlertTriangle size={10} /> Conflict</span>}</div><div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 font-medium"><Calendar size={12} /><span>{getNightsCount(booking)} night{getNightsCount(booking) !== 1 ? 's' : ''}</span></div><div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 font-medium"><Users size={12} /><span>{[booking.adults > 0 && `${booking.adults}A`, booking.children > 0 && `${booking.children}C`, booking.infants > 0 && `${booking.infants}I`, booking.seniors > 0 && `${booking.seniors}S`].filter(Boolean).join(' · ') || '—'}</span></div></div></td>
                          <td className="px-5 py-4 hidden md:table-cell" style={{width: '200px'}}><div className="flex items-center gap-3"><UnitImage condo={booking.condos} /><div className="min-w-0"><TruncateTooltip text={booking.condos?.code || '—'} maxLength={10} className="text-sm font-bold text-gray-900 dark:text-gray-100 block" /><TruncateTooltip text={booking.condos?.title || '—'} maxLength={18} className="text-xs text-gray-600 dark:text-gray-300 block mt-0.5 font-medium" /></div></div></td>
                          <td className="px-5 py-4 hidden lg:table-cell" style={{width: '180px'}}><div className="space-y-1"><div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 font-medium"><div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></div><span className="whitespace-nowrap">{format(new Date(booking.start_date), 'MMM d, yyyy')}</span></div><div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 font-medium"><div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></div><span className="whitespace-nowrap">{format(new Date(booking.end_date), 'MMM d, yyyy')}</span></div></div></td>
                          <td className="px-5 py-4 text-right" style={{width: '120px'}}><span className="text-sm font-extrabold text-gray-900 dark:text-gray-100">{formatPrice(booking.total_amount)}</span></td>
                          <td className="px-5 py-4" style={{width: '150px'}} onClick={e => e.stopPropagation()}><div className="flex items-center justify-center gap-1.5">
                            {isPending && (<><button onClick={() => openModal(booking, 'confirm')} disabled={isLoading || !canConfirm} title={canConfirm ? 'Approve booking' : 'Cannot confirm - date conflict exists'} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-110 ${canConfirm ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30' : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'}`}><Check size={18} /></button><button onClick={() => openModal(booking, 'reject')} disabled={isLoading} title="Reject booking" className="w-9 h-9 rounded-lg flex items-center justify-center text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all hover:scale-110 disabled:opacity-40"><X size={18} /></button></>)}
                            {showDelete && <button onClick={() => openModal(booking, 'delete')} disabled={isLoading} title="Delete booking" className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all hover:scale-110 disabled:opacity-40">{isLoading ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={18} />}</button>}
                            <motion.button onClick={() => toggleRow(booking.id)} animate={{ rotate: isExpanded ? 180 : 0 }} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'}`} title={isExpanded ? 'Hide details' : 'View details'}><ChevronDown size={18} /></motion.button>
                          </div></td>
                        </tr>
                        <AnimatePresence>   
                          {isExpanded && (
                            <motion.tr initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="bg-gradient-to-b from-blue-50/50 to-white dark:from-blue-900/20 dark:to-gray-800">
                              <td colSpan={6} className="px-6 py-5 border-t-2 border-blue-200 dark:border-blue-800">
                                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-blue-100 dark:border-blue-900"><div className="w-1 h-5 bg-blue-500 rounded-full"></div><span className="text-sm font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Booking Details</span><span className="text-xs text-gray-500 dark:text-gray-400 font-medium">#{booking.booking_code}</span></div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <div className="bg-white dark:bg-gray-700 rounded-xl p-4 border border-gray-100 dark:border-gray-600 shadow-sm"><h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3"><Mail size={14} /> Contact</h4><div className="space-y-3"><div><label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold">Email</label><p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 break-all font-medium">{booking.guest_email || '—'}</p></div><div><label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold">Phone</label><p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 font-medium">{booking.guest_phone || '—'}</p></div></div></div>
                                  <div className="bg-white dark:bg-gray-700 rounded-xl p-4 border border-gray-100 dark:border-gray-600 shadow-sm"><h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3"><Users size={14} /> Guests</h4><div className="flex flex-wrap gap-2">{booking.adults > 0 && <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300 text-xs px-3 py-2 rounded-lg font-bold"><User size={12} /> {booking.adults} Adult{booking.adults>1?'s':''}</span>}{booking.children > 0 && <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 border border-purple-200 dark:border-purple-700 text-purple-800 dark:text-purple-300 text-xs px-3 py-2 rounded-lg font-bold"><Baby size={12} /> {booking.children} Child{booking.children>1?'ren':''}</span>}{booking.infants > 0 && <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-pink-50 to-pink-100 dark:from-pink-900/30 dark:to-pink-800/30 border border-pink-200 dark:border-pink-700 text-pink-800 dark:text-pink-300 text-xs px-3 py-2 rounded-lg font-bold"><Baby size={12} /> {booking.infants} Infant{booking.infants>1?'s':''}</span>}{booking.seniors > 0 && <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs px-3 py-2 rounded-lg font-bold"><PersonStanding size={12} /> {booking.seniors} Senior{booking.seniors>1?'s':''}</span>}{!booking.adults && !booking.children && !booking.infants && !booking.seniors && <span className="text-xs text-gray-500 dark:text-gray-400 italic font-medium">Not specified</span>}</div></div>
                                  <div className="bg-white dark:bg-gray-700 rounded-xl p-4 border border-gray-100 dark:border-gray-600 shadow-sm"><h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3"><Calendar size={14} /> Reservation</h4><div className="space-y-2"><div className="flex justify-between items-center py-1"><span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Duration</span><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{getNightsCount(booking)} night{getNightsCount(booking) !== 1 ? 's' : ''}</span></div><div className="flex justify-between items-center py-1 border-t border-gray-50 dark:border-gray-600"><span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Check-in</span><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{format(new Date(booking.start_date), 'MMM d, yyyy')}</span></div><div className="flex justify-between items-center py-1 border-t border-gray-50 dark:border-gray-600"><span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Check-out</span><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{format(new Date(booking.end_date), 'MMM d, yyyy')}</span></div>{booking.promo_code && <div className="flex justify-between items-center py-1 border-t border-gray-50 dark:border-gray-600"><span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Promo</span><span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">{booking.promo_code}</span></div>}<div className="flex justify-between items-center py-1 border-t border-gray-50 dark:border-gray-600"><span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Booked</span><span className="text-sm font-bold text-gray-900 dark:text-gray-100">{format(new Date(booking.created_at), 'MMM d, yyyy')}</span></div></div></div>
                                </div>
                                {overlap && <div className="mt-5 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-xl flex items-start gap-3"><div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-400 dark:bg-red-600 flex items-center justify-center"><AlertTriangle size={20} className="text-white" /></div><div><p className="text-sm font-bold text-red-900 dark:text-red-200">⚠️ Booking Conflict Detected</p><p className="text-sm text-red-800 dark:text-red-300 mt-1 font-medium">This booking overlaps with an existing confirmed booking for <span className="font-bold">{booking.condos?.code || 'Unknown'}</span>. Confirmation is blocked until the conflict is resolved.</p></div></div>}
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal isOpen={modalConfig.isOpen} onClose={closeModal} onConfirm={handleConfirmAction} booking={modalConfig.booking} action={modalConfig.action} formatPrice={formatPrice} />
    </div>
  )
}