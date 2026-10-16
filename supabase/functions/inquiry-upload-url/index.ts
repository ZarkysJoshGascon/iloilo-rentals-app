// supabase/functions/inquiry-upload-url/index.ts
// Public endpoint. The List Property and Interior Design forms ask here for a
// one-time upload link per photo, instead of visitors writing to the storage
// buckets directly. The server picks the file name, limits how many links an
// IP can get (stored only as a hash), and the bucket itself only takes
// JPEG, PNG or WebP up to 5 MB.
//
// Body: { form: 'property' | 'interior' }
// Reply: { path, token, url }  then the browser calls
//   supabase.storage.from(bucket).uploadToSignedUrl(path, token, file)
// and sends { path, url } with the form, as before.
//
// Deploy with --no-verify-jwt (visitors aren't signed in).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL)          throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_ROLE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

const BUCKETS: Record<string, string> = {
  property: 'property-inquiry-images',
  interior: 'interior-design-images',
}
// Five photos per form, with room for a few retries.
const MAX_LINKS_PER_HOUR = 25

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + '|inquiry-upload-salt-v1')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// YYYY-MM/<12 random a-z0-9>.jpg: what the submit functions accept.
function newPath(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const name = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
  return `${new Date().toISOString().slice(0, 7)}/${name}.jpg`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  if (Number(req.headers.get('content-length') || 0) > 1000) return json({ error: 'Invalid request' }, 413)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  try {
    const p = await req.json().catch(() => ({}))
    const bucket = BUCKETS[String(p?.form || '')]
    if (!bucket) return json({ error: 'Unknown form' }, 400)

    const remoteIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
    const ipHash = remoteIp ? await hashIp(remoteIp) : null
    if (ipHash) {
      const { data: allowed } = await supabase.rpc('check_inquiry_rate_limit', {
        p_ip_hash: ipHash,
        p_max: MAX_LINKS_PER_HOUR,
        p_window_minutes: 60,
      })
      if (allowed === false) return json({ error: 'Too many uploads. Please try again in an hour.' }, 429)
    }

    const path = newPath()
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
    if (error || !data?.token) {
      console.error('createSignedUploadUrl failed:', error)
      return json({ error: 'Could not prepare the upload' }, 500)
    }

    if (ipHash) await supabase.from('inquiry_rate_limit').insert({ ip_hash: ipHash })

    const url = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
    return json({ path, token: data.token, url })
  } catch (err) {
    console.error('inquiry-upload-url error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
