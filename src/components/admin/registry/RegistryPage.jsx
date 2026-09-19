import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowUpDown, ArrowUp, ArrowDown, Camera, Check, Download, Loader2, Mail, Phone,
  Plus, RefreshCw, Search, SlidersHorizontal, X, Pencil, Tag, Layers,
  Building2, CheckCircle2, Clock, AlertTriangle, UserPlus, Trash2, PhoneCall,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import {
  listUnits, updateUnit, updateContract, createUnit, createOwner, deleteUnit,
  getUnitInteractions, updateInteraction, deleteInteraction, formatDate,
} from '@/lib/registry'
import { logAudit } from '@/lib/auditLog'
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

const PILL_TEXT_ACTIVE = {
  all:          'text-foreground',
  ACTIVE:       'text-emerald-700 dark:text-emerald-400',
  IN_PROGRESS:  'text-blue-700 dark:text-blue-400',
  FOR_RENEWAL:  'text-amber-700 dark:text-amber-400',
  INACTIVE:     'text-gray-700 dark:text-gray-300',
}

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'IN_PROGRESS', 'FOR_RENEWAL']
const UNIT_TYPES = ['Studio', '1-Bedroom', '2-Bedroom', 'Executive Studio', 'STOCKROOM']
const GC_STATUS_OPTIONS = ['FIXED', 'MESSENGER', 'VIBER', 'NOT YET', 'N/A']
const CLASSIFICATION_OPTIONS = ['Fixed', 'Partnership', '75/25', '85/15']
const OUTCOME_OPTIONS = ['positive', 'neutral', 'negative', 'no_answer']
const INTERACTION_TYPES = ['call', 'email', 'messenger', 'whatsapp', 'sms', 'in_person', 'note']

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

const OTA_FILTERS = [
  { id: 'all', label: 'Any OTA status' },
  { id: 'none', label: 'No channels' },
  { id: 'missing_names', label: 'Missing listing names' },
  { id: 'duplicates', label: 'Has duplicates' },
]

const DEFAULT_CHANNELS = [
  'Airbnb', 'Booking.com', 'Agoda', 'Hosteeva', 'Your Rentals',
  'Trip.com', 'Expedia', 'Vrbo', 'Facebook Marketplace',
]

const COL_WIDTHS = {
  photo: 'w-14', building: 'w-[150px]', unit: 'w-[120px]', owner: 'w-[200px]',
  type: 'w-[110px]', effective: 'w-[110px]', expiry: 'w-[130px]', status: 'w-[130px]',
}

// ============================================================
// HELPERS
// ============================================================
function normalizeOtaListings(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => x && typeof x === 'object' && typeof x.channel === 'string')
      .map((x) => ({ channel: x.channel.trim(), name: typeof x.name === 'string' ? x.name.trim() : '' }))
      .filter((x) => x.channel.length > 0)
  }
  if (typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([k]) => typeof k === 'string' && k.trim().length > 0)
      .map(([k, v]) => ({ channel: k.trim(), name: typeof v === 'string' ? v.trim() : '' }))
  }
  return []
}

function findDuplicateChannels(listings) {
  const seen = new Map()
  const dupes = new Set()
  for (const { channel } of listings) {
    const key = channel.toLowerCase()
    if (seen.has(key)) dupes.add(seen.get(key))
    else seen.set(key, channel)
  }
  return [...dupes]
}

const CRITICAL = 'critical'
const WARNING = 'warning'
const INFO = 'info'

function getMissingFields(unit) {
  const critical = [], warnings = [], ota = []
  if (!unit) return { critical, warnings, ota, total: 0, score: 0 }

  if (!unit.unit_code || !String(unit.unit_code).trim())
    critical.push({ key: 'unit_code', label: 'Unit Code', severity: CRITICAL, group: 'Unit' })
  if (!unit.building || !String(unit.building).trim())
    critical.push({ key: 'building', label: 'Building', severity: CRITICAL, group: 'Unit' })
  if (!unit.owner_id && !unit.owner_name)
    critical.push({ key: 'owner', label: 'Owner', severity: CRITICAL, group: 'Owner' })
  else if (!unit.owner_email?.trim() && !unit.owner_phone?.trim())
    critical.push({ key: 'owner_contact', label: 'Owner Email or Phone', severity: CRITICAL, group: 'Owner' })
  if (!unit.effective_date)
    critical.push({ key: 'effective_date', label: 'Contract Effective', severity: CRITICAL, group: 'Contract' })
  if (!unit.expiry_date)
    critical.push({ key: 'expiry_date', label: 'Contract Expiry', severity: CRITICAL, group: 'Contract' })

  if (!unit.unit_type?.trim())
    warnings.push({ key: 'unit_type', label: 'Unit Type', severity: WARNING, group: 'Unit' })
  if (!unit.marketing_title?.trim())
    warnings.push({ key: 'marketing_title', label: 'Marketing Title', severity: WARNING, group: 'Marketing' })
  if (!unit.gc_status?.trim())
    warnings.push({ key: 'gc_status', label: 'GC Status', severity: WARNING, group: 'Owner' })
  if (!unit.owner_email?.trim())
    warnings.push({ key: 'owner_email', label: 'Owner Email', severity: WARNING, group: 'Owner' })
  if (!unit.owner_phone?.trim())
    warnings.push({ key: 'owner_phone', label: 'Owner Phone', severity: WARNING, group: 'Owner' })
  if (!unit.classification?.trim())
    warnings.push({ key: 'classification', label: 'Contract Classification', severity: WARNING, group: 'Contract' })
  if (!unit.contract_pdf_url?.trim())
    warnings.push({ key: 'contract_pdf_url', label: 'Contract PDF', severity: WARNING, group: 'Contract' })

  const listings = normalizeOtaListings(unit.ota_listings)
  if (listings.length === 0) {
    ota.push({ key: 'ota_none', label: 'No OTA Channel', severity: WARNING, group: 'OTA' })
  } else {
    const emptyName = listings.filter((l) => !l.name)
    if (emptyName.length === listings.length)
      ota.push({ key: 'ota_all_empty', label: 'OTA Channel Missing Listing Name', severity: WARNING, group: 'OTA' })
    else if (emptyName.length > 0)
      for (const l of emptyName)
        ota.push({ key: `ota_empty_${l.channel.toLowerCase()}`, label: `${l.channel} · listing name empty`, severity: INFO, group: 'OTA', channel: l.channel })
    for (const d of findDuplicateChannels(listings))
      ota.push({ key: `ota_dup_${d.toLowerCase()}`, label: `Duplicate OTA Channel: ${d}`, severity: WARNING, group: 'OTA', channel: d })
  }

  const total = critical.length + warnings.length + ota.length
  const weighted = critical.length * 3 + warnings.length + ota.length
  const score = weighted === 0 ? 100 : Math.max(0, Math.round(100 - weighted * 8))
  return { critical, warnings, ota, total, score }
}

