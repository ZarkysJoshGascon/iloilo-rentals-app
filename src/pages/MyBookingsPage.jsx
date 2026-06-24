import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { MapPin, ChevronRight, Clock, CheckCircle, XCircle, Ban, Calendar, ArrowRight } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { getCondoImage } from '../utils/condoImages'

function SkeletonBookingCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-48 h-48 sm:h-auto bg-gray-200" />
        <div className="flex-1 p-5 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-40" />
              <div className="h-4 bg-gray-200 rounded w-24" />
            </div>
            <div className="h-6 bg-gray-200 rounded w-20" />
          </div>
          <div className="h-3 bg-gray-200 rounded w-32" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 bg-gray-100 rounded-xl" />
            <div className="h-16 bg-gray-100 rounded-xl" />
            <div className="h-16 bg-gray-100 rounded-xl" />
          </div>
          <div className="flex justify-between pt-3 border-t border-gray-100">
            <div className="h-3 bg-gray-200 rounded w-24" />
            <div className="flex gap-3">
              <div className="h-7 bg-gray-200 rounded w-16" />
              <div className="h-7 bg-gray-200 rounded w-16" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { formatPrice } = useCurrency()
  const [cancellingId, setCancellingId] = useState(null)
  const [activeTab, setActiveTab] = useState('all')

  const fetchBookings = async (userId) => {
    try {
      const { data, error } = await supabase.from('bookings').select('*, condos:condo_id (title, location, images, code)').eq('user_id', userId).order('created_at', { ascending: false })
      if (error) throw error
      setBookings(data || [])
    } catch (error) { toast.error('Failed to load bookings') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (!authLoading && !user) { navigate('/login'); return } if (user) fetchBookings(user.id) }, [authLoading, user, navigate])

  const cancelBooking = async (bookingId) => {
    if (!confirm('Cancel this booking?')) return
    setCancellingId(bookingId)
    try {
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId).eq('user_id', user.id)
      if (error) throw error
      toast.success('Booking cancelled')
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b))
    } catch { toast.error('Failed to cancel') }
    finally { setCancellingId(null) }
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pending': return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Clock, label: 'Pending' }
      case 'confirmed': return { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: CheckCircle, label: 'Confirmed' }
      case 'cancelled': return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: XCircle, label: 'Cancelled' }
      default: return { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', icon: Clock, label: status }
    }
  }

  const filteredBookings = activeTab === 'all' ? bookings : bookings.filter(b => b.status === activeTab)
  const tabs = [{ id: 'all', label: 'All' },{ id: 'pending', label: 'Pending' },{ id: 'confirmed', label: 'Confirmed' },{ id: 'cancelled', label: 'Cancelled' }]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 bg-[#2d568e]/10 rounded-xl flex items-center justify-center"><Calendar size={20} className="text-[#2d568e]" /></div><div><h1 className="text-2xl font-bold text-[#2d568e]">My Bookings</h1><p className="text-gray-500 text-sm">Manage your reservations</p></div></div>
          <div className="flex gap-2 bg-white rounded-xl p-1.5 border border-gray-100 shadow-sm w-fit">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-[#2d568e] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab.label}{tab.id !== 'all' && <span className="ml-1.5 text-xs opacity-70">{bookings.filter(b => b.status === tab.id).length}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Skeleton loading */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <SkeletonBookingCard key={i} />)}
          </div>
        )}

        {!loading && filteredBookings.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-[#2d568e]/5 rounded-2xl flex items-center justify-center mx-auto mb-4"><Calendar size={28} className="text-[#2d568e]/40" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">No bookings found</h3>
            <p className="text-gray-500 text-sm mb-6">{activeTab === 'all' ? "You haven't made any reservations yet." : `No ${activeTab} bookings.`}</p>
            <button onClick={() => navigate('/condos')} className="bg-[#2d568e] text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-[#1e3a5f] transition inline-flex items-center gap-2">Browse Condos <ArrowRight size={16} /></button>
          </div>
        )}

        {!loading && filteredBookings.length > 0 && (
          <div className="space-y-4"><AnimatePresence>{filteredBookings.map((booking, idx) => {
            const statusStyle = getStatusStyle(booking.status); const StatusIcon = statusStyle.icon; const condo = booking.condos; const imageUrl = getCondoImage(condo); const nights = Math.ceil((new Date(booking.end_date) - new Date(booking.start_date)) / (1000 * 60 * 60 * 24))
            return (
              <motion.div key={booking.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group">
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-48 h-48 sm:h-auto relative overflow-hidden bg-gray-100">{imageUrl ? <img src={imageUrl} alt={condo?.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full bg-gradient-to-br from-[#2d568e]/20 to-[#1e3a5f]/20 flex items-center justify-center"><Calendar size={32} className="text-[#2d568e]/40" /></div>}<div className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle.bg} ${statusStyle.text} flex items-center gap-1 backdrop-blur-sm`}><StatusIcon size={12} />{statusStyle.label}</div></div>
                  <div className="flex-1 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2"><div><h3 className="font-semibold text-gray-900">{condo?.title || 'Condo Unit'}</h3><div className="flex items-center gap-1 text-gray-500 text-sm mt-0.5"><MapPin size={13} /><span>{condo?.location || 'Iloilo City'}</span></div></div><span className="text-lg font-bold text-[#2d568e]">{formatPrice(booking.total_amount || 0)}</span></div>
                      <p className="text-xs text-gray-400 font-mono mb-3">#{booking.booking_code || 'N/A'}</p>
                      <div className="grid grid-cols-3 gap-3 mb-3"><div className="bg-gray-50 rounded-xl p-2.5 text-center"><p className="text-xs text-gray-400 mb-0.5">Check-in</p><p className="text-sm font-semibold text-gray-800">{format(new Date(booking.start_date), 'MMM dd')}</p></div><div className="bg-gray-50 rounded-xl p-2.5 text-center"><p className="text-xs text-gray-400 mb-0.5">Check-out</p><p className="text-sm font-semibold text-gray-800">{format(new Date(booking.end_date), 'MMM dd')}</p></div><div className="bg-gray-50 rounded-xl p-2.5 text-center"><p className="text-xs text-gray-400 mb-0.5">Nights</p><p className="text-sm font-semibold text-gray-800">{nights}</p></div></div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <span className="text-xs text-gray-400">Booked {format(new Date(booking.created_at), 'MMM dd, yyyy')}</span>
                      <div className="flex items-center gap-3">
                        {(booking.status === 'pending' || booking.status === 'confirmed') && <button onClick={() => cancelBooking(booking.id)} disabled={cancellingId === booking.id} className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">{cancellingId === booking.id ? <span className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <Ban size={12} />}Cancel</button>}
                        <button onClick={() => navigate(`/condo/${booking.condo_id}`)} className="text-xs text-[#2d568e] hover:text-[#1e3a5f] font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-[#2d568e]/5 transition-colors">View Details <ChevronRight size={12} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}</AnimatePresence></div>
        )}
      </div>
    </motion.div>
  )
}