// supabase/functions/send-promo-campaign/index.ts
// Admin-only. Sends a promo/marketing email to a list of past guests.
// Premium template matching the booking confirmation style.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const FROM_EMAIL            = Deno.env.get('FROM_EMAIL')      || 'onboarding@resend.dev'
const FROM_NAME             = Deno.env.get('FROM_NAME')       || 'Iloilo Rentals'
const DEFAULT_REPLY_TO      = Deno.env.get('REPLY_TO_EMAIL')  || null
const BRAND_COLOR           = Deno.env.get('BRAND_COLOR')     || '#2d568e'
const PUBLIC_SITE_URL       = Deno.env.get('PUBLIC_SITE_URL') || 'https://iloilorental.com'
const LOGO_URL              = Deno.env.get('EMAIL_LOGO_URL')  || ''

if (!RESEND_API_KEY)        throw new Error('RESEND_API_KEY is required')
if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const EMAIL_RE       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_SUBJECT    = 200
const MAX_BODY       = 20_000
const MAX_RECIPIENTS = 500
const MAX_BODY_BYTES = 3_000_000  // ✅ FIX: 3 MB request cap

// ================================================================
// HELPERS
// ================================================================
function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function sanitizeText(input: unknown, max: number, allowNewlines = false): string {
  if (input == null) return ''
  let s = String(input)
  s = s.replace(
    allowNewlines
      ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
      : /[\u0000-\u001F\u007F]/g,
    '',
  )
  if (!allowNewlines) s = s.replace(/\s+/g, ' ')
  return s.trim().slice(0, max)
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

function headerPattern(color = 'rgba(255,255,255,0.10)'): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='2' cy='2' r='1.2' fill='${color}'/></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

function footerPattern(color = 'rgba(45,86,142,0.04)'): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><circle cx='1' cy='1' r='0.9' fill='${color}'/></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

function applyTokens(text: string, tokens: Record<string, string>): string {
  if (!text) return ''
  return text.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key) => {
    const v = tokens[key]
    return v == null ? '' : String(v)
  })
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => {
      const safe = escapeHtml(para).replace(/\n/g, '<br/>')
      return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#52525b;letter-spacing:-0.1px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${safe}</p>`
    })
    .join('')
}

// ================================================================
// PREMIUM EMAIL TEMPLATE
// ================================================================
function renderPromoHtml({
  greeting,
  bodyHtml,
  signoff1,
  signoff2,
  imageUrl,
  imageAlt,
  unsubscribeUrl,
}: {
  greeting: string
  bodyHtml: string
  signoff1: string
  signoff2: string
  imageUrl: string | null
  imageAlt: string | null
  unsubscribeUrl: string | null
}): string {
  const brandDark = mixHex(BRAND_COLOR, '#000000', 0.28)
  const brandDeep = mixHex(BRAND_COLOR, '#000000', 0.45)

  const imageBlock = imageUrl
    ? `<div style="margin:28px 0 8px 0;text-align:center;">
         <img src="${escapeHtml(imageUrl)}"
              alt="${escapeHtml(imageAlt || '')}"
              width="600"
              style="display:inline-block;max-width:100%;width:100%;height:auto;
                     border:0;outline:none;text-decoration:none;
                     border-radius:14px;-ms-interpolation-mode:bicubic;" />
       </div>`
    : ''

  const unsubscribeLine = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}"
          style="color:#a1a1aa;text-decoration:underline;font-size:11px;">
         Unsubscribe
       </a>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Iloilo Rentals</title>
  <!--[if mso]>
  <style>body, table, td { font-family: Arial, sans-serif !important; }</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#eef1f6;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">

  <div style="display:none;font-size:0;line-height:0;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(greeting)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#eef1f6;">
    <tr>
      <td align="center" style="padding:56px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;
                      box-shadow:0 1px 3px rgba(15,23,42,0.06),
                                 0 12px 32px rgba(15,23,42,0.08),
                                 0 40px 80px rgba(15,23,42,0.06);">

          <tr>
            <td style="padding:0;background:${brandDeep};
                       background-image:${headerPattern()},
                                        linear-gradient(135deg,${BRAND_COLOR} 0%,${brandDark} 60%,${brandDeep} 100%);
                       background-size:24px 24px,100% 100%;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:52px 32px 20px 32px;text-align:center;">

                    ${LOGO_URL ? `
                      <div style="text-align:center;margin:0 0 22px 0;line-height:0;">
                        <img src="${escapeHtml(LOGO_URL)}"
                             alt="Iloilo Rentals"
                             width="190"
                             style="display:inline-block;width:190px;max-width:190px;height:auto;
                                    border:0;outline:none;text-decoration:none;
                                    -ms-interpolation-mode:bicubic;
                                    filter:drop-shadow(0 8px 20px rgba(0,0,0,0.30));" />
                      </div>
                    ` : `
                      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                                  font-size:24px;font-weight:800;color:#ffffff;
                                  letter-spacing:-0.5px;margin:0 0 22px 0;">
                        Iloilo Rentals
                      </div>
                    `}

                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 40px 32px;text-align:center;">

                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                                font-size:10px;color:rgba(255,255,255,0.65);
                                text-transform:uppercase;letter-spacing:2.4px;font-weight:700;
                                margin:0 0 12px 0;">
                      A Note From Us
                    </div>

                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                                font-size:24px;line-height:1.3;color:#ffffff;
                                font-weight:700;letter-spacing:-0.5px;
                                text-shadow:0 1px 2px rgba(0,0,0,0.08);">
                      ${escapeHtml(greeting)}
                    </div>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:44px 44px 8px 44px;
                       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

              ${bodyHtml}

              ${imageBlock}

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

              <div style="margin:32px 0 0 0;font-size:14px;line-height:1.75;color:#0a0a0a;">
                <span style="color:#d4d4d8;font-size:18px;line-height:1;">&mdash;</span><br/>
                <span style="color:#71717a;font-size:13px;">${escapeHtml(signoff1)}</span><br/>
                <strong style="color:${brandDark};font-weight:700;letter-spacing:-0.2px;font-size:15px;">
                  ${escapeHtml(signoff2)}
                </strong>
              </div>

            </td>
          </tr>

          <tr>
            <td style="padding:36px 44px 40px 44px;
                       background:${footerPattern()};
                       background-color:#fbfbfc;background-size:20px 20px,100% 100%;
                       border-top:1px solid #f1f3f6;">

              <div style="text-align:center;
                          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

                <div style="font-size:12px;color:#52525b;font-weight:700;
                            letter-spacing:0.4px;margin:0 0 6px 0;">
                  ILOILO RENTALS
                </div>

                <div style="font-size:11px;color:#a1a1aa;line-height:1.7;letter-spacing:0.05px;">
                  Connecting You to the Best Rentals in Iloilo
                </div>

                ${unsubscribeLine ? `
                  <div style="margin-top:16px;font-size:10.5px;color:#c4c4c8;line-height:1.7;
                              letter-spacing:0.1px;">
                    You're receiving this because you booked with us before.<br/>
                    ${unsubscribeLine}
                  </div>
                ` : ''}

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

