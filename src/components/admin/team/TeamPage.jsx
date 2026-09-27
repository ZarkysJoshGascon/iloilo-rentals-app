import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2, Camera,
  UserPlus, Users, Award, TrendingUp, Mail, Phone, Edit2, User, Wallet,
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

// ============================================================
// CONFIG
// ============================================================
const BRAND = '#2d568e'

const TABS = [
  { id: 'specialists', label: 'Booking Specialists', icon: UserPlus },
  { id: 'affiliates', label: 'Affiliates', icon: Award },
  { id: 'housekeepers', label: 'Housekeepers', icon: Users },
]

const TIER_LADDER = [
  { tier: 'Unranked',  min: 0,   max: 19,        rate: 0,  badge: 'bg-gray-500 text-white' },
  { tier: 'Bronze',    min: 20,  max: 49,        rate: 5,  badge: 'bg-amber-700 text-white' },
  { tier: 'Silver',    min: 50,  max: 79,        rate: 7,  badge: 'bg-slate-400 text-white' },
  { tier: 'Gold',      min: 80,  max: 99,        rate: 10, badge: 'bg-amber-500 text-white' },
  { tier: 'Platinum',  min: 100, max: Infinity,  rate: 12, badge: 'bg-cyan-600 text-white' },
]

function getTierInfo(count) {
  const c = Number(count) || 0
  for (const t of TIER_LADDER) {
    if (c >= t.min && c <= t.max) return t
  }
  return TIER_LADDER[0]
}

function nextTierInfo(count) {
  const c = Number(count) || 0
  for (const t of TIER_LADDER) {
    if (c < t.min) return t
  }
  return null
}

// ============================================================
// HELPERS
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

function WorkerAvatar({ name, photo_url, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'lg' ? 'w-16 h-16 text-lg' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  if (photo_url) {
    return <img src={photo_url} alt={name} className={cn('rounded-full object-cover flex-shrink-0', sizeClasses)} />
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

function TierBadge({ count }) {
  const info = getTierInfo(count)
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold', info.badge)}>
      {info.tier} · {info.rate}%
    </span>
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
// EDITABLE FIELD
// ============================================================
function EditableField({ label, value, type = 'text', onSave }) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = async () => {
    if (draft === (value ?? '')) return
    setStatus('saving')
    try {
      const next = draft === '' ? null : draft
      await onSave(next)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1200)
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Save failed')
      setDraft(value ?? '')
      setStatus('idle')
    }
  }
  const cancel = () => setDraft(value ?? '')

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } if (e.key === 'Escape') { e.preventDefault(); cancel(); e.target.blur() } }}
          onBlur={commit}
          className={cn('h-7 text-xs rounded bg-background flex-1 transition-colors', !value && 'border-border', value && 'border-transparent hover:border-border')}
          placeholder="—"
        />
        {status === 'saving' && <Loader2 size={11} className="flex-shrink-0 animate-spin text-primary" />}
        {status === 'saved' && <Check size={11} className="flex-shrink-0 text-emerald-500" />}
      </div>
    </div>
  )
}

