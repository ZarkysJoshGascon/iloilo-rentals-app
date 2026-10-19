// src/lib/api/interiorDesign.ts
import { supabase } from '@/lib/supabase'
import { uploadPublicFormPhoto, signedInFormHeaders } from './publicUploads'
import { cleanFields } from '@/lib/domain/clean'
import { preparePhoto } from '@/lib/images'

const IMG_BUCKET = 'interior-design-images'
// Shrunk in the browser first, so large phone photos (iPhones' are often
// over 5 MB) are fine.
const FORM_PHOTO = { maxWidth: 1400, maxHeight: 2400, quality: 0.85 }

// ------------------------------------------------------------
// Image upload
// ------------------------------------------------------------
export async function uploadInteriorImage(file) {
  if (!file) throw new Error('No file')
  const resized = await preparePhoto(file, FORM_PHOTO)

  // Through a one-time upload link: visitors can't write to the bucket directly.
  return uploadPublicFormPhoto('interior', resized)
}

// ------------------------------------------------------------
// Submit via Edge Function
// ------------------------------------------------------------
export async function submitInteriorInquiry(payload) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-interior-inquiry`,
    {
      method: 'POST',
      // Needs a Google sign-in; the server uses the account's email.
      headers: await signedInFormHeaders(),
      body: JSON.stringify({
        client_name:       payload.client_name,
        client_email:      payload.client_email,
        client_phone:      payload.client_phone || '',
        property_type:     payload.property_type || '',
        property_address:  payload.property_address || '',
        service_type:      payload.service_type || '',
        room_scope:        payload.room_scope || '',
        budget_range:      payload.budget_range || '',
        timeline:          payload.timeline || '',
        message:           payload.message || '',
        images:            Array.isArray(payload.images) ? payload.images : [],
        website_url:       payload.website_url || '',
        cf_turnstile_token: payload.cf_turnstile_token || '',
      }),
    },
  )

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Submission failed (${res.status})`)
  return data
}

// ------------------------------------------------------------
// Admin queries
// ------------------------------------------------------------
export async function listInteriorInquiries({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('interior_design_inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function updateInteriorInquiry(id, patch) {
  const { data, error } = await supabase
    .from('interior_design_inquiries')
    .update(cleanFields(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInteriorInquiry(id) {
  const { error } = await supabase
    .from('interior_design_inquiries')
    .delete()
    .eq('id', id)
  if (error) throw error
}