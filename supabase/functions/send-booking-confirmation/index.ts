// supabase/functions/send-booking-confirmation/index.ts
// Admin-only. Renders the booking confirmation email from the booking
// record (server-side), sends via Resend, logs to email_logs.
//
// The client CANNOT override subject/body/greeting. That's intentional.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const FROM_EMAIL            = Deno.env.get('FROM_EMAIL')     || 'onboarding@resend.dev'
const FROM_NAME             = Deno.env.get('FROM_NAME')      || 'Iloilo Rentals'
const DEFAULT_REPLY_TO      = Deno.env.get('REPLY_TO_EMAIL') || null
const BRAND_COLOR           = Deno.env.get('BRAND_COLOR')    || '#2d568e'

// ════════════════════════════════════════════════════════════════════
// LOGO URL — public Supabase Storage URL. Must load in a browser.
// ════════════════════════════════════════════════════════════════════
const LOGO_URL = 'https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/hero-images/Iloilo_Rentals_img.png'

const CHECKIN_TIME  = '3:00 PM'
const CHECKOUT_TIME = '11:00 AM'

if (!RESEND_API_KEY)        throw new Error('RESEND_API_KEY is required')
if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function mixHex(a: string, b: string, amount: number): string {
  const parse = (h: string) => {
    let s = h.replace('#', '').trim()
    if (s.length === 3) s = s.split('').map((c) => c + c).join('')
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    }
  }
  const A = parse(a)
  const B = parse(b)
  const r  = Math.round(A.r + (B.r - A.r) * amount)
  const g  = Math.round(A.g + (B.g - A.g) * amount)
  const bl = Math.round(A.b + (B.b - A.b) * amount)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

