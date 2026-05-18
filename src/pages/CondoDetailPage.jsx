import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Calendar, Users, MapPin, Bed, Bath, Square, Wifi, Coffee, Car, Wind, Shield, X } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import toast from 'react-hot-toast'
import { useCurrency } from '../context/CurrencyContext'

export default function CondoDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { formatPrice, rate, symbol } = useCurrency()
  const [condo, setCondo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [seniors, setSeniors] = useState(0)
  const [promoCode, setPromoCode] = useState('')
  const [cancellationPolicy, setCancellationPolicy] = useState('moderate')
  const [showBookingForm, setShowBookingForm] = useState(false)
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
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  async function fetchCondoDetails() {
    const { data } = await supabase
      .from('condos')
      .select('*')
      .eq('id', id)
      .single()
    
    setCondo(data)
    setLoading(false)
  }

  const totalGuests = adults + children + seniors
  const nights = startDate && endDate ? differenceInDays(new Date(endDate), new Date(startDate)) : 0
  const subtotal = nights * (condo?.price_per_night || 0)
  const serviceFee = subtotal * 0.05
  const total = subtotal + serviceFee

  const getCancellationText = () => {
    if (cancellationPolicy === 'moderate') {
      return "Cancel up to 14 days before check-in for 50% refund. Cancel within 14 days - non-refundable."
    } else if (cancellationPolicy === 'free') {
      return "Cancel up to 14 days before check-in for 100% refund. Cancel within 14 days - non-refundable."
    } else {
      return "Non-refundable - you will be charged the total price."
    }
  }

  const handleBookNow = async () => {
    if (!user) {
      toast.error('Please sign in to book')
      navigate('/login')
      return
    }
    
    if (!acceptedTerms) {
      toast.error('Please accept the terms and conditions')
      return
    }
    
    if (!startDate || !endDate) {
      toast.error('Please select check-in and check-out dates')
      return
    }
    
    const bookingData = {
      condo_id: id,
      user_id: user.id,
      guest_name: `${guestInfo.firstName} ${guestInfo.lastName}`,
      guest_email: guestInfo.email,
      guest_phone: guestInfo.phone,
      start_date: startDate,
      end_date: endDate,
      adults: adults,
      children: children,
      infants: infants,
      seniors: seniors,
      promo_code: promoCode,
      cancellation_policy: cancellationPolicy,
      subtotal: subtotal,
      service_fee: serviceFee,
      total_amount: total,
      status: 'pending'
    }
    
    const { error } = await supabase.from('bookings').insert(bookingData)
    
    if (error) {
      toast.error('Booking failed. Please try again.')
    } else {
      toast.success('Booking submitted! We will contact you shortly.')
      setShowBookingForm(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!condo) return <div className="min-h-screen flex items-center justify-center">Condo not found</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col lg:flex-row">
        {/* Left side - 3/4 width - Scrollable */}
        <div className="lg:w-3/4 overflow-y-auto" style={{ height: 'calc(100vh - 64px)' }}>
          {/* Image Gallery */}
          <div className="relative h-96 bg-gray-900">
            <img 
              src={condo.images?.[0] || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200'} 
              alt={condo.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Details Section */}
          <div className="max-w-4xl mx-auto px-6 py-8">
            <h1 className="text-3xl font-bold mb-2">{condo.title}</h1>
            <div className="flex items-center gap-2 text-gray-600 mb-6">
              <MapPin size={18} />
              <span>{condo.location}</span>
            </div>

            <div className="flex flex-wrap gap-6 mb-8 pb-6 border-b">
              <div className="flex items-center gap-2"><Bed size={20} /> {condo.bedroom_count} Bedrooms</div>
              <div className="flex items-center gap-2"><Bath size={20} /> {condo.bathroom_count} Bathrooms</div>
              <div className="flex items-center gap-2"><Users size={20} /> Sleeps {condo.max_guests}</div>
              <div className="flex items-center gap-2"><Square size={20} /> {condo.square_meters || 45} sqm</div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">About this condo</h2>
              <p className="text-gray-600">{condo.description || "A beautiful condo unit in the heart of Iloilo City."}</p>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">Amenities</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {condo.amenities?.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-600">
                    {item === 'wifi' && <Wifi size={18} />}
                    {item === 'parking' && <Car size={18} />}
                    {item === 'ac' && <Wind size={18} />}
                    {item === 'breakfast' && <Coffee size={18} />}
                    <span className="capitalize">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8 p-4 bg-gray-100 rounded-lg">
              <h2 className="text-xl font-semibold mb-3">House Rules</h2>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Check-in: 2:00 PM - 10:00 PM</li>
                <li>Check-out: 11:00 AM</li>
                <li>No smoking inside the unit</li>
                <li>No pets allowed</li>
                <li>Quiet hours: 10:00 PM - 7:00 AM</li>
              </ul>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">Cancellation Policies</h2>
              <div className="space-y-3">
                <div className={`p-3 rounded-lg border-2 cursor-pointer ${cancellationPolicy === 'moderate' ? 'border-[#2d568e] bg-blue-50' : 'border-gray-200'}`} onClick={() => setCancellationPolicy('moderate')}>
                  <div>
                    <h3 className="font-semibold">Moderate Cancellation</h3>
                    <p className="text-sm text-gray-600">Cancel up to 14 days before check-in for 50% refund</p>
                  </div>
                </div>
                <div className={`p-3 rounded-lg border-2 cursor-pointer ${cancellationPolicy === 'free' ? 'border-[#2d568e] bg-blue-50' : 'border-gray-200'}`} onClick={() => setCancellationPolicy('free')}>
                  <div>
                    <h3 className="font-semibold">Free 14 Cancellation</h3>
                    <p className="text-sm text-gray-600">Cancel up to 14 days before check-in for 100% refund</p>
                  </div>
                </div>
                <div className={`p-3 rounded-lg border-2 cursor-pointer ${cancellationPolicy === 'nonrefundable' ? 'border-[#2d568e] bg-blue-50' : 'border-gray-200'}`} onClick={() => setCancellationPolicy('nonrefundable')}>
                  <div>
                    <h3 className="font-semibold">Non-refundable</h3>
                    <p className="text-sm text-gray-600">Pay total price now, no refunds</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-3">Location</h2>
              <div className="bg-gray-200 h-64 rounded-lg flex items-center justify-center">
                <MapPin size={32} className="text-gray-500" />
                <span className="ml-2 text-gray-500">📍 {condo.location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - 1/4 width - Booking sidebar */}
        <div className="lg:w-1/4 bg-white shadow-lg p-6" style={{ height: 'calc(100vh - 64px)', position: 'sticky', top: '64px' }}>
          <div className="space-y-4">
            <div className="text-2xl font-bold text-[#2d568e]">
              {formatPrice(condo.price_per_night)}<span className="text-sm text-gray-500 font-normal">/night</span>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Check-in</label>
              <input type="date" className="w-full border rounded-lg p-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Check-out</label>
              <input type="date" className="w-full border rounded-lg p-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Guests</label>
              <select className="w-full border rounded-lg p-2" value={adults} onChange={(e) => setAdults(Number(e.target.value))}>
                {[1,2,3,4,5,6,7,8].map(n => <option key={n}>{n} Adult{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Promo Code</label>
              <input type="text" placeholder="Enter code" className="w-full border rounded-lg p-2" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between text-sm">
                <span>{formatPrice(condo.price_per_night)} x {nights} nights</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Service fee</span>
                <span>{formatPrice(serviceFee)}</span>
              </div>
              <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              <Shield size={14} className="inline mr-1" /> {getCancellationText()}
            </div>

            <button onClick={() => setShowBookingForm(true)} className="w-full bg-[#2d568e] text-white py-3 rounded-lg font-semibold hover:bg-[#1e3a5f] transition">
              Book Now
            </button>
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {showBookingForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Complete your booking</h2>
              <button onClick={() => setShowBookingForm(false)}><X size={24} /></button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="First Name" className="border rounded-lg p-2" value={guestInfo.firstName} onChange={(e) => setGuestInfo({...guestInfo, firstName: e.target.value})} />
                <input type="text" placeholder="Last Name" className="border rounded-lg p-2" value={guestInfo.lastName} onChange={(e) => setGuestInfo({...guestInfo, lastName: e.target.value})} />
              </div>
              <input type="email" placeholder="Email Address" className="w-full border rounded-lg p-2" value={guestInfo.email} onChange={(e) => setGuestInfo({...guestInfo, email: e.target.value})} />
              <input type="tel" placeholder="Phone Number (e.g., 09171234567)" className="w-full border rounded-lg p-2" value={guestInfo.phone} onChange={(e) => setGuestInfo({...guestInfo, phone: e.target.value})} />
              
              <div className="flex items-center gap-2">
                <input type="checkbox" id="terms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
                <label htmlFor="terms" className="text-sm">I agree to the terms and conditions and cancellation policy</label>
              </div>
              
              <button onClick={handleBookNow} className="w-full bg-[#2d568e] text-white py-3 rounded-lg font-semibold hover:bg-[#1e3a5f] transition">
                Confirm Booking ({formatPrice(total)})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}