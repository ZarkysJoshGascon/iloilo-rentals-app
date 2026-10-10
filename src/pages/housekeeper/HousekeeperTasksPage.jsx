// src/pages/housekeeper/HousekeeperTasksPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Camera, X, Trash2,
  AlertTriangle, CheckCircle2, Image as ImageIcon,
  Plus, Home, Clock, Sparkles, Coffee, Shirt, Wallet, Send,
  Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import {
  submitCleaning, parseInventory,
  getSignedUrl, getSignedUrls,
} from '@/lib/cleanings'
import { cn } from '@/lib/utils'

const PHOTO_LIMITS = { before: 15, after: 15, report: 10 }

const STATUS_META = {
  scheduled: { label: 'Scheduled', badge: 'bg-amber-600 text-white' },
  ready:     { label: 'Ready',     badge: 'bg-blue-600 text-white' },
  submitted: { label: 'Submitted', badge: 'bg-violet-600 text-white' },
  completed: { label: 'Completed', badge: 'bg-emerald-600 text-white' },
}

function getEffectiveStatus(cleaning) {
  if (cleaning.status === 'submitted' || cleaning.status === 'completed') return cleaning.status
  if (!cleaning.bookings?.check_out) return 'ready'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const co = new Date(cleaning.bookings.check_out); co.setHours(0, 0, 0, 0)
  return co <= today ? 'ready' : 'scheduled'
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

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function HousekeeperAvatar({ name, photo_url, size = 'md' }) {
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  if (photo_url) {
    return <img src={photo_url} alt={name} className={cn('rounded-full object-cover flex-shrink-0', sizeClasses)} />
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0 bg-[#2d568e] text-white', sizeClasses)}>
      {initials(name)}
    </div>
  )
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

function SkeletonBlock({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

function TaskCardSkeleton() {
  return (
    <div className="w-full bg-card border border-border rounded-md p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-4 w-24 mb-2" />
          <SkeletonBlock className="h-3 w-32" />
        </div>
        <SkeletonBlock className="h-5 w-20 rounded-full" />
      </div>
      <SkeletonBlock className="h-3 w-40 mt-3" />
      <div className="flex items-center justify-between mt-3">
        <SkeletonBlock className="h-3 w-16" />
        <SkeletonBlock className="h-3 w-10" />
      </div>
    </div>
  )
}

function TaskListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => <TaskCardSkeleton key={i} />)}
    </div>
  )
}

function PhotoTileSkeleton() {
  return <SkeletonBlock className="aspect-square w-full rounded-md" />
}

function SinglePhotoSkeleton() {
  return <SkeletonBlock className="aspect-video w-full rounded-md" />
}

function useSignedUrls(photos) {
  const paths = useMemo(
    () => (photos || []).map((p) => p?.path).filter(Boolean),
    [photos],
  )
  const key = paths.join('|')
  const [map, setMap] = useState({})
  const [loading, setLoading] = useState(paths.length > 0)

  useEffect(() => {
    let cancelled = false
    if (paths.length === 0) { setMap({}); setLoading(false); return }
    setLoading(true)
    getSignedUrls(paths)
      .then((m) => { if (!cancelled) { setMap(m); setLoading(false) } })
      .catch((err) => {
        console.error('Signed URL fetch failed:', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { map, loading }
}

function useSignedUrl(photo) {
  const path = photo?.path || null
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(!!path)

  useEffect(() => {
    let cancelled = false
    if (!path) { setUrl(null); setLoading(false); return }
    setLoading(true)
    getSignedUrl(path)
      .then((u) => { if (!cancelled) { setUrl(u); setLoading(false) } })
      .catch((err) => {
        console.error('Signed URL fetch failed:', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [path])

  return { url, loading }
}

// ─────────────────────────────────────────────────────────────
// READ-ONLY VIEWS (used when cleaning is completed/locked)
// ─────────────────────────────────────────────────────────────

function ReadOnlyPhotoGrid({ photos, label }) {
  const safePhotos = Array.isArray(photos) ? photos : []
  const { map: signedMap, loading } = useSignedUrls(safePhotos)

  if (safePhotos.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 py-6 text-center">
        <ImageIcon size={16} className="text-muted-foreground/40 mx-auto mb-1" />
        <p className="text-[11px] text-muted-foreground italic">No {label.toLowerCase()} photos</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-[10px] text-muted-foreground tabular-nums">{safePhotos.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {safePhotos.map((p, i) => {
          const src = signedMap[p.path]
          return (
            <div key={p.path || i} className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted">
              {src ? (
                <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : loading ? (
                <PhotoTileSkeleton />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <ImageIcon size={16} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReadOnlySinglePhoto({ photo, label }) {
  const { url, loading } = useSignedUrl(photo)

  if (!photo) {
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
        <div className="w-full aspect-video rounded-md border border-dashed border-border bg-muted/20 flex items-center justify-center">
          <ImageIcon size={16} className="text-muted-foreground/40" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <div className="aspect-video rounded-md overflow-hidden border border-border bg-muted">
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : loading ? (
          <SinglePhotoSkeleton />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon size={16} />
          </div>
        )}
      </div>
    </div>
  )
}

function ReadOnlyItemsList({ items, emptyLabel = 'No items' }) {
  const parsed = parseInventory(items)
  if (parsed.length === 0) {
    return <p className="text-[11px] italic text-muted-foreground text-center py-1">{emptyLabel}</p>
  }
  return (
    <div className="space-y-1">
      {parsed.map((it, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-muted/40 text-xs">
          <span className="text-foreground truncate">{it.name}</span>
          <span className="text-foreground font-semibold tabular-nums">×{it.quantity}</span>
        </div>
      ))}
    </div>
  )
}

function CompletedSummary({ cleaning }) {
  const hasBefore = Array.isArray(cleaning.photos_before) && cleaning.photos_before.length > 0
  const hasAfter = Array.isArray(cleaning.photos_after) && cleaning.photos_after.length > 0
  const hasReport = Array.isArray(cleaning.photos_report) && cleaning.photos_report.length > 0

  const amenitiesUsedItems = parseInventory(cleaning.amenities_used_items)
  const amenitiesReplacedItems = parseInventory(cleaning.amenities_replaced_items)
  const laundryUsedItems = parseInventory(cleaning.laundry_used_items)
  const laundryReplacedItems = parseInventory(cleaning.laundry_replaced_items)

  const laundryAmount = Number(cleaning.laundry_payment_amount || 0)
  const hasLaundryPayment = laundryAmount > 0

  return (
    <div className="space-y-3">
      {/* Lock banner */}
      <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-start gap-2">
        <Lock size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Approved by admin · locked
          </p>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
            This cleaning is complete and cannot be edited. Contact admin if corrections are needed.
          </p>
        </div>
      </div>

      {/* Cleaning photos */}
      <SectionCard title="Cleaning Photos" icon={ImageIcon}>
        <div className="space-y-3">
          {hasBefore && <ReadOnlyPhotoGrid photos={cleaning.photos_before} label="Before" />}
          {hasAfter && <ReadOnlyPhotoGrid photos={cleaning.photos_after} label="After" />}
          {hasReport && <ReadOnlyPhotoGrid photos={cleaning.photos_report} label="Report" />}
          {!hasBefore && !hasAfter && !hasReport && (
            <p className="text-[11px] italic text-muted-foreground text-center py-2">
              No photos on file
            </p>
          )}
        </div>
      </SectionCard>

      {/* Amenities */}
      {(amenitiesUsedItems.length > 0 ||
        amenitiesReplacedItems.length > 0 ||
        cleaning.amenities_used_photo ||
        cleaning.amenities_replaced_photo) && (
        <SectionCard title="Amenities" icon={Coffee}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Used</p>
              <ReadOnlySinglePhoto photo={cleaning.amenities_used_photo} label="Photo" />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.amenities_used_items} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Replaced</p>
              <ReadOnlySinglePhoto photo={cleaning.amenities_replaced_photo} label="Photo" />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.amenities_replaced_items} />
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Laundry */}
      {(laundryUsedItems.length > 0 ||
        laundryReplacedItems.length > 0 ||
        cleaning.laundry_used_photo ||
        cleaning.laundry_replaced_photo) && (
        <SectionCard title="Laundry" icon={Shirt}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Used</p>
              <ReadOnlySinglePhoto photo={cleaning.laundry_used_photo} label="Photo" />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.laundry_used_items} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Replaced</p>
              <ReadOnlySinglePhoto photo={cleaning.laundry_replaced_photo} label="Photo" />
              <div className="mt-2">
                <ReadOnlyItemsList items={cleaning.laundry_replaced_items} />
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ✅ Laundry Payment — read-only, always shown */}
      <SectionCard title="Laundry Payment" icon={Wallet}>
        {hasLaundryPayment ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Amount</span>
              <span className="text-foreground font-semibold tabular-nums">
                {`₱${laundryAmount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
              </span>
            </div>
            {cleaning.laundry_payment_method && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Method</span>
                <span className="text-foreground">{cleaning.laundry_payment_method}</span>
              </div>
            )}
            {cleaning.laundry_payment_reference && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Reference</span>
                <span className="text-foreground font-mono text-[11px] break-all text-right ml-3">
                  {cleaning.laundry_payment_reference}
                </span>
              </div>
            )}
            {cleaning.laundry_payment_note && (
              <div className="pt-2 mt-2 border-t border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Note</p>
                <p className="text-xs text-foreground whitespace-pre-wrap break-words">{cleaning.laundry_payment_note}</p>
              </div>
            )}
            {cleaning.laundry_paid_at && (
              <div className="flex justify-between text-[10px] text-muted-foreground pt-2 border-t border-border">
                <span>Paid at</span>
                <span className="tabular-nums">{formatDateTime(cleaning.laundry_paid_at)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] italic text-muted-foreground text-center py-2">
            No laundry payment was recorded.
          </p>
        )}
      </SectionCard>

      {/* Notes */}
      {cleaning.notes && (
        <SectionCard title="Notes" icon={Sparkles}>
          <p className="text-xs text-foreground whitespace-pre-wrap break-words">{cleaning.notes}</p>
        </SectionCard>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EDITABLE COMPONENTS (only shown when NOT completed)
// ─────────────────────────────────────────────────────────────

function PhotoGridLocal({ label, existing = [], newFiles = [], limit = 15, onAdd, onRemoveExisting, onRemoveNew }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const total = existing.length + newFiles.length
  const canUpload = total < limit

  const { map: signedMap } = useSignedUrls(existing)

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const remaining = limit - total
    if (files.length > remaining) toast.error(`Max ${limit} photos`)
    onAdd(files.slice(0, remaining))
    if (e.target) e.target.value = ''
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-xs text-muted-foreground tabular-nums">{total}/{limit}</span>
      </div>
      {(existing.length > 0 || newFiles.length > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {existing.map((p, i) => {
            const src = signedMap[p.path]
            return (
              <div key={`e-${p.path || i}`} className="relative aspect-square rounded-md overflow-hidden bg-muted border border-border">
                {src ? (
                  <img src={src} alt="" className="w-full h-full object-cover" />
                ) : (
                  <PhotoTileSkeleton />
                )}
                <button type="button" onClick={() => onRemoveExisting(p)}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform">
                  <X size={14} />
                </button>
              </div>
            )
          })}
          {newFiles.map((f, i) => (
            <div key={`n-${i}`} className="relative aspect-square rounded-md overflow-hidden bg-muted border-2 border-dashed border-primary/40">
              <img src={f.preview} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-1 left-1 text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">NEW</span>
              <button type="button" onClick={() => onRemoveNew(i)}
                className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {canUpload && (
        <>
          <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="hidden" onChange={handleFiles} />
          <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleFiles} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors">
              <Camera size={14} /> Take Photo
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors">
              <ImageIcon size={14} /> Gallery
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SinglePhotoLocal({ label, existing, newFile, onPick, onClear }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const { url: signedUrl, loading: signedLoading } = useSignedUrl(existing)

  const preview = newFile?.preview || signedUrl || null
  const isNew = !!newFile

  const handleFiles = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    onPick(f)
    if (e.target) e.target.value = ''
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        {preview && (
          <button type="button" onClick={onClear} className="text-[10px] font-semibold uppercase tracking-wider text-red-500">Remove</button>
        )}
      </div>
      {preview ? (
        <div className="relative aspect-video rounded-md overflow-hidden bg-muted border border-border">
          <img src={preview} alt="" className="w-full h-full object-cover" />
          {isNew && (
            <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">NEW</span>
          )}
        </div>
      ) : existing && signedLoading ? (
        <SinglePhotoSkeleton />
      ) : (
        <>
          <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={handleFiles} />
          <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFiles} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors">
              <Camera size={14} /> Take Photo
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors">
              <ImageIcon size={14} /> Gallery
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ListEditor({ items, onChange, placeholder = 'Item name' }) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')

  const handleAdd = () => {
    const n = name.trim().slice(0, 80)
    const q = Number(qty) || 0
    if (!n) return toast.error('Enter item name')
    if (q <= 0) return toast.error('Quantity must be > 0')
    if (items.length >= 50) return toast.error('Too many items')
    onChange([...items, { name: n, quantity: q }])
    setName(''); setQty('1')
  }

  const handleRemove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const handleQtyChange = (i, q) => {
    const next = items.map((it, idx) => idx === i ? { ...it, quantity: Math.max(0, Math.min(9999, Number(q) || 0)) } : it)
    onChange(next)
  }
  const handleNameChange = (i, n) => {
    const next = items.map((it, idx) => idx === i ? { ...it, name: n.slice(0, 80) } : it)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2 text-center">No items yet</p>
      ) : (
        <div className="space-y-1">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 bg-background rounded border border-border px-3 py-2">
              <input type="text" value={it.name} maxLength={80} onChange={(e) => handleNameChange(i, e.target.value)}
                className="flex-1 text-sm bg-transparent border-0 focus:outline-none text-foreground" />
              <input type="number" min={0} max={9999} value={it.quantity} onChange={(e) => handleQtyChange(i, e.target.value)}
                className="w-16 text-right text-sm tabular-nums bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring/30" />
              <button type="button" onClick={() => handleRemove(i)} className="p-1.5 text-muted-foreground active:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="flex-1 text-sm bg-background border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30" />
        <input type="number" min={1} max={9999} value={qty} onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="w-16 text-center text-sm bg-background border border-border rounded px-2 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 tabular-nums" />
        <button type="button" onClick={handleAdd} className="p-2.5 rounded bg-primary text-primary-foreground active:scale-95 transition-transform">
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

function CategoryCard({ title, Icon, usedPhoto, replacedPhoto, onPickUsed, onPickReplaced, onClearUsed, onClearReplaced,
  usedItems, replacedItems, onUsedItemsChange, onReplacedItemsChange, usedPlaceholder, replacedPlaceholder }) {
  return (
    <div className="rounded-md bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Icon size={13} className="text-muted-foreground" />
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h4>
      </div>
      <div className="p-3 space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Used</p>
          <SinglePhotoLocal label="Photo" existing={usedPhoto?.existing} newFile={usedPhoto?.newFile}
            onPick={onPickUsed} onClear={onClearUsed} />
          <div className="mt-3">
            <ListEditor items={usedItems} onChange={onUsedItemsChange} placeholder={usedPlaceholder} />
          </div>
        </div>
        <div className="border-t border-border" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Replaced</p>
          <SinglePhotoLocal label="Photo" existing={replacedPhoto?.existing} newFile={replacedPhoto?.newFile}
            onPick={onPickReplaced} onClear={onClearReplaced} />
          <div className="mt-3">
            <ListEditor items={replacedItems} onChange={onReplacedItemsChange} placeholder={replacedPlaceholder} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CleaningDetail({ cleaning, onBack, onChanged }) {
  const [photoTab, setPhotoTab] = useState('before')
  const [submitting, setSubmitting] = useState(false)

  const [keepBefore, setKeepBefore] = useState(() => Array.isArray(cleaning.photos_before) ? cleaning.photos_before : [])
  const [keepAfter, setKeepAfter] = useState(() => Array.isArray(cleaning.photos_after) ? cleaning.photos_after : [])
  const [keepReport, setKeepReport] = useState(() => Array.isArray(cleaning.photos_report) ? cleaning.photos_report : [])
  const [newBefore, setNewBefore] = useState([])
  const [newAfter, setNewAfter] = useState([])
  const [newReport, setNewReport] = useState([])

  const [amenitiesUsedExisting, setAmenitiesUsedExisting] = useState(cleaning.amenities_used_photo || null)
  const [amenitiesUsedFile, setAmenitiesUsedFile] = useState(null)
  const [amenitiesReplacedExisting, setAmenitiesReplacedExisting] = useState(cleaning.amenities_replaced_photo || null)
  const [amenitiesReplacedFile, setAmenitiesReplacedFile] = useState(null)
  const [amenitiesUsedItems, setAmenitiesUsedItems] = useState(() => parseInventory(cleaning.amenities_used_items))
  const [amenitiesReplacedItems, setAmenitiesReplacedItems] = useState(() => parseInventory(cleaning.amenities_replaced_items))

  const [laundryUsedExisting, setLaundryUsedExisting] = useState(cleaning.laundry_used_photo || null)
  const [laundryUsedFile, setLaundryUsedFile] = useState(null)
  const [laundryReplacedExisting, setLaundryReplacedExisting] = useState(cleaning.laundry_replaced_photo || null)
  const [laundryReplacedFile, setLaundryReplacedFile] = useState(null)
  const [laundryUsedItems, setLaundryUsedItems] = useState(() => parseInventory(cleaning.laundry_used_items))
  const [laundryReplacedItems, setLaundryReplacedItems] = useState(() => parseInventory(cleaning.laundry_replaced_items))

  const [laundryAmount, setLaundryAmount] = useState(cleaning.laundry_payment_amount != null ? String(cleaning.laundry_payment_amount) : '')
  const [laundryMethod, setLaundryMethod] = useState(cleaning.laundry_payment_method || '')
  const [laundryReference, setLaundryReference] = useState(cleaning.laundry_payment_reference || '')
  const [laundryNote, setLaundryNote] = useState(cleaning.laundry_payment_note || '')

  const [notesDraft, setNotesDraft] = useState(cleaning.notes || '')

  useEffect(() => {
    setKeepBefore(Array.isArray(cleaning.photos_before) ? cleaning.photos_before : [])
    setKeepAfter(Array.isArray(cleaning.photos_after) ? cleaning.photos_after : [])
    setKeepReport(Array.isArray(cleaning.photos_report) ? cleaning.photos_report : [])
    setNewBefore([]); setNewAfter([]); setNewReport([])

    setAmenitiesUsedExisting(cleaning.amenities_used_photo || null)
    setAmenitiesUsedFile(null)
    setAmenitiesReplacedExisting(cleaning.amenities_replaced_photo || null)
    setAmenitiesReplacedFile(null)
    setAmenitiesUsedItems(parseInventory(cleaning.amenities_used_items))
    setAmenitiesReplacedItems(parseInventory(cleaning.amenities_replaced_items))

    setLaundryUsedExisting(cleaning.laundry_used_photo || null)
    setLaundryUsedFile(null)
    setLaundryReplacedExisting(cleaning.laundry_replaced_photo || null)
    setLaundryReplacedFile(null)
    setLaundryUsedItems(parseInventory(cleaning.laundry_used_items))
    setLaundryReplacedItems(parseInventory(cleaning.laundry_replaced_items))

    setLaundryAmount(cleaning.laundry_payment_amount != null ? String(cleaning.laundry_payment_amount) : '')
    setLaundryMethod(cleaning.laundry_payment_method || '')
    setLaundryReference(cleaning.laundry_payment_reference || '')
    setLaundryNote(cleaning.laundry_payment_note || '')

    setNotesDraft(cleaning.notes || '')
  }, [cleaning.id])

  // Revoke all pending new-file object URLs on unmount.
  useEffect(() => {
    return () => {
      newBefore.forEach((f) => URL.revokeObjectURL(f.preview))
      newAfter.forEach((f) => URL.revokeObjectURL(f.preview))
      newReport.forEach((f) => URL.revokeObjectURL(f.preview))
      if (amenitiesUsedFile?.preview) URL.revokeObjectURL(amenitiesUsedFile.preview)
      if (amenitiesReplacedFile?.preview) URL.revokeObjectURL(amenitiesReplacedFile.preview)
      if (laundryUsedFile?.preview) URL.revokeObjectURL(laundryUsedFile.preview)
      if (laundryReplacedFile?.preview) URL.revokeObjectURL(laundryReplacedFile.preview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const effective = getEffectiveStatus(cleaning)
  const meta = STATUS_META[effective] || STATUS_META.scheduled
  const isLocked = effective === 'completed'

  const toPreview = (file) => ({ file, preview: URL.createObjectURL(file) })

  const handleAddBefore = (files) => setNewBefore((p) => [...p, ...files.map(toPreview)])
  const handleAddAfter = (files) => setNewAfter((p) => [...p, ...files.map(toPreview)])
  const handleAddReport = (files) => setNewReport((p) => [...p, ...files.map(toPreview)])

  const removeNew = (setter) => (i) => {
    setter((p) => {
      const copy = [...p]
      URL.revokeObjectURL(copy[i].preview)
      copy.splice(i, 1)
      return copy
    })
  }

  const handleSubmit = async () => {
    // ✅ Client-side guard: never submit an approved cleaning.
    if (isLocked) {
      toast.error('This cleaning has been approved by admin and can no longer be edited.')
      return
    }

    const ok = window.confirm('Submit this cleaning? You can still edit after submitting.')
    if (!ok) return
    setSubmitting(true)
    try {
      await submitCleaning({
        cleaning,
        newPhotosBefore: newBefore.map((x) => x.file),
        newPhotosAfter: newAfter.map((x) => x.file),
        newPhotosReport: newReport.map((x) => x.file),
        newAmenitiesUsedPhoto: amenitiesUsedFile?.file || null,
        newAmenitiesReplacedPhoto: amenitiesReplacedFile?.file || null,
        newLaundryUsedPhoto: laundryUsedFile?.file || null,
        newLaundryReplacedPhoto: laundryReplacedFile?.file || null,
        keepPhotosBefore: keepBefore,
        keepPhotosAfter: keepAfter,
        keepPhotosReport: keepReport,
        amenitiesUsedItems,
        amenitiesReplacedItems,
        laundryUsedItems,
        laundryReplacedItems,
        laundryPaymentAmount: laundryAmount ? Number(laundryAmount) : null,
        laundryPaymentMethod: laundryMethod || null,
        laundryPaymentReference: laundryReference || null,
        laundryPaymentNote: laundryNote || null,
        notes: notesDraft,
      })
      toast.success('Cleaning submitted')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveExisting = (setter, existingArr) => (photo) => {
    if (!window.confirm('Remove this photo? It will be deleted when you Submit.')) return
    setter(existingArr.filter((p) => p.path !== photo.path))
  }

  const booking = cleaning.bookings
  const unit = cleaning.units

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full active:bg-muted">
            <ArrowLeft size={20} className="text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm font-bold text-foreground truncate">
              {cleaning.cleaning_code || '—'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {unit?.unit_code || '—'}
              {unit?.building ? ` · ${unit.building}` : ''}
            </p>
          </div>
          <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold', meta.badge)}>
            {meta.label}
          </span>
        </div>
      </header>

      <div className="p-4 space-y-3">
        {/* Overview — always shown */}
        <SectionCard title="Overview" icon={Clock}>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Code</span>
              <span className="text-xs font-mono font-semibold text-foreground">{cleaning.cleaning_code || '—'}</span>
            </div>
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
              <div className="text-xs italic text-muted-foreground text-center py-1">Standalone deep clean</div>
            )}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Scheduled</span>
              <span className="text-xs text-foreground">{formatDateShort(cleaning.scheduled_date)}</span>
            </div>
          </div>
        </SectionCard>

        {isLocked ? (
          <CompletedSummary cleaning={cleaning} />
        ) : (
          <>
            <div className="rounded-md bg-card border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                <ImageIcon size={13} className="text-muted-foreground" />
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cleaning Photos</h4>
              </div>
              <div className="flex gap-1 p-2 border-b border-border bg-muted/20">
                {['before', 'after', 'report'].map((t) => {
                  const existing = t === 'before' ? keepBefore : t === 'after' ? keepAfter : keepReport
                  const added = t === 'before' ? newBefore : t === 'after' ? newAfter : newReport
                  const count = existing.length + added.length
                  return (
                    <button key={t} onClick={() => setPhotoTab(t)}
                      className={cn('flex-1 text-[11px] font-semibold py-1.5 rounded-full transition-colors',
                        photoTab === t ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                      {t.charAt(0).toUpperCase() + t.slice(1)} ({count})
                    </button>
                  )
                })}
              </div>
              <div className="p-3">
                {photoTab === 'before' && <PhotoGridLocal label="Before" existing={keepBefore} newFiles={newBefore} limit={PHOTO_LIMITS.before} onAdd={handleAddBefore} onRemoveExisting={handleRemoveExisting(setKeepBefore, keepBefore)} onRemoveNew={removeNew(setNewBefore)} />}
                {photoTab === 'after' && <PhotoGridLocal label="After" existing={keepAfter} newFiles={newAfter} limit={PHOTO_LIMITS.after} onAdd={handleAddAfter} onRemoveExisting={handleRemoveExisting(setKeepAfter, keepAfter)} onRemoveNew={removeNew(setNewAfter)} />}
                {photoTab === 'report' && <PhotoGridLocal label="Report" existing={keepReport} newFiles={newReport} limit={PHOTO_LIMITS.report} onAdd={handleAddReport} onRemoveExisting={handleRemoveExisting(setKeepReport, keepReport)} onRemoveNew={removeNew(setNewReport)} />}
              </div>
            </div>

            <CategoryCard
              title="Amenities"
              Icon={Coffee}
              usedPhoto={{ existing: amenitiesUsedExisting, newFile: amenitiesUsedFile }}
              replacedPhoto={{ existing: amenitiesReplacedExisting, newFile: amenitiesReplacedFile }}
              onPickUsed={(f) => setAmenitiesUsedFile({ file: f, preview: URL.createObjectURL(f) })}
              onPickReplaced={(f) => setAmenitiesReplacedFile({ file: f, preview: URL.createObjectURL(f) })}
              onClearUsed={() => { setAmenitiesUsedFile(null); setAmenitiesUsedExisting(null) }}
              onClearReplaced={() => { setAmenitiesReplacedFile(null); setAmenitiesReplacedExisting(null) }}
              usedItems={amenitiesUsedItems}
              replacedItems={amenitiesReplacedItems}
              onUsedItemsChange={setAmenitiesUsedItems}
              onReplacedItemsChange={setAmenitiesReplacedItems}
              usedPlaceholder="e.g. Coffee, Water"
              replacedPlaceholder="e.g. Coffee, Water"
            />

            <CategoryCard
              title="Laundry"
              Icon={Shirt}
              usedPhoto={{ existing: laundryUsedExisting, newFile: laundryUsedFile }}
              replacedPhoto={{ existing: laundryReplacedExisting, newFile: laundryReplacedFile }}
              onPickUsed={(f) => setLaundryUsedFile({ file: f, preview: URL.createObjectURL(f) })}
              onPickReplaced={(f) => setLaundryReplacedFile({ file: f, preview: URL.createObjectURL(f) })}
              onClearUsed={() => { setLaundryUsedFile(null); setLaundryUsedExisting(null) }}
              onClearReplaced={() => { setLaundryReplacedFile(null); setLaundryReplacedExisting(null) }}
              usedItems={laundryUsedItems}
              replacedItems={laundryReplacedItems}
              onUsedItemsChange={setLaundryUsedItems}
              onReplacedItemsChange={setLaundryReplacedItems}
              usedPlaceholder="e.g. Bath towel, Bedsheet"
              replacedPlaceholder="e.g. Bath towel, Bedsheet"
            />

            <SectionCard title="Laundry Payment (optional)" icon={Wallet}>
              <p className="text-[10px] text-muted-foreground mb-2">
                If the laundry shop was paid for replacement, enter the details here. Admin can also fill this in.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Amount (₱)</label>
                  <input
                    type="number" min={0}
                    value={laundryAmount}
                    onChange={(e) => setLaundryAmount(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-border rounded px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Method</label>
                  <input
                    type="text" maxLength={60}
                    value={laundryMethod}
                    onChange={(e) => setLaundryMethod(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-border rounded px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
                    placeholder="GCash, Cash…"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Reference</label>
                  <input
                    type="text" maxLength={100}
                    value={laundryReference}
                    onChange={(e) => setLaundryReference(e.target.value)}
                    className="w-full h-8 text-xs bg-background border border-border rounded px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Note</label>
                  <textarea
                    maxLength={2000}
                    value={laundryNote}
                    onChange={(e) => setLaundryNote(e.target.value)}
                    rows={2}
                    className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Notes" icon={Sparkles}>
              <textarea maxLength={2000} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3}
                placeholder="Any notes about this cleaning…"
                className="w-full text-xs bg-background border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none" />
            </SectionCard>

            {effective === 'submitted' && (
              <div className="rounded-md bg-violet-500/10 border border-violet-500/30 p-3">
                <p className="text-xs text-violet-700 dark:text-violet-300">
                  Submitted — waiting for admin approval. You can still fix and resubmit.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {!isLocked && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border z-30"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full py-3 rounded-md bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50">
            <Send size={16} />
            {submitting ? 'Submitting…' : effective === 'submitted' ? 'Resubmit' : 'Submit Cleaning'}
          </button>
        </div>
      )}
    </div>
  )
}

function CleaningCard({ cleaning, onClick }) {
  const effective = getEffectiveStatus(cleaning)
  const meta = STATUS_META[effective] || STATUS_META.scheduled
  const unit = cleaning.units
  const booking = cleaning.bookings
  const photoCount =
    (cleaning.photos_before?.length || 0) +
    (cleaning.photos_after?.length || 0) +
    (cleaning.photos_report?.length || 0)

  return (
    <button onClick={onClick} className="w-full text-left bg-card border border-border rounded-md p-4 active:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-bold text-foreground truncate">
            {cleaning.cleaning_code || '—'}
          </p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {unit?.unit_code || '—'}
            {unit?.building ? ` · ${unit.building}` : ''}
          </p>
        </div>
        <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0', meta.badge)}>
          {meta.label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
        <span className="capitalize font-semibold text-foreground">{cleaning.type}</span>
        {booking && (<><span className="text-muted-foreground/40">·</span><span className="font-mono truncate">{booking.booking_code}</span></>)}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-muted-foreground">{formatDateShort(cleaning.scheduled_date)}</span>
        {photoCount > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Camera size={11} />{photoCount}</span>
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
    if (!id) { setCleanings([]); setLoading(false); return }
    setLoading(true); setFetchError(null)
    try {
      const { data, error } = await supabase
        .from('cleanings')
        .select(`*, units:unit_id ( id, unit_code, building ), bookings:booking_id ( id, booking_code, guest_name, check_in, check_out )`)
        .eq('housekeeper_id', id)
        .order('scheduled_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      setCleanings(data || [])
    } catch (err) {
      console.error('Fetch cleanings failed:', err)
      setFetchError(err?.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [housekeeper?.id])

  useEffect(() => {
    if (!housekeeper?.id) { setCleanings([]); setLoading(false); return }
    fetchData(housekeeper.id)
  }, [housekeeper?.id, fetchData])

  useEffect(() => {
    if (!housekeeper?.id) return
    const channel = supabase
      .channel(`hk-cleanings-${housekeeper.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings', filter: `housekeeper_id=eq.${housekeeper.id}` },
        () => { fetchData(housekeeper.id) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [housekeeper?.id, fetchData])

  const selected = cleanings.find((c) => c.id === selectedId) || null

  if (selected) {
    return <CleaningDetail cleaning={selected} onBack={() => setSelectedId(null)} onChanged={() => fetchData(housekeeper?.id)} />
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-8">
      <header className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <HousekeeperAvatar name={housekeeper?.name} photo_url={housekeeper?.photo_url} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Housekeeping</p>
              <p className="text-sm font-semibold text-foreground truncate">{housekeeper?.name || 'Tasks'}</p>
            </div>
          </div>
          <button onClick={() => navigate('/')} className="p-2 rounded-md active:bg-muted" title="Back to main site"><Home size={16} className="text-muted-foreground" /></button>
          <button onClick={async () => { await signOut(); navigate('/') }} className="text-[11px] font-medium text-muted-foreground hover:text-red-500 active:text-red-500 px-2 py-2">Sign out</button>
        </div>
      </header>

      <main className="p-4 space-y-3">
        {loading ? (
          <TaskListSkeleton />
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
          cleanings.map((c) => <CleaningCard key={c.id} cleaning={c} onClick={() => setSelectedId(c.id)} />)
        )}
      </main>
    </div>
  )
}