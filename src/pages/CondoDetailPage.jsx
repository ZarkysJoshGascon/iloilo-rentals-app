import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Calendar, Users, MapPin, Bed, Bath, Square, Wifi, Coffee, Car, Wind, Shield, X, Info, Clock, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Star, Calendar as CalendarIcon, Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
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

const customDatePickerStyles = `
  .react-datepicker-popper {
    z-index: 100 !important;
    position: absolute !important;
  }
  .react-datepicker {
    font-family: inherit;
    border-radius: 1rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
    overflow: hidden;
    background: white;
  }
  .react-datepicker-wrapper {
    display: block;
    width: 100%;
  }
  .react-datepicker__input-container {
    display: block;
    width: 100%;
  }
  .react-datepicker__header {
    background-color: #2d568e;
    border-bottom: none;
    padding: 0.75rem;
  }
  .react-datepicker__current-month {
    color: white;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .react-datepicker__day-name {
    color: rgba(255,255,255,0.8);
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
    background-color: rgba(45,86,142,0.2) !important;
    color: #2d568e !important;
  }
  .react-datepicker__navigation-icon::before {
    border-color: white !important;
  }
  .react-datepicker__triangle {
    display: none;
  }
  
  .scrollable-content::-webkit-scrollbar {
    width: 6px;
  }
  .scrollable-content::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }
  .scrollable-content::-webkit-scrollbar-thumb {
    background: #2d568e;
    border-radius: 4px;
  }
`

