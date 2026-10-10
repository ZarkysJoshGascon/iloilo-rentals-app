// src/components/admin/registry/RegistryPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check, Loader2, Mail, Phone,
  Plus, RefreshCw, Search, X, Pencil,
  CheckCircle2, AlertTriangle, Trash2, PhoneCall,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import {
  listUnits, updateUnit, createUnit, createOwner, deleteUnit,
  updateInteraction, deleteInteraction, formatDate,
} from '@/lib/registry'
import { logAudit } from '@/lib/auditLog'
import { cn, sanitizeText, sanitizeEmail } from '@/lib/utils'
import { searchProfiles, isEmailRegistered } from '@/lib/staff'

const BRAND = '#2d568e'
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'
const BTN_RADIUS = { borderRadius: 6 }

function fmtDateShort(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}

// ─────────────────────────────────────────────────────────────
// ProfileEmailCombobox
// ─────────────────────────────────────────────────────────────
function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function ProfileEmailCombobox({
  value,
  onChange,
  onVerifiedChange,
  verifiedProfile,
  disabled = false,
  placeholder = 'name@example.com',
  autoFocus = false,
}) {
  const wrapRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      const rows = await searchProfiles(q, { signal: ac.signal, limit: 10 })
      if (ac.signal.aborted) return
      setResults(rows)
      setHighlight(0)
      setLoading(false)
    }, 200)
    return () => { ac.abort(); clearTimeout(t); setLoading(false) }
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (row) => {
    setQuery(row.email)
    onChange(row.email)
    onVerifiedChange?.(row)
    setOpen(false)
  }

  const handleBlur = async () => {
    const typed = query.trim().toLowerCase()
    if (!typed) { onVerifiedChange?.(null); return }
    if (verifiedProfile && verifiedProfile.email.toLowerCase() === typed) return
    setVerifying(true)
    const { registered, profile } = await isEmailRegistered(typed)
    setVerifying(false)
    onVerifiedChange?.(registered ? profile : null)
  }

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (results[highlight]) { e.preventDefault(); choose(results[highlight]) }
    }
  }

  const showDropdown = open && (loading || results.length > 0 || query.trim().length >= 2)

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <Input
          type="email"
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            onChange(v)
            onVerifiedChange?.(null)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(handleBlur, 120)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          maxLength={254}
          style={BTN_RADIUS}
          className={cn(
            'h-9 text-xs pr-8',
            verifiedProfile && 'border-emerald-400/60 focus-visible:ring-emerald-400/30',
          )}
        />
        {verifying && (
          <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
        )}
        {!verifying && verifiedProfile && (
          <Check size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-500" />
        )}
      </div>

      {verifiedProfile && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-emerald-700 dark:text-emerald-400">
          {verifiedProfile.avatar_url ? (
            <img src={verifiedProfile.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[8px] font-bold flex-shrink-0">
              {initials(verifiedProfile.full_name || verifiedProfile.email)}
            </div>
          )}
          <span className="truncate">
            {verifiedProfile.full_name || verifiedProfile.email} · registered
          </span>
        </div>
      )}

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }}
            style={BTN_RADIUS}
            className="absolute z-30 left-0 right-0 mt-1 bg-popover border border-border shadow-lg max-h-[280px] overflow-y-auto"
          >
            {loading && results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground italic">Searching…</div>
            ) : results.length === 0 && query.trim().length >= 2 ? (
              <div className="px-3 py-3 text-[11px] text-muted-foreground italic">
                No registered user matches.
                <div className="mt-1 text-[10px]">
                  Ask them to log in at Iloilo Rentals first, then come back.
                </div>
              </div>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); choose(r) }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors',
                    i === highlight ? 'bg-muted' : 'hover:bg-muted/60',
                  )}
                >
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                      {initials(r.full_name || r.email)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {r.full_name && (
                      <p className="text-[11px] font-semibold text-foreground truncate">{r.full_name}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground truncate font-mono">{r.email}</p>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PillBar
// ─────────────────────────────────────────────────────────────
function PillBar({ tabs, active, onChange, counts, className }) {
  const containerRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => {
      const activeEl = node.querySelector('[data-active="true"]')
      if (!activeEl) { setIndicator({ left: 0, width: 0 }); return }
      const cRect = node.getBoundingClientRect()
      const aRect = activeEl.getBoundingClientRect()
      setIndicator({ left: aRect.left - cRect.left, width: aRect.width })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) ro.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [active, counts, tabs])

  return (
    <div className={cn('inline-flex items-center p-1 rounded-full bg-muted/60 border border-border/60', className)}>
      <div ref={containerRef} className="relative inline-flex items-center gap-1">
        <motion.div
          className="absolute top-0 bottom-0 rounded-full bg-card shadow-sm border border-border z-0"
          animate={{ left: indicator.left, width: indicator.width }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        />
        {tabs.map((tab) => {
          const isActive = active === tab.id
          const count = counts ? (counts[tab.id] ?? 0) : null
          return (
            <button
              key={tab.id}
              type="button"
              data-active={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative z-10 px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {count !== null && (
                <span className={cn('ml-1 tabular-nums', isActive ? 'opacity-90' : 'opacity-60')}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DateRangeFilter
// ─────────────────────────────────────────────────────────────
function DateRangeFilter({ from, to, onFromChange, onToChange, onClear }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const [localFrom, setLocalFrom] = useState(from || '')
  const [localTo, setLocalTo] = useState(to || '')

  useEffect(() => { setLocalFrom(from || ''); setLocalTo(to || '') }, [from, to])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hasAny = !!from || !!to
  const summary = hasAny
    ? `${from ? fmtDateShort(from) : '…'} → ${to ? fmtDateShort(to) : '…'}`
    : 'Filter by date'

  const apply = () => {
    if (localFrom && localTo && localTo < localFrom) return
    onFromChange(localFrom); onToChange(localTo); setOpen(false)
  }
  const clear = () => {
    setLocalFrom(''); setLocalTo('')
    onClear?.()
    setOpen(false)
  }

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={BTN_RADIUS}
        className={cn(
          'inline-flex items-center gap-2 h-9 px-3.5 text-xs font-semibold transition-colors border',
          hasAny
            ? 'bg-foreground text-background border-foreground'
            : 'bg-card text-foreground border-border hover:bg-muted',
        )}
        title={hasAny ? summary : 'Filter by date range'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={hasAny ? 'opacity-90' : 'opacity-60'}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="hidden sm:inline truncate max-w-[140px]">{summary}</span>
        {hasAny && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); clear() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); clear() } }}
            className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-background/20 hover:bg-background/30 cursor-pointer"
            aria-label="Clear date filter"
          >
            <X size={10} />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={BTN_RADIUS}
            className="absolute right-0 z-30 mt-1 w-[280px] bg-popover border border-border shadow-xl p-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Contract expiry range
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">From</label>
                <input type="date" value={localFrom} onChange={(e) => setLocalFrom(e.target.value)} max={localTo || undefined}
                  style={BTN_RADIUS}
                  className="w-full h-8 text-xs border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">To</label>
                <input type="date" value={localTo} onChange={(e) => setLocalTo(e.target.value)} min={localFrom || undefined}
                  style={BTN_RADIUS}
                  className="w-full h-8 border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring/30" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
              <button type="button" onClick={clear} disabled={!localFrom && !localTo}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">
                Clear
              </button>
              <button type="button" onClick={apply}
                style={BTN_RADIUS}
                className="inline-flex items-center gap-1 h-7 px-3 bg-foreground text-background text-[11px] font-semibold hover:opacity-90">
                <Check size={11} />
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const DERIVED_STATUS_TEXT = {
  ACTIVE:      { label: 'Active',      className: 'text-emerald-600 dark:text-emerald-400' },
  FOR_RENEWAL: { label: 'For Renewal', className: 'text-red-600 dark:text-red-400' },
  INACTIVE:    { label: 'Inactive',    className: 'text-gray-500 dark:text-gray-400' },
}

const UNIT_TYPES = ['Studio', '1-Bedroom', '2-Bedroom', 'Executive Studio', 'STOCKROOM']
const GC_STATUS_OPTIONS = ['FIXED', 'MESSENGER', 'VIBER', 'NOT YET', 'N/A']
const OUTCOME_OPTIONS = ['positive', 'neutral', 'negative', 'no_answer']
const INTERACTION_TYPES = ['call', 'email', 'messenger', 'whatsapp', 'sms', 'in_person', 'note']

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'FOR_RENEWAL', label: 'For Renewal' },
  { id: 'INACTIVE', label: 'Inactive' },
]
const DEFAULT_CHANNELS = [
  'Airbnb', 'Booking.com', 'Agoda', 'Hosteeva', 'Your Rentals',
  'Trip.com', 'Expedia', 'Vrbo', 'Facebook Marketplace',
]

const ROW_GRID = 'grid grid-cols-[1.4fr_1fr_1.6fr_220px] gap-4 items-center'
const PANEL_WIDTH = 448
const EXPIRING_SOON_DAYS = 60

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
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
function getMissingFields(unit) {
  const warnings = []
  if (!unit) return { warnings, total: 0 }
  if (!unit.unit_type?.trim()) warnings.push({ key: 'unit_type', label: 'Unit Type' })
  if (!unit.marketing_title?.trim()) warnings.push({ key: 'marketing_title', label: 'Marketing Title' })
  if (!unit.gc_status?.trim()) warnings.push({ key: 'gc_status', label: 'GC Status' })
  if (!unit.owner_email?.trim()) warnings.push({ key: 'owner_email', label: 'Owner Email' })
  if (!unit.owner_phone?.trim()) warnings.push({ key: 'owner_phone', label: 'Owner Phone' })
  return { warnings, total: warnings.length }
}
function deriveUnitStatus(unit) {
  const contract = unit?.contract || null
  if (!contract) return { status: 'INACTIVE', warning: null, contract: null }
  const eff = contract.effective_date ? new Date(contract.effective_date + 'T00:00:00Z') : null
  const exp = contract.expiry_date ? new Date(contract.expiry_date + 'T00:00:00Z') : null
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  if (!eff && !exp) return { status: 'INACTIVE', warning: null, contract }
  if (!exp) return { status: 'ACTIVE', warning: null, contract }
  if (exp < today) {
    const daysAgo = Math.round((today - exp) / 86400000)
    return { status: 'FOR_RENEWAL', warning: { tone: 'red', text: daysAgo === 1 ? 'Expired 1 day ago' : `Expired ${daysAgo} days ago` }, contract }
  }
  const daysLeft = Math.round((exp - today) / 86400000)
  if (daysLeft <= EXPIRING_SOON_DAYS) {
    return { status: 'ACTIVE', warning: { tone: 'amber', text: daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` }, contract }
  }
  return { status: 'ACTIVE', warning: null, contract }
}
function DerivedStatusText({ unit }) {
  const derived = deriveUnitStatus(unit)
  if (derived.warning) {
    const cls = derived.warning.tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
    return <span className={cn('text-[11px] font-semibold', cls)}>{derived.warning.text}</span>
  }
  const config = DERIVED_STATUS_TEXT[derived.status]
  if (!config) return null
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
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
function OwnerAvatar({ name, email, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(email || name)
  const sizeClasses = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

function SummaryCards({ units }) {
  const stats = useMemo(() => {
    let active = 0, inactive = 0, forRenewal = 0
    for (const u of units) {
      const d = deriveUnitStatus(u).status
      if (d === 'ACTIVE') active++
      else if (d === 'FOR_RENEWAL') forRenewal++
      else inactive++
    }
    return { total: units.length, active, inactive, forRenewal }
  }, [units])

  const cards = [
    { label: 'Total Units', value: stats.total,      icon: CheckCircle2  },
    { label: 'Active',      value: stats.active,     icon: CheckCircle2  },
    { label: 'For Renewal', value: stats.forRenewal, icon: AlertTriangle },
    { label: 'Inactive',    value: stats.inactive,   icon: X             },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div key={card.label}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          style={BTN_RADIUS}
          className="bg-card border border-border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">{card.label}</span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

function DetailSection({ title, action, className, children }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</h4>
        {action}
      </div>
      <div style={BTN_RADIUS} className="bg-card border border-border shadow-sm overflow-hidden">{children}</div>
    </div>
  )
}

function EditableField({ label, value, type = 'text', options, onSave, actionHref, actionIcon: ActionIcon, actionTitle, auditTag }) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')
  useEffect(() => { setDraft(value ?? '') }, [value])

  const friendlyError = (err, attempted) => {
    const msg = err?.message || ''
    if (msg.includes('units_unit_code_key')) return `Unit code "${attempted}" is already used by another unit.`
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
            <SelectTrigger style={BTN_RADIUS} className="h-8 text-xs bg-background border-border flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } if (e.key === 'Escape') { e.preventDefault(); cancel(); e.target.blur() } }}
            onBlur={commit}
            placeholder={`Enter ${label.toLowerCase()}…`}
            style={BTN_RADIUS}
            className={cn('h-8 text-xs bg-background flex-1 transition-colors', !value && 'border-border', value && 'border-transparent hover:border-border')}
          />
        )}
        {status === 'saving' && <Loader2 size={11} className="flex-shrink-0 animate-spin text-primary" />}
        {status === 'saved' && <Check size={11} className="flex-shrink-0 text-emerald-500" />}
      </div>
      {actionHref && ActionIcon && value && (
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-primary" style={BTN_RADIUS} asChild>
          <a href={actionHref} title={actionTitle || 'Open'}><ActionIcon size={12} /></a>
        </Button>
      )}
    </div>
  )
}

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
    try { await onSave(next) } catch (e) { toast.error('Failed to save'); throw e } finally { setSaving(false) }
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
    } catch {}
  }
  const commitEdit = async (i) => {
    const nm = editDraft.trim()
    if (!nm) { setEditError('Listing name required'); return }
    try {
      await persist(listings.map((l, idx) => idx === i ? { ...l, name: nm } : l))
      setEditingIndex(null); setEditError('')
    } catch {}
  }
  const removeAt = async (i) => { try { await persist(listings.filter((_, idx) => idx !== i)) } catch {} }
  const dupes = findDuplicateChannels(listings)

  return (
    <div className="space-y-1.5">
      {listings.length === 0 && !drafting && <p className="text-xs text-muted-foreground italic py-1">No channels yet</p>}
      {listings.map((item, i) => {
        const isDupe = dupes.some((d) => d.toLowerCase() === item.channel.toLowerCase())
        return (
          <div key={`${item.channel}-${i}`} style={BTN_RADIUS} className={cn('flex items-center gap-2 px-2 py-1.5 bg-muted/50 group/ota', isDupe && 'ring-1 ring-red-400')}>
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[72px] flex-shrink-0 truncate">{item.channel}</span>
            {editingIndex === i ? (
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <Input value={editDraft} onChange={(e) => { setEditDraft(e.target.value); if (editError) setEditError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } if (e.key === 'Escape') { e.preventDefault(); setEditingIndex(null); setEditError('') } }}
                  onBlur={() => commitEdit(i)} autoFocus placeholder="Enter listing name…"
                  style={BTN_RADIUS}
                  className={cn('h-7 text-xs bg-background px-2 flex-1', editError && 'border-red-400')} />
                {editError && <span className="text-[10px] text-red-500 px-1">{editError}</span>}
              </div>
            ) : (
              <button type="button" onClick={() => { setEditingIndex(i); setEditDraft(item.name); setEditError('') }}
                className="text-xs text-left flex-1 min-w-0 truncate hover:text-primary transition-colors flex items-center gap-1">
                <span className={cn('truncate', !item.name && 'italic text-red-500')}>{item.name || 'Empty'}</span>
                <Pencil size={10} className="flex-shrink-0 text-muted-foreground/0 group-hover/ota:text-muted-foreground/60 transition-colors" />
              </button>
            )}
            <button type="button" onClick={() => removeAt(i)} style={BTN_RADIUS} className="p-1 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0">
              <Trash2 size={11} />
            </button>
          </div>
        )
      })}
      {drafting ? (
        <div style={BTN_RADIUS} className="flex flex-col gap-1 px-2 py-2 bg-muted/50 border border-primary/40">
          <div className="flex items-center gap-2">
            <Input value={draftChannel} onChange={(e) => { setDraftChannel(e.target.value); if (draftErrors.channel) setDraftErrors((p) => ({ ...p, channel: '' })) }}
              placeholder="Channel name" list="ota-channel-options" style={BTN_RADIUS} className={cn('h-8 text-xs flex-1', draftErrors.channel && 'border-red-400')} />
            <datalist id="ota-channel-options">{allChannelOptions.map((opt) => <option key={opt} value={opt} />)}</datalist>
            <Input value={draftName} onChange={(e) => { setDraftName(e.target.value); if (draftErrors.name) setDraftErrors((p) => ({ ...p, name: '' })) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setDrafting(false); setDraftChannel(''); setDraftName(''); setDraftErrors({ channel: '', name: '' }) } }}
              placeholder="Listing name" style={BTN_RADIUS} className={cn('h-8 text-xs flex-1', draftErrors.name && 'border-red-400')} />
            <Button size="icon" className="h-8 w-8 flex-shrink-0" style={BTN_RADIUS} onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            </Button>
            <button type="button" onClick={() => { setDrafting(false); setDraftChannel(''); setDraftName(''); setDraftErrors({ channel: '', name: '' }) }} style={BTN_RADIUS} className="p-1 hover:bg-muted text-muted-foreground">
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
        <button type="button" onClick={() => setDrafting(true)} style={BTN_RADIUS} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary py-1.5 px-2 transition-colors">
          <Plus size={11} /> Add Channel
        </button>
      )}
    </div>
  )
}

function WarningChip({ icon: Icon, label, count, active, onClick, children }) {
  return (
    <div className="relative">
      <button type="button" onClick={onClick}
        style={BTN_RADIUS}
        className={cn('inline-flex items-center gap-2 h-9 px-3.5 text-xs font-medium border transition-colors',
          active ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-muted')}>
        <Icon size={13} className={active ? 'opacity-90' : 'opacity-60'} />
        <span>{label}</span>
        <span className={cn('min-w-[20px] h-[18px] inline-flex items-center justify-center px-1.5 rounded-full text-[10px] font-semibold tabular-nums', active ? 'bg-background/20' : 'bg-muted')}>{count}</span>
      </button>
      {children}
    </div>
  )
}

function DropdownPanel({ title, subtitle, onClose, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
      style={BTN_RADIUS}
      className="absolute right-0 top-full mt-2 w-[420px] max-h-[520px] bg-popover border border-border z-50 overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} style={BTN_RADIUS} className="p-1 -m-1 hover:bg-muted text-muted-foreground"><X size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </motion.div>
  )
}

function WarningsStrip({ missingUnits, onSelectUnit }) {
  const [open, setOpen] = useState(null)
  const wrapRef = useRef(null)
  const safeMissing = Array.isArray(missingUnits) ? missingUnits : []

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(null) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const missingCount = safeMissing.length
  if (missingCount === 0) return null

  return (
    <div className="flex items-center gap-2" ref={wrapRef}>
      <WarningChip icon={AlertTriangle} label="Missing fields" count={missingCount} active={open === 'missing'} onClick={() => setOpen((v) => (v === 'missing' ? null : 'missing'))}>
        <AnimatePresence>
          {open === 'missing' && (
            <DropdownPanel title="Missing fields" subtitle={`${missingCount} unit${missingCount === 1 ? '' : 's'} with incomplete data`} onClose={() => setOpen(null)}>
              {safeMissing.map(({ unit, missing }) => (
                <button key={unit.id} type="button" onClick={() => { onSelectUnit(unit); setOpen(null) }}
                  className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/40 transition-colors group">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-mono text-xs font-semibold text-foreground">{unit.unit_code}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{unit.building}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{missing.total}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {missing.warnings.map((f) => (
                      <span key={f.key} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-600 text-white">{f.label}</span>
                    ))}
                  </div>
                </button>
              ))}
            </DropdownPanel>
          )}
        </AnimatePresence>
      </WarningChip>
    </div>
  )
}

function LogCallModal({ open, onClose, unit, onSaved }) {
  const [type, setType] = useState('call')
  const [outcome, setOutcome] = useState('positive')
  const [content, setContent] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setType('call'); setOutcome('positive'); setContent(''); setNextDate('') } }, [open])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || !unit) return null

  const handleSave = async () => {
    if (!content.trim()) { toast.error('Add a short note'); return }
    if (content.length > 2000) { toast.error('Note is too long (max 2000)'); return }
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
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 cursor-default"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-call-title"
        style={BTN_RADIUS}
        className="relative bg-card max-w-md w-full border border-border overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 id="log-call-title" className="text-sm font-bold text-foreground">Log Interaction</h3>
            <p className="text-xs text-muted-foreground">{unit.unit_code} · {unit.owner_name || 'No owner'}</p>
          </div>
          <button onClick={onClose} style={BTN_RADIUS} className="p-1 hover:bg-muted"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger style={BTN_RADIUS} className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Outcome</label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger style={BTN_RADIUS} className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{OUTCOME_OPTIONS.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Notes</label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3}
              placeholder="What was discussed?" style={BTN_RADIUS} className="text-xs resize-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Next Follow-up (optional)</label>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} placeholder="Select date" style={BTN_RADIUS} className="h-9 text-xs" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-9 text-xs" style={BTN_RADIUS} onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-9 text-xs" style={{ backgroundColor: BRAND, ...BTN_RADIUS }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <PhoneCall size={12} className="mr-1.5" />}
            {saving ? 'Saving...' : 'Save Interaction'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

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
    } catch (err) { console.error(err); toast.error('Failed to update') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    const preview = (record.content || '').slice(0, 80)
    const confirmed = window.confirm(
      `Delete this interaction?\n\nType: ${record.type}\nDate: ${formatDate(record.created_at)}\nNote: ${preview}${record.content?.length > 80 ? '…' : ''}\n\nThis cannot be undone.`
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      await deleteInteraction(record.id)
      logAudit('DELETE_UNIT_INTERACTION', 'unit_interactions', record.id, {
        unit_id: record.unit_id, type: record.type, outcome: record.outcome, content: record.content,
      }).catch(() => {})
      toast.success('Interaction deleted')
      onDeleted?.(record.id)
    } catch (err) { console.error(err); toast.error('Failed to delete') }
    finally { setDeleting(false) }
  }

  const outcomeClasses =
    record.outcome === 'positive' ? 'bg-emerald-600 text-white'
    : record.outcome === 'negative' ? 'bg-red-600 text-white'
    : record.outcome === 'no_answer' ? 'bg-gray-500 text-white'
    : 'bg-amber-600 text-white'

  if (editing) {
    return (
      <div style={BTN_RADIUS} className="px-3 py-2.5 border border-primary/40 bg-primary/5 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Select value={draft.type} onValueChange={(v) => setDraft((p) => ({ ...p, type: v }))}>
            <SelectTrigger style={BTN_RADIUS} className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={draft.outcome} onValueChange={(v) => setDraft((p) => ({ ...p, outcome: v }))}>
            <SelectTrigger style={BTN_RADIUS} className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{OUTCOME_OPTIONS.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={draft.next_follow_up_date} onChange={(e) => setDraft((p) => ({ ...p, next_follow_up_date: e.target.value }))} placeholder="Follow-up" style={BTN_RADIUS} className="h-8 text-xs" />
        </div>
        <Textarea value={draft.content} onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))} rows={2} style={BTN_RADIUS} className="text-xs resize-none" placeholder="What was discussed?" />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-8 text-[11px]" style={BTN_RADIUS} onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-8 text-[11px]" style={{ backgroundColor: BRAND, ...BTN_RADIUS }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={11} className="mr-1 animate-spin" /> : <Check size={11} className="mr-1" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={BTN_RADIUS} className="group flex items-start gap-2 px-3 py-2 border border-border bg-card hover:bg-muted/40 transition-colors">
      <div className="flex flex-col gap-1 pt-0.5 flex-shrink-0 w-[86px]">
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{record.type}</span>
        <span className={cn('inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold', outcomeClasses)}>{record.outcome}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground whitespace-pre-wrap break-words">{record.content}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground tabular-nums">{formatDate(record.created_at)}</span>
          {record.next_follow_up_date && (
            <span className="text-[10px] text-primary dark:text-blue-400 font-medium tabular-nums">
              Next follow-up: {formatDate(record.next_follow_up_date)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={() => setEditing(true)} style={BTN_RADIUS} className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit"><Pencil size={12} /></button>
        <button type="button" onClick={handleDelete} disabled={deleting} style={BTN_RADIUS} className="p-1.5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40" title="Delete">
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  )
}

function InteractionsSection({ unit, onLogCall, refreshKey = 0 }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('unit_interactions').select('*').eq('unit_id', unit.id).order('created_at', { ascending: false })
      if (error) throw error
      setItems(data || [])
    } catch (err) { console.error('Failed to load interactions:', err) }
    finally { setLoading(false) }
  }, [unit.id])

  useEffect(() => { load() }, [load, refreshKey])

  const handleUpdated = (updated) => setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  const handleDeleted = (id) => setItems((prev) => prev.filter((x) => x.id !== id))

  return (
    <DetailSection
      title={`Interactions${items.length > 0 ? ` · ${items.length}` : ''}`}
      action={
        <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 px-2" style={BTN_RADIUS} onClick={onLogCall}>
          <Plus size={10} /> Log
        </Button>
      }
    >
      <div className="p-2 space-y-1.5 max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">No interactions yet</div>
        ) : (
          items.map((rec) => (
            <InteractionRow key={rec.id} record={rec} onUpdated={handleUpdated} onDeleted={handleDeleted} />
          ))
        )}
      </div>
    </DetailSection>
  )
}

function ContractSection({ unit, contract, loading, onNavigateToContracts }) {
  if (loading) {
    return (
      <DetailSection title="Contract">
        <div className="p-3 space-y-1">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </DetailSection>
    )
  }

  if (!contract) {
    return (
      <DetailSection title="Contract">
        <div className="p-3 space-y-1">
          <span className="text-xs text-muted-foreground italic">No contract</span>
          <p className="text-[10px] text-muted-foreground pt-1">Create one in the Contracts page.</p>
          <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1.5 mt-2" style={BTN_RADIUS} onClick={onNavigateToContracts}>
            Open Contracts page
          </Button>
        </div>
      </DetailSection>
    )
  }

  const derived = deriveUnitStatus(unit)
  const statusLabel = derived.warning ? derived.warning.text : DERIVED_STATUS_TEXT[derived.status]?.label || '—'
  const statusClass = derived.warning
    ? (derived.warning.tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')
    : DERIVED_STATUS_TEXT[derived.status]?.className || 'text-gray-500 dark:text-gray-400'

  return (
    <DetailSection title="Contract">
      <div className="p-3 space-y-0.5">
        <div className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Code</span>
          <span className="text-xs font-mono text-foreground">{contract.contract_code || '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Status</span>
          <span className={cn('text-[10px] font-semibold', statusClass)}>{statusLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Effective</span>
          <span className="text-xs tabular-nums text-foreground">{contract.effective_date || '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Expiry</span>
          <span className="text-xs tabular-nums text-foreground">
            {contract.expiry_date || <span className="italic text-muted-foreground">Open-ended</span>}
          </span>
        </div>
        <p className="pt-2 mt-2 border-t border-border text-[10px] text-muted-foreground italic">
          Contract PDF opens from the Contracts page.
        </p>
        <div className="pt-2 mt-2 border-t border-border">
          <button type="button" onClick={onNavigateToContracts}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors">
            Edit in Contracts →
          </button>
        </div>
      </div>
    </DetailSection>
  )
}

function RegistryDetailPanel({
  unit, contract, contractLoading, onUnitChange, onClose,
  channelOptions, onLogCall, onDelete, interactionsRefreshKey,
}) {
  const navigate = useNavigate()

  const handleUnitField = async (field, value) => {
    await updateUnit(unit.id, { [field]: value })
    onUnitChange({ ...unit, [field]: value })
  }
  const handleOtaSave = async (otaListings) => {
    await updateUnit(unit.id, { ota_listings: otaListings })
    onUnitChange({ ...unit, ota_listings: otaListings })
    logAudit('UPDATE_UNIT_OTA', 'units', unit.id, { channels: otaListings.map((x) => x.channel) }).catch(() => {})
  }
  const goToContracts = () => navigate(`/admin?tab=contracts&unit=${unit.id}`)

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: PANEL_WIDTH, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ width: { duration: 0.32, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2 } }}
      className="h-full flex-shrink-0 p-3"
      style={{ maxWidth: '100%', width: PANEL_WIDTH + 24 }}
    >
      <div
        className="h-full border border-border overflow-hidden flex flex-col bg-background"
        style={{
          borderRadius: 6,
          boxShadow: '0 12px 32px -12px rgba(15,23,42,0.18), 0 4px 12px -4px rgba(15,23,42,0.08)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={unit.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }} className="h-full flex flex-col min-h-0">
            <div className="flex-shrink-0 px-5 py-4 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground truncate">{unit.unit_code}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{unit.building}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <DerivedStatusText unit={unit} />
                    {unit.unit_type && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground uppercase">
                        {unit.unit_type}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} style={BTN_RADIUS} className="p-1 hover:bg-muted text-muted-foreground flex-shrink-0"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5" style={BTN_RADIUS} onClick={onLogCall}>
                  <PhoneCall size={11} /> Log Interaction
                </Button>
                <Button variant="outline" size="sm"
                  className="h-8 text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                  style={BTN_RADIUS}
                  onClick={onDelete}>
                  <Trash2 size={11} /> Delete Unit
                </Button>
              </div>

              <DetailSection title="Unit">
                <div className="p-3 space-y-0.5">
                  <EditableField label="Code" value={unit.unit_code} onSave={(v) => handleUnitField('unit_code', v)} auditTag="unit_code" />
                  <EditableField label="Building" value={unit.building} onSave={(v) => handleUnitField('building', v)} auditTag="building" />
                  <EditableField label="Type" value={unit.unit_type} options={UNIT_TYPES} onSave={(v) => handleUnitField('unit_type', v)} auditTag="unit_type" />
                </div>
              </DetailSection>

              <DetailSection title="Owner">
                <div className="p-3 space-y-0.5">
                  <div className="flex items-center gap-2.5 mb-2 pb-2 border-b border-border">
                    <OwnerAvatar name={unit.owner_name} email={unit.owner_email} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{unit.owner_name || 'No owner'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{unit.owner_email || 'No email'}</p>
                    </div>
                  </div>
                  <EditableField label="Email" value={unit.owner_email} type="email" onSave={(v) => handleUnitField('owner_email', v)}
                    actionHref={unit.owner_email ? `mailto:${unit.owner_email}` : null} actionIcon={Mail} actionTitle="Send email" auditTag="owner_email" />
                  <EditableField label="Phone" value={unit.owner_phone} type="tel" onSave={(v) => handleUnitField('owner_phone', v)}
                    actionHref={unit.owner_phone ? `tel:${unit.owner_phone}` : null} actionIcon={Phone} actionTitle="Call" auditTag="owner_phone" />
                  <EditableField label="GC" value={unit.gc_status} options={GC_STATUS_OPTIONS} onSave={(v) => handleUnitField('gc_status', v)} auditTag="gc_status" />
                </div>
              </DetailSection>

              <ContractSection unit={unit} contract={contract} loading={contractLoading} onNavigateToContracts={goToContracts} />

              <DetailSection title="Marketing">
                <div className="p-3 space-y-0.5">
                  <EditableField label="Title" value={unit.marketing_title} onSave={(v) => handleUnitField('marketing_title', v)} auditTag="marketing_title" />
                  <EditableField label="Inventory" value={unit.inventory_list} onSave={(v) => handleUnitField('inventory_list', v)} auditTag="inventory_list" />
                </div>
              </DetailSection>

              <DetailSection title="OTA Channels">
                <div className="p-3 space-y-0.5">
                  <OtaEditor unit={unit} onSave={handleOtaSave} channelOptions={channelOptions} />
                </div>
              </DetailSection>

              <InteractionsSection unit={unit} onLogCall={onLogCall} refreshKey={interactionsRefreshKey} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function AddUnitModal({ open, onClose, onCreated, existingBuildings = [], channelOptions = [] }) {
  const [form, setForm] = useState({
    unit_code: '', building: '', unit_type: 'Studio',
    owner_name: '', owner_email: '', owner_phone: '', gc_status: 'FIXED',
    marketing_title: '', inventory_list: '',
  })
  const [ownerProfile, setOwnerProfile] = useState(null)
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
        unit_code: '', building: '', unit_type: 'Studio',
        owner_name: '', owner_email: '', owner_phone: '', gc_status: 'FIXED',
        marketing_title: '', inventory_list: '',
      })
      setOwnerProfile(null)
      setOtaListings([]); setBuildingSuggestions([]); setDrafting(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

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

    const ownerEmailRaw = form.owner_email.trim()
    const ownerEmailClean = ownerEmailRaw ? sanitizeEmail(ownerEmailRaw) : null
    if (ownerEmailRaw && !ownerEmailClean) { toast.error('Owner email is not valid'); return }

    if (ownerEmailClean && !ownerProfile) {
      toast.error('Owner must be a registered user. Ask them to log in first.')
      return
    }

    setSaving(true)
    try {
      let ownerId = null
      if (ownerEmailClean || form.owner_name.trim()) {
        const email = ownerEmailClean
        if (email) {
          const { data: existing } = await supabase.from('owners').select('id').eq('email', email).maybeSingle()
          if (existing?.id) ownerId = existing.id
        }
        if (!ownerId) {
          const created = await createOwner({
            name: form.owner_name.trim() || null,
            email,
            phone: form.owner_phone.trim() || null,
            user_id: ownerProfile?.id || null,
          })
          ownerId = created.id
        }
      }
      const unit = await createUnit({
        unit_code: form.unit_code.trim(), building: form.building.trim(),
        unit_type: form.unit_type || null, status: 'INACTIVE',
        gc_status: form.gc_status || null,
        marketing_title: form.marketing_title.trim() || null,
        inventory_list: form.inventory_list.trim() || null,
        owner_id: ownerId, ota_listings: otaListings,
      })
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
  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block'
  const inputClass = 'h-9 text-xs'

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 cursor-default"
      />
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-unit-title"
        style={BTN_RADIUS}
        className="relative bg-card max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 id="add-unit-title" className="text-sm font-bold text-foreground">Add New Unit</h2>
          <button onClick={onClose} style={BTN_RADIUS} className="p-1 hover:bg-muted transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Unit</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelClass}>Unit Code *</label>
                <Input value={form.unit_code} onChange={(e) => setField('unit_code', e.target.value)} placeholder="e.g., P S1 503" style={BTN_RADIUS} className={inputClass} autoFocus /></div>
              <div className="relative"><label className={labelClass}>Building *</label>
                <Input value={form.building} onChange={(e) => setField('building', e.target.value)}
                  onFocus={() => setBuildingFocus(true)} onBlur={() => setTimeout(() => setBuildingFocus(false), 150)}
                  placeholder="Type to search or add new" style={BTN_RADIUS} className={inputClass} />
                {buildingFocus && buildingSuggestions.length > 0 && (
                  <div style={BTN_RADIUS} className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border z-10 max-h-44 overflow-y-auto">
                    {buildingSuggestions.map((b) => (
                      <button key={b} type="button" onMouseDown={(e) => { e.preventDefault(); setField('building', b); setBuildingFocus(false) }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors">{b}</button>
                    ))}
                  </div>
                )}
              </div>
              <div><label className={labelClass}>Unit Type</label>
                <Select value={form.unit_type} onValueChange={(v) => setField('unit_type', v)}>
                  <SelectTrigger style={BTN_RADIUS} className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIT_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><label className={labelClass}>GC Status</label>
                <Select value={form.gc_status} onValueChange={(v) => setField('gc_status', v)}>
                  <SelectTrigger style={BTN_RADIUS} className={inputClass}><SelectValue /></SelectTrigger>
                  <SelectContent>{GC_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Owner</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className={labelClass}>Owner (registered user)</label>
                <ProfileEmailCombobox
                  value={form.owner_email}
                  onChange={(v) => setField('owner_email', v)}
                  verifiedProfile={ownerProfile}
                  onVerifiedChange={(profile) => {
                    setOwnerProfile(profile)
                    if (profile) {
                      setForm((p) => ({
                        ...p,
                        owner_name: profile.full_name || p.owner_name || '',
                      }))
                    }
                  }}
                  placeholder="Start typing an email…"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Must be a registered Iloilo Rentals user. They log in with Google first.
                </p>
              </div>
              <div><label className={labelClass}>Name</label>
                <Input value={form.owner_name} onChange={(e) => setField('owner_name', e.target.value)}
                  placeholder="Full name" style={BTN_RADIUS} className={inputClass} readOnly={!!ownerProfile} /></div>
              <div><label className={labelClass}>Phone</label>
                <Input type="tel" value={form.owner_phone} onChange={(e) => setField('owner_phone', e.target.value)}
                  placeholder="+63 9XX XXX XXXX" style={BTN_RADIUS} className={inputClass} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">Marketing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={labelClass}>Marketing Title</label><Input value={form.marketing_title} onChange={(e) => setField('marketing_title', e.target.value)} placeholder="Public listing title" style={BTN_RADIUS} className={inputClass} /></div>
              <div><label className={labelClass}>Inventory List</label><Input value={form.inventory_list} onChange={(e) => setField('inventory_list', e.target.value)} placeholder="Furniture, appliances…" style={BTN_RADIUS} className={inputClass} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 pb-1.5 border-b border-border">OTA Channels</h3>
            <div className="space-y-1.5">
              {otaListings.length === 0 && !drafting && <p className="text-xs text-muted-foreground italic">No channels added yet</p>}
              {otaListings.map((item, i) => (
                <div key={`${item.channel}-${i}`} style={BTN_RADIUS} className="flex items-center gap-2 px-2 py-1.5 bg-muted/50">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground min-w-[72px] flex-shrink-0">{item.channel}</span>
                  <span className="text-xs flex-1 min-w-0 truncate">{item.name}</span>
                  <button type="button" onClick={() => setOtaListings(otaListings.filter((_, x) => x !== i))}
                    style={BTN_RADIUS} className="p-1 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 size={11} /></button>
                </div>
              ))}
              {drafting ? (
                <div style={BTN_RADIUS} className="flex items-center gap-2 px-2 py-2 bg-muted/50 border border-primary/40">
                  <Input value={draftChannel} onChange={(e) => setDraftChannel(e.target.value)} placeholder="Channel name" list="ota-channel-options-add" style={BTN_RADIUS} className="h-8 text-xs flex-1" />
                  <datalist id="ota-channel-options-add">{allChannelOptions.map((opt) => <option key={opt} value={opt} />)}</datalist>
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addChannel(); if (e.key === 'Escape') { setDrafting(false); setDraftChannel(''); setDraftName('') } }}
                    placeholder="Listing name" style={BTN_RADIUS} className="h-8 text-xs flex-1" />
                  <Button size="icon" className="h-8 w-8 flex-shrink-0" style={BTN_RADIUS} onClick={addChannel}><Check size={11} /></Button>
                  <button type="button" onClick={() => { setDrafting(false); setDraftChannel(''); setDraftName('') }} style={BTN_RADIUS} className="p-1 hover:bg-muted text-muted-foreground"><X size={12} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setDrafting(true)} style={BTN_RADIUS} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary py-1.5 px-2 transition-colors">
                  <Plus size={11} /> Add Channel
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-9 text-xs" style={BTN_RADIUS} onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-9 text-xs" style={{ backgroundColor: BRAND, ...BTN_RADIUS }} onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
            {saving ? 'Creating...' : 'Create Unit'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function UnitListRow({ unit, selected, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.10)' : 'rgba(45, 86, 142, 0)' }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.14)' : 'rgba(45, 86, 142, 0.05)' }}
      whileTap={{ scale: 0.998 }}
      className={cn('group/row w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
    >
      <span className="text-sm font-semibold text-foreground truncate">{unit.building || '—'}</span>
      <span className="font-mono text-sm font-bold text-foreground truncate">{unit.unit_code || '—'}</span>
      <span className="text-xs text-muted-foreground truncate">{unit.owner_name || '—'}</span>
      <div className="flex items-center gap-2 justify-end flex-shrink-0">
        <DerivedStatusText unit={unit} />
      </div>
    </motion.button>
  )
}

export default function RegistryPage() {
  const [allUnits, setAllUnits] = useState([])
  const [owners, setOwners] = useState([])
  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [addUnitOpen, setAddUnitOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [channelOptions, setChannelOptions] = useState([])
  const [selectedContract, setSelectedContract] = useState(null)
  const [selectedContractLoading, setSelectedContractLoading] = useState(false)
  const [logCallUnit, setLogCallUnit] = useState(null)
  const [interactionsRefreshKey, setInteractionsRefreshKey] = useState(0)

  const headerRef = useRef(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchChannelOptions = useCallback(async () => {
    const { data } = await supabase.from('ota_channel_names').select('name').order('name')
    if (data) setChannelOptions(data.map((d) => d.name))
  }, [])

  const fetchUnits = useCallback(async (signal) => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const [unitsData, contractsRes, ownersRes] = await Promise.all([
        listUnits({}),
        supabase.from('contracts').select('*'),
        supabase.from('owners').select('id, name').order('name'),
      ])
      if (signal?.aborted) return
      if (contractsRes.error) throw contractsRes.error
      if (ownersRes.error) throw ownersRes.error
      const byUnit = new Map()
      for (const c of (contractsRes.data || [])) byUnit.set(c.unit_id, c)
      const enriched = unitsData.map((u) => ({ ...u, contract: byUnit.get(u.id) || null }))
      setAllUnits(enriched)
      setOwners(ownersRes.data || [])
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load units:', err)
      toast.error('Failed to load units')
    } finally {
      if (!signal?.aborted) {
        setIsFirstLoad(false); setIsRefreshing(false); hasLoadedOnce.current = true
      }
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchUnits(ac.signal)
    fetchChannelOptions()
    return () => ac.abort()
  }, [fetchUnits, fetchChannelOptions])

  useEffect(() => {
    const channels = [
      supabase.channel('registry-units').on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, () => fetchUnits()).subscribe(),
      supabase.channel('registry-owners').on('postgres_changes', { event: '*', schema: 'public', table: 'owners' }, () => fetchUnits()).subscribe(),
      supabase.channel('registry-contracts').on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchUnits()).subscribe(),
    ]
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  }, [fetchUnits])

  const buildings = useMemo(() => {
    const set = new Set()
    allUnits.forEach((u) => { if (u.building) set.add(u.building) })
    return [...set].sort()
  }, [allUnits])

  const counts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const scoped = tokens.length === 0
      ? allUnits
      : allUnits.filter((u) => {
          const haystack = [u.unit_code, u.owner_name, u.owner_email, u.owner_phone, u.building, u.marketing_title, u.unit_type, u.gc_status]
            .filter(Boolean).join(' ').toLowerCase()
          return tokens.every((tok) => haystack.includes(tok))
        })
    const c = { all: scoped.length, ACTIVE: 0, FOR_RENEWAL: 0, INACTIVE: 0 }
    for (const u of scoped) {
      const d = deriveUnitStatus(u).status
      if (c[d] !== undefined) c[d]++
    }
    return c
  }, [allUnits, debouncedSearch])

  const filteredUnits = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    return allUnits.filter((u) => {
      const derived = deriveUnitStatus(u)
      if (statusFilter !== 'all' && derived.status !== statusFilter) return false

      if (dateFrom || dateTo) {
        const exp = u.contract?.expiry_date || null
        if (!exp) return false
        if (dateFrom && exp < dateFrom) return false
        if (dateTo && exp > dateTo) return false
      }

      if (tokens.length > 0) {
        const haystack = [u.unit_code, u.owner_name, u.owner_email, u.owner_phone, u.building, u.marketing_title, u.unit_type, u.gc_status]
          .filter(Boolean).join(' ').toLowerCase()
        if (!tokens.every((tok) => haystack.includes(tok))) return false
      }
      return true
    })
  }, [allUnits, statusFilter, debouncedSearch, dateFrom, dateTo])

  const sorted = useMemo(() => {
    const copy = [...filteredUnits]
    copy.sort((a, b) => {
      const av = a.unit_code ?? ''
      const bv = b.unit_code ?? ''
      if (av < bv) return -1
      if (av > bv) return 1
      return 0
    })
    return copy
  }, [filteredUnits])

  const selected = useMemo(() => sorted.find((u) => u.id === selectedId) || null, [sorted, selectedId])

  useEffect(() => {
    if (!selected) {
      setSelectedContract(null)
      setSelectedContractLoading(false)
      return
    }
    setSelectedContract(selected.contract || null)
    setSelectedContractLoading(false)
  }, [selected?.id])

  const handleUnitUpdate = (updatedUnit) => {
    setAllUnits((prev) =>
      prev.map((u) => u.id === updatedUnit.id ? { ...updatedUnit, contract: u.contract } : u)
    )
  }

  const handleDeleteUnit = async (unit) => {
    const confirmed = window.confirm(
      `Delete unit "${unit.unit_code}"?\n\nBuilding: ${unit.building || '—'}\nOwner: ${unit.owner_name || '—'}\n\nThis will also delete its contract and interactions. This cannot be undone.`
    )
    if (!confirmed) return
    try {
      await deleteUnit(unit.id)
      logAudit('DELETE_UNIT', 'units', unit.id, { unit_code: unit.unit_code, building: unit.building }).catch(() => {})
      toast.success('Unit deleted')
      setSelectedId(null)
      fetchUnits()
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete unit')
    }
  }

  const handleSelectUnit = (unit) => {
    setSelectedId((prev) => (prev === unit.id ? null : unit.id))
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-3">

          <div className="flex-shrink-0 pt-1 pb-2">
            <SummaryCards units={allUnits} />
          </div>

          <div ref={headerRef} className="flex-shrink-0 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search unit, owner, email, phone, building..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={BTN_RADIUS}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Button size="sm" className="h-9 text-xs text-white transition-all duration-150 active:scale-[0.98]" style={{ backgroundColor: BRAND, ...BTN_RADIUS }} onClick={() => setAddUnitOpen(true)}>
              <Plus size={13} />
              <span className="hidden sm:inline ml-1">Add Unit</span>
            </Button>
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFromChange={setDateFrom} onToChange={setDateTo}
              onClear={() => { setDateFrom(''); setDateTo('') }}
            />
            <Button variant="outline" size="sm" onClick={fetchUnits} disabled={isRefreshing} className="h-9 transition-all duration-150" style={BTN_RADIUS} title="Refresh">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
          </div>

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <PillBar tabs={STATUS_PILLS} active={statusFilter} onChange={setStatusFilter} counts={counts} />
          </div>

          <div style={BTN_RADIUS} className="flex-1 min-h-0 border border-border shadow-sm overflow-hidden bg-card">
            <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className={cn('sticky top-0 z-10 px-4 py-2.5 border-b border-border bg-card', ROW_GRID)}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Building</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Unit</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Owner</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground text-right truncate">Status</span>
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-3">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : sorted.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <p className="text-sm text-muted-foreground font-semibold">No units match your filters</p>
                    <p className="text-xs text-muted-foreground mt-1">Try clearing filters or adding a new unit</p>
                  </div>
                </div>
              ) : (
                sorted.map((unit) => (
                  <UnitListRow
                    key={unit.id}
                    unit={unit}
                    selected={selectedId === unit.id}
                    onClick={() => handleSelectUnit(unit)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <RegistryDetailPanel
            unit={selected}
            contract={selectedContract}
            contractLoading={selectedContractLoading}
            onUnitChange={handleUnitUpdate}
            onClose={() => setSelectedId(null)}
            channelOptions={channelOptions}
            onLogCall={() => setLogCallUnit(selected)}
            onDelete={() => handleDeleteUnit(selected)}
            interactionsRefreshKey={interactionsRefreshKey}
          />
        )}
      </AnimatePresence>

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