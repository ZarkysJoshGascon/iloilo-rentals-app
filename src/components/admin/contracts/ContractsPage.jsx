import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2,
  FileText, Calendar,
  AlertTriangle, Download, ExternalLink, User,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
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
import {
  cn,
  sanitizeText,
  sanitizeDateOnly,
} from '@/lib/utils'

const BRAND = '#2d568e'

// ============================================================
// STATUS DERIVATION
// ============================================================
const STATUS_CONFIG = {
  active:     { label: 'Active',     className: 'bg-emerald-600 text-white border-0' },
  expiring:   { label: 'Expiring',   className: 'bg-amber-600 text-white border-0' },
  expired:    { label: 'Expired',    className: 'bg-red-600 text-white border-0' },
  incomplete: { label: 'Incomplete', className: 'bg-gray-400 text-white border-0' },
}

const EXPIRING_SOON_DAYS = 60

function deriveContractStatus(contract) {
  if (!contract) return 'incomplete'

  const eff = contract.effective_date ? new Date(contract.effective_date + 'T00:00:00Z') : null
  const exp = contract.expiry_date ? new Date(contract.expiry_date + 'T00:00:00Z') : null
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  if (!eff && !exp) return 'incomplete'
  if (eff && !exp) return 'active'
  if (eff && exp) {
    if (exp < today) return 'expired'
    const daysLeft = Math.round((exp - today) / 86400000)
    return daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'active'
  }
  return exp < today ? 'expired' : 'active'
}

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00Z')
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function StatusBadge({ contract }) {
  const status = deriveContractStatus(contract)
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.incomplete
  return (
    <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', config.className)}>
      {config.label}
    </Badge>
  )
}

// Grid: Contract | Unit | Effective | Expiry | Status
const ROW_GRID = 'grid grid-cols-[1.3fr_1.5fr_1fr_1fr_140px] gap-4 items-center'
const PANEL_WIDTH = 480

// ============================================================
// SUMMARY CARDS
// ============================================================
function SummaryCards({ contracts }) {
  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0
    for (const c of contracts) {
      const s = deriveContractStatus(c)
      if (s === 'active') active++
      else if (s === 'expiring') expiring++
      else if (s === 'expired') expired++
    }
    return { total: contracts.length, active, expiring, expired }
  }, [contracts])

  const cards = [
    { label: 'Total Contracts', value: stats.total,    icon: FileText },
    { label: 'Active',          value: stats.active,   icon: Check },
    { label: 'Expiring Soon',   value: stats.expiring, icon: AlertTriangle },
    { label: 'Expired',         value: stats.expired,  icon: X },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
// STATUS PILLS
// ============================================================
const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'expired', label: 'Expired' },
]

