import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowUpDown, ArrowUp, ArrowDown, Camera, Check, Download, Loader2, Mail, Phone,
  Plus, RefreshCw, Search, SlidersHorizontal, X, Pencil, Tag, Layers,
  Building2, CheckCircle2, Clock, AlertTriangle, UserPlus, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { listUnits, updateUnit, updateContract, createUnit, createOwner, formatDate } from '@/lib/registry'
import { cn } from '@/lib/utils'

// ============================================================
// CONFIG
// ============================================================

const BRAND = '#2d568e'

const STATUS_CONFIG = {
  ACTIVE:      { label: 'Active',      className: 'bg-emerald-600 text-white hover:bg-emerald-600 border-0' },
  INACTIVE:    { label: 'Inactive',    className: 'bg-gray-500 text-white hover:bg-gray-500 border-0' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-blue-600 text-white hover:bg-blue-600 border-0' },
  FOR_RENEWAL: { label: 'For Renewal', className: 'bg-amber-600 text-white hover:bg-amber-600 border-0' },
}

// Color of the sliding indicator when a pill is active
const PILL_INDICATOR_BG = {
  all:          'bg-primary',
  ACTIVE:       'bg-emerald-600',
  IN_PROGRESS:  'bg-blue-600',
  FOR_RENEWAL:  'bg-amber-600',
  INACTIVE:     'bg-gray-500',
}

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'IN_PROGRESS', 'FOR_RENEWAL']
const UNIT_TYPES = ['Studio', '1-Bedroom', '2-Bedroom', 'Executive Studio', 'STOCKROOM']
const GC_STATUS_OPTIONS = ['FIXED', 'MESSENGER', 'VIBER', 'NOT YET', 'N/A']
const CLASSIFICATION_OPTIONS = ['Fixed', 'Partnership', '75/25', '85/15']

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'FOR_RENEWAL', label: 'For Renewal' },
  { id: 'INACTIVE', label: 'Inactive' },
]

const DATE_FILTERS = [
  { id: 'all', label: 'Any expiry' },
  { id: 'expired', label: 'Already expired' },
  { id: 'next30', label: 'Next 30 days' },
  { id: 'next90', label: 'Next 90 days' },
  { id: 'no-expiry', label: 'No expiry set' },
]

const DEFAULT_CHANNELS = [
  'Airbnb', 'Booking.com', 'Agoda', 'Hosteeva', 'Your Rentals',
  'Trip.com', 'Expedia', 'Vrbo', 'Facebook Marketplace',
]

const COL_WIDTHS = {
  photo: 'w-14',
  building: 'w-[150px]',
  unit: 'w-[120px]',
  owner: 'w-[200px]',
  type: 'w-[110px]',
  effective: 'w-[110px]',
  expiry: 'w-[130px]',
  status: 'w-[130px]',
}