const ExpandableSection = ({ title, icon: Icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl mb-3 overflow-hidden bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-all"
      >
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-[#2d568e]" />
          <span className="font-semibold text-gray-800">{title}</span>
        </div>
        {isOpen ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
      </button>
      {isOpen && <div className="p-4 border-t border-gray-100">{children}</div>}
    </div>
  )
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
  const [guestInfo, setGuestInfo] = useState({ firstName: '', lastName: '', phone: '' })
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [promoApplied, setPromoApplied] = useState(false)
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [termsError, setTermsError] = useState(false)
  
  const [validationErrors, setValidationErrors] = useState({
    firstName: '',
    lastName: '',
    phone: ''
  })

  const validateName = (name, fieldName) => {
    if (!name || !name.trim()) {
      return `${fieldName} is required`
    }
    if (name.length < 2) {
      return `${fieldName} must be at least 2 characters`
    }
    if (/[0-9]/.test(name)) {
      return `${fieldName} cannot contain numbers`
    }
    return ''
  }

  const validatePhilippinePhone = (phone) => {
    if (!phone || !phone.trim()) {
      return 'Phone number is required'
    }
    
    let cleaned = phone.replace(/[\s\-\(\)]/g, '')
    
    let isValid = false
    let displayError = 'Enter a valid Philippine mobile number (e.g., 09123456789 or +639123456789)'
    
    if (cleaned.startsWith('+63')) {
      const numberPart = cleaned.substring(1)
      if (numberPart.length === 12 && numberPart.startsWith('63')) {
        isValid = true
      }
    }
    else if (cleaned.startsWith('09') && cleaned.length === 11) {
      isValid = true
    }
    else if (cleaned.startsWith('63') && cleaned.length === 12) {
      isValid = true
    }
    else if (cleaned.length === 10 && /^\d{10}$/.test(cleaned)) {
      displayError = 'Please include "09" at the beginning (e.g., 09' + cleaned + ')'
    }
    
    if (!isValid) {
      return displayError
    }
    
    return ''
  }

  const handleGuestInfoChange = (field, value) => {
    setGuestInfo(prev => ({ ...prev, [field]: value }))
    setTermsError(false)
    
    let error = ''
    if (field === 'firstName') {
      error = validateName(value, 'First name')
    } else if (field === 'lastName') {
      error = validateName(value, 'Last name')
    } else if (field === 'phone') {
      error = validatePhilippinePhone(value)
    }
    
    setValidationErrors(prev => ({ ...prev, [field]: error }))
  }

  useEffect(() => {
    if (showBookingForm) {
      document.body.classList.add('modal-open')
    } else {
      document.body.classList.remove('modal-open')
    }
    return () => {
      document.body.classList.remove('modal-open')
    }
  }, [showBookingForm])

  useEffect(() => {
    const styleElement = document.createElement('style')
    styleElement.innerHTML = customDatePickerStyles
    document.head.appendChild(styleElement)
    return () => {
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
    } catch (err) { console.error('Auth error:', err) }
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
      toast.success('10% discount applied!')
    } else if (promoCode.toLowerCase() === 'stay5') {
      setPromoDiscount(500)
      setPromoApplied(true)
      toast.success('₱500 discount applied!')
    } else {
      toast.error('Invalid promo code')
    }
  }

  const finalTotal = total - promoDiscount

  const getCancellationText = () => {
    if (cancellationPolicy === 'moderate') return "Cancel 14 days before for 50% refund"
    if (cancellationPolicy === 'free') return "Cancel 14 days before for 100% refund"
    return "Non-refundable"
  }

  const handleBookNowClick = () => {
    if (!user) {
      toast.error('Please sign in to book')
      navigate('/login')
      return
    }
    setShowBookingForm(true)
  }

  const handleBookNow = async () => {
    const firstNameError = validateName(guestInfo.firstName, 'First name')
    const lastNameError = validateName(guestInfo.lastName, 'Last name')
    const phoneError = validatePhilippinePhone(guestInfo.phone)
    
    setValidationErrors({
      firstName: firstNameError,
      lastName: lastNameError,
      phone: phoneError
    })
    
    if (!acceptedTerms) {
      setTermsError(true)
      toast.error('Please accept the Terms & Conditions')
      return
    }
    
    if (firstNameError || lastNameError || phoneError) {
      toast.error('Please fix the errors in the form')
      return
    }
    
    try {
      const bookingData = {
        condo_id: id, user_id: user.id,
        guest_name: `${guestInfo.firstName} ${guestInfo.lastName}`,
        guest_email: user.email, guest_phone: guestInfo.phone,
        start_date: format(startDate, 'yyyy-MM-dd'), end_date: format(endDate, 'yyyy-MM-dd'),
        adults, children, infants, seniors,
        promo_code: promoApplied ? promoCode : null,
        promo_discount: promoDiscount, cancellation_policy: cancellationPolicy,
        subtotal, service_fee: serviceFee, total_amount: finalTotal, status: 'pending'
      }
      const { error: insertError } = await supabase.from('bookings').insert(bookingData)
      if (insertError) throw insertError
      toast.success('Reservation submitted!')
      setShowBookingForm(false)
      setGuestInfo({ firstName: '', lastName: '', phone: '' })
      setValidationErrors({ firstName: '', lastName: '', phone: '' })
      setAcceptedTerms(false)
      setTermsError(false)
    } catch (err) {
      console.error('Booking error:', err)
      toast.error('Reservation failed')
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

  const CustomDateInput = ({ value, onClick, label }) => (
    <div onClick={onClick} className="bg-gradient-to-br from-[#2d568e]/5 to-white rounded-xl p-3 cursor-pointer hover:from-[#2d568e]/10 transition border border-[#2d568e]/20 text-center">
      <div className="text-xs text-[#2d568e] font-semibold">{label}</div>
      <div className="font-bold text-gray-800">{value}</div>
    </div>
  )

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2d568e]"></div></div>
  if (error || !condo) return <div className="min-h-screen flex items-center justify-center">Condo not found</div>

  return (
    <>
      {/* Main content */}
      <div className="fixed inset-0 bg-gray-50 flex overflow-hidden">
        
        {/* DESKTOP LAYOUT */}
        <div className="hidden lg:flex w-full h-full">
          
          {/* LEFT SIDE - ONLY THIS SCROLLS */}
          <div className="w-2/3 h-full overflow-y-auto scrollable-content pt-16">
            <ImageGallery images={allImages} title={condo.title} />
            <div className="max-w-3xl mx-auto px-6 py-8 pb-16">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{condo.title}</h1>
                {condo.code && <span className="bg-[#2d568e] text-white px-3 py-1 rounded-full text-sm">{condo.code}</span>}
              </div>
              <div className="flex items-center gap-2 text-gray-500 mb-6"><MapPin size={18} /><span>{condo.location}</span></div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-xl p-4 shadow-sm"><Bed className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.bedroom_count}</p><p className="text-sm text-gray-500">Bedrooms</p></div>
                <div className="bg-white rounded-xl p-4 shadow-sm"><Bath className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.bathroom_count}</p><p className="text-sm text-gray-500">Bathrooms</p></div>
                <div className="bg-white rounded-xl p-4 shadow-sm"><Users className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.max_guests}</p><p className="text-sm text-gray-500">Max Guests</p></div>
                <div className="bg-white rounded-xl p-4 shadow-sm"><Square className="text-[#2d568e] mb-2" size={20} /><p className="text-2xl font-bold">{condo.square_meters}</p><p className="text-sm text-gray-500">Sq Meters</p></div>
              </div>

              <div className="mb-8"><h2 className="text-xl font-semibold mb-3">About This Condo</h2><p className="text-gray-600">{condo.description}</p></div>
              <div className="mb-8"><h2 className="text-xl font-semibold mb-4">Amenities</h2><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{condo.amenities?.map((item, i) => (<div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border"><span className="capitalize text-gray-700">{item}</span></div>))}</div></div>
              <div className="mb-8 bg-white rounded-xl p-6"><h2 className="text-xl font-semibold mb-4">House Rules</h2><div className="grid md:grid-cols-2 gap-3"><div className="flex items-center gap-2 text-gray-600"><Clock size={16} className="text-[#2d568e]" />Check-in: 3PM</div><div className="flex items-center gap-2 text-gray-600"><Clock size={16} className="text-[#2d568e]" />Check-out: 11AM</div><div className="flex items-center gap-2 text-gray-600"><CheckCircle size={16} className="text-green-500" />No smoking</div><div className="flex items-center gap-2 text-gray-600"><CheckCircle size={16} className="text-green-500" />No pets</div><div className="flex items-center gap-2 text-gray-600"><AlertCircle size={16} className="text-amber-500" />No parties</div></div></div>
              <div className="mb-8"><h2 className="text-xl font-semibold mb-4">Cancellation Policies</h2><div className="space-y-3">{['moderate', 'free', 'nonrefundable'].map((policy) => (<div key={policy} className={`p-4 rounded-xl border-2 cursor-pointer transition ${cancellationPolicy === policy ? 'border-[#2d568e] bg-blue-50' : 'border-gray-200'}`} onClick={() => setCancellationPolicy(policy)}><h3 className="font-semibold capitalize">{policy === 'nonrefundable' ? 'Non-refundable' : policy === 'free' ? 'Free 14 Cancellation' : 'Moderate Cancellation'}</h3><p className="text-sm text-gray-600">{policy === 'moderate' && "Cancel up to 14 days before for 50% refund"}{policy === 'free' && "Cancel up to 14 days before for 100% refund"}{policy === 'nonrefundable' && "Pay total now, no refunds"}</p></div>))}</div></div>
              <div><h2 className="text-xl font-semibold mb-3">Location</h2><div className="bg-gray-100 h-64 rounded-xl flex items-center justify-center"><MapPin size={32} className="text-gray-400" /><span className="ml-2 text-gray-500">{condo.location}</span></div></div>
            </div>
          </div>

          {/* RIGHT SIDE - COMPLETELY STATIC - NO SCROLLING - REMOVED children discount and cancellation text */}
          <div className="w-1/3 bg-white shadow-xl flex flex-col h-full overflow-hidden pt-25">
            <motion.div 
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="h-full overflow-hidden"
            >
              <div className="h-full overflow-y-auto p-6 space-y-5">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-center pb-4 border-b"
                >
                  <div className="text-4xl font-bold text-[#2d568e]">{formatPrice(basePricePerNight)}<span className="text-sm text-gray-400">/night</span></div>
                </motion.div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative z-20">
                    <DatePicker 
                      selected={startDate} 
                      onChange={(date) => setStartDate(date)} 
                      minDate={new Date()} 
                      dateFormat="MMM dd, yyyy" 
                      customInput={<CustomDateInput label="CHECK-IN" />} 
                      popperPlacement="bottom-start" 
                    />
                  </div>
                  <div className="relative z-10">
                    <DatePicker 
                      selected={endDate} 
                      onChange={(date) => setEndDate(date)} 
                      minDate={startDate} 
                      dateFormat="MMM dd, yyyy" 
                      customInput={<CustomDateInput label="CHECK-OUT" />} 
                      popperPlacement="bottom-start" 
                    />
                  </div>
                </div>

                <div className="flex justify-between text-sm text-gray-500">
                  <span>{nights} nights</span>
                  <span>{totalGuests} guests</span>
                </div>

                <div className="relative">
                  <button onClick={() => setShowGuestDropdown(!showGuestDropdown)} className="w-full bg-gray-50 rounded-xl p-3 text-left flex justify-between">
                    <span>{getGuestDisplayText()}</span>
                    <ChevronDown size={18} className={`transition ${showGuestDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showGuestDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-xl shadow-xl z-30 p-4 space-y-3">
                      <div className="flex justify-between"><span>Adults</span><div className="flex gap-4"><button onClick={() => setAdults(Math.max(1, adults-1))} className="w-8 h-8 rounded-full bg-gray-100">-</button><span>{adults}</span><button onClick={() => setAdults(adults+1)} className="w-8 h-8 rounded-full bg-gray-100">+</button></div></div>
                      <div className="flex justify-between"><span>Children (10% off)</span><div className="flex gap-4"><button onClick={() => setChildren(Math.max(0, children-1))} className="w-8 h-8 rounded-full bg-gray-100">-</button><span>{children}</span><button onClick={() => setChildren(children+1)} className="w-8 h-8 rounded-full bg-gray-100">+</button></div></div>
                      <div className="flex justify-between"><span>Infants (20% off)</span><div className="flex gap-4"><button onClick={() => setInfants(Math.max(0, infants-1))} className="w-8 h-8 rounded-full bg-gray-100">-</button><span>{infants}</span><button onClick={() => setInfants(infants+1)} className="w-8 h-8 rounded-full bg-gray-100">+</button></div></div>
                      <div className="flex justify-between"><span>Seniors (20% off)</span><div className="flex gap-4"><button onClick={() => setSeniors(Math.max(0, seniors-1))} className="w-8 h-8 rounded-full bg-gray-100">-</button><span>{seniors}</span><button onClick={() => setSeniors(seniors+1)} className="w-8 h-8 rounded-full bg-gray-100">+</button></div></div>
                      <button onClick={() => setShowGuestDropdown(false)} className="w-full bg-[#2d568e] text-white py-2 rounded-lg">Apply</button>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input type="text" placeholder="Promo Code" className="flex-1 bg-gray-50 rounded-xl p-3" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
                  <button onClick={applyPromo} className="px-4 bg-gray-100 rounded-xl hover:bg-[#2d568e] hover:text-white transition">Apply</button>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between"><span>Nightly avg</span><span>{formatPrice(effectiveNightlyRate)}</span></div>
                  <div className="flex justify-between"><span>{formatPrice(effectiveNightlyRate)} × {nights}</span><span>{formatPrice(subtotal)}</span></div>
                  <div className="flex justify-between"><span>Service fee (5%)</span><span>{formatPrice(serviceFee)}</span></div>
                  {promoApplied && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatPrice(promoDiscount)}</span></div>}
                  <div className="flex justify-between font-bold text-xl pt-2 border-t"><span>Total</span><span className="text-[#2d568e]">{formatPrice(finalTotal)}</span></div>
                </div>

                {/* THESE TWO LINES WERE REMOVED FROM HERE - Children discount and Cancellation policy moved to modal */}
                
                <button onClick={handleBookNowClick} className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition shadow-lg">
                  {user ? 'Reserve Now' : 'Sign in to Book'}
                </button>
              </div>
            </motion.div>
          </div>
        </div>

        {/* MOBILE LAYOUT */}
        <div className="lg:hidden w-full h-full overflow-y-auto pt-16">
          <ImageGallery images={allImages} title={condo.title} />
          
          <div className="px-4 py-6 pb-32">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{condo.title}</h1>
              {condo.code && <span className="bg-[#2d568e] text-white px-2 py-0.5 rounded-full text-xs">{condo.code}</span>}
            </div>
            <div className="flex items-center gap-1 text-gray-500 mb-4"><MapPin size={14} /><span className="text-sm">{condo.location}</span></div>
            
            <div className="grid grid-cols-4 gap-2 mb-6">
              <div className="bg-white rounded-lg p-2 text-center shadow-sm"><Bed className="text-[#2d568e] mx-auto mb-1" size={16} /><p className="text-lg font-bold">{condo.bedroom_count}</p><p className="text-xs text-gray-500">Beds</p></div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm"><Bath className="text-[#2d568e] mx-auto mb-1" size={16} /><p className="text-lg font-bold">{condo.bathroom_count}</p><p className="text-xs text-gray-500">Baths</p></div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm"><Users className="text-[#2d568e] mx-auto mb-1" size={16} /><p className="text-lg font-bold">{condo.max_guests}</p><p className="text-xs text-gray-500">Guests</p></div>
              <div className="bg-white rounded-lg p-2 text-center shadow-sm"><Square className="text-[#2d568e] mx-auto mb-1" size={16} /><p className="text-lg font-bold">{condo.square_meters}</p><p className="text-xs text-gray-500">sqm</p></div>
            </div>

            <div className="mb-6"><h2 className="text-lg font-semibold mb-2">About</h2><p className="text-gray-600 text-sm">{condo.description}</p></div>
            
            <ExpandableSection title="Amenities" icon={Wifi}>
              <div className="flex flex-wrap gap-2">{condo.amenities?.map((item, i) => (<span key={i} className="bg-gray-100 px-3 py-1 rounded-full text-sm capitalize">{item}</span>))}</div>
            </ExpandableSection>
            
            <ExpandableSection title="House Rules" icon={Clock}>
              <div className="space-y-2 text-sm text-gray-600"><div>Check-in: 3:00 PM</div><div>Check-out: 11:00 AM</div><div>No smoking</div><div>No pets</div><div>No parties</div></div>
            </ExpandableSection>
            
            <ExpandableSection title="Cancellation Policies" icon={Shield}>
              <div className="space-y-2">{['moderate', 'free', 'nonrefundable'].map((policy) => (<div key={policy} className={`p-3 rounded-lg border cursor-pointer transition ${cancellationPolicy === policy ? 'border-[#2d568e] bg-blue-50' : 'border-gray-200'}`} onClick={() => setCancellationPolicy(policy)}><h3 className="font-semibold text-sm capitalize">{policy === 'nonrefundable' ? 'Non-refundable' : policy === 'free' ? 'Free 14 Cancellation' : 'Moderate Cancellation'}</h3><p className="text-xs text-gray-600">{policy === 'moderate' && "50% refund 14+ days before"}{policy === 'free' && "100% refund 14+ days before"}{policy === 'nonrefundable' && "No refunds"}</p></div>))}</div>
            </ExpandableSection>
            
            <ExpandableSection title="Location" icon={MapPin} defaultOpen={false}>
              <div className="bg-gray-100 h-48 rounded-xl flex items-center justify-center"><MapPin size={24} className="text-gray-400" /><span className="ml-2 text-gray-500 text-sm">{condo.location}</span></div>
            </ExpandableSection>
          </div>

          {/* MOBILE BOOKING SECTION - FIXED AT BOTTOM */}
          <div className="fixed bottom-0 left-0 right-0 bg-white shadow-xl rounded-t-2xl z-40">
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-2xl font-bold text-[#2d568e]">{formatPrice(basePricePerNight)}<span className="text-xs text-gray-400">/night</span></div>
                <button onClick={handleBookNowClick} className="bg-[#2d568e] text-white px-6 py-2 rounded-xl font-semibold hover:bg-[#1e3a5f] transition">
                  {user ? 'Reserve Now' : 'Sign in to Book'}
                </button>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{nights} nights</span>
                <span>{totalGuests} guests</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL - ADDED children discount and cancellation policy here */}
      <AnimatePresence>
        {showBookingForm && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center">
            <div 
              className="absolute inset-0 backdrop-blur-md bg-black/30"
              onClick={() => setShowBookingForm(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md mx-4"
            >
              <div className="bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
                <div className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white p-4 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 rounded-full p-2">
                        <img 
                          src="/Iloilo_rentals_img.png" 
                          alt="Iloilo Rentals Logo" 
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'flex'
                            }
                          }}
                        />
                        <div className="hidden w-8 h-8 bg-white/20 rounded-full items-center justify-center text-white font-bold text-sm">IR</div>
                      </div>
                      <div>
                        <h2 className="text-lg font-bold">Complete Your Reservation</h2>
                        <p className="text-xs text-white/80">{condo?.title}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowBookingForm(false)} className="hover:bg-white/20 p-2 rounded-full transition-all">
                      <X size={20} />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-5">
                  <div>
                    <h3 className="text-md font-semibold text-[#2d568e] mb-3">Personal Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input type="text" placeholder="First Name" className={`border rounded-xl p-2.5 text-sm w-full ${validationErrors.firstName ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} value={guestInfo.firstName} onChange={(e) => handleGuestInfoChange('firstName', e.target.value)} onKeyDown={(e) => {if (e.key >= '0' && e.key <= '9') e.preventDefault()}} />
                        {validationErrors.firstName && <p className="text-red-500 text-xs mt-1">{validationErrors.firstName}</p>}
                      </div>
                      <div>
                        <input type="text" placeholder="Last Name" className={`border rounded-xl p-2.5 text-sm w-full ${validationErrors.lastName ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} value={guestInfo.lastName} onChange={(e) => handleGuestInfoChange('lastName', e.target.value)} onKeyDown={(e) => {if (e.key >= '0' && e.key <= '9') e.preventDefault()}} />
                        {validationErrors.lastName && <p className="text-red-500 text-xs mt-1">{validationErrors.lastName}</p>}
                      </div>
                    </div>
                    <div className="mt-3 bg-gray-50 rounded-xl p-3">
                      <div className="text-xs text-gray-500">Email Address</div>
                      <div className="font-medium text-gray-800 text-sm">{user?.email}</div>
                    </div>
                    <div className="mt-3">
                      <input type="tel" placeholder="Philippine Mobile Number" className={`border rounded-xl p-2.5 text-sm w-full ${validationErrors.phone ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} value={guestInfo.phone} onChange={(e) => {const value = e.target.value; const phoneRegex = /^[0-9+\-\s()]*$/; if (phoneRegex.test(value)) handleGuestInfoChange('phone', value)}} />
                      {validationErrors.phone && <p className="text-red-500 text-xs mt-1">{validationErrors.phone}</p>}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h3 className="text-md font-semibold text-[#2d568e] mb-2">Booking Summary</h3>
                    <div className="bg-gradient-to-br from-[#2d568e]/5 to-white rounded-xl border border-[#2d568e]/20 overflow-hidden">
                      <div className="p-4 max-h-48 overflow-y-auto">
                        <div className="space-y-2">
                          <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-600 text-sm">Check-in</span><span className="font-semibold text-sm">{format(startDate, 'MMM dd, yyyy')}</span></div>
                          <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-600 text-sm">Check-out</span><span className="font-semibold text-sm">{format(endDate, 'MMM dd, yyyy')}</span></div>
                          <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-600 text-sm">Total nights</span><span className="font-semibold text-sm">{nights} night{nights !== 1 ? 's' : ''}</span></div>
                          <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-gray-600 text-sm">Guests</span><span className="font-semibold text-sm">{getGuestDisplayText()}</span></div>
                          <div className="pt-2">
                            <div className="flex justify-between py-1 text-xs"><span className="text-gray-500">Nightly rate (avg)</span><span>{formatPrice(effectiveNightlyRate)}</span></div>
                            <div className="flex justify-between py-1 text-xs"><span className="text-gray-500">{formatPrice(effectiveNightlyRate)} × {nights} nights</span><span>{formatPrice(subtotal)}</span></div>
                            <div className="flex justify-between py-1 text-xs"><span className="text-gray-500">Service fee (5%)</span><span>{formatPrice(serviceFee)}</span></div>
                            {promoApplied && <div className="flex justify-between py-1 text-xs text-green-600"><span>Promo discount</span><span>-{formatPrice(promoDiscount)}</span></div>}
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-gray-200 bg-white/50 p-4">
                        <div className="flex justify-between">
                          <span className="font-bold">Total Amount</span>
                          <span className="text-xl font-bold text-[#2d568e]">{formatPrice(finalTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Children discount info - ADDED TO MODAL */}
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700 text-center">
                      Children 10% off • Infants & Seniors 20% off
                    </p>
                  </div>

                  {/* Cancellation policy - ADDED TO MODAL near terms */}
                  <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 text-center">
                      {getCancellationText()}
                    </p>
                  </div>

                  <div className="flex items-start gap-2 pt-2 mt-2">
                    <input type="checkbox" id="terms" checked={acceptedTerms} onChange={(e) => {setAcceptedTerms(e.target.checked); setTermsError(false)}} className={`w-4 h-4 mt-0.5 cursor-pointer ${termsError ? 'ring-2 ring-red-500' : ''}`} />
                    <label className={`text-xs ${termsError ? 'text-red-600' : 'text-gray-600'}`}>
                      I agree to the <Link to="/terms" target="_blank" className="text-[#2d568e] font-semibold hover:underline">Terms and Conditions</Link> and <Link to="/privacy" target="_blank" className="text-[#2d568e] font-semibold hover:underline">Privacy Policy</Link>
                    </label>
                  </div>
                  {termsError && <p className="text-red-500 text-xs mt-1">You must agree to the Terms & Conditions</p>}
                </div>
                
                <div className="p-4 border-t border-gray-100 bg-gray-50">
                  <button onClick={handleBookNow} className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition-all">Confirm Reservation</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}