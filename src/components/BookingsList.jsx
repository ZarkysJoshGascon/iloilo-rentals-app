import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  Check, X, Trash2, AlertTriangle,
  Search, ArrowUpDown, RefreshCw, Calendar,
  Building2, MapPin, Mail, Phone,
  ChevronRight, SlidersHorizontal, ShieldCheck, Ban, Clock,
  ChevronDown, User, CreditCard, Hash, Bed
} from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { avatarColors, initials } from '../utils/avatar'

/* ------------------------------------------------------------------ */
/*  Unit Image                                                          */
/* ------------------------------------------------------------------ */

const UnitImage = ({ condo }) => {
  const [imgError, setImgError] = useState(false)
  if (!condo) return null
  const imageUrl = condo.images?.[0] || (condo.code ? `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_1.jpg` : null)
  if (!imageUrl || imgError) {
    return (
      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center flex-shrink-0">
        <Building2 size={20} className="text-blue-600 dark:text-blue-400" />
      </div>
    )
  }
  return <img src={imageUrl} alt={condo.title || 'Unit'} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm" onError={() => setImgError(true)} />
}

/* ------------------------------------------------------------------ */
/*  Summary Cards                                                       */
/* ------------------------------------------------------------------ */

function SummaryCards({ stats }) {
  const cards = [
    { label: 'To Accommodate', value: stats.pending, icon: Clock, iconColor: 'text-blue-600 dark:text-blue-400', bgLight: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-700', textColor: 'text-blue-900 dark:text-blue-100' },
    { label: 'Conflicts', value: stats.conflicts, icon: AlertTriangle, iconColor: 'text-orange-600 dark:text-orange-400', bgLight: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-700', textColor: 'text-orange-900 dark:text-orange-100' },
    { label: 'Active', value: stats.active, icon: ShieldCheck, iconColor: 'text-emerald-600 dark:text-emerald-400', bgLight: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700', textColor: 'text-emerald-900 dark:text-emerald-100' },
    { label: 'Rejected', value: stats.rejected, icon: Ban, iconColor: 'text-red-600 dark:text-red-400', bgLight: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-700', textColor: 'text-red-900 dark:text-red-100' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -3 }}
          className={`relative overflow-hidden rounded-2xl ${card.bgLight} border ${card.border} p-5 shadow-sm hover:shadow-md transition-shadow duration-200`}>
          <div className="flex items-center justify-between">
            <p className={`text-3xl font-bold ${card.textColor}`}>{card.value}</p>
            <card.icon size={24} className={card.iconColor} />
          </div>
          <p className={`text-xs font-semibold uppercase tracking-wider mt-2 ${card.iconColor}`}>{card.label}</p>
        </motion.div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Status Dot                                                          */
/* ------------------------------------------------------------------ */

const StatusDot = ({ status, hasConflict }) => {
  if (status === 'pending' && !hasConflict) return <span className="w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-emerald-200 dark:ring-emerald-800 inline-block" title="Ready" />
  if (status === 'pending' && hasConflict) return <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse ring-2 ring-orange-200 dark:ring-orange-800 inline-block" title="Conflict" />
  return null
}

/* ------------------------------------------------------------------ */
/*  Action Dropdown                                                     */
/* ------------------------------------------------------------------ */

const ActionDropdown = ({ booking, onConfirm, onReject, onDelete, actionLoading, overlap, isConfirmedRejected }) => {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const isPending = booking.status === 'pending'

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open) }} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${
        isConfirmedRejected 
          ? 'border-white/30 text-white/80 hover:bg-white/10' 
          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}>
        Manage <ChevronDown size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.95, y: -5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -5 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 py-1 z-50">
            {isPending && (
              <>
                <button onClick={(e) => { e.stopPropagation(); onConfirm(booking); setOpen(false) }} disabled={actionLoading === booking.id || overlap}
                  className={`w-full text-left px-3 py-2.5 text-xs font-medium flex items-center gap-2 transition-colors ${overlap ? 'text-gray-400 cursor-not-allowed' : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'}`}>
                  <Check size={14} /> Confirm Booking
                </button>
                <button onClick={(e) => { e.stopPropagation(); onReject(booking); setOpen(false) }} disabled={actionLoading === booking.id}
                  className="w-full text-left px-3 py-2.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 transition-colors">
                  <X size={14} /> Reject Booking
                </button>
              </>
            )}
            {!isPending && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(booking); setOpen(false) }} disabled={actionLoading === booking.id}
                className="w-full text-left px-3 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                <Trash2 size={14} /> Delete Booking
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Delete Confirmation Modal                                           */
/* ------------------------------------------------------------------ */

function ConfirmationModal({ isOpen, onClose, onConfirm, booking, formatPrice }) {
  if (!isOpen) return null
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-br from-gray-700 to-gray-600 p-8 text-center"><Trash2 size={32} className="text-white mx-auto mb-4" /><h3 className="text-xl font-bold text-white">Delete Booking</h3><p className="text-white/80 text-sm mt-1">This cannot be undone.</p></div>
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">ID</span><span className="font-mono font-bold">{booking?.booking_code}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Guest</span><span className="font-bold">{booking?.guest_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Unit</span><span className="font-bold">{booking?.condos?.code || '—'}</span></div>
              <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600"><span className="text-gray-500">Amount</span><span className="text-lg font-extrabold">{formatPrice(booking?.total_amount || 0)}</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl font-bold text-sm">Cancel</button>
              <button onClick={() => { onConfirm(); onClose() }} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold text-sm">Delete</button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function BookingsList({ searchTerm: externalSearchTerm = '' }) {
  const [bookings, setBookings] = useState([])
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [activeGroup, setActiveGroup] = useState('pending')
  const [sortBy, setSortBy] = useState('latest')
  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [modalConfig, setModalConfig] = useState({ isOpen: false, booking: null })
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const { formatPrice } = useCurrency()
  const effectiveSearch = externalSearchTerm || searchText

  const fetchConfirmedBookings = useCallback(async () => {
    const { data, error } = await supabase.from('bookings').select('id, condo_id, start_date, end_date, status').eq('status', 'confirmed')
    if (!error) setConfirmedBookings(data || [])
  }, [])

  const fetchBookings = useCallback(async () => {
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
  }, [sortBy, fetchConfirmedBookings])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBookings()
    const sub = supabase.channel('bookings-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchBookings).subscribe()
    return () => sub.unsubscribe()
  }, [fetchBookings])

  // Highlight booking from calendar navigation
  useEffect(() => {
    const highlightId = sessionStorage.getItem('highlightBooking')
    if (highlightId && bookings.length > 0) {
      const booking = bookings.find(b => b.id === highlightId)
      if (booking) {
        setSelectedBooking(booking)
        setActiveGroup('all')
        setTimeout(() => {
          const element = document.getElementById(`booking-row-${highlightId}`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 300)
      }
      sessionStorage.removeItem('highlightBooking')
    }
  }, [bookings])

  const handleQuickAction = async (booking, action) => {
    if (action === 'confirm' && hasOverlap(booking)) { toast.error('Cannot confirm: Date conflict detected'); return }
    setActionLoading(booking.id)
    try {
      if (action === 'delete') {
        await supabase.from('bookings').delete().eq('id', booking.id)
        toast.success(`Booking ${booking.booking_code} deleted`)
      } else {
        await supabase.from('bookings').update({ status: action === 'confirm' ? 'confirmed' : 'rejected' }).eq('id', booking.id)
        toast.success(`Booking ${booking.booking_code} ${action === 'confirm' ? 'confirmed' : 'rejected'}`)
      }
      setSelectedBooking(null)
      fetchBookings()
    } catch { toast.error('Failed to update booking') }
    finally { setActionLoading(null) }
  }

  const openDeleteModal = (booking) => setModalConfig({ isOpen: true, booking })
  const closeModal = () => setModalConfig({ isOpen: false, booking: null })

  const hasOverlap = (booking) => {
    if (booking.status !== 'pending') return false
    const start = new Date(booking.start_date), end = new Date(booking.end_date)
    return confirmedBookings.some(cb => cb.condo_id === booking.condo_id && cb.id !== booking.id && start <= new Date(cb.end_date) && end >= new Date(cb.start_date))
  }

  const getNightsCount = (b) => Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / (1000 * 60 * 60 * 24))
  
  const getGuestSummary = (b) => {
    const parts = []
    if (b.adults > 0) parts.push(`${b.adults}A`)
    if (b.children > 0) parts.push(`${b.children}C`)
    if (b.infants > 0) parts.push(`${b.infants}I`)
    if (b.seniors > 0) parts.push(`${b.seniors}S`)
    return parts.join('·') || '—'
  }

  const getRowStyle = (b, sel) => {
    if (b.status === 'confirmed') return { bg: sel ? 'bg-emerald-600' : 'bg-emerald-500', text: 'text-white', subtext: 'text-white/80', muted: 'text-white/70', border: 'border-b border-emerald-400/50', strip: '' }
    if (b.status === 'rejected') return { bg: sel ? 'bg-red-500' : 'bg-red-400', text: 'text-white', subtext: 'text-white/80', muted: 'text-white/70', border: 'border-b border-red-300/50', strip: '' }
    if (b.status === 'pending' && hasOverlap(b)) return { bg: sel ? 'bg-orange-100 dark:bg-orange-900/30' : '', text: 'text-gray-900 dark:text-gray-100', subtext: 'text-gray-600 dark:text-gray-300', muted: 'text-gray-500 dark:text-gray-400', border: 'border-b border-gray-100 dark:border-gray-700', strip: 'border-l-[6px] border-l-orange-500' }
    if (b.status === 'pending' && !hasOverlap(b)) return { bg: sel ? 'bg-emerald-100 dark:bg-emerald-900/30' : '', text: 'text-gray-900 dark:text-gray-100', subtext: 'text-gray-600 dark:text-gray-300', muted: 'text-gray-500 dark:text-gray-400', border: 'border-b border-gray-100 dark:border-gray-700', strip: 'border-l-[6px] border-l-emerald-500' }
    return { bg: sel ? 'bg-blue-100 dark:bg-blue-900/30' : '', text: 'text-gray-900 dark:text-gray-100', subtext: 'text-gray-600 dark:text-gray-300', muted: 'text-gray-500 dark:text-gray-400', border: 'border-b border-gray-100 dark:border-gray-700', strip: '' }
  }

  const groupConflicts = (conflictBookings) => {
    const groups = [], used = new Set()
    for (const b of conflictBookings) {
      if (used.has(b.id)) continue
      const group = [b]; used.add(b.id)
      for (const o of conflictBookings) {
        if (used.has(o.id)) continue
        if (o.condo_id === b.condo_id && new Date(b.start_date) <= new Date(o.end_date) && new Date(b.end_date) >= new Date(o.start_date)) {
          group.push(o); used.add(o.id)
        }
      }
      groups.push(group)
    }
    return groups
  }

  const getFilteredBookings = () => {
    let filtered = [...bookings]
    if (effectiveSearch) {
      const s = effectiveSearch.toLowerCase()
      filtered = filtered.filter(b => 
        (b.guest_name || '').toLowerCase().includes(s) || 
        (b.booking_code || '').toLowerCase().includes(s) || 
        (b.condos?.code || '').toLowerCase().includes(s) ||
        (b.condos?.title || '').toLowerCase().includes(s) ||
        (b.guest_email || '').toLowerCase().includes(s)
      )
    }
    if (activeGroup !== 'all') {
      filtered = activeGroup === 'conflicts' 
        ? filtered.filter(b => b.status === 'pending' && hasOverlap(b))
        : filtered.filter(b => b.status === activeGroup)
    }
    if (dateFrom) { const f = new Date(dateFrom); f.setHours(0,0,0,0); filtered = filtered.filter(b => new Date(b.created_at) >= f) }
    if (dateTo) { const t = new Date(dateTo); t.setHours(23,59,59,999); filtered = filtered.filter(b => new Date(b.created_at) <= t) }
    
    filtered.sort((a, b) => {
      const ac = a.status === 'pending' && hasOverlap(a), bc = b.status === 'pending' && hasOverlap(b)
      if (ac && !bc) return -1; if (!ac && bc) return 1
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (a.status !== 'pending' && b.status === 'pending') return 1
      return new Date(b.created_at) - new Date(a.created_at)
    })
    return filtered
  }

  const pendingCount = bookings.filter(b => b.status === 'pending').length
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length
  const rejectedCount = bookings.filter(b => b.status === 'rejected').length
  const conflictCount = bookings.filter(b => b.status === 'pending' && hasOverlap(b)).length

  const stats = { total: bookings.length, pending: pendingCount, confirmed: confirmedCount, rejected: rejectedCount, conflicts: conflictCount, active: confirmedCount + pendingCount }

  const statusOptions = [
    { id: 'pending', label: 'To Accommodate', count: pendingCount, dot: 'bg-blue-500' },
    { id: 'all', label: 'All Bookings', count: bookings.length, dot: 'bg-gray-400' },
    { id: 'conflicts', label: 'Conflicts', count: conflictCount, dot: 'bg-orange-500' },
    { id: 'confirmed', label: 'Confirmed', count: confirmedCount, dot: 'bg-emerald-500' },
    { id: 'rejected', label: 'Rejected', count: rejectedCount, dot: 'bg-red-400' },
  ]

  const filteredBookings = getFilteredBookings()
  const showConflictGroups = activeGroup === 'conflicts'
  const conflictGroups = showConflictGroups ? groupConflicts(filteredBookings) : []
  const activeOption = statusOptions.find(o => o.id === activeGroup)

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700"><div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-12 mb-2" /><div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" /></div>)}</div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-64" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      <SummaryCards stats={stats} />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search guest, booking ID, unit or email..." value={searchText} onChange={e => setSearchText(e.target.value)}
          className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900 focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-gray-100 shadow-sm" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-all border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">
            {activeOption?.label || 'To Accommodate'}
            <span className="text-xs opacity-70">({activeOption?.count})</span>
            <ChevronDown size={14} className={`transition ${statusDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {statusDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 py-1 z-20">
                  {statusOptions.map(opt => (
                    <button key={opt.id} onClick={() => { setActiveGroup(opt.id); setStatusDropdownOpen(false) }}
                      className={`w-full text-left px-4 py-2.5 text-sm font-medium flex items-center justify-between transition-colors ${activeGroup === opt.id ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                      <span className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${opt.dot}`}></span>{opt.label}</span>
                      <span className="text-xs font-bold text-gray-400">{opt.count}</span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <button onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2.5 text-sm border rounded-lg flex items-center gap-1.5 transition-all ${showFilters || dateFrom || dateTo ? 'border-[#2d568e] bg-[#2d568e]/5 text-[#2d568e]' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800'}`}>
          <SlidersHorizontal size={14} /> Date Filter
        </button>

        <div className="relative">
          <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="pl-9 pr-8 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-100 appearance-none cursor-pointer">
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price_high">Price ↓</option>
            <option value="price_low">Price ↑</option>
          </select>
        </div>

        <button onClick={fetchBookings} className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all bg-white dark:bg-gray-800" title="Refresh">
          <RefreshCw size={16} />
        </button>

        <div className="hidden sm:flex items-center gap-3 ml-auto text-xs font-medium text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-600 dark:text-gray-300">Status:</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Ready</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> Conflict</span>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600">
              <label className="text-xs font-medium text-gray-500">Booked from:</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer" />
              <label className="text-xs font-medium text-gray-500">to:</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer" />
              {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-xs text-[#2d568e] hover:underline">Clear</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hidden md:flex items-center px-4 py-3 bg-gray-50/80 dark:bg-gray-700/50 rounded-t-xl border border-gray-100 dark:border-gray-700 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        <div className="flex-[2] px-2">Unit / Location</div>
        <div className="flex-1 px-2">Booking ID</div>
        <div className="flex-[1.5] px-2">Dates / Nights</div>
        <div className="flex-[0.7] text-center px-2">Guests</div>
        <div className="flex-1 text-right px-2">Price</div>
        <div className="flex-[0.8] text-center px-2">Status</div>
        <div className="flex-[0.8] text-center px-2">Actions</div>
        <div className="w-6"></div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-b-xl border border-t-0 border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm flex flex-col flex-1 min-h-0 -mt-2 md:mt-0">
        <div className="flex-1 overflow-y-auto">
          {filteredBookings.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <div className="text-center py-12">
                <Calendar size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No bookings found</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try adjusting your filters</p>
              </div>
            </div>
          ) : showConflictGroups ? (
            <div>
              {conflictGroups.map((group, gi) => (
                <div key={gi}>
                  <div className="px-4 py-2.5 bg-orange-100/70 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-700">
                    <p className="text-xs font-bold text-orange-700 dark:text-orange-300 flex items-center gap-2">
                      <AlertTriangle size={14} /> Conflict Group {gi + 1} — {group[0]?.condos?.code || 'Unit'} ({group.length} booking{group.length !== 1 ? 's' : ''})
                    </p>
                  </div>
                  {group.map(booking => <BookingRow key={booking.id} {...{ booking, selectedBooking, hasOverlap, getNightsCount, getGuestSummary, getRowStyle, setSelectedBooking, handleQuickAction, openDeleteModal, actionLoading, formatPrice }} />)}
                </div>
              ))}
            </div>
          ) : (
            <div>
              {filteredBookings.map(booking => <BookingRow key={booking.id} {...{ booking, selectedBooking, hasOverlap, getNightsCount, getGuestSummary, getRowStyle, setSelectedBooking, handleQuickAction, openDeleteModal, actionLoading, formatPrice }} />)}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30">
          <p className="text-xs text-gray-500 dark:text-gray-400">Showing {filteredBookings.length} of {bookings.length} bookings</p>
        </div>
      </div>

      <ConfirmationModal isOpen={modalConfig.isOpen} onClose={closeModal} onConfirm={() => handleQuickAction(modalConfig.booking, 'delete')} booking={modalConfig.booking} formatPrice={formatPrice} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Booking Row Component                                               */
/* ------------------------------------------------------------------ */

function BookingRow({ booking, selectedBooking, hasOverlap, getNightsCount, getGuestSummary, getRowStyle, setSelectedBooking, handleQuickAction, openDeleteModal, actionLoading, formatPrice }) {
  const isSelected = selectedBooking?.id === booking.id
  const overlap = hasOverlap(booking)
  const nights = getNightsCount(booking)
  const style = getRowStyle(booking, isSelected)
  const isConfirmedRejected = booking.status === 'confirmed' || booking.status === 'rejected'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} id={`booking-row-${booking.id}`}>
      <div onClick={() => setSelectedBooking(isSelected ? null : booking)}
        className={`flex items-center px-4 py-4 cursor-pointer transition-all duration-200 ${style.bg} ${style.border} ${style.strip}`}>
        
        {/* Unit */}
        <div className="flex items-center gap-3 flex-[2] min-w-0 px-2">
          <UnitImage condo={booking.condos} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-bold truncate max-w-[160px] ${style.text}`}>{booking.condos?.title || '—'}</p>
              <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${isConfirmedRejected ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-[#2d568e] dark:text-blue-400'}`}>{booking.condos?.code || '—'}</span>
            </div>
            <div className={`flex items-center gap-1 mt-1 text-[11px] ${style.muted}`}><MapPin size={10} /><span className="truncate">{booking.condos?.location || '—'}</span></div>
          </div>
        </div>

        {/* Booking ID */}
        <div className="flex-1 min-w-0 px-2">
          <span className={`text-sm font-bold ${style.subtext}`}>{booking.booking_code}</span>
        </div>

        {/* Dates + Nights */}
        <div className="flex-[1.5] min-w-0 px-2">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className={`font-semibold whitespace-nowrap ${style.text}`}>{format(new Date(booking.start_date), 'MMM d')}</span>
            <span className={style.muted}>→</span>
            <span className={`font-semibold whitespace-nowrap ${style.text}`}>{format(new Date(booking.end_date), 'MMM d')}</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${isConfirmedRejected ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{nights}n</span>
          </div>
        </div>

        {/* Guests */}
        <div className="flex-[0.7] text-center px-2">
          <span className={`text-sm font-semibold ${style.text}`}>{getGuestSummary(booking)}</span>
        </div>

        {/* Price */}
        <div className="flex-1 text-right px-2">
          <span className={`text-sm font-extrabold whitespace-nowrap ${isConfirmedRejected ? 'text-white' : 'text-[#2d568e] dark:text-blue-400'}`}>{formatPrice(booking.total_amount)}</span>
        </div>

        {/* Status */}
        <div className="flex-[0.8] flex items-center justify-center gap-2 px-2">
          <StatusDot status={booking.status} hasConflict={overlap} />
          <span className={`text-[11px] font-semibold ${style.muted}`}>
            {booking.status === 'pending' && !overlap ? 'Ready' : 
             booking.status === 'pending' && overlap ? 'Conflict' : 
             booking.status === 'confirmed' ? 'Confirmed' : 
             booking.status === 'rejected' ? 'Rejected' : ''}
          </span>
        </div>

        {/* Actions */}
        <div className="flex-[0.8] flex justify-center px-2">
          <ActionDropdown 
            booking={booking} 
            onConfirm={(b) => handleQuickAction(b, 'confirm')} 
            onReject={(b) => handleQuickAction(b, 'reject')} 
            onDelete={(b) => openDeleteModal(b)} 
            actionLoading={actionLoading} 
            overlap={overlap} 
            isConfirmedRejected={isConfirmedRejected}
          />
        </div>

        {/* Expand */}
        <div className="w-6 flex justify-center flex-shrink-0">
          <ChevronRight size={18} className={`transition-transform ${isSelected ? 'rotate-90' : ''} ${style.muted}`} />
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isSelected && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-gray-100 dark:bg-gray-700/40 shadow-inner border-b border-gray-200 dark:border-gray-600">
            <div className="px-5 py-5">
              <div className="flex flex-wrap items-start gap-4 mb-5">
                <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm flex-1 min-w-[200px]">
                  {booking.avatar_url ? <img src={booking.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-gray-700" />
                    : <div style={{ background: avatarColors(booking.guest_name || '—')[0], color: avatarColors(booking.guest_name || '—')[1] }} className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold ring-2 ring-white dark:ring-gray-700">{initials(booking.guest_name || '—')}</div>}
                  <div>
                    <p className="text-base font-bold text-gray-900 dark:text-gray-100">{booking.guest_name || '—'}</p>
                    <p className="text-xs text-gray-500">Guest</p>
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm flex-1 min-w-[200px] space-y-2">
                  <div className="flex items-center gap-2 text-xs"><Hash size={12} className="text-gray-400" /><span className="text-gray-500">Booking ID:</span><span className="font-mono font-bold text-gray-800 dark:text-gray-200">{booking.booking_code}</span></div>
                  <div className="flex items-center gap-2 text-xs"><CreditCard size={12} className="text-gray-400" /><span className="text-gray-500">Amount:</span><span className="font-bold text-[#2d568e] dark:text-blue-400">{formatPrice(booking.total_amount)}</span></div>
                  <div className="flex items-center gap-2 text-xs"><Bed size={12} className="text-gray-400" /><span className="text-gray-500">Guests:</span><span className="font-semibold text-gray-800 dark:text-gray-200">{getGuestSummary(booking)}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Mail size={10} /> Email</p>
                  <p className="text-xs text-gray-800 dark:text-gray-200 break-all">{booking.guest_email || '—'}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Phone size={10} /> Phone</p>
                  <p className="text-xs text-gray-800 dark:text-gray-200">{booking.guest_phone || '—'}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Calendar size={10} /> Check-in</p>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{format(new Date(booking.start_date), 'MMM d, yyyy')}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Calendar size={10} /> Check-out</p>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{format(new Date(booking.end_date), 'MMM d, yyyy')}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><Clock size={10} /> Booked On</p>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{format(new Date(booking.created_at), 'MMM d, yyyy')}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 flex items-center gap-1"><MapPin size={10} /> Location</p>
                  <p className="text-xs text-gray-800 dark:text-gray-200">{booking.condos?.location || '—'}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}