function renderPromoText({
  greeting, body, signoff1, signoff2, unsubscribeUrl,
}: {
  greeting: string
  body: string
  signoff1: string
  signoff2: string
  unsubscribeUrl: string | null
}): string {
  const lines = [
    greeting,
    '',
    body,
    '',
    '—',
    signoff1,
    signoff2,
    '',
    "You're receiving this because you booked with us before.",
  ]
  if (unsubscribeUrl) {
    lines.push(`Unsubscribe: ${unsubscribeUrl}`)
  }
  return lines.join('\n')
}

function makeUnsubscribeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
}

async function sendOneEmail({
  to, subject, html, text, replyTo,
}: {
  to: string
  subject: string
  html: string
  text: string
  replyTo: string | null
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      to:      [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || `Resend HTTP ${res.status}`)
  return data
}

// ================================================================
// HANDLER
// ================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  // ✅ FIX: reject oversized bodies before parsing JSON.
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: 'Request body too large' }, 413)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  try {
    // ---- 1. Auth: admin only -----------------------------------------
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

    // ---- 2. Parse + validate -----------------------------------------
    const p = await req.json().catch(() => ({}))
    const campaignName = sanitizeText(p.name, 120) || 'Untitled campaign'
    const subject      = sanitizeText(p.subject, MAX_SUBJECT)
    const greeting     = sanitizeText(p.greeting, 300)
    const bodyRaw      = sanitizeText(p.body, MAX_BODY, true)
    const signoff1     = sanitizeText(p.signoff1, 200) || 'Warm regards,'
    const signoff2     = sanitizeText(p.signoff2, 200) || 'Iloilo Rentals'
    const imageAlt     = p.image_alt ? sanitizeText(p.image_alt, 200) : null
    const replyTo      = sanitizeText(p.reply_to, 254) || DEFAULT_REPLY_TO

    // ✅ FIX: reject any image_url that isn't from our email-assets bucket.
    // Prevents tracking-pixel injection and SSRF via the campaign image.
    const imageUrlRaw = p.image_url ? sanitizeText(p.image_url, 1000) : null
    let imageUrl: string | null = null
    if (imageUrlRaw) {
      const allowedPrefix = `${SUPABASE_URL}/storage/v1/object/public/email-assets/`
      if (!imageUrlRaw.startsWith(allowedPrefix)) {
        return json({ error: 'image_url must be from our email-assets storage bucket' }, 400)
      }
      imageUrl = imageUrlRaw
    }

    if (!subject)  return json({ error: 'Subject is required' }, 400)
    if (!greeting) return json({ error: 'Greeting is required' }, 400)
    if (!bodyRaw)  return json({ error: 'Message body is required' }, 400)

    const recipients = Array.isArray(p.recipients) ? p.recipients : []
    if (recipients.length === 0) return json({ error: 'No recipients selected' }, 400)
    if (recipients.length > MAX_RECIPIENTS) {
      return json({ error: `Max ${MAX_RECIPIENTS} recipients per batch. Split into smaller sends.` }, 400)
    }

    const normalized: { email: string; name: string }[] = []
    for (const r of recipients) {
      const email = sanitizeText(r?.email, 254).toLowerCase()
      const name  = sanitizeText(r?.name, 120)
      if (!EMAIL_RE.test(email)) continue
      normalized.push({ email, name })
    }
    if (normalized.length === 0) {
      return json({ error: 'No valid recipient emails' }, 400)
    }

    // ---- 3. Create the campaign row ----------------------------------
    const { data: campaign, error: campErr } = await supabase
      .from('email_campaigns')
      .insert({
        name: campaignName,
        subject,
        body_html: '',
        body_text: '',
        image_url: imageUrl,
        reply_to: replyTo,
        recipient_count: normalized.length,
        status: 'sending',
        created_by: user.id,
        created_by_email: user.email,
      })
      .select('id')
      .single()

    if (campErr || !campaign) {
      console.error('campaign insert failed:', campErr)
      return json({ error: 'Failed to create campaign' }, 500)
    }

    // ---- 4. Loop recipients ------------------------------------------
    let sent = 0
    let failed = 0
    let skippedOptedOut = 0
    let skippedThrottled = 0
    const failures: { email: string; error: string }[] = []
    let sampleHtml = ''
    let sampleText = ''

    for (const { email, name } of normalized) {
      const { data: optedOut } = await supabase.rpc('is_email_opted_out', { p_email: email })
      if (optedOut) {
        skippedOptedOut++
        continue
      }

      const { data: recent } = await supabase.rpc('recent_email_exists', {
        p_guest_email: email, p_seconds: 30,
      })
      if (recent) {
        skippedThrottled++
        continue
      }

      const tokens = { guest_name: name || 'Guest', guest_email: email }
      const personalizedSubject  = applyTokens(subject, tokens)
      const personalizedGreeting = applyTokens(greeting, tokens)
      const personalizedBody     = applyTokens(bodyRaw, tokens)

      const unsubToken = makeUnsubscribeToken()
      const unsubscribeUrl = `${PUBLIC_SITE_URL}/unsubscribe?token=${unsubToken}&email=${encodeURIComponent(email)}`

      const html = renderPromoHtml({
        greeting: personalizedGreeting,
        bodyHtml: bodyToHtml(personalizedBody),
        signoff1, signoff2,
        imageUrl, imageAlt,
        unsubscribeUrl,
      })
      const text = renderPromoText({
        greeting: personalizedGreeting,
        body: personalizedBody,
        signoff1, signoff2,
        unsubscribeUrl,
      })

      if (!sampleHtml) { sampleHtml = html; sampleText = text }

      const { data: logRow, error: logErr } = await supabase
        .from('email_logs')
        .insert({
          booking_id:        null,
          guest_email:       email,
          guest_name:        name || null,
          subject:           personalizedSubject,
          body_html:         html,
          body_text:         text,
          reply_to:          replyTo,
          template_key:      'promo_campaign',
          campaign_id:       campaign.id,
          unsubscribe_token: unsubToken,
          status:            'queued',
          sent_by:           user.id,
          sent_by_email:     user.email,
        })
        .select('id')
        .single()

      if (logErr) {
        console.error('log insert failed for', email, logErr)
        failed++
        failures.push({ email, error: 'Log write failed' })
        continue
      }

      try {
        const res = await sendOneEmail({
          to: email, subject: personalizedSubject,
          html, text, replyTo,
        })

        await supabase.from('email_logs').update({
          status: 'sent',
          resend_id: res?.id || null,
          sent_at: new Date().toISOString(),
        }).eq('id', logRow.id)

        sent++
      } catch (err: any) {
        console.error('send failed for', email, err)
        await supabase.from('email_logs').update({
          status: 'failed',
          error_message: String(err?.message || err).slice(0, 500),
        }).eq('id', logRow.id)
        failed++
        failures.push({ email, error: String(err?.message || err).slice(0, 200) })
      }
    }

    // ---- 5. Finalize campaign ----------------------------------------
    await supabase.from('email_campaigns').update({
      body_html: sampleHtml,
      body_text: sampleText,
      sent_count: sent,
      failed_count: failed,
      status: failed === normalized.length && sent === 0 ? 'failed' : 'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', campaign.id)

    return json({
      ok: true,
      campaign_id: campaign.id,
      recipient_count: normalized.length,
      sent,
      failed,
      skipped_opted_out: skippedOptedOut,
      skipped_throttled: skippedThrottled,
      failures: failures.slice(0, 20),
    })

  } catch (err) {
    console.error('send-promo-campaign error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}