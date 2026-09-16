import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID')!
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PAYPAL_API_URL = 'https://api-m.sandbox.paypal.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId } = await req.json()
    
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'orderId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('paypal_order_id', orderId)
      .eq('user_id', user.id)
      .single()

    if (paymentError || !payment) {
      return new Response(JSON.stringify({ error: 'Payment record not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (payment.status === 'paid') {
      return new Response(JSON.stringify({ success: true, alreadyPaid: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authResponse = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
      },
      body: 'grant_type=client_credentials',
    })

    const authData = await authResponse.json()
    const accessToken = authData.access_token

    const captureResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    const captureData = await captureResponse.json()

    if (!captureResponse.ok) {
      if (captureData.name === 'UNPROCESSABLE_ENTITY' && 
          captureData.details?.some((d: any) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
        
        const orderStatusResponse = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        const orderStatusData = await orderStatusResponse.json()
        const captureId = orderStatusData.purchase_units?.[0]?.payments?.captures?.[0]?.id

        await supabase
          .from('payments')
          .update({ status: 'paid', paypal_capture_id: captureId, paid_at: new Date().toISOString() })
          .eq('id', payment.id)

        await supabase
          .from('bookings')
          .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', payment.booking_id)

        return new Response(JSON.stringify({ success: true, status: 'COMPLETED' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      
      throw new Error(captureData.message || 'Failed to capture payment')
    }

    const capturedAmount = parseFloat(captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value)
    const expectedAmount = parseFloat(payment.amount)

    if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
      return new Response(JSON.stringify({ error: 'Amount mismatch' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const captureId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.id

    await supabase
      .from('payments')
      .update({ status: 'paid', paypal_capture_id: captureId, paid_at: new Date().toISOString() })
      .eq('id', payment.id)

    // ✅ FIX: Update payment_status but NOT status (stays 'pending')
    await supabase
      .from('bookings')
      .update({ 
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        // status stays 'pending' - admin will confirm manually
      })
      .eq('id', payment.booking_id)

    return new Response(JSON.stringify({ success: true, status: captureData.status, captureId }), {
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