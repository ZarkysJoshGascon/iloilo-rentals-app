import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Calendar, Users, MapPin, Bed, Bath, Square, Wifi, Coffee, Car, Wind, Shield, X, Info, Clock, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Star, CreditCard, Tag, Users as UsersIcon, Calendar as CalendarIcon, Check, ChevronDown } from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import toast from 'react-hot-toast'
import { useCurrency } from '../context/CurrencyContext'
import DatePicker from 'react-datepicker'
import ImageGallery from '../components/ImageGallery'
import "react-datepicker/dist/react-datepicker.css"

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

// Custom styles for DatePicker
const customDatePickerStyles = `
  .react-datepicker {
    font-family: inherit;
    border-radius: 1rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }
  .react-datepicker__header {
    background-color: #2d568e;
    border-bottom: none;
    padding: 1rem;
  }
  .react-datepicker__current-month {
    color: white;
    font-weight: 600;
    font-size: 1rem;
  }
  .react-datepicker__day-name {
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }
  .react-datepicker__day {
    color: #374151;
    border-radius: 0.5rem;
    transition: all 0.2s;
  }
  .react-datepicker__day:hover {
    background-color: #2d568e !important;
    color: white !important;
  }
  .react-datepicker__day--selected {
    background-color: #2d568e !important;
    color: white !important;
    font-weight: bold;
  }
  .react-datepicker__day--in-range {
    background-color: rgba(45, 86, 142, 0.2) !important;
    color: #2d568e !important;
  }
  .react-datepicker__day--in-selecting-range {
    background-color: rgba(45, 86, 142, 0.3) !important;
  }
  .react-datepicker__day--keyboard-selected {
    background-color: #2d568e !important;
    color: white !important;
  }
  .react-datepicker__navigation-icon::before {
    border-color: white !important;
  }
  .react-datepicker__navigation:hover *::before {
    border-color: #f59e0b !important;
  }
  .react-datepicker__triangle {
    display: none;
  }
`

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
    phone: ''
  })
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [promoApplied, setPromoApplied] = useState(false)
  const [promoDiscount, setPromoDiscount] = useState(0)

  // Hide body scroll, only left side scrolls
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    // Inject custom date picker styles
    const styleElement = document.createElement('style')
    styleElement.innerHTML = customDatePickerStyles
    document.head.appendChild(styleElement)
    return () => {
      document.body.style.overflow = 'auto'
      document.head.removeChild(styleElement)
    }
  }, [])

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
  let subtotal = nights * effectiveNightlyRate
  let serviceFee = subtotal * 0.05
  let total = subtotal + serviceFee

  const applyPromo = () => {
    if (promoCode.toLowerCase() === 'welcome10') {
      setPromoDiscount(total * 0.1)
      setPromoApplied(true)
      toast.success('Promo code applied! 10% discount')
    } else if (promoCode.toLowerCase() === 'stay5') {
      setPromoDiscount(500)
      setPromoApplied(true)
      toast.success('Promo code applied! ₱500 off')
    } else {
      toast.error('Invalid promo code')
    }
  }

  const finalTotal = total - promoDiscount

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
    
    if (!guestInfo.firstName || !guestInfo.lastName) {
      toast.error('Please enter your first and last name')
      return
    }
    
    try {
      const bookingData = {
        condo_id: id,
        user_id: user.id,
        guest_name: `${guestInfo.firstName} ${guestInfo.lastName}`,
        guest_email: user.email,
        guest_phone: guestInfo.phone,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        adults, children, infants, seniors,
        promo_code: promoApplied ? promoCode : null,
        promo_discount: promoDiscount,
        cancellation_policy: cancellationPolicy,
        subtotal, service_fee: serviceFee,
        total_amount: finalTotal,
        status: 'pending'
      }
      
      const { error: insertError } = await supabase.from('bookings').insert(bookingData)
      
      if (insertError) throw insertError
      
      toast.success('Booking submitted! We will contact you shortly.')
      setShowBookingForm(false)
      setGuestInfo({ firstName: '', lastName: '', phone: '' })
      setAcceptedTerms(false)
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
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }
  
  if (error || !condo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Condo not found</p>
          <button onClick={() => navigate('/condos')} className="bg-[#2d568e] text-white px-6 py-2 rounded-lg mt-4">Back to Condos</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      
      {/* LEFT SIDE - SCROLLABLE */}
      <div className="w-2/3 overflow-y-auto h-full">
        <ImageGallery images={allImages} title={condo.title} />
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{condo.title}</h1>
            {condo.code && <span className="bg-[#2d568e] text-white px-3 py-1 rounded-full text-sm">{condo.code}</span>}
          </div>
          <div className="flex items-center gap-2 text-gray-500 mb-6"><MapPin size={18} /><span>{condo.location}</span></div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all"><Bed className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.bedroom_count}</p><p className="text-sm text-gray-500">Bedrooms</p></div>
            <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all"><Bath className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.bathroom_count}</p><p className="text-sm text-gray-500">Bathrooms</p></div>
            <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all"><Users className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.max_guests}</p><p className="text-sm text-gray-500">Max Guests</p></div>
            <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all"><Square className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.square_meters}</p><p className="text-sm text-gray-500">Sq Meters</p></div>
          </div>

          <div className="mb-8"><h2 className="text-xl font-semibold mb-3">About This Condo</h2><p className="text-gray-600">{condo.description}</p></div>
          
          <div className="mb-8"><h2 className="text-xl font-semibold mb-4">Amenities</h2><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{condo.amenities?.map((item, i) => (<div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border hover:border-[#2d568e] hover:shadow-sm transition-all"><span className="capitalize text-gray-700">{item}</span></div>))}</div></div>
          
          <div className="mb-8 bg-white rounded-xl p-6 shadow-sm"><h2 className="text-xl font-semibold mb-4">House Rules</h2><div className="grid md:grid-cols-2 gap-3"><div className="flex items-center gap-2 text-gray-600"><Clock size={16} className="text-[#2d568e]" />Check-in: 3:00 PM</div><div className="flex items-center gap-2 text-gray-600"><Clock size={16} className="text-[#2d568e]" />Check-out: 11:00 AM</div><div className="flex items-center gap-2 text-gray-600"><CheckCircle size={16} className="text-green-500" />No smoking</div><div className="flex items-center gap-2 text-gray-600"><CheckCircle size={16} className="text-green-500" />No pets</div><div className="flex items-center gap-2 text-gray-600"><AlertCircle size={16} className="text-amber-500" />No parties</div></div></div>
          
          <div className="mb-8"><h2 className="text-xl font-semibold mb-4">Cancellation Policies</h2><div className="space-y-3">{['moderate', 'free', 'nonrefundable'].map((policy) => (<div key={policy} className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${cancellationPolicy === policy ? 'border-[#2d568e] bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`} onClick={() => setCancellationPolicy(policy)}><div className="flex items-center justify-between"><h3 className="font-semibold capitalize">{policy === 'nonrefundable' ? 'Non-refundable' : policy === 'free' ? 'Free 14 Cancellation' : 'Moderate Cancellation'}</h3>{cancellationPolicy === policy && <Check size={18} className="text-[#2d568e]" />}</div><p className="text-sm text-gray-600 mt-1">{policy === 'moderate' && "Cancel up to 14 days before check-in for 50% refund"}{policy === 'free' && "Cancel up to 14 days before check-in for 100% refund"}{policy === 'nonrefundable' && "Pay total price now, no refunds"}</p></div>))}</div></div>
          
          <div className="mb-8"><h2 className="text-xl font-semibold mb-3">Location</h2><div className="bg-gradient-to-br from-gray-100 to-gray-200 h-64 rounded-xl flex items-center justify-center"><MapPin size={32} className="text-gray-400" /><span className="ml-2 text-gray-500">{condo.location}</span></div></div>
        </div>
      </div>

      {/* RIGHT SIDE - MODERN BOOKING SIDEBAR */}
      <div className="w-1/3 bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
        
        <div className="p-6 space-y-5">
          {/* Price Header */}
          <div className="text-center pb-4 border-b border-gray-100">
            <div className="text-4xl font-bold text-[#2d568e]">
              {formatPrice(basePricePerNight)}
              <span className="text-sm text-gray-400 font-normal"> / night</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Base rate per adult</p>
          </div>
          
          {/* Date Selection - Enhanced with Theme Colors */}
          <div className="grid grid-cols-2 gap-3">
            {/* Check-in Card */}
            <div className="bg-gradient-to-br from-[#2d568e]/5 to-white rounded-xl p-3 hover:from-[#2d568e]/10 transition-all cursor-pointer border border-[#2d568e]/20 group">
              <div className="text-xs text-[#2d568e] font-semibold mb-1 flex items-center gap-1">
                <CalendarIcon size={12} /> CHECK-IN
              </div>
              <DatePicker 
                selected={startDate} 
                onChange={(date) => setStartDate(date)} 
                minDate={new Date()} 
                dateFormat="MMM dd, yyyy" 
                className="w-full text-center font-bold bg-transparent cursor-pointer text-gray-800 text-base"
              />
            </div>
            {/* Check-out Card */}
            <div className="bg-gradient-to-br from-[#2d568e]/5 to-white rounded-xl p-3 hover:from-[#2d568e]/10 transition-all cursor-pointer border border-[#2d568e]/20 group">
              <div className="text-xs text-[#2d568e] font-semibold mb-1 flex items-center gap-1">
                <CalendarIcon size={12} /> CHECK-OUT
              </div>
              <DatePicker 
                selected={endDate} 
                onChange={(date) => setEndDate(date)} 
                minDate={startDate} 
                dateFormat="MMM dd, yyyy" 
                className="w-full text-center font-bold bg-transparent cursor-pointer text-gray-800 text-base"
              />
            </div>
          </div>

          {/* Guest counter display */}
          <div className="flex items-center justify-between text-sm text-gray-500 px-1">
            <span>Total nights: <strong className="text-[#2d568e]">{nights}</strong></span>
            <span>Total guests: <strong className="text-[#2d568e]">{totalGuests}</strong></span>
          </div>

          {/* Guests Selection - Modern Dropdown */}
          <div className="relative">
            <button onClick={() => setShowGuestDropdown(!showGuestDropdown)} className="w-full bg-gradient-to-r from-gray-50 to-white rounded-xl p-3 text-left flex justify-between items-center hover:from-gray-100 transition-all border border-gray-200 group">
              <div><div className="text-xs text-[#2d568e] font-semibold mb-1">GUESTS</div><span className="font-medium">{getGuestDisplayText()}</span></div>
              <ChevronDown size={18} className={`text-[#2d568e] transition-transform duration-300 ${showGuestDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showGuestDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-xl z-20 p-4 space-y-3 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition-all"><span className="font-medium">Adults</span><div className="flex gap-4 items-center"><button onClick={() => setAdults(Math.max(1, adults-1))} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">-</button><span className="w-8 text-center font-semibold">{adults}</span><button onClick={() => setAdults(adults+1)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">+</button></div></div>
                <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition-all"><span className="font-medium">Children <span className="text-xs text-green-600">(10% off)</span></span><div className="flex gap-4 items-center"><button onClick={() => setChildren(Math.max(0, children-1))} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">-</button><span className="w-8 text-center font-semibold">{children}</span><button onClick={() => setChildren(children+1)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">+</button></div></div>
                <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition-all"><span className="font-medium">Infants <span className="text-xs text-green-600">(20% off)</span></span><div className="flex gap-4 items-center"><button onClick={() => setInfants(Math.max(0, infants-1))} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">-</button><span className="w-8 text-center font-semibold">{infants}</span><button onClick={() => setInfants(infants+1)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">+</button></div></div>
                <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg transition-all"><span className="font-medium">Seniors <span className="text-xs text-green-600">(20% off)</span></span><div className="flex gap-4 items-center"><button onClick={() => setSeniors(Math.max(0, seniors-1))} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">-</button><span className="w-8 text-center font-semibold">{seniors}</span><button onClick={() => setSeniors(seniors+1)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#2d568e] hover:text-white transition-all text-lg">+</button></div></div>
                <button onClick={() => setShowGuestDropdown(false)} className="w-full bg-[#2d568e] text-white py-2 rounded-lg mt-2 hover:bg-[#1e3a5f] transition-all">Apply</button>
              </div>
            )}
          </div>

          {/* Promo Code - Modern Input */}
          <div className="flex gap-2">
            <input type="text" placeholder="Promo Code" className="flex-1 bg-gray-50 rounded-xl p-3 border border-gray-200 focus:border-[#2d568e] focus:bg-white focus:outline-none transition-all" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
            <button onClick={applyPromo} className="px-5 bg-gradient-to-r from-gray-100 to-white rounded-xl font-medium hover:from-[#2d568e] hover:to-[#1e3a5f] hover:text-white transition-all border border-gray-200">Apply</button>
          </div>

          {/* Price Breakdown - Modern Cards */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex justify-between text-gray-600"><span>Nightly rate (avg)</span><span className="font-semibold">{formatPrice(effectiveNightlyRate)}</span></div>
            <div className="flex justify-between text-gray-600"><span>{formatPrice(effectiveNightlyRate)} × {nights} nights</span><span>{formatPrice(subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Service fee (5%)</span><span>{formatPrice(serviceFee)}</span></div>
            {promoApplied && (
              <div className="flex justify-between text-green-600 bg-green-50 p-2 rounded-lg"><span>Promo discount</span><span>- {formatPrice(promoDiscount)}</span></div>
            )}
            <div className="flex justify-between font-bold text-xl pt-3 border-t border-gray-200 mt-2"><span>Total</span><span className="text-[#2d568e]">{formatPrice(finalTotal)}</span></div>
          </div>

          {/* Night count badge */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-[#2d568e]"></span>
            {nights} night{nights !== 1 ? 's' : ''} stay
          </div>

          {/* Discount Badge */}
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 p-3 rounded-lg">
            <Info size={14} className="text-[#2d568e]" />
            <span>Children 10% off • Infants & Seniors 20% off</span>
          </div>
          
          {/* Cancellation Badge */}
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
            <Shield size={14} className="text-[#2d568e]" />
            <span>{getCancellationText()}</span>
          </div>

          {/* Book Button - Modern with hover effect */}
          <button onClick={handleBookNowClick} className="w-full bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-3.5 rounded-xl font-semibold text-lg hover:from-[#1e3a5f] hover:to-[#0f2a4a] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl mt-2">
            {user ? 'Reserve Now' : 'Sign in to Book'}
          </button>
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setShowBookingForm(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold">Complete Booking</h2><button onClick={() => setShowBookingForm(false)} className="hover:bg-gray-100 p-2 rounded-full transition-all"><X size={24} /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3"><input type="text" placeholder="First Name" className="border rounded-xl p-3 focus:border-[#2d568e] focus:outline-none transition-all" value={guestInfo.firstName} onChange={(e) => setGuestInfo({...guestInfo, firstName: e.target.value})} /><input type="text" placeholder="Last Name" className="border rounded-xl p-3 focus:border-[#2d568e] focus:outline-none transition-all" value={guestInfo.lastName} onChange={(e) => setGuestInfo({...guestInfo, lastName: e.target.value})} /></div>
              <div className="bg-gray-50 rounded-xl p-3"><div className="text-xs text-gray-500">Email (from your account)</div><div className="font-medium">{user?.email}</div></div>
              <input type="tel" placeholder="Phone Number" className="border rounded-xl p-3 focus:border-[#2d568e] focus:outline-none transition-all" value={guestInfo.phone} onChange={(e) => setGuestInfo({...guestInfo, phone: e.target.value})} />
              <div className="bg-gray-50 p-4 rounded-xl"><p className="font-semibold">Booking Summary</p><p className="text-sm mt-1">{format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')} • {nights} nights</p><p>{getGuestDisplayText()}</p><p className="text-xl font-bold mt-2 text-[#2d568e]">{formatPrice(finalTotal)}</p></div>
              <div className="flex items-center gap-2"><input type="checkbox" id="terms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="w-4 h-4" /><label htmlFor="terms" className="text-sm">I agree to the terms and cancellation policy</label></div>
              <button onClick={handleBookNow} className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition-all">Confirm Booking</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}