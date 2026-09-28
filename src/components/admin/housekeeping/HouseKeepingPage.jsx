import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2,
  Sparkles, Droplets, AlertTriangle, Calendar, User, Camera,
  ChevronRight, Download, Building2, Clock, CheckCircle2,
  Image as ImageIcon, Package, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/auditLog'
import { cn } from '@/lib/utils'
import {
  listCleanings, createCleaning, updateCleaning, deleteCleaning,
  addPhotoToCleaning, removePhotoFromCleaning,
  parseInventory, setInventory,
  downloadCleaningsCSV,
} from '@/lib/cleanings'

const BRAND = '#2d568e'

const TYPE_CONFIG = {
  basic: {
    label: 'Basic',
    className: 'bg-blue-600 text-white border-0',
    icon: Droplets,
  },
  deep: {
    label: 'Deep',
    className: 'bg-purple-600 text-white border-0',
    icon: Sparkles,
  },
}

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     className: 'bg-amber-600 text-white border-0' },
  in_progress: { label: 'In Progress', className: 'bg-blue-600 text-white border-0' },
  completed:   { label: 'Completed',   className: 'bg-emerald-600 text-white border-0' },
}

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'deep', label: 'Deep' },
  { id: 'basic', label: 'Basic' },
]

const PILL_TEXT_ACTIVE = {
  all: 'text-foreground',
  pending: 'text-amber-700 dark:text-amber-400',
  in_progress: 'text-blue-700 dark:text-blue-400',
  completed: 'text-emerald-700 dark:text-emerald-400',
  deep: 'text-purple-700 dark:text-purple-400',
  basic: 'text-blue-700 dark:text-blue-400',
}

const PHOTO_LIMITS = { before: 15, after: 15, report: 10 }

const ROW_GRID = 'grid grid-cols-[1.3fr_1fr_1fr_1.2fr_1fr_140px] gap-4 items-center'
const PANEL_WIDTH = 480

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function today() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}
function computeNightsFromBooking(booking) {
  if (!booking?.check_in || !booking?.check_out) return 0
  const a = new Date(booking.check_in); a.setHours(0, 0, 0, 0)
  const b = new Date(booking.check_out); b.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((b - a) / 86400000))
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

const AVATAR_COLORS = [
  ['bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300'],
  ['bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-900/40', 'dark:text-emerald-300'],
  ['bg-orange-100', 'text-orange-700', 'dark:bg-orange-900/40', 'dark:text-orange-300'],
  ['bg-purple-100', 'text-purple-700', 'dark:bg-purple-900/40', 'dark:text-purple-300'],
  ['bg-rose-100', 'text-rose-700', 'dark:bg-rose-900/40', 'dark:text-rose-300'],
  ['bg-cyan-100', 'text-cyan-700', 'dark:bg-cyan-900/40', 'dark:text-cyan-300'],
  ['bg-amber-100', 'text-amber-700', 'dark:bg-amber-900/40', 'dark:text-amber-300'],
  ['bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900/40', 'dark:text-indigo-300'],
]
function avatarColor(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash = hash & hash }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function WorkerAvatar({ name, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

function TypeBadge({ type }) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.basic
  const Icon = config.icon
  return (
    <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5 inline-flex items-center gap-1', config.className)}>
      <Icon size={10} />
      {config.label}
    </Badge>
  )
}
function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', config.className)}>{config.label}</Badge>
}

