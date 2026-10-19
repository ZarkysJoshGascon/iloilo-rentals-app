// src/admin/contracts/ContractsPage.tsx
//
// Owner is REQUIRED to create a contract. Units without an owner
// do not appear in the New Contract modal's unit dropdown.
// A unit's first contract is made here; after that it continues by:
//   - Extend: while the contract is running (active or nearing its end),
//     push its end date out. Same contract, nothing else recorded.
//   - Renew: once it has ended ("For renewal") and the owner agrees, create
//     the next term as a new contract linked through superseded_by.
// Terms on a unit never overlap, so Accounting never counts a month twice.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, RefreshCw, X, Check, Loader2, Trash2,
  FileText, Calendar, ExternalLink, User,
  Upload, Eye, ChevronLeft, ChevronRight, Download,
  CheckCircle2, Clock, AlertTriangle, SlidersHorizontal,
  CalendarPlus, RotateCcw, Info, ArrowRight, History, Copy, TrendingUp,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/api/auditLog'
import { cn, sanitizeText, generateContractCode } from '@/lib/utils'
import {
  deriveContractStatus, CONTRACT_STATUS_TEXT, EXPIRING_SOON_DAYS,
  canExtendContract, canRenewContract, contractTerms, dayAfterISO, termEndISO,
} from '@/lib/domain/contracts'
import { StatStrip, StatTile } from '@/components/crm/StatStrip'
import { InitialsAvatar } from '@/components/crm/Panel'
import { StatementActions } from './StatementActions'
import { SortHeader, nextSort, ResultsBar, SearchKeyHint, useListShortcuts, CARD_ON_PHONE, MobileSort, PHONE_LABEL, useSidePanelMotion, useListCap } from '@/components/crm/listTools'
import { StatusTabs } from '@/components/crm/StatusTabs'
import type { ReactNode } from 'react'
import { Code } from '@/components/common/Code'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { crmLink } from '@/lib/domain/crmLinks'
import { cleanFields } from '@/lib/domain/clean'
import { DatePicker } from '@/components/crm/DatePicker'
import { useRevealOnOpen } from '@/components/crm/useRevealOnOpen'
import { preparePhoto, DOCUMENT_PHOTO } from '@/lib/images'

const BRAND = 'var(--brand-solid)'

const PDF_BUCKET = 'contract-pdfs'
const PDF_MAX_BYTES = 15 * 1024 * 1024
const PDF_ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa']

// ── date helpers ────────────────────────────────────────────
function todayISO() {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function diffDaysISO(a, b) {
  const da = new Date(`${a}T00:00:00Z`)
  const db = new Date(`${b}T00:00:00Z`)
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}
function formatISOReadable(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// ── pdf helpers ─────────────────────────────────────────────
function pdfBytesLabel(b) {
  if (!b) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function pdfRandomId() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12)
}

// What to store for a contract document: a PDF as it is (up to the size
// limit), a photo of the paper as a sharp JPEG (phone photos are often over
// the limit before they're shrunk).
async function contractFileBody(file) {
  const mime = await pdfSniffMime(file)
  if (!mime || !PDF_ALLOWED_MIMES.has(mime)) throw new Error('Unsupported file. Use PDF, JPEG, PNG, or WebP.')
  if (mime !== 'application/pdf') {
    return { body: await preparePhoto(file, DOCUMENT_PHOTO), contentType: 'image/jpeg', ext: 'jpg' }
  }
  if (file.size > PDF_MAX_BYTES) throw new Error(`File too large (max ${pdfBytesLabel(PDF_MAX_BYTES)})`)
  return { body: file, contentType: mime, ext: 'pdf' }
}

async function pdfSniffMime(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const hex = Array.from(head).map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.startsWith('25504446')) return 'application/pdf'
  if (hex.startsWith('ffd8ff')) return 'image/jpeg'
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png'
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp'
  return null
}

// ── status — sourced from @/lib/contracts ───────────────────
const STATUS_TEXT = CONTRACT_STATUS_TEXT

type StatusTextProps = {
  contract: any
}

function StatusText({ contract }: StatusTextProps) {
  const status = deriveContractStatus(contract)
  const config = STATUS_TEXT[status] || STATUS_TEXT.incomplete
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
}

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

type NewContractModalProps = {
  open: boolean
  onClose: () => void
  onCreated: () => Promise<void>
  units: any
  owners: any
  contracts: any
}

