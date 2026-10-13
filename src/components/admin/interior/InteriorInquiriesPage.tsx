// src/components/admin/interior/InteriorInquiriesPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox, Search, RefreshCw, X, Mail, Phone,
  Check, Trash2, ExternalLink, MessageSquare, CheckCircle2, Sparkles, Palette,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  listInteriorInquiries,
  updateInteriorInquiry,
  deleteInteriorInquiry,
} from '@/lib/interiorDesign'
import { StatusTabs } from '@/components/admin/_shared/StatusTabs'
import { StatStrip, StatTile } from '@/components/admin/_shared/StatStrip'
import { InitialsAvatar } from '@/components/admin/_shared/Panel'
import { SortHeader, nextSort, ResultsBar, SearchKeyHint, useListShortcuts, CARD_ON_PHONE, MobileSort, useSidePanelMotion } from '@/components/admin/_shared/listTools'
import { DateRangeFilter } from '@/components/admin/_shared/DateRangeFilter'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

const PANEL_WIDTH = 448
const ROW_GRID = `grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,1fr)_120px_110px] gap-4 items-center ${CARD_ON_PHONE}`

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateShort(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function timeAgo(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}
function isWithinDays(iso, days) {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && Date.now() - t <= days * 86_400_000
}

// Status in font colour: new needs a reply, contacted is in progress, closed is done.
const STATUS_META = {
  new:       { label: 'New',       className: 'text-blue-600 dark:text-blue-400' },
  contacted: { label: 'Contacted', className: 'text-amber-600 dark:text-amber-400' },
  closed:    { label: 'Closed',    className: 'text-emerald-600 dark:text-emerald-400' },
}
const SERVICE_LABEL = {
  full_design:  'Full design', consultation: 'Consultation', renovation: 'Renovation',
  furnishing:   'Furnishing',  not_sure:     'Not sure',
}
const ROOM_SCOPE_LABEL = {
  studio: 'Studio', '1br': '1 bedroom', '2br': '2 bedrooms',
  '3br_plus': '3+ bedrooms', whole_house: 'Whole house', multiple_rooms: 'Multiple rooms',
}
const BUDGET_LABEL = {
  under_50k: 'Under ₱50k', '50k_150k': '₱50k – ₱150k', '150k_300k': '₱150k – ₱300k',
  '300k_500k': '₱300k – ₱500k', over_500k: 'Over ₱500k', not_sure: 'Not sure',
}
const TIMELINE_LABEL = {
  asap: 'ASAP', '1_3_months': '1–3 months', '3_6_months': '3–6 months', exploring: 'Exploring',
}

type StatusTextProps = {
  status: any
  className?: string
}

function StatusText({ status, className }: StatusTextProps) {
  const m = STATUS_META[status] || STATUS_META.new
  return <span className={cn('text-[11.5px] font-semibold whitespace-nowrap', m.className, className)}>{m.label}</span>
}

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'new',       label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'closed',    label: 'Closed' },
]

// Sortable columns. "Status" puts new inquiries first.
const STATUS_RANK = { new: 0, contacted: 1, closed: 2 }
const SORT_VALUE = {
  client:   (i) => i.client_name || '',
  property: (i) => i.property_address || i.property_type || '',
  service:  (i) => SERVICE_LABEL[i.service_type] || '',
  received: (i) => i.created_at || '',
  status:   (i) => STATUS_RANK[i.status] ?? 3,
}
// Newest first; everything else starts A→Z.
const SORT_DEFAULTS = { received: 'desc' }

type SummaryCardsProps = {
  inquiries: any
  active: string
  onSelect: (...args: any[]) => any
}

