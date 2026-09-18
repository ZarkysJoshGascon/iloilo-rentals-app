import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const POLL_INTERVAL = 2000
const MAX_WAIT_MS = 60000

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('token') || sessionStorage.getItem('paypal_order_id')
  const [status, setStatus] = useState('processing')
  const [bookingCode, setBookingCode] = useState(null)

  useEffect(() => {
    if (!orderId) {
      setStatus('timeout')
      return
    }

    let cancelled = false
    const startedAt = Date.now()

    const poll = async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('status, booking_id, bookings:booking_id (booking_code, payment_status)')
        .eq('paypal_order_id', orderId)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.error('Payment poll error:', error)
      }

      const paid =
        data?.status === 'paid' ||
        data?.bookings?.payment_status === 'paid'

      if (paid) {
        setStatus('success')
        setBookingCode(data?.bookings?.booking_code || null)
        sessionStorage.removeItem('paypal_booking_id')
        sessionStorage.removeItem('paypal_order_id')
        setTimeout(() => navigate('/my-bookings'), 3000)
        return
      }

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        setStatus('timeout')
        return
      }

      setTimeout(poll, POLL_INTERVAL)
    }

    poll()
    return () => { cancelled = true }
  }, [orderId, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center p-8 max-w-md w-full">
        {status === 'processing' && (
          <>
            <Loader2 size={64} className="animate-spin text-[#2d568e] mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">Confirming Payment...</h1>
            <p className="text-gray-500 mt-2">Please wait while we verify your payment with PayPal.</p>
            <p className="text-gray-400 text-xs mt-4">Don't close this tab</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received!</h1>
            {bookingCode && (
              <p className="text-gray-600 font-mono text-sm mb-1">{bookingCode}</p>
            )}
            <p className="text-gray-600">Your booking is confirmed and paid.</p>
            <p className="text-gray-400 text-sm mt-4">Redirecting to your bookings...</p>
          </>
        )}

        {status === 'timeout' && (
          <>
            <AlertCircle size={64} className="text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Still Processing</h1>
            <p className="text-gray-600 mb-6">
              We haven't received payment confirmation yet. PayPal sometimes takes a
              minute to notify us. Check your bookings in a moment — if your payment
              went through, the booking will show as paid.
            </p>
            <button
              onClick={() => navigate('/my-bookings')}
              className="inline-flex items-center gap-2 bg-[#2d568e] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition"
            >
              Go to My Bookings <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}