function getContractOverdue(unit) {
  if (!unit?.expiry_date) return null
  const expiry = new Date(unit.expiry_date); expiry.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((today - expiry) / 86400000)
  return days > 0 ? { kind: 'contract', daysOverdue: days, date: unit.expiry_date } : null
}

function getFollowUpOverdue(unit) {
  const d = unit?.next_follow_up_date
  if (!d) return null
  const due = new Date(d); due.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((today - due) / 86400000)
  return days > 0 ? { kind: 'follow_up', daysOverdue: days, date: d } : null
}

function getOverdueUnits(units) {
  if (!Array.isArray(units)) return []
  const out = []
  for (const u of units) {
    const items = []
    const c = getContractOverdue(u); if (c) items.push(c)
    const f = getFollowUpOverdue(u); if (f) items.push(f)
    if (items.length > 0) out.push({ unit: u, overdue: items })
  }
  out.sort((a, b) => {
    const aMax = Math.max(...a.overdue.map((o) => o.daysOverdue))
    const bMax = Math.max(...b.overdue.map((o) => o.daysOverdue))
    return bMax - aMax
  })
  return out
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
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}
function avatarColor(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash = hash & hash }
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
      {unit.photo_url ? <img src={unit.photo_url} alt="" className="w-full h-full object-cover" />
        : <Building2 size={size === 'lg' ? 18 : 14} className="text-muted-foreground" />}
    </div>
  )
}

// ============================================================
// BADGES
// ============================================================
function StatusBadge({ status, className }) {
  const config = STATUS_CONFIG[status]
  if (!config) return <Badge className={cn('text-[11px] font-semibold bg-gray-400 text-white border-0 rounded-full px-2.5 py-0.5', className)}>{status || '—'}</Badge>
  return <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', config.className, className)}>{config.label}</Badge>
}

function ContractBadge({ expiryDate }) {
  if (!expiryDate) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0)
  const days = Math.round((expiry - now) / 86400000)

  let className
  let label

  if (days < 0) {
    const abs = Math.abs(days)
    label = abs === 1 ? 'Expired yesterday' : `Overdue ${abs}d`
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
      <Badge variant="outline" className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5', className)}>{label}</Badge>
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
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
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
      <button type="button" onClick={() => onSort(field)}
        className={cn('inline-flex items-center gap-1 transition-colors duration-150', 'text-[11px] font-bold uppercase tracking-wider',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
        {children}
        {isActive ? (sortDir === 'asc' ? <ArrowUp size={11} className="text-primary" /> : <ArrowDown size={11} className="text-primary" />)
          : <ArrowUpDown size={11} className="text-muted-foreground/40" />}
      </button>
    </th>
  )
}

// ============================================================
// EDITABLE FIELD
// ============================================================
function EditableField({ label, value, type = 'text', options, onSave, actionHref, actionIcon: ActionIcon, actionTitle, auditTag, registerRef }) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')
  const inputRef = useRef(null)

  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => {
    if (registerRef && inputRef.current) registerRef(inputRef.current)
  }, [registerRef])

  const friendlyError = (err, attempted) => {
    const msg = err?.message || ''
    if (msg.includes('units_unit_code_key')) return `Unit code "${attempted}" is already used by another unit.`
    if (msg.includes('owners_email_lower_idx')) return `Email "${attempted}" is already assigned to another owner.`
    if (msg.includes('owners_email_key')) return `Email "${attempted}" is already assigned to another owner.`
    return msg || 'Save failed'
  }
  const commit = async () => {
    if (draft === (value ?? '')) return
    setStatus('saving')
    try {
      const next = draft === '' ? null : draft
      await onSave(next)
      setStatus('saved')
      if (auditTag) logAudit(`UPDATE_UNIT_FIELD:${auditTag}`, 'units', null, { field: auditTag, from: value, to: next }).catch(() => {})
      setTimeout(() => setStatus('idle'), 1200)
    } catch (err) {
      console.error(err)
      toast.error(friendlyError(err, draft))
      setDraft(value ?? '')
      setStatus('idle')
    }
  }
  const cancel = () => setDraft(value ?? '')

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {options ? (
          <Select value={draft || ''} onValueChange={async (v) => {
            setDraft(v); setStatus('saving')
            try {
              await onSave(v); setStatus('saved')
              if (auditTag) logAudit(`UPDATE_UNIT_FIELD:${auditTag}`, 'units', null, { field: auditTag, from: value, to: v }).catch(() => {})
              setTimeout(() => setStatus('idle'), 1200)
            } catch (err) { toast.error(friendlyError(err, v)); setStatus('idle') }
          }}>
            <SelectTrigger className="h-7 text-xs rounded bg-background border-border flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } if (e.key === 'Escape') { e.preventDefault(); cancel(); e.target.blur() } }}
            onBlur={commit}
            className={cn('h-7 text-xs rounded bg-background flex-1 transition-colors', !value && 'border-border', value && 'border-transparent hover:border-border')}
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
// SECTION CARD
// ============================================================
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

// ============================================================
// UNIT PHOTO UPLOAD
// ============================================================
function UnitPhotoUpload({ unit, onSave }) {
  const [uploading, setUploading] = useState(false)
  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${unit.id}_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('unit-photos').upload(path, file, { cacheControl: '3600', upsert: true })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('unit-photos').getPublicUrl(path)
      await onSave(data.publicUrl)
      logAudit('UPDATE_UNIT_PHOTO', 'units', unit.id, { url: data.publicUrl }).catch(() => {})
      toast.success('Photo updated')
    } catch { toast.error('Upload failed') }
    finally { setUploading(false); e.target.value = '' }
  }
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-16 h-16 rounded-md overflow-hidden bg-muted border border-border flex-shrink-0 flex items-center justify-center">
        {unit.photo_url ? <img src={unit.photo_url} alt="" className="w-full h-full object-cover" /> : <Building2 size={22} className="text-muted-foreground" />}
      </div>
      <label className="cursor-pointer">
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold', 'text-white cursor-pointer transition-colors duration-150', uploading && 'opacity-50 pointer-events-none')}
          style={{ backgroundColor: BRAND }}>
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
          {unit.photo_url ? 'Replace' : 'Upload'}
        </span>
      </label>
    </div>
  )
}