// KPI strip as on the Dashboard; each tile filters the list below.
function SummaryCards({ inquiries, active, onSelect }: SummaryCardsProps) {
  const stats = useMemo(() => ({
    total:     inquiries.length,
    thisWeek:  inquiries.filter((i) => isWithinDays(i.created_at, 7)).length,
    new:       inquiries.filter((i) => i.status === 'new').length,
    contacted: inquiries.filter((i) => i.status === 'contacted').length,
    closed:    inquiries.filter((i) => i.status === 'closed').length,
  }), [inquiries])

  const pick = (id) => onSelect(active === id ? 'all' : id)

  return (
    <StatStrip cols={4}>
      <StatTile icon={Palette} label="All design inquiries" value={stats.total} sub={`${stats.thisWeek} in the last 7 days`} active={active === 'all'} onClick={() => onSelect('all')} />
      <StatTile
        icon={Sparkles}
        label="New"
        value={stats.new}
        sub={stats.new > 0 ? 'Waiting for a reply' : 'All caught up'}
        attention={stats.new > 0}
        active={active === 'new'}
        onClick={() => pick('new')}
      />
      <StatTile icon={MessageSquare} label="Contacted" value={stats.contacted} sub="In conversation" active={active === 'contacted'} onClick={() => pick('contacted')} />
      <StatTile icon={CheckCircle2} label="Closed" value={stats.closed} sub="Done" active={active === 'closed'} onClick={() => pick('closed')} />
    </StatStrip>
  )
}

type InquiryRowProps = {
  inquiry: any
  selected: boolean
  onClick: () => void
}

function InquiryRow({ inquiry, selected, onClick }: InquiryRowProps) {
  const ago = timeAgo(inquiry.created_at)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{ backgroundColor: selected ? 'rgba(34, 81, 147, 0.10)' : 'rgba(34, 81, 147, 0)' }}
      transition={{ duration: 0.22 }}
      whileHover={{ backgroundColor: selected ? 'rgba(34, 81, 147, 0.14)' : 'rgba(34, 81, 147, 0.05)' }}
      className={cn('w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none', ROW_GRID)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <InitialsAvatar name={inquiry.client_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate">{inquiry.client_name}</p>
          <p className="text-[11px] text-foreground truncate">{inquiry.client_email}</p>
        </div>
      </div>
      <div className="min-w-0 max-md:col-span-2">
        <p className="text-[12px] text-foreground truncate">{inquiry.property_address || inquiry.property_type || '—'}</p>
        <p className="text-[11px] text-foreground truncate">{inquiry.property_type || 'Type TBD'}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{SERVICE_LABEL[inquiry.service_type] || 'Design inquiry'}</p>
        {inquiry.budget_range && <p className="text-[11px] text-foreground truncate">{BUDGET_LABEL[inquiry.budget_range] || ''}</p>}
      </div>
      <div className="text-[12px] tabular-nums text-foreground min-w-0">
        <div className="truncate">{fmtDate(inquiry.created_at)}</div>
        <div className="text-[11px] truncate">{ago}</div>
      </div>
      <div className="flex items-center justify-end flex-shrink-0">
        <StatusText status={inquiry.status} />
      </div>
    </motion.button>
  )
}