// ── New Contract Modal ──────────────────────────────────────
function NewContractModal({ open, onClose, onCreated, units, owners, contracts }: NewContractModalProps) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    unit_id: '',
    effective_date: '',
    expiry_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const today = todayISO()
    const oneYearEnd = new Date(`${today}T00:00:00Z`)
    oneYearEnd.setUTCFullYear(oneYearEnd.getUTCFullYear() + 1)
    oneYearEnd.setUTCDate(oneYearEnd.getUTCDate() - 1)
    setForm({
      unit_id: '',
      effective_date: today,
      expiry_date: oneYearEnd.toISOString().slice(0, 10),
      notes: '',
    })
    setSaving(false)
  }, [open])

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const eligibleUnits = useMemo(() => {
    const unitsWithContracts = new Set(
      contracts.map((c) => c.unit_id).filter(Boolean),
    )
    const list = units.filter(
      (u) => !unitsWithContracts.has(u.id) && u.owner_id,
    )
    list.sort((a, b) => {
      const av = `${a.building || ''} ${a.unit_code || ''}`.trim()
      const bv = `${b.building || ''} ${b.unit_code || ''}`.trim()
      return av.localeCompare(bv)
    })
    return list
  }, [units, contracts])

  const blockedNoOwner = useMemo(() => {
    const unitsWithContracts = new Set(
      contracts.map((c) => c.unit_id).filter(Boolean),
    )
    return units.filter(
      (u) => !unitsWithContracts.has(u.id) && !u.owner_id,
    )
  }, [units, contracts])

  const blockedHasContract = useMemo(() => {
    const unitsWithContracts = new Set(
      contracts.map((c) => c.unit_id).filter(Boolean),
    )
    return units.filter((u) => unitsWithContracts.has(u.id))
  }, [units, contracts])

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === form.unit_id) || null,
    [units, form.unit_id],
  )

  const unitOwner = useMemo(() => {
    if (!selectedUnit?.owner_id) return null
    return owners.find((o) => o.id === selectedUnit.owner_id) || null
  }, [selectedUnit, owners])

  const rangeInfo = useMemo(() => {
    if (!form.effective_date || !form.expiry_date) return null
    const days = diffDaysISO(form.effective_date, form.expiry_date)
    if (days <= 0) return { days: 0, valid: false }
    return { days, valid: true }
  }, [form.effective_date, form.expiry_date])

  if (!open) return null

  const canSave =
    !!form.unit_id &&
    !!form.effective_date &&
    !!form.expiry_date &&
    form.expiry_date > form.effective_date &&
    !!unitOwner &&
    !saving

  const handleSubmit = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const contractCode = generateContractCode()
      const { data, error } = await supabase
        .from('contracts')
        .insert({
          unit_id: form.unit_id,
          owner_id: unitOwner.id,
          contract_code: contractCode,
          effective_date: form.effective_date,
          expiry_date: form.expiry_date,
          notes: sanitizeText(form.notes, { max: 2000, allowNewlines: true }),
        })
        .select('id, contract_code')
        .single()
      if (error) throw error

      logAudit('CREATE_CONTRACT', 'contracts', data.id, {
        contract_code: data.contract_code,
        unit_id: form.unit_id,
        owner_id: unitOwner.id,
        effective_date: form.effective_date,
        expiry_date: form.expiry_date,
      }).catch(() => {})

      toast.success(`Contract ${data.contract_code} created`)
      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to create contract')
    } finally {
      setSaving(false)
    }
  }

  const labelClass = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1.5 block'
  const inputClass = 'h-9 text-xs rounded-md'

  const noEligible = eligibleUnits.length === 0
  const onlyBlockedByNoOwner = noEligible && blockedNoOwner.length > 0 && blockedHasContract.length === 0
  const onlyBlockedByContract = noEligible && blockedHasContract.length > 0 && blockedNoOwner.length === 0

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="relative bg-card rounded-lg shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden border border-border"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-foreground">New Contract</h2>
            <p className="text-[11px] text-foreground mt-0.5">
              Only units without a contract and with an owner attached are listed. To continue a unit's contract, open it and use Extend or Renew.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {noEligible && (
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                No eligible units right now.
              </p>
              {onlyBlockedByNoOwner && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  {blockedNoOwner.length} unit{blockedNoOwner.length === 1 ? '' : 's'} without a contract
                  {' '}still need{blockedNoOwner.length === 1 ? 's' : ''} an owner attached.
                  Add the owner in Registry first, then come back here.
                </p>
              )}
              {onlyBlockedByContract && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  Every unit already has a contract. To continue one, open it and use
                  Extend (before it ends) or Renew (after it ends), or add a new unit in Registry.
                </p>
              )}
              {!onlyBlockedByNoOwner && !onlyBlockedByContract && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  Every unit either has a contract or is missing an owner.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded text-xs mt-3"
                onClick={() => {
                  onClose()
                  navigate('/admin?tab=registry')
                }}
              >
                Go to Registry
              </Button>
            </div>
          )}

          <div>
            <label className={labelClass}>Unit *</label>
            <Select value={form.unit_id} onValueChange={(v) => setField('unit_id', v)} disabled={noEligible}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder={noEligible ? 'No eligible units' : 'Select a unit…'}>
                  {selectedUnit
                    ? `${selectedUnit.building || '—'} — ${selectedUnit.unit_code || '—'}`
                    : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {eligibleUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs">
                    {u.building || '—'} — <span className="font-mono font-bold">{u.unit_code || '—'}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUnit && unitOwner && (
            <div>
              <label className={labelClass}>Owner</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card">
                <User size={13} className="text-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{unitOwner.name}</p>
                  <p className="text-[10px] text-foreground truncate">{unitOwner.email || 'No email'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Effective date *</label>
              <DatePicker
                value={form.effective_date}
                onChange={(v) => {
                  setField('effective_date', v)
                  if (form.expiry_date && form.expiry_date <= v) {
                    setField('expiry_date', addDaysISO(v, 365))
                  }
                }}
                placeholder="Pick start date"
                rangeEnd={form.expiry_date || null}
              />
            </div>
            <div>
              <label className={labelClass}>Expiry date *</label>
              <DatePicker
                value={form.expiry_date}
                onChange={(v) => setField('expiry_date', v)}
                placeholder="Pick end date"
                minDate={form.effective_date || undefined}
                rangeStart={form.effective_date || null}
                align="right"
              />
            </div>
          </div>

          {rangeInfo && (
            <div className="text-[11px] text-foreground">
              {rangeInfo.valid ? (
                <>
                  <span className="font-semibold text-foreground">
                    {rangeInfo.days} day{rangeInfo.days === 1 ? '' : 's'}
                  </span>
                  {' '}· {formatISOReadable(form.effective_date)} → {formatISOReadable(form.expiry_date)}
                </>
              ) : (
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  Expiry must be after effective
                </span>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>Notes (optional)</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Any additional terms, agreements, or context…"
              className="text-xs rounded-md resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card flex-shrink-0">
          <Button variant="outline" size="sm" className="h-9 rounded text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-9 rounded text-xs"
            onClick={handleSubmit}
            disabled={!canSave}
            style={{ backgroundColor: BRAND }}
          >
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Plus size={12} className="mr-1.5" />}
            {saving ? 'Creating…' : 'Create Contract'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

type SummaryCardsProps = {
  contracts: any
  active: string
  onSelect: (...args: any[]) => any
}

// ── Summary cards ───────────────────────────────────────────
// KPI strip as on the Dashboard; each tile filters the list below.
function SummaryCards({ contracts, active, onSelect }: SummaryCardsProps) {
  const stats = useMemo(() => {
    let activeCount = 0, expiring = 0, expired = 0, renewed = 0
    for (const c of contracts) {
      const s = deriveContractStatus(c)
      if (s === 'active') activeCount++
      else if (s === 'expiring') expiring++
      else if (s === 'expired') expired++
      else if (s === 'renewed') renewed++
    }
    return { total: contracts.length, active: activeCount, expiring, expired, renewed }
  }, [contracts])

  const pick = (id) => onSelect(active === id ? 'all' : id)

  return (
    <StatStrip cols={5}>
      <StatTile icon={FileText} label="Total contracts" value={stats.total} sub="Every term on file" active={active === 'all'} onClick={() => onSelect('all')} />
      <StatTile icon={CheckCircle2} label="Active" value={stats.active} sub={`More than ${EXPIRING_SOON_DAYS} days left`} active={active === 'active'} onClick={() => pick('active')} />
      <StatTile
        icon={Clock}
        label="Expiring soon"
        value={stats.expiring}
        sub={stats.expiring > 0 ? 'Extend these with the owner' : `None end within ${EXPIRING_SOON_DAYS} days`}
        active={active === 'expiring'}
        onClick={() => pick('expiring')}
      />
      <StatTile
        icon={AlertTriangle}
        label="For renewal"
        value={stats.expired}
        sub={stats.expired > 0 ? 'Ended; renew once the owner agrees' : 'Nothing has ended'}
        attention={stats.expired > 0}
        active={active === 'expired'}
        onClick={() => pick('expired')}
      />
      <StatTile
        icon={History}
        label="Renewed"
        value={stats.renewed}
        sub="Past terms with a newer contract"
        active={active === 'renewed'}
        onClick={() => pick('renewed')}
        className="col-span-2 sm:col-span-1"
      />
    </StatStrip>
  )
}

const STATUS_PILLS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expiring', label: 'Expiring' },
  { id: 'expired', label: 'For renewal' },
  { id: 'renewed', label: 'Renewed' },
]

type FilterPanelProps = {
  open: boolean
  onClose: () => void
  building: string
  setBuilding: (...args: any[]) => any
  ownerId: string
  setOwnerId: (...args: any[]) => any
  unitId: string
  setUnitId: (...args: any[]) => any
  rangeFrom: string
  setRangeFrom: (...args: any[]) => any
  rangeTo: string
  setRangeTo: (...args: any[]) => any
  buildings: any
  owners: any
  units: any
  activeCount: number
  onClear: () => void
}

// ── Filter panel ────────────────────────────────────────────
function FilterPanel({
  open,
  onClose,
  building, setBuilding,
  ownerId, setOwnerId,
  unitId, setUnitId,
  rangeFrom, setRangeFrom,
  rangeTo, setRangeTo,
  buildings, owners, units,
  activeCount, onClear,
}: FilterPanelProps) {
  const panelRef = useRef(null)
  useRevealOnOpen(panelRef, open)

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

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const av = `${a.building || ''} ${a.unit_code || ''}`.trim()
      const bv = `${b.building || ''} ${b.unit_code || ''}`.trim()
      return av.localeCompare(bv)
    })
  }, [units])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          className="absolute right-0 top-full mt-2 w-[380px] max-w-[90vw] bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <h3 className="text-xs font-bold text-foreground">Filters</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={13} /></button>
          </div>
          <div className="p-4 space-y-3 max-h-[460px] overflow-y-auto">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1.5">Building</p>
              <Select value={building} onValueChange={setBuilding}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All buildings" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All buildings</SelectItem>
                  {buildings.map((b) => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1.5">Owner</p>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All owners" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All owners</SelectItem>
                  {owners.map((o) => <SelectItem key={o.id} value={o.id} className="text-xs">{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1.5">Unit</p>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="h-8 text-xs rounded"><SelectValue placeholder="All units" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All units</SelectItem>
                  {sortedUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.building ? `${u.building} — ` : ''}<span className="font-mono font-bold">{u.unit_code}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1.5">
                Active within date range
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block">From</label>
                  <DatePicker value={rangeFrom} onChange={setRangeFrom} maxDate={rangeTo || null} rangeEnd={rangeTo || null} placeholder="Any day" size="sm" ariaLabel="Active from" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block">To</label>
                  <DatePicker value={rangeTo} onChange={setRangeTo} minDate={rangeFrom || null} rangeStart={rangeFrom || null} placeholder="Any day" size="sm" align="right" ariaLabel="Active to" />
                </div>
              </div>
              <p className="text-[10px] text-foreground mt-1.5">
                Shows contracts whose active period overlaps this range.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
            <Button variant="ghost" size="sm" onClick={onClear} disabled={activeCount === 0} className="text-xs h-7 rounded">Clear all</Button>
            <Button size="sm" onClick={onClose} className="text-xs h-7 rounded"><Check size={11} className="mr-1" />Done</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Row ─────────────────────────────────────────────────────
const ROW_GRID = `grid grid-cols-[1.3fr_1.5fr_1fr_1fr_140px] gap-4 items-center ${CARD_ON_PHONE}`

// Sortable columns. "Status" puts contracts waiting for renewal first, then
// ones ending soon, then active ones, then past (renewed) terms.
const STATUS_RANK = { expired: 0, expiring: 1, active: 2, renewed: 3 }
const CONTRACT_SORT_VALUE = {
  contract:  (c) => c.contract_code || '',
  unit:      (c) => c.units?.unit_code || '',
  effective: (c) => c.effective_date || '',
  expiry:    (c) => c.expiry_date || '',
  status:    (c) => STATUS_RANK[deriveContractStatus(c)] ?? 3,
}
// Newest start date first; everything else starts A→Z / soonest first.
const SORT_DEFAULTS = { effective: 'desc' }
const PANEL_WIDTH = 480

type ContractRowProps = {
  contract: any
  selected: boolean
  onClick: () => void
}

function ContractRow({ contract, selected, onClick }: ContractRowProps) {
  const navigate = useNavigate()
  const extended = extendedCount(contract)
  const contextItems = [
    { label: 'See in Contracts', icon: FileText, onSelect: onClick },
    { label: 'See in Accounting', icon: TrendingUp, onSelect: () => navigate(crmLink.accounting(contract.id)) },
    { separator: true },
    {
      label: 'Copy contract code',
      icon: Copy,
      hint: contract.contract_code,
      onSelect: () => {
        navigator.clipboard.writeText(contract.contract_code || '').then(
          () => toast.success('Contract code copied'),
          () => toast.error('Failed to copy'),
        )
      },
    },
  ]
  return (
    // ContextMenu wraps the row in its own div, so the divider goes on that.
    <ContextMenu items={contextItems} className="row-line">
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{ backgroundColor: selected ? 'rgba(34, 81, 147, 0.10)' : 'rgba(34, 81, 147, 0)' }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ backgroundColor: selected ? 'rgba(34, 81, 147, 0.14)' : 'rgba(34, 81, 147, 0.05)' }}
      whileTap={{ scale: 0.998 }}
      data-row
      className={cn('group/row w-full text-left px-4 py-3 cursor-pointer select-none', ROW_GRID)}
    >
      <div className="min-w-0">
        <Code value={contract.contract_code} label="Contract code" className="text-xs" block />
        <span className="text-[10px] text-foreground truncate block">
          {contract.owners?.name || 'No owner'}
        </span>
      </div>
      <div className="min-w-0 max-md:col-span-2">
        <Code value={contract.units?.unit_code} label="Unit code" className="text-xs" block />
        <span className="text-[10px] text-foreground truncate block">
          {contract.units?.building || '—'}
        </span>
      </div>
      <div className="text-[11px] tabular-nums text-foreground min-w-0">
        <span className={PHONE_LABEL}>Effective</span>
        <div className="truncate">{formatDate(contract.effective_date)}</div>
      </div>
      <div className="text-[11px] tabular-nums text-foreground min-w-0">
        <span className={PHONE_LABEL}>Expiry</span>
        <div className="truncate">{formatDate(contract.expiry_date)}</div>
        {extended > 0 && <div className="text-[10px] truncate">extended {extended}×</div>}
      </div>
      <div className="flex items-center justify-end flex-shrink-0">
        <StatusText contract={contract} />
      </div>
    </motion.button>
    </ContextMenu>
  )
}

type EditableFieldProps = {
  label: string
  value: any
  type?: string
  options?: any
  onSave: (v: any) => Promise<void>
  auditTag: string
  maxLength?: number
}

// ── Editable field ──────────────────────────────────────────
function EditableField({ label, value, type = 'text', options, onSave, auditTag, maxLength = 500 }: EditableFieldProps) {
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = async () => {
    if (draft === (value ?? '')) return
    setStatus('saving')
    try {
      const cleaned = draft === '' ? null : String(draft).slice(0, maxLength)
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

  // A picked date saves straight away, like a picked option.
  const saveDate = async (v) => {
    if ((v || '') === (value ?? '')) return
    setDraft(v || '')
    setStatus('saving')
    try {
      await onSave(v || null)
      setStatus('saved')
      if (auditTag) {
        logAudit(`UPDATE_CONTRACT_FIELD:${auditTag}`, 'contracts', null, { field: auditTag, from: value, to: v || null }).catch(() => {})
      }
      setTimeout(() => setStatus('idle'), 1200)
    } catch (err) {
      toast.error(err?.message || 'Save failed')
      setDraft(value ?? '')
      setStatus('idle')
    }
  }

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {type === 'date' ? (
          <DatePicker value={draft || ''} onChange={saveDate} size="sm" placeholder="—" clearable={false} ariaLabel={label} className="flex-1 min-w-0" />
        ) : options ? (
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
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur() }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); (e.target as HTMLElement).blur() }
            }}
            onBlur={commit}
            maxLength={maxLength}
            className={cn(
              'h-7 text-xs rounded bg-background flex-1 transition-colors',
              !value && 'border-border',
              value && 'border-transparent hover:border-border',
            )}
            placeholder="—"
          />
        )}
        {status === 'saving' && <Loader2 size={11} className="flex-shrink-0 animate-spin text-foreground" />}
        {status === 'saved' && <Check size={11} className="flex-shrink-0 text-foreground" />}
      </div>
    </div>
  )
}

type ContractPdfUploaderProps = {
  contract: any
  onSaved: any
}

// ── PDF uploader ────────────────────────────────────────────
function ContractPdfUploader({ contract, onSaved }: ContractPdfUploaderProps) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [busyRemove, setBusyRemove] = useState(false)
  const [signedUrl, setSignedUrl] = useState(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const path = contract?.contract_pdf_path || null
  const existingUrl = contract?.contract_pdf_url || null

  useEffect(() => {
    let cancelled = false
    if (!path) { setSignedUrl(null); return }
    setLoadingUrl(true)
    supabase.storage.from(PDF_BUCKET).createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.warn(error); setSignedUrl(null) }
        else setSignedUrl(data?.signedUrl || null)
      })
      .finally(() => { if (!cancelled) setLoadingUrl(false) })
    return () => { cancelled = true }
  }, [path])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const { body, contentType, ext } = await contractFileBody(file)
      const newPath = `${contract.id}/${pdfRandomId()}.${ext}`

      const { error: upErr } = await supabase
        .storage
        .from(PDF_BUCKET)
        .upload(newPath, body, {
          cacheControl: '31536000',
          upsert: false,
          contentType,
        })
      if (upErr) throw upErr

      const { data: signedData, error: signErr } = await supabase
        .storage
        .from(PDF_BUCKET)
        .createSignedUrl(newPath, 3600)
      if (signErr) throw signErr

      const { error: dbErr } = await supabase
        .from('contracts')
        .update({
          contract_pdf_path: newPath,
          contract_pdf_url: signedData?.signedUrl || existingUrl,
        })
        .eq('id', contract.id)
      if (dbErr) throw dbErr

      if (path) {
        supabase.storage.from(PDF_BUCKET).remove([path]).catch((err) => {
          console.warn('Failed to remove old contract pdf:', err)
        })
      }

      logAudit('UPLOAD_CONTRACT_PDF', 'contracts', contract.id, {
        filename: file.name, size: body.size, mime: contentType,
      }).catch(() => {})

      toast.success('Contract uploaded')
      setSignedUrl(signedData?.signedUrl || null)
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!path && !existingUrl) return
    if (!window.confirm('Remove the contract file? This cannot be undone.')) return
    setBusyRemove(true)
    try {
      if (path) {
        const { error: rmErr } = await supabase.storage.from(PDF_BUCKET).remove([path])
        if (rmErr) console.warn('Storage remove failed:', rmErr)
      }
      const { error: dbErr } = await supabase
        .from('contracts')
        .update({ contract_pdf_path: null, contract_pdf_url: null })
        .eq('id', contract.id)
      if (dbErr) throw dbErr
      logAudit('REMOVE_CONTRACT_PDF', 'contracts', contract.id, {}).catch(() => {})
      toast.success('Contract file removed')
      setSignedUrl(null)
      onSaved?.()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to remove')
    } finally {
      setBusyRemove(false)
    }
  }

  const hasFile = !!path || !!existingUrl
  const displayUrl = signedUrl || existingUrl

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
        disabled={uploading || busyRemove}
      />

      {hasFile ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-2.5 rounded-md border border-border bg-background">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">Contract document</p>
              <p className="text-[10px] text-foreground font-mono truncate">
                {path || existingUrl || '—'}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {loadingUrl ? (
                <Loader2 size={12} className="animate-spin text-foreground" />
              ) : displayUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="p-1.5 rounded hover:bg-muted text-foreground hover:text-foreground transition-colors"
                    title="Preview"
                  >
                    <Eye size={12} />
                  </button>
                  <a
                    href={displayUrl}
                    download
                    className="p-1.5 rounded hover:bg-muted text-foreground hover:text-foreground transition-colors"
                    title="Download"
                  >
                    <Download size={12} />
                  </a>
                  <a
                    href={displayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-muted text-foreground hover:text-foreground transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={12} />
                  </a>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded text-[11px] gap-1.5 flex-1"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || busyRemove}
            >
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              {uploading ? 'Uploading…' : 'Replace'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
              onClick={handleRemove}
              disabled={uploading || busyRemove}
            >
              {busyRemove ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-5 rounded-md border-2 border-dashed border-border text-foreground hover:bg-muted/40 active:bg-muted/60 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span className="text-[11px] font-semibold">
            {uploading ? 'Uploading…' : 'Upload contract document'}
          </span>
          <span className="text-[10px]">
            PDF up to {pdfBytesLabel(PDF_MAX_BYTES)}, or a photo
          </span>
        </button>
      )}

      {lightboxOpen && displayUrl && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[2147483647] bg-black/85 backdrop-blur-sm flex flex-col"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxOpen(false) }}
        >
          <div className="flex-shrink-0 h-14 px-4 flex items-center gap-3 border-b border-white/10 bg-black/60">
            <FileText size={16} className="text-white/80 flex-shrink-0" />
            <p className="text-sm font-semibold text-white truncate flex-1">
              {contract.contract_code
                ? <span className="inline-flex items-center gap-1.5 max-w-full">Contract · <Code value={contract.contract_code} label="Contract code" className="text-sm text-white" buttonClassName="text-white hover:bg-white/10" /></span>
                : 'Contract document'}
            </p>
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
            >
              <ExternalLink size={12} />
              <span className="hidden sm:inline">Open in new tab</span>
            </a>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
            >
              <X size={12} />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4 sm:p-6 flex items-center justify-center">
            <div className="relative w-full h-full max-w-[1100px] rounded-lg overflow-hidden bg-white shadow-2xl">
              <iframe
                src={displayUrl}
                title={contract.contract_code || 'Contract document'}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </motion.div>,
        document.body,
      )}
    </>
  )
}

