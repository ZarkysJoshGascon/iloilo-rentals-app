// src/lib/cleanings.js
import { supabase } from './supabase'

const BUCKET = 'cleaning-photos'
const MAX_FILE_BYTES = 15 * 1024 * 1024  // 15 MB
const SIGNED_URL_TTL = 60 * 60           // 1 hour

// ============================================================
// FILE VALIDATION — magic bytes, not mime-type string
// ============================================================
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function hexFromBytes(bytes, start = 0, length = 12) {
  return Array.from(bytes.slice(start, start + length))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Read the first 12 bytes of the file and sniff the actual format.
 * Returns one of: 'image/jpeg' | 'image/png' | 'image/webp' | null
 */
async function sniffImageMime(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const hex = hexFromBytes(head)

  // JPEG: FF D8 FF
  if (hex.startsWith('ffd8ff')) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png'
  // WebP: "RIFF" .... "WEBP"
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp'

  return null
}

async function validateImageFile(file) {
  if (!(file instanceof File) && !(file instanceof Blob)) {
    throw new Error('Invalid file')
  }
  if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large (max 15 MB)')
  }
  const mime = await sniffImageMime(file)
  if (!mime || !ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new Error('Unsupported image format. Use JPEG, PNG, or WebP.')
  }
  return mime
}

