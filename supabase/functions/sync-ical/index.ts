import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''

// ============================================
// iCal PARSER (RFC 5545 compliant)
// ============================================
interface ICalEvent {
  uid: string
  dtstart: string
  dtend: string
  summary?: string
  description?: string
}

function unfoldLines(text: string): string[] {
  const rawLines = text.split(/\r?\n/)
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.substring(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function parseICal(icalData: string): ICalEvent[] {
  const events: ICalEvent[] = []
  const lines = unfoldLines(icalData)
  let current: Partial<ICalEvent> | null = null
  let inEvent = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') { current = {}; inEvent = true; continue }
    if (trimmed === 'END:VEVENT') {
      if (current?.uid && current.dtstart && current.dtend) {
        events.push(current as ICalEvent)
      }
      current = null; inEvent = false; continue
    }
    if (!inEvent || !current) continue

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const rawKey = line.substring(0, colonIdx)
    const key = rawKey.split(';')[0].toUpperCase()
    const value = line.substring(colonIdx + 1)

    if (key === 'UID') current.uid = value
    else if (key === 'DTSTART') current.dtstart = value
    else if (key === 'DTEND') current.dtend = value
    else if (key === 'SUMMARY') current.summary = value
    else if (key === 'DESCRIPTION') current.description = value
  }

  return events
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null
  const clean = dateStr.replace(/[^0-9TZ]/g, '')
  if (clean.length < 8) return null
  
  const year = clean.substring(0, 4)
  const month = clean.substring(4, 6)
  const day = clean.substring(6, 8)
  
  const y = parseInt(year), m = parseInt(month), d = parseInt(day)
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null
  
  return `${year}-${month}-${day}`
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // AUTH: Require cron secret
    const authHeader = req.headers.get('Authorization') || ''
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch all active feeds
    const { data: feeds, error: feedsError } = await supabase
      .from('ical_feeds')
      .select('id, condo_id, feed_url, channel_name, sync_count')
      .eq('status', 'active')

    if (feedsError) throw feedsError

    const results: any[] = []

    for (const feed of feeds || []) {
      const feedStart = Date.now()
      let created = 0, updated = 0, skipped = 0
      let feedError: string | null = null

      try {
        // Fetch iCal with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const response = await fetch(feed.feed_url, {
          headers: { 'User-Agent': 'IloiloRentals-Sync/1.0' },
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const icalData = await response.text()
        const events = parseICal(icalData)

        for (const event of events) {
          const startDate = parseDate(event.dtstart)
          const endDate = parseDate(event.dtend)
          if (!startDate || !endDate || startDate >= endDate) { skipped++; continue }

          // Check if already synced
          const { data: existing } = await supabase
            .from('bookings')
            .select('id, needs_manual_update')
            .eq('ical_uid', event.uid)
            .eq('condo_id', feed.condo_id)
            .maybeSingle()

          // Build booking data - only set guest_name if specialist hasn't updated it
          const bookingData: any = {
            condo_id: feed.condo_id,
            ical_uid: event.uid,
            source: 'ical',
            channel: feed.channel_name,
            start_date: startDate,
            end_date: endDate,
            status: 'confirmed',
            payment_status: 'paid',
            total_amount: 0,
            subtotal: 0,
            service_fee: 0,
            adults: 1, children: 0, infants: 0, seniors: 0,
            booking_code: `ICAL-${event.uid.substring(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
            updated_at: new Date().toISOString(),
          }

          // Only set placeholder name/flag if not manually updated yet
          if (!existing || existing.needs_manual_update !== false) {
            bookingData.guest_name = `Blocked - ${feed.channel_name}`
            bookingData.needs_manual_update = true
            bookingData.notes = `Auto-imported from ${feed.channel_name}. Update guest details and amount.`
          }

          if (existing) {
            await supabase.from('bookings').update(bookingData).eq('id', existing.id)
            updated++
          } else {
            await supabase.from('bookings').insert({
              ...bookingData,
              created_at: new Date().toISOString(),
            })
            created++
          }
        }

        // Mark feed as synced
        await supabase
          .from('ical_feeds')
          .update({
            last_synced_at: new Date().toISOString(),
            last_error: null,
            status: 'active',
            sync_count: (feed.sync_count || 0) + 1,
          })
          .eq('id', feed.id)

      } catch (err: any) {
        feedError = err.message || 'Unknown error'
        console.error(`Feed ${feed.id} error:`, err)

        await supabase
          .from('ical_feeds')
          .update({ last_error: feedError, status: 'error' })
          .eq('id', feed.id)
      }

      // Log sync result
      await supabase.from('ical_sync_logs').insert({
        feed_id: feed.id,
        status: feedError ? 'error' : 'success',
        events_created: created,
        events_updated: updated,
        events_skipped: skipped,
        error_message: feedError,
        duration_ms: Date.now() - feedStart,
      })

      results.push({
        feedId: feed.id,
        channel: feed.channel_name,
        created, updated, skipped,
        status: feedError ? 'error' : 'success',
        error: feedError,
      })
    }

    return new Response(JSON.stringify({
      success: true,
      duration_ms: Date.now() - startTime,
      feeds_processed: feeds?.length || 0,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})