// ============================================================
// ADD / EDIT WORKER MODAL
// ============================================================
function WorkerFormModal({ open, onClose, onSaved, role, editing }) {
  const [form, setForm] = useState({ code: '', name: '', email: '', phone: '', notes: '' })
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const isSpecialist = role === 'specialists'
  const isAffiliate = role === 'affiliates'
  const isHousekeeper = role === 'housekeepers'

  const tableName = role
  const bucketName = 'team-photos'

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        code: editing.code || '',
        name: editing.name || '',
        email: editing.email || '',
        phone: editing.phone || '',
        notes: editing.notes || '',
      })
      setPhotoPreview(editing.photo_url || null)
    } else {
      setForm({ code: '', name: '', email: '', phone: '', notes: '' })
      setPhotoPreview(null)
    }
    setPhotoFile(null)
  }, [open, editing])

  if (!open) return null

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handlePhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPhotoFile(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async () => {
    if (!form.code.trim()) { toast.error('Code is required'); return }
    if (!form.name.trim()) { toast.error('Name is required'); return }

    setSaving(true)
    try {
      let photoUrl = editing?.photo_url || null

      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg'
        const path = `${role}/${form.code.toUpperCase()}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from(bucketName)
          .upload(path, photoFile, { cacheControl: '3600', upsert: true })
        if (upErr) throw upErr
        const { data } = supabase.storage.from(bucketName).getPublicUrl(path)
        photoUrl = data.publicUrl
      }

      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        photo_url: photoUrl,
      }

      if (editing) {
        const { error } = await supabase.from(tableName).update(payload).eq('id', editing.id)
        if (error) throw error
        logAudit(`UPDATE_${role.toUpperCase()}`, role, editing.id, { code: payload.code }).catch(() => {})
        toast.success('Updated')
      } else {
        const { error } = await supabase.from(tableName).insert(payload)
        if (error) throw error
        logAudit(`CREATE_${role.toUpperCase()}`, role, null, { code: payload.code }).catch(() => {})
        toast.success('Created')
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'
  const inputClass = 'h-8 text-xs rounded'

  const title = editing
    ? `Edit ${isSpecialist ? 'Booking Specialist' : isAffiliate ? 'Affiliate' : 'Housekeeper'}`
    : `New ${isSpecialist ? 'Booking Specialist' : isAffiliate ? 'Affiliate' : 'Housekeeper'}`

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center"><User size={24} className="text-muted-foreground" /></div>
              )}
              <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#2d568e] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-[#1e3a5f]">
                <Camera size={12} />
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Upload a profile photo</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className={labelClass}>Code *</label><Input value={form.code} onChange={(e) => setField('code', e.target.value)} className={cn(inputClass, 'font-mono uppercase')} /></div>
            <div><label className={labelClass}>Name *</label><Input value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputClass} autoFocus /></div>
            <div><label className={labelClass}>Email</label><Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Phone</label><Input type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} className={inputClass} /></div>
          </div>

          <div><label className={labelClass}>Notes</label><Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} className="text-xs rounded resize-none" /></div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 rounded text-xs" onClick={handleSubmit} disabled={saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================
// DETAIL PANEL (right side)
// ============================================================
function DetailPanel({ worker, role, onClose, onChanged, onEdit, onDelete }) {
  if (!worker) return null
  const isAffiliate = role === 'affiliates'
  const isHousekeeper = role === 'housekeepers'

  const updateField = async (field, value) => {
    const { error } = await supabase.from(role).update({ [field]: value }).eq('id', worker.id)
    if (error) throw error
    logAudit(`UPDATE_${role.toUpperCase()}_FIELD:${field}`, role, worker.id, { field, from: worker[field], to: value }).catch(() => {})
    onChanged({ ...worker, [field]: value })
  }

  const tierInfo = getTierInfo(worker.commission_count)
  const nextTier = nextTierInfo(worker.commission_count)

  return (
    <motion.div
      key={worker.id}
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-full max-w-md bg-card border-l border-border flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <WorkerAvatar name={worker.name} photo_url={worker.photo_url} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-foreground truncate">{worker.name}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{worker.code}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase', worker.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-gray-500 text-white')}>{worker.status}</span>
              {!isHousekeeper && <TierBadge count={worker.commission_count} />}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"><X size={16} /></button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Stats */}
        {!isHousekeeper && (
          <SectionCard title="Stats" icon={TrendingUp}>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isAffiliate ? 'Bookings referred' : 'Bookings handled'}</span>
                <span className="font-semibold tabular-nums">{worker.commission_count || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current tier</span>
                <span className="font-semibold">{tierInfo.tier} · {tierInfo.rate}%</span>
              </div>
              {nextTier && (
                <>
                  <div className="flex justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground">Next tier</span>
                    <span className="font-semibold">{nextTier.tier} · {nextTier.rate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Needed</span>
                    <span className="font-semibold tabular-nums">{Math.max(0, nextTier.min - (worker.commission_count || 0))} more</span>
                  </div>
                </>
              )}
            </div>
          </SectionCard>
        )}

        {/* Contact */}
        <SectionCard title="Contact" icon={User}>
          <EditableField label="Name" value={worker.name} onSave={(v) => updateField('name', v)} />
          <EditableField label="Code" value={worker.code} onSave={(v) => updateField('code', v)} />
          <EditableField label="Email" value={worker.email} type="email" onSave={(v) => updateField('email', v)} />
          <EditableField label="Phone" value={worker.phone} type="tel" onSave={(v) => updateField('phone', v)} />
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px] flex-shrink-0">Status</span>
            <div className="flex-1">
              <Select value={worker.status || 'active'} onValueChange={async (v) => {
                try {
                  await updateField('status', v)
                  toast.success('Status updated')
                } catch (err) { toast.error('Failed to update') }
              }}>
                <SelectTrigger className="h-7 text-xs rounded"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="text-xs">Active</SelectItem>
                  <SelectItem value="inactive" className="text-xs">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {/* Count override for testing */}
        {!isHousekeeper && (
          <SectionCard title="Commission Count (manual override)" icon={Wallet}>
            <EditableField
              label="Count"
              value={String(worker.commission_count || 0)}
              type="number"
              onSave={(v) => updateField('commission_count', Number(v) || 0)}
            />
          </SectionCard>
        )}

        {/* Notes */}
        <SectionCard title="Notes" icon={Edit2}>
          <Textarea
            defaultValue={worker.notes || ''}
            onBlur={async (e) => {
              if (e.target.value === (worker.notes || '')) return
              try { await updateField('notes', e.target.value || null); toast.success('Notes saved') }
              catch { toast.error('Failed to save') }
            }}
            rows={3}
            className="text-xs rounded resize-none w-full"
            placeholder="Add notes..."
          />
        </SectionCard>

        {/* Recent activity placeholder */}
        <SectionCard title="Recent Activity" icon={TrendingUp}>
          <p className="text-xs text-muted-foreground italic py-2">Activity feed coming soon</p>
        </SectionCard>

      </div>

      {/* Actions */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5" onClick={onEdit}>
          <Edit2 size={11} /> Edit
        </Button>
        <Button variant="outline" size="sm" className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20" onClick={onDelete}>
          <Trash2 size={11} /> Delete
        </Button>
      </div>
    </motion.div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function TeamPage() {
  const [activeTab, setActiveTab] = useState('specialists')
  const [data, setData] = useState({ specialists: [], affiliates: [], housekeepers: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const fetchAll = useCallback(async () => {
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    try {
      const [s, a, h] = await Promise.all([
        supabase.from('specialists').select('*').order('name'),
        supabase.from('affiliates').select('*').order('name'),
        supabase.from('housekeepers').select('*').order('name'),
      ])
      if (s.error) throw s.error
      if (a.error) throw a.error
      if (h.error) throw h.error
      setData({ specialists: s.data || [], affiliates: a.data || [], housekeepers: h.data || [] })
    } catch (err) {
      console.error('Failed to load team:', err)
      toast.error('Failed to load team')
    } finally {
      setLoading(false)
      setRefreshing(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Realtime
  useEffect(() => {
    const chs = [
      supabase.channel('team-specialists').on('postgres_changes', { event: '*', schema: 'public', table: 'specialists' }, () => fetchAll()).subscribe(),
      supabase.channel('team-affiliates').on('postgres_changes', { event: '*', schema: 'public', table: 'affiliates' }, () => fetchAll()).subscribe(),
      supabase.channel('team-housekeepers').on('postgres_changes', { event: '*', schema: 'public', table: 'housekeepers' }, () => fetchAll()).subscribe(),
    ]
    return () => { chs.forEach((c) => supabase.removeChannel(c)) }
  }, [fetchAll])

  const activeList = data[activeTab] || []

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return activeList
    return activeList.filter((w) =>
      (w.name || '').toLowerCase().includes(q) ||
      (w.code || '').toLowerCase().includes(q) ||
      (w.email || '').toLowerCase().includes(q) ||
      (w.phone || '').toLowerCase().includes(q)
    )
  }, [activeList, debouncedSearch])

  const handleSelect = (worker) => setSelected(worker)

  const handleChanged = (updated) => {
    setData((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].map((x) => (x.id === updated.id ? { ...x, ...updated } : x)),
    }))
    setSelected(updated)
  }

  const handleDelete = async (worker) => {
    const confirmed = window.confirm(
      `Delete "${worker.name}" (${worker.code})?\n\nThis cannot be undone.`
    )
    if (!confirmed) return
    try {
      const { error } = await supabase.from(activeTab).delete().eq('id', worker.id)
      if (error) throw error
      logAudit(`DELETE_${activeTab.toUpperCase()}`, activeTab, worker.id, { code: worker.code }).catch(() => {})
      toast.success('Deleted')
      setSelected(null)
      fetchAll()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    }
  }

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (worker) => { setEditing(worker); setFormOpen(true) }

  return (
    <div className="h-full flex min-h-0">
      {/* Left: list */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card border border-border rounded-md">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">

          {/* Tabs + Toolbar */}
          <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
            <div className="relative flex bg-muted/60 rounded-full p-1 gap-1">
              {TABS.map((tab) => {
                const count = (data[tab.id] || []).length
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveTab(tab.id); setSelected(null) }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors',
                      isActive ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <tab.icon size={12} />
                    {tab.label}
                    <span className="opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>

            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search name, code, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs rounded" />
            </div>

            <Button size="sm" className="h-8 rounded text-xs text-white" style={{ backgroundColor: BRAND }} onClick={openNew}>
              <Plus size={13} />
              <span className="hidden sm:inline ml-1">New</span>
            </Button>

            <Button variant="outline" size="sm" onClick={fetchAll} disabled={refreshing} className="h-8 rounded">
              <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
            </Button>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 rounded border border-border overflow-hidden">
            <div className="h-full overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <Users size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-semibold">No workers yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Click "New" to add your first one</p>
                  </div>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-card border-b border-border">
                    <tr>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Worker</th>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Code</th>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Email / Phone</th>
                      {activeTab !== 'housekeepers' && <th className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Count</th>}
                      {activeTab !== 'housekeepers' && <th className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Tier</th>}
                      <th className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((worker) => {
                      const isSelected = selected?.id === worker.id
                      return (
                        <tr
                          key={worker.id}
                          onClick={() => handleSelect(worker)}
                          className={cn(
                            'border-b border-border cursor-pointer transition-colors',
                            isSelected ? 'bg-[#2d568e]/10' : 'hover:bg-muted/50'
                          )}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <WorkerAvatar name={worker.name} photo_url={worker.photo_url} size="sm" />
                              <span className="text-sm font-semibold text-foreground truncate">{worker.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{worker.code}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground truncate">
                            {worker.email || '—'}
                            {worker.phone && <span className="block text-[10px]">{worker.phone}</span>}
                          </td>
                          {activeTab !== 'housekeepers' && (
                            <td className="px-4 py-2.5 text-center tabular-nums text-xs text-foreground font-semibold">{worker.commission_count || 0}</td>
                          )}
                          {activeTab !== 'housekeepers' && (
                            <td className="px-4 py-2.5 text-center"><TierBadge count={worker.commission_count} /></td>
                          )}
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', worker.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-gray-500 text-white')}>
                              {worker.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right: detail pane */}
      <AnimatePresence>
        {selected && (
          <DetailPanel
            worker={selected}
            role={activeTab}
            onClose={() => setSelected(null)}
            onChanged={handleChanged}
            onEdit={() => openEdit(selected)}
            onDelete={() => handleDelete(selected)}
          />
        )}
      </AnimatePresence>

      {/* Form modal */}
      <WorkerFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={fetchAll}
        role={activeTab}
        editing={editing}
      />
    </div>
  )
}