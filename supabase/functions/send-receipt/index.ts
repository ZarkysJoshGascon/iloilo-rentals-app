import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'receipts@iloilorentals.com'

// Rate limiting map
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(identifier: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(identifier)
  
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs })
    return true
  }
  
  if (entry.count >= limit) {
    return false
  }
  
  entry.count++
  return true
}

function generateReceiptHTML(receipt: any, booking: any): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; background: #fff; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #2d568e; }
          .receipt-title { font-size: 20px; font-weight: bold; margin-top: 10px; }
          .receipt-number { color: #666; font-size: 14px; margin-top: 5px; }
          .section { margin-bottom: 25px; }
          .section-title { font-weight: bold; color: #2d568e; border-bottom: 2px solid #2d568e; padding-bottom: 5px; margin-bottom: 15px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .label { color: #666; }
          .value { font-weight: bold; text-align: right; }
          .total { font-size: 20px; font-weight: bold; color: #2d568e; text-align: right; margin-top: 20px; padding-top: 15px; border-top: 2px solid #2d568e; }
          .footer { text-align: center; margin-top: 40px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Iloilo Rentals</div>
          <div class="receipt-title">Booking Receipt</div>
          <div class="receipt-number">Receipt #: ${receipt.receipt_number}</div>
        </div>

        <div class="section">
          <div class="section-title">Guest Information</div>
          <div class="row"><span class="label">Name</span><span class="value">${receipt.guest_name}</span></div>
          <div class="row"><span class="label">Email</span><span class="value">${receipt.guest_email}</span></div>
          <div class="row"><span class="label">Booking Code</span><span class="value">${booking.booking_code}</span></div>
        </div>

        <div class="section">
          <div class="section-title">Booking Details</div>
          <div class="row"><span class="label">Condo</span><span class="value">${receipt.condo_title}</span></div>
          <div class="row"><span class="label">Check-in</span><span class="value">${receipt.check_in}</span></div>
          <div class="row"><span class="label">Check-out</span><span class="value">${receipt.check_out}</span></div>
          <div class="row"><span class="label">Nights</span><span class="value">${receipt.nights}</span></div>
          <div class="row"><span class="label">Guests</span><span class="value">${receipt.guests_count}</span></div>
        </div>

        <div class="section">
          <div class="section-title">Payment Summary</div>
          <div class="row"><span class="label">Subtotal</span><span class="value">₱${Number(receipt.subtotal).toLocaleString()}</span></div>
          <div class="row"><span class="label">Service Fee</span><span class="value">₱${Number(receipt.service_fee).toLocaleString()}</span></div>
          <div class="total">Total Paid: ₱${Number(receipt.total_amount).toLocaleString()}</div>
        </div>

        <div class="footer">
          <p>Thank you for booking with Iloilo Rentals!</p>
          <p>This is an electronic receipt. No signature required.</p>
          <p>For questions, contact us at info@iloilorentals.com</p>
        </div>
      </body>
    </html>
  `
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get auth user
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user is admin
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!adminData) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
    if (!checkRateLimit(clientIp, 10, 60000)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { bookingId } = await req.json()
    
    if (!bookingId || typeof bookingId !== 'string') {
      return new Response(JSON.stringify({ error: 'bookingId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get booking with condo info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, condos:condo_id(title, code)')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if receipt already exists
    const { data: existingReceipt } = await supabase
      .from('receipts')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle()

    let receipt = existingReceipt

    if (!receipt) {
      const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`
      
      const nights = Math.ceil((new Date(booking.end_date).getTime() - new Date(booking.start_date).getTime()) / 86400000)
      const guestsCount = booking.adults + booking.children + booking.infants + booking.seniors

      const { data: newReceipt, error: insertError } = await supabase
        .from('receipts')
        .insert({
          booking_id: bookingId,
          receipt_number: receiptNumber,
          guest_name: booking.guest_name,
          guest_email: booking.guest_email,
          condo_id: booking.condo_id,
          condo_title: booking.condos?.title || '',
          check_in: booking.start_date,
          check_out: booking.end_date,
          nights,
          guests_count: guestsCount,
          subtotal: booking.subtotal,
          service_fee: booking.service_fee,
          total_amount: booking.total_amount,
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError
      receipt = newReceipt
    }

    // Generate HTML
    const html = generateReceiptHTML(receipt, booking)

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Iloilo Rentals <${FROM_EMAIL}>`,
        to: [receipt.guest_email],
        subject: `Receipt for your booking - ${booking.booking_code}`,
        html,
      }),
    })

    const emailData = await emailResponse.json()

    if (!emailResponse.ok) {
      // Update receipt status to failed
      await supabase
        .from('receipts')
        .update({ status: 'failed' })
        .eq('id', receipt.id)
      
      throw new Error(emailData.message || 'Failed to send email')
    }

    // Update receipt status
    await supabase
      .from('receipts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', receipt.id)

    // Update booking
    await supabase
      .from('bookings')
      .update({ 
        receipt_number: receipt.receipt_number,
        receipt_sent_at: new Date().toISOString(),
        receipt_email: receipt.guest_email,
      })
      .eq('id', bookingId)

    return new Response(JSON.stringify({ 
      success: true, 
      receiptNumber: receipt.receipt_number,
      emailId: emailData.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})