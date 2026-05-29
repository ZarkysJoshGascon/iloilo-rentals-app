import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Calendar, MapPin, Users, ChevronRight, Clock, AlertCircle, CheckCircle, XCircle, X, ChevronLeft, ChevronRight as ChevronRightIcon, Trash2 } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const navigate = useNavigate()
  const { formatPrice } = useCurrency()
  
  const [modalOpen, setModalOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentCondoImages, setCurrentCondoImages] = useState([])
  const [currentCondoTitle, setCurrentCondoTitle] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    setUser(user)
    fetchBookings(user.id)
  }

  async function fetchBookings(userId) {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, condos:condo_id (title, location, images, code)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setBookings(data || [])
    } catch (error) {
      console.error('Error fetching bookings:', error)
      toast.error('Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  const deleteBooking = async (bookingId) => {
    if (!confirm('Are you sure you want to DELETE this booking?')) return
    setDeletingId(bookingId)
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', bookingId).eq('user_id', user.id)
      if (error) throw error
      toast.success('Booking deleted successfully')
      setBookings(prev => prev.filter(booking => booking.id !== bookingId))
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Failed to delete booking')
    } finally {
      setDeletingId(null)
    }
  }

  const getStatusConfig = (status) => {
    switch (status) {
      case 'pending': return { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending Approval', canDelete: true }
      case 'confirmed': return { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Confirmed', canDelete: true }
      case 'cancelled': return { color: 'bg-red-100 text-red-800', icon: XCircle, text: 'Cancelled', canDelete: false }
      case 'completed': return { color: 'bg-blue-100 text-blue-800', icon: CheckCircle, text: 'Completed', canDelete: false }
      default: return { color: 'bg-gray-100 text-gray-800', icon: AlertCircle, text: status, canDelete: false }
    }
  }

  const getCondoImage = (condo) => {
    if (!condo) return null
    if (condo.images?.[0]) return condo.images[0]
    if (condo.code) return `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_1.jpg`
    return null
  }

  const totalGuests = (booking) => (booking.adults || 0) + (booking.children || 0) + (booking.seniors || 0)

  // Animation variants
  const pageVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { duration: 0.5 }
    }
  }

  const headerVariants = {
    hidden: { opacity: 0, y: -30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5 }
    }
  }

  const emptyStateVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { duration: 0.5, type: "spring", stiffness: 200 }
    }
  }

  const bookingCardVariants = {
    hidden: { opacity: 0, x: -30 },
    visible: (index) => ({ 
      opacity: 1, 
      x: 0,
      transition: { duration: 0.4, delay: index * 0.1 }
    }),
    hover: {
      scale: 1.01,
      boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
      transition: { duration: 0.2 }
    }
  }

  const deleteButtonVariants = {
    tap: { scale: 0.8 },
    hover: { scale: 1.1, color: "#dc2626" }
  }

  const viewDetailsVariants = {
    hover: { x: 5, color: "#1e3a5f" }
  }

  if (loading) {
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
          <p className="text-gray-600">Loading your bookings...</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div 
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-gray-50 py-6 md:py-12"
    >
      <div className="max-w-5xl mx-auto px-4">
        
        <motion.div 
          variants={headerVariants}
          className="mb-6 md:mb-8"
        >
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#2d568e] mb-2">My Bookings</h1>
          <p className="text-gray-500 text-sm md:text-base">View and manage your condo reservations</p>
        </motion.div>

        {bookings.length === 0 ? (
          <motion.div 
            variants={emptyStateVariants}
            initial="hidden"
            animate="visible"
            className="bg-white rounded-2xl shadow-lg p-8 md:p-12 text-center"
          >
            <motion.div 
              animate={{ 
                y: [0, -10, 0],
                transition: { repeat: Infinity, duration: 2, repeatDelay: 1 }
              }}
              className="text-5xl md:text-6xl mb-4"
            >
              📅
            </motion.div>
            <h2 className="text-xl md:text-2xl font-semibold text-gray-700 mb-2">No Bookings Yet</h2>
            <p className="text-gray-500 mb-6 text-sm md:text-base">You haven't made any condo reservations yet.</p>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/condos')} 
              className="bg-[#2d568e] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition-all"
            >
              Browse Condos
            </motion.button>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <AnimatePresence>
              {bookings.map((booking, index) => {
                const statusConfig = getStatusConfig(booking.status)
                const StatusIcon = statusConfig.icon
                const condo = booking.condos
                const imageUrl = getCondoImage(condo)
                
                return (
                  <motion.div 
                    key={booking.id}
                    variants={bookingCardVariants}
                    initial="hidden"
                    animate="visible"
                    whileHover="hover"
                    custom={index}
                    exit={{ opacity: 0, x: -100, transition: { duration: 0.3 } }}
                    className="bg-white rounded-2xl shadow-md overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row">
                      <motion.div 
                        whileHover={{ scale: 1.02 }}
                        className="sm:w-32 md:w-48 h-40 sm:h-auto bg-gray-200 cursor-pointer group relative overflow-hidden"
                      >
                        {imageUrl ? (
                          <motion.img 
                            whileHover={{ scale: 1.1 }}
                            transition={{ duration: 0.3 }}
                            src={imageUrl} 
                            alt={condo?.title} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex items-center justify-center text-white">
                            <motion.div 
                              animate={{ rotate: [0, 10, -10, 0] }}
                              transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
                              className="text-4xl"
                            >
                              🏢
                            </motion.div>
                          </div>
                        )}
                      </motion.div>
                      
                      <div className="flex-1 p-4 md:p-6">
                        <div className="flex flex-wrap justify-between items-start gap-3">
                          <div>
                            <motion.h2 
                              whileHover={{ x: 5 }}
                              className="text-lg md:text-xl font-bold text-gray-900 mb-1"
                            >
                              {condo?.title || 'Condo Unit'}
                            </motion.h2>
                            <div className="flex items-center gap-1 text-gray-500 mb-2">
                              <MapPin size={14} className="md:hidden" />
                              <MapPin size={16} className="hidden md:block" />
                              <span className="text-xs md:text-sm">{condo?.location || 'Iloilo City'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <motion.span 
                              whileHover={{ scale: 1.05 }}
                              className={`px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${statusConfig.color}`}
                            >
                              <StatusIcon size={12} />
                              {statusConfig.text}
                            </motion.span>
                            {statusConfig.canDelete && (
                              <motion.button 
                                variants={deleteButtonVariants}
                                whileTap="tap"
                                whileHover="hover"
                                onClick={() => deleteBooking(booking.id)} 
                                disabled={deletingId === booking.id} 
                                className="text-red-600 hover:text-red-800 p-1"
                              >
                                {deletingId === booking.id ? (
                                  <motion.div 
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 0.5, repeat: Infinity }}
                                    className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full"
                                  />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </motion.button>
                            )}
                          </div>
                        </div>
                        
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.1 + index * 0.05 }}
                          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-3 md:mb-4"
                        >
                          <motion.div whileHover={{ y: -2 }} className="bg-gray-50 p-2 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">CHECK-IN</div>
                            <div className="font-semibold text-xs md:text-sm">{format(new Date(booking.start_date), 'MMM dd, yyyy')}</div>
                          </motion.div>
                          <motion.div whileHover={{ y: -2 }} className="bg-gray-50 p-2 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">CHECK-OUT</div>
                            <div className="font-semibold text-xs md:text-sm">{format(new Date(booking.end_date), 'MMM dd, yyyy')}</div>
                          </motion.div>
                          <motion.div whileHover={{ y: -2 }} className="bg-gray-50 p-2 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">GUESTS</div>
                            <div className="font-semibold text-xs md:text-sm">{totalGuests(booking)}</div>
                          </motion.div>
                          <motion.div whileHover={{ y: -2 }} className="bg-gray-50 p-2 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">TOTAL</div>
                            <motion.div 
                              whileHover={{ scale: 1.05 }}
                              className="font-semibold text-[#2d568e] text-xs md:text-sm"
                            >
                              {formatPrice(booking.total_amount || 0)}
                            </motion.div>
                          </motion.div>
                        </motion.div>
                        
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2 + index * 0.05 }}
                          className="text-xs text-gray-400 mb-2 md:mb-3"
                        >
                          Booked on {format(new Date(booking.created_at), 'MMM dd, yyyy')}
                        </motion.div>
                        
                        <motion.button 
                          variants={viewDetailsVariants}
                          whileHover="hover"
                          onClick={() => navigate(`/condo/${booking.condo_id}`)} 
                          className="flex items-center gap-1 text-[#2d568e] hover:underline text-xs md:text-sm"
                        >
                          View Property Details 
                          <ChevronRight size={14} className="transition-transform group-hover:translate-x-1" />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}