// ============================================================
// QUERIES
// ============================================================
export async function listCleanings({ status, type, housekeeperId, search } = {}) {
  let query = supabase
    .from('cleanings')
    .select(`
      *,
      units:unit_id ( id, unit_code, building ),
      bookings:booking_id ( id, booking_code, guest_name, check_in, check_out ),
      housekeepers:housekeeper_id ( id, code, name, photo_url )
    `)
    .order('scheduled_date', { ascending: false, nullsFirst: false })

  if (status && status !== 'all') query = query.eq('status', status)
  if (type && type !== 'all') query = query.eq('type', type)
  if (housekeeperId && housekeeperId !== 'all') query = query.eq('housekeeper_id', housekeeperId)

  if (search && search.trim()) {
    const s = search.trim().slice(0, 100)
    query = query.or(`notes.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getCleaning(id) {
  const { data, error } = await supabase
    .from('cleanings')
    .select(`
      *,
      units:unit_id ( id, unit_code, building ),
      bookings:booking_id ( id, booking_code, guest_name, check_in, check_out ),
      housekeepers:housekeeper_id ( id, code, name, photo_url )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createCleaning(payload) {
  const { data, error } = await supabase
    .from('cleanings')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCleaning(id, patch) {
  const { data, error } = await supabase
    .from('cleanings')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCleaning(id) {
  try {
    const { data: cleaning } = await supabase
      .from('cleanings')
      .select(`
        photos_before, photos_after, photos_report,
        amenities_used_photo, amenities_replaced_photo,
        laundry_used_photo, laundry_replaced_photo
      `)
      .eq('id', id)
      .single()

    if (cleaning) {
      const paths = []
      for (const p of cleaning.photos_before || []) if (p.path) paths.push(p.path)
      for (const p of cleaning.photos_after || []) if (p.path) paths.push(p.path)
      for (const p of cleaning.photos_report || []) if (p.path) paths.push(p.path)
      if (cleaning.amenities_used_photo?.path) paths.push(cleaning.amenities_used_photo.path)
      if (cleaning.amenities_replaced_photo?.path) paths.push(cleaning.amenities_replaced_photo.path)
      if (cleaning.laundry_used_photo?.path) paths.push(cleaning.laundry_used_photo.path)
      if (cleaning.laundry_replaced_photo?.path) paths.push(cleaning.laundry_replaced_photo.path)
      if (paths.length > 0) {
        await supabase.storage.from(BUCKET).remove(paths)
      }
    }
  } catch (err) {
    console.warn('Failed to clean up photos before delete:', err)
  }

  const { error } = await supabase.from('cleanings').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// IMAGE COMPRESSION — validates first, then re-encodes to JPEG
// ============================================================
export async function compressImage(file, { maxDimension = 1600, quality = 0.72 } = {}) {
  // Reject anything that isn't actually a supported image, before we
  // even spin up canvas. This blocks SVG, PDF, executables, etc.
  await validateImageFile(file)

  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = (e) => { img.src = e.target.result }
    reader.onerror = () => reject(new Error('Failed to read file'))
    img.onload = () => {
      let { width, height } = img
      const maxSide = Math.max(width, height)
      if (maxSide > maxDimension) {
        const scale = maxDimension / maxSide
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Compression failed'))
        // Attach original filename for downstream error messages
        try { blob.name = file.name || 'photo.jpg' } catch { /* read-only on some browsers */ }
        resolve(blob)
      }, 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    reader.readAsDataURL(file)
  })
}

function randomId() {
  // crypto-based, ~16 chars
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16)
}

// ============================================================
// PHOTO UPLOAD — stores path only, no public URL
// ============================================================
export async function uploadCleaningPhoto({ cleaningId, file, category }) {
  const validCategories = [
    'before', 'after', 'report',
    'amenities_used', 'amenities_replaced',
    'laundry_used', 'laundry_replaced',
  ]
  if (!validCategories.includes(category)) {
    throw new Error('Invalid photo category')
  }

  const compressed = await compressImage(file)
  const filename = `${randomId()}.jpg`
  const path = `${cleaningId}/${category}/${filename}`

  const { error: uploadErr } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, compressed, {
      cacheControl: '31536000',
      upsert: false,
      contentType: 'image/jpeg',
    })
  if (uploadErr) throw uploadErr

  // NOTE: we no longer call getPublicUrl(). The bucket is private and
  // URLs are generated on-demand via createSignedUrl().
  return {
    path,
    uploaded_at: new Date().toISOString(),
    size: compressed.size,
  }
}

// ============================================================
// SIGNED URLS — short-lived, per-request
// ============================================================
export async function getSignedUrl(path, expiresIn = SIGNED_URL_TTL) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) throw error
  return data?.signedUrl || null
}

export async function getSignedUrls(paths, expiresIn = SIGNED_URL_TTL) {
  const clean = (paths || []).filter(Boolean)
  if (clean.length === 0) return {}
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(clean, expiresIn)
  if (error) throw error
  const map = {}
  for (const row of data || []) {
    if (row?.path && row?.signedUrl) map[row.path] = row.signedUrl
  }
  return map
}

export async function deleteCleaningPhoto(path) {
  if (!path) return
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// ============================================================
// HIGH-LEVEL PHOTO OPS (CRM admin panels — live edit)
// ============================================================
export async function addPhotoToCleaning(cleaning, category, file) {
  const photo = await uploadCleaningPhoto({
    cleaningId: cleaning.id,
    file,
    category,
  })

  const columnMap = {
    before: 'photos_before',
    after: 'photos_after',
    report: 'photos_report',
  }
  const column = columnMap[category]
  const current = Array.isArray(cleaning[column]) ? cleaning[column] : []
  const next = [...current, photo]

  await updateCleaning(cleaning.id, { [column]: next })
  return photo
}

export async function removePhotoFromCleaning(cleaning, category, path) {
  const columnMap = {
    before: 'photos_before',
    after: 'photos_after',
    report: 'photos_report',
  }
  const column = columnMap[category]
  const current = Array.isArray(cleaning[column]) ? cleaning[column] : []
  const next = current.filter((p) => p.path !== path)

  await updateCleaning(cleaning.id, { [column]: next })
  try {
    await deleteCleaningPhoto(path)
  } catch (err) {
    console.warn('Failed to delete photo from storage:', err)
  }
}

// ============================================================
// LIST PARSERS
// ============================================================
export function parseInventory(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      name: typeof x.name === 'string' ? x.name.slice(0, 80) : '',
      quantity: Number(x.quantity) || 0,
      note: typeof x.note === 'string' ? x.note.slice(0, 200) : '',
    }))
    .filter((x) => x.name.length > 0)
}

// Kept as an alias for backwards compat — same as parseInventory
export function parseLaundryItems(raw) {
  return parseInventory(raw)
}

// ============================================================
// LAUNDRY PAYMENT RPC
// ============================================================
export async function updateLaundryPayment({
  cleaningId,
  amount,
  method,
  reference,
  note,
}) {
  if (!cleaningId) throw new Error('Missing cleaning')
  const amt = Number(amount)
  if (!amt || amt <= 0) throw new Error('Amount must be greater than 0')
  if (!method || !method.trim()) throw new Error('Payment method is required')

  const { error } = await supabase.rpc('update_laundry_payment', {
    p_cleaning_id: cleaningId,
    p_amount: amt,
    p_method: method.trim().slice(0, 60),
    p_reference: reference?.trim()?.slice(0, 100) || null,
    p_note: note?.trim()?.slice(0, 2000) || null,
  })
  if (error) throw error
}

