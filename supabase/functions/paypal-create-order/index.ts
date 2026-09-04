import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID')!
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PAYPAL_API_URL = 'https://api-m.sandbox.paypal.com'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { bookingId } = await req.json()
    
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'bookingId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Get auth user from request
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get booking from DB - verify ownership
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, condos:condo_id(title, code)')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single()

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found or unauthorized' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if already paid
    if (booking.payment_status === 'paid') {
      return new Response(JSON.stringify({ error: 'Already paid' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get PayPal access token
    const authResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
      },
      body: 'grant_type=client_credentials',
    })

    const authData = await authResponse.json()

    if (!authResponse.ok) {
      console.error('PayPal auth error:', authData)
      throw new Error(authData.error_description || 'PayPal authentication failed')
    }

    const accessToken = authData.access_token

    // Create PayPal order with DB price (server-side - secure)
    const orderResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'PayPal-Request-Id': `booking-${bookingId}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: bookingId,
          description: `Booking - ${booking.condos?.title || 'Condo Rental'}`,
          amount: {
            currency_code: 'PHP',
            value: Number(booking.total_amount).toFixed(2),
          },
        }],
        application_context: {
          brand_name: 'Iloilo Rentals',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: `${req.headers.get('origin')}/payment/success`,
          cancel_url: `${req.headers.get('origin')}/payment/cancel`,
        },
      }),
    })

    const orderData = await orderResponse.json()

    if (!orderResponse.ok) {
      console.error('PayPal order error:', orderData)
      throw new Error(orderData.message || 'Failed to create PayPal order')
    }

    // Save pending payment record
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        user_id: user.id,
        condo_id: booking.condo_id,
        amount: booking.total_amount,
        currency: 'PHP',
        payment_method: 'paypal',
        status: 'pending',
        paypal_order_id: orderData.id,
        description: `Booking ${booking.booking_code || 'BK'}`,
      })

    if (paymentError) {
      console.error('Payment insert error:', paymentError)
      throw paymentError
    }

    const approvalUrl = orderData.links?.find((link: any) => link.rel === 'approve')?.href

    return new Response(JSON.stringify({
      orderId: orderData.id,
      approvalUrl: approvalUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})