export default function InteriorInquiriesPage() {
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async (signal?) => {
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    try {
      const data = await listInteriorInquiries()
      if (signal?.aborted) return
      setInquiries(data)
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load interior inquiries:', err)
      toast.error('Failed to load inquiries')
    } finally {
      if (!signal?.aborted) {
        setLoading(false); setRefreshing(false); hasLoadedOnce.current = true
      }
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetchData(ac.signal)
    return () => ac.abort()
  }, [fetchData])

  useEffect(() => {
    const ch = supabase
      .channel(`interior-inquiries-realtime-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interior_design_inquiries' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const counts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const scoped = tokens.length === 0
      ? inquiries
      : inquiries.filter((i) => {
          const hay = [i.client_name, i.client_email, i.client_phone, i.property_address, i.property_type, i.message]
            .filter(Boolean).join(' ').toLowerCase()
          return tokens.every((tok) => hay.includes(tok))
        })
    const c = { all: scoped.length, new: 0, contacted: 0, closed: 0 }
    for (const i of scoped) if (c[i.status] !== undefined) c[i.status]++
    return c
  }, [inquiries, debouncedSearch])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    return inquiries.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (dateFrom) {
        const d = new Date(i.created_at)
        if (Number.isNaN(d.getTime()) || d < new Date(dateFrom + 'T00:00:00')) return false
      }
      if (dateTo) {
        const d = new Date(i.created_at)
        if (Number.isNaN(d.getTime()) || d > new Date(dateTo + 'T23:59:59')) return false
      }
      if (tokens.length > 0) {
        const hay = [i.client_name, i.client_email, i.client_phone, i.property_address, i.property_type, i.message]
          .filter(Boolean).join(' ').toLowerCase()
        if (!tokens.every((tok) => hay.includes(tok))) return false
      }
      return true
    })
  }, [inquiries, debouncedSearch, statusFilter, dateFrom, dateTo])

  // Column sorting; newest first by default.
  const [sort, setSort] = useState({ key: 'received', dir: 'desc' })
  const onSort = (key) => setSort((prev) => nextSort(prev, key, SORT_DEFAULTS))
  const sorted = useMemo(() => {
    const value = SORT_VALUE[sort.key] || SORT_VALUE.received
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = value(a), bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return cmp * dir || String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
  }, [filtered, sort])

  const selected = useMemo(() => inquiries.find((i) => i.id === selectedId) || null, [inquiries, selectedId])

  // Keyboard: "/" jumps to search, Esc closes the open inquiry.
  const searchRef = useRef(null)
  const closePanel = useCallback(() => setSelectedId(null), [])
  useListShortcuts({ searchRef, onEscape: selectedId ? closePanel : null })

  const clearDates = () => { setDateFrom(''); setDateTo('') }
  const clearAllFilters = () => { setStatusFilter('all'); setSearch(''); clearDates() }
  const filterChips = [
    statusFilter !== 'all' && { key: 'status', label: TABS.find((t) => t.id === statusFilter)?.label || statusFilter, onRemove: () => setStatusFilter('all') },
    debouncedSearch.trim() && { key: 'search', label: `"${debouncedSearch.trim()}"`, onRemove: () => setSearch('') },
    (dateFrom || dateTo) && { key: 'dates', label: `Received ${dateFrom ? fmtDateShort(dateFrom) : '…'} → ${dateTo ? fmtDateShort(dateTo) : '…'}`, onRemove: clearDates },
  ].filter(Boolean)

  const handleUpdate = useCallback(async (id, patch) => {
    try {
      const updated = await updateInteriorInquiry(id, patch)
      setInquiries((prev) => prev.map((i) => (i.id === id ? updated : i)))
      return updated
    } catch (err) {
      console.error(err)
      toast.error('Failed to update')
      throw err
    }
  }, [])

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteInteriorInquiry(id)
      setInquiries((prev) => prev.filter((i) => i.id !== id))
      setSelectedId(null)
      toast.success('Inquiry deleted')
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    }
  }, [])

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="px-4 py-4 md:px-8 md:py-6 flex-1 min-h-0 flex flex-col gap-4">
          <div className="flex-shrink-0">
            <SummaryCards inquiries={inquiries} active={statusFilter} onSelect={setStatusFilter} />
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search name, email, address, message…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9 h-9 text-xs rounded-md"
              />
              {!search && <SearchKeyHint />}
            </div>
            <DateRangeFilter
              from={dateFrom} to={dateTo}
              onFromChange={setDateFrom} onToChange={setDateTo}
              onClear={clearDates}
              title="Received date range"
            />
            <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={refreshing} className="h-9 rounded-md" title="Refresh">
              <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
            </Button>
          </div>

          <div className="flex-shrink-0">
            <StatusTabs tabs={TABS} value={statusFilter} onChange={setStatusFilter} counts={counts} label="Filter inquiries by status" />
          </div>

          {!loading && (
            <ResultsBar
              shown={sorted.length}
              total={inquiries.length}
              noun={inquiries.length === 1 ? 'inquiry' : 'inquiries'}
              chips={filterChips}
              onClearAll={clearAllFilters}
              hint="Click a column to sort · Press / to search"
            />
          )}

          <div className="flex-1 min-h-0 rounded-md border border-border shadow-sm overflow-hidden bg-card">
            <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <MobileSort
                options={[{ key: 'client', label: 'Client' }, { key: 'property', label: 'Property' }, { key: 'service', label: 'Service' }, { key: 'received', label: 'Received' }, { key: 'status', label: 'Status' }]}
                sort={sort}
                onSort={onSort}
                className="sticky top-0 z-10"
              />
              <div className={cn('sticky top-0 z-10 px-4 py-2.5 border-b border-border bg-card max-md:hidden', ROW_GRID)}>
                <SortHeader label="Client" sortKey="client" sort={sort} onSort={onSort} />
                <SortHeader label="Property" sortKey="property" sort={sort} onSort={onSort} />
                <SortHeader label="Service" sortKey="service" sort={sort} onSort={onSort} />
                <SortHeader label="Received" sortKey="received" sort={sort} onSort={onSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} align="right" />
              </div>

              {loading ? (
                <div className="space-y-2 p-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : sorted.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center py-12">
                  <div>
                    <Inbox size={32} strokeWidth={1.5} className="text-foreground mx-auto mb-3" />
                    <p className="text-sm text-foreground font-semibold">
                      {inquiries.length === 0 ? 'No design inquiries yet' : 'Nothing matches these filters'}
                    </p>
                    <p className="text-xs text-foreground mt-1">
                      {inquiries.length === 0 ? "When clients submit on your website, they'll appear here." : 'Try clearing the search or filters.'}
                    </p>
                    {filterChips.length > 0 && (
                      <button type="button" onClick={clearAllFilters} className="mt-4 inline-flex items-center h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted">
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                sorted.map((inquiry) => (
                  <InquiryRow key={inquiry.id} inquiry={inquiry} selected={selectedId === inquiry.id}
                    onClick={() => setSelectedId((prev) => (prev === inquiry.id ? null : inquiry.id))} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <InquiryDetailPanel inquiry={selected} onClose={() => setSelectedId(null)} onUpdate={handleUpdate} onDelete={handleDelete} />
        )}
      </AnimatePresence>
    </div>
  )
}

type InquiryDetailPanelProps = {
  inquiry: any
  onClose: () => void
  onUpdate: (id: any, patch: any) => Promise<any>
  onDelete: (id: any) => Promise<void>
}

function InquiryDetailPanel({ inquiry, onClose, onUpdate, onDelete }: InquiryDetailPanelProps) {
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState(inquiry.admin_notes || '')
  const [notesSaving, setNotesSaving] = useState(false)

  useEffect(() => { setNotesDraft(inquiry.admin_notes || '') }, [inquiry.id])

  const setStatus = async (status) => {
    if (status === inquiry.status) return
    setSaving(true)
    try {
      const patch: Record<string, string> = { status }
      if (status === 'contacted' && !inquiry.contacted_at) patch.contacted_at = new Date().toISOString()
      if (status === 'closed' && !inquiry.closed_at) patch.closed_at = new Date().toISOString()
      await onUpdate(inquiry.id, patch)
      toast.success(`Marked as ${status}`)
    } finally { setSaving(false) }
  }

  const saveNotes = async () => {
    const cleaned = notesDraft.trim()
    if (cleaned === (inquiry.admin_notes || '')) return
    setNotesSaving(true)
    try {
      await onUpdate(inquiry.id, { admin_notes: cleaned || null })
      toast.success('Notes saved')
    } finally { setNotesSaving(false) }
  }

  const confirmDelete = () => {
    if (!window.confirm(`Delete inquiry from "${inquiry.client_name}"?\n\nThis cannot be undone.`)) return
    onDelete(inquiry.id)
  }

  const images = Array.isArray(inquiry.images) ? inquiry.images : []

  const panelMotion = useSidePanelMotion(PANEL_WIDTH)

  return (
    <motion.div {...panelMotion}>
      <div className="h-full rounded-md border border-border bg-card shadow-lg overflow-hidden flex flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={inquiry.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }} className="h-full flex flex-col min-h-0">
            <div className="flex-shrink-0 px-5 py-4 border-b border-border">
              <div className="flex items-start gap-3">
                <InitialsAvatar name={inquiry.client_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground truncate">{inquiry.client_name}</p>
                  <p className="text-[11px] text-foreground truncate">{inquiry.client_email}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <StatusText status={inquiry.status} />
                    <span className="text-[11px] text-foreground">· {timeAgo(inquiry.created_at)}</span>
                  </div>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md hover:bg-muted text-foreground flex-shrink-0"><X size={16} /></button>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {inquiry.status !== 'contacted' && (
                  <Button variant="outline" size="sm" className="h-8 rounded-md text-[11px] gap-1.5"
                    onClick={() => setStatus('contacted')} disabled={saving}>
                    <Phone size={11} /> Mark contacted
                  </Button>
                )}
                {inquiry.status !== 'closed' && (
                  <Button variant="outline" size="sm"
                    className="h-8 rounded-md text-[11px] gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                    onClick={() => setStatus('closed')} disabled={saving}>
                    <Check size={11} /> Mark closed
                  </Button>
                )}
                {inquiry.status !== 'new' && (
                  <Button variant="outline" size="sm" className="h-8 rounded-md text-[11px] gap-1.5"
                    onClick={() => setStatus('new')} disabled={saving}>
                    Reopen
                  </Button>
                )}
                <Button variant="outline" size="sm"
                  className="h-8 rounded-md text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20 ml-auto"
                  onClick={confirmDelete}>
                  <Trash2 size={11} /> Delete
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <DetailSection title="Contact">
                <div className="p-3 space-y-2">
                  <ContactRow icon={Mail} label="Email" value={inquiry.client_email} href={`mailto:${inquiry.client_email}`} />
                  {inquiry.client_phone && <ContactRow icon={Phone} label="Phone" value={inquiry.client_phone} href={`tel:${inquiry.client_phone}`} />}
                </div>
              </DetailSection>

              <DetailSection title="Project">
                <div className="p-3 space-y-0.5">
                  <FieldRow label="Service"    value={SERVICE_LABEL[inquiry.service_type] || '—'} />
                  <FieldRow label="Room scope" value={ROOM_SCOPE_LABEL[inquiry.room_scope] || '—'} />
                  <FieldRow label="Budget"     value={BUDGET_LABEL[inquiry.budget_range] || '—'} />
                  <FieldRow label="Timeline"   value={TIMELINE_LABEL[inquiry.timeline] || '—'} />
                  <FieldRow label="Received"   value={fmtDateTime(inquiry.created_at)} />
                  {inquiry.contacted_at && <FieldRow label="Contacted" value={fmtDateTime(inquiry.contacted_at)} />}
                  {inquiry.closed_at    && <FieldRow label="Closed"    value={fmtDateTime(inquiry.closed_at)} />}
                </div>
              </DetailSection>

              {(inquiry.property_type || inquiry.property_address) && (
                <DetailSection title="Property">
                  <div className="p-3 space-y-0.5">
                    {inquiry.property_type    && <FieldRow label="Type"    value={inquiry.property_type} />}
                    {inquiry.property_address && <FieldRow label="Address" value={inquiry.property_address} />}
                  </div>
                </DetailSection>
              )}

              {inquiry.message && (
                <DetailSection title="Client message">
                  <div className="p-3"><p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">{inquiry.message}</p></div>
                </DetailSection>
              )}

              {images.length > 0 && (
                <DetailSection title={`Reference photos · ${images.length}`}>
                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-2">
                      {images.map((img, idx) => (
                        <a key={idx} href={img.url} target="_blank" rel="noreferrer noopener"
                          className="relative aspect-square rounded-md overflow-hidden border border-border bg-card hover:opacity-90 transition-opacity group flex items-center justify-center">
                          <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                            <ExternalLink size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </DetailSection>
              )}

              <DetailSection title="Your notes">
                <div className="p-3">
                  <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={saveNotes}
                    rows={4} maxLength={2000} placeholder="Internal notes — only you see these"
                    className="w-full text-xs rounded-md resize-none bg-card border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30" />
                  <p className="text-[11px] text-foreground mt-1 text-right tabular-nums">
                    {notesSaving ? 'Saving…' : 'Saves when you click away'}
                  </p>
                </div>
              </DetailSection>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

type DetailSectionProps = {
  title: string
  children: ReactNode
}

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground mb-2 px-0.5">{title}</h4>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">{children}</div>
    </div>
  )
}
type ContactRowProps = {
  icon: LucideIcon
  label: string
  value: any
  href: string
}

function ContactRow({ icon: Icon, label, value, href }: ContactRowProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon size={12} className="text-foreground flex-shrink-0" />
      <span className="text-[11px] font-semibold text-foreground min-w-[52px] flex-shrink-0">{label}</span>
      <a href={href} className="text-xs text-foreground hover:text-brand hover:underline truncate">{value}</a>
    </div>
  )
}
type FieldRowProps = {
  label: string
  value: any
}

function FieldRow({ label, value }: FieldRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11px] font-semibold text-foreground min-w-[72px]">{label}</span>
      <span className="text-xs text-foreground text-right break-words">{value}</span>
    </div>
  )
}