// ── Extend & renew ──────────────────────────────────────────
// Checks and uploads a signed contract or addendum to the contract-pdfs
// bucket, under the contract's folder. Returns the storage path.
async function uploadContractFile(file, contractId, prefix = '') {
  const { body, contentType, ext } = await contractFileBody(file)
  const path = `${contractId}/${prefix}${pdfRandomId()}.${ext}`
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, body, {
    cacheControl: '31536000',
    upsert: false,
    contentType,
  })
  if (error) throw error
  return path
}

// Another contract on the same unit whose dates touch [start, end].
async function findOverlappingContract({ unitId, excludeId, start, end }) {
  let q = supabase
    .from('contracts')
    .select('id, contract_code, effective_date, expiry_date')
    .eq('unit_id', unitId)
    .neq('id', excludeId)
    .lte('effective_date', end)
  q = q.or(`expiry_date.is.null,expiry_date.gte.${start}`)
  const { data, error } = await q.limit(1)
  if (error) {
    console.warn('Overlap check failed:', error)
    return null
  }
  return data?.[0] || null
}

type ModalShellProps = {
  title: string
  subtitle: ReactNode
  onClose: any
  children: ReactNode
  footer: ReactNode
}

function ModalShell({ title, subtitle, onClose, children, footer }: ModalShellProps) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        role="dialog"
        aria-modal="true"
        className="relative bg-card rounded-md shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden border border-border"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="text-[12px] text-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-foreground hover:bg-muted/60 flex-shrink-0"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card flex-shrink-0">{footer}</div>
      </motion.div>
    </div>
  )
}