// ============================================================
// OTA EDITOR
// ============================================================
function OtaEditor({ unit, onSave, channelOptions = [] }) {
  const listings = useMemo(() => normalizeOtaListings(unit.ota_listings), [unit.ota_listings])
  const [drafting, setDrafting] = useState(false)
  const [draftChannel, setDraftChannel] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftErrors, setDraftErrors] = useState({ channel: '', name: '' })
  const [editingIndex, setEditingIndex] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  const allChannelOptions = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS)
    channelOptions.forEach((c) => set.add(c))
    listings.forEach((l) => set.add(l.channel))
    return [...set].sort()
  }, [channelOptions, listings])

  const persist = async (next) => {
    setSaving(true)
    try { await onSave(next) } catch { toast.error('Failed to save'); throw new Error('save') } finally { setSaving(false) }
  }
  const validateDraft = () => {
    const errs = { channel: '', name: '' }
    const ch = draftChannel.trim(), nm = draftName.trim()
    if (!ch) errs.channel = 'Channel required'
    if (!nm) errs.name = 'Listing name required'
    if (listings.some((l) => l.channel.toLowerCase() === ch.toLowerCase())) errs.channel = 'Channel already added'
    setDraftErrors(errs)
    return !errs.channel && !errs.name
  }
  const handleAdd = async () => {
    if (!validateDraft()) return
    const channel = draftChannel.trim(), name = draftName.trim()
    try {
      await persist([...listings, { channel, name }])
      if (!DEFAULT_CHANNELS.includes(channel)) supabase.from('ota_channel_names').insert({ name: channel }).then(() => {}).catch(() => {})
      setDrafting(false); setDraftChannel(''); setDraftName(''); setDraftErrors({ channel: '', name: '' })
    } catch {
      // persist already showed a toast
    }
  }
  const commitEdit = async (i) => {
    const nm = editDraft.trim()
    if (!nm) { setEditError('Listing name required'); return }
    try {
      await persist(listings.map((l, idx) => idx === i ? { ...l, name: nm } : l))
      setEditingIndex(null)
      setEditError('')
    } catch {
      // persist already showed a toast
    }
  }
  const removeAt = async (i) => {
    try {
      await persist(listings.filter((_, idx) => idx !== i))
    } catch {
      // persist already showed a toast
    }
  }
  const dupes = findDuplicateChannels(listings)

  return (
    <div className="space-y-1.5">
      {listings.length === 0 && !drafting && <p className="text-xs text-muted-foreground italic py-1">No channels yet</p>}
      {listings.map((item, i) => {
        const isDupe = dupes.some((d) => d.toLowerCase() === item.channel.toLowerCase())
        return (
          <div key={`${item.channel}-${i}`} className={cn('flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 group/ota', isDupe && 'ring-1 ring-red-400')}>
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[72px] flex-shrink-0 truncate">{item.channel}</span>
            {editingIndex === i ? (
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <Input value={editDraft} onChange={(e) => { setEditDraft(e.target.value); if (editError) setEditError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } if (e.key === 'Escape') { e.preventDefault(); setEditingIndex(null); setEditError('') } }}
                  onBlur={() => commitEdit(i)} autoFocus
                  className={cn('h-6 text-xs rounded bg-background px-1.5 flex-1', editError && 'border-red-400')} />
                {editError && <span className="text-[10px] text-red-500 px-1">{editError}</span>}
              </div>
            ) : (
              <button type="button" onClick={() => { setEditingIndex(i); setEditDraft(item.name); setEditError('') }}
                className="text-xs text-left flex-1 min-w-0 truncate hover:text-primary transition-colors flex items-center gap-1">
                <span className={cn('truncate', !item.name && 'italic text-red-500')}>{item.name || 'Empty'}</span>
                <Pencil size={10} className="flex-shrink-0 text-muted-foreground/0 group-hover/ota:text-muted-foreground/60 transition-colors" />
              </button>
            )}
            <button type="button" onClick={() => removeAt(i)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0">
              <Trash2 size={11} />
            </button>
          </div>
        )
      })}
      {drafting ? (
        <div className="flex flex-col gap-1 px-2 py-2 rounded bg-muted/50 border border-primary/40">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 relative">
              <Input value={draftChannel} onChange={(e) => { setDraftChannel(e.target.value); if (draftErrors.channel) setDraftErrors((p) => ({ ...p, channel: '' })) }}
                placeholder="Channel" list="ota-channel-options" className={cn('h-7 text-xs rounded flex-1', draftErrors.channel && 'border-red-400')} />
              <datalist id="ota-channel-options">{allChannelOptions.map((opt) => <option key={opt} value={opt} />)}</datalist>
            </div>
            <Input value={draftName} onChange={(e) => { setDraftName(e.target.value); if (draftErrors.name) setDraftErrors((p) => ({ ...p, name: '' })) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setDrafting(false); setDraftChannel(''); setDraftName(''); setDraftErrors({ channel: '', name: '' }) } }}
              placeholder="Listing name" className={cn('h-7 text-xs rounded flex-1', draftErrors.name && 'border-red-400')} />
            <Button size="icon" className="h-7 w-7 rounded flex-shrink-0" onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            </Button>
            <button type="button" onClick={() => { setDrafting(false); setDraftChannel(''); setDraftName(''); setDraftErrors({ channel: '', name: '' }) }} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <X size={12} />
            </button>
          </div>
          {(draftErrors.channel || draftErrors.name) && (
            <div className="flex gap-2 px-1">
              {draftErrors.channel && <span className="text-[10px] text-red-500">{draftErrors.channel}</span>}
              {draftErrors.name && <span className="text-[10px] text-red-500">{draftErrors.name}</span>}
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setDrafting(true)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary py-1.5 px-2 rounded transition-colors">
          <Plus size={11} /> Add Channel
        </button>
      )}
    </div>
  )
}

