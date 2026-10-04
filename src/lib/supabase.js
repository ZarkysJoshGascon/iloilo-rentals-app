// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || typeof supabaseUrl !== 'string') {
  throw new Error(
    '[supabase] Missing VITE_SUPABASE_URL. Set it in your .env file and restart the dev server.'
  )
}
if (!supabaseAnonKey || typeof supabaseAnonKey !== 'string') {
  throw new Error(
    '[supabase] Missing VITE_SUPABASE_ANON_KEY. Set it in your .env file and restart the dev server.'
  )
}
if (!/^https?:\/\//.test(supabaseUrl)) {
  throw new Error(
    `[supabase] VITE_SUPABASE_URL must be an absolute URL (got "${supabaseUrl}").`
  )
}

// Fail fast if someone accidentally drops a service-role key in here.
// Service role keys are JWTs; anon keys are too, but the payload has a "role" claim.
// src/lib/supabase.js
try {
  const payload = JSON.parse(atob(supabaseAnonKey.split('.')[1] || ''))
  if (payload?.role && payload.role !== 'anon') {
    throw new Error(
      `[supabase] VITE_SUPABASE_ANON_KEY has role "${payload.role}". Only the anon key belongs in the browser.`
    )
  }
} catch (err) {
  if (err?.message?.startsWith('[supabase]')) throw err
  // non-JWT key — skip validation
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})