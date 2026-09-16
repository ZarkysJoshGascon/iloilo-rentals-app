// supabase/functions/paypal-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PAYPAL_WEBHOOK_ID = Deno.env.get('PAYPAL_WEBHOOK_ID')!
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID')!
const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET')!
const PAYPAL_MODE = Deno.env.get('PAYPAL_MODE') || 'sandbox'
const PAYPAL_API_URL = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string
): Promise<boolean> {
  try {
    const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)
    const tokenRes = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: 'grant_type=client_credentials',
    })
    const { access_token } = await tokenRes.json()

    const verifyRes = await fetch(`${PAYPAL_API_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        auth_algo: headers.get('paypal-auth-algo'),
        cert_url: headers.get('paypal-cert-url'),
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        transmission_time: headers.get('paypal-transmission-time'),
        webhook_id: PAYPAL_WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody),
      }),
    })

    const { verification_status } = await verifyRes.json()
    return verification_status === 'SUCCESS'
  } catch (error) {
    console.error('Webhook verification error:', error)
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const rawBody = await req.text()

    // Verify webhook signature (security)
    const isValid = await verifyWebhookSignature(req.headers, rawBody)
    if (!isValid) {
      console.error('Invalid webhook signature')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
    }

    const event = JSON.parse(rawBody)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const eventType = event.event_type
    const resource = event.resource

    console.log(`Webhook received: ${eventType}`)

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const orderId = resource.supplementary_data?.related_ids?.order_id
        const captureId = resource.id
        const payerId = resource.payer?.payer_id
        const payerEmail = resource.payer?.email_address

        if (orderId) {
          await supabase
            .from('payments')
            .update({
              status: 'paid',
              paypal_capture_id: captureId,
              paypal_payer_id: payerId,
              paypal_payer_email: payerEmail,
              webhook_received_at: new Date().toISOString(),
              paid_at: new Date().toISOString(),
            })
            .eq('paypal_order_id', orderId)

          // Update booking
          const { data: payment } = await supabase
            .from('payments')
            .select('booking_id')
            .eq('paypal_order_id', orderId)
            .maybeSingle()

          if (payment?.booking_id) {
            await supabase
              .from('bookings')
              .update({
                payment_status: 'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('id', payment.booking_id)
          }
        }
        break
      }

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        const orderId = resource.supplementary_data?.related_ids?.order_id
        const reason = resource.status_details?.reason || 'Payment denied'

        if (orderId) {
          await supabase
            .from('payments')
            .update({
              status: 'failed',
              failure_reason: reason,
              webhook_received_at: new Date().toISOString(),
            })
            .eq('paypal_order_id', orderId)

          const { data: payment } = await supabase
            .from('payments')
            .select('booking_id')
            .eq('paypal_order_id', orderId)
            .maybeSingle()

          if (payment?.booking_id) {
            await supabase
              .from('bookings')
              .update({ payment_status: 'unpaid' })
              .eq('id', payment.booking_id)
          }
        }
        break
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        const captureId = resource.id
        const refundAmount = resource.amount?.value

        await supabase
          .from('payments')
          .update({
            refunded_at: new Date().toISOString(),
            refund_amount: refundAmount ? parseFloat(refundAmount) : null,
            status: 'refunded',
            webhook_received_at: new Date().toISOString(),
          })
          .eq('paypal_capture_id', captureId)
        break
      }

      case 'PAYMENT.CAPTURE.REVERSED': {
        const captureId = resource.id
        await supabase
          .from('payments')
          .update({
            status: 'reversed',
            webhook_received_at: new Date().toISOString(),
          })
          .eq('paypal_capture_id', captureId)
        break
      }

      default:
        console.log(`Unhandled event type: ${eventType}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})