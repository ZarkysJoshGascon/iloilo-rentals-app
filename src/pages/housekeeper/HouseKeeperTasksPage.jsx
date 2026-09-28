import { useCallback, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, ArrowLeft, Camera, X, Trash2,
  Package, FileText, AlertTriangle, CheckCircle2,
  Image as ImageIcon, Plus, Home, Clock, Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { parseInventory } from '@/lib/cleanings'
import { cn } from '@/lib/utils'

const PHOTO_LIMITS = { before: 15, after: 15, report: 10 }

const STATUS_META = {
  pending:     { label: 'Pending',     badge: 'bg-amber-600 text-white' },
  in_progress: { label: 'In Progress', badge: 'bg-blue-600 text-white' },
  completed:   { label: 'Completed',   badge: 'bg-emerald-600 text-white' },
}

function formatDateShort(d) {
  if (!d) return '—'
  const dt = new Date(d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(d); target.setHours(0, 0, 0, 0)
  const diff = Math.round((target - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

async function compressImage(file, { maxDimension = 1600, quality = 0.72 } = {}) {
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

function SectionCard({ title, icon: Icon, children, className }) {
  return (
    <div className={cn('rounded-md bg-card border border-border overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        {Icon && <Icon size={13} className="text-muted-foreground flex-shrink-0" />}
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
      </div>
      <div className="p-3 space-y-0.5">{children}</div>
    </div>
  )
}

function PhotoGrid({ cleaning, category, onChanged }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const key = category === 'before' ? 'photos_before'
    : category === 'after' ? 'photos_after'
    : 'photos_report'

  const rpcArg = category === 'before' ? 'p_photos_before'
    : category === 'after' ? 'p_photos_after'
    : 'p_photos_report'

  const photos = Array.isArray(cleaning[key]) ? cleaning[key] : []
  const limit = PHOTO_LIMITS[category]
  const canUpload = photos.length < limit

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const remaining = limit - photos.length
    if (files.length > remaining) toast.error(`Max ${limit} photos`)
    setUploading(true)
    try {
      const toUpload = files.slice(0, remaining)
      let current = cleaning
      for (const f of toUpload) {
        const compressed = await compressImage(f)
        const path = `${cleaning.id}/${category}/${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}.jpg`
        const { error: upErr } = await supabase.storage
          .from('cleaning-photos')
          .upload(path, compressed, { cacheControl: '31536000', contentType: 'image/jpeg', upsert: false })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('cleaning-photos').getPublicUrl(path)
        const photo = { path, url: data.publicUrl, uploaded_at: new Date().toISOString() }
        const next = [...(current[key] || []), photo]
        const { error: rpcErr } = await supabase.rpc('housekeeper_update_cleaning', {
          p_cleaning_id: cleaning.id,
          [rpcArg]: next,
        })
        if (rpcErr) throw rpcErr
        current = { ...current, [key]: next }
      }
      toast.success(`Uploaded ${toUpload.length}`)
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const handleRemove = async (photo) => {
    if (!window.confirm('Delete this photo?')) return
    try {
      const next = photos.filter((p) => p.path !== photo.path)
      const { error: rpcErr } = await supabase.rpc('housekeeper_update_cleaning', {
        p_cleaning_id: cleaning.id,
        [rpcArg]: next,
      })
      if (rpcErr) throw rpcErr
      await supabase.storage.from('cleaning-photos').remove([photo.path])
      toast.success('Photo deleted')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{category}</p>
        <span className="text-xs text-muted-foreground tabular-nums">{photos.length}/{limit}</span>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {photos.map((p, i) => (
            <div key={p.path || i} className="relative aspect-square rounded-md overflow-hidden bg-muted border border-border">
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(p)}
                className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleFiles}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-sm font-medium active:bg-muted/50 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {uploading ? 'Uploading…' : `Add ${category} photo`}
          </button>
        </>
      )}
    </div>
  )
}

function InventoryEditor({ cleaning, onChanged }) {
  const [items, setItems] = useState(() => parseInventory(cleaning.inventory))
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setItems(parseInventory(cleaning.inventory)) }, [cleaning.id])

  const persist = async (next) => {
    setSaving(true)
    try {
      const { error } = await supabase.rpc('housekeeper_update_cleaning', {
        p_cleaning_id: cleaning.id,
        p_inventory: next,
      })
      if (error) throw error
      setItems(next)
      onChanged()
    } catch (err) {
      console.error('Inventory save failed:', err)
      toast.error(err?.message || 'Failed to save inventory')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    const n = name.trim()
    const q = Number(qty) || 0
    if (!n) return toast.error('Enter item name')
    if (q <= 0) return toast.error('Quantity must be > 0')
    persist([...items, { name: n, quantity: q, note: '' }])
    setName(''); setQty('1')
  }

  const handleRemove = (i) => persist(items.filter((_, idx) => idx !== i))
  const handleQtyChange = (i, q) => {
    const next = items.map((it, idx) => idx === i ? { ...it, quantity: Math.max(0, Number(q) || 0) } : it)
    setItems(next)
  }
  const handleQtyCommit = () => persist(items)

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2 text-center">No items yet</p>
      ) : (
        <div className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 bg-background rounded border border-border px-3 py-2">
              <span className="flex-1 text-sm text-foreground truncate">{it.name}</span>
              <input
                type="number"
                min={0}
                value={it.quantity}
                onChange={(e) => handleQtyChange(i, e.target.value)}
                onBlur={handleQtyCommit}
                className="w-16 text-right text-sm tabular-nums bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="p-1.5 text-muted-foreground active:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Item name"
          className="flex-1 text-sm bg-background border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="w-16 text-center text-sm bg-background border border-border rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 tabular-nums"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="p-2.5 rounded bg-primary text-primary-foreground active:scale-95 transition-transform disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>
    </div>
  )
}

function CleaningDetail({ cleaning, onBack, onChanged }) {
  const [photoTab, setPhotoTab] = useState('before')
  const [markingComplete, setMarkingComplete] = useState(false)
  const [notesDraft, setNotesDraft] = useState(cleaning.notes || '')

  const status = cleaning.status || 'pending'
  const meta = STATUS_META[status] || STATUS_META.pending

  useEffect(() => {
    setNotesDraft(cleaning.notes || '')
  }, [cleaning.id, cleaning.notes])

  const handleComplete = async () => {
    const ok = window.confirm('Mark this cleaning as completed?')
    if (!ok) return
    setMarkingComplete(true)
    try {
      const { error } = await supabase.rpc('housekeeper_update_cleaning', {
        p_cleaning_id: cleaning.id,
        p_status: 'completed',
      })
      if (error) throw error
      toast.success('Marked as completed')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to complete')
    } finally {
      setMarkingComplete(false)
    }
  }

  const handleNotesSave = async () => {
    if (notesDraft === (cleaning.notes || '')) return
    try {
      const { error } = await supabase.rpc('housekeeper_update_cleaning', {
        p_cleaning_id: cleaning.id,
        p_notes: notesDraft.trim() || null,
      })
      if (error) throw error
      toast.success('Notes saved')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save notes')
    }
  }

  const booking = cleaning.bookings
  const unit = cleaning.units

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full active:bg-muted">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              {unit?.unit_code || '—'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {unit?.building || '—'}
            </p>
          </div>
          <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold', meta.badge)}>
            {meta.label}
          </span>
        </div>
      </header>

      <div className="p-4 space-y-3">
        <SectionCard title="Overview" icon={Clock}>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Type</span>
              <span className="text-xs font-semibold text-foreground capitalize">{cleaning.type}</span>
            </div>
            {booking && (
              <>
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Booking</span>
                  <span className="text-xs font-mono text-foreground">{booking.booking_code}</span>
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Guest</span>
                  <span className="text-xs text-foreground truncate ml-3">{booking.guest_name}</span>
                </div>
              </>
            )}
            {!booking && (
              <div className="text-xs italic text-muted-foreground text-center py-1">
                Standalone deep clean
              </div>
            )}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Scheduled</span>
              <span className="text-xs text-foreground">{formatDateShort(cleaning.scheduled_date)}</span>
            </div>
          </div>
        </SectionCard>

        <div className="rounded-md bg-card border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <ImageIcon size={13} className="text-muted-foreground" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Photos</h4>
          </div>

          <div className="flex gap-1 p-2 border-b border-border bg-muted/20">
            {['before', 'after', 'report'].map((t) => {
              const key = t === 'before' ? 'photos_before' : t === 'after' ? 'photos_after' : 'photos_report'
              const count = (cleaning[key] || []).length
              return (
                <button
                  key={t}
                  onClick={() => setPhotoTab(t)}
                  className={cn(
                    'flex-1 text-[11px] font-semibold py-1.5 rounded-full transition-colors',
                    photoTab === t
                      ? 'bg-card border border-border text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)} ({count})
                </button>
              )
            })}
          </div>

          <div className="p-3">
            <PhotoGrid cleaning={cleaning} category={photoTab} onChanged={onChanged} />
          </div>
        </div>

        <SectionCard title="Inventory" icon={Package}>
          <InventoryEditor cleaning={cleaning} onChanged={onChanged} />
        </SectionCard>

        <SectionCard title="Notes" icon={FileText}>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={handleNotesSave}
            rows={3}
            placeholder="Any notes about this cleaning…"
            className="w-full text-xs bg-background border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
          />
        </SectionCard>
      </div>

      {status !== 'completed' && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border z-30"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={handleComplete}
            disabled={markingComplete}
            className="w-full py-3 rounded-md bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {markingComplete ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {markingComplete ? 'Saving…' : 'Mark as Completed'}
          </button>
        </div>
      )}

      {status === 'completed' && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4 bg-emerald-50 border-t border-emerald-200 z-30"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold text-sm">
            <CheckCircle2 size={16} />
            Completed
          </div>
        </div>
      )}
    </div>
  )
}

function CleaningCard({ cleaning, onClick }) {
  const meta = STATUS_META[cleaning.status || 'pending'] || STATUS_META.pending
  const unit = cleaning.units
  const booking = cleaning.bookings
  const photoCount =
    (cleaning.photos_before?.length || 0) +
    (cleaning.photos_after?.length || 0) +
    (cleaning.photos_report?.length || 0)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-md p-4 active:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">
            {unit?.unit_code || '—'}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {unit?.building || '—'}
          </p>
        </div>
        <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0', meta.badge)}>
          {meta.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
        <span className="capitalize font-semibold text-foreground">{cleaning.type}</span>
        {booking && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono truncate">{booking.booking_code}</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-muted-foreground">
          {formatDateShort(cleaning.scheduled_date)}
        </span>
        {photoCount > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Camera size={11} />
            {photoCount}
          </span>
        )}
      </div>
    </button>
  )
}

export default function HousekeeperTasksPage() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { housekeeper } = useUserRole()
  const [cleanings, setCleanings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  const fetchData = useCallback(async (hkId) => {
    const id = hkId || housekeeper?.id
    if (!id) {
      setCleanings([])
      setLoading(false)
      return
    }
    setLoading(true)
    setFetchError(null)
    try {
      const { data, error } = await supabase
        .from('cleanings')
        .select(`
          *,
          units:unit_id ( id, unit_code, building ),
          bookings:booking_id ( id, booking_code, guest_name, check_in, check_out )
        `)
        .eq('housekeeper_id', id)
        .order('scheduled_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      setCleanings(data || [])
    } catch (err) {
      console.error('Fetch cleanings failed:', err)
      setFetchError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [housekeeper?.id])

  useEffect(() => {
    if (!housekeeper?.id) {
      setCleanings([])
      setLoading(false)
      return
    }
    fetchData(housekeeper.id)
  }, [housekeeper?.id, fetchData])

  // Realtime: refetch when this housekeeper's cleanings change
  useEffect(() => {
    if (!housekeeper?.id) return

    const channel = supabase
      .channel(`hk-cleanings-${housekeeper.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cleanings',
          filter: `housekeeper_id=eq.${housekeeper.id}`,
        },
        () => { fetchData(housekeeper.id) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [housekeeper?.id, fetchData])

  const selected = cleanings.find((c) => c.id === selectedId) || null

  if (selected) {
    return (
      <CleaningDetail
        cleaning={selected}
        onBack={() => setSelectedId(null)}
        onChanged={() => fetchData(housekeeper?.id)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-8">
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Housekeeping</p>
            <p className="text-sm font-semibold text-foreground truncate">
              {housekeeper?.name || 'Tasks'}
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-md active:bg-muted"
            title="Back to main site"
          >
            <Home size={16} className="text-muted-foreground" />
          </button>
          <button
            onClick={async () => { await signOut(); navigate('/') }}
            className="text-[11px] font-medium text-muted-foreground hover:text-red-500 active:text-red-500 px-2 py-2"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : fetchError ? (
          <div className="text-center py-16 px-4">
            <AlertTriangle className="w-12 h-12 text-red-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-red-500">Failed to load</p>
            <p className="text-xs text-muted-foreground mt-1 break-words">{fetchError}</p>
          </div>
        ) : !housekeeper ? (
          <div className="text-center py-16">
            <AlertTriangle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Account not linked</p>
            <p className="text-xs text-muted-foreground mt-1">Contact your administrator</p>
          </div>
        ) : cleanings.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No cleanings assigned</p>
            <p className="text-xs text-muted-foreground mt-1">You're all caught up</p>
          </div>
        ) : (
          cleanings.map((c) => (
            <CleaningCard
              key={c.id}
              cleaning={c}
              onClick={() => setSelectedId(c.id)}
            />
          ))
        )}
      </main>
    </div>
  )
}