// ============================================================
// MISSING FIELDS CARD
// ============================================================
function MissingFieldsCard({ missing, onFieldClick }) {
  if (!missing || missing.total === 0) return null
  const groups = [
    { key: 'critical', label: 'Critical', items: missing.critical, tone: 'red' },
    { key: 'warnings', label: 'Warnings', items: missing.warnings, tone: 'amber' },
    { key: 'ota',      label: 'OTA Channels', items: missing.ota, tone: 'amber' },
  ].filter((g) => g.items.length > 0)
  return (
    <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/20">
        <AlertTriangle size={13} className="text-amber-700 dark:text-amber-400 flex-shrink-0" />
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Missing Information · {missing.total}</h4>
      </div>
      <div className="p-2 space-y-2">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground px-1 mb-1">{g.label}</p>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <button key={it.key} type="button" onClick={() => onFieldClick?.(it)}
                  className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors', 'hover:bg-amber-100/70 dark:hover:bg-amber-900/30',
                    g.tone === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-300')}>
                  <AlertTriangle size={11} className={cn('flex-shrink-0', it.severity === 'info' && 'opacity-70')} />
                  <span className="flex-1 min-w-0 truncate">{it.label}</span>
                  <ChevronRight size={11} className="flex-shrink-0 opacity-50" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// WARNINGS STRIP
// ============================================================
function WarningsStrip({
  missingUnits,
  overdueCount,
  overdueUnits,
  onSelectUnit,
}) {
  const [missingOpen, setMissingOpen] = useState(false)
  const [overdueOpen, setOverdueOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!missingOpen && !overdueOpen) return
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMissingOpen(false); setOverdueOpen(false)
      }
    }
    const k = (e) => { if (e.key === 'Escape') { setMissingOpen(false); setOverdueOpen(false) } }
    document.addEventListener('mousedown', h)
    window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k) }
  }, [missingOpen, overdueOpen])

  const missingCount = missingUnits.length
  if (missingCount === 0 && overdueCount === 0) return null

  const contractOverdue = overdueUnits
    .map(({ unit, overdue }) => {
      const item = overdue.find((o) => o.kind === 'contract')
      return item ? { unit, days: item.daysOverdue, date: item.date } : null
    })
    .filter(Boolean)

  const followUpOverdue = overdueUnits
    .map(({ unit, overdue }) => {
      const item = overdue.find((o) => o.kind === 'follow_up')
      return item ? { unit, days: item.daysOverdue, date: item.date } : null
    })
    .filter(Boolean)

  return (
    <div className="inline-flex items-center gap-1.5" ref={wrapRef}>
      {missingCount > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => { setMissingOpen((v) => !v); setOverdueOpen(false) }}
            className={cn(
              'inline-flex items-center gap-2 h-7 px-3 rounded-md text-xs font-medium border transition-colors',
              missingOpen ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-muted'
            )}
          >
            <AlertTriangle size={12} className="opacity-70" />
            <span>Units with missing fields</span>
            <span className={cn('ml-0.5 px-1.5 rounded tabular-nums text-[11px] font-semibold', missingOpen ? 'bg-background/20' : 'bg-muted')}>
              {missingCount}
            </span>
            <ArrowDown size={11} className={cn('opacity-60 transition-transform', missingOpen && 'rotate-180')} />
          </button>

          <AnimatePresence>
            {missingOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-2 w-[440px] max-h-[520px] bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col"
              >
                <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                  <p className="text-[11px] font-semibold text-foreground">Units with missing fields</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {missingCount} unit{missingCount !== 1 ? 's' : ''} with incomplete data
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {missingUnits.map(({ unit, missing }) => (
                    <button key={unit.id} type="button"
                      onClick={() => { onSelectUnit(unit); setMissingOpen(false) }}
                      className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors group">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-mono font-bold text-foreground truncate">{unit.unit_code}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{unit.building}</span>
                        <span className="ml-auto text-[10px] font-semibold text-muted-foreground tabular-nums">
                          {missing.total} missing
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[...missing.critical, ...missing.warnings].map((f) => (
                          <span key={f.key}
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                              f.severity === 'critical'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            )}>
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {overdueCount > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => { setOverdueOpen((v) => !v); setMissingOpen(false) }}
            className={cn(
              'inline-flex items-center gap-2 h-7 px-3 rounded-md text-xs font-medium border transition-colors',
              overdueOpen ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-muted'
            )}
          >
            <Clock size={12} className="opacity-70" />
            <span>Overdue</span>
            <span className={cn('ml-0.5 px-1.5 rounded tabular-nums text-[11px] font-semibold', overdueOpen ? 'bg-background/20' : 'bg-muted')}>
              {overdueCount}
            </span>
            <ArrowDown size={11} className={cn('opacity-60 transition-transform', overdueOpen && 'rotate-180')} />
          </button>

          <AnimatePresence>
            {overdueOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-2 w-[400px] max-h-[480px] bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col"
              >
                <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                  <p className="text-[11px] font-semibold text-foreground">Overdue Units</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {overdueCount} unit{overdueCount !== 1 ? 's' : ''} past due
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {contractOverdue.length > 0 && (
                    <OverdueSection title="Contract expired" items={contractOverdue} tone="red"
                      onSelect={(u) => { onSelectUnit(u); setOverdueOpen(false) }} />
                  )}
                  {followUpOverdue.length > 0 && (
                    <OverdueSection title="Follow-up overdue" items={followUpOverdue} tone="amber"
                      onSelect={(u) => { onSelectUnit(u); setOverdueOpen(false) }} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function OverdueSection({ title, items, tone, onSelect }) {
  const titleColor = tone === 'red' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
  const dotColor = tone === 'red' ? 'bg-red-500' : 'bg-amber-500'
  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 sticky top-0 z-10">
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', titleColor)}>{title}</span>
        <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{items.length}</span>
      </div>
      {items.map(({ unit, days, date }) => (
        <button key={unit.id} type="button" onClick={() => onSelect(unit)}
          className="w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3 group">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-foreground truncate">{unit.unit_code}</span>
              <span className="text-[10px] text-muted-foreground truncate">{unit.building}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {unit.owner_name || 'No owner'} {date ? `· ${formatDate(date)}` : ''}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums',
              tone === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
              {days}d late
            </span>
          </div>
          <ChevronRight size={13} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
        </button>
      ))}
    </div>
  )
}

// ============================================================
// LOG CALL MODAL
// ============================================================
function LogCallModal({ open, onClose, unit, onSaved }) {
  const [type, setType] = useState('call')
  const [outcome, setOutcome] = useState('positive')
  const [content, setContent] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setType('call'); setOutcome('positive'); setContent(''); setNextDate('') } }, [open])
  if (!open || !unit) return null
  const handleSave = async () => {
    if (!content.trim()) { toast.error('Add a short note'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('unit_interactions').insert({
        unit_id: unit.id, owner_id: unit.owner_id || null,
        type, content: content.trim(), outcome, next_follow_up_date: nextDate || null,
      })
      if (error) throw error
      logAudit('LOG_UNIT_INTERACTION', 'unit_interactions', unit.id, { type, outcome }).catch(() => {})
      toast.success('Interaction logged'); onSaved?.(); onClose()
    } catch { toast.error('Failed to log interaction') }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="relative bg-card rounded-md shadow-2xl max-w-md w-full border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-bold">Log Interaction</h3>
            <p className="text-xs text-muted-foreground">{unit.unit_code} · {unit.owner_name || 'No owner'}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 text-xs rounded"><SelectValue /></SelectTrigger>
              <SelectContent>{INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Outcome</label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="h-8 text-xs rounded"><SelectValue /></SelectTrigger>
              <SelectContent>{OUTCOME_OPTIONS.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Notes</label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="What was discussed?" className="text-xs rounded resize-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Next Follow-up (optional)</label>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="h-8 text-xs rounded" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSave} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <PhoneCall size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Save Interaction'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// INTERACTION ROW
// ============================================================
function InteractionRow({ record, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState({
    type: record.type || 'note',
    outcome: record.outcome || 'neutral',
    content: record.content || '',
    next_follow_up_date: record.next_follow_up_date || '',
  })

  useEffect(() => {
    setDraft({
      type: record.type || 'note',
      outcome: record.outcome || 'neutral',
      content: record.content || '',
      next_follow_up_date: record.next_follow_up_date || '',
    })
  }, [record])

  const handleSave = async () => {
    if (!draft.content.trim()) { toast.error('Add a short note'); return }
    setSaving(true)
    try {
      const updated = await updateInteraction(record.id, {
        type: draft.type,
        outcome: draft.outcome,
        content: draft.content.trim(),
        next_follow_up_date: draft.next_follow_up_date || null,
      })
      logAudit('UPDATE_UNIT_INTERACTION', 'unit_interactions', record.id, {
        unit_id: record.unit_id,
        before: { type: record.type, outcome: record.outcome, content: record.content },
        after: { type: draft.type, outcome: draft.outcome, content: draft.content },
      }).catch(() => {})
      toast.success('Interaction updated')
      setEditing(false)
      onUpdated?.(updated)
    } catch (err) {
      console.error(err)
      toast.error('Failed to update')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    const preview = (record.content || '').slice(0, 80)
    const confirmed = window.confirm(
      `Delete this interaction?\n\n` +
      `Type: ${record.type}\n` +
      `Date: ${formatDate(record.created_at)}\n` +
      `Note: ${preview}${record.content?.length > 80 ? '…' : ''}\n\n` +
      `This cannot be undone.`
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      await deleteInteraction(record.id)
      logAudit('DELETE_UNIT_INTERACTION', 'unit_interactions', record.id, {
        unit_id: record.unit_id,
        type: record.type,
        outcome: record.outcome,
        content: record.content,
      }).catch(() => {})
      toast.success('Interaction deleted')
      onDeleted?.(record.id)
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    } finally { setDeleting(false) }
  }

  const outcomeClasses =
    record.outcome === 'positive' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : record.outcome === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    : record.outcome === 'no_answer' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'

  if (editing) {
    return (
      <div className="px-3 py-2.5 rounded-md border border-primary/40 bg-primary/5 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Select value={draft.type} onValueChange={(v) => setDraft((p) => ({ ...p, type: v }))}>
            <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
            <SelectContent>{INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={draft.outcome} onValueChange={(v) => setDraft((p) => ({ ...p, outcome: v }))}>
            <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
            <SelectContent>{OUTCOME_OPTIONS.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
          </Select>
          <Input
            type="date"
            value={draft.next_follow_up_date}
            onChange={(e) => setDraft((p) => ({ ...p, next_follow_up_date: e.target.value }))}
            className="h-7 text-xs rounded"
          />
        </div>
        <Textarea
          value={draft.content}
          onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
          rows={2}
          className="text-xs rounded resize-none"
          placeholder="What was discussed?"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-7 rounded text-[11px]" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-7 rounded text-[11px]" onClick={handleSave} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={11} className="mr-1 animate-spin" /> : <Check size={11} className="mr-1" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-start gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/40 transition-colors">
      <div className="flex flex-col gap-1 pt-0.5 flex-shrink-0 w-[86px]">
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{record.type}</span>
        <span className={cn('inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold', outcomeClasses)}>
          {record.outcome}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground whitespace-pre-wrap break-words">{record.content}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatDate(record.created_at)}
          </span>
          {record.next_follow_up_date && (
            <span className="text-[10px] text-primary dark:text-blue-400 font-medium tabular-nums">
              Next follow-up: {formatDate(record.next_follow_up_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40"
          title="Delete"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// INTERACTIONS SECTION
// ============================================================
function InteractionsSection({ unit, onLogCall, refreshKey = 0 }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getUnitInteractions(unit.id)
      setItems(rows)
    } catch (err) {
      console.error('Failed to load interactions:', err)
    } finally {
      setLoading(false)
    }
  }, [unit.id])

  useEffect(() => { load() }, [load, refreshKey])

  const handleUpdated = (updated) => {
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }
  const handleDeleted = (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <div className="rounded-md bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <PhoneCall size={13} className="text-muted-foreground flex-shrink-0" />
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
            Interactions {items.length > 0 ? `· ${items.length}` : ''}
          </h4>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-6 rounded text-[10px] gap-1 px-2"
          onClick={onLogCall}
        >
          <Plus size={10} /> Log
        </Button>
      </div>
      <div className="p-2 space-y-1.5 max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">No interactions yet</div>
        ) : (
          items.map((rec) => (
            <InteractionRow
              key={rec.id}
              record={rec}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================
// EXPANDED ROW
// ============================================================
function ExpandedRow({ unit, onUnitChange, rowRef, channelOptions, missing, onLogCall, onDelete, interactionsRefreshKey }) {
  const fieldRefs = useRef({})

  const registerRef = useMemo(
    () => (key) => (el) => {
      if (el) fieldRefs.current[key] = el
      else delete fieldRefs.current[key]
    },
    []
  )

  const handleUnitField = async (field, value) => {
    await updateUnit(unit.id, { [field]: value })
    onUnitChange({ ...unit, [field]: value })
  }
  const handleContractField = async (field, value) => {
    if (unit.current_contract_id) {
      await updateContract(unit.current_contract_id, { [field]: value })
      onUnitChange({ ...unit, [field]: value })
    } else {
      const { data, error } = await supabase.from('contracts').insert({ unit_id: unit.id, owner_id: unit.owner_id, [field]: value }).select('id').single()
      if (error) throw error
      await updateUnit(unit.id, { current_contract_id: data.id })
      onUnitChange({ ...unit, current_contract_id: data.id, [field]: value })
    }
  }
  const handleOtaSave = async (otaListings) => {
    await updateUnit(unit.id, { ota_listings: otaListings })
    onUnitChange({ ...unit, ota_listings: otaListings })
    logAudit('UPDATE_UNIT_OTA', 'units', unit.id, { channels: otaListings.map((x) => x.channel) }).catch(() => {})
  }
  const handlePhotoSave = async (url) => {
    await updateUnit(unit.id, { photo_url: url })
    onUnitChange({ ...unit, photo_url: url })
  }

  const handleMissingClick = (item) => {
    const map = {
      unit_code: 'unit_code', building: 'building', unit_type: 'unit_type', marketing_title: 'marketing_title',
      effective_date: 'effective_date', expiry_date: 'expiry_date',
      owner: 'owner_name', owner_contact: 'owner_email',
    }
    const key = map[item.key] || item.key
    const el = fieldRefs.current[key]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      try {
        el.focus?.()
      } catch {
        // Focus may fail on non-focusable elements; safe to ignore
      }
    } else if (item.group === 'OTA') {
      const ota = fieldRefs.current.ota_section
      if (ota) ota.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return (
    <tr ref={rowRef} className="bg-muted/40 border-b border-border">
      <td className="p-0 bg-muted/40"></td>
      <td colSpan={7} className="p-0 bg-muted/40">
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
          <div className="px-4 py-4 space-y-3">
            <MissingFieldsCard missing={missing} onFieldClick={handleMissingClick} />

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onLogCall}>
                <PhoneCall size={11} /> Log Interaction
              </Button>
              <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20" onClick={onDelete}>
                <Trash2 size={11} /> Delete Unit
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <SectionCard title="Unit" icon={Building2}>
                <UnitPhotoUpload unit={unit} onSave={handlePhotoSave} />
                <div className="pt-2 mt-2 border-t border-border space-y-0.5">
                  <EditableField label="Code" value={unit.unit_code} onSave={(v) => handleUnitField('unit_code', v)} auditTag="unit_code" registerRef={registerRef('unit_code')} />
                  <EditableField label="Building" value={unit.building} onSave={(v) => handleUnitField('building', v)} auditTag="building" registerRef={registerRef('building')} />
                  <EditableField label="Type" value={unit.unit_type} options={UNIT_TYPES} onSave={(v) => handleUnitField('unit_type', v)} auditTag="unit_type" registerRef={registerRef('unit_type')} />
                  <EditableField label="Status" value={unit.status} options={STATUS_OPTIONS} onSave={(v) => handleUnitField('status', v)} auditTag="status" />
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
                <EditableField label="Email" value={unit.owner_email} type="email" onSave={(v) => handleUnitField('owner_email', v)} actionHref={unit.owner_email ? `mailto:${unit.owner_email}` : null} actionIcon={Mail} actionTitle="Send email" auditTag="owner_email" registerRef={registerRef('owner_email')} />
                <EditableField label="Phone" value={unit.owner_phone} type="tel" onSave={(v) => handleUnitField('owner_phone', v)} actionHref={unit.owner_phone ? `tel:${unit.owner_phone}` : null} actionIcon={Phone} actionTitle="Call" auditTag="owner_phone" registerRef={registerRef('owner_phone')} />
                <EditableField label="GC" value={unit.gc_status} options={GC_STATUS_OPTIONS} onSave={(v) => handleUnitField('gc_status', v)} auditTag="gc_status" registerRef={registerRef('gc_status')} />
              </SectionCard>

              <SectionCard title="Contract" icon={Tag}>
                <EditableField label="Effective" value={unit.effective_date} type="date" onSave={(v) => handleContractField('effective_date', v)} auditTag="effective_date" registerRef={registerRef('effective_date')} />
                <EditableField label="Expiry" value={unit.expiry_date} type="date" onSave={(v) => handleContractField('expiry_date', v)} auditTag="expiry_date" registerRef={registerRef('expiry_date')} />
                <ContractBadge expiryDate={unit.expiry_date} />
                <EditableField label="Class" value={unit.classification} options={CLASSIFICATION_OPTIONS} onSave={(v) => handleContractField('classification', v)} auditTag="classification" registerRef={registerRef('classification')} />
                <EditableField label="PDF" value={unit.contract_pdf_url} onSave={(v) => handleContractField('contract_pdf_url', v)} auditTag="contract_pdf_url" registerRef={registerRef('contract_pdf_url')} />
              </SectionCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <SectionCard title="Marketing" icon={Layers}>
                <EditableField label="Title" value={unit.marketing_title} onSave={(v) => handleUnitField('marketing_title', v)} auditTag="marketing_title" registerRef={registerRef('marketing_title')} />
                <EditableField label="Inventory" value={unit.inventory_list} onSave={(v) => handleUnitField('inventory_list', v)} auditTag="inventory_list" />
              </SectionCard>
              <SectionCard title="OTA Channels" icon={Tag} className="lg:col-span-2">
                <div ref={registerRef('ota_section')}>
                  <OtaEditor unit={unit} onSave={handleOtaSave} channelOptions={channelOptions} />
                </div>
              </SectionCard>
            </div>

            <InteractionsSection
              unit={unit}
              onLogCall={onLogCall}
              refreshKey={interactionsRefreshKey}
            />
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
      setOtaListings([]); setBuildingSuggestions([]); setDrafting(false)
    }
  }, [open])

  useEffect(() => {
    if (!form.building.trim()) { setBuildingSuggestions(existingBuildings); return }
    const q = form.building.toLowerCase()
    setBuildingSuggestions(existingBuildings.filter((b) => b.toLowerCase().includes(q)))
  }, [form.building, existingBuildings])

  const setField = (key, val) => setForm((prev) => ({ ...prev, [key]: val }))
  const allChannelOptions = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS)
    channelOptions.forEach((c) => set.add(c))
    otaListings.forEach((l) => set.add(l.channel))
    return [...set].sort()
  }, [channelOptions, otaListings])

  const addChannel = () => {
    const channel = draftChannel.trim(), name = draftName.trim()
    if (!channel) { toast.error('Pick or type a channel'); return }
    if (!name) { toast.error('Enter a listing name'); return }
    if (otaListings.some((l) => l.channel.toLowerCase() === channel.toLowerCase())) { toast.error('Channel already added'); return }
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
          const created = await createOwner({ name: form.owner_name.trim() || null, email, phone: form.owner_phone.trim() || null })
          ownerId = created.id
        }
      }
      const unit = await createUnit({
        unit_code: form.unit_code.trim(), building: form.building.trim(),
        unit_type: form.unit_type || null, status: form.status || 'ACTIVE',
        gc_status: form.gc_status || null,
        marketing_title: form.marketing_title.trim() || null,
        inventory_list: form.inventory_list.trim() || null,
        owner_id: ownerId, ota_listings: otaListings,
      })
      if (form.effective_date || form.expiry_date) {
        const { data: contract } = await supabase.from('contracts').insert({
          unit_id: unit.id, owner_id: ownerId,
          effective_date: form.effective_date || null, expiry_date: form.expiry_date || null,
          classification: form.classification || null,
        }).select('id').single()
        if (contract?.id) await updateUnit(unit.id, { current_contract_id: contract.id })
      }
      for (const listing of otaListings) {
        if (!DEFAULT_CHANNELS.includes(listing.channel))
          supabase.from('ota_channel_names').insert({ name: listing.channel }).then(() => {}).catch(() => {})
      }
      logAudit('CREATE_UNIT', 'units', unit.id, { unit_code: form.unit_code.trim() }).catch(() => {})
      toast.success('Unit created'); onCreated(); onClose()
    } catch (err) {
      console.error(err)
      toast.error(String(err.message || '').includes('duplicate') ? 'Unit Code already exists' : 'Failed to create unit')
    } finally { setSaving(false) }
  }

  if (!open) return null
  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Add New Unit</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Unit</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelClass}>Unit Code *</label>
                <Input value={form.unit_code} onChange={(e) => setField('unit_code', e.target.value)} placeholder="e.g., P S1 503" className={inputClass} autoFocus /></div>
              <div className="relative"><label className={labelClass}>Building *</label>
                <Input value={form.building} onChange={(e) => setField('building', e.target.value)}
                  onFocus={() => setBuildingFocus(true)} onBlur={() => setTimeout(() => setBuildingFocus(false), 150)}
                  placeholder="Type to search or add new" className={inputClass} />
                {buildingFocus && buildingSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded shadow-lg z-10 max-h-44 overflow-y-auto">
                    {buildingSuggestions.map((b) => (
                      <button key={b} type="button" onMouseDown={(e) => { e.preventDefault(); setField('building', b); setBuildingFocus(false) }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors">{b}</button>
                    ))}
                  </div>
                )}
              </div>
              <div><label className={labelClass}>Unit Type</label>
                <Select value={form.unit_type} onValueChange={(v) => setField('unit_type', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><label className={labelClass}>Status</label>
                <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><label className={labelClass}>GC Status</label>
                <Select value={form.gc_status} onValueChange={(v) => setField('gc_status', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>{GC_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Owner</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className={labelClass}>Name</label><Input value={form.owner_name} onChange={(e) => setField('owner_name', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Email</label><Input type="email" value={form.owner_email} onChange={(e) => setField('owner_email', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Phone</label><Input type="tel" value={form.owner_phone} onChange={(e) => setField('owner_phone', e.target.value)} className={inputClass} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Contract</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className={labelClass}>Effective</label><Input type="date" value={form.effective_date} onChange={(e) => setField('effective_date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Expiry</label><Input type="date" value={form.expiry_date} onChange={(e) => setField('expiry_date', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Classification</label>
                <Select value={form.classification} onValueChange={(v) => setField('classification', v)}>
                  <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>{CLASSIFICATION_OPTIONS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Marketing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelClass}>Marketing Title</label><Input value={form.marketing_title} onChange={(e) => setField('marketing_title', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Inventory List</label><Input value={form.inventory_list} onChange={(e) => setField('inventory_list', e.target.value)} className={inputClass} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">OTA Channels</h3>
            <div className="space-y-1.5">
              {otaListings.length === 0 && !drafting && <p className="text-xs text-muted-foreground italic">No channels added yet</p>}
              {otaListings.map((item, i) => (
                <div key={`${item.channel}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[72px] flex-shrink-0">{item.channel}</span>
                  <span className="text-xs flex-1 min-w-0 truncate">{item.name}</span>
                  <button type="button" onClick={() => setOtaListings(otaListings.filter((_, x) => x !== i))}
                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 size={11} /></button>
                </div>
              ))}
              {drafting ? (
                <div className="flex items-center gap-2 px-2 py-2 rounded bg-muted/50 border border-primary/40">
                  <Input value={draftChannel} onChange={(e) => setDraftChannel(e.target.value)} placeholder="Channel" list="ota-channel-options-add" className="h-7 text-xs rounded flex-1" />
                  <datalist id="ota-channel-options-add">{allChannelOptions.map((opt) => <option key={opt} value={opt} />)}</datalist>
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addChannel(); if (e.key === 'Escape') { setDrafting(false); setDraftChannel(''); setDraftName('') } }}
                    placeholder="Listing name" className="h-7 text-xs rounded flex-1" />
                  <Button size="icon" className="h-7 w-7 rounded flex-shrink-0" onClick={addChannel}><Check size={11} /></Button>
                  <button type="button" onClick={() => { setDrafting(false); setDraftChannel(''); setDraftName('') }} className="p-1 rounded hover:bg-muted text-muted-foreground"><X size={12} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setDrafting(true)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary py-1.5 px-2 rounded transition-colors">
                  <Plus size={11} /> Add Channel
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
  const headers = ['Building', 'Unit', 'Owner', 'Email', 'Phone', 'Type', 'Status', 'Effective', 'Expiry', 'Marketing Title', 'Missing Fields', 'Overdue']
  const rows = units.map((u) => {
    const m = getMissingFields(u)
    const c = getContractOverdue(u)
    const f = getFollowUpOverdue(u)
    const overdueDays = Math.max(c?.daysOverdue || 0, f?.daysOverdue || 0)
    return [
      u.building, u.unit_code, u.owner_name || '', u.owner_email || '', u.owner_phone || '',
      u.unit_type || '', u.status || '', u.effective_date || '', u.expiry_date || '',
      u.marketing_title || '', m.total, overdueDays > 0 ? `${overdueDays}d` : '',
    ]
  })
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// FILTER PANEL
// ============================================================
function FilterPanel({ open, onClose, building, setBuilding, dateFilter, setDateFilter, otaFilter, setOtaFilter, buildings, activeCount, onClear }) {
  const panelRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onMouseDown); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={panelRef} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
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
                <SelectContent>{DATE_FILTERS.map((d) => <SelectItem key={d.id} value={d.id} className="text-xs">{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">OTA Channels</p>
              <Select value={otaFilter} onValueChange={setOtaFilter}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="Any OTA status" /></SelectTrigger>
                <SelectContent>{OTA_FILTERS.map((o) => <SelectItem key={o.id} value={o.id} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
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
// STATUS PILLS — white bg, text color changes
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
      <motion.div className="absolute top-1 bottom-1 rounded-full shadow-sm z-0 bg-card border border-border"
        animate={{ left: indicator.left, width: indicator.width }} transition={{ type: 'spring', stiffness: 350, damping: 28 }} />
      {STATUS_PILLS.map((tab) => {
        const isActive = statusFilter === tab.id
        const count = counts[tab.id] ?? 0
        return (
          <button key={tab.id} type="button" data-active={isActive} onClick={() => onStatusFilter(tab.id)}
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
  const [otaFilter, setOtaFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [addUnitOpen, setAddUnitOpen] = useState(false)

  const [sortField, setSortField] = useState('unit_code')
  const [sortDir, setSortDir] = useState('asc')
  const [expandedId, setExpandedId] = useState(null)

  const [cardsHidden, setCardsHidden] = useState(false)
  const [channelOptions, setChannelOptions] = useState([])

  const [logCallUnit, setLogCallUnit] = useState(null)
  const [interactionsRefreshKey, setInteractionsRefreshKey] = useState(0)

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
    if (data) setChannelOptions(data.map((d) => d.name))
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
      setIsFirstLoad(false); setIsRefreshing(false); hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchUnits(); fetchChannelOptions() }, [fetchUnits, fetchChannelOptions])

  const buildings = useMemo(() => {
    const set = new Set()
    allUnits.forEach((u) => { if (u.building) set.add(u.building) })
    return [...set].sort()
  }, [allUnits])

  const missingMap = useMemo(() => {
    const m = new Map()
    for (const u of allUnits) m.set(u.id, getMissingFields(u))
    return m
  }, [allUnits])

  const missingUnitsList = useMemo(() => {
    const out = []
    for (const u of allUnits) {
      const m = missingMap.get(u.id)
      if (m && (m.critical.length + m.warnings.length) > 0) out.push({ unit: u, missing: m })
    }
    out.sort((a, b) => {
      const aTotal = a.missing.critical.length + a.missing.warnings.length
      const bTotal = b.missing.critical.length + b.missing.warnings.length
      return bTotal - aTotal
    })
    return out
  }, [allUnits, missingMap])

  const overdueList = useMemo(() => getOverdueUnits(allUnits), [allUnits])

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
    if (otaFilter !== 'all') n++
    return n
  }, [building, dateFilter, otaFilter])

  const clearFilters = () => { setBuilding('all'); setDateFilter('all'); setOtaFilter('all') }

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

      if (otaFilter !== 'all') {
        const listings = normalizeOtaListings(u.ota_listings)
        if (otaFilter === 'none' && listings.length > 0) return false
        if (otaFilter === 'missing_names' && !listings.some((l) => !l.name)) return false
        if (otaFilter === 'duplicates' && findDuplicateChannels(listings).length === 0) return false
      }

      if (q) {
        const haystack = [u.unit_code, u.owner_name, u.owner_email, u.owner_phone, u.building, u.marketing_title, u.unit_type, u.gc_status]
          .filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [allUnits, statusFilter, building, dateFilter, otaFilter, debouncedSearch])

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

  const handleDeleteUnit = async (unit) => {
    const confirmed = window.confirm(
      `Delete unit "${unit.unit_code}"?\n\n` +
      `Building: ${unit.building || '—'}\n` +
      `Owner: ${unit.owner_name || '—'}\n\n` +
      `This will also delete its contracts and interactions. This cannot be undone.`
    )
    if (!confirmed) return
    try {
      await deleteUnit(unit.id)
      logAudit('DELETE_UNIT', 'units', unit.id, { unit_code: unit.unit_code, building: unit.building }).catch(() => {})
      toast.success('Unit deleted')
      setExpandedId(null)
      fetchUnits()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete unit')
    }
  }

  const handleTableMouseMove = useCallback((e) => {
    const headerEl = headerRef.current
    if (!headerEl) return
    const headerRect = headerEl.getBoundingClientRect()
    setCardsHidden(e.clientY > headerRect.bottom)
  }, [])

  const handleTableMouseLeave = useCallback(() => setCardsHidden(false), [])

  const handleSelectUnit = (unit) => {
    setExpandedId(unit.id)
    setStatusFilter('all')
  }

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className={cn('flex-shrink-0 transition-all duration-300 ease-out overflow-hidden', cardsHidden ? 'max-h-0 opacity-0 -mb-3' : 'max-h-40 opacity-100')}>
        <SummaryCards units={allUnits} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card border border-border rounded-md">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search unit, owner, email, phone, building..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded" />
            </div>
            <Button size="sm" className="h-8 rounded text-xs text-white transition-all duration-150 active:scale-[0.98]" style={{ backgroundColor: BRAND }} onClick={() => setAddUnitOpen(true)}>
              <Plus size={13} />
              <span className="hidden sm:inline ml-1">Add Unit</span>
            </Button>
            <div className="relative" ref={filterWrapRef}>
              <Button variant={activeFilterCount > 0 ? 'default' : 'outline'} size="sm" className="h-8 rounded text-xs transition-all duration-150" onClick={() => setFilterOpen((v) => !v)}>
                <SlidersHorizontal size={13} />
                <span className="hidden sm:inline ml-1">Filter</span>
                {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">{activeFilterCount}</span>}
              </Button>
              <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)}
                building={building} setBuilding={setBuilding}
                dateFilter={dateFilter} setDateFilter={setDateFilter}
                otaFilter={otaFilter} setOtaFilter={setOtaFilter}
                buildings={buildings} activeCount={activeFilterCount} onClear={clearFilters} />
            </div>
            <Button variant="outline" size="sm" onClick={fetchUnits} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded transition-all duration-150">
              <Download size={13} />
            </Button>
          </div>

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
            <WarningsStrip
              missingUnits={missingUnitsList}
              overdueCount={overdueList.length}
              overdueUnits={overdueList}
              onSelectUnit={handleSelectUnit}
            />
          </div>

          <div className="flex-1 min-h-0 rounded border border-border overflow-hidden">
            <div ref={tableScrollRef} className="h-full overflow-y-auto overflow-x-auto" onMouseMove={handleTableMouseMove} onMouseLeave={handleTableMouseLeave}>
              {isFirstLoad ? (
                <div className="space-y-2 p-3">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
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
                      <SortHead field="building" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Building</SortHead>
                      <SortHead field="unit_code" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Unit</SortHead>
                      <SortHead field="owner_name" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Owner</SortHead>
                      <SortHead field="unit_type" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="center">Type</SortHead>
                      <SortHead field="effective_date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right">Effective</SortHead>
                      <SortHead field="expiry_date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right">Expiry</SortHead>
                      <SortHead field="status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="center">Status</SortHead>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={8} className="h-32 text-center text-muted-foreground text-sm">No units match your filters</td></tr>
                    ) : (
                      sorted.map((unit) => {
                        const isExpanded = expandedId === unit.id
                        const missing = missingMap.get(unit.id) || { critical: [], warnings: [], ota: [], total: 0, score: 100 }
                        return (
                          <Fragment key={unit.id}>
                            <tr ref={isExpanded ? clickedRowRef : null} onClick={() => setExpandedId(isExpanded ? null : unit.id)}
                              className={cn('cursor-pointer transition-colors duration-100 border-b border-border', isExpanded ? 'text-white' : 'hover:bg-muted/50')}
                              style={isExpanded ? { backgroundColor: BRAND } : undefined}>
                              <td className="py-2.5 px-4"><UnitAvatar unit={unit} size="sm" /></td>
                              <td className={cn('text-xs py-2.5 px-4 truncate', isExpanded && 'text-white/90')}>{unit.building}</td>
                              <td className={cn('font-mono text-xs font-bold py-2.5 px-4 truncate', isExpanded ? 'text-white' : 'text-foreground')}>{unit.unit_code}</td>
                              <td className={cn('text-xs py-2.5 px-4 truncate', isExpanded ? 'text-white/90' : '')}>
                                {unit.owner_name || <span className={cn('italic', isExpanded ? 'text-white/60' : 'text-muted-foreground')}>No owner</span>}
                              </td>
                              <td className={cn('text-xs py-2.5 px-4 truncate text-center', isExpanded ? 'text-white/70' : 'text-muted-foreground')}>{unit.unit_type || '—'}</td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center justify-end h-5">
                                  <span className={cn('text-xs tabular-nums', isExpanded && 'text-white/95')}>{unit.effective_date ? formatDate(unit.effective_date) : '—'}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center justify-end h-5">
                                  <span className={cn('text-xs tabular-nums', isExpanded && 'text-white/95')}>{unit.expiry_date ? formatDate(unit.expiry_date) : '—'}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-center"><StatusBadge status={unit.status} /></td>
                            </tr>
                            {isExpanded && (
                              <ExpandedRow unit={unit} onUnitChange={handleUnitUpdate} rowRef={expandedRowRef}
                                channelOptions={channelOptions} missing={missing}
                                onLogCall={() => setLogCallUnit(unit)}
                                onDelete={() => handleDeleteUnit(unit)}
                                interactionsRefreshKey={interactionsRefreshKey} />
                            )}
                          </Fragment>
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

      <AddUnitModal open={addUnitOpen} onClose={() => setAddUnitOpen(false)}
        onCreated={() => { fetchUnits(); fetchChannelOptions() }}
        existingBuildings={buildings} channelOptions={channelOptions} />

      <LogCallModal
        open={!!logCallUnit}
        onClose={() => setLogCallUnit(null)}
        unit={logCallUnit}
        onSaved={() => { fetchUnits(); setInteractionsRefreshKey((k) => k + 1) }}
      />
    </div>
  )
}