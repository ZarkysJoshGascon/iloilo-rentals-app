import React, { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { 
  CheckCircle, Clock, XCircle, Calendar, RefreshCw, 
  Trash2, Check, X, AlertTriangle, BarChart3,
  Hash, Home, Calendar as CalendarIcon, Mail, Phone, Users, DollarSign, Activity,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'

export default function BookingsList() {
  const [bookings, setBookings] = useState([])
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const { formatPrice } = useCurrency()
  const [stats, setStats] = useState({ total: 0, pending: 0, confirmed: 0, rejected: 0 })

  const fetchConfirmedBookings = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, condo_id, start_date, end_date, status')
      .eq('status', 'confirmed')
    if (!error) setConfirmedBookings(data || [])
  }

  const fetchBookings = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    setLoading(true)
    try {
      let query = supabase
        .from('bookings')
        .select('*, condos:condo_id(code, title, location, images, status)')
        .order('created_at', { ascending: false })

      if (statusFilter === 'pending') query = query.eq('status', 'pending')
      else if (statusFilter === 'confirmed') query = query.eq('status', 'confirmed')
      else if (statusFilter === 'rejected') query = query.eq('status', 'rejected')

      const { data, error } = await query
      if (error) throw error
      setBookings(data || [])

      const { data: allBookings } = await supabase.from('bookings').select('status')
      const total = allBookings?.length || 0
      const pending = allBookings?.filter(b => b.status === 'pending').length || 0
      const confirmed = allBookings?.filter(b => b.status === 'confirmed').length || 0
      const rejected = allBookings?.filter(b => b.status === 'rejected').length || 0
      setStats({ total, pending, confirmed, rejected })

      await fetchConfirmedBookings()
    } catch (error) {
      console.error(error)
      toast.error('Failed to load bookings')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchBookings()
    fetchConfirmedBookings()
    const subscription = supabase
      .channel('bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchBookings(true)
      })
      .subscribe()
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    fetchBookings()
  }, [statusFilter])

  const updateStatus = async (id, newStatus, bookingCode) => {
    const confirmMsg = newStatus === 'confirmed' ? `Confirm booking ${bookingCode}?` : `Reject booking ${bookingCode}?`
    if (!confirm(confirmMsg)) return
    setActionLoading(id)
    setUpdatingId(id)
    try {
      const dbStatus = newStatus === 'confirmed' ? 'confirmed' : 'rejected'
      const { error } = await supabase
        .from('bookings')
        .update({ status: dbStatus })
        .eq('id', id)
      if (error) throw error
      toast.success(`Booking ${bookingCode} ${newStatus === 'confirmed' ? 'confirmed' : 'rejected'}`)
      setTimeout(() => fetchBookings(true), 300)
      setTimeout(() => setUpdatingId(null), 500)
    } catch (error) {
      console.error(error)
      toast.error('Failed to update status')
      setUpdatingId(null)
    } finally {
      setActionLoading(null)
    }
  }

  const deleteBooking = async (id, bookingCode) => {
    if (!confirm(`Delete booking ${bookingCode}? This action cannot be undone.`)) return
    setActionLoading(id)
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id)
      if (error) throw error
      toast.success(`Booking ${bookingCode} deleted`)
      fetchBookings(true)
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete booking')
    } finally {
      setActionLoading(null)
    }
  }

  const hasOverlap = (booking) => {
    if (booking.status !== 'pending') return false
    const start = new Date(booking.start_date)
    const end = new Date(booking.end_date)
    return confirmedBookings.some(cb => 
      cb.condo_id === booking.condo_id &&
      (start <= new Date(cb.end_date) && end >= new Date(cb.start_date))
    )
  }

  const formatGuests = (booking) => {
    const parts = []
    if (booking.adults > 0) parts.push(`${booking.adults} adult${booking.adults > 1 ? 's' : ''}`)
    if (booking.children > 0) parts.push(`${booking.children} child${booking.children > 1 ? 'ren' : ''}`)
    if (booking.infants > 0) parts.push(`${booking.infants} infant${booking.infants > 1 ? 's' : ''}`)
    if (booking.seniors > 0) parts.push(`${booking.seniors} senior${booking.seniors > 1 ? 's' : ''}`)
    return parts.join(', ')
  }

  const getStatusClass = (status) => {
    switch(status) {
      case 'pending': return 'bg-amber-100 text-amber-700 border border-amber-200'
      case 'confirmed': return 'bg-emerald-100 text-emerald-700 border border-emerald-200'
      case 'rejected': return 'bg-rose-100 text-rose-700 border border-rose-200'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getCondoImage = (condo) => {
    if (!condo) return null
    if (condo.images && condo.images.length > 0) return condo.images[0]
    if (condo.code) return `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_1.jpg`
    return null
  }

  const toggleExpand = (id, e) => {
    if (e.target.closest('.action-buttons')) return
    setExpandedId(expandedId === id ? null : id)
  }

  if (loading && !refreshing) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2d568e]"></div></div>
  }

  const completionRate = stats.total === 0 ? 0 : Math.round((stats.confirmed / stats.total) * 100)

  return (
    <>
      {/* Two summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-300 rounded-md shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700">Booking Overview</h3>
            <BarChart3 size={20} className="text-gray-400" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-2xl font-bold text-amber-600">{stats.pending}</div><div className="text-xs text-gray-500">Pending</div></div>
            <div><div className="text-2xl font-bold text-emerald-600">{stats.confirmed}</div><div className="text-xs text-gray-500">Confirmed</div></div>
            <div><div className="text-2xl font-bold text-rose-600">{stats.rejected}</div><div className="text-xs text-gray-500">Rejected</div></div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 rounded-md shadow-sm p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Completion Rate</div>
            <div className="text-2xl font-bold text-[#2d568e]">{completionRate}%</div>
            <div className="text-xs text-gray-400">{stats.confirmed} of {stats.total} bookings confirmed</div>
          </div>
          <div className="relative w-16 h-16">
            <svg className="w-full h-full" viewBox="0 0 36 36">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#E5E7EB" strokeWidth="3"/>
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#2d568e" strokeWidth="3" strokeDasharray={`${completionRate}, 100`} strokeLinecap="round"/>
              <text x="18" y="20.5" textAnchor="middle" fontSize="6" fill="#2d568e" fontWeight="bold">{completionRate}%</text>
            </svg>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {['all', 'pending', 'confirmed', 'rejected'].map((filter) => (
            <button key={filter} onClick={() => setStatusFilter(filter)} className={`px-3 py-1 text-sm rounded-full transition ${statusFilter === filter ? 'bg-[#2d568e] text-white' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}`}>
              {filter === 'all' ? 'All' : filter === 'pending' ? 'Pending' : filter === 'confirmed' ? 'Confirmed' : 'Rejected'}
            </button>
          ))}
        </div>
        <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={() => fetchBookings(true)} disabled={refreshing} className="flex items-center gap-1 text-sm text-[#2d568e] hover:text-[#1e3a5f] transition disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </motion.button>
      </div>

      {/* Scrollable area */}
      <div className="overflow-y-auto max-h-[calc(100vh-360px)]">
        {/* Sticky header row */}
        <div className="sticky top-0 z-10 grid grid-cols-12 gap-3 bg-gray-200 px-4 py-3 text-sm font-bold text-gray-700 border-b border-gray-300 shadow-sm">
          <div className="col-span-2">Condo Image</div>
          <div className="col-span-2">Booking ID</div>
          <div className="col-span-2">Unit</div>
          <div className="col-span-2">Guest Name</div>
          <div className="col-span-2">Dates</div>
          <div className="col-span-1">Total</div>
          <div className="col-span-1">Status</div>
        </div>

        {/* Cards */}
        <div className="space-y-4 mt-4">
          {bookings.length === 0 ? (
            <div className="text-center text-gray-400 py-12">No bookings found</div>
          ) : (
            bookings.map((booking) => {
              const isExpanded = expandedId === booking.id
              const guestName = booking.guest_name || '—'
              const condoImage = getCondoImage(booking.condos)
              const overlap = hasOverlap(booking)
              const isPending = booking.status === 'pending'
              const showDelete = booking.status === 'confirmed' || booking.status === 'rejected'

              return (
                <motion.div
                  key={booking.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`bg-white border border-gray-200 rounded-md shadow-sm hover:shadow-md transition-all cursor-pointer ${updatingId === booking.id ? 'ring-2 ring-amber-300' : ''}`}
                  onClick={(e) => toggleExpand(booking.id, e)}
                >
                  {/* Main row – same grid as header */}
                  <div className="grid grid-cols-12 gap-3 p-4 items-center">
                    <div className="col-span-2 flex justify-center">
                      {condoImage ? (
                        <img src={condoImage} alt={booking.condos?.code} className="w-12 h-12 object-cover rounded-md" />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                          <Home size={20} className="text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 font-mono text-xs text-gray-600">{booking.booking_code}</div>
                    <div className="col-span-2 text-sm font-semibold text-gray-800">{booking.condos?.code || '—'}</div>
                    <div className="col-span-2 text-sm text-gray-700 truncate" title={guestName}>{guestName}</div>
                    <div className="col-span-2 text-sm text-gray-600">
                      {format(new Date(booking.start_date), 'MMM dd')} – {format(new Date(booking.end_date), 'MMM dd')}
                    </div>
                    <div className="col-span-1 text-sm font-semibold text-[#2d568e]">{formatPrice(booking.total_amount)}</div>
                    <div className="col-span-1 flex items-center justify-end gap-2">
                      <div className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusClass(booking.status)}`}>
                        {booking.status === 'pending' ? 'Pending' : booking.status === 'confirmed' ? 'Confirmed' : 'Rejected'}
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-gray-100"
                      >
                        <div className="p-4 bg-gray-50">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                            <div>
                              <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1"><Mail size={14}/> Email</div>
                              <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400"/> {booking.guest_email || '—'}</div>
                              <div className="font-semibold text-gray-700 mt-3 mb-2 flex items-center gap-1"><Phone size={14}/> Phone</div>
                              <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400"/> {booking.guest_phone || '—'}</div>
                            </div>
                            <div>
                              <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1"><Users size={14}/> Guest Composition</div>
                              <div className="flex flex-wrap gap-2">
                                {booking.adults > 0 && <span className="bg-white px-2 py-1 rounded-md shadow-sm">👤 {booking.adults} Adult{booking.adults > 1 ? 's' : ''}</span>}
                                {booking.children > 0 && <span className="bg-white px-2 py-1 rounded-md shadow-sm">🧒 {booking.children} Child{booking.children > 1 ? 'ren' : ''}</span>}
                                {booking.infants > 0 && <span className="bg-white px-2 py-1 rounded-md shadow-sm">🍼 {booking.infants} Infant{booking.infants > 1 ? 's' : ''}</span>}
                                {booking.seniors > 0 && <span className="bg-white px-2 py-1 rounded-md shadow-sm">👴 {booking.seniors} Senior{booking.seniors > 1 ? 's' : ''}</span>}
                              </div>
                            </div>
                          </div>
                          {overlap && (
                            <div className="mt-3 p-2 bg-rose-50 rounded-md text-xs text-rose-700 flex items-center gap-1">
                              <AlertTriangle size={12} /> This pending booking overlaps with an existing confirmed booking. Contact the guest to resolve.
                            </div>
                          )}
                          <div className="action-buttons flex flex-wrap items-center justify-end gap-2 mt-4 pt-2 border-t border-gray-200">
                            {isPending && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateStatus(booking.id, 'confirmed', booking.booking_code); }}
                                  disabled={actionLoading === booking.id}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition disabled:opacity-50"
                                >
                                  <Check size={16} /> Approve
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateStatus(booking.id, 'rejected', booking.booking_code); }}
                                  disabled={actionLoading === booking.id}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 transition disabled:opacity-50"
                                >
                                  <X size={16} /> Reject
                                </button>
                              </>
                            )}
                            {showDelete && (
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteBooking(booking.id, booking.booking_code); }}
                                disabled={actionLoading === booking.id}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-rose-600 transition disabled:opacity-50"
                              >
                                {actionLoading === booking.id ? (
                                  <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Trash2 size={16} />
                                )} Delete
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}