import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('processing')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const capturePayment = async () => {
      const orderId = searchParams.get('token')
      
      if (!orderId) {
        setStatus('error')
        setMessage('No payment token found')
        return
      }
      
      try {
        // Call Edge Function to capture (server-side secure)
        const { data, error } = await supabase.functions.invoke('paypal-capture-order', {
          body: { orderId },
        })

        if (error) throw error

        if (data.success) {
          setStatus('success')
          sessionStorage.removeItem('paypal_booking_id')
          setTimeout(() => navigate('/my-bookings'), 3000)
        } else {
          setStatus('error')
          setMessage(data.error || 'Payment failed')
        }
      } catch (error) {
        console.error('Capture error:', error)
        setStatus('error')
        setMessage(error.message || 'Payment capture failed')
      }
    }
    
    capturePayment()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-md">
        {status === 'processing' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#2d568e] border-t-transparent mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">Processing Payment...</h1>
            <p className="text-gray-500 mt-2">Please wait while we confirm your payment</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
            <p className="text-gray-600">Your booking has been confirmed.</p>
            <p className="text-gray-400 text-sm mt-2">Redirecting to your bookings...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={64} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h1>
            <p className="text-gray-600">{message}</p>
            <button onClick={() => navigate('/my-bookings')} className="mt-4 px-6 py-2 bg-[#2d568e] text-white rounded-lg hover:bg-[#1e3a5f]">
              Go to My Bookings
            </button>
          </>
        )}
      </div>
    </div>
  )
}