import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, MapPin, Bed, Bath, Square,
  X, Clock, CheckCircle, AlertCircle,
  ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Building, Check
} from 'lucide-react'
import { differenceInDays, format } from 'date-fns'
import toast from 'react-hot-toast'
import DatePicker from 'react-datepicker'
import "react-datepicker/dist/react-datepicker.css"
import { supabase } from "../../lib/supabase";
import { useCurrency } from "../../context/CurrencyContext";
import { useAuth } from "../../context/AuthContext";
import { getCondoImages } from "../../utils/condoImages";
import PayPalPaymentModal from '../../components/payment/PayPalPaymentModal'

const customDatePickerStyles = `
  .react-datepicker-popper { z-index: 100 !important; position: absolute !important; }
  .react-datepicker { font-family: inherit; border-radius: 1rem; border: 1px solid #e5e7eb; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); overflow: hidden; background: white; }
  .react-datepicker-wrapper { display: block; width: 100%; }
  .react-datepicker__input-container { display: block; width: 100%; }
  .react-datepicker__header { background-color: #2d568e; border-bottom: none; padding: 0.75rem; }
  .react-datepicker__current-month { color: white; font-weight: 600; font-size: 0.9rem; }
  .react-datepicker__day-name { color: rgba(255,255,255,0.8); font-weight: 500; }
  .react-datepicker__day { color: #374151; border-radius: 0.5rem; transition: all 0.2s; }
  .react-datepicker__day:hover { background-color: #2d568e !important; color: white !important; }
  .react-datepicker__day--selected { background-color: #2d568e !important; color: white !important; font-weight: bold; }
  .react-datepicker__day--in-range { background-color: rgba(45,86,142,0.2) !important; color: #2d568e !important; }
  .react-datepicker__navigation-icon::before { border-color: white !important; }
  .react-datepicker__triangle { display: none; }
  .hide-scrollbar::-webkit-scrollbar { display: none; }
  .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  @media (max-width: 1023px) {
    .booking-sheet-bottom { padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px)); }
  }
`

function CustomDateInput({ value, onClick, label }) {
  return (
    <div onClick={onClick} className="w-full border-2 border-gray-200 hover:border-[#2d568e]/50 rounded-xl p-3 cursor-pointer transition-all bg-white">
      <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">{label}</div>
      <div className="font-semibold text-gray-800 text-sm">{value || 'Select'}</div>
    </div>
  )
}

function validatePhilippinePhone(phone) {
  if (!phone) return { valid: false, error: 'Phone number is required' }
  const cleaned = phone.replace(/\D/g, '')
  if (/^09\d{9}$/.test(cleaned)) return { valid: true, cleaned }
  if (/^639\d{9}$/.test(cleaned)) return { valid: true, cleaned: '0' + cleaned.slice(2) }
  if (cleaned.length < 11) return { valid: false, error: 'Phone number must be 11 digits' }
  return { valid: false, error: 'Invalid Philippine number. Format: 09XXXXXXXXX' }
}

