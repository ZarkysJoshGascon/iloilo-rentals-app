import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Calendar, Users, MapPin, Bed, Bath, Square, Wifi, Coffee, Car, Wind, Shield, X, Info, Clock, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import toast from 'react-hot-toast'
import { useCurrency } from '../context/CurrencyContext'
import DatePicker from 'react-datepicker'
import ImageGallery from '../components/ImageGallery'
import "react-datepicker/dist/react-datepicker.css"

// Helper function for images
const getCondoImages = (condoCode) => {
  if (!condoCode) return []
  const STORAGE_URL = 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/'
  return [
    `${STORAGE_URL}${condoCode}_1.jpg`,
    `${STORAGE_URL}${condoCode}_2.jpg`,
    `${STORAGE_URL}${condoCode}_3.jpg`,
    `${STORAGE_URL}${condoCode}_4.jpg`,
    `${STORAGE_URL}${condoCode}_5.jpg`
  ]
}

export default function CondoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { formatPrice } = useCurrency()
  const [condo, setCondo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  
  const [startDate, setStartDate] = useState(new Date())
  const [endDate, setEndDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  })
  
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [seniors, setSeniors] = useState(0)
  
  const ADULT_RATE = 1.0
  const CHILD_RATE = 0.9
  const INFANT_RATE = 0.8
  const SENIOR_RATE = 0.8
  
  const [promoCode, setPromoCode] = useState('')
  const [cancellationPolicy, setCancellationPolicy] = useState('moderate')
  const [showBookingForm, setShowBookingForm] = useState(false)
  const [showGuestDropdown, setShowGuestDropdown] = useState(false)
  const [guestInfo, setGuestInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  })
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  useEffect(() => {
    fetchCondoDetails()
    checkUser()
  }, [id])

  async function checkUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    } catch (err) {
      console.error('Auth error:', err)
    }
  }

  async function fetchCondoDetails() {
    try {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('condos')
        .select('*')
        .eq('id', id)
        .single()
      
      if (fetchError) throw fetchError
      if (!data) throw new Error('Condo not found')
      
      setCondo(data)
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Generate images safely
  const condoImages = condo?.code ? getCondoImages(condo.code) : []
  const allImages = condoImages.length > 0 ? condoImages : [condo?.images?.[0] || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200']
  
  const totalGuests = adults + children + seniors
  const nights = startDate && endDate ? differenceInDays(endDate, startDate) : 0
  const basePricePerNight = condo?.price_per_night || 0
  
  const calculateNightlyRate = () => {
    const adultTotal = adults * basePricePerNight * ADULT_RATE
    const childTotal = children * basePricePerNight * CHILD_RATE
    const infantTotal = infants * basePricePerNight * INFANT_RATE
    const seniorTotal = seniors * basePricePerNight * SENIOR_RATE
    return adultTotal + childTotal + infantTotal + seniorTotal
  }
  
  const effectiveNightlyRate = calculateNightlyRate()
  const subtotal = nights * effectiveNightlyRate
  const serviceFee = subtotal * 0.05
  const total = subtotal + serviceFee

  const getCancellationText = () => {
    if (cancellationPolicy === 'moderate') {
      return "Cancel up to 14 days before check-in for 50% refund"
    } else if (cancellationPolicy === 'free') {
      return "Cancel up to 14 days before check-in for 100% refund"
    } else {
      return "Non-refundable - charged total price"
    }
  }

  const handleBookNowClick = () => {
    if (!user) {
      toast.error('Please sign in to book this condo')
      navigate('/login')
      return
    }
    setShowBookingForm(true)
  }

  const handleBookNow = async () => {
    if (!acceptedTerms) {
      toast.error('Please accept the terms and conditions')
      return
    }
    
    try {
      const bookingData = {
        condo_id: id,
        user_id: user.id,
        guest_name: `${guestInfo.firstName} ${guestInfo.lastName}`,
        guest_email: guestInfo.email,
        guest_phone: guestInfo.phone,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        adults, children, infants, seniors,
        promo_code: promoCode,
        cancellation_policy: cancellationPolicy,
        subtotal, service_fee: serviceFee,
        total_amount: total,
        status: 'pending'
      }
      
      const { error: insertError } = await supabase.from('bookings').insert(bookingData)
      
      if (insertError) throw insertError
      
      toast.success('Booking submitted! We will contact you shortly.')
      setShowBookingForm(false)
    } catch (err) {
      console.error('Booking error:', err)
      toast.error('Booking failed. Please try again.')
    }
  }

  const getGuestDisplayText = () => {
    const parts = []
    if (adults > 0) parts.push(`${adults} Adult${adults > 1 ? 's' : ''}`)
    if (children > 0) parts.push(`${children} Child${children > 1 ? 'ren' : ''}`)
    if (infants > 0) parts.push(`${infants} Infant${infants > 1 ? 's' : ''}`)
    if (seniors > 0) parts.push(`${seniors} Senior${seniors > 1 ? 's' : ''}`)
    return parts.join(', ') || 'Select guests'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2d568e] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading condo details...</p>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ {error}</div>
          <button 
            onClick={() => navigate('/condos')}
            className="bg-[#2d568e] text-white px-6 py-2 rounded-lg hover:bg-[#1e3a5f]"
          >
            Back to Condos
          </button>
        </div>
      </div>
    )
  }
  
  if (!condo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Condo not found</p>
          <button 
            onClick={() => navigate('/condos')}
            className="bg-[#2d568e] text-white px-6 py-2 rounded-lg hover:bg-[#1e3a5f]"
          >
            Browse Condos
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col lg:flex-row">
        {/* Left Side - Wider */}
        <div className="lg:w-[60%] xl:w-[65%] overflow-y-auto" style={{ height: 'calc(100vh - 64px)' }}>
          
          {/* Image Gallery - Click to view fullscreen */}
          <ImageGallery images={allImages} title={condo.title} />

          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Title */}
            <div className="mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <img 
                  src="/Iloilo_rentals_img.png" 
                  alt="Iloilo Rentals Logo" 
                  className="w-16 h-16 md:w-20 md:h-20 object-contain mx-auto sm:mx-0"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                <div className="text-center sm:text-left">
                  <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                    <h1 className="text-2xl md:text-4xl font-bold text-gray-900">{condo.title}</h1>
                    {condo.code && (
                      <span className="bg-[#2d568e] text-white px-3 py-1 rounded-full text-sm font-semibold">
                        {condo.code}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 mt-1 justify-center sm:justify-start">
                    <MapPin size={18} />
                    <span>{condo.location}</span>
                  </div>
                  {condo.rating > 0 && (
                    <div className="flex items-center gap-1 mt-2 justify-center sm:justify-start">
                      <Star size={16} className="text-yellow-500 fill-yellow-500" />
                      <span className="font-semibold">{condo.rating}</span>
                      <span className="text-gray-500">({condo.reviews_count} reviews)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Bed className="text-[#2d568e] mb-2" size={20} />
                <p className="text-2xl font-bold">{condo.bedroom_count}</p>
                <p className="text-sm text-gray-500">Bedrooms</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Bath className="text-[#2d568e] mb-2" size={20} />
                <p className="text-2xl font-bold">{condo.bathroom_count}</p>
                <p className="text-sm text-gray-500">Bathrooms</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Users className="text-[#2d568e] mb-2" size={20} />
                <p className="text-2xl font-bold">{condo.max_guests}</p>
                <p className="text-sm text-gray-500">Max Guests</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Square className="text-[#2d568e] mb-2" size={20} />
                <p className="text-2xl font-bold">{condo.square_meters}</p>
                <p className="text-sm text-gray-500">Sq Meters</p>
              </div>
            </div>

            {/* Description */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">About This Condo</h2>
              <p className="text-gray-600 leading-relaxed">{condo.description}</p>
            </div>

            {/* Amenities */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Amenities</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {condo.amenities?.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                    {item === 'wifi' && <Wifi size={18} className="text-[#2d568e]" />}
                    {item === 'parking' && <Car size={18} className="text-[#2d568e]" />}
                    {item === 'air-conditioning' && <Wind size={18} className="text-[#2d568e]" />}
                    {item === 'washing machine' && <Coffee size={18} className="text-[#2d568e]" />}
                    {item === 'pool' && <span className="text-[#2d568e] text-lg">🏊</span>}
                    <span className="capitalize text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* House Rules */}
            <div className="mb-8 bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-xl font-semibold mb-4">House Rules</h2>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-gray-600"><Clock size={16} className="text-[#2d568e]" />Check-in: 3:00 PM</div>
                <div className="flex items-center gap-2 text-gray-600"><Clock size={16} className="text-[#2d568e]" />Check-out: 11:00 AM</div>
                <div className="flex items-center gap-2 text-gray-600"><CheckCircle size={16} className="text-green-500" />No smoking inside</div>
                <div className="flex items-center gap-2 text-gray-600"><CheckCircle size={16} className="text-green-500" />No pets allowed</div>
                <div className="flex items-center gap-2 text-gray-600"><AlertCircle size={16} className="text-amber-500" />No parties or events</div>
              </div>
            </div>

            {/* Cancellation Policies */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Cancellation Policies</h2>
              <div className="space-y-3">
                {['moderate', 'free', 'nonrefundable'].map((policy) => (
                  <div
                    key={policy}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      cancellationPolicy === policy 
                        ? 'border-[#2d568e] bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setCancellationPolicy(policy)}
                  >
                    <h3 className="font-semibold capitalize">
                      {policy === 'nonrefundable' ? 'Non-refundable' : policy === 'free' ? 'Free 14 Cancellation' : 'Moderate Cancellation'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {policy === 'moderate' && "Cancel up to 14 days before check-in for 50% refund"}
                      {policy === 'free' && "Cancel up to 14 days before check-in for 100% refund"}
                      {policy === 'nonrefundable' && "Pay total price now, no refunds"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">Location</h2>
              <div className="bg-gradient-to-br from-gray-100 to-gray-200 h-64 rounded-xl flex items-center justify-center">
                <MapPin size={32} className="text-gray-400" />
                <span className="ml-2 text-gray-500">{condo.location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Booking Sidebar - LARGER */}
        <div className="lg:w-[40%] xl:w-[35%] bg-white shadow-xl p-8" style={{ height: 'calc(100vh - 64px)', position: 'sticky', top: '64px', overflowY: 'auto' }}>
          <div className="space-y-6">
            {/* Price - Larger */}
            <div className="border-b pb-5">
              <div className="text-4xl font-bold text-[#2d568e]">
                {formatPrice(basePricePerNight)}<span className="text-base text-gray-500 font-normal"> / night</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">Base rate per adult</div>
            </div>
            
            {/* Dates - Larger */}
            <div>
              <label className="block text-base font-semibold mb-3 flex items-center gap-2">
                <Calendar size={20} className="text-[#2d568e]" /> Dates
              </label>
              <div className="border rounded-xl p-5 bg-gray-50">
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">CHECK-IN</div>
                  <DatePicker
                    selected={startDate}
                    onChange={(date) => setStartDate(date)}
                    selectsStart
                    startDate={startDate}
                    endDate={endDate}
                    minDate={new Date()}
                    dateFormat="MMM dd, yyyy"
                    className="w-full text-lg font-semibold cursor-pointer bg-transparent focus:outline-none"
                  />
                </div>
                <div className="border-t my-3"></div>
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">CHECK-OUT</div>
                  <DatePicker
                    selected={endDate}
                    onChange={(date) => setEndDate(date)}
                    selectsEnd
                    startDate={startDate}
                    endDate={endDate}
                    minDate={startDate || new Date()}
                    dateFormat="MMM dd, yyyy"
                    className="w-full text-lg font-semibold cursor-pointer bg-transparent focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Guests - Larger */}
            <div>
              <label className="block text-base font-semibold mb-3 flex items-center gap-2">
                <Users size={20} className="text-[#2d568e]" /> Guests
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowGuestDropdown(!showGuestDropdown)}
                  className="w-full border rounded-xl p-4 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition"
                >
                  <span className={totalGuests === 0 ? 'text-gray-400 text-base' : 'text-gray-800 text-base font-medium'}>
                    {getGuestDisplayText()}
                  </span>
                  <span className="text-gray-400 text-lg">▼</span>
                </button>
                
                {showGuestDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-xl shadow-xl z-20 p-5">
                    <div className="space-y-5">
                      {[
                        { label: 'Adults', value: adults, setter: setAdults, min: 1, discount: null },
                        { label: 'Children', value: children, setter: setChildren, min: 0, discount: '10% off' },
                        { label: 'Infants', value: infants, setter: setInfants, min: 0, discount: '20% off' },
                        { label: 'Senior Citizens', value: seniors, setter: setSeniors, min: 0, discount: '20% off' }
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between items-center">
                          <div>
                            <div className="font-semibold text-base">{item.label}</div>
                            {item.discount && <div className="text-xs text-green-600 mt-0.5">{item.discount}</div>}
                          </div>
                          <div className="flex items-center gap-5">
                            <button
                              onClick={() => item.setter(Math.max(item.min, item.value - 1))}
                              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-xl font-semibold"
                            >-</button>
                            <span className="w-8 text-center text-lg font-semibold">{item.value}</span>
                            <button
                              onClick={() => item.setter(item.value + 1)}
                              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-xl font-semibold"
                            >+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setShowGuestDropdown(false)} className="w-full mt-5 bg-[#2d568e] text-white py-3 rounded-xl font-semibold text-base">Apply</button>
                  </div>
                )}
              </div>
            </div>

            {/* Promo Code - Larger */}
            <div>
              <label className="block text-base font-semibold mb-3">Promo Code</label>
              <input
                type="text"
                placeholder="Enter code"
                className="w-full border rounded-xl p-4 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2d568e] text-base"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
              />
            </div>

            {/* Price Breakdown - Larger */}
            <div className="border-t pt-5">
              <div className="flex justify-between text-base mb-3">
                <span className="text-gray-600">Nightly rate (avg)</span>
                <span className="font-semibold text-lg">{formatPrice(effectiveNightlyRate)}</span>
              </div>
              <div className="flex justify-between text-base mb-3">
                <span className="text-gray-600">{formatPrice(effectiveNightlyRate)} × {nights} nights</span>
                <span className="text-base">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-base mb-3">
                <span className="text-gray-600">Service fee (5%)</span>
                <span className="text-base">{formatPrice(serviceFee)}</span>
              </div>
              <div className="flex justify-between font-bold text-xl pt-4 border-t mt-3">
                <span>Total</span>
                <span className="text-[#2d568e] text-2xl">{formatPrice(total)}</span>
              </div>
            </div>

            {/* Discount Info - Larger */}
            <div className="text-sm text-gray-500 bg-blue-50 p-4 rounded-xl flex items-start gap-2">
              <Info size={16} className="mt-0.5 flex-shrink-0 text-[#2d568e]" />
              <span>Children receive 10% off • Infants & Seniors receive 20% off</span>
            </div>

            {/* Cancellation Summary - Larger */}
            <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl flex items-start gap-2">
              <Shield size={16} className="mt-0.5 flex-shrink-0 text-[#2d568e]" />
              <span>{getCancellationText()}</span>
            </div>

            {/* Book Button - Larger */}
            <button
              onClick={handleBookNowClick}
              className="w-full bg-[#2d568e] text-white py-4 rounded-xl font-semibold text-lg hover:bg-[#1e3a5f] transition shadow-lg"
            >
              {user ? 'Reserve Now' : 'Sign in to Book'}
            </button>
          </div>
        </div>
      </div>

      {/* Booking Modal - Larger */}
      {showBookingForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBookingForm(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full mx-4 p-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Complete Booking</h2>
              <button onClick={() => setShowBookingForm(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} /></button>
            </div>
            
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="First Name" className="border rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[#2d568e]" value={guestInfo.firstName} onChange={(e) => setGuestInfo({...guestInfo, firstName: e.target.value})} />
                <input type="text" placeholder="Last Name" className="border rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[#2d568e]" value={guestInfo.lastName} onChange={(e) => setGuestInfo({...guestInfo, lastName: e.target.value})} />
              </div>
              <input type="email" placeholder="Email Address" className="w-full border rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[#2d568e]" value={guestInfo.email} onChange={(e) => setGuestInfo({...guestInfo, email: e.target.value})} />
              <input type="tel" placeholder="Phone Number" className="w-full border rounded-xl p-4 text-base focus:outline-none focus:ring-2 focus:ring-[#2d568e]" value={guestInfo.phone} onChange={(e) => setGuestInfo({...guestInfo, phone: e.target.value})} />
              
              <div className="bg-gray-50 p-5 rounded-xl">
                <p className="text-base font-semibold">Booking Summary</p>
                <p className="text-sm text-gray-600 mt-2">{format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')} • {nights} nights</p>
                <p className="text-sm text-gray-600">{getGuestDisplayText()}</p>
                <p className="text-xl font-bold mt-3 text-[#2d568e]">{formatPrice(total)}</p>
              </div>
              
              <div className="flex items-center gap-3">
                <input type="checkbox" id="terms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="w-5 h-5" />
                <label htmlFor="terms" className="text-sm">I agree to the terms and cancellation policy</label>
              </div>
              
              <button onClick={handleBookNow} className="w-full bg-[#2d568e] text-white py-4 rounded-xl font-semibold text-lg hover:bg-[#1e3a5f] transition">Confirm Booking</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}