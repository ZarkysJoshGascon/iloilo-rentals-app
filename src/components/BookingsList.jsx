import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { CheckCircle, Clock, XCircle, Calendar } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

export default function BookingsList({ filter = 'all' }) {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const { formatPrice } = useCurrency()

  useEffect(() => {
    fetchBookings()
  }, [filter])

  const fetchBookings = async () => {
    setLoading(true)
    let query = supabase
      .from('bookings')
      .select('*, condos:condo_id(title, code)')
      .order('created_at', { ascending: false })

    if (filter === 'pending') {
      query = query.eq('status', 'pending')
    } else if (filter === 'month') {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0,0,0,0)
      query = query.gte('start_date', startOfMonth.toISOString())
    } else if (filter === 'week') {
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      startOfWeek.setHours(0,0,0,0)
      query = query.gte('start_date', startOfWeek.toISOString())
    }

    const { data } = await query
    setBookings(data || [])
    setLoading(false)
  }

  const approveBooking = async (id) => {
    await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', id)
    fetchBookings()
  }

  const rejectBooking = async (id) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    fetchBookings()
  }

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending': return <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 flex items-center gap-1"><Clock size={12}/> Pending</span>
      case 'confirmed': return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 flex items-center gap-1"><CheckCircle size={12}/> Confirmed</span>
      case 'cancelled': return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800 flex items-center gap-1"><XCircle size={12}/> Cancelled</span>
      default: return <span className="px-2 py-1 rounded-full text-xs bg-gray-100">{status}</span>
    }
  }

  if (loading) return <div className="text-center py-8">Loading bookings...</div>

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto">
      {bookings.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No bookings found</div>
      ) : (
        bookings.map(booking => (
          <div key={booking.id} className="border rounded-lg p-3 hover:shadow-md transition">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{booking.guest_name || booking.guest_email?.split('@')[0]}</div>
                <div className="text-sm text-gray-600">{booking.condos?.title}</div>
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  <Calendar size={12} />
                  {format(new Date(booking.start_date), 'MMM dd')} - {format(new Date(booking.end_date), 'MMM dd, yyyy')}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Guests: {booking.adults} adults, {booking.children} children, {booking.infants} infants, {booking.seniors} seniors
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-[#2d568e]">{formatPrice(booking.total_amount)}</div>
                {getStatusBadge(booking.status)}
              </div>
            </div>
            {booking.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => approveBooking(booking.id)} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">Approve</button>
                <button onClick={() => rejectBooking(booking.id)} className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700">Reject</button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}