const PILL_TEXT_ACTIVE = {
  all: 'text-foreground',
  active: 'text-emerald-700 dark:text-emerald-400',
  expiring: 'text-amber-700 dark:text-amber-400',
  expired: 'text-red-700 dark:text-red-400',
}

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
        className="absolute top-1 bottom-1 rounded-full shadow-sm z-0 bg-card border border-border"
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
              isActive ? (PILL_TEXT_ACTIVE[tab.id] || 'text-foreground') : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className={cn('ml-1', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================
// FILTER PANEL
// ============================================================
function FilterPanel({
  open, onClose, building, setBuilding,
  ownerId, setOwnerId, buildings, owners, activeCount, onClear,
}) {
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
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Owner</p>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All owners" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All owners</SelectItem>
                  {owners.map((o) => <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>)}
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
// CONTRACT ROW — chevron removed
// ============================================================
function ContractRow({ contract, selected, onClick }) {
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
      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">
          {contract.contract_code || '—'}
        </span>
        <span className="text-[10px] text-muted-foreground truncate block">
          {contract.owners?.name || 'No owner'}
        </span>
      </div>

      <div className="min-w-0">
        <span className="font-mono text-xs font-bold text-foreground truncate block">
          {contract.units?.unit_code || '—'}
        </span>
        <span className="text-[10px] text-muted-foreground truncate block">
          {contract.units?.building || '—'}
        </span>
      </div>

      <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
        <div className="truncate">{formatDate(contract.effective_date)}</div>
      </div>

      <div className="text-[11px] tabular-nums text-muted-foreground min-w-0">
        <div className="truncate">{formatDate(contract.expiry_date)}</div>
      </div>

      <div className="flex items-center justify-end flex-shrink-0">
        <StatusBadge contract={contract} />
      </div>
    </motion.button>
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
function EditableField({ label, value, type = 'text', options, onSave, auditTag, maxLength = 500, sanitizer }) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = async () => {
    if (draft === (value ?? '')) return
    setStatus('saving')
    try {
      const cleaned = sanitizer ? sanitizer(draft) : (draft === '' ? null : String(draft).slice(0, maxLength))
      const next = cleaned === '' ? null : cleaned
      await onSave(next)
      setStatus('saved')
      if (auditTag) {
        logAudit(`UPDATE_CONTRACT_FIELD:${auditTag}`, 'contracts', null, { field: auditTag, from: value, to: next }).catch(() => {})
      }
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
        {options ? (
          <Select
            value={draft || ''}
            onValueChange={async (v) => {
              setDraft(v)
              setStatus('saving')
              try {
                await onSave(v)
                setStatus('saved')
                if (auditTag) {
                  logAudit(`UPDATE_CONTRACT_FIELD:${auditTag}`, 'contracts', null, { field: auditTag, from: value, to: v }).catch(() => {})
                }
                setTimeout(() => setStatus('idle'), 1200)
              } catch (err) {
                toast.error(err?.message || 'Save failed')
                setStatus('idle')
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs rounded bg-background border-border flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
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
            maxLength={maxLength}
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
    </div>
  )
}

// ============================================================
// CONTRACT DETAIL PANEL
// ============================================================
function ContractDetailPanel({ contract, onClose, onChanged, onDelete }) {
  const status = deriveContractStatus(contract)
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.incomplete

  const updateField = async (field, value) => {
    const { error } = await supabase.from('contracts').update({ [field]: value }).eq('id', contract.id)
    if (error) throw error
    logAudit(`UPDATE_CONTRACT_FIELD:${field}`, 'contracts', contract.id, { field, from: contract[field], to: value }).catch(() => {})
    onChanged()
  }

  const unit = contract.units
  const owner = contract.owners

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: PANEL_WIDTH, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ width: { duration: 0.32, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2, ease: 'easeOut' } }}
      className="bg-card border-l border-border h-full overflow-hidden flex-shrink-0"
      style={{ maxWidth: '100%' }}
    >
      <div className="flex flex-col h-full" style={{ width: PANEL_WIDTH }}>
        <div className="flex-shrink-0 px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-foreground font-mono truncate">{contract.contract_code || '—'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {unit?.unit_code || '—'} · {unit?.building || '—'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5', statusConfig.className)}>
                  {statusConfig.label}
                </Badge>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <SectionCard title="Owner" icon={User}>
            <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-border">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
                <User size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{owner?.name || '—'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{owner?.email || 'No email'}</p>
              </div>
            </div>
            {owner?.phone && (
              <div className="flex items-center gap-2 py-0.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Phone</span>
                <span className="text-xs text-foreground">{owner.phone}</span>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Unit" icon={FileText}>
            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Code</span>
              <span className="text-xs font-mono text-foreground">{unit?.unit_code || '—'}</span>
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">Building</span>
              <span className="text-xs text-foreground">{unit?.building || '—'}</span>
            </div>
          </SectionCard>

          <SectionCard title="Contract Terms" icon={Calendar}>
            <EditableField
              label="Effective"
              value={contract.effective_date}
              type="date"
              onSave={(v) => updateField('effective_date', v)}
              auditTag="effective_date"
            />
            <EditableField
              label="Expiry"
              value={contract.expiry_date}
              type="date"
              onSave={(v) => updateField('expiry_date', v)}
              auditTag="expiry_date"
            />
            <EditableField
              label="PDF"
              value={contract.contract_pdf_url}
              onSave={(v) => updateField('contract_pdf_url', v)}
              auditTag="contract_pdf_url"
              maxLength={500}
            />
            {contract.contract_pdf_url && (
              <div className="pt-2 mt-2 border-t border-border">
                <a
                  href={contract.contract_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <ExternalLink size={11} />
                  Open contract PDF
                </a>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Notes" icon={FileText}>
            <Textarea
              key={contract.id}
              defaultValue={contract.notes || ''}
              maxLength={2000}
              onBlur={async (e) => {
                const cleaned = sanitizeText(e.target.value, { max: 2000, allowNewlines: true })
                if (cleaned === (contract.notes || null)) return
                try {
                  await updateField('notes', cleaned)
                  toast.success('Notes saved')
                } catch {
                  toast.error('Failed to save')
                }
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
              <Trash2 size={12} /> Delete Contract
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filterUnitId = searchParams.get('unit')

  const [contracts, setContracts] = useState([])
  const [units, setUnits] = useState([])
  const [owners, setOwners] = useState([])

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [building, setBuilding] = useState('all')
  const [ownerId, setOwnerId] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsFirstLoad(true)
    else setIsRefreshing(true)
    try {
      const [cRes, uRes, oRes] = await Promise.all([
        supabase
          .from('contracts')
          .select(`
            *,
            units:unit_id ( id, unit_code, building ),
            owners:owner_id ( id, name, email, phone )
          `)
          .order('effective_date', { ascending: false, nullsFirst: false }),
        supabase.from('units').select('id, unit_code, building, owner_id, current_contract_id').order('unit_code'),
        supabase.from('owners').select('id, name, email, phone').order('name'),
      ])
      if (cRes.error) throw cRes.error
      if (uRes.error) throw uRes.error
      if (oRes.error) throw oRes.error
      setContracts(cRes.data || [])
      setUnits(uRes.data || [])
      setOwners(oRes.data || [])
    } catch (err) {
      console.error('Failed to load contracts:', err)
      toast.error('Failed to load contracts')
    } finally {
      setIsFirstLoad(false)
      setIsRefreshing(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const ch = supabase
      .channel(`contracts-realtime-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const buildings = useMemo(() => {
    const set = new Set()
    for (const c of contracts) { if (c.units?.building) set.add(c.units.building) }
    return [...set].sort()
  }, [contracts])

  const counts = useMemo(() => {
    const c = { all: contracts.length, active: 0, expiring: 0, expired: 0 }
    for (const x of contracts) {
      const s = deriveContractStatus(x)
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [contracts])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (building !== 'all') n++
    if (ownerId !== 'all') n++
    if (filterUnitId) n++
    return n
  }, [building, ownerId, filterUnitId])

  const clearFilters = () => {
    setBuilding('all')
    setOwnerId('all')
    const next = new URLSearchParams(searchParams)
    next.delete('unit')
    setSearchParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return contracts.filter((c) => {
      if (filterUnitId && c.unit_id !== filterUnitId) return false
      const status = deriveContractStatus(c)
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (building !== 'all' && c.units?.building !== building) return false
      if (ownerId !== 'all' && c.owner_id !== ownerId) return false
      if (q) {
        const haystack = [
          c.contract_code,
          c.units?.unit_code, c.units?.building,
          c.owners?.name, c.owners?.email,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [contracts, filterUnitId, statusFilter, building, ownerId, debouncedSearch])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a.effective_date ?? ''
      const bv = b.effective_date ?? ''
      if (av > bv) return -1
      if (av < bv) return 1
      return 0
    })
    return copy
  }, [filtered])

  const selected = useMemo(() => sorted.find((c) => c.id === selectedId) || null, [sorted, selectedId])

  const handleSelect = (contract) => setSelectedId((prev) => (prev === contract.id ? null : contract.id))

  const handleDelete = async (contract) => {
    const confirmed = window.confirm(
      `Delete this contract?\n\nCode: ${contract.contract_code || '—'}\nUnit: ${contract.units?.unit_code || '—'}\nEffective: ${formatDate(contract.effective_date)}\nExpiry: ${formatDate(contract.expiry_date)}\n\nThis cannot be undone.`
    )
    if (!confirmed) return

    try {
      const { error } = await supabase.from('contracts').delete().eq('id', contract.id)
      if (error) throw error
      logAudit('DELETE_CONTRACT', 'contracts', contract.id, { contract_code: contract.contract_code, unit_id: contract.unit_id }).catch(() => {})
      toast.success('Contract deleted')
      setSelectedId(null)
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to delete')
    }
  }

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('Nothing to export'); return }
    const headers = ['Code', 'Unit', 'Building', 'Owner', 'Owner Email', 'Effective', 'Expiry', 'Status', 'PDF URL']
    const rows = filtered.map((c) => [
      c.contract_code || '',
      c.units?.unit_code || '',
      c.units?.building || '',
      c.owners?.name || '',
      c.owners?.email || '',
      c.effective_date || '',
      c.expiry_date || '',
      STATUS_CONFIG[deriveContractStatus(c)]?.label || '',
      c.contract_pdf_url || '',
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contracts_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card border border-border rounded-md">
        <div className="p-3 flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="flex-shrink-0">
            <SummaryCards contracts={contracts} />
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contract code, unit, owner, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs rounded"
              />
            </div>
            <div className="relative">
              <Button
                variant={activeFilterCount > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-8 rounded text-xs transition-all duration-150"
                onClick={() => setFilterOpen((v) => !v)}
              >
                <FileText size={13} />
                <span className="hidden sm:inline ml-1">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">{activeFilterCount}</span>
                )}
              </Button>
              <FilterPanel
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                building={building}
                setBuilding={setBuilding}
                ownerId={ownerId}
                setOwnerId={setOwnerId}
                buildings={buildings}
                owners={owners}
                activeCount={activeFilterCount}
                onClear={clearFilters}
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-8 rounded transition-all duration-150">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 rounded transition-all duration-150">
              <Download size={13} />
            </Button>
          </div>

          {filterUnitId && (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded bg-muted/40 border border-border">
              <span className="text-[11px] text-muted-foreground">
                Showing contracts for unit:
              </span>
              <span className="text-[11px] font-mono font-semibold text-foreground">
                {units.find((u) => u.id === filterUnitId)?.unit_code || filterUnitId}
              </span>
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.delete('unit')
                  setSearchParams(next, { replace: true })
                }}
                className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X size={11} />
              </button>
            </div>
          )}

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <StatusPills statusFilter={statusFilter} onStatusFilter={setStatusFilter} counts={counts} />
          </div>

          <div className="flex-1 min-h-0 rounded border border-border overflow-hidden">
            <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className={cn('sticky top-0 z-10 px-4 py-2 border-b border-border bg-card', ROW_GRID)}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Contract</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Unit</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Effective</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">Expiry</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right truncate">Status</span>
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-3">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : sorted.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <FileText size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-semibold">No contracts match your filters</p>
                    <p className="text-xs text-muted-foreground mt-1">Try clearing filters</p>
                  </div>
                </div>
              ) : (
                sorted.map((contract) => (
                  <ContractRow
                    key={contract.id}
                    contract={contract}
                    selected={selectedId === contract.id}
                    onClick={() => handleSelect(contract)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <ContractDetailPanel
            key={selected.id}
            contract={selected}
            onClose={() => setSelectedId(null)}
            onChanged={fetchData}
            onDelete={() => handleDelete(selected)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}