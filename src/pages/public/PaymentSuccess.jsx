import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, Loader2 } from 'lucide-react'

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('processing')

  useEffect(() => {
    // Webhook handles payment capture server-side.
    // We just wait a few seconds for the webhook to fire, then redirect.
    const timer = setTimeout(() => {
      setStatus('success')
      sessionStorage.removeItem('paypal_booking_id')
      sessionStorage.removeItem('paypal_order_id')
      setTimeout(() => navigate('/my-bookings'), 3000)
    }, 3000)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-md">
        {status === 'processing' && (
          <>
            <Loader2 size={64} className="animate-spin text-[#2d568e] mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">Confirming Payment...</h1>
            <p className="text-gray-500 mt-2">Please wait while we verify your payment</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received!</h1>
            <p className="text-gray-600">Your booking is confirmed.</p>
            <p className="text-gray-400 text-sm mt-2">Redirecting to your bookings...</p>
          </>
        )}
      </div>
    </div>
  )
}