// src/lib/cleanings.js
import { supabase } from './supabase'

const BUCKET = 'cleaning-photos'

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
    const s = search.trim()
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
      .select('photos_before, photos_after, photos_report, laundry_used_photo, laundry_cleaned_photo')
      .eq('id', id)
      .single()

    if (cleaning) {
      const paths = []
      for (const p of cleaning.photos_before || []) if (p.path) paths.push(p.path)
      for (const p of cleaning.photos_after || []) if (p.path) paths.push(p.path)
      for (const p of cleaning.photos_report || []) if (p.path) paths.push(p.path)
      if (cleaning.laundry_used_photo?.path) paths.push(cleaning.laundry_used_photo.path)
      if (cleaning.laundry_cleaned_photo?.path) paths.push(cleaning.laundry_cleaned_photo.path)
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
// IMAGE COMPRESSION
// ============================================================
export async function compressImage(file, { maxDimension = 1600, quality = 0.72 } = {}) {
  if (!file.type.startsWith('image/')) return file
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
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Compression failed'))
        blob.name = file.name
        resolve(blob)
      }, 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    reader.readAsDataURL(file)
  })
}

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ============================================================
// PHOTO UPLOAD (single, low-level)
// ============================================================
export async function uploadCleaningPhoto({ cleaningId, file, category }) {
  if (!['before', 'after', 'report', 'laundry_used', 'laundry_cleaned'].includes(category)) {
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

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return {
    path,
    url: data.publicUrl,
    uploaded_at: new Date().toISOString(),
    size: compressed.size,
  }
}

export async function deleteCleaningPhoto(path) {
  if (!path) return
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

// ============================================================
// HIGH-LEVEL PHOTO OPS (used by CRM admin panels)
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
// INVENTORY
// ============================================================
export function parseInventory(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      name: typeof x.name === 'string' ? x.name : '',
      quantity: Number(x.quantity) || 0,
      note: typeof x.note === 'string' ? x.note : '',
    }))
}

export async function setInventory(cleaningId, inventory) {
  const clean = parseInventory(inventory).filter((x) => x.name.trim().length > 0)
  await updateCleaning(cleaningId, { inventory: clean })
  return clean
}

// ============================================================
// LAUNDRY HELPERS
// ============================================================
export function parseLaundryItems(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      name: typeof x.name === 'string' ? x.name : '',
      quantity: Number(x.quantity) || 0,
    }))
}

// ============================================================
// SUBMIT — housekeeper side
//   Takes local state (blobs for new photos), uploads them,
//   then calls the submit RPC in one shot.
// ============================================================
export async function submitCleaning({
  cleaning,
  newPhotosBefore = [],   // File[]
  newPhotosAfter = [],
  newPhotosReport = [],
  newLaundryUsedPhoto = null,     // File | null (replacement)
  newLaundryCleanedPhoto = null,
  keepPhotosBefore,               // optional: array of existing photos to keep (if removed)
  keepPhotosAfter,
  keepPhotosReport,
  inventory = [],
  laundryUsedItems = [],
  laundryCleanedItems = [],
  notes = '',
}) {
  const id = cleaning.id

  // Upload new before photos
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

  // Final photo arrays
  const existingBefore = Array.isArray(cleaning.photos_before) ? cleaning.photos_before : []
  const existingAfter = Array.isArray(cleaning.photos_after) ? cleaning.photos_after : []
  const existingReport = Array.isArray(cleaning.photos_report) ? cleaning.photos_report : []

  const finalBefore = keepPhotosBefore !== undefined ? [...keepPhotosBefore, ...beforeUploaded] : [...existingBefore, ...beforeUploaded]
  const finalAfter = keepPhotosAfter !== undefined ? [...keepPhotosAfter, ...afterUploaded] : [...existingAfter, ...afterUploaded]
  const finalReport = keepPhotosReport !== undefined ? [...keepPhotosReport, ...reportUploaded] : [...existingReport, ...reportUploaded]

  // Laundry photos (replace semantics — one per category)
  let laundryUsedPhoto = cleaning.laundry_used_photo || null
  if (newLaundryUsedPhoto) {
    laundryUsedPhoto = await uploadCleaningPhoto({ cleaningId: id, file: newLaundryUsedPhoto, category: 'laundry_used' })
    if (cleaning.laundry_used_photo?.path) {
      deleteCleaningPhoto(cleaning.laundry_used_photo.path).catch(() => {})
    }
  }

  let laundryCleanedPhoto = cleaning.laundry_cleaned_photo || null
  if (newLaundryCleanedPhoto) {
    laundryCleanedPhoto = await uploadCleaningPhoto({ cleaningId: id, file: newLaundryCleanedPhoto, category: 'laundry_cleaned' })
    if (cleaning.laundry_cleaned_photo?.path) {
      deleteCleaningPhoto(cleaning.laundry_cleaned_photo.path).catch(() => {})
    }
  }

  // Clean input arrays
  const cleanInventory = parseInventory(inventory).filter((x) => x.name.trim().length > 0)
  const cleanLaundryUsed = parseLaundryItems(laundryUsedItems).filter((x) => x.name.trim().length > 0)
  const cleanLaundryCleaned = parseLaundryItems(laundryCleanedItems).filter((x) => x.name.trim().length > 0)

  // Submit via RPC
  const { error } = await supabase.rpc('housekeeper_submit_cleaning', {
    p_cleaning_id: id,
    p_photos_before: finalBefore,
    p_photos_after: finalAfter,
    p_photos_report: finalReport,
    p_inventory: cleanInventory,
    p_laundry_used_photo: laundryUsedPhoto,
    p_laundry_cleaned_photo: laundryCleanedPhoto,
    p_laundry_used_items: cleanLaundryUsed,
    p_laundry_cleaned_items: cleanLaundryCleaned,
    p_notes: notes.trim() || null,
  })
  if (error) throw error
}

// ============================================================
// ADMIN — APPROVE + PAY
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
    p_payment_method: method.trim(),
    p_payment_reference: reference?.trim() || null,
    p_payment_note: note?.trim() || null,
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
    'Laundry Used Items', 'Laundry Cleaned Items',
    'Inventory',
    'Payment Amount', 'Payment Method', 'Payment Reference', 'Payment Note', 'Paid At',
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
    Array.isArray(c.laundry_used_items)
      ? c.laundry_used_items.map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
    Array.isArray(c.laundry_cleaned_items)
      ? c.laundry_cleaned_items.map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
    Array.isArray(c.inventory)
      ? c.inventory.map((i) => `${i.name} x${i.quantity}`).join('; ') : '',
    c.payment_amount ?? '',
    c.payment_method || '',
    c.payment_reference || '',
    c.payment_note || '',
    c.paid_at ? new Date(c.paid_at).toISOString().slice(0, 10) : '',
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