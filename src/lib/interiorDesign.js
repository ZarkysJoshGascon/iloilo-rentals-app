// src/lib/interiorDesign.js
import { supabase } from './supabase'

const IMG_BUCKET = 'interior-design-images'
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']

// ------------------------------------------------------------
// Image upload
// ------------------------------------------------------------
export async function uploadInteriorImage(file) {
  if (!file) throw new Error('No file')
  if (file.size > MAX_FILE_BYTES) throw new Error('Image must be under 5 MB')
  if (!ALLOWED_MIMES.includes(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP images are allowed')
  }

  // Magic byte check
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const hex = Array.from(head).map((b) => b.toString(16).padStart(2, '0')).join('')
  const isJpeg = hex.startsWith('ffd8ff')
  const isPng  = hex.startsWith('89504e470d0a1a0a')
  const isWebp = hex.startsWith('52494646') && hex.slice(16, 24) === '57454250'
  if (!isJpeg && !isPng && !isWebp) throw new Error('File is not a valid image')

  const resized = await resizeImage(file, 1400, 0.85)

  const rand = crypto.getRandomValues(new Uint8Array(8))
    .reduce((s, b) => s + b.toString(36).padStart(2, '0'), '')
    .slice(0, 12)
  const path = `${new Date().toISOString().slice(0, 7)}/${rand}.jpg`

  const { error: upErr } = await supabase.storage
    .from(IMG_BUCKET)
    .upload(path, resized, {
      cacheControl: '31536000',
      upsert: false,
      contentType: 'image/jpeg',
    })
  if (upErr) throw upErr

  const { data } = supabase.storage.from(IMG_BUCKET).getPublicUrl(path)
  return { path, url: data.publicUrl }
}

async function resizeImage(file, maxW, quality) {
  const img = await new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('Failed to load image'))
    i.src = URL.createObjectURL(file)
  })
  const scale = Math.min(1, maxW / img.width)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  URL.revokeObjectURL(img.src)

  return new Promise((res, rej) => {
    canvas.toBlob(
      (blob) => (blob ? res(blob) : rej(new Error('Resize failed'))),
      'image/jpeg',
      quality,
    )
  })
}

// ------------------------------------------------------------
// Submit via Edge Function
// ------------------------------------------------------------
export async function submitInteriorInquiry(payload) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-interior-inquiry`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    .update(patch)
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