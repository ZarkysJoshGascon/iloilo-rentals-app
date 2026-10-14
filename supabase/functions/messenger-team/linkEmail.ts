// supabase/functions/messenger-team/linkEmail.ts
// The email that carries someone's personal Messenger link (mode "email").
// Same look as the contract statement email.

import { type Person, firstName, roleSummary } from '../_shared/messenger.ts'

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') || ''
const FROM_EMAIL       = Deno.env.get('FROM_EMAIL')     || 'onboarding@resend.dev'
const FROM_NAME        = Deno.env.get('FROM_NAME')      || 'Iloilo Rentals'
const DEFAULT_REPLY_TO = Deno.env.get('REPLY_TO_EMAIL') || null
const BRAND_COLOR      = Deno.env.get('BRAND_COLOR')    || '#2d568e'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailConfigured() {
  return !!RESEND_API_KEY
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderHtml(person: Person, url: string, code: string) {
  const step = (n: number, text: string) => `
    <tr>
      <td style="width:28px;padding:6px 0;vertical-align:top;font-size:13px;font-weight:700;color:${BRAND_COLOR};">${n}.</td>
      <td style="padding:6px 0;font-size:14px;line-height:1.6;color:#3f3f46;">${text}</td>
    </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your daily updates on Messenger</title></head>
<body style="margin:0;padding:0;background:#eef1f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <tr><td style="background:${BRAND_COLOR};padding:28px 36px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">Daily updates</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;margin-top:8px;">Your 8am list on Messenger</div>
        </td></tr>
        <tr><td style="padding:32px 36px 8px 36px;">
          <p style="margin:0 0 14px 0;font-size:14px;color:#0a0a0a;">Hi ${escapeHtml(firstName(person.name))},</p>
          <p style="margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#3f3f46;">
            Every morning at 8am, Iloilo Rentals can send you ${escapeHtml(roleSummary(person.role))} on Messenger.
            It takes one tap to turn on:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${step(1, 'Open this email on your phone.')}
            ${step(2, 'Tap <strong>Connect Messenger</strong> below. Messenger opens a chat with our Facebook Page.')}
            ${step(3, 'Tap <strong>Get Started</strong>. A welcome message arrives right away.')}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
            <tr><td style="border-radius:10px;background:${BRAND_COLOR};">
              <a href="${escapeHtml(url)}" target="_blank"
                 style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                Connect Messenger
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 14px 0;font-size:14px;line-height:1.7;color:#3f3f46;">
            Each morning, tap <strong>Got it</strong> on the update. Facebook only lets us message you within
            24 hours of your last reply, so that tap keeps the next one coming.
          </p>
          <p style="margin:0 0 24px 0;font-size:13px;line-height:1.7;color:#71717a;">
            This link is only for you and works for 7 days. If the button doesn't connect you, send our Page
            this message: <strong style="color:#0a0a0a;">connect ${escapeHtml(code)}</strong>
          </p>
          <p style="margin:0 0 32px 0;font-size:14px;line-height:1.7;color:#0a0a0a;">
            Warm regards,<br><strong style="color:${BRAND_COLOR};">The Iloilo Rentals Team</strong>
          </p>
        </td></tr>
        <tr><td style="padding:18px 36px;background:#fbfbfc;border-top:1px solid #f1f3f6;text-align:center;
                       font-size:11px;color:#71717a;">
          Iloilo Rentals · Connecting You to the Best Rentals in Iloilo
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function renderText(person: Person, url: string, code: string) {
  return [
    `Hi ${firstName(person.name)},`,
    '',
    `Every morning at 8am, Iloilo Rentals can send you ${roleSummary(person.role)} on Messenger. It takes one tap to turn on:`,
    '',
    '1. Open this email on your phone.',
    `2. Open this link. Messenger opens a chat with our Facebook Page: ${url}`,
    '3. Tap Get Started. A welcome message arrives right away.',
    '',
    'Each morning, tap "Got it" on the update. Facebook only lets us message you within 24 hours of your last reply, so that tap keeps the next one coming.',
    '',
    `This link is only for you and works for 7 days. If it doesn't connect you, send our Page this message: connect ${code}`,
    '',
    'Warm regards,',
    'The Iloilo Rentals Team',
  ].join('\n')
}

export async function sendLinkEmail(person: Person, url: string, code: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [person.email],
      subject: 'Get your 8am Iloilo Rentals updates on Messenger',
      html: renderHtml(person, url, code),
      text: renderText(person, url, code),
      ...(DEFAULT_REPLY_TO ? { reply_to: DEFAULT_REPLY_TO } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || `Email service returned ${res.status}`)
}