function SectionCard({ title, icon: Icon, children, className, action }) {
  return (
    <div className={cn('rounded-md bg-card border border-border overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={13} className="text-muted-foreground flex-shrink-0" />}
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{title}</h4>
        </div>
        {action}
      </div>
      <div className="p-3 space-y-0.5">{children}</div>
    </div>
  )
}

function StatusPills({ active, onChange, counts }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  useEffect(() => {
    if (!containerRef.current) return
    const activeEl = containerRef.current.querySelector('[data-active="true"]')
    if (!activeEl) return
    const cRect = containerRef.current.getBoundingClientRect()
    const aRect = activeEl.getBoundingClientRect()
    setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
  }, [active, counts])

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
      <motion.div className="absolute top-1 bottom-1 rounded-full shadow-sm z-0 bg-card border border-border"
        animate={{ left: indicator.left, width: indicator.width }} transition={{ type: 'spring', stiffness: 350, damping: 28 }} />
      {STATUS_PILLS.map((tab) => {
        const isActive = active === tab.id
        const count = counts[tab.id] ?? 0
        return (
          <button key={tab.id} type="button" data-active={isActive} onClick={() => onChange(tab.id)}
            className={cn('relative z-10 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors duration-200 whitespace-nowrap',
              isActive ? (PILL_TEXT_ACTIVE[tab.id] || 'text-foreground') : 'text-muted-foreground hover:text-foreground')}>
            {tab.label}
            <span className={cn('ml-1', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function InventoryEditor({ cleaning, onChange }) {
  const [items, setItems] = useState(() => parseInventory(cleaning.inventory))
  const [draftName, setDraftName] = useState('')
  const [draftQty, setDraftQty] = useState('1')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setItems(parseInventory(cleaning.inventory)) }, [cleaning.id, cleaning.inventory])

  const persist = async (next) => {
    setSaving(true)
    try {
      await setInventory(cleaning.id, next)
      setItems(next)
      onChange?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save inventory')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    const name = draftName.trim()
    const qty = Number(draftQty) || 0
    if (!name) { toast.error('Enter an item name'); return }
    if (qty <= 0) { toast.error('Quantity must be > 0'); return }
    const next = [...items, { name, quantity: qty, note: '' }]
    setDraftName('')
    setDraftQty('1')
    persist(next)
  }

  const handleUpdate = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    setItems(next)
  }

  const handleUpdateCommit = (idx) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it
      return { ...it, quantity: Math.max(0, Number(it.quantity) || 0) }
    })
    persist(next)
  }

  const handleRemove = (idx) => {
    const next = items.filter((_, i) => i !== idx)
    persist(next)
  }

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2 text-center">No inventory added yet</p>
      ) : (
        <div className="space-y-1">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded bg-background border border-border">
              <Input
                value={it.name}
                onChange={(e) => handleUpdate(idx, { name: e.target.value })}
                onBlur={() => persist(items)}
                className="h-7 text-xs rounded bg-background flex-1"
                placeholder="Item name"
              />
              <Input
                type="number"
                min={0}
                value={it.quantity}
                onChange={(e) => handleUpdate(idx, { quantity: e.target.value })}
                onBlur={() => handleUpdateCommit(idx)}
                className="h-7 text-xs rounded bg-background w-16 tabular-nums"
              />
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                disabled={saving}
                className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          placeholder="e.g. Bath towel, Coffee, Water"
          className="h-7 text-xs rounded bg-background flex-1"
        />
        <Input
          type="number"
          min={1}
          value={draftQty}
          onChange={(e) => setDraftQty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          className="h-7 text-xs rounded bg-background w-16 tabular-nums"
        />
        <Button size="sm" className="h-7 px-2 rounded text-[11px]" onClick={handleAdd} disabled={saving}>
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
        </Button>
      </div>
    </div>
  )
}

function PhotoGrid({ cleaning, category, onChanged }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const photoKey = category === 'before' ? 'photos_before'
    : category === 'after' ? 'photos_after'
    : 'photos_report'

  const photos = Array.isArray(cleaning[photoKey]) ? cleaning[photoKey] : []
  const limit = PHOTO_LIMITS[category]
  const canUploadMore = photos.length < limit

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const remaining = limit - photos.length
    if (files.length > remaining) {
      toast.error(`Max ${limit} photos. ${remaining} slot${remaining === 1 ? '' : 's'} left.`)
    }

    setUploading(true)
    try {
      const toUpload = files.slice(0, remaining)
      let current = cleaning
      for (const f of toUpload) {
        await addPhotoToCleaning(current, category, f)
      }
      toast.success(`Uploaded ${toUpload.length} photo${toUpload.length === 1 ? '' : 's'}`)
      onChanged?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async (photo) => {
    const confirmed = window.confirm('Delete this photo?')
    if (!confirmed) return
    try {
      await removePhotoFromCleaning(cleaning, category, photo.path)
      toast.success('Photo deleted')
      onChanged?.()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="space-y-2">
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2 text-center">No {category} photos</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p, idx) => (
            <div key={p.path || idx} className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted group">
              <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => handleRemove(p)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {canUploadMore && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFiles}
            disabled={uploading}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded text-[11px] gap-1.5 w-full"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
            {uploading ? 'Uploading…' : `Add ${category} photo (${photos.length}/${limit})`}
          </Button>
        </>
      )}
      {!canUploadMore && (
        <p className="text-[10px] text-muted-foreground text-center">
          Max {limit} {category} photos reached
        </p>
      )}
    </div>
  )
}

function PhotoSection({ cleaning, onChanged }) {
  const [tab, setTab] = useState('before')
  const beforeCount = (cleaning.photos_before || []).length
  const afterCount = (cleaning.photos_after || []).length
  const reportCount = (cleaning.photos_report || []).length

  const tabs = [
    { id: 'before', label: 'Before', count: beforeCount },
    { id: 'after', label: 'After', count: afterCount },
    { id: 'report', label: 'Report', count: reportCount, alert: reportCount > 0 },
  ]

  return (
    <div className="rounded-md bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <ImageIcon size={13} className="text-muted-foreground" />
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Photos</h4>
      </div>

      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
              tab === t.id
                ? 'bg-card border border-border text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            <span className={cn('tabular-nums', t.alert && tab !== t.id ? 'text-red-500' : 'opacity-60')}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="p-3">
        <PhotoGrid cleaning={cleaning} category={tab} onChanged={onChanged} />
      </div>
    </div>
  )
}

const emptyNewCleaning = () => ({
  unit_id: '',
  booking_id: '',
  type: 'basic',
  scheduled_date: new Date().toISOString().slice(0, 10),
  housekeeper_id: '',
  notes: '',
})

function NewCleaningModal({ open, onClose, onCreated, units, bookings, housekeepers }) {
  const [form, setForm] = useState(emptyNewCleaning())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(emptyNewCleaning())
  }, [open])

  if (!open) return null

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleBookingChange = (bookingId) => {
    if (bookingId === '__none__') {
      setField('booking_id', '')
      return
    }
    const b = bookings.find((x) => x.id === bookingId)
    setForm((p) => ({
      ...p,
      booking_id: bookingId,
      unit_id: b?.unit_id || p.unit_id,
    }))
  }

  const handleSubmit = async () => {
    if (!form.unit_id) { toast.error('Select a unit'); return }
    setSaving(true)
    try {
      await createCleaning({
        unit_id: form.unit_id,
        booking_id: form.booking_id || null,
        type: form.type,
        status: 'pending',
        scheduled_date: form.scheduled_date || null,
        housekeeper_id: form.housekeeper_id || null,
        notes: form.notes.trim() || null,
      })
      logAudit('CREATE_CLEANING', 'cleanings', null, {
        unit_id: form.unit_id,
        type: form.type,
        booking_id: form.booking_id || null,
      }).catch(() => {})
      toast.success('Cleaning created')
      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-border"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">New Cleaning</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className={labelClass}>Unit *</label>
            <Select value={form.unit_id} onValueChange={(v) => setField('unit_id', v)}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Select a unit...">
                  {form.unit_id
                    ? (() => {
                        const u = units.find((x) => x.id === form.unit_id)
                        return u ? `${u.building || '—'} — ${u.unit_code || '—'}` : null
                      })()
                    : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs">
                    {u.building || '—'} — {u.unit_code || '—'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClass}>Linked Booking (optional)</label>
            <Select value={form.booking_id || '__none__'} onValueChange={handleBookingChange}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="No booking (standalone)">
                  {form.booking_id
                    ? (() => {
                        const b = bookings.find((x) => x.id === form.booking_id)
                        return b ? `${b.booking_code} · ${b.guest_name}` : null
                      })()
                    : <span className="text-muted-foreground italic">No booking (standalone)</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs italic text-muted-foreground">No booking (standalone)</SelectItem>
                {bookings.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.booking_code} · {b.guest_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Type</label>
              <Select value={form.type} onValueChange={(v) => setField('type', v)}>
                <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic" className="text-xs">Basic</SelectItem>
                  <SelectItem value="deep" className="text-xs">Deep</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelClass}>Scheduled date</label>
              <Input type="date" value={form.scheduled_date} onChange={(e) => setField('scheduled_date', e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Housekeeper (optional)</label>
            <Select value={form.housekeeper_id || '__none__'} onValueChange={(v) => setField('housekeeper_id', v === '__none__' ? '' : v)}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Unassigned">
                  {form.housekeeper_id
                    ? (() => {
                        const h = housekeepers.find((x) => x.id === form.housekeeper_id)
                        return h ? `${h.name} · ${h.code}` : null
                      })()
                    : <span className="text-muted-foreground italic">Unassigned</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs italic text-muted-foreground">Unassigned</SelectItem>
                {housekeepers.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">{h.name} · {h.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={2}
              className="text-xs rounded resize-none"
              placeholder="Any notes..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
            {saving ? 'Creating...' : 'Create Cleaning'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function CleaningDetailPanel({ cleaning, onClose, onChanged, onDelete, housekeepers }) {
  const [saving, setSaving] = useState(false)

  const updateField = async (field, value) => {
    setSaving(true)
    try {
      await updateCleaning(cleaning.id, { [field]: value })
      logAudit(`UPDATE_CLEANING_FIELD:${field}`, 'cleanings', cleaning.id, { field, to: value }).catch(() => {})
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    const confirmed = window.confirm('Mark this cleaning as completed?')
    if (!confirmed) return
    setSaving(true)
    try {
      await updateCleaning(cleaning.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      logAudit('COMPLETE_CLEANING', 'cleanings', cleaning.id, {}).catch(() => {})
      toast.success('Cleaning completed')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to complete')
    } finally {
      setSaving(false)
    }
  }

  const booking = cleaning.bookings
  const stayNights = computeNightsFromBooking(booking)
  const suggestDeep = stayNights >= 7 && cleaning.type === 'basic'

  const selectedHousekeeper = housekeepers.find((h) => h.id === cleaning.housekeeper_id) || null

  return (
    <motion.div
      key={cleaning.id}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: PANEL_WIDTH, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{
        width: { duration: 0.32, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.2, ease: 'easeOut' },
      }}
      className="bg-card border-l border-border h-full overflow-hidden flex-shrink-0"
      style={{ maxWidth: '100%' }}
    >
      <div className="flex flex-col h-full" style={{ width: PANEL_WIDTH }}>

        <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Building2 size={20} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-foreground truncate">
                {cleaning.units?.unit_code || '—'}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {cleaning.units?.building || '—'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <TypeBadge type={cleaning.type} />
                <StatusBadge status={cleaning.status} />
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {cleaning.status !== 'completed' && (
            <Button
              size="sm"
              className="h-8 rounded text-xs w-full gap-1.5 text-white"
              style={{ backgroundColor: '#059669' }}
              onClick={handleComplete}
              disabled={saving}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Mark as Completed
            </Button>
          )}

          <SectionCard title="Overview" icon={Clock}>
            {booking && (
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Booking</span>
                <span className="text-xs font-mono text-foreground truncate">{booking.booking_code}</span>
                <span className="text-[11px] text-muted-foreground truncate">· {booking.guest_name}</span>
              </div>
            )}
            {!booking && (
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Booking</span>
                <span className="text-xs italic text-muted-foreground">Standalone (no booking)</span>
              </div>
            )}
            {suggestDeep && (
              <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-[11px] text-amber-700 dark:text-amber-300 flex-1">
                  {stayNights}-night stay — consider deep clean
                </span>
                <button
                  type="button"
                  onClick={() => updateField('type', 'deep')}
                  disabled={saving}
                  className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 hover:underline disabled:opacity-50"
                >
                  Set Deep
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Type</span>
              <div className="flex-1">
                <Select value={cleaning.type} onValueChange={(v) => updateField('type', v)}>
                  <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic" className="text-xs">Basic</SelectItem>
                    <SelectItem value="deep" className="text-xs">Deep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Status</span>
              <div className="flex-1">
                <Select value={cleaning.status} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                    <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                    <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Scheduled</span>
              <Input
                type="date"
                value={cleaning.scheduled_date || ''}
                onChange={(e) => updateField('scheduled_date', e.target.value || null)}
                className="h-7 text-xs rounded bg-background flex-1"
              />
            </div>

            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Completed</span>
              <span className="text-xs tabular-nums text-foreground">{cleaning.completed_at ? formatDateTime(cleaning.completed_at) : '—'}</span>
            </div>
          </SectionCard>

          <SectionCard title="Housekeeper" icon={User}>
            {selectedHousekeeper ? (
              <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-border">
                <WorkerAvatar name={selectedHousekeeper.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{selectedHousekeeper.name}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{selectedHousekeeper.code}</p>
                </div>
              </div>
            ) : null}
            <Select
              value={cleaning.housekeeper_id || '__none__'}
              onValueChange={(v) => updateField('housekeeper_id', v === '__none__' ? null : v)}
            >
              <SelectTrigger className="h-8 text-xs rounded w-full">
                <SelectValue placeholder="Unassigned">
                  {selectedHousekeeper ? selectedHousekeeper.name : <span className="text-muted-foreground italic">Unassigned</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs italic text-muted-foreground">Unassigned</SelectItem>
                {housekeepers.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">{h.name} · {h.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SectionCard>

          <SectionCard title={`Inventory · ${parseInventory(cleaning.inventory).length}`} icon={Package}>
            <InventoryEditor cleaning={cleaning} onChange={onChanged} />
          </SectionCard>

          <PhotoSection cleaning={cleaning} onChanged={onChanged} />

          <SectionCard title="Notes" icon={FileText}>
            <Textarea
              key={cleaning.id}
              defaultValue={cleaning.notes || ''}
              onBlur={async (e) => {
                if (e.target.value === (cleaning.notes || '')) return
                try {
                  await updateCleaning(cleaning.id, { notes: e.target.value || null })
                  toast.success('Notes saved')
                  onChanged()
                } catch { toast.error('Failed to save') }
              }}
              rows={3}
              className="text-xs rounded resize-none w-full"
              placeholder="Add notes..."
            />
          </SectionCard>

          <div className="pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded text-xs w-full gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              onClick={onDelete}
            >
              <Trash2 size={12} /> Delete Cleaning
            </Button>
          </div>

        </div>
      </div>
    </motion.div>
  )
}

function CleaningListRow({ cleaning, selected, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{
        backgroundColor: selected ? 'rgba(45, 86, 142, 0.10)' : 'rgba(45, 86, 142, 0)',
      }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.14)' : 'rgba(45, 86, 142, 0.05)' }}
      whileTap={{ scale: 0.998 }}
      className={cn('group/row w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
    >
      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">
          {cleaning.units?.unit_code || '—'}
        </span>
        <span className="text-[10px] text-muted-foreground truncate block">
          {cleaning.units?.building || '—'}
        </span>
      </div>

      <div className="min-w-0">
        {cleaning.bookings ? (
          <>
            <span className="font-mono text-[11px] text-foreground truncate block">{cleaning.bookings.booking_code}</span>
            <span className="text-[10px] text-muted-foreground truncate block">{cleaning.bookings.guest_name}</span>
          </>
        ) : (
          <span className="text-[10px] italic text-muted-foreground">Standalone</span>
        )}
      </div>

      <div className="min-w-0">
        <TypeBadge type={cleaning.type} />
      </div>

      <div className="min-w-0 flex items-center gap-2">
        {cleaning.housekeepers ? (
          <>
            <WorkerAvatar name={cleaning.housekeepers.name} size="sm" />
            <span className="text-xs text-foreground truncate">{cleaning.housekeepers.name}</span>
          </>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">Unassigned</span>
        )}
      </div>

      <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
        <div className="truncate">{formatDate(cleaning.scheduled_date)}</div>
      </div>

      <div className="flex items-center gap-2 justify-end flex-shrink-0">
        <StatusBadge status={cleaning.status} />
        <ChevronRight
          size={14}
          className={cn('text-muted-foreground/40 transition-transform duration-300 ease-out', selected && 'rotate-180 text-primary')}
        />
      </div>
    </motion.button>
  )
}

export default function HousekeepingPage() {
  const [cleanings, setCleanings] = useState([])
  const [units, setUnits] = useState([])
  const [bookings, setBookings] = useState([])
  const [housekeepers, setHousekeepers] = useState([])

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [selectedId, setSelectedId] = useState(null)
  const [newModalOpen, setNewModalOpen] = useState(false)

  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const [cRes, uRes, bRes, hRes] = await Promise.all([
        listCleanings({}),
        supabase.from('units').select('id, unit_code, building, status').order('unit_code'),
        supabase.from('bookings').select('id, booking_code, guest_name, unit_id, check_in, check_out, completed_at').order('check_in', { ascending: false }).limit(200),
        supabase.from('housekeepers').select('id, code, name').eq('status', 'active').order('name'),
      ])
      if (uRes.error) throw uRes.error
      if (bRes.error) throw bRes.error
      if (hRes.error) throw hRes.error
      setCleanings(cRes)
      setUnits(uRes.data || [])
      setBookings(bRes.data || [])
      setHousekeepers(hRes.data || [])
    } catch (err) {
      console.error('Failed to load housekeeping data:', err)
      toast.error('Failed to load cleanings')
    } finally {
      setIsFirstLoad(false)
      setIsRefreshing(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime — unique channel name + clean teardown
  useEffect(() => {
    const ch = supabase
      .channel(`housekeeping-admin-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings' }, () => {
        fetchData()
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const counts = useMemo(() => {
    const c = { all: cleanings.length, pending: 0, in_progress: 0, completed: 0, deep: 0, basic: 0 }
    for (const x of cleanings) {
      if (x.status && c[x.status] !== undefined) c[x.status]++
      if (x.type && c[x.type] !== undefined) c[x.type]++
    }
    return c
  }, [cleanings])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return cleanings.filter((c) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'deep' && c.type !== 'deep') return false
        else if (statusFilter === 'basic' && c.type !== 'basic') return false
        else if (statusFilter !== 'deep' && statusFilter !== 'basic' && c.status !== statusFilter) return false
      }
      if (q) {
        const hay = [
          c.units?.unit_code, c.units?.building,
          c.bookings?.booking_code, c.bookings?.guest_name,
          c.housekeepers?.name, c.housekeepers?.code,
          c.notes,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [cleanings, statusFilter, debouncedSearch])

  const selected = useMemo(() => cleanings.find((c) => c.id === selectedId) || null, [cleanings, selectedId])

  const handleSelect = (c) => setSelectedId((prev) => (prev === c.id ? null : c.id))

  const handleDelete = async (cleaning) => {
    const confirmed = window.confirm(
      `Delete this cleaning?\n\nUnit: ${cleaning.units?.unit_code || '—'}\n${cleaning.bookings ? `Booking: ${cleaning.bookings.booking_code}\n` : ''}Type: ${cleaning.type}\n\nThis cannot be undone.`
    )
    if (!confirmed) return
    try {
      await deleteCleaning(cleaning.id)
      logAudit('DELETE_CLEANING', 'cleanings', cleaning.id, {}).catch(() => {})
      toast.success('Cleaning deleted')
      setSelectedId(null)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to delete')
    }
  }

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return }
    downloadCleaningsCSV(filtered, `cleanings_${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success('Exported')
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card border border-border rounded-md">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search unit, booking, housekeeper, notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded"
              />
            </div>
            <Button
              size="sm"
              className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]"
              style={{ backgroundColor: BRAND }}
              onClick={() => setNewModalOpen(true)}
            >
              <Plus size={13} />
              <span className="hidden sm:inline ml-1">New Cleaning</span>
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded">
              <Download size={13} />
            </Button>
          </div>

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <StatusPills active={statusFilter} onChange={setStatusFilter} counts={counts} />
          </div>

          <div className="flex-1 min-h-0 rounded border border-border overflow-hidden">
            <div
              className="h-full overflow-y-auto"
              style={{ scrollbarGutter: 'stable' }}
            >
              <div className={cn('sticky top-0 z-10 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Unit</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Booking</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Type</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Housekeeper</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Scheduled</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right truncate">Status</span>
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <Sparkles size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-semibold">No cleanings match your filters</p>
                    <p className="text-xs text-muted-foreground mt-1">Try clearing filters or creating a new cleaning</p>
                  </div>
                </div>
              ) : (
                filtered.map((c) => (
                  <CleaningListRow
                    key={c.id}
                    cleaning={c}
                    selected={selectedId === c.id}
                    onClick={() => handleSelect(c)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <CleaningDetailPanel
            key={selected.id}
            cleaning={selected}
            onClose={() => setSelectedId(null)}
            onChanged={fetchData}
            onDelete={() => handleDelete(selected)}
            housekeepers={housekeepers}
          />
        )}
      </AnimatePresence>

      <NewCleaningModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={fetchData}
        units={units}
        bookings={bookings}
        housekeepers={housekeepers}
      />
    </div>
  )
}