import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, ArrowLeft, Camera, X, Trash2,
  Package, FileText, AlertTriangle, CheckCircle2,
  Image as ImageIcon, Plus, Home, Clock, Sparkles,
  Shirt, Send, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import { submitCleaning, parseInventory, parseLaundryItems, compressImage } from '@/lib/cleanings'
import { cn } from '@/lib/utils'

const PHOTO_LIMITS = { before: 15, after: 15, report: 10 }

const STATUS_META = {
  pending:     { label: 'Pending',     badge: 'bg-amber-600 text-white' },
  in_progress: { label: 'In Progress', badge: 'bg-blue-600 text-white' },
  submitted:   { label: 'Submitted',   badge: 'bg-violet-600 text-white' },
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

// ============================================================
// PHOTO GRID (multi) — local-only, holds File[] for new photos
// ============================================================
function PhotoGridLocal({ label, existing = [], newFiles = [], limit = 15, onAdd, onRemoveExisting, onRemoveNew }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const total = existing.length + newFiles.length
  const canUpload = total < limit

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
          {existing.map((p, i) => (
            <div key={`e-${p.path || i}`} className="relative aspect-square rounded-md overflow-hidden bg-muted border border-border">
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemoveExisting(p)}
                className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {newFiles.map((f, i) => (
            <div key={`n-${i}`} className="relative aspect-square rounded-md overflow-hidden bg-muted border-2 border-dashed border-primary/40">
              <img src={f.preview} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-1 left-1 text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">NEW</span>
              <button
                type="button"
                onClick={() => onRemoveNew(i)}
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
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors"
            >
              <Camera size={14} />
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors"
            >
              <ImageIcon size={14} />
              Gallery
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// SINGLE PHOTO (laundry) — local-only
// ============================================================
function SinglePhotoLocal({ label, existing, newFile, onPick, onClear }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)

  const preview = newFile?.preview || existing?.url || null
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
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] font-semibold uppercase tracking-wider text-red-500"
          >
            Remove
          </button>
        )}
      </div>

      {preview ? (
        <div className="relative aspect-video rounded-md overflow-hidden bg-muted border border-border">
          <img src={preview} alt="" className="w-full h-full object-cover" />
          {isNew && (
            <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">NEW</span>
          )}
        </div>
      ) : (
        <>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFiles} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors"
            >
              <Camera size={14} />
              Take Photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-md border-2 border-dashed border-border text-muted-foreground text-xs font-medium active:bg-muted/50 transition-colors"
            >
              <ImageIcon size={14} />
              Gallery
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// LIST EDITOR (inventory + laundry items)
// ============================================================
function ListEditor({ items, onChange, placeholder = 'Item name' }) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')

  const handleAdd = () => {
    const n = name.trim()
    const q = Number(qty) || 0
    if (!n) return toast.error('Enter item name')
    if (q <= 0) return toast.error('Quantity must be > 0')
    onChange([...items, { name: n, quantity: q }])
    setName(''); setQty('1')
  }

  const handleRemove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const handleQtyChange = (i, q) => {
    const next = items.map((it, idx) => idx === i ? { ...it, quantity: Math.max(0, Number(q) || 0) } : it)
    onChange(next)
  }
  const handleNameChange = (i, n) => {
    const next = items.map((it, idx) => idx === i ? { ...it, name: n } : it)
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
              <input
                type="text"
                value={it.name}
                onChange={(e) => handleNameChange(i, e.target.value)}
                className="flex-1 text-sm bg-transparent border-0 focus:outline-none text-foreground"
              />
              <input
                type="number"
                min={0}
                value={it.quantity}
                onChange={(e) => handleQtyChange(i, e.target.value)}
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
          placeholder={placeholder}
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
          className="p-2.5 rounded bg-primary text-primary-foreground active:scale-95 transition-transform"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

// ============================================================
// CLEANING DETAIL — local-only editing, Submit at the bottom
// ============================================================
function CleaningDetail({ cleaning, onBack, onChanged }) {
  const [photoTab, setPhotoTab] = useState('before')
  const [submitting, setSubmitting] = useState(false)

  // Existing kept photos
  const [keepBefore, setKeepBefore] = useState(() => Array.isArray(cleaning.photos_before) ? cleaning.photos_before : [])
  const [keepAfter, setKeepAfter] = useState(() => Array.isArray(cleaning.photos_after) ? cleaning.photos_after : [])
  const [keepReport, setKeepReport] = useState(() => Array.isArray(cleaning.photos_report) ? cleaning.photos_report : [])

  // New photos (File + preview)
  const [newBefore, setNewBefore] = useState([])
  const [newAfter, setNewAfter] = useState([])
  const [newReport, setNewReport] = useState([])

  // Laundry
  const [laundryUsedFile, setLaundryUsedFile] = useState(null)      // { file, preview }
  const [laundryCleanedFile, setLaundryCleanedFile] = useState(null)
  const [laundryUsedExisting, setLaundryUsedExisting] = useState(cleaning.laundry_used_photo || null)
  const [laundryCleanedExisting, setLaundryCleanedExisting] = useState(cleaning.laundry_cleaned_photo || null)

  const [laundryUsedItems, setLaundryUsedItems] = useState(() => parseLaundryItems(cleaning.laundry_used_items))
  const [laundryCleanedItems, setLaundryCleanedItems] = useState(() => parseLaundryItems(cleaning.laundry_cleaned_items))

  // Inventory + notes
  const [inventory, setInventory] = useState(() => parseInventory(cleaning.inventory))
  const [notesDraft, setNotesDraft] = useState(cleaning.notes || '')

  // Reset when cleaning changes
  useEffect(() => {
    setKeepBefore(Array.isArray(cleaning.photos_before) ? cleaning.photos_before : [])
    setKeepAfter(Array.isArray(cleaning.photos_after) ? cleaning.photos_after : [])
    setKeepReport(Array.isArray(cleaning.photos_report) ? cleaning.photos_report : [])
    setNewBefore([])
    setNewAfter([])
    setNewReport([])
    setLaundryUsedFile(null)
    setLaundryCleanedFile(null)
    setLaundryUsedExisting(cleaning.laundry_used_photo || null)
    setLaundryCleanedExisting(cleaning.laundry_cleaned_photo || null)
    setLaundryUsedItems(parseLaundryItems(cleaning.laundry_used_items))
    setLaundryCleanedItems(parseLaundryItems(cleaning.laundry_cleaned_items))
    setInventory(parseInventory(cleaning.inventory))
    setNotesDraft(cleaning.notes || '')
  }, [cleaning.id])

  const status = cleaning.status || 'pending'
  const meta = STATUS_META[status] || STATUS_META.pending
  const alreadySubmitted = status === 'submitted' || status === 'completed'

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
    const ok = window.confirm('Submit this cleaning? You can still edit after submitting.')
    if (!ok) return
    setSubmitting(true)
    try {
      await submitCleaning({
        cleaning,
        newPhotosBefore: newBefore.map((x) => x.file),
        newPhotosAfter: newAfter.map((x) => x.file),
        newPhotosReport: newReport.map((x) => x.file),
        newLaundryUsedPhoto: laundryUsedFile?.file || null,
        newLaundryCleanedPhoto: laundryCleanedFile?.file || null,
        keepPhotosBefore: keepBefore,
        keepPhotosAfter: keepAfter,
        keepPhotosReport: keepReport,
        inventory,
        laundryUsedItems,
        laundryCleanedItems,
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
            <p className="text-sm font-bold text-foreground truncate">{unit?.unit_code || '—'}</p>
            <p className="text-[11px] text-muted-foreground truncate">{unit?.building || '—'}</p>
          </div>
          <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold', meta.badge)}>
            {meta.label}
          </span>
        </div>
      </header>

      <div className="p-4 space-y-3">
        {/* Overview */}
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
              <div className="text-xs italic text-muted-foreground text-center py-1">Standalone deep clean</div>
            )}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Scheduled</span>
              <span className="text-xs text-foreground">{formatDateShort(cleaning.scheduled_date)}</span>
            </div>
          </div>
        </SectionCard>

        {/* Photos */}
        <div className="rounded-md bg-card border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <ImageIcon size={13} className="text-muted-foreground" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Photos</h4>
          </div>

          <div className="flex gap-1 p-2 border-b border-border bg-muted/20">
            {['before', 'after', 'report'].map((t) => {
              const existing = t === 'before' ? keepBefore : t === 'after' ? keepAfter : keepReport
              const added = t === 'before' ? newBefore : t === 'after' ? newAfter : newReport
              const count = existing.length + added.length
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
            {photoTab === 'before' && (
              <PhotoGridLocal
                label="Before"
                existing={keepBefore}
                newFiles={newBefore}
                limit={PHOTO_LIMITS.before}
                onAdd={handleAddBefore}
                onRemoveExisting={handleRemoveExisting(setKeepBefore, keepBefore)}
                onRemoveNew={removeNew(setNewBefore)}
              />
            )}
            {photoTab === 'after' && (
              <PhotoGridLocal
                label="After"
                existing={keepAfter}
                newFiles={newAfter}
                limit={PHOTO_LIMITS.after}
                onAdd={handleAddAfter}
                onRemoveExisting={handleRemoveExisting(setKeepAfter, keepAfter)}
                onRemoveNew={removeNew(setNewAfter)}
              />
            )}
            {photoTab === 'report' && (
              <PhotoGridLocal
                label="Report"
                existing={keepReport}
                newFiles={newReport}
                limit={PHOTO_LIMITS.report}
                onAdd={handleAddReport}
                onRemoveExisting={handleRemoveExisting(setKeepReport, keepReport)}
                onRemoveNew={removeNew(setNewReport)}
              />
            )}
          </div>
        </div>

        {/* Laundry */}
        <div className="rounded-md bg-card border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
            <Shirt size={13} className="text-muted-foreground" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Laundry</h4>
          </div>

          <div className="p-3 space-y-4">
            {/* Used */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Used (dirty)</p>
              <SinglePhotoLocal
                label="Photo"
                existing={laundryUsedExisting}
                newFile={laundryUsedFile}
                onPick={(f) => setLaundryUsedFile({ file: f, preview: URL.createObjectURL(f) })}
                onClear={() => { setLaundryUsedFile(null); setLaundryUsedExisting(null) }}
              />
              <div className="mt-3">
                <ListEditor
                  items={laundryUsedItems}
                  onChange={setLaundryUsedItems}
                  placeholder="e.g. Bath towel, Bedsheet"
                />
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Cleaned */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Cleaned (fresh)</p>
              <SinglePhotoLocal
                label="Photo"
                existing={laundryCleanedExisting}
                newFile={laundryCleanedFile}
                onPick={(f) => setLaundryCleanedFile({ file: f, preview: URL.createObjectURL(f) })}
                onClear={() => { setLaundryCleanedFile(null); setLaundryCleanedExisting(null) }}
              />
              <div className="mt-3">
                <ListEditor
                  items={laundryCleanedItems}
                  onChange={setLaundryCleanedItems}
                  placeholder="e.g. Bath towel, Bedsheet"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Inventory */}
        <SectionCard title="Inventory" icon={Package}>
          <ListEditor items={inventory} onChange={setInventory} placeholder="e.g. Coffee, Water" />
        </SectionCard>

        {/* Notes */}
        <SectionCard title="Notes" icon={FileText}>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={3}
            placeholder="Any notes about this cleaning…"
            className="w-full text-xs bg-background border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
          />
        </SectionCard>

        {alreadySubmitted && (
          <div className="rounded-md bg-violet-500/10 border border-violet-500/30 p-3">
            <p className="text-xs text-violet-700 dark:text-violet-300">
              {status === 'completed'
                ? 'Approved by admin — no more edits accepted.'
                : 'Submitted — waiting for admin approval. You can still fix and resubmit.'}
            </p>
          </div>
        )}
      </div>

      {/* Sticky Submit */}
      {status !== 'completed' && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border z-30"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-md bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? 'Submitting…' : status === 'submitted' ? 'Resubmit' : 'Submit Cleaning'}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// CLEANING CARD
// ============================================================
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
          <p className="text-sm font-bold text-foreground truncate">{unit?.unit_code || '—'}</p>
          <p className="text-[11px] text-muted-foreground truncate">{unit?.building || '—'}</p>
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
        <span className="text-[11px] text-muted-foreground">{formatDateShort(cleaning.scheduled_date)}</span>
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

// ============================================================
// MAIN PAGE
// ============================================================
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
    if (!housekeeper?.id) { setCleanings([]); setLoading(false); return }
    fetchData(housekeeper.id)
  }, [housekeeper?.id, fetchData])

  useEffect(() => {
    if (!housekeeper?.id) return
    const channel = supabase
      .channel(`hk-cleanings-${housekeeper.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cleanings', filter: `housekeeper_id=eq.${housekeeper.id}` },
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
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <HousekeeperAvatar name={housekeeper?.name} photo_url={housekeeper?.photo_url} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Housekeeping</p>
              <p className="text-sm font-semibold text-foreground truncate">{housekeeper?.name || 'Tasks'}</p>
            </div>
          </div>
          <button onClick={() => navigate('/')} className="p-2 rounded-md active:bg-muted" title="Back to main site">
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
            <CleaningCard key={c.id} cleaning={c} onClick={() => setSelectedId(c.id)} />
          ))
        )}
      </main>
    </div>
  )
}