const FORM_LABEL = 'text-[11px] font-semibold text-foreground mb-1.5 block'

type PresetButtonsProps = {
  presets: any
  value: number
  onPick: (m: any) => void
}

// Quick lengths, as buttons; the selected one is in logo blue.
function PresetButtons({ presets, value, onPick }: PresetButtonsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => {
        const active = value === p.value
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick(p.value)}
            aria-pressed={active}
            className={cn(
              'h-7 px-2.5 rounded-md border text-[12px] font-medium transition-colors',
              active ? 'bg-brand-solid border-brand-solid text-white' : 'bg-card border-border text-foreground hover:bg-muted/50',
            )}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

type FilePickProps = {
  file: any
  onFile: (...args: any[]) => any
  label: string
}

// Optional signed document picked before saving.
function FilePick({ file, onFile, label }: FilePickProps) {
  const ref = useRef(null)
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { onFile(e.target.files?.[0] || null); if (ref.current) ref.current.value = '' }}
      />
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border">
          <FileText size={14} className="text-foreground flex-shrink-0" />
          <span className="text-[12px] text-foreground truncate flex-1">{file.name}</span>
          <span className="text-[11px] text-foreground tabular-nums flex-shrink-0">{pdfBytesLabel(file.size)}</span>
          <button type="button" onClick={() => onFile(null)} aria-label="Remove file" className="p-1 rounded-md hover:bg-muted text-foreground"><X size={12} /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-border text-[12px] font-medium text-foreground hover:bg-muted/40 transition-colors"
        >
          <Upload size={13} /> {label}
        </button>
      )}
      <p className="text-[11px] text-foreground mt-1">PDF up to {pdfBytesLabel(PDF_MAX_BYTES)}, or a photo</p>
    </div>
  )
}

const EXTEND_PRESETS = [
  { label: '+3 months', value: 3 },
  { label: '+6 months', value: 6 },
  { label: '+1 year', value: 12 },
]

type ExtendContractModalProps = {
  contract: any
  onClose: () => void
  onExtended: () => void
}

