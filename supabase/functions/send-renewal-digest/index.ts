// supabase/functions/send-renewal-digest/index.ts
// Runs daily via pg_cron. Sends one email listing contracts expiring soon.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'admin@iloilorentals.com'
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

interface ExpiringContract {
  contract_id: string
  unit_id: string
  unit_code: string
  building: string
  unit_type: string | null
  effective_date: string | null
  expiry_date: string
  classification: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  days_until_expiry: number
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  })
}

function relativeDays(n: number): string {
  if (n < 0) return `Expired ${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ago`
  if (n === 0) return 'Expires TODAY'
  if (n === 1) return 'Expires tomorrow'
  return `Expires in ${n} days`
}

function bucket(n: number): 'urgent' | 'this_month' | 'soon' {
  if (n <= 7) return 'urgent'
  if (n <= 30) return 'this_month'
  return 'soon'
}

function generateHTML(contracts: ExpiringContract[]): string {
  const urgent    = contracts.filter(c => bucket(c.days_until_expiry) === 'urgent')
  const thisMonth = contracts.filter(c => bucket(c.days_until_expiry) === 'this_month')
  const soon      = contracts.filter(c => bucket(c.days_until_expiry) === 'soon')

  const renderRow = (c: ExpiringContract) => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 13px;">
        ${c.unit_code}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px;">
        ${c.owner_name || '—'}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px;">
        ${formatDate(c.expiry_date)}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; color: ${c.days_until_expiry < 0 ? '#dc2626' : c.days_until_expiry <= 7 ? '#ea580c' : '#6b7280'}; font-weight: 600;">
        ${relativeDays(c.days_until_expiry)}
      </td>
    </tr>
  `

  const renderSection = (title: string, rows: ExpiringContract[], color: string) => {
    if (rows.length === 0) return ''
    return `
      <div style="margin-bottom: 32px;">
        <h2 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: ${color}; margin: 0 0 12px 0; font-weight: 700;">
          ${title} (${rows.length})
        </h2>
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">Unit</th>
              <th style="text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">Owner</th>
              <th style="text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">Expiry</th>
              <th style="text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(renderRow).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="margin: 0; padding: 0; background: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 720px; margin: 0 auto; background: #f4f6f9; padding: 40px 24px;">

          <div style="background: linear-gradient(135deg, #2d568e, #1e3a5f); color: white; padding: 32px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 22px;">Contract Renewal Digest</h1>
            <p style="margin: 6px 0 0 0; opacity: 0.85; font-size: 14px;">
              ${new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })}
            </p>
          </div>

          <div style="background: white; padding: 32px; border-radius: 0 0 12px 12px;">
            <p style="font-size: 14px; color: #374151; margin: 0 0 24px 0;">
              You have <strong>${contracts.length}</strong> contract${contracts.length === 1 ? '' : 's'} expiring in the next 90 days.
            </p>

            ${renderSection('Urgent — Action Needed', urgent, '#dc2626')}
            ${renderSection('This Month', thisMonth, '#ea580c')}
            ${renderSection('Next 90 Days', soon, '#6b7280')}

            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee; text-align: center;">
              <a href="https://iloilorentals.com/admin?tab=registry&filter=renewing"
                 style="display: inline-block; background: #2d568e; color: white; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                Open Renewals Dashboard
              </a>
            </div>
          </div>

          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
            This is an automated digest from Iloilo Rentals Management System.
          </p>
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
    // Auth: only the cron job can invoke this
    const authHeader = req.headers.get('Authorization') || ''
    const expected = `Bearer ${CRON_SECRET}`
    if (!CRON_SECRET || authHeader !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: contracts, error } = await supabase
      .from('v_expiring')
      .select('*')

    if (error) throw error

    const list = (contracts || []) as ExpiringContract[]

    if (list.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: false, reason: 'no expiring contracts' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = generateHTML(list)

    const subject = `⚠️ ${list.length} contract${list.length === 1 ? '' : 's'} expiring soon`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Iloilo Rentals <${FROM_EMAIL}>`,
        to: [ADMIN_EMAIL],
        subject,
        html,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Resend error:', data)
      throw new Error(data.message || 'Failed to send digest')
    }

    return new Response(JSON.stringify({
      ok: true,
      sent: true,
      count: list.length,
      emailId: data.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('Digest error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})