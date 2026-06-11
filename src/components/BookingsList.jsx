import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { 
  Check, X, Trash2, AlertTriangle, ChevronDown, ChevronUp, ChevronRight,
  Mail, Phone, Users, Filter, ArrowUpDown, Search
} from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'

export default function BookingsList({ searchTerm: externalSearchTerm = '' }) {
  const [bookings, setBookings] = useState([])
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [expandedBookingRowId, setExpandedBookingRowId] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState({
    pending: true,
    confirmed: true,
    rejected: true
  })
  const [sortBy, setSortBy] = useState('latest')
  const [searchText, setSearchText] = useState('')
  const { formatPrice } = useCurrency()

  const effectiveSearch = externalSearchTerm || searchText

  const fetchConfirmedBookings = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, condo_id, start_date, end_date, status')
      .eq('status', 'confirmed')
    if (!error) setConfirmedBookings(data || [])
  }

  const fetchBookings = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('bookings')
        .select('*, condos:condo_id(code, title, location, images, status)')
      
      if (sortBy === 'latest') {
        query = query.order('created_at', { ascending: false })
      } else if (sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true })
      } else if (sortBy === 'price_high') {
        query = query.order('total_amount', { ascending: false })
      } else if (sortBy === 'price_low') {
        query = query.order('total_amount', { ascending: true })
      }
      
      const { data, error } = await query
      if (error) throw error
      setBookings(data || [])
      await fetchConfirmedBookings()
    } catch (error) {
      console.error(error)
      toast.error('Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBookings()
    const subscription = supabase
      .channel('bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchBookings())
      .subscribe()
    return () => subscription.unsubscribe()
  }, [sortBy])

  const updateStatus = async (id, newStatus, bookingCode) => {
    const confirmMsg = newStatus === 'confirmed' ? `Confirm booking ${bookingCode}?` : `Reject booking ${bookingCode}?`
    if (!confirm(confirmMsg)) return
    setActionLoading(id)
    try {
      const dbStatus = newStatus === 'confirmed' ? 'confirmed' : 'rejected'
      const { error } = await supabase
        .from('bookings')
        .update({ status: dbStatus })
        .eq('id', id)
      if (error) throw error
      toast.success(`Booking ${bookingCode} ${newStatus === 'confirmed' ? 'confirmed' : 'rejected'}`)
      fetchBookings()
    } catch (error) {
      console.error(error)
      toast.error('Failed to update status')
    } finally {
      setActionLoading(null)
    }
  }

  const deleteBooking = async (id, bookingCode) => {
    if (!confirm(`Delete booking ${bookingCode}?`)) return
    setActionLoading(id)
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id)
      if (error) throw error
      toast.success(`Booking ${bookingCode} deleted`)
      fetchBookings()
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

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const toggleBookingRow = (id) => {
    setExpandedBookingRowId(expandedBookingRowId === id ? null : id)
  }

  const filterBookingsByStatus = (status) => {
    return bookings.filter(booking => 
      booking.status === status &&
      (booking.guest_name?.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
       booking.booking_code?.toLowerCase().includes(effectiveSearch.toLowerCase()) ||
       booking.condos?.code?.toLowerCase().includes(effectiveSearch.toLowerCase()))
    )
  }

  const statusGroups = [
    { key: 'pending', label: 'Pending', badgeColor: 'bg-yellow-100 text-yellow-800', borderColor: '#eab308' },
    { key: 'confirmed', label: 'Confirmed', badgeColor: 'bg-green-100 text-green-800', borderColor: '#22c55e' },
    { key: 'rejected', label: 'Rejected', badgeColor: 'bg-red-100 text-red-800', borderColor: '#ef4444' }
  ]

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>
  }

  return (
    <div className="space-y-6">
      {/* Search + Sort Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by guest, booking ID, or unit..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="pl-8 pr-8 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-1 focus:ring-blue-500"
          >
            <option value="latest">Latest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price_high">Price: High to Low</option>
            <option value="price_low">Price: Low to High</option>
          </select>
          <ArrowUpDown size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <button className="p-1.5 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md">
          <Filter size={16} />
        </button>
      </div>

      {/* Group sections with colored borders on both header and rows */}
      {statusGroups.map(group => {
        const groupBookings = filterBookingsByStatus(group.key)
        const borderColor = group.borderColor
        return (
          <div key={group.key} className="border border-gray-200 rounded-md overflow-hidden">
            {/* Group header with left border */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors bg-white"
              style={{ borderLeftWidth: '4px', borderLeftColor: borderColor, borderLeftStyle: 'solid' }}
              onClick={() => toggleGroup(group.key)}
            >
              <div className="flex items-center gap-2">
                {expandedGroups[group.key] ? <ChevronDown size={18} className="text-gray-500" /> : <ChevronRight size={18} className="text-gray-500" />}
                <span className="font-medium text-gray-800">{group.label}</span>
              </div>
              <span className={`inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-medium ${group.badgeColor}`}>
                {groupBookings.length}
              </span>
            </div>

            {expandedGroups[group.key] && (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">Profile</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Booking ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Guest Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dates</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupBookings.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                          No {group.label.toLowerCase()} bookings found
                        </td>
                      </tr>
                    ) : (
                      groupBookings.map(booking => {
                        const guestName = booking.guest_name || '—'
                        const avatarUrl = booking.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(guestName)}&background=2d568e&color=fff&size=32&rounded=true`
                        const isPending = booking.status === 'pending'
                        const showDelete = booking.status === 'confirmed' || booking.status === 'rejected'
                        const overlap = hasOverlap(booking)
                        const isExpanded = expandedBookingRowId === booking.id

                        return (
                          <React.Fragment key={booking.id}>
                            {/* Data row with left border */}
                            <tr
                              className="hover:bg-gray-50 transition-colors"
                              style={{ borderLeftWidth: '4px', borderLeftColor: borderColor, borderLeftStyle: 'solid', display: 'table-row' }}
                            >
                              <td className="px-3 py-2 whitespace-nowrap">
                                <img src={avatarUrl} alt={guestName} className="w-8 h-8 rounded-full" />
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">{booking.booking_code}</td>
                              <td className="px-3 py-2 text-sm font-medium text-gray-800 whitespace-nowrap">{booking.condos?.code || '—'}</td>
                              <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{guestName}</td>
                              <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                                {format(new Date(booking.start_date), 'MMM dd')} – {format(new Date(booking.end_date), 'MMM dd, yyyy')}
                              </td>
                              <td className="px-3 py-2 text-sm font-semibold text-blue-600 whitespace-nowrap">{formatPrice(booking.total_amount)}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                                  booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  booking.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {booking.status === 'pending' ? 'Pending' : booking.status === 'confirmed' ? 'Confirmed' : 'Rejected'}
                                  {overlap && <AlertTriangle size={12} className="text-red-500 ml-1" />}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {isPending && (
                                    <>
                                      <button
                                        onClick={() => updateStatus(booking.id, 'confirmed', booking.booking_code)}
                                        disabled={actionLoading === booking.id}
                                        className="p-1 text-green-600 hover:text-green-800"
                                        title="Approve"
                                      >
                                        <Check size={16} />
                                      </button>
                                      <button
                                        onClick={() => updateStatus(booking.id, 'rejected', booking.booking_code)}
                                        disabled={actionLoading === booking.id}
                                        className="p-1 text-red-600 hover:text-red-800"
                                        title="Reject"
                                      >
                                        <X size={16} />
                                      </button>
                                    </>
                                  )}
                                  {showDelete && (
                                    <button
                                      onClick={() => deleteBooking(booking.id, booking.booking_code)}
                                      disabled={actionLoading === booking.id}
                                      className="p-1 text-gray-400 hover:text-red-600"
                                      title="Delete"
                                    >
                                      {actionLoading === booking.id ? <div className="w-3 h-3 border border-red-600 border-t-transparent animate-spin"></div> : <Trash2 size={16} />}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => toggleBookingRow(booking.id)}
                                    className="p-1 text-gray-400 hover:text-gray-600"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-white">
                                <td colSpan="8" className="px-4 py-3">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <div className="font-medium text-gray-700 mb-1">Contact</div>
                                      <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400"/> {booking.guest_email || '—'}</div>
                                      <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400"/> {booking.guest_phone || '—'}</div>
                                    </div>
                                    <div>
                                      <div className="font-medium text-gray-700 mb-1">Guest composition</div>
                                      <div className="flex flex-wrap gap-2">
                                        {booking.adults > 0 && <span className="bg-white px-2 py-1 rounded shadow-sm">👤 {booking.adults} adult</span>}
                                        {booking.children > 0 && <span className="bg-white px-2 py-1 rounded shadow-sm">🧒 {booking.children} child</span>}
                                        {booking.infants > 0 && <span className="bg-white px-2 py-1 rounded shadow-sm">🍼 {booking.infants} infant</span>}
                                        {booking.seniors > 0 && <span className="bg-white px-2 py-1 rounded shadow-sm">👴 {booking.seniors} senior</span>}
                                      </div>
                                    </div>
                                  </div>
                                  {overlap && <div className="mt-2 text-xs text-red-600">⚠️ Overlaps with an existing confirmed booking</div>}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}