// ============================================================
// SUBMIT — housekeeper side
// ============================================================
export async function submitCleaning({
  cleaning,
  newPhotosBefore = [],
  newPhotosAfter = [],
  newPhotosReport = [],
  newAmenitiesUsedPhoto = null,
  newAmenitiesReplacedPhoto = null,
  newLaundryUsedPhoto = null,
  newLaundryReplacedPhoto = null,
  keepPhotosBefore,
  keepPhotosAfter,
  keepPhotosReport,
  amenitiesUsedItems = [],
  amenitiesReplacedItems = [],
  laundryUsedItems = [],
  laundryReplacedItems = [],
  laundryPaymentAmount = null,
  laundryPaymentMethod = null,
  laundryPaymentReference = null,
  laundryPaymentNote = null,
  notes = '',
}) {
  const id = cleaning.id

  // Upload multi-photo batches
  const beforeUploaded = []
  for (const file of newPhotosBefore) {
    const photo = await uploadCleaningPhoto({ cleaningId: id, file, category: 'before' })
    beforeUploaded.push(photo)
  }
  const afterUploaded = []
  for (const file of newPhotosAfter) {
    const photo = await uploadCleaningPhoto({ cleaningId: id, file, category: 'after' })
    afterUploaded.push(photo)
  }
  const reportUploaded = []
  for (const file of newPhotosReport) {
    const photo = await uploadCleaningPhoto({ cleaningId: id, file, category: 'report' })
    reportUploaded.push(photo)
  }

  const existingBefore = Array.isArray(cleaning.photos_before) ? cleaning.photos_before : []
  const existingAfter = Array.isArray(cleaning.photos_after) ? cleaning.photos_after : []
  const existingReport = Array.isArray(cleaning.photos_report) ? cleaning.photos_report : []

  const finalBefore = keepPhotosBefore !== undefined ? [...keepPhotosBefore, ...beforeUploaded] : [...existingBefore, ...beforeUploaded]
  const finalAfter = keepPhotosAfter !== undefined ? [...keepPhotosAfter, ...afterUploaded] : [...existingAfter, ...afterUploaded]
  const finalReport = keepPhotosReport !== undefined ? [...keepPhotosReport, ...reportUploaded] : [...existingReport, ...reportUploaded]

  // Single-photo categories
  let amenitiesUsedPhoto = cleaning.amenities_used_photo || null
  if (newAmenitiesUsedPhoto) {
    amenitiesUsedPhoto = await uploadCleaningPhoto({ cleaningId: id, file: newAmenitiesUsedPhoto, category: 'amenities_used' })
    if (cleaning.amenities_used_photo?.path) deleteCleaningPhoto(cleaning.amenities_used_photo.path).catch(() => {})
  }

  let amenitiesReplacedPhoto = cleaning.amenities_replaced_photo || null
  if (newAmenitiesReplacedPhoto) {
    amenitiesReplacedPhoto = await uploadCleaningPhoto({ cleaningId: id, file: newAmenitiesReplacedPhoto, category: 'amenities_replaced' })
    if (cleaning.amenities_replaced_photo?.path) deleteCleaningPhoto(cleaning.amenities_replaced_photo.path).catch(() => {})
  }

  let laundryUsedPhoto = cleaning.laundry_used_photo || null
  if (newLaundryUsedPhoto) {
    laundryUsedPhoto = await uploadCleaningPhoto({ cleaningId: id, file: newLaundryUsedPhoto, category: 'laundry_used' })
    if (cleaning.laundry_used_photo?.path) deleteCleaningPhoto(cleaning.laundry_used_photo.path).catch(() => {})
  }

  let laundryReplacedPhoto = cleaning.laundry_replaced_photo || null
  if (newLaundryReplacedPhoto) {
    laundryReplacedPhoto = await uploadCleaningPhoto({ cleaningId: id, file: newLaundryReplacedPhoto, category: 'laundry_replaced' })
    if (cleaning.laundry_replaced_photo?.path) deleteCleaningPhoto(cleaning.laundry_replaced_photo.path).catch(() => {})
  }

  const cleanAmenitiesUsed = parseInventory(amenitiesUsedItems).filter((x) => x.name.trim().length > 0)
  const cleanAmenitiesReplaced = parseInventory(amenitiesReplacedItems).filter((x) => x.name.trim().length > 0)
  const cleanLaundryUsed = parseInventory(laundryUsedItems).filter((x) => x.name.trim().length > 0)
  const cleanLaundryReplaced = parseInventory(laundryReplacedItems).filter((x) => x.name.trim().length > 0)

  const lpAmount = laundryPaymentAmount != null && Number(laundryPaymentAmount) > 0 ? Number(laundryPaymentAmount) : null
  const lpMethod = laundryPaymentMethod && laundryPaymentMethod.trim() ? laundryPaymentMethod.trim().slice(0, 60) : null

  const { error } = await supabase.rpc('housekeeper_submit_cleaning', {
    p_cleaning_id: id,
    p_photos_before: finalBefore,
    p_photos_after: finalAfter,
    p_photos_report: finalReport,
    p_amenities_used_photo: amenitiesUsedPhoto,
    p_amenities_replaced_photo: amenitiesReplacedPhoto,
    p_amenities_used_items: cleanAmenitiesUsed,
    p_amenities_replaced_items: cleanAmenitiesReplaced,
    p_laundry_used_photo: laundryUsedPhoto,
    p_laundry_replaced_photo: laundryReplacedPhoto,
    p_laundry_used_items: cleanLaundryUsed,
    p_laundry_replaced_items: cleanLaundryReplaced,
    p_laundry_payment_amount: lpAmount,
    p_laundry_payment_method: lpMethod,
    p_laundry_payment_reference: laundryPaymentReference?.trim()?.slice(0, 100) || null,
    p_laundry_payment_note: laundryPaymentNote?.trim()?.slice(0, 2000) || null,
    p_notes: notes.trim()?.slice(0, 2000) || null,
  })
  if (error) throw error
}

