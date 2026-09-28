// src/lib/cleanings.js
import { supabase } from './supabase'

// ============================================================
// BUCKET
// ============================================================
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
      housekeepers:housekeeper_id ( id, code, name )
    `)
    .order('scheduled_date', { ascending: false, nullsFirst: false })

  if (status && status !== 'all') query = query.eq('status', status)
  if (type && type !== 'all') query = query.eq('type', type)
  if (housekeeperId && housekeeperId !== 'all') query = query.eq('housekeeper_id', housekeeperId)

  if (search && search.trim()) {
    const s = search.trim()
    // Search only on a couple of columns (can't OR across joins easily)
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
      housekeepers:housekeeper_id ( id, code, name )
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
  // Also delete all photos from storage first
  try {
    const { data: cleaning } = await supabase
      .from('cleanings')
      .select('photos_before, photos_after, photos_report')
      .eq('id', id)
      .single()

    if (cleaning) {
      const paths = []
      for (const p of cleaning.photos_before || []) if (p.path) paths.push(p.path)
      for (const p of cleaning.photos_after || []) if (p.path) paths.push(p.path)
      for (const p of cleaning.photos_report || []) if (p.path) paths.push(p.path)
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
// IMAGE COMPRESSION (canvas-based, no dependencies)
// ============================================================
export async function compressImage(file, { maxDimension = 1600, quality = 0.72 } = {}) {
  // Skip compression for non-image files
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

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Compression failed')); return }
          // Preserve filename for storage path generation
          blob.name = file.name
          resolve(blob)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => reject(new Error('Failed to load image'))

    reader.readAsDataURL(file)
  })
}

// ============================================================
// PHOTO UPLOAD
// ============================================================
function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export async function uploadCleaningPhoto({
  cleaningId,
  file,
  category, // 'before' | 'after' | 'report'
}) {
  if (!['before', 'after', 'report'].includes(category)) {
    throw new Error('Invalid photo category')
  }

  // Compress before upload
  const compressed = await compressImage(file)

  const ext = 'jpg'
  const filename = `${randomId()}.${ext}`
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
// HIGH-LEVEL: ADD / REMOVE PHOTOS ON A CLEANING
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

  // Update DB first, then remove from storage (safer if storage delete fails)
  await updateCleaning(cleaning.id, { [column]: next })
  try {
    await deleteCleaningPhoto(path)
  } catch (err) {
    console.warn('Failed to delete photo from storage:', err)
  }
}

// ============================================================
// INVENTORY HELPERS
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
// CSV EXPORT
// ============================================================
export function downloadCleaningsCSV(cleanings, filename = 'cleanings.csv') {
  const headers = [
    'Booking Code', 'Unit', 'Building', 'Type', 'Status',
    'Housekeeper', 'Scheduled', 'Completed',
    'Photos Before', 'Photos After', 'Photos Report',
    'Inventory', 'Notes',
  ]
  const rows = cleanings.map((c) => [
    c.bookings?.booking_code || '',
    c.units?.unit_code || '',
    c.units?.building || '',
    c.type || '',
    c.status || '',
    c.housekeepers?.name || '',
    c.scheduled_date || '',
    c.completed_at ? new Date(c.completed_at).toISOString().slice(0, 10) : '',
    Array.isArray(c.photos_before) ? c.photos_before.length : 0,
    Array.isArray(c.photos_after) ? c.photos_after.length : 0,
    Array.isArray(c.photos_report) ? c.photos_report.length : 0,
    Array.isArray(c.inventory)
      ? c.inventory.map((i) => `${i.name} x${i.quantity}`).join('; ')
      : '',
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