function formatDateLong(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function formatMoney(n: number | string | null): string {
  const v = Number(n || 0)
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function computeNights(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn + 'T00:00:00Z').getTime()
  const b = new Date(checkOut + 'T00:00:00Z').getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

// ---------------------------------------------------------------
// SVG pattern — subtle dot grid, URL-encoded for inline use.
// This gives the header a premium "textured" feel without images.
// ---------------------------------------------------------------
function headerPattern(color = 'rgba(255,255,255,0.10)'): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='2' cy='2' r='1.2' fill='${color}'/></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

function footerPattern(color = 'rgba(45,86,142,0.04)'): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><circle cx='1' cy='1' r='0.9' fill='${color}'/></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

// ---------------------------------------------------------------
// Email rendering
// ---------------------------------------------------------------
function renderBookingConfirmationHtml({
  guestName,
  bookingCode,
  unitCode,
  building,
  unitType,
  checkIn,
  checkOut,
  guests,
  nights,
  totalAmount,
  amountPaid,
  balance,
  notes,
}: {
  guestName: string
  bookingCode: string
  unitCode: string
  building: string
  unitType: string | null
  checkIn: string
  checkOut: string
  guests: number
  nights: number
  totalAmount: string
  amountPaid: string
  balance: string
  notes: string | null
}): string {
  const brandDark = mixHex(BRAND_COLOR, '#000000', 0.28)
  const brandDeep = mixHex(BRAND_COLOR, '#000000', 0.45)

  // Split the guest name for the "Hi," + big-name treatment
  const firstName = (guestName || 'Guest').split(' ')[0]

  // ── Reusable row builders ─────────────────────────────────
  const row = (label: string, value: string, isLast = false) => `
    <tr>
      <td style="padding:13px 0;font-size:12.5px;color:#71717a;width:150px;vertical-align:top;
                 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                 letter-spacing:0.1px;${isLast ? '' : 'border-bottom:1px solid #f1f3f6;'}">
        ${escapeHtml(label)}
      </td>
      <td style="padding:13px 0;font-size:14px;color:#0a0a0a;font-weight:600;letter-spacing:-0.15px;
                 text-align:right;
                 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                 ${isLast ? '' : 'border-bottom:1px solid #f1f3f6;'}">
        ${escapeHtml(value)}
      </td>
    </tr>`

  const amountRow = (label: string, value: string, bold = false, isLast = false) => `
    <tr>
      <td style="padding:${bold ? '11px 0 4px 0' : '7px 0'};font-size:${bold ? '14px' : '13px'};
                 color:${bold ? '#0a0a0a' : '#71717a'};
                 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:${bold ? '11px 0 4px 0' : '7px 0'};
                 font-size:${bold ? '17px' : '14px'};text-align:right;
                 color:${bold ? brandDark : '#0a0a0a'};
                 ${bold ? 'font-weight:800;letter-spacing:-0.3px;' : 'font-weight:500;'}
                 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        ${escapeHtml(value)}
      </td>
    </tr>`

  const nightsLabel = nights === 1 ? '1 night' : `${nights} nights`
  const guestsLabel = guests === 1 ? '1 guest' : `${guests} guests`
  const unitLine    = `${unitCode}${building ? ` · ${building}` : ''}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Booking Confirmed · Iloilo Rentals</title>
  <!--[if mso]>
  <style>body, table, td { font-family: Arial, sans-serif !important; }</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#eef1f6;-webkit-font-smoothing:antialiased;
             -moz-osx-font-smoothing:grayscale;">

  <!-- Preheader (inbox preview text) -->
  <div style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden;mso-hide:all;">
    Your stay at ${escapeHtml(unitCode)} is confirmed · ${escapeHtml(bookingCode)}
  </div>

  <!-- Background -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#eef1f6;">
    <tr>
      <td align="center" style="padding:56px 16px;">

        <!-- Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;
                      box-shadow:0 1px 3px rgba(15,23,42,0.06),
                                 0 12px 32px rgba(15,23,42,0.08),
                                 0 40px 80px rgba(15,23,42,0.06);">

          <!-- ═══════════════════════════════════════════════
               HERO HEADER — gradient + pattern + logo
          ═════════════════════════════════════════════════ -->
          <tr>
            <td style="padding:0;background:${brandDeep};
                       background-image:${headerPattern()},
                                        linear-gradient(135deg,${BRAND_COLOR} 0%,${brandDark} 60%,${brandDeep} 100%);
                       background-size:24px 24px,100% 100%;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:52px 32px 20px 32px;text-align:center;">

                    <!-- Logo, centered, elevated -->
                    <div style="text-align:center;margin:0 0 22px 0;line-height:0;">
                      <img src="${LOGO_URL}"
                           alt="Iloilo Rentals"
                           width="190"
                           style="display:inline-block;width:190px;max-width:190px;height:auto;
                                  border:0;outline:none;text-decoration:none;
                                  -ms-interpolation-mode:bicubic;
                                  filter:drop-shadow(0 8px 20px rgba(0,0,0,0.30));" />
                    </div>

                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 40px 32px;text-align:center;">

                    <!-- Eyebrow -->
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                                font-size:10px;color:rgba(255,255,255,0.65);
                                text-transform:uppercase;letter-spacing:2.4px;font-weight:700;
                                margin:0 0 12px 0;">
                      Reservation Confirmed
                    </div>

                    <!-- Big welcome line -->
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                                font-size:26px;line-height:1.25;color:#ffffff;
                                font-weight:700;letter-spacing:-0.6px;
                                text-shadow:0 1px 2px rgba(0,0,0,0.08);">
                      We'll see you in Iloilo.
                    </div>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══════════════════════════════════════════════
               BODY
          ═════════════════════════════════════════════════ -->
          <tr>
            <td style="padding:44px 44px 8px 44px;
                       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

              <!-- Greeting -->
              <p style="margin:0 0 4px 0;font-size:14px;color:#71717a;letter-spacing:-0.1px;">
                Hi ${escapeHtml(firstName)},
              </p>
              <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.35;color:#0a0a0a;
                         font-weight:700;letter-spacing:-0.4px;">
                Your stay is all set.
              </h1>
              <p style="margin:0 0 34px 0;font-size:14.5px;line-height:1.75;color:#52525b;letter-spacing:-0.1px;">
                Thank you for choosing Iloilo Rentals. Below you'll find everything you need
                for a smooth arrival — your dates, your unit, and your payment summary.
              </p>

              <!-- ─── Stay details section ──────────────── -->
              <div style="margin:0 0 12px 0;
                          font-size:10px;color:#a1a1aa;
                          text-transform:uppercase;letter-spacing:1.8px;font-weight:700;">
                Your Stay
              </div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#fbfbfc;border-radius:16px;border:1px solid #ebedf2;
                            box-shadow:0 1px 2px rgba(15,23,42,0.03);">
                <tr>
                  <td style="padding:20px 26px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${row('Booking code', bookingCode)}
                      ${row('Unit', unitLine)}
                      ${unitType ? row('Type', unitType) : ''}
                      ${row('Check-in', `${formatDateLong(checkIn)} · from ${CHECKIN_TIME}`)}
                      ${row('Check-out', `${formatDateLong(checkOut)} · by ${CHECKOUT_TIME}`)}
                      ${row('Guests', `${guestsLabel} · ${nightsLabel}`, true)}
                    </table>
                  </td>
                </tr>
              </table>

              <div style="height:22px;"></div>

              <!-- ─── Payment section ──────────────────── -->
              <div style="margin:0 0 12px 0;
                          font-size:10px;color:#a1a1aa;
                          text-transform:uppercase;letter-spacing:1.8px;font-weight:700;">
                Payment
              </div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#fbfbfc;border-radius:16px;border:1px solid #ebedf2;
                            box-shadow:0 1px 2px rgba(15,23,42,0.03);">
                <tr>
                  <td style="padding:20px 26px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${amountRow('Total amount', totalAmount)}
                      ${amountRow('Amount paid', amountPaid)}
                      <tr>
                        <td colspan="2" style="padding:10px 0 0 0;">
                          <div style="border-top:1px dashed #e4e6ec;"></div>
                        </td>
                      </tr>
                      ${amountRow('Balance due', balance, true, true)}
                    </table>
                  </td>
                </tr>
              </table>

              ${notes ? `
                <div style="height:22px;"></div>
                <div style="margin:0 0 12px 0;
                            font-size:10px;color:#a1a1aa;
                            text-transform:uppercase;letter-spacing:1.8px;font-weight:700;">
                  Notes
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="background:#fbfbfc;border-radius:16px;border:1px solid #ebedf2;">
                  <tr>
                    <td style="padding:18px 26px;">
                      <p style="margin:0;font-size:13.5px;line-height:1.75;color:#52525b;
                                white-space:pre-wrap;letter-spacing:-0.05px;">
                        ${escapeHtml(notes)}
                      </p>
                    </td>
                  </tr>
                </table>
              ` : ''}

              <!-- ─── Divider with decorative dots ─────── -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin:36px 0 0 0;">
                <tr>
                  <td align="center" style="padding:0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 6px;"><div style="width:4px;height:4px;border-radius:2px;background:#d4d4d8;"></div></td>
                        <td style="padding:0 6px;"><div style="width:4px;height:4px;border-radius:2px;background:#a1a1aa;"></div></td>
                        <td style="padding:0 6px;"><div style="width:4px;height:4px;border-radius:2px;background:#d4d4d8;"></div></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Help / Sign-off -->
              <p style="margin:32px 0 0 0;font-size:14px;line-height:1.75;color:#52525b;
                        letter-spacing:-0.1px;">
                Questions before you arrive? Just hit reply — a real person reads every message.
              </p>

              <div style="margin:32px 0 0 0;font-size:14px;line-height:1.75;color:#0a0a0a;">
                <span style="color:#d4d4d8;font-size:18px;line-height:1;">&mdash;</span><br/>
                <span style="color:#71717a;font-size:13px;">Warm regards,</span><br/>
                <strong style="color:${brandDark};font-weight:700;letter-spacing:-0.2px;font-size:15px;">
                  The Iloilo Rentals Team
                </strong>
              </div>

            </td>
          </tr>

          <!-- ═══════════════════════════════════════════════
               FOOTER — pattern + two lines
          ═════════════════════════════════════════════════ -->
          <tr>
            <td style="padding:36px 44px 40px 44px;
                       background:${footerPattern()};
                       background-color:#fbfbfc;background-size:20px 20px,100% 100%;
                       border-top:1px solid #f1f3f6;">

              <div style="text-align:center;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

                <!-- Wordmark -->
                <div style="font-size:12px;color:#52525b;font-weight:700;
                            letter-spacing:0.4px;margin:0 0 6px 0;">
                  ILOILO RENTALS
                </div>

                <!-- Tagline -->
                <div style="font-size:11px;color:#a1a1aa;line-height:1.7;letter-spacing:0.05px;">
                  Connecting You to the Best Rentals in Iloilo
                </div>

                <!-- Legal -->
                <div style="margin-top:14px;font-size:10.5px;color:#c4c4c8;line-height:1.7;
                            letter-spacing:0.1px;">
                  This email confirms your reservation and is not an official receipt.
                </div>

              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function renderBookingConfirmationText({
  guestName, bookingCode, unitCode, building, unitType,
  checkIn, checkOut, guests, nights, totalAmount, amountPaid, balance, notes,
}: any): string {
  const nightsLabel = nights === 1 ? '1 night' : `${nights} nights`
  const guestsLabel = guests === 1 ? '1 guest' : `${guests} guests`
  const lines = [
    `Hi ${guestName},`,
    ``,
    `Thank you for booking with Iloilo Rentals! Here are your stay details:`,
    ``,
    `  Booking code:  ${bookingCode}`,
    `  Unit:          ${unitCode}${building ? ` (${building})` : ''}${unitType ? ` · ${unitType}` : ''}`,
    `  Check-in:      ${formatDateLong(checkIn)} · from ${CHECKIN_TIME}`,
    `  Check-out:     ${formatDateLong(checkOut)} · by ${CHECKOUT_TIME}`,
    `  Guests:        ${guestsLabel} · ${nightsLabel}`,
    ``,
    `  Total amount:  ${totalAmount}`,
    `  Amount paid:   ${amountPaid}`,
    `  Balance:       ${balance}`,
  ]
  if (notes) {
    lines.push('', 'Notes:', notes)
  }
  lines.push(
    '',
    `If you have any questions before your arrival, just reply to this email — we read every message.`,
    '',
    `Warm regards,`,
    `The Iloilo Rentals Team`,
    '',
    `—`,
    `Iloilo Rentals`,
    `Connecting You to the Best Rentals in Iloilo`,
    `This email confirms your reservation and is not an official receipt.`,
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------
// Handler
// ---------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing auth token' }, 401)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid session' }, 401)

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!adminRow) return json({ error: 'Not an admin' }, 403)

    const body = await req.json().catch(() => ({}))
    const bookingId = typeof body.booking_id === 'string' ? body.booking_id : null
    if (!bookingId) return json({ error: 'booking_id is required' }, 400)

    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select(`
        id, booking_code, guest_name, guest_email, guests,
        check_in, check_out, total_amount, amount_paid, balance,
        notes, deleted_at, unit_id,
        units:unit_id ( id, unit_code, building, unit_type )
      `)
      .eq('id', bookingId)
      .maybeSingle()

    if (bErr) {
      console.error('booking fetch error:', bErr)
      return json({ error: 'Failed to load booking' }, 500)
    }
    if (!booking) return json({ error: 'Booking not found' }, 404)
    if (booking.deleted_at) return json({ error: 'Booking has been deleted' }, 400)

    const guestEmail = (booking.guest_email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(guestEmail)) {
      return json({ error: 'Booking has no valid guest email' }, 400)
    }

    const guestName   = booking.guest_name || 'Guest'
    const bookingCode = booking.booking_code || '—'
    const unitCode    = booking.units?.unit_code || '—'
    const building    = booking.units?.building || ''
    const unitType    = booking.units?.unit_type || null
    const checkIn     = booking.check_in || ''
    const checkOut    = booking.check_out || ''
    const guests      = Number(booking.guests || 1)
    const nights      = computeNights(checkIn, checkOut)
    const totalAmount = formatMoney(booking.total_amount)
    const amountPaid  = formatMoney(booking.amount_paid)
    const balance     = formatMoney(booking.balance)
    const notes       = booking.notes || null

    const subject = `Your booking is confirmed — ${bookingCode}`

    const html = renderBookingConfirmationHtml({
      guestName, bookingCode, unitCode, building, unitType,
      checkIn, checkOut, guests, nights, totalAmount, amountPaid, balance, notes,
    })
    const text = renderBookingConfirmationText({
      guestName, bookingCode, unitCode, building, unitType,
      checkIn, checkOut, guests, nights, totalAmount, amountPaid, balance, notes,
    })

    const { data: recent } = await supabase.rpc('recent_email_exists', {
      p_guest_email: guestEmail,
      p_seconds: 30,
    })
    if (recent) {
      return json({ error: 'Please wait 30 seconds before emailing this guest again.' }, 429)
    }

    const { data: logRow, error: logErr } = await supabase
      .from('email_logs')
      .insert({
        booking_id:    booking.id,
        guest_email:   guestEmail,
        guest_name:    guestName,
        subject,
        body_html:     html,
        body_text:     text,
        reply_to:      DEFAULT_REPLY_TO,
        template_key:  'booking_confirmation',
        status:        'queued',
        sent_by:       user.id,
        sent_by_email: user.email,
      })
      .select('id')
      .single()

    if (logErr) {
      console.error('log insert failed:', logErr)
      return json({ error: 'Failed to queue email' }, 500)
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [guestEmail],
        subject,
        html,
        text,
        ...(DEFAULT_REPLY_TO ? { reply_to: DEFAULT_REPLY_TO } : {}),
      }),
    })

    const resendData = await resendRes.json().catch(() => ({}))

    if (!resendRes.ok) {
      await supabase.from('email_logs').update({
        status: 'failed',
        error_message: resendData?.message || `HTTP ${resendRes.status}`,
      }).eq('id', logRow.id)

      console.error('Resend error:', resendData)
      return json({ error: resendData?.message || 'Failed to send email' }, 502)
    }

    await supabase.from('email_logs').update({
      status:    'sent',
      resend_id: resendData?.id || null,
      sent_at:   new Date().toISOString(),
    }).eq('id', logRow.id)

    return json({
      ok:       true,
      id:       resendData?.id,
      log_id:   logRow.id,
      to:       guestEmail,
      subject,
    })
  } catch (err) {
    console.error('send-booking-confirmation error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}