// Extend: same contract, later end date, nothing else to record. Accounting
// simply covers the extra months under this contract.
function ExtendContractModal({ contract, onClose, onExtended }: ExtendContractModalProps) {
  const current = contract.expiry_date
  const firstNewDay = dayAfterISO(current)
  const [months, setMonths] = useState(6)
  const [newExpiry, setNewExpiry] = useState(() => termEndISO(firstNewDay, 6))
  const [saving, setSaving] = useState(false)

  const pickMonths = (m) => { setMonths(m); setNewExpiry(termEndISO(firstNewDay, m)) }
  const valid = !!newExpiry && newExpiry > current
  const added = valid ? diffDaysISO(current, newExpiry) : 0
  const daysLeft = diffDaysISO(todayISO(), current)

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const clash = await findOverlappingContract({ unitId: contract.unit_id, excludeId: contract.id, start: firstNewDay, end: newExpiry })
      if (clash) {
        toast.error(`That would overlap ${clash.contract_code || 'another contract'} (from ${formatDate(clash.effective_date)}).`)
        return
      }

      // Moves the end date and keeps the old one in previous_expiry_dates, in one step.
      const { error } = await supabase.rpc('extend_contract', { p_contract: contract.id, p_new_expiry: newExpiry })
      if (error) throw error

      logAudit('EXTEND_CONTRACT', 'contracts', contract.id, {
        contract_code: contract.contract_code, from: current, to: newExpiry,
      }).catch(() => {})

      toast.success(`Extended to ${formatDate(newExpiry)}`)
      onExtended()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to extend')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Extend contract"
      subtitle={<span className="inline-flex flex-wrap items-center gap-x-1.5"><Code value={contract.contract_code} label="Contract code" empty="Contract" /> · <Code value={contract.units?.unit_code} label="Unit code" /> · {contract.owners?.name || 'No owner'}</span>}
      onClose={onClose}
      footer={(
        <>
          <Button variant="outline" size="sm" className="h-9 rounded-md text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-9 rounded-md text-xs text-white" onClick={save} disabled={!valid || saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <CalendarPlus size={12} className="mr-1.5" />}
            {saving ? 'Extending…' : 'Extend'}
          </Button>
        </>
      )}
    >
      <div className="flex items-baseline justify-between gap-3 text-[12px] text-foreground">
        <span>Currently ends</span>
        <span className="font-semibold tabular-nums">
          {formatDate(current)}
          <span className={cn('ml-1.5 font-semibold', daysLeft <= 30 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
            · {daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          </span>
        </span>
      </div>

      <div>
        <label className={FORM_LABEL}>Extend by</label>
        <PresetButtons presets={EXTEND_PRESETS} value={months} onPick={pickMonths} />
      </div>

      <div>
        <label className={FORM_LABEL}>New end date *</label>
        <DatePicker
          value={newExpiry}
          onChange={(v) => { setNewExpiry(v); setMonths(null) }}
          placeholder="Pick the new end date"
          minDate={firstNewDay}
        />
        <p className="text-[12px] text-foreground mt-1.5">
          {valid
            ? <>Adds <span className="font-semibold">{added} day{added === 1 ? '' : 's'}</span> · runs to {formatDate(newExpiry)}</>
            : <span className="text-red-600 dark:text-red-400 font-semibold">Pick a date after {formatDate(current)}</span>}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border p-3">
        <Info size={13} className="text-foreground flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-foreground leading-relaxed">
          Same contract, later end date. Accounting adds the extra months to this contract's figures,
          and the current end date is kept as a previous one{extendedCount(contract) > 0 ? ` (it has been extended ${extendedCount(contract)}× before)` : ''}.
        </p>
      </div>
    </ModalShell>
  )
}

const RENEW_PRESETS = [
  { label: '6 months', value: 6 },
  { label: '1 year', value: 12 },
  { label: '2 years', value: 24 },
]

type RenewContractModalProps = {
  contract: any
  termNumber: number
  unitOwner: any
  onClose: () => void
  onRenewed: (newId: any) => void
}

// Renew: a new contract for the next term, linked to the one that ended.
function RenewContractModal({ contract, termNumber, unitOwner, onClose, onRenewed }: RenewContractModalProps) {
  const minStart = dayAfterISO(contract.expiry_date)
  const [start, setStart] = useState(minStart)
  const [months, setMonths] = useState(12)
  const [end, setEnd] = useState(() => termEndISO(minStart, 12))
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [gapBookings, setGapBookings] = useState(0)

  const owner = unitOwner || contract.owners || null
  const ownerChanged = unitOwner && contract.owner_id && unitOwner.id !== contract.owner_id

  // Bookings that would fall between the old term and a later start.
  useEffect(() => {
    let cancelled = false
    if (!start || start <= minStart) { setGapBookings(0); return }
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('unit_id', contract.unit_id)
      .is('deleted_at', null)
      .is('cancelled_at', null)
      .gte('check_in', minStart)
      .lt('check_in', start)
      .then(({ count, error }) => { if (!cancelled && !error) setGapBookings(count || 0) })
    return () => { cancelled = true }
  }, [start, minStart, contract.unit_id])

  const pickMonths = (m) => { setMonths(m); setEnd(termEndISO(start, m)) }
  const valid = !!owner && !!start && start >= minStart && !!end && end > start
  const days = valid ? diffDaysISO(start, end) + 1 : 0

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const clash = await findOverlappingContract({ unitId: contract.unit_id, excludeId: contract.id, start, end })
      if (clash) {
        toast.error(`That would overlap ${clash.contract_code || 'another contract'} (from ${formatDate(clash.effective_date)}).`)
        return
      }

      const { data: created, error } = await supabase
        .from('contracts')
        .insert({
          unit_id: contract.unit_id,
          owner_id: owner.id,
          contract_code: generateContractCode(),
          effective_date: start,
          expiry_date: end,
          notes: sanitizeText(notes, { max: 2000, allowNewlines: true }) || null,
        })
        .select('id, contract_code')
        .single()
      if (error) throw error

      // Link the old term to the new one; undo the new contract if that fails.
      const { error: linkError } = await supabase.from('contracts').update({ superseded_by: created.id }).eq('id', contract.id)
      if (linkError) {
        await supabase.from('contracts').delete().eq('id', created.id)
        throw linkError
      }

      const { error: unitError } = await supabase.from('units').update({ current_contract_id: created.id }).eq('id', contract.unit_id)
      if (unitError) console.warn('Could not point the unit at its new contract:', unitError)
      // A unit marked "For renewal" in Registry takes bookings again.
      const { error: statusError } = await supabase.from('units').update({ status: 'ACTIVE' }).eq('id', contract.unit_id).eq('status', 'FOR_RENEWAL')
      if (statusError) console.warn('Could not set the unit back to active:', statusError)

      if (file) {
        try {
          const path = await uploadContractFile(file, created.id)
          const { data: signed } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(path, 3600)
          await supabase.from('contracts').update({ contract_pdf_path: path, contract_pdf_url: signed?.signedUrl || null }).eq('id', created.id)
        } catch (uploadErr) {
          console.error(uploadErr)
          toast.error('Renewed, but the file did not upload. Add it from the new contract.')
        }
      }

      logAudit('RENEW_CONTRACT', 'contracts', created.id, {
        renews: contract.id, previous_code: contract.contract_code, contract_code: created.contract_code,
        effective_date: start, expiry_date: end, owner_id: owner.id,
      }).catch(() => {})

      toast.success(`Renewed as ${created.contract_code}`)
      onRenewed(created.id)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to renew')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Renew contract"
      subtitle={<span className="inline-flex flex-wrap items-center gap-x-1.5"><Code value={contract.contract_code} label="Contract code" empty="Contract" /> ended {formatDate(contract.expiry_date)} · <Code value={contract.units?.unit_code} label="Unit code" /></span>}
      onClose={onClose}
      footer={(
        <>
          <Button variant="outline" size="sm" className="h-9 rounded-md text-xs" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="h-9 rounded-md text-xs text-white" onClick={save} disabled={!valid || saving} style={{ backgroundColor: BRAND }}>
            {saving ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <RotateCcw size={12} className="mr-1.5" />}
            {saving ? 'Renewing…' : `Renew as term ${termNumber + 1}`}
          </Button>
        </>
      )}
    >
      <div>
        <label className={FORM_LABEL}>Owner</label>
        {owner ? (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border">
            <InitialsAvatar name={owner.name} size="sm" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-foreground truncate">{owner.name}</p>
              <p className="text-[11px] text-foreground truncate">{owner.email || 'No email'}</p>
            </div>
          </div>
        ) : (
          <p className="text-[12px] font-semibold text-red-600 dark:text-red-400">This unit has no owner. Attach one in Registry first.</p>
        )}
        {ownerChanged && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">The unit's owner has changed since the last term; the new term goes to {owner.name}.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={FORM_LABEL}>Starts *</label>
          <DatePicker
            value={start}
            onChange={(v) => { setStart(v); if (months) setEnd(termEndISO(v, months)); else if (end <= v) setEnd(termEndISO(v, 12)) }}
            placeholder="Pick start date"
            minDate={minStart}
          />
        </div>
        <div>
          <label className={FORM_LABEL}>Ends *</label>
          <DatePicker
            value={end}
            onChange={(v) => { setEnd(v); setMonths(null) }}
            placeholder="Pick end date"
            minDate={start ? dayAfterISO(start) : undefined}
          />
        </div>
      </div>

      <div>
        <label className={FORM_LABEL}>Term length</label>
        <PresetButtons presets={RENEW_PRESETS} value={months} onPick={pickMonths} />
      </div>

      <p className="text-[12px] text-foreground">
        {valid
          ? <><span className="font-semibold">{days} days</span> · {formatDate(start)} → {formatDate(end)}</>
          : <span className="text-red-600 dark:text-red-400 font-semibold">The end must be after the start</span>}
      </p>

      {start > minStart && (
        <p className="text-[12px] text-foreground">
          <span className="font-semibold text-amber-700 dark:text-amber-400">Gap from {formatDate(minStart)} to {formatDate(addDaysISO(start, -1))}.</span>{' '}
          {gapBookings > 0
            ? `${gapBookings} booking${gapBookings === 1 ? '' : 's'} in that gap won't count in Accounting.`
            : 'No bookings fall in the gap.'}
        </p>
      )}

      <div>
        <label className={FORM_LABEL}>Signed contract (optional)</label>
        <FilePick file={file} onFile={setFile} label="Attach the signed renewal" />
      </div>

      <div>
        <label className={FORM_LABEL}>Notes (optional)</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} placeholder="Any changed terms or context…" className="text-xs rounded-md resize-none" />
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border p-3">
        <Info size={13} className="text-foreground flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-foreground leading-relaxed">
          This creates term {termNumber + 1} as a new contract and marks <Code value={contract.contract_code} label="Contract code" empty="this one" /> as renewed.
          Accounting keeps each term's figures separate and adds them up across terms.
        </p>
      </div>
    </ModalShell>
  )
}

type TermsListProps = {
  terms: any
  currentId: any
  onSelect: any
}

// Every term of this unit's run of renewals; the open one is highlighted.
/** How many times a contract was extended: one previous end date per extension. */
function extendedCount(contract) {
  return Array.isArray(contract?.previous_expiry_dates) ? contract.previous_expiry_dates.length : 0
}

type ExtendedLineProps = {
  dates: string[] | null | undefined
}

// "Extended 2×", with every end date the contract had before, oldest first.
function ExtendedLine({ dates }: ExtendedLineProps) {
  const list = Array.isArray(dates) ? dates : []
  if (list.length === 0) return null
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0 pt-0.5">Extended</span>
      <span className="text-xs text-foreground min-w-0">
        <span className="font-semibold">{list.length}×</span>
        <span> · previously ended {list.map((d) => formatDate(d)).join(', then ')}</span>
      </span>
    </div>
  )
}