function sanitizeName(value) {
  if (!value) return ''
  return value.replace(/[^a-zA-Z\s\-']/g, '').replace(/</g, '').replace(/>/g, '').trim().slice(0, 50)
}

export default function CondoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { formatPrice } = useCurrency()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState({ firstName: '', lastName: '', phone: '' })
  const [condo, setCondo] = useState(null)
  const [error, setError] = useState(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [focused, setFocused] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [allCondos, setAllCondos] = useState([])
  const [showOtherListings, setShowOtherListings] = useState(false)
  const [currentId, setCurrentId] = useState(id)
  const [validImages, setValidImages] = useState([])
  const [imagesLoading, setImagesLoading] = useState(true)

  const [startDate, setStartDate] = useState(new Date())
  const [endDate, setEndDate] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  })

  const [totalGuests, setTotalGuests] = useState(2)
  const [maxGuests, setMaxGuests] = useState(10)

  const [cancellationPolicy, setCancellationPolicy] = useState('moderate')
  const [showBookingForm, setShowBookingForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showGuestDropdown, setShowGuestDropdown] = useState(false)
  const [showMobileBooking, setShowMobileBooking] = useState(false)

  const [guestInfo, setGuestInfo] = useState({ firstName: '', lastName: '', phone: '' })
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [termsError, setTermsError] = useState(false)
  const [touched, setTouched] = useState({ firstName: false, lastName: false, phone: false })

  // 🆕 Payment state
  const [paymentBooking, setPaymentBooking] = useState(null)

  const detailsRef = useRef(null)
  const firstNameRef = useRef(null)
  const lastNameRef = useRef(null)
  const phoneRef = useRef(null)
  const termsRef = useRef(null)

  const [modalContainer] = useState(() => {
    let div = document.getElementById('modal-root')
    if (!div) { div = document.createElement('div'); div.id = 'modal-root'; document.body.appendChild(div) }
    return div
  })

  const validateName = (name) => {
    const sanitized = sanitizeName(name)
    if (!sanitized) return 'Required'
    if (sanitized.length < 2) return 'At least 2 characters'
    if (/[0-9]/.test(sanitized)) return 'No numbers allowed'
    return ''
  }

  const validatePhone = (phone) => {
    if (!phone.trim()) return 'Phone number is required'
    const result = validatePhilippinePhone(phone)
    if (!result.valid) return result.error
    return ''
  }

  const getValidationState = (field) => {
    if (!touched[field]) return 'empty'
    if (!guestInfo[field] || !guestInfo[field].trim()) return 'invalid'
    if (field === 'firstName' || field === 'lastName') return validateName(guestInfo[field]) === '' ? 'valid' : 'invalid'
    if (field === 'phone') return validatePhone(guestInfo[field]) === '' ? 'valid' : 'invalid'
    return 'empty'
  }

  const getFieldError = (field) => {
    if (!touched[field]) return ''
    if (field === 'firstName' || field === 'lastName') return validateName(guestInfo[field])
    if (field === 'phone') return validatePhone(guestInfo[field])
    return ''
  }

  const handleFieldChange = (field, value) => {
    if (field === 'firstName' || field === 'lastName') {
      setGuestInfo(prev => ({ ...prev, [field]: sanitizeName(value) }))
    } else if (field === 'phone') {
      setGuestInfo(prev => ({ ...prev, [field]: value.replace(/[^\d+\s\-()]/g, '').slice(0, 15) }))
    }
    if (touched[field]) setValidationErrors(prev => ({ ...prev, [field]: getFieldError(field) }))
  }

  const handleFieldBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    setValidationErrors(prev => ({ ...prev, [field]: getFieldError(field) }))
  }

  const fetchCondoDetails = useCallback(async (condoId) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase.from('condos').select('*').eq('id', condoId).single()
      if (fetchError) throw fetchError
      if (!data) throw new Error('Condo not found')
      setCondo(data)
      setMaxGuests(data.max_guests || 10)
      setTotalGuests(Math.min(2, data.max_guests || 10))
      setCurrentImageIndex(0)
      setZoomLevel(1)
    } catch (err) { console.error(err); setError(err.message) } finally { setLoading(false) }
  }, [])

  const fetchAllCondos = useCallback(async () => {
    const { data } = await supabase.from('condos').select('id,title,code,price_per_night,images,location').order('title')
    if (data) setAllCondos(data)
  }, [])

  useEffect(() => { fetchCondoDetails(id); fetchAllCondos() }, [id, fetchCondoDetails, fetchAllCondos])

  useEffect(() => {
    const handlePopState = () => {
      const newId = window.location.pathname.split('/').pop()
      if (newId && newId !== currentId) { setCurrentId(newId); fetchCondoDetails(newId) }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentId, fetchCondoDetails])

  const navigateToCondo = (condoId) => {
    if (condoId === currentId) return
    setShowOtherListings(false)
    setCurrentId(condoId)
    window.history.pushState({}, '', `/condo/${condoId}`)
    fetchCondoDetails(condoId)
  }

  const goBack = () => navigate('/condos')

  const openBookingForm = () => {
    if (user) {
      const fullName = sanitizeName(user.user_metadata?.full_name || '')
      setGuestInfo({ firstName: fullName.split(' ')[0] || '', lastName: fullName.split(' ').slice(1).join(' ') || '', phone: '' })
    }
    setValidationErrors({ firstName: '', lastName: '', phone: '' })
    setTouched({ firstName: false, lastName: false, phone: false })
    setAcceptedTerms(false)
    setTermsError(false)
    setShowBookingForm(true)
  }

  const openMobileBooking = () => {
    if (user) {
      const fullName = sanitizeName(user.user_metadata?.full_name || '')
      setGuestInfo({ firstName: fullName.split(' ')[0] || '', lastName: fullName.split(' ').slice(1).join(' ') || '', phone: '' })
    }
    setValidationErrors({ firstName: '', lastName: '', phone: '' })
    setTouched({ firstName: false, lastName: false, phone: false })
    setAcceptedTerms(false)
    setTermsError(false)
    setShowMobileBooking(true)
  }

  useEffect(() => {
    const styleElement = document.createElement('style')
    styleElement.innerHTML = customDatePickerStyles
    document.head.appendChild(styleElement)
    return () => document.head.removeChild(styleElement)
  }, [])

  // ============ FIXED IMAGE LOADING ============
  useEffect(() => {
    if (!condo) return
    setImagesLoading(true)
    
    const dbImages = condo.images && condo.images.length > 0 ? condo.images : []
    const storageImages = condo.code ? getCondoImages(condo.code) : []
    const candidates = dbImages.length > 0 ? dbImages : storageImages
    
    const fallback = 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200'
    
    if (candidates.length === 0) {
      setValidImages([fallback])
      setImagesLoading(false)
      return
    }
    
    let cancelled = false
    const checkImages = async () => {
      const valid = []
      await Promise.all(candidates.map(url => 
        new Promise(resolve => {
          const img = new Image()
          img.onload = () => { if (!cancelled) valid.push(url); resolve() }
          img.onerror = () => resolve()
          img.src = url
        })
      ))
      if (cancelled) return
      const ordered = candidates.filter(url => valid.includes(url))
      setValidImages(ordered.length > 0 ? ordered : [fallback])
      setImagesLoading(false)
    }
    checkImages()
    
    return () => { cancelled = true }
  }, [condo])

  useEffect(() => {
    if (validImages.length <= 1) return
    const interval = setInterval(() => {
      setCurrentImageIndex(prev => (prev + 1) % validImages.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [validImages.length])

  useEffect(() => {
    if (currentImageIndex >= validImages.length && validImages.length > 0) {
      setCurrentImageIndex(0)
    }
  }, [validImages.length, currentImageIndex])

  const allImages = validImages

  const nights = startDate && endDate ? differenceInDays(endDate, startDate) : 0
  const basePricePerNight = condo?.price_per_night || 0
  const subtotal = nights * basePricePerNight
  const serviceFee = subtotal * 0.05
  const total = subtotal + serviceFee
  const otherCondos = allCondos.filter(c => c.id !== currentId)

  const getCancellationText = () => {
    if (cancellationPolicy === 'moderate') return "Cancel 14 days before for 50% refund"
    if (cancellationPolicy === 'free') return "Cancel 14 days before for 100% refund"
    return "Non-refundable"
  }

  const getGuestDisplayText = () => `${totalGuests} Guest${totalGuests !== 1 ? 's' : ''}`

  const scrollToError = () => {
    const fe = getFieldError('firstName')
    const le = getFieldError('lastName')
    const pe = getFieldError('phone')
    if (fe) { firstNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); firstNameRef.current?.focus() }
    else if (le) { lastNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); lastNameRef.current?.focus() }
    else if (pe) { phoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); phoneRef.current?.focus() }
    else if (!acceptedTerms) { termsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  }

  const handleBookNow = async () => {
    setTouched({ firstName: true, lastName: true, phone: true })
    const fe = validateName(guestInfo.firstName)
    const le = validateName(guestInfo.lastName)
    const pe = validatePhone(guestInfo.phone)
    setValidationErrors({ firstName: fe, lastName: le, phone: pe })
    if (!acceptedTerms) setTermsError(true)
    
    if (!guestInfo.firstName.trim() || !guestInfo.lastName.trim() || !guestInfo.phone.trim()) {
      toast.error('Please fill all required fields')
      setTimeout(scrollToError, 100)
      return
    }
    if (fe || le || pe || !acceptedTerms) {
      toast.error('Please fix the errors')
      setTimeout(scrollToError, 100)
      return
    }
    
    const phoneResult = validatePhilippinePhone(guestInfo.phone)
    if (!phoneResult.valid) { toast.error('Invalid phone number'); return }
    
    setIsSubmitting(true)
    try {
      const { data: freshCondo, error: condoError } = await supabase
        .from('condos')
        .select('price_per_night')
        .eq('id', currentId)
        .single()
      
      if (condoError) throw condoError
      
      const freshBasePrice = freshCondo.price_per_night
      const freshSubtotal = nights * freshBasePrice
      const freshServiceFee = freshSubtotal * 0.05
      const freshTotal = freshSubtotal + freshServiceFee
      
      const bookingData = {
        condo_id: currentId,
        user_id: user.id,
        guest_name: `${sanitizeName(guestInfo.firstName)} ${sanitizeName(guestInfo.lastName)}`,
        guest_email: user.email,
        guest_phone: phoneResult.cleaned,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        total_guests: totalGuests,
        cancellation_policy: cancellationPolicy,
        subtotal: freshSubtotal,
        service_fee: freshServiceFee,
        total_amount: freshTotal,
        status: 'pending',
        payment_status: 'unpaid',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        avatar_url: user?.user_metadata?.avatar_url || null
      }
      
      const { data: newBooking, error: insertError } = await supabase
        .from('bookings')
        .insert(bookingData)
        .select()
        .single()
      
      if (insertError) throw insertError
      
      // ✅ Send confirmation email (fire-and-forget)
      supabase.functions.invoke('send-booking-confirmation', {
        body: { bookingId: newBooking.id }
      }).then(({ data, error }) => {
        if (error) console.error('Confirmation email error:', error)
        else console.log('Confirmation email sent:', data)
      }).catch(err => console.error('Confirmation email failed:', err))
      
      toast.success('Reservation created!')
      setShowBookingForm(false)
      setShowMobileBooking(false)
      setGuestInfo({ firstName: '', lastName: '', phone: '' })
      setAcceptedTerms(false)
      setTermsError(false)
      
      setPaymentBooking(newBooking)
      
    } catch (error) {
      console.error('Booking error:', error)
      toast.error('Reservation failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBackgroundClick = (e) => {
    if (showBookingForm || showMobileBooking) return
    if (showOtherListings) { setShowOtherListings(false); return }
    if (e.target === e.currentTarget) setFocused(prev => !prev)
  }

  const prevImage = (e) => { e.stopPropagation(); if (allImages.length > 0) setCurrentImageIndex(prev => (prev - 1 + allImages.length) % allImages.length) }
  const nextImage = (e) => { e.stopPropagation(); if (allImages.length > 0) setCurrentImageIndex(prev => (prev + 1) % allImages.length) }
  const zoomIn = (e) => { e.stopPropagation(); setZoomLevel(prev => Math.min(prev + 0.5, 3)) }
  const zoomOut = (e) => { e.stopPropagation(); setZoomLevel(prev => Math.max(prev - 0.5, 1)) }

  const handleReserve = (e) => {
    e.stopPropagation()
    if (!user) { toast.error('Please sign in to book'); navigate(`/login?redirect=/condo/${currentId}`); return }
    if (window.innerWidth < 1024) openMobileBooking()
    else openBookingForm()
  }

  if (error && !condo) return (<div className="fixed inset-0 flex items-center justify-center bg-black z-50"><p className="text-white">Condo not found</p></div>)

  const renderBookingForm = () => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div ref={firstNameRef}>
          <div className="relative">
            <input type="text" placeholder="First Name" maxLength={50}
              className={`border-2 rounded-xl p-2.5 pr-10 text-sm w-full ${getValidationState('firstName') === 'valid' ? 'border-emerald-400 bg-emerald-50' : getValidationState('firstName') === 'invalid' ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
              value={guestInfo.firstName} onChange={(e) => handleFieldChange('firstName', e.target.value)} onBlur={() => handleFieldBlur('firstName')} />
            {getValidationState('firstName') === 'valid' && <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
            {getValidationState('firstName') === 'invalid' && <X size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" />}
          </div>
          {getFieldError('firstName') && <p className="text-red-500 text-xs mt-1">{getFieldError('firstName')}</p>}
        </div>
        <div ref={lastNameRef}>
          <div className="relative">
            <input type="text" placeholder="Last Name" maxLength={50}
              className={`border-2 rounded-xl p-2.5 pr-10 text-sm w-full ${getValidationState('lastName') === 'valid' ? 'border-emerald-400 bg-emerald-50' : getValidationState('lastName') === 'invalid' ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
              value={guestInfo.lastName} onChange={(e) => handleFieldChange('lastName', e.target.value)} onBlur={() => handleFieldBlur('lastName')} />
            {getValidationState('lastName') === 'valid' && <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
            {getValidationState('lastName') === 'invalid' && <X size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" />}
          </div>
          {getFieldError('lastName') && <p className="text-red-500 text-xs mt-1">{getFieldError('lastName')}</p>}
        </div>
      </div>
      <div className="bg-gray-50 rounded-xl p-3"><div className="text-xs text-gray-500">Email</div><div className="font-medium text-gray-800 text-sm">{user?.email}</div></div>
      <div ref={phoneRef}>
        <div className="relative">
          <input type="tel" placeholder="Mobile Number (e.g. 09123456789)" maxLength={15}
            className={`border-2 rounded-xl p-2.5 pr-10 text-sm w-full ${getValidationState('phone') === 'valid' ? 'border-emerald-400 bg-emerald-50' : getValidationState('phone') === 'invalid' ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
            value={guestInfo.phone} onChange={(e) => handleFieldChange('phone', e.target.value)} onBlur={() => handleFieldBlur('phone')} />
          {getValidationState('phone') === 'valid' && <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
          {getValidationState('phone') === 'invalid' && <X size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" />}
        </div>
        {getFieldError('phone') && <p className="text-red-500 text-xs mt-1">{getFieldError('phone')}</p>}
        {getValidationState('phone') === 'valid' && <p className="text-emerald-500 text-xs mt-1">✓ Valid PH number</p>}
      </div>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <div className="flex justify-between text-sm"><span className="text-gray-500">Check-in</span><span className="font-semibold">{format(startDate, 'MMM dd, yyyy')}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">Check-out</span><span className="font-semibold">{format(endDate, 'MMM dd, yyyy')}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">Nights</span><span className="font-semibold">{nights}</span></div>
        <div className="flex justify-between text-sm"><span className="text-gray-500">Guests</span><span className="font-semibold">{getGuestDisplayText()}</span></div>
        <div className="border-t pt-2">
          <div className="flex justify-between text-xs text-gray-500"><span>₱{basePricePerNight.toLocaleString()} × {nights} nights</span><span>{formatPrice(subtotal)}</span></div>
          <div className="flex justify-between text-xs text-gray-500 mt-1"><span>Service fee (5%)</span><span>{formatPrice(serviceFee)}</span></div>
        </div>
        <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span className="text-[#2d568e]">{formatPrice(total)}</span></div>
      </div>
      <p className="text-xs text-gray-400 text-center">{getCancellationText()}</p>
      <div className={`flex items-start gap-2 p-2 rounded-lg ${termsError ? 'bg-red-50 border border-red-200' : ''}`} ref={termsRef}>
        <input type="checkbox" checked={acceptedTerms} onChange={(e) => { setAcceptedTerms(e.target.checked); if (e.target.checked) setTermsError(false) }} className="w-4 h-4 mt-0.5" />
        <label className={`text-xs ${termsError ? 'text-red-600' : 'text-gray-600'}`}>I agree to the <Link to="/terms" target="_blank" className="text-[#2d568e] font-semibold underline">Terms</Link> and <Link to="/privacy" target="_blank" className="text-[#2d568e] font-semibold underline">Privacy Policy</Link></label>
      </div>
      {termsError && <p className="text-red-500 text-xs -mt-2">You must agree to the Terms & Conditions</p>}
      <button onClick={handleBookNow} disabled={isSubmitting} className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-bold hover:bg-[#1e3a5f] transition-all disabled:opacity-50">
        {isSubmitting ? 'Processing...' : 'Confirm & Pay'}
      </button>
    </>
  )

  return (
    <div className="fixed inset-0 z-40 flex overflow-hidden bg-black cursor-pointer" onClick={handleBackgroundClick}>
      <div className="absolute inset-0 overflow-hidden">
        {imagesLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="rounded-full h-12 w-12 border-[3px] border-white/20 border-t-white" />
          </div>
        ) : (
          allImages.map((img, idx) => (
            <div key={idx} className="absolute inset-0 transition-all duration-700" style={{ opacity: idx === currentImageIndex ? 1 : 0, transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}>
              <img src={img} alt="" className="w-full h-full object-cover" />
            </div>
          ))
        )}
        <div className={`absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent transition-opacity duration-500 ${focused ? 'opacity-100' : 'opacity-0'}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>

      {!focused && !showOtherListings && (
        <div className="hidden lg:flex absolute bottom-24 right-6 z-30 flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={zoomIn} className="bg-black/50 backdrop-blur-sm border border-white/30 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/70 transition-all"><ZoomIn size={18} /></button>
          <button onClick={zoomOut} className="bg-black/50 backdrop-blur-sm border border-white/30 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/70 transition-all"><ZoomOut size={18} /></button>
        </div>
      )}

      <button onClick={(e) => { e.stopPropagation(); goBack() }} className="absolute top-24 left-6 z-30 bg-black/50 backdrop-blur-sm border border-white/30 text-white p-3 rounded-full hover:bg-black/70 transition-all"><ChevronLeft size={20} /></button>
      <button onClick={(e) => { e.stopPropagation(); setShowOtherListings(prev => !prev) }} className="absolute top-24 left-20 z-30 bg-black/50 backdrop-blur-sm border border-white/30 text-white px-4 py-3 rounded-full hover:bg-black/70 transition-all flex items-center gap-2"><Building size={18} /><span className="text-sm hidden sm:inline">Other Listings</span></button>

      <AnimatePresence>
        {showOtherListings && (
          <motion.div initial={{ opacity: 0, x: -100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }} transition={{ duration: 0.25, ease: 'easeOut' }} onClick={(e) => e.stopPropagation()} className="absolute left-0 top-0 bottom-0 z-25 w-full sm:w-80 lg:w-96 bg-black/95 backdrop-blur-xl overflow-y-auto hide-scrollbar border-r border-white/10">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-bold text-white">All Listings</h2><button onClick={() => setShowOtherListings(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={20} className="text-white/70" /></button></div>
              <div className="space-y-3">
                {otherCondos.map(c => {
                  const img = c.images?.[0] || (c.code ? `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${c.code}_1.jpg` : null)
                  return (<button key={c.id} onClick={() => navigateToCondo(c.id)} className="w-full flex gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left"><div className="w-20 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-700">{img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Building size={20} className="text-gray-500" /></div>}</div><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white truncate">{c.title}</p><div className="flex items-center gap-1 text-white/40 text-xs mt-0.5"><MapPin size={10} /><span className="truncate">{c.location}</span></div><p className="text-sm font-bold text-blue-400 mt-1">{formatPrice(c.price_per_night)}<span className="text-xs text-white/40 font-normal">/night</span></p></div></button>)
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!focused && !showOtherListings && allImages.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()} className="absolute bottom-6 left-0 right-0 z-20 flex flex-col items-center gap-3 px-4">
            <div className="hidden lg:flex gap-2 overflow-x-auto hide-scrollbar max-w-[60vw]">{allImages.map((img, idx) => (<button key={idx} onClick={() => setCurrentImageIndex(idx)} className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${idx === currentImageIndex ? 'border-white ring-2 ring-white/50 scale-105' : 'border-white/30 hover:border-white/60 opacity-70 hover:opacity-100'}`}><img src={img} alt="" className="w-full h-full object-cover" /></button>))}</div>
            <div className="flex gap-2">{allImages.map((_, idx) => (<button key={idx} onClick={() => setCurrentImageIndex(idx)} className={`h-1.5 rounded-full transition-all ${idx === currentImageIndex ? 'w-8 bg-white' : 'w-1.5 bg-white/50'}`} />))}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!focused && !showOtherListings && allImages.length > 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button onClick={prevImage} className="absolute left-4 lg:left-6 top-1/2 -translate-y-1/2 z-20 bg-black/60 backdrop-blur-sm border-2 border-white/40 text-white w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center hover:bg-black/80 hover:border-white hover:scale-110 transition-all shadow-xl"><ChevronLeft size={24} /></button>
            <button onClick={nextImage} className="absolute right-4 lg:right-6 top-1/2 -translate-y-1/2 z-20 bg-black/60 backdrop-blur-sm border-2 border-white/40 text-white w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center hover:bg-black/80 hover:border-white hover:scale-110 transition-all shadow-xl"><ChevronRight size={24} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {focused && !showOtherListings && condo && (
        <div onClick={(e) => e.stopPropagation()} ref={detailsRef} className="relative z-20 w-full lg:w-1/3 lg:min-w-[350px] lg:max-w-[480px] h-full overflow-y-auto hide-scrollbar flex-shrink-0">
          <div className="min-h-[30vh] lg:min-h-[35vh]" />
          <div className="px-6 lg:px-8 pb-16">
            <div className="mb-6 lg:mb-8"><h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">{condo.title}</h1><div className="flex items-center gap-1.5 text-white/50 mt-2"><MapPin size={14} /><span className="text-sm lg:text-base">{condo.location}</span></div></div>
            <div className="grid grid-cols-2 gap-2 mb-6 lg:mb-8"><div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center"><Bed className="text-white/60 mx-auto mb-1" size={18} /><p className="text-lg font-bold text-white">{condo.bedroom_count}</p><p className="text-[10px] text-white/40">Beds</p></div><div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center"><Bath className="text-white/60 mx-auto mb-1" size={18} /><p className="text-lg font-bold text-white">{condo.bathroom_count}</p><p className="text-[10px] text-white/40">Baths</p></div><div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center"><Users className="text-white/60 mx-auto mb-1" size={18} /><p className="text-lg font-bold text-white">{condo.max_guests}</p><p className="text-[10px] text-white/40">Guests</p></div><div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-center"><Square className="text-white/60 mx-auto mb-1" size={18} /><p className="text-lg font-bold text-white">{condo.square_meters}</p><p className="text-[10px] text-white/40">sqm</p></div></div>
            <div className="mb-6 lg:mb-8"><h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">About</h2><p className="text-white/60 text-sm leading-relaxed">{condo.description}</p></div>
            <div className="mb-6 lg:mb-8"><h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Amenities</h2><div className="space-y-2">{condo.amenities?.map((item, i) => (<div key={i} className="flex items-center gap-2 text-white/60 text-sm"><CheckCircle size={14} className="text-emerald-400 flex-shrink-0" /><span className="capitalize">{item}</span></div>))}</div></div>
            <div className="mb-6 lg:mb-8"><h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">House Rules</h2><div className="space-y-2"><div className="flex items-center gap-2 text-white/50 text-sm"><Clock size={14} /> Check-in: 3PM</div><div className="flex items-center gap-2 text-white/50 text-sm"><Clock size={14} /> Check-out: 11AM</div><div className="flex items-center gap-2 text-white/50 text-sm"><CheckCircle size={14} className="text-emerald-400" /> No smoking</div><div className="flex items-center gap-2 text-white/50 text-sm"><CheckCircle size={14} className="text-emerald-400" /> No pets</div><div className="flex items-center gap-2 text-white/50 text-sm"><AlertCircle size={14} className="text-amber-400" /> No parties</div></div></div>
            <div className="mb-6 lg:mb-8"><h2 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">Cancellation</h2><div className="space-y-2">{['moderate', 'free', 'nonrefundable'].map((policy) => (<button key={policy} onClick={() => setCancellationPolicy(policy)} className={`w-full text-left p-3 rounded-xl border transition-all text-sm ${cancellationPolicy === policy ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'}`}><span className="font-semibold capitalize">{policy === 'nonrefundable' ? 'Non-refundable' : policy === 'free' ? 'Free' : 'Moderate'}</span><span className="text-white/40 text-xs ml-2">{policy === 'moderate' && '50% refund'}{policy === 'free' && '100% refund'}{policy === 'nonrefundable' && 'No refund'}</span></button>))}</div></div>
          </div>
          <div className="sticky bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </div>
      )}

      {focused && !showOtherListings && condo && (
        <div onClick={(e) => e.stopPropagation()} className="hidden lg:flex relative z-20 w-1/4 min-w-[340px] max-w-[400px] h-full items-center justify-center flex-shrink-0 px-4 ml-auto">
          <div className="w-full bg-white rounded-2xl shadow-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="text-center"><div className="text-3xl font-bold text-[#2d568e]">{formatPrice(basePricePerNight)}<span className="text-sm text-gray-400 font-normal">/night</span></div></div>
            <div className="grid grid-cols-2 gap-3"><DatePicker selected={startDate} onChange={(date) => setStartDate(date)} minDate={new Date()} dateFormat="MMM dd, yyyy" customInput={<CustomDateInput label="CHECK-IN" />} popperPlacement="bottom-start" /><DatePicker selected={endDate} onChange={(date) => setEndDate(date)} minDate={startDate} dateFormat="MMM dd, yyyy" customInput={<CustomDateInput label="CHECK-OUT" />} popperPlacement="bottom-start" /></div>
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowGuestDropdown(!showGuestDropdown) }} className="w-full border-2 border-gray-200 hover:border-[#2d568e]/50 rounded-xl p-3 text-left flex justify-between items-center transition-all bg-white"><span className="text-sm text-gray-700">{getGuestDisplayText()}</span><ChevronDown size={18} className={`text-gray-400 transition ${showGuestDropdown ? 'rotate-180' : ''}`} /></button>
              {showGuestDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-100 rounded-xl shadow-xl z-30 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div><span className="text-sm text-gray-700">Total Guests</span><span className="text-[10px] text-gray-400 ml-1">Max {maxGuests}</span></div>
                    <div className="flex items-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); setTotalGuests(g => Math.max(1, g - 1)) }} className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#2d568e] hover:text-[#2d568e]">-</button>
                      <span className="w-5 text-center text-gray-800 font-semibold text-sm">{totalGuests}</span>
                      <button onClick={(e) => { e.stopPropagation(); setTotalGuests(g => Math.min(maxGuests, g + 1)) }} className="w-8 h-8 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#2d568e] hover:text-[#2d568e]">+</button>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowGuestDropdown(false) }} className="w-full bg-[#2d568e] text-white py-2 rounded-lg text-sm font-semibold">Done</button>
                </div>
              )}
            </div>
            {nights > 0 && (<div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm"><div className="flex justify-between text-gray-500"><span>₱{basePricePerNight.toLocaleString()} × {nights} nights</span><span className="text-gray-800">{formatPrice(subtotal)}</span></div><div className="flex justify-between text-gray-500"><span>Service fee (5%)</span><span className="text-gray-800">{formatPrice(serviceFee)}</span></div><div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200"><span className="text-gray-800">Total</span><span className="text-[#2d568e]">{formatPrice(total)}</span></div></div>)}
            <p className="text-xs text-gray-400 text-center">{getCancellationText()}</p>
            <button onClick={handleReserve} className="w-full bg-[#2d568e] text-white py-3.5 rounded-xl font-bold hover:bg-[#1e3a5f] transition-all shadow-lg shadow-[#2d568e]/20">{user ? 'Reserve Now' : 'Sign in to Book'}</button>
            <p className="text-[10px] text-gray-400 text-center">You'll be redirected to PayPal after booking</p>
          </div>
        </div>
      )}

      {condo && (<div className="lg:hidden fixed bottom-16 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/10 px-4 py-3"><div className="flex items-center justify-between"><div><span className="text-xl font-bold text-white">{formatPrice(basePricePerNight)}</span><span className="text-sm text-white/50">/night</span></div><button onClick={handleReserve} className="bg-white text-[#2d568e] px-5 py-2.5 rounded-xl font-bold text-sm">Reserve</button></div></div>)}

      {showBookingForm && condo && createPortal(
        <div className="hidden lg:flex fixed inset-0 items-center justify-center p-4" style={{ zIndex: 99999 }} onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setShowBookingForm(false) }} />
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '85vh', width: '448px', minWidth: '350px' }} onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white p-5 flex-shrink-0 flex items-center justify-between"><div><h2 className="text-lg font-bold">Complete Reservation</h2><p className="text-xs text-white/70">{condo.title}</p></div><button onClick={(e) => { e.stopPropagation(); setShowBookingForm(false) }} className="p-2 hover:bg-white/20 rounded-full"><X size={20} /></button></div>
            <div className="overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>{renderBookingForm()}</div>
          </motion.div>
        </div>, modalContainer
      )}

      <AnimatePresence>
        {showMobileBooking && condo && (
          <div className="lg:hidden fixed inset-0 z-[99999] flex items-end justify-center" onClick={(e) => e.stopPropagation()}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setShowMobileBooking(false) }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex-shrink-0 flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100"><h2 className="text-lg font-bold text-[#2d568e]">Reservation Details</h2><button onClick={(e) => { e.stopPropagation(); setShowMobileBooking(false) }} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-500" /></button></div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 booking-sheet-bottom" onClick={(e) => e.stopPropagation()}><div className="text-center pb-4 border-b"><div className="text-4xl font-bold text-[#2d568e]">{formatPrice(basePricePerNight)}<span className="text-sm text-gray-400">/night</span></div></div>{renderBookingForm()}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {paymentBooking && (
        <PayPalPaymentModal 
          isOpen={!!paymentBooking}
          onClose={() => setPaymentBooking(null)}
          booking={paymentBooking}
          onSuccess={() => setPaymentBooking(null)}
        />
      )}
    </div>
  )
}