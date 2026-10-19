// src/lib/api/inquiries.ts
import { supabase } from '@/lib/supabase'
import { uploadPublicFormPhoto, signedInFormHeaders } from './publicUploads'
import { cleanFields } from '@/lib/domain/clean'
import { preparePhoto } from '@/lib/images'

const IMG_BUCKET = 'property-inquiry-images'
// Shrunk in the browser first, so large phone photos (iPhones' are often
// over 5 MB) are fine.
const FORM_PHOTO = { maxWidth: 1400, maxHeight: 2400, quality: 0.85 }

// ------------------------------------------------------------
// Image upload (public — anyone can submit an inquiry)
// ------------------------------------------------------------
export async function uploadInquiryImage(file) {
  if (!file) throw new Error('No file')
  const resized = await preparePhoto(file, FORM_PHOTO)

  // Through a one-time upload link: visitors can't write to the bucket directly.
  return uploadPublicFormPhoto('property', resized)
}

// ------------------------------------------------------------
// Website submit (needs a Google sign-in; the server uses the account's email)
// ------------------------------------------------------------
export async function submitPropertyInquiry(payload) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-property-inquiry`,
    {
      method: 'POST',
      headers: await signedInFormHeaders(),
      body: JSON.stringify({
        owner_name:      payload.owner_name,
        owner_email:     payload.owner_email,
        owner_phone:     payload.owner_phone || '',
        property_type:   payload.property_type || '',
        building:        payload.building || '',
        location:        payload.location || '',
        bedrooms:        payload.bedrooms ?? '',
        bathrooms:       payload.bathrooms ?? '',
        square_meters:   payload.square_meters ?? '',
        price_per_night: payload.price_per_night ?? '',
        inquiry_type:    payload.inquiry_type || 'manage',
        message:         payload.message || '',
        images:          Array.isArray(payload.images) ? payload.images : [],
        website_url:           payload.website_url || '',
        cf_turnstile_token:    payload.cf_turnstile_token || '',
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
export async function listInquiries({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('property_inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function updateInquiry(id, patch) {
  const { data, error } = await supabase
    .from('property_inquiries')
    .update(cleanFields(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInquiry(id) {
  const { error } = await supabase
    .from('property_inquiries')
    .delete()
    .eq('id', id)
  if (error) throw error
}