// ============================================================
// AVATARS
// ============================================================

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

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function avatarColor(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash = hash & hash
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function OwnerAvatar({ name, email, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(email || name)
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

function UnitAvatar({ unit, size = 'md' }) {
  const sizeClasses = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8'
  return (
    <div className={cn('rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden border border-border bg-muted', sizeClasses)}>
      {unit.photo_url ? (
        <img src={unit.photo_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <Building2 size={size === 'lg' ? 18 : 14} className="text-muted-foreground" />
      )}
    </div>
  )
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({ status, className }) {
  const config = STATUS_CONFIG[status]
  if (!config) {
    return (
      <Badge className={cn('text-[11px] font-semibold bg-gray-400 text-white border-0 rounded-full px-2.5 py-0.5', className)}>
        {status || '—'}
      </Badge>
    )
  }
  return (
    <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', config.className, className)}>
      {config.label}
    </Badge>
  )
}

// ============================================================
// CONTRACT BADGE — warnings only
// ============================================================

function ContractBadge({ expiryDate }) {
  if (!expiryDate) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0)
  const days = Math.round((expiry - now) / 86400000)

  let className = ''
  let label = ''

  if (days < 0) {
    const abs = Math.abs(days)
    if (abs === 1) label = 'Expired yesterday'
    else label = `Overdue ${abs}d`
    className = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800'
  } else if (days === 0) {
    label = 'Expires today'
    className = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  } else if (days <= 30) {
    label = `Expires in ${days}d`
    className = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  } else {
    return null
  }

  return (
    <div className="px-1.5 pt-1">
      <Badge variant="outline" className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', className)}>
        {label}
      </Badge>
    </div>
  )
}

// ============================================================
// SUMMARY CARDS
// ============================================================

function SummaryCards({ units }) {
  const stats = useMemo(() => {
    let active = 0, inactive = 0, inProgress = 0, forRenewal = 0
    for (const u of units) {
      if (u.status === 'ACTIVE') active++
      else if (u.status === 'INACTIVE') inactive++
      else if (u.status === 'IN_PROGRESS') inProgress++
      else if (u.status === 'FOR_RENEWAL') forRenewal++
    }
    return { total: units.length, active, inactive, inProgress, forRenewal }
  }, [units])

  const cards = [
    { label: 'Total Units', value: stats.total,      icon: Building2     },
    { label: 'Active',      value: stats.active,     icon: CheckCircle2  },
    { label: 'In Progress', value: stats.inProgress, icon: Clock         },
    { label: 'For Renewal', value: stats.forRenewal, icon: AlertTriangle },
    { label: 'Inactive',    value: stats.inactive,   icon: UserPlus      },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {card.label}
            </span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

// ============================================================
// DATE CELL
// ============================================================

function DateCell({ value, isExpanded }) {
  if (!value) {
    return (
      <div className="flex items-center justify-end h-5">
        <span className={cn('text-xs text-muted-foreground', isExpanded && 'text-white/60')}>—</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-end h-5">
      <span className={cn('text-xs tabular-nums', isExpanded && 'text-white/95')}>
        {formatDate(value)}
      </span>
    </div>
  )
}

// ============================================================
// SORT HEAD
// ============================================================

function SortHead({ field, children, sortField, sortDir, onSort, align = 'left' }) {
  const isActive = sortField === field
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
  return (
    <th className={cn('bg-card px-4 py-2.5 border-b border-border', alignClass)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors duration-150',
          'text-[11px] font-bold uppercase tracking-wider',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {children}
        {isActive ? (
          sortDir === 'asc' ? <ArrowUp size={11} className="text-primary" /> : <ArrowDown size={11} className="text-primary" />
        ) : (
          <ArrowUpDown size={11} className="text-muted-foreground/40" />
        )}
      </button>
    </th>
  )
}

// ============================================================
// EDITABLE FIELD — always input, save on blur/Enter
// ============================================================

function EditableField({ label, value, type = 'text', options, onSave, actionHref, actionIcon: ActionIcon, actionTitle }) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = async () => {
    if (draft === (value ?? '')) return
    setStatus('saving')
    try {
      await onSave(draft === '' ? null : draft)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1200)
    } catch {
      toast.error('Save failed')
      setDraft(value ?? '')
      setStatus('idle')
    }
  }

  const cancel = () => setDraft(value ?? '')

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {options ? (
          <Select
            value={draft || ''}
            onValueChange={async (v) => {
              setDraft(v)
              setStatus('saving')
              try {
                await onSave(v)
                setStatus('saved')
                setTimeout(() => setStatus('idle'), 1200)
              } catch {
                toast.error('Save failed')
                setStatus('idle')
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs rounded bg-background border-border flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); e.target.blur() }
            }}
            onBlur={commit}
            className={cn(
              'h-7 text-xs rounded bg-background flex-1 transition-colors',
              !value && 'border-border',
              value && 'border-transparent hover:border-border'
            )}
            placeholder="—"
          />
        )}

        {status === 'saving' && <Loader2 size={11} className="flex-shrink-0 animate-spin text-primary" />}
        {status === 'saved' && <Check size={11} className="flex-shrink-0 text-emerald-500" />}
      </div>

      {actionHref && ActionIcon && value && (
        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 rounded text-muted-foreground hover:text-primary" asChild>
          <a href={actionHref} title={actionTitle || 'Open'}><ActionIcon size={12} /></a>
        </Button>
      )}
    </div>
  )
}

// ============================================================
// SECTION CARD — no left indent
// ============================================================

function SectionCard({ title, icon: Icon, children, className }) {
  return (
    <div className={cn('rounded-md bg-card border border-border overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        {Icon && <Icon size={13} className="text-muted-foreground flex-shrink-0" />}
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
      </div>
      <div className="p-3 space-y-0.5">
        {children}
      </div>
    </div>
  )
}

// ============================================================
// UNIT PHOTO UPLOAD
// ============================================================

function UnitPhotoUpload({ unit, onSave }) {
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${unit.id}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('unit-photos')
        .upload(path, file, { cacheControl: '3600', upsert: true })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('unit-photos').getPublicUrl(path)
      await onSave(data.publicUrl)
      toast.success('Photo updated')
    } catch (err) {
      console.error(err)
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-16 h-16 rounded-md overflow-hidden bg-muted border border-border flex-shrink-0 flex items-center justify-center">
        {unit.photo_url ? (
          <img src={unit.photo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Building2 size={22} className="text-muted-foreground" />
        )}
      </div>
      <label className="cursor-pointer">
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold',
            'text-white cursor-pointer transition-colors duration-150',
            uploading && 'opacity-50 pointer-events-none'
          )}
          style={{ backgroundColor: BRAND }}
        >
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
          {unit.photo_url ? 'Replace' : 'Upload'}
        </span>
      </label>
    </div>
  )
}

// ============================================================
// CHANNEL PICKER — text input + suggestions dropdown
// ============================================================

function ChannelPicker({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const filtered = useMemo(() => {
    const q = (value || '').toLowerCase().trim()
    if (!q) return options.slice(0, 20)
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 20)
  }, [value, options])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative flex-1 min-w-0" ref={wrapRef}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-7 text-xs rounded w-full"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded shadow-lg z-30 max-h-44 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// OTA EDITOR
// ============================================================

function OtaEditor({ unit, onSave, channelOptions = [] }) {
  const listings = useMemo(() => {
    const raw = unit.ota_listings
    if (Array.isArray(raw)) return raw.filter(x => x && x.channel)
    if (raw && typeof raw === 'object') return Object.entries(raw).map(([channel, name]) => ({ channel, name }))
    return []
  }, [unit.ota_listings])

  const [drafting, setDrafting] = useState(false)
  const [draftChannel, setDraftChannel] = useState('')
  const [draftName, setDraftName] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const allChannelOptions = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS)
    channelOptions.forEach(c => set.add(c))
    listings.forEach(l => set.add(l.channel))
    return [...set].sort()
  }, [channelOptions, listings])

  const persist = async (nextList) => {
    setSaving(true)
    try { await onSave(nextList) } catch { toast.error('Save failed') } finally { setSaving(false) }
  }

  const handleAdd = async () => {
    const channel = draftChannel.trim()
    const name = draftName.trim()
    if (!channel) { toast.error('Pick or type a channel'); return }
    if (!name) { toast.error('Enter a listing name'); return }
    if (listings.some(l => l.channel.toLowerCase() === channel.toLowerCase())) {
      toast.error('Channel already added')
      return
    }
    if (!DEFAULT_CHANNELS.includes(channel)) {
      supabase.from('ota_channel_names').insert({ name: channel }).then(() => {}).catch(() => {})
    }
    await persist([...listings, { channel, name }])
    setDrafting(false); setDraftChannel(''); setDraftName('')
  }

  const commitEdit = async (index) => {
    await persist(listings.map((l, i) => i === index ? { ...l, name: editDraft.trim() } : l))
    setEditingIndex(null)
  }

  return (
    <div className="space-y-1.5">
      {listings.length === 0 && !drafting && (
        <p className="text-xs text-muted-foreground italic py-1">No channels yet</p>
      )}

      {listings.map((item, i) => (
        <div key={`${item.channel}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 group/ota">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[72px] flex-shrink-0 truncate">
            {item.channel}
          </span>
          {editingIndex === i ? (
            <Input
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
                if (e.key === 'Escape') { e.preventDefault(); setEditingIndex(null) }
              }}
              onBlur={() => commitEdit(i)}
              autoFocus
              className="h-6 text-xs rounded bg-background px-1.5 flex-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setEditingIndex(i); setEditDraft(item.name) }}
              className="text-xs text-left flex-1 min-w-0 truncate hover:text-primary transition-colors flex items-center gap-1"
            >
              <span className="truncate">{item.name || 'Empty'}</span>
              <Pencil size={10} className="flex-shrink-0 text-muted-foreground/0 group-hover/ota:text-muted-foreground/60 transition-colors" />
            </button>
          )}
          <button
            type="button"
            onClick={() => persist(listings.filter((_, x) => x !== i))}
            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
          >
            <Trash2 size={11} />
          </button>
        </div>
      ))}

      {drafting ? (
        <div className="flex items-center gap-2 px-2 py-2 rounded bg-muted/50 border border-primary/40">
          <ChannelPicker
            value={draftChannel}
            onChange={setDraftChannel}
            options={allChannelOptions}
            placeholder="Channel"
          />
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setDrafting(false); setDraftChannel(''); setDraftName('') }
            }}
            placeholder="Listing name"
            className="h-7 text-xs rounded flex-1"
          />
          <Button size="icon" className="h-7 w-7 rounded flex-shrink-0" onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          </Button>
          <button
            type="button"
            onClick={() => { setDrafting(false); setDraftChannel(''); setDraftName('') }}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDrafting(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary py-1.5 px-2 rounded transition-colors"
        >
          <Plus size={11} />
          Add Channel
        </button>
      )}
    </div>
  )
}

// ============================================================
// INLINE STATUS PICKER (used inside expanded row when user
// clicks the status badge)
// ============================================================

function InlineStatusPicker({ value, onChange, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  return (
    <div ref={ref} className="absolute z-40 mt-1 bg-popover border border-border rounded shadow-lg overflow-hidden min-w-[140px]">
      {STATUS_OPTIONS.map((opt) => {
        const config = STATUS_CONFIG[opt]
        const isCurrent = value === opt
        return (
          <button
            key={opt}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange(opt); onClose() }}
            className={cn(
              'w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2',
              isCurrent ? 'bg-muted' : 'hover:bg-muted'
            )}
          >
            <span className={cn('w-2 h-2 rounded-full', config.className.split(' ')[0])} />
            {config.label}
            {isCurrent && <Check size={11} className="ml-auto text-primary" />}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================
// EXPANDED ROW
// ============================================================

function ExpandedRow({ unit, onUnitChange, onClose, rowRef, channelOptions }) {
  const handleUnitField = async (field, value) => {
    await updateUnit(unit.id, { [field]: value })
    onUnitChange({ ...unit, [field]: value })
  }

  const handleContractField = async (field, value) => {
    if (unit.current_contract_id) {
      await updateContract(unit.current_contract_id, { [field]: value })
      onUnitChange({ ...unit, [field]: value })
    } else {
      const { data, error } = await supabase
        .from('contracts')
        .insert({ unit_id: unit.id, owner_id: unit.owner_id, [field]: value })
        .select('id')
        .single()
      if (error) throw error
      await updateUnit(unit.id, { current_contract_id: data.id })
      onUnitChange({ ...unit, current_contract_id: data.id, [field]: value })
    }
  }

  const handleOtaSave = async (otaListings) => {
    await updateUnit(unit.id, { ota_listings: otaListings })
    onUnitChange({ ...unit, ota_listings: otaListings })
  }

  const handlePhotoSave = async (url) => {
    await updateUnit(unit.id, { photo_url: url })
    onUnitChange({ ...unit, photo_url: url })
  }

  return (
    <tr ref={rowRef} className="bg-muted/40 border-b border-border">
      <td className="p-0 bg-muted/40"></td>
      <td colSpan={7} className="p-0 bg-muted/40">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="px-4 py-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <SectionCard title="Unit" icon={Building2}>
                <UnitPhotoUpload unit={unit} onSave={handlePhotoSave} />
                <div className="pt-2 mt-2 border-t border-border space-y-0.5">
                  <EditableField label="Code" value={unit.unit_code} onSave={(v) => handleUnitField('unit_code', v)} />
                  <EditableField label="Building" value={unit.building} onSave={(v) => handleUnitField('building', v)} />
                  <EditableField label="Type" value={unit.unit_type} options={UNIT_TYPES} onSave={(v) => handleUnitField('unit_type', v)} />
                  <EditableField label="Status" value={unit.status} options={STATUS_OPTIONS} onSave={(v) => handleUnitField('status', v)} />
                </div>
              </SectionCard>

              <SectionCard title="Owner" icon={UserPlus}>
                <div className="flex items-center gap-2.5 mb-2 pb-2 border-b border-border">
                  <OwnerAvatar name={unit.owner_name} email={unit.owner_email} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{unit.owner_name || 'No owner'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{unit.owner_email || 'No email'}</p>
                  </div>
                </div>
                <EditableField label="Email" value={unit.owner_email} type="email" onSave={(v) => handleUnitField('owner_email', v)} actionHref={unit.owner_email ? `mailto:${unit.owner_email}` : null} actionIcon={Mail} actionTitle="Send email" />
                <EditableField label="Phone" value={unit.owner_phone} type="tel" onSave={(v) => handleUnitField('owner_phone', v)} actionHref={unit.owner_phone ? `tel:${unit.owner_phone}` : null} actionIcon={Phone} actionTitle="Call" />
                <EditableField label="GC" value={unit.gc_status} options={GC_STATUS_OPTIONS} onSave={(v) => handleUnitField('gc_status', v)} />
              </SectionCard>

              <SectionCard title="Contract" icon={Tag}>
                <EditableField label="Effective" value={unit.effective_date} type="date" onSave={(v) => handleContractField('effective_date', v)} />
                <EditableField label="Expiry" value={unit.expiry_date} type="date" onSave={(v) => handleContractField('expiry_date', v)} />
                <ContractBadge expiryDate={unit.expiry_date} />
                <EditableField label="Class" value={unit.classification} options={CLASSIFICATION_OPTIONS} onSave={(v) => handleContractField('classification', v)} />
                <EditableField label="PDF" value={unit.contract_pdf_url} onSave={(v) => handleContractField('contract_pdf_url', v)} />
              </SectionCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <SectionCard title="Marketing" icon={Layers}>
                <EditableField label="Title" value={unit.marketing_title} onSave={(v) => handleUnitField('marketing_title', v)} />
                <EditableField label="Inventory" value={unit.inventory_list} onSave={(v) => handleUnitField('inventory_list', v)} />
              </SectionCard>

              <SectionCard title="OTA Channels" icon={Tag} className="lg:col-span-2">
                <OtaEditor unit={unit} onSave={handleOtaSave} channelOptions={channelOptions} />
              </SectionCard>
            </div>
          </div>
        </motion.div>
      </td>
    </tr>
  )
}

// ============================================================
// ADD UNIT MODAL
// ============================================================

function AddUnitModal({ open, onClose, onCreated, existingBuildings, channelOptions }) {
  const [form, setForm] = useState({
    unit_code: '', building: '', unit_type: 'Studio', status: 'ACTIVE',
    owner_name: '', owner_email: '', owner_phone: '', gc_status: 'FIXED',
    effective_date: '', expiry_date: '', classification: 'Fixed',
    marketing_title: '', inventory_list: '',
  })
  const [otaListings, setOtaListings] = useState([])
  const [drafting, setDrafting] = useState(false)
  const [draftChannel, setDraftChannel] = useState('')
  const [draftName, setDraftName] = useState('')
  const [saving, setSaving] = useState(false)
  const [buildingFocus, setBuildingFocus] = useState(false)
  const [buildingSuggestions, setBuildingSuggestions] = useState([])

  useEffect(() => {
    if (!open) {
      setForm({
        unit_code: '', building: '', unit_type: 'Studio', status: 'ACTIVE',
        owner_name: '', owner_email: '', owner_phone: '', gc_status: 'FIXED',
        effective_date: '', expiry_date: '', classification: 'Fixed',
        marketing_title: '', inventory_list: '',
      })
      setOtaListings([])
      setBuildingSuggestions([])
      setDrafting(false)
    }
  }, [open])

  useEffect(() => {
    if (!form.building.trim()) {
      setBuildingSuggestions(existingBuildings)
      return
    }
    const q = form.building.toLowerCase()
    setBuildingSuggestions(existingBuildings.filter(b => b.toLowerCase().includes(q)))
  }, [form.building, existingBuildings])

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const allChannelOptions = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS)
    channelOptions.forEach(c => set.add(c))
    otaListings.forEach(l => set.add(l.channel))
    return [...set].sort()
  }, [channelOptions, otaListings])

  const addChannel = () => {
    const channel = draftChannel.trim()
    const name = draftName.trim()
    if (!channel) { toast.error('Pick or type a channel'); return }
    if (!name) { toast.error('Enter a listing name'); return }
    if (otaListings.some(l => l.channel.toLowerCase() === channel.toLowerCase())) {
      toast.error('Channel already added')
      return
    }
    setOtaListings([...otaListings, { channel, name }])
    setDrafting(false); setDraftChannel(''); setDraftName('')
  }

  const handleSubmit = async () => {
    if (!form.unit_code.trim()) { toast.error('Unit Code is required'); return }
    if (!form.building.trim()) { toast.error('Building is required'); return }
    setSaving(true)
    try {
      let ownerId = null
      if (form.owner_email.trim() || form.owner_name.trim()) {
        const email = form.owner_email.trim().toLowerCase() || null
        if (email) {
          const { data: existing } = await supabase.from('owners').select('id').eq('email', email).maybeSingle()
          if (existing?.id) ownerId = existing.id
        }
        if (!ownerId) {
          const created = await createOwner({
            name: form.owner_name.trim() || null,
            email: email,
            phone: form.owner_phone.trim() || null,
          })
          ownerId = created.id
        }
      }
      const unit = await createUnit({
        unit_code: form.unit_code.trim(),
        building: form.building.trim(),
        unit_type: form.unit_type || null,
        status: form.status || 'ACTIVE',
        gc_status: form.gc_status || null,
        marketing_title: form.marketing_title.trim() || null,
        inventory_list: form.inventory_list.trim() || null,
        owner_id: ownerId,
        ota_listings: otaListings,
      })
      if (form.effective_date || form.expiry_date) {
        const { data: contract } = await supabase
          .from('contracts')
          .insert({
            unit_id: unit.id,
            owner_id: ownerId,
            effective_date: form.effective_date || null,
            expiry_date: form.expiry_date || null,
            classification: form.classification || null,
          })
          .select('id')
          .single()
        if (contract?.id) await updateUnit(unit.id, { current_contract_id: contract.id })
      }
      for (const listing of otaListings) {
        if (!DEFAULT_CHANNELS.includes(listing.channel)) {
          supabase.from('ota_channel_names').insert({ name: listing.channel }).then(() => {}).catch(() => {})
        }
      }
      toast.success('Unit created')
      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(String(err.message || '').includes('duplicate') ? 'Unit Code already exists' : 'Failed to create unit')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-border"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Add New Unit</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Unit</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Unit Code *</label>
                <Input value={form.unit_code} onChange={(e) => setField('unit_code', e.target.value)} placeholder="e.g., P S1 503" className={inputClass} autoFocus />
              </div>
              <div className="relative">
                <label className={labelClass}>Building *</label>
                <Input
                  value={form.building}
                  onChange={(e) => setField('building', e.target.value)}
                  onFocus={() => setBuildingFocus(true)}
                  onBlur={() => setTimeout(() => setBuildingFocus(false), 150)}
                  placeholder="Type to search or add new"
                  className={inputClass}
                />
                {buildingFocus && buildingSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded shadow-lg z-10 max-h-44 overflow-y-auto">
                    {buildingSuggestions.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setField('building', b); setBuildingFocus(false) }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>Unit Type</label>
                <Select value={form.unit_type} onValueChange={(v) => setField('unit_type', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={labelClass}>GC Status</label>
                <Select value={form.gc_status} onValueChange={(v) => setField('gc_status', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Owner</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Name</label>
                <Input value={form.owner_name} onChange={(e) => setField('owner_name', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <Input type="email" value={form.owner_email} onChange={(e) => setField('owner_email', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <Input type="tel" value={form.owner_phone} onChange={(e) => setField('owner_phone', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Contract</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Effective</label>
                <Input type="date" value={form.effective_date} onChange={(e) => setField('effective_date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Expiry</label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setField('expiry_date', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Classification</label>
                <Select value={form.classification} onValueChange={(v) => setField('classification', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATION_OPTIONS.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Marketing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Marketing Title</label>
                <Input value={form.marketing_title} onChange={(e) => setField('marketing_title', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Inventory List</label>
                <Input value={form.inventory_list} onChange={(e) => setField('inventory_list', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">OTA Channels</h3>
            <div className="space-y-1.5">
              {otaListings.length === 0 && !drafting && (
                <p className="text-xs text-muted-foreground italic">No channels added yet</p>
              )}
              {otaListings.map((item, i) => (
                <div key={`${item.channel}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[72px] flex-shrink-0">{item.channel}</span>
                  <span className="text-xs flex-1 min-w-0 truncate">{item.name}</span>
                  <button
                    type="button"
                    onClick={() => setOtaListings(otaListings.filter((_, x) => x !== i))}
                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {drafting ? (
                <div className="flex items-center gap-2 px-2 py-2 rounded bg-muted/50 border border-primary/40">
                  <ChannelPicker
                    value={draftChannel}
                    onChange={setDraftChannel}
                    options={allChannelOptions}
                    placeholder="Channel"
                  />
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addChannel()
                      if (e.key === 'Escape') { setDrafting(false); setDraftChannel(''); setDraftName('') }
                    }}
                    placeholder="Listing name"
                    className="h-7 text-xs rounded flex-1"
                  />
                  <Button size="icon" className="h-7 w-7 rounded flex-shrink-0" onClick={addChannel}>
                    <Check size={11} />
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setDrafting(false); setDraftChannel(''); setDraftName('') }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDrafting(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary py-1.5 px-2 rounded transition-colors"
                >
                  <Plus size={11} />
                  Add Channel
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
            {saving ? 'Creating...' : 'Create Unit'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// CSV EXPORT
// ============================================================

function downloadCSV(units, filename) {
  const headers = ['Building', 'Unit', 'Owner', 'Email', 'Phone', 'Type', 'Status', 'Effective', 'Expiry', 'Marketing Title']
  const rows = units.map((u) => [
    u.building, u.unit_code, u.owner_name || '', u.owner_email || '', u.owner_phone || '',
    u.unit_type || '', u.status || '', u.effective_date || '', u.expiry_date || '', u.marketing_title || '',
  ])
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// FILTER PANEL
// ============================================================

function FilterPanel({ open, onClose, building, setBuilding, dateFilter, setDateFilter, buildings, activeCount, onClear }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h3 className="text-xs font-bold text-foreground">Filters</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={13} /></button>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Building</p>
              <Select value={building} onValueChange={setBuilding}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All buildings" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All buildings</SelectItem>
                  {buildings.map((b) => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Expiry Date</p>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="Any expiry" /></SelectTrigger>
                <SelectContent>
                  {DATE_FILTERS.map((d) => <SelectItem key={d.id} value={d.id} className="text-xs">{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
            <Button variant="ghost" size="sm" onClick={onClear} disabled={activeCount === 0} className="text-xs h-7 rounded">Clear all</Button>
            <Button size="sm" onClick={onClose} className="text-xs h-7 rounded"><Check size={11} className="mr-1" />Done</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ============================================================
// STATUS PILLS — sliding indicator, matches Navbar pattern
// ============================================================

function StatusPills({ statusFilter, onStatusFilter, counts }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    if (!containerRef.current) return
    const active = containerRef.current.querySelector('[data-active="true"]')
    if (!active) return
    const cRect = containerRef.current.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
  }, [statusFilter, counts])

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1 bg-muted/60 rounded-full p-1">
      <motion.div
        className={cn(
          'absolute top-1 bottom-1 rounded-full shadow-sm z-0',
          PILL_INDICATOR_BG[statusFilter] || 'bg-primary'
        )}
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      />
      {STATUS_PILLS.map((tab) => {
        const isActive = statusFilter === tab.id
        const count = counts[tab.id] ?? 0
        return (
          <button
            key={tab.id}
            type="button"
            data-active={isActive}
            onClick={() => onStatusFilter(tab.id)}
            className={cn(
              'relative z-10 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors duration-200 whitespace-nowrap',
              isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className={cn('ml-1', isActive ? 'opacity-90' : 'opacity-60')}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function RegistryPage() {
  const [allUnits, setAllUnits] = useState([])
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [building, setBuilding] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [addUnitOpen, setAddUnitOpen] = useState(false)

  const [sortField, setSortField] = useState('unit_code')
  const [sortDir, setSortDir] = useState('asc')
  const [expandedId, setExpandedId] = useState(null)

  const [cardsHidden, setCardsHidden] = useState(false)
  const [channelOptions, setChannelOptions] = useState([])

  const tableScrollRef = useRef(null)
  const expandedRowRef = useRef(null)
  const clickedRowRef = useRef(null)
  const headerRef = useRef(null)
  const filterWrapRef = useRef(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!expandedId || !clickedRowRef.current || !tableScrollRef.current) return
    const t = setTimeout(() => {
      const scrollEl = tableScrollRef.current
      const rowEl = clickedRowRef.current
      const headerEl = headerRef.current
      if (!scrollEl || !rowEl) return
      const scrollRect = scrollEl.getBoundingClientRect()
      const rowRect = rowEl.getBoundingClientRect()
      const headerHeight = headerEl?.offsetHeight ?? 0
      const delta = (rowRect.top - scrollRect.top) - headerHeight - 4
      scrollEl.scrollTo({ top: Math.max(0, scrollEl.scrollTop + delta), behavior: 'smooth' })
    }, 150)
    return () => clearTimeout(t)
  }, [expandedId])

  const fetchChannelOptions = useCallback(async () => {
    const { data } = await supabase.from('ota_channel_names').select('name').order('name')
    if (data) setChannelOptions(data.map(d => d.name))
  }, [])

  const fetchUnits = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const data = await listUnits({})
      setAllUnits(data)
    } catch (err) {
      console.error('Failed to load units:', err)
      toast.error('Failed to load units')
    } finally {
      setIsFirstLoad(false)
      setIsRefreshing(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchUnits(); fetchChannelOptions() }, [fetchUnits, fetchChannelOptions])

  const buildings = useMemo(() => {
    const set = new Set()
    allUnits.forEach((u) => { if (u.building) set.add(u.building) })
    return [...set].sort()
  }, [allUnits])

  const counts = useMemo(() => {
    const c = { all: allUnits.length, ACTIVE: 0, INACTIVE: 0, IN_PROGRESS: 0, FOR_RENEWAL: 0 }
    for (const u of allUnits) {
      if (u.status && c[u.status] !== undefined) c[u.status]++
    }
    return c
  }, [allUnits])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (building !== 'all') n++
    if (dateFilter !== 'all') n++
    return n
  }, [building, dateFilter])

  const clearFilters = () => { setBuilding('all'); setDateFilter('all') }

  const filteredUnits = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return allUnits.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (building !== 'all' && u.building !== building) return false
      if (dateFilter !== 'all') {
        const days = u.days_until_expiry
        if (dateFilter === 'no-expiry' && u.expiry_date) return false
        if (dateFilter === 'expired' && !(days !== null && days < 0)) return false
        if (dateFilter === 'next30' && !(days !== null && days >= 0 && days <= 30)) return false
        if (dateFilter === 'next90' && !(days !== null && days >= 0 && days <= 90)) return false
      }
      if (q) {
        const haystack = [
          u.unit_code, u.owner_name, u.owner_email, u.owner_phone,
          u.building, u.marketing_title, u.unit_type, u.gc_status,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [allUnits, statusFilter, building, dateFilter, debouncedSearch])

  const sorted = useMemo(() => {
    const copy = [...filteredUnits]
    copy.sort((a, b) => {
      const av = a[sortField] ?? ''
      const bv = b[sortField] ?? ''
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [filteredUnits, sortField, sortDir])

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('asc') }
  }

  const handleExport = () => {
    if (filteredUnits.length === 0) { toast.error('Nothing to export'); return }
    downloadCSV(filteredUnits, `registry_${new Date().toISOString().slice(0, 10)}.csv`)
    toast.success('Exported')
  }

  const handleUnitUpdate = (updatedUnit) => {
    setAllUnits((prev) => prev.map((u) => (u.id === updatedUnit.id ? { ...u, ...updatedUnit } : u)))
    fetchUnits()
  }

  const handleTableMouseMove = useCallback((e) => {
    const headerEl = headerRef.current
    if (!headerEl) return
    const headerRect = headerEl.getBoundingClientRect()
    setCardsHidden(e.clientY > headerRect.bottom)
  }, [])

  const handleTableMouseLeave = useCallback(() => setCardsHidden(false), [])

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div
        className={cn(
          'flex-shrink-0 transition-all duration-300 ease-out overflow-hidden',
          cardsHidden ? 'max-h-0 opacity-0 -mb-3' : 'max-h-40 opacity-100'
        )}
      >
        <SummaryCards units={allUnits} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card border border-border rounded-md">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search unit, owner, email, phone, building..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded"
              />
            </div>

            <Button
              size="sm"
              className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]"
              style={{ backgroundColor: BRAND }}
              onClick={() => setAddUnitOpen(true)}
            >
              <Plus size={13} />
              <span className="hidden sm:inline ml-1">Add Unit</span>
            </Button>

            <div className="relative" ref={filterWrapRef}>
              <Button
                variant={activeFilterCount > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-8 rounded text-xs transition-all duration-150"
                onClick={() => setFilterOpen(v => !v)}
              >
                <SlidersHorizontal size={13} />
                <span className="hidden sm:inline ml-1">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <FilterPanel
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                building={building}
                setBuilding={setBuilding}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                buildings={buildings}
                activeCount={activeFilterCount}
                onClear={clearFilters}
              />
            </div>

            <Button variant="outline" size="sm" onClick={fetchUnits} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>

            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded transition-all duration-150">
              <Download size={13} />
            </Button>
          </div>

          <div className="flex-shrink-0">
            <StatusPills
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              counts={counts}
            />
          </div>

          <div className="flex-1 min-h-0 rounded border border-border overflow-hidden">
            <div
              ref={tableScrollRef}
              className="h-full overflow-y-auto overflow-x-auto"
              onMouseMove={handleTableMouseMove}
              onMouseLeave={handleTableMouseLeave}
            >
              {isFirstLoad ? (
                <div className="space-y-2 p-3">
                  {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <table className="w-full border-collapse table-fixed">
                  <colgroup>
                    <col className={COL_WIDTHS.photo} />
                    <col className={COL_WIDTHS.building} />
                    <col className={COL_WIDTHS.unit} />
                    <col className={COL_WIDTHS.owner} />
                    <col className={COL_WIDTHS.type} />
                    <col className={COL_WIDTHS.effective} />
                    <col className={COL_WIDTHS.expiry} />
                    <col className={COL_WIDTHS.status} />
                  </colgroup>
                  <thead ref={headerRef} className="sticky top-0 z-20 bg-card">
                    <tr>
                      <th className="bg-card py-2.5 border-b border-border"></th>
                      <SortHead field="building" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="left">Building</SortHead>
                      <SortHead field="unit_code" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="left">Unit</SortHead>
                      <SortHead field="owner_name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="left">Owner</SortHead>
                      <SortHead field="unit_type" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="center">Type</SortHead>
                      <SortHead field="effective_date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right">Effective</SortHead>
                      <SortHead field="expiry_date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right">Expiry</SortHead>
                      <SortHead field="status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="center">Status</SortHead>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="h-32 text-center text-muted-foreground text-sm">
                          No units match your filters
                        </td>
                      </tr>
                    ) : (
                      sorted.map((unit) => {
                        const isExpanded = expandedId === unit.id
                        return (
                          <>
                            <tr
                              key={unit.id}
                              ref={isExpanded ? clickedRowRef : null}
                              onClick={() => setExpandedId(isExpanded ? null : unit.id)}
                              className={cn(
                                'cursor-pointer transition-colors duration-100 border-b border-border',
                                isExpanded ? 'text-white' : 'hover:bg-muted/50'
                              )}
                              style={isExpanded ? { backgroundColor: BRAND } : undefined}
                            >
                              <td className="py-2.5 px-4">
                                <UnitAvatar unit={unit} size="sm" />
                              </td>
                              <td className={cn('text-xs py-2.5 px-4 truncate', isExpanded && 'text-white/90')}>
                                {unit.building}
                              </td>
                              <td className={cn('font-mono text-xs font-bold py-2.5 px-4 truncate', isExpanded ? 'text-white' : 'text-foreground')}>
                                {unit.unit_code}
                              </td>
                              <td className={cn('text-xs py-2.5 px-4 truncate', isExpanded ? 'text-white/90' : '')}>
                                {unit.owner_name || <span className={cn('italic', isExpanded ? 'text-white/60' : 'text-muted-foreground')}>No owner</span>}
                              </td>
                              <td className={cn('text-xs py-2.5 px-4 truncate text-center', isExpanded ? 'text-white/70' : 'text-muted-foreground')}>
                                {unit.unit_type || '—'}
                              </td>
                              <td className="py-2.5 px-4">
                                <DateCell value={unit.effective_date} isExpanded={isExpanded} />
                              </td>
                              <td className="py-2.5 px-4">
                                <DateCell value={unit.expiry_date} isExpanded={isExpanded} />
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <StatusBadge status={unit.status} />
                              </td>
                            </tr>
                            {isExpanded && (
                              <ExpandedRow
                                key={`${unit.id}-detail`}
                                unit={unit}
                                onUnitChange={handleUnitUpdate}
                                onClose={() => setExpandedId(null)}
                                rowRef={expandedRowRef}
                                channelOptions={channelOptions}
                              />
                            )}
                          </>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddUnitModal
        open={addUnitOpen}
        onClose={() => setAddUnitOpen(false)}
        onCreated={() => { fetchUnits(); fetchChannelOptions() }}
        existingBuildings={buildings}
        channelOptions={channelOptions}
      />
    </div>
  )
}