function TermsList({ terms, currentId, onSelect }: TermsListProps) {
  if (terms.length < 2) return null
  return (
    <DetailSection title={`Terms · ${terms.length}`}>
      <div>
        {terms.map((t, i) => {
          const isCurrent = t.id === currentId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => !isCurrent && onSelect(t.id)}
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-border last:border-0 flex items-center gap-3 transition-colors',
                isCurrent ? 'bg-brand-solid/10' : 'hover:bg-muted/40',
              )}
            >
              <span className="text-[11px] font-semibold text-foreground w-12 flex-shrink-0">Term {i + 1}</span>
              <span className="min-w-0 flex-1">
                <Code value={t.contract_code} label="Contract code" className="text-[12px]" block />
                <span className="block text-[11px] text-foreground tabular-nums truncate">{formatDate(t.effective_date)} → {formatDate(t.expiry_date)}</span>
              </span>
              <StatusText contract={t} />
            </button>
          )
        })}
      </div>
    </DetailSection>
  )
}

type DetailSectionProps = {
  title: string
  action?: any
  className?: string
  children: ReactNode
}

// ── Detail section ──────────────────────────────────────────
function DetailSection({ title, action, className, children }: DetailSectionProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</h4>
        {action}
      </div>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

type ContractDetailPanelProps = {
  contract: any
  contracts: any
  units: any
  owners: any
  onClose: () => void
  onChanged: () => Promise<void>
  onDelete: () => Promise<void>
  onSelect: (...args: any[]) => any
}

// ── Detail panel ────────────────────────────────────────────
function ContractDetailPanel({ contract, contracts, units, owners, onClose, onChanged, onDelete, onSelect }: ContractDetailPanelProps) {
  const status = deriveContractStatus(contract)
  const statusConfig = STATUS_TEXT[status] || STATUS_TEXT.incomplete
  const [extendOpen, setExtendOpen] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)

  // This contract's run of renewals, and where it sits in it.
  const terms = useMemo(() => contractTerms(contract, contracts), [contract, contracts])
  const termIndex = Math.max(0, terms.findIndex((t) => t.id === contract.id))
  const previousTerm = termIndex > 0 ? terms[termIndex - 1] : null
  const nextTerm = termIndex < terms.length - 1 ? terms[termIndex + 1] : null

  // A renewal goes to whoever owns the unit now.
  const unitOwner = useMemo(() => {
    const u = (units || []).find((x) => x.id === contract.unit_id)
    return u?.owner_id ? (owners || []).find((o) => o.id === u.owner_id) || null : null
  }, [units, owners, contract.unit_id])

  const updateField = async (field, value) => {
    if (field === 'effective_date' || field === 'expiry_date') {
      const newEffective = field === 'effective_date' ? value : contract.effective_date
      const newExpiry    = field === 'expiry_date'    ? value : contract.expiry_date

      const filters = []
      if (newEffective) filters.push(`check_in.lt.${newEffective}`)
      if (newExpiry)    filters.push(`check_in.gt.${newExpiry}`)

      if (filters.length > 0) {
        const { count, error } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('unit_id', contract.unit_id)
          .is('deleted_at', null)
          .is('cancelled_at', null)
          .or(filters.join(','))

        if (error) {
          console.warn('Could not check for orphaned bookings:', error)
        } else if (count && count > 0) {
          const ok = window.confirm(
            `${count} booking${count === 1 ? '' : 's'} will fall outside the new contract range.\n\n` +
            `They will stop appearing in Accounting until the contract covers them again.\n\n` +
            `Continue?`
          )
          if (!ok) return
        }
      }
    }

    const { error } = await supabase.from('contracts').update(cleanFields({ [field]: value })).eq('id', contract.id)
    if (error) throw error
    logAudit(`UPDATE_CONTRACT_FIELD:${field}`, 'contracts', contract.id, { field, from: contract[field], to: value }).catch(() => {})
    onChanged()
  }

  const unit = contract.units
  const owner = contract.owners

  const panelMotion = useSidePanelMotion(PANEL_WIDTH)

  return (
    <motion.div {...panelMotion}>
      <div className="h-full rounded-md border border-border bg-card shadow-lg overflow-hidden flex flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contract.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="h-full flex flex-col min-h-0"
          >
            <div className="flex-shrink-0 px-5 py-4 line-below">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Code value={contract.contract_code} label="Contract code" className="text-base" block iconSize={14} />
                  <p className="text-[11px] text-foreground flex items-center gap-1 min-w-0">
                    <Code value={unit?.unit_code} label="Unit code" className="text-[11px]" />
                    <span className="truncate">· {unit?.building || '—'}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={cn('text-[11px] font-semibold', statusConfig.className)}>
                      {statusConfig.label}
                    </span>
                    {terms.length > 1 && (
                      <span className="text-[11px] text-foreground">· Term {termIndex + 1} of {terms.length}</span>
                    )}
                  </div>
                  {status === 'expired' && (
                    <p className="text-[11px] text-foreground mt-1">
                      Ended {formatDate(contract.expiry_date)}. Renew once the owner agrees.
                    </p>
                  )}
                  {status === 'expiring' && (
                    <p className="text-[11px] text-foreground mt-1">
                      Ends {formatDate(contract.expiry_date)}. Extend it if the owner wants to stay on.
                    </p>
                  )}
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-muted text-foreground flex-shrink-0"><X size={16} /></button>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {canExtendContract(contract) && (
                  <Button size="sm" className="h-7 rounded-md text-[11px] gap-1.5 text-white" style={{ backgroundColor: BRAND }} onClick={() => setExtendOpen(true)}>
                    <CalendarPlus size={11} /> Extend
                  </Button>
                )}
                {canRenewContract(contract) && (
                  <Button size="sm" className="h-7 rounded-md text-[11px] gap-1.5 text-white" style={{ backgroundColor: BRAND }} onClick={() => setRenewOpen(true)}>
                    <RotateCcw size={11} /> Renew
                  </Button>
                )}
                {previousTerm && (
                  <Button variant="outline" size="sm" className="h-7 rounded-md text-[11px] gap-1.5" onClick={() => onSelect(previousTerm.id)}>
                    <ChevronLeft size={11} /> Term {termIndex}
                  </Button>
                )}
                {nextTerm && (
                  <Button variant="outline" size="sm" className="h-7 rounded-md text-[11px] gap-1.5" onClick={() => onSelect(nextTerm.id)}>
                    Renewed as <Code value={nextTerm.contract_code} label="Contract code" className="text-[11px]" iconSize={11} empty={`term ${termIndex + 2}`} /> <ArrowRight size={11} />
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 rounded-md text-[11px] gap-1.5 ml-auto" onClick={onDelete}>
                  <Trash2 size={11} /> Delete
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <TermsList terms={terms} currentId={contract.id} onSelect={onSelect} />

              <DetailSection title="Owner statement">
                <div className="p-3">
                  <StatementActions key={contract.id} contract={contract} />
                </div>
              </DetailSection>
              <DetailSection title="Owner">
                <div className="p-3">
                  <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-border">
                    <div className="w-10 h-10 flex items-center justify-center flex-shrink-0 text-foreground">
                      <User size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{owner?.name || '—'}</p>
                      <p className="text-[11px] text-foreground truncate">{owner?.email || 'No email'}</p>
                    </div>
                  </div>
                  {owner?.phone && (
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Phone</span>
                      <span className="text-xs text-foreground">{owner.phone}</span>
                    </div>
                  )}
                </div>
              </DetailSection>

              <DetailSection title="Unit">
                <div className="p-3 space-y-0.5">
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Code</span>
                    <Code value={unit?.unit_code} label="Unit code" className="text-xs" />
                  </div>
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px]">Building</span>
                    <span className="text-xs text-foreground">{unit?.building || '—'}</span>
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="Contract Terms">
                <div className="p-3 space-y-0.5">
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
                  <ExtendedLine dates={contract.previous_expiry_dates} />
                </div>
              </DetailSection>

              <DetailSection title="Contract Document">
                <div className="p-3">
                  <ContractPdfUploader contract={contract} onSaved={onChanged} />
                </div>
              </DetailSection>

              <DetailSection title="Notes">
                <div className="p-3">
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
                </div>
              </DetailSection>

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
          </motion.div>
        </AnimatePresence>
      </div>

      {extendOpen && createPortal(
        <ExtendContractModal
          contract={contract}
          onClose={() => setExtendOpen(false)}
          onExtended={onChanged}
        />,
        document.body,
      )}
      {renewOpen && createPortal(
        <RenewContractModal
          contract={contract}
          termNumber={termIndex + 1}
          unitOwner={unitOwner}
          onClose={() => setRenewOpen(false)}
          onRenewed={(newId) => { onChanged(); onSelect(newId) }}
        />,
        document.body,
      )}
    </motion.div>
  )
}

