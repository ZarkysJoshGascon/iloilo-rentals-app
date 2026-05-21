import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Calendar, MapPin, Users, ChevronRight, Clock, AlertCircle, CheckCircle, XCircle, X, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const navigate = useNavigate()
  const { formatPrice } = useCurrency()
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [currentCondoImages, setCurrentCondoImages] = useState([])
  const [currentCondoTitle, setCurrentCondoTitle] = useState('')

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      navigate('/login')
      return
    }
    setUser(user)
    fetchBookings(user.id)
  }

  async function fetchBookings(userId) {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          condos:condo_id (
            title,
            location,
            images,
            code
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setBookings(data || [])
    } catch (error) {
      console.error('Error fetching bookings:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusConfig = (status) => {
    switch (status) {
      case 'pending':
        return { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending Approval' }
      case 'confirmed':
        return { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Confirmed' }
      case 'cancelled':
        return { color: 'bg-red-100 text-red-800', icon: XCircle, text: 'Cancelled' }
      case 'completed':
        return { color: 'bg-blue-100 text-blue-800', icon: CheckCircle, text: 'Completed' }
      default:
        return { color: 'bg-gray-100 text-gray-800', icon: AlertCircle, text: status }
    }
  }

  const getCondoImage = (condo) => {
    if (!condo) return null
    if (condo.images && Array.isArray(condo.images) && condo.images.length > 0) {
      const firstImage = condo.images[0]
      if (firstImage && typeof firstImage === 'string' && firstImage.startsWith('http')) {
        return firstImage
      }
    }
    if (condo.code) {
      return `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_1.jpg`
    }
    return null
  }

  const getAllCondoImages = (condo) => {
    const images = []
    
    // Get from images array
    if (condo?.images && Array.isArray(condo.images)) {
      condo.images.forEach(img => {
        if (img && typeof img === 'string' && img.startsWith('http')) {
          images.push(img)
        }
      })
    }
    
    // Get from storage bucket using code
    if (condo?.code) {
      for (let i = 1; i <= 5; i++) {
        images.push(`https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_${i}.jpg`)
      }
    }
    
    // Filter out duplicates and invalid
    return [...new Set(images)].filter(img => img && img !== '')
  }

  const openImageModal = (condo, startIndex = 0) => {
    const allImages = getAllCondoImages(condo)
    if (allImages.length === 0) return
    setCurrentCondoImages(allImages)
    setCurrentCondoTitle(condo?.title || 'Condo Images')
    setCurrentImageIndex(startIndex)
    setModalOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeModal = () => {
    setModalOpen(false)
    document.body.style.overflow = 'unset'
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % currentCondoImages.length)
  }

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + currentCondoImages.length) % currentCondoImages.length)
  }

  const totalGuests = (booking) => {
    return (booking.adults || 0) + (booking.children || 0) + (booking.seniors || 0)
  }

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && modalOpen) {
        closeModal()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [modalOpen])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2d568e] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your bookings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-4">
        
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#2d568e] mb-2">My Bookings</h1>
          <p className="text-gray-500">View and manage your condo reservations</p>
        </div>

        {bookings.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">📅</div>
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">No Bookings Yet</h2>
            <p className="text-gray-500 mb-6">You haven't made any condo reservations yet.</p>
            <button 
              onClick={() => navigate('/condos')}
              className="bg-[#2d568e] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition"
            >
              Browse Condos
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const statusConfig = getStatusConfig(booking.status)
              const StatusIcon = statusConfig.icon
              const condo = booking.condos
              const imageUrl = getCondoImage(condo)
              
              return (
                <div key={booking.id} className="bg-white rounded-2xl shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    
                    {/* IMAGE - Clickable to open modal */}
                    <div 
                      className="md:w-48 md:min-h-full bg-gray-200 overflow-hidden cursor-pointer group relative"
                      onClick={() => openImageModal(condo, 0)}
                    >
                      {imageUrl ? (
                        <>
                          <img 
                            src={imageUrl}
                            alt={condo?.title || 'Condo'}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            style={{ 
                              objectFit: 'cover',
                              objectPosition: 'center',
                              width: '100%',
                              height: '100%',
                              minHeight: '200px'
                            }}
                            onError={(e) => {
                              e.target.onerror = null
                              e.target.src = 'https://placehold.co/400x600/2d568e/white?text=IMAGE+ERROR'
                            }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                              </svg>
                              View Gallery
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full min-h-[200px] bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] flex flex-col items-center justify-center text-white">
                          <div className="text-5xl mb-2">🏢</div>
                          <div className="text-sm font-semibold text-center px-2">{condo?.title?.slice(0, 20) || 'Condo'}</div>
                        </div>
                      )}
                    </div>
                    
                    {/* CONTENT */}
                    <div className="flex-1 p-6">
                      <div className="flex flex-wrap justify-between items-start gap-4">
                        <div>
                          <h2 className="text-xl font-bold text-gray-900 mb-1">
                            {condo?.title || 'Condo Unit'}
                          </h2>
                          <div className="flex items-center gap-1 text-gray-500 mb-3">
                            <MapPin size={16} />
                            <span className="text-sm">{condo?.location || 'Iloilo City'}</span>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1 ${statusConfig.color}`}>
                          <StatusIcon size={14} />
                          {statusConfig.text}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">CHECK-IN</div>
                          <div className="font-semibold text-sm">{format(new Date(booking.start_date), 'MMM dd, yyyy')}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">CHECK-OUT</div>
                          <div className="font-semibold text-sm">{format(new Date(booking.end_date), 'MMM dd, yyyy')}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">GUESTS</div>
                          <div className="font-semibold text-sm">{totalGuests(booking)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">TOTAL</div>
                          <div className="font-semibold text-[#2d568e] text-sm">{formatPrice(booking.total_amount || 0)}</div>
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-400 mb-3">
                        Booked on {format(new Date(booking.created_at), 'MMM dd, yyyy')}
                      </div>
                      
                      <button 
                        onClick={() => navigate(`/condo/${booking.condo_id}`)}
                        className="flex items-center gap-1 text-[#2d568e] hover:underline text-sm font-medium transition-colors"
                      >
                        View Property Details <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Image Modal - Fullscreen with blur background */}
      {modalOpen && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center"
          onClick={closeModal}
        >
          {/* Close Button */}
          <button 
            onClick={closeModal}
            className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2"
          >
            <X size={28} />
          </button>
          
          {/* Image Counter */}
          <div className="absolute top-4 left-4 z-10 text-white bg-black/50 px-3 py-1 rounded-full text-sm">
            {currentImageIndex + 1} / {currentCondoImages.length}
          </div>
          
          {/* Navigation Arrows */}
          {currentCondoImages.length > 1 && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                className="absolute left-4 z-10 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2 hover:bg-black/70"
              >
                <ChevronLeft size={40} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                className="absolute right-4 z-10 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2 hover:bg-black/70"
              >
                <ChevronRightIcon size={40} />
              </button>
            </>
          )}
          
          {/* Modal Title */}
          <div className="absolute bottom-4 left-0 right-0 text-center z-10 text-white bg-black/50 py-2 text-sm">
            {currentCondoTitle}
          </div>
          
          {/* Image */}
          <div 
            className="relative max-w-[90vw] max-h-[90vh] animate-in zoom-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={currentCondoImages[currentImageIndex]}
              alt={`${currentCondoTitle} ${currentImageIndex + 1}`}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onError={(e) => {
                e.target.src = 'https://placehold.co/800x600/2d568e/white?text=Image+Not+Found'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}