import { useState } from 'react'
import { X, Lock, CreditCard } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function PayPalPaymentModal({ isOpen, onClose, booking, onSuccess }) {
  const [loading, setLoading] = useState(false)

  if (!isOpen || !booking) return null

  const handlePayPalPayment = async () => {
    setLoading(true)
    try {
      // Call Edge Function - secrets stay server-side
      const { data, error } = await supabase.functions.invoke('paypal-create-order', {
        body: { bookingId: booking.id },
      })

      if (error) {
        console.error('Edge function error:', error)
        throw error
      }

      if (!data.approvalUrl) {
        throw new Error('No approval URL received')
      }

      // Store booking ID for callback
      sessionStorage.setItem('paypal_booking_id', booking.id)

      // Redirect to PayPal
      window.location.href = data.approvalUrl
      
    } catch (error) {
      console.error('Payment error:', error)
      toast.error('Failed to create payment. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Complete Payment</h3>
            <p className="text-sm text-gray-500 mt-0.5">{booking.guest_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">Amount to Pay</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            ₱{booking.total_amount?.toLocaleString()}
          </p>
        </div>

        <button
          onClick={handlePayPalPayment}
          disabled={loading}
          className="w-full py-3.5 bg-[#0070BA] text-white rounded-xl font-bold hover:bg-[#003087] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          <CreditCard size={18} />
          {loading ? 'Redirecting...' : 'Pay with PayPal'}
        </button>

        <div className="mt-3 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
          <Lock size={12} /> Secured by PayPal
        </div>
      </div>
    </div>
  )
}