// ── Main page ───────────────────────────────────────────────
export default function ContractsPage() {
  const listCap = useListCap()
  const [searchParams, setSearchParams] = useSearchParams()
  const filterUnitId = searchParams.get('unit')
  const initialContractId = searchParams.get('contract')

  const [contracts, setContracts] = useState([])
  const [units, setUnits] = useState([])
  const [owners, setOwners] = useState([])

  const [isFirstLoad, setIsFirstLoad] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [statusFilter, setStatusFilter] = useState('all')
  const [building, setBuilding] = useState('all')
  const [ownerId, setOwnerId] = useState('all')
  const [unitId, setUnitId] = useState('all')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const [selectedId, setSelectedId] = useState(initialContractId || null)
  const [newModalOpen, setNewModalOpen] = useState(false)
  const hasLoadedOnce = useRef(false)

  // A ?contract= link opened while already on this page (e.g. from the
  // contract warning bar) selects that contract too.
  useEffect(() => {
    if (initialContractId) setSelectedId(initialContractId)
  }, [initialContractId])

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
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []

    const scoped = tokens.length === 0
      ? contracts
      : contracts.filter((c) => {
          const haystack = [
            c.contract_code,
            c.units?.unit_code, c.units?.building,
            c.owners?.name, c.owners?.email,
          ].filter(Boolean).join(' ').toLowerCase()
          return tokens.every((tok) => haystack.includes(tok))
        })

    const c = { all: scoped.length, active: 0, expiring: 0, expired: 0, renewed: 0 }
    for (const x of scoped) {
      const s = deriveContractStatus(x)
      if (c[s] !== undefined) c[s]++
    }
    return c
  }, [contracts, debouncedSearch])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (building !== 'all') n++
    if (ownerId !== 'all') n++
    if (unitId !== 'all') n++
    if (filterUnitId) n++
    if (rangeFrom) n++
    if (rangeTo) n++
    return n
  }, [building, ownerId, unitId, filterUnitId, rangeFrom, rangeTo])

  const clearFilters = () => {
    setBuilding('all')
    setOwnerId('all')
    setUnitId('all')
    setRangeFrom('')
    setRangeTo('')
    const next = new URLSearchParams(searchParams)
    next.delete('unit')
    setSearchParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []

    return contracts.filter((c) => {
      if (filterUnitId && c.unit_id !== filterUnitId) return false
      const status = deriveContractStatus(c)
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (building !== 'all' && c.units?.building !== building) return false
      if (ownerId !== 'all' && c.owner_id !== ownerId) return false
      if (unitId !== 'all' && c.unit_id !== unitId) return false

      if (rangeFrom || rangeTo) {
        const cStart = c.effective_date || '0001-01-01'
        const cEnd   = c.expiry_date    || '9999-12-31'

        if (rangeFrom && cEnd < rangeFrom) return false
        if (rangeTo && cStart > rangeTo) return false
      }

      if (tokens.length > 0) {
        const haystack = [
          c.contract_code,
          c.units?.unit_code, c.units?.building,
          c.owners?.name, c.owners?.email,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!tokens.every((tok) => haystack.includes(tok))) return false
      }
      return true
    })
  }, [contracts, filterUnitId, statusFilter, building, ownerId, unitId, rangeFrom, rangeTo, debouncedSearch])

  // Column sorting; newest effective date first by default.
  const [sort, setSort] = useState({ key: 'effective', dir: 'desc' })
  const onSort = (key) => setSort((prev) => nextSort(prev, key, SORT_DEFAULTS))
  const sorted = useMemo(() => {
    const value = CONTRACT_SORT_VALUE[sort.key] || CONTRACT_SORT_VALUE.effective
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = value(a), bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return cmp * dir || String(b.effective_date || '').localeCompare(String(a.effective_date || ''))
    })
  }, [filtered, sort])

  // Keyboard: "/" jumps to search, Esc closes the open contract
  // (the filter panel handles its own Esc while it is open).
  const searchRef = useRef(null)
  const closePanel = useCallback(() => setSelectedId(null), [])
  useListShortcuts({ searchRef, onEscape: selectedId && !filterOpen ? closePanel : null })

  const clearUnitParam = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('unit')
    setSearchParams(next, { replace: true })
  }
  const clearAllFilters = () => { clearFilters(); setStatusFilter('all'); setSearch('') }
  const unitLabel = (id) => units.find((u) => u.id === id)?.unit_code || 'Unit'
  const filterChips = [
    statusFilter !== 'all' && { key: 'status', label: STATUS_PILLS.find((p) => p.id === statusFilter)?.label || statusFilter, onRemove: () => setStatusFilter('all') },
    debouncedSearch.trim() && { key: 'search', label: `"${debouncedSearch.trim()}"`, onRemove: () => setSearch('') },
    filterUnitId && { key: 'unit-link', label: `Unit ${unitLabel(filterUnitId)}`, onRemove: clearUnitParam },
    building !== 'all' && { key: 'building', label: building, onRemove: () => setBuilding('all') },
    ownerId !== 'all' && { key: 'owner', label: owners.find((o) => o.id === ownerId)?.name || 'Owner', onRemove: () => setOwnerId('all') },
    unitId !== 'all' && { key: 'unit', label: `Unit ${unitLabel(unitId)}`, onRemove: () => setUnitId('all') },
    (rangeFrom || rangeTo) && { key: 'range', label: `Active ${rangeFrom ? formatDate(rangeFrom) : '…'} → ${rangeTo ? formatDate(rangeTo) : '…'}`, onRemove: () => { setRangeFrom(''); setRangeTo('') } },
  ].filter(Boolean)

  const selected = useMemo(() => {
    const fromSorted = sorted.find((c) => c.id === selectedId)
    if (fromSorted) return fromSorted
    return contracts.find((c) => c.id === selectedId) || null
  }, [sorted, contracts, selectedId])

  const handleSelect = (contract) => setSelectedId((prev) => (prev === contract.id ? null : contract.id))

  const handleDelete = async (contract) => {
    // Deleting a renewal puts the term before it back to "For renewal".
    const previousTerm = contracts.find((c) => c.superseded_by === contract.id) || null
    const confirmed = window.confirm(
      `Delete this contract?\n\nCode: ${contract.contract_code || '—'}\nUnit: ${contract.units?.unit_code || '—'}\nEffective: ${formatDate(contract.effective_date)}\nExpiry: ${formatDate(contract.expiry_date)}\n\n` +
      (previousTerm ? `${previousTerm.contract_code || 'The previous term'} will go back to "For renewal".\n\n` : '') +
      'This cannot be undone.',
    )
    if (!confirmed) return
    try {
      if (previousTerm) {
        const { error: unlinkError } = await supabase.from('contracts').update({ superseded_by: null }).eq('id', previousTerm.id)
        if (unlinkError) throw unlinkError
        const { error: unitError } = await supabase.from('units').update({ current_contract_id: previousTerm.id }).eq('id', contract.unit_id)
        if (unitError) console.warn('Could not point the unit back at the previous term:', unitError)
      }
      if (contract.contract_pdf_path) {
        supabase.storage.from(PDF_BUCKET).remove([contract.contract_pdf_path]).catch((err) => {
          console.warn('Failed to remove contract pdf:', err)
        })
      }
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

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div data-page-scroll className="px-4 py-4 md:px-8 md:py-6 flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto [&>*]:flex-shrink-0">
          <div className="flex-shrink-0">
            <SummaryCards contracts={contracts} active={statusFilter} onSelect={setStatusFilter} />
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search contract code, unit, owner, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9 h-9 text-xs rounded-md"
              />
              {!search && <SearchKeyHint />}
            </div>
            <Button
              size="sm"
              className="h-9 rounded-md text-xs text-white transition-all duration-150 active:scale-[0.98]"
              style={{ backgroundColor: BRAND }}
              onClick={() => setNewModalOpen(true)}
            >
              <Plus size={13} />
              <span className="hidden sm:inline ml-1">Add Contract</span>
            </Button>
            <div className="relative">
              <Button
                variant={activeFilterCount > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-9 rounded-md text-xs transition-all duration-150"
                onClick={() => setFilterOpen((v) => !v)}
              >
                <SlidersHorizontal size={13} />
                <span className="hidden sm:inline ml-1">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-md bg-background/20 text-[10px] font-bold">{activeFilterCount}</span>
                )}
              </Button>
              <FilterPanel
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
                building={building}
                setBuilding={setBuilding}
                ownerId={ownerId}
                setOwnerId={setOwnerId}
                unitId={unitId}
                setUnitId={setUnitId}
                rangeFrom={rangeFrom}
                setRangeFrom={setRangeFrom}
                rangeTo={rangeTo}
                setRangeTo={setRangeTo}
                buildings={buildings}
                owners={owners}
                units={units}
                activeCount={activeFilterCount}
                onClear={clearFilters}
              />
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isRefreshing} className="h-9 rounded-md transition-all duration-150" title="Refresh">
              <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
          </div>

          <div className="flex-shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <StatusTabs tabs={STATUS_PILLS} value={statusFilter} onChange={setStatusFilter} counts={counts} label="Filter contracts by status" />
          </div>

          {!isFirstLoad && (
            <ResultsBar
              shown={sorted.length}
              total={contracts.length}
              noun={contracts.length === 1 ? 'contract' : 'contracts'}
              chips={filterChips}
              onClearAll={clearAllFilters}
              hint="Click a column to sort · Press / to search"
            />
          )}

          <div className="rounded-md border border-border shadow-sm overflow-hidden bg-card">
            <div {...listCap} className="overflow-y-auto">
              <MobileSort
                options={[{ key: 'contract', label: 'Contract' }, { key: 'unit', label: 'Unit' }, { key: 'effective', label: 'Effective' }, { key: 'expiry', label: 'Expiry' }, { key: 'status', label: 'Status' }]}
                sort={sort}
                onSort={onSort}
                className="sticky top-0 z-10"
              />
              <div className={cn('sticky top-0 z-10 px-4 py-2.5 border-b border-border bg-card max-md:hidden', ROW_GRID)}>
                <SortHeader label="Contract" sortKey="contract" sort={sort} onSort={onSort} />
                <SortHeader label="Unit" sortKey="unit" sort={sort} onSort={onSort} />
                <SortHeader label="Effective" sortKey="effective" sort={sort} onSort={onSort} />
                <SortHeader label="Expiry" sortKey="expiry" sort={sort} onSort={onSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} align="right" />
              </div>

              {isFirstLoad ? (
                <div className="space-y-2 p-3">
                  {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : sorted.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <FileText size={32} strokeWidth={1.5} className="text-foreground mx-auto mb-3" />
                    <p className="text-sm text-foreground font-semibold">No contracts match your filters</p>
                    <p className="text-xs text-foreground mt-1">Try clearing the filters, or add a new contract.</p>
                    {filterChips.length > 0 && (
                      <button type="button" onClick={clearAllFilters} className="mt-4 inline-flex items-center h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted">
                        Clear filters
                      </button>
                    )}
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
            contract={selected}
            contracts={contracts}
            units={units}
            owners={owners}
            onClose={() => setSelectedId(null)}
            onChanged={fetchData}
            onDelete={() => handleDelete(selected)}
            onSelect={setSelectedId}
          />
        )}
      </AnimatePresence>

      <NewContractModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={fetchData}
        units={units}
        owners={owners}
        contracts={contracts}
      />
    </div>
  )
}