// ============================================================
// ADMIN — APPROVE + PAY (housekeeper payment)
// ============================================================
export async function approveAndPayCleaning({
  cleaningId,
  amount,
  method,
  reference,
  note,
}) {
  if (!cleaningId) throw new Error('Missing cleaning')
  const amt = Number(amount)
  if (!amt || amt <= 0) throw new Error('Amount must be greater than 0')
  if (!method || !method.trim()) throw new Error('Payment method is required')

  const { error } = await supabase.rpc('admin_approve_and_pay_cleaning', {
    p_cleaning_id: cleaningId,
    p_payment_amount: amt,
    p_payment_method: method.trim().slice(0, 60),
    p_payment_reference: reference?.trim()?.slice(0, 100) || null,
    p_payment_note: note?.trim()?.slice(0, 2000) || null,
  })
  if (error) throw error
}

// ============================================================
// CSV EXPORT
// ============================================================
export function downloadCleaningsCSV(cleanings, filename = 'cleanings.csv') {
  const headers = [
    'Booking Code', 'Unit', 'Building', 'Type', 'Status',
    'Housekeeper', 'Scheduled', 'Submitted', 'Completed',
    'Photos Before', 'Photos After', 'Photos Report',
    'Amenities Used Items', 'Amenities Replaced Items',
    'Laundry Used Items', 'Laundry Replaced Items',
    'Housekeeper Payment Amount', 'Housekeeper Payment Method', 'Housekeeper Payment Reference', 'Housekeeper Paid At',
    'Laundry Payment Amount', 'Laundry Payment Method', 'Laundry Payment Reference', 'Laundry Paid At',
    'Notes',
  ]
  const rows = cleanings.map((c) => [
    c.bookings?.booking_code || '',
    c.units?.unit_code || '',
    c.units?.building || '',
    c.type || '',
    c.status || '',
    c.housekeepers?.name || '',
    c.scheduled_date || '',
    c.submitted_at ? new Date(c.submitted_at).toISOString().slice(0, 10) : '',
    c.completed_at ? new Date(c.completed_at).toISOString().slice(0, 10) : '',
    Array.isArray(c.photos_before) ? c.photos_before.length : 0,
    Array.isArray(c.photos_after) ? c.photos_after.length : 0,
    Array.isArray(c.photos_report) ? c.photos_report.length : 0,
    Array.isArray(c.amenities_used_items) ? c.amenities_used_items.map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
    Array.isArray(c.amenities_replaced_items) ? c.amenities_replaced_items.map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
    Array.isArray(c.laundry_used_items) ? c.laundry_used_items.map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
    Array.isArray(c.laundry_replaced_items) ? c.laundry_replaced_items.map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
    c.payment_amount ?? '', c.payment_method || '', c.payment_reference || '',
    c.paid_at ? new Date(c.paid_at).toISOString().slice(0, 10) : '',
    c.laundry_payment_amount ?? '', c.laundry_payment_method || '', c.laundry_payment_reference || '',
    c.laundry_paid_at ? new Date(c.laundry_paid_at).toISOString().slice(0, 10) : '',
    c.notes || '',
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}