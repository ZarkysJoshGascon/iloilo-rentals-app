import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(id: string, limit = 20, windowMs = 60000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(id)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(id, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

function formatCurrency(amount: number) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function generateConfirmationHTML(booking: any, condo: any): string {
  const checkIn = new Date(booking.start_date).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const checkOut = new Date(booking.end_date).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const nights = Math.ceil((new Date(booking.end_date).getTime() - new Date(booking.start_date).getTime()) / 86400000)

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; }
          .header { background: linear-gradient(135deg, #2d568e, #1e3a5f); color: #fff; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 26px; }
          .header p { margin: 8px 0 0; opacity: 0.85; font-size: 14px; }
          .body { padding: 30px; }
          .badge { display: inline-block; background: #d1fae5; color: #065f46; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; }
          .greeting { font-size: 16px; color: #1a202c; margin: 20px 0 10px; }
          .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eef1f5; font-size: 14px; }
          .row:last-child { border-bottom: none; }
          .label { color: #6b7280; }
          .value { color: #1a202c; font-weight: 600; text-align: right; }
          .total { font-size: 20px; font-weight: bold; color: #2d568e; text-align: right; margin-top: 12px; padding-top: 12px; border-top: 2px solid #2d568e; }
          .note { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; font-size: 13px; color: #78350f; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; padding: 24px; color: #9ca3af; font-size: 12px; background: #f9fafb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Booking Confirmed</h1>
            <p>Iloilo Rentals</p>
          </div>
          <div class="body">
            <div style="text-align:center;">
              <span class="badge">✓ RESERVATION CONFIRMED</span>
            </div>
            <p class="greeting">Hi ${booking.guest_name},</p>
            <p style="color:#4b5563; font-size: 14px; line-height: 1.6;">
              Thank you for your booking! We're excited to host you in Iloilo City. Below are your reservation details.
            </p>

            <div class="card">
              <div class="row"><span class="label">Booking Code</span><span class="value">${booking.booking_code}</span></div>
              <div class="row"><span class="label">Property</span><span class="value">${condo?.title || 'Condo'}</span></div>
              <div class="row"><span class="label">Check-in</span><span class="value">${checkIn}</span></div>
              <div class="row"><span class="label">Check-out</span><span class="value">${checkOut}</span></div>
              <div class="row"><span class="label">Nights</span><span class="value">${nights}</span></div>
            </div>

            <div class="card">
              <div class="row"><span class="label">Subtotal</span><span class="value">${formatCurrency(booking.subtotal || 0)}</span></div>
              <div class="row"><span class="label">Service Fee</span><span class="value">${formatCurrency(booking.service_fee || 0)}</span></div>
              <div class="total">Total: ${formatCurrency(booking.total_amount || 0)}</div>
            </div>

            <div class="note">
              ⏳ <strong>Payment Pending:</strong> This is a placeholder confirmation. Your official receipt will be sent after payment is completed.
            </div>

            <p style="color:#6b7280; font-size: 13px; line-height: 1.6;">
              If you have any questions, reply to this email or contact us directly.
            </p>
            <p style="color:#1a202c; font-size: 14px; margin-top: 24px;">
              Safe travels,<br>
              <strong>The Iloilo Rentals Team</strong>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply directly.</p>
            <p>© ${new Date().getFullYear()} Iloilo Rentals. All rights reserved.</p>
          </div>
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

    const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
    if (!checkRateLimit(clientIp)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { bookingId } = await req.json()
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'bookingId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch booking + condo
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

    // Check if user owns this booking (unless admin)
    const { data: adminData } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!adminData && booking.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Skip if already sent (idempotent)
    if (booking.confirmation_sent_at) {
      return new Response(JSON.stringify({ success: true, alreadySent: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!booking.guest_email) {
      return new Response(JSON.stringify({ error: 'No guest email on booking' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = generateConfirmationHTML(booking, booking.condos)

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Iloilo Rentals <${FROM_EMAIL}>`,
        to: [booking.guest_email],
        subject: `Booking Confirmed — ${booking.booking_code}`,
        html,
      }),
    })

    const emailData = await emailResponse.json()

    if (!emailResponse.ok) {
      console.error('Resend error:', emailData)
      throw new Error(emailData.message || 'Failed to send email')
    }

    // Mark as sent
    await supabase
      .from('bookings')
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq('id', bookingId)

    return new Response(JSON.stringify({ 
      success: true, 
      emailId: emailData.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})