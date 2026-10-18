// src/features/admin/interior/InteriorDesignInquiriesPage.tsx
// Clients who sent the Interior Design form. A kanban board by default
// (drag an inquiry from New to Contacted, Discussed, Proposal, Won or Lost,
// noting how it went), or the sortable list.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Inbox, Search, RefreshCw, X, Mail, Phone, Trash2, Sofa } from 'lucide-react'
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
} from '@/lib/api/interiorDesign'
import { InitialsAvatar } from '@/components/crm/Panel'
import { SortHeader, nextSort, ResultsBar, SearchKeyHint, useListShortcuts, CARD_ON_PHONE, MobileSort, useSidePanelMotion, useListCap } from '@/components/crm/listTools'
import { DateRangeFilter } from '@/components/crm/DateRangeFilter'
import {
  STAGE_RANK, STAGE_TABS, stageOf, stagesFor, matchesFilter, isDecided, filterLabel, timeAgo, usePipelineView,
  StageText, PipelineSummary, ViewToggle, StageFilter, StagePath, KanbanBoard, PipelineCard, BoardSkeleton,
  PhotoThumb, PhotoGallery, NotProvided,
} from '@/features/admin/inquiries/pipeline'
import {
  useInquiryActivity, useStageMove, activitySearchText,
  CardActivity, FollowUpText, ActivityPanel, ContactActions,
} from '@/features/admin/inquiries/activity'
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

// Sortable columns. "Stage" runs New → Lost.
const SORT_VALUE = {
  client:   (i) => i.client_name || '',
  property: (i) => i.property_address || i.property_type || '',
  service:  (i) => SERVICE_LABEL[i.service_type] || '',
  received: (i) => i.created_at || '',
  status:   (i) => STAGE_RANK[stageOf(i)],
}
// Newest first; everything else starts A→Z.
const SORT_DEFAULTS = { received: 'desc' }

function searchText(i) {
  return [i.client_name, i.client_email, i.client_phone, i.property_address, i.property_type, i.message]
    .filter(Boolean).join(' ').toLowerCase()
}

type InquiryCardProps = {
  inquiry: any
  entries?: any[]
}

function InquiryCard({ inquiry, entries }: InquiryCardProps) {
  const stage = stageOf(inquiry)
  return (
    <PipelineCard
      name={inquiry.client_name}
      createdAt={inquiry.created_at}
      stage={stage}
      images={inquiry.images}
      title={inquiry.property_address || inquiry.property_type || 'Property TBD'}
      subtitle={[ROOM_SCOPE_LABEL[inquiry.room_scope], TIMELINE_LABEL[inquiry.timeline]].filter(Boolean).join(' · ')}
      tag={[SERVICE_LABEL[inquiry.service_type], BUDGET_LABEL[inquiry.budget_range]].filter(Boolean).join(' · ') || 'Design inquiry'}
      hasPhone={!!inquiry.client_phone}
      footer={<CardActivity entries={entries} followUp={inquiry.follow_up_on} stage={stage} />}
    />
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
      data-row
      className={cn('row-line w-full text-left px-4 py-3 cursor-pointer select-none', ROW_GRID)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <InitialsAvatar name={inquiry.client_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground truncate">{inquiry.client_name}</p>
          <p className="text-[11px] text-foreground truncate">{inquiry.client_email}</p>
        </div>
      </div>
      <div className="min-w-0 max-md:col-span-2 flex items-center gap-2.5">
        <PhotoThumb images={inquiry.images} />
        <div className="min-w-0">
          <p className="text-[12px] text-foreground truncate">{inquiry.property_address || inquiry.property_type || '—'}</p>
          <p className="text-[11px] text-foreground truncate">{inquiry.property_type || 'Type TBD'}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-foreground truncate">{SERVICE_LABEL[inquiry.service_type] || 'Design inquiry'}</p>
        {inquiry.budget_range && <p className="text-[11px] text-foreground truncate">{BUDGET_LABEL[inquiry.budget_range] || ''}</p>}
      </div>
      <div className="text-[12px] tabular-nums text-foreground min-w-0">
        <div className="truncate">{fmtDate(inquiry.created_at)}</div>
        <div className="text-[11px] truncate">{ago}</div>
      </div>
      <div className="flex flex-col items-end gap-0.5 min-w-0">
        <StageText stage={stageOf(inquiry)} />
        {!isDecided(stageOf(inquiry)) && <FollowUpText day={inquiry.follow_up_on} short />}
      </div>
    </motion.button>
  )
}

export default function InteriorDesignInquiriesPage() {
  const listCap = useListCap()
  const [view, setView] = usePipelineView('crm.interior.view')
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

  // Notes and stage history; the search box looks through the notes too.
  const activity = useInquiryActivity('interior')
  const hayOf = useCallback(
    (i) => `${searchText(i)} ${activitySearchText(activity.byInquiry.get(i.id))}`,
    [activity.byInquiry],
  )

  const counts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const scoped = tokens.length === 0
      ? inquiries
      : inquiries.filter((i) => {
          const hay = hayOf(i)
          return tokens.every((tok) => hay.includes(tok))
        })
    const c = Object.fromEntries(STAGE_TABS.map((t) => [t.id, 0]))
    c.all = scoped.length
    for (const i of scoped) c[stageOf(i)]++
    return c
  }, [inquiries, debouncedSearch, hayOf])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    return inquiries.filter((i) => {
      if (!matchesFilter(i, statusFilter)) return false
      if (dateFrom) {
        const d = new Date(i.created_at)
        if (Number.isNaN(d.getTime()) || d < new Date(dateFrom + 'T00:00:00')) return false
      }
      if (dateTo) {
        const d = new Date(i.created_at)
        if (Number.isNaN(d.getTime()) || d > new Date(dateTo + 'T23:59:59')) return false
      }
      if (tokens.length > 0) {
        const hay = hayOf(i)
        if (!tokens.every((tok) => hay.includes(tok))) return false
      }
      return true
    })
  }, [inquiries, debouncedSearch, statusFilter, dateFrom, dateTo, hayOf])

  // Column sorting; newest first by default. The board keeps the same order in each lane.
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
  const toggleSelected = useCallback((id) => setSelectedId((prev) => (prev === id ? null : id)), [])

  // Keyboard: "/" jumps to search, Esc closes the open inquiry.
  const searchRef = useRef(null)
  const closePanel = useCallback(() => setSelectedId(null), [])
  useListShortcuts({ searchRef, onEscape: selectedId ? closePanel : null })

  const clearDates = () => { setDateFrom(''); setDateTo('') }
  const clearAllFilters = () => { setStatusFilter('all'); setSearch(''); clearDates() }
  const filterChips = [
    statusFilter !== 'all' && { key: 'status', label: filterLabel(statusFilter), onRemove: () => setStatusFilter('all') },
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

  const { moveStage, stageDialog } = useStageMove({
    board: 'interior',
    setItems: setInquiries,
    save: updateInteriorInquiry,
    addActivity: activity.add,
    nameOf: (i) => i.client_name || 'Inquiry',
  })

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
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <div data-page-scroll className="px-4 py-4 md:px-8 md:py-6 flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto [&>*]:flex-shrink-0">
          <div className="flex-shrink-0">
            <PipelineSummary inquiries={inquiries} icon={Sofa} allLabel="All design inquiries" active={statusFilter} onSelect={setStatusFilter} />
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

          <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
            <ViewToggle value={view} onChange={setView} />
            {view === 'list' && (
              <div className="flex-1 min-w-[280px]">
                <StageFilter value={statusFilter} onChange={setStatusFilter} counts={counts} />
              </div>
            )}
          </div>

          {!loading && (
            <ResultsBar
              shown={sorted.length}
              total={inquiries.length}
              noun={inquiries.length === 1 ? 'inquiry' : 'inquiries'}
              chips={filterChips}
              onClearAll={clearAllFilters}
              hint={view === 'board' ? 'Drag a card to another stage · Press / to search' : 'Click a column to sort · Press / to search'}
            />
          )}

          {view === 'board' ? (
            loading ? <BoardSkeleton /> : (
              <KanbanBoard
                items={sorted}
                stages={stagesFor(statusFilter)}
                selectedId={selectedId}
                onOpen={toggleSelected}
                onMove={moveStage}
                nameOf={(i) => i.client_name || 'inquiry'}
                renderCard={(i) => <InquiryCard inquiry={i} entries={activity.byInquiry.get(i.id)} />}
              />
            )
          ) : (
            <div className="rounded-md border border-border shadow-sm overflow-hidden bg-card">
              <div {...listCap} className="overflow-y-auto">
                <MobileSort
                  options={[{ key: 'client', label: 'Client' }, { key: 'property', label: 'Property' }, { key: 'service', label: 'Service' }, { key: 'received', label: 'Received' }, { key: 'status', label: 'Stage' }]}
                  sort={sort}
                  onSort={onSort}
                  className="sticky top-0 z-10"
                />
                <div className={cn('sticky top-0 z-10 px-4 py-2.5 border-b border-border bg-card max-md:hidden', ROW_GRID)}>
                  <SortHeader label="Client" sortKey="client" sort={sort} onSort={onSort} />
                  <SortHeader label="Property" sortKey="property" sort={sort} onSort={onSort} />
                  <SortHeader label="Service" sortKey="service" sort={sort} onSort={onSort} />
                  <SortHeader label="Received" sortKey="received" sort={sort} onSort={onSort} />
                  <SortHeader label="Stage" sortKey="status" sort={sort} onSort={onSort} align="right" />
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
                      onClick={() => toggleSelected(inquiry.id)} />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <InquiryDetailPanel
            inquiry={selected}
            entries={activity.byInquiry.get(selected.id)}
            onClose={() => setSelectedId(null)}
            onUpdate={handleUpdate}
            onMove={moveStage}
            onAddActivity={activity.add}
            onRemoveActivity={activity.remove}
            onDelete={handleDelete}
          />
        )}
      </AnimatePresence>

      {stageDialog}
    </div>
  )
}

type InquiryDetailPanelProps = {
  inquiry: any
  entries?: any[]
  onClose: () => void
  onUpdate: (id: any, patch: any) => Promise<any>
  onMove: (inquiry: any, stage: string) => void
  onAddActivity: (inquiryId: any, entry: any) => Promise<any>
  onRemoveActivity: (id: any) => Promise<void>
  onDelete: (id: any) => Promise<void>
}

function InquiryDetailPanel({ inquiry, entries, onClose, onUpdate, onMove, onAddActivity, onRemoveActivity, onDelete }: InquiryDetailPanelProps) {
  // The next note's type; Call / Text / Email set it, so the note is ready to log.
  const [noteTag, setNoteTag] = useState(null)
  useEffect(() => { setNoteTag(null) }, [inquiry.id])

  const confirmDelete = () => {
    if (!window.confirm(`Delete inquiry from "${inquiry.client_name}"?\n\nThis cannot be undone.`)) return
    onDelete(inquiry.id)
  }

  const stage = stageOf(inquiry)
  const images = Array.isArray(inquiry.images) ? inquiry.images : []

  const panelMotion = useSidePanelMotion(PANEL_WIDTH)

  return (
    <motion.div {...panelMotion}>
      <div className="h-full rounded-md border border-border bg-card shadow-lg overflow-hidden flex flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={inquiry.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }} className="h-full flex flex-col min-h-0">
            <div className="flex-shrink-0 px-5 py-4 line-below">
              <div className="flex items-start gap-3">
                <InitialsAvatar name={inquiry.client_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground truncate">{inquiry.client_name}</p>
                  <p className="text-[11px] text-foreground truncate">{inquiry.client_email}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <StageText stage={stage} />
                    <span className="text-[11px] text-foreground">· {timeAgo(inquiry.created_at)}</span>
                  </div>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md hover:bg-muted text-foreground flex-shrink-0"><X size={16} /></button>
              </div>

              <div className="mt-3">
                <StagePath inquiry={inquiry} onMove={onMove} />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <DetailSection title="Contact">
                <div className="p-3 space-y-2">
                  <ContactRow icon={Mail} label="Email" value={inquiry.client_email} href={`mailto:${inquiry.client_email}`} />
                  <ContactRow icon={Phone} label="Phone" value={inquiry.client_phone} href={`tel:${inquiry.client_phone}`} />
                  <div className="pt-1">
                    <ContactActions phone={inquiry.client_phone} email={inquiry.client_email} onPick={setNoteTag} />
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="Activity">
                <ActivityPanel
                  inquiry={inquiry}
                  entries={entries}
                  tag={noteTag}
                  onTag={setNoteTag}
                  onAdd={(entry) => onAddActivity(inquiry.id, entry)}
                  onRemove={onRemoveActivity}
                  onFollowUp={(day) => onUpdate(inquiry.id, { follow_up_on: day })}
                  receivedLabel="Sent the Interior Design form"
                />
              </DetailSection>

              <DetailSection title="Project">
                <div className="p-3 space-y-0.5">
                  <FieldRow label="Service"    value={SERVICE_LABEL[inquiry.service_type]} />
                  <FieldRow label="Room scope" value={ROOM_SCOPE_LABEL[inquiry.room_scope]} />
                  <FieldRow label="Budget"     value={BUDGET_LABEL[inquiry.budget_range]} />
                  <FieldRow label="Timeline"   value={TIMELINE_LABEL[inquiry.timeline]} />
                  <FieldRow label="Received"   value={fmtDateTime(inquiry.created_at)} />
                  {inquiry.contacted_at && <FieldRow label="Contacted" value={fmtDateTime(inquiry.contacted_at)} />}
                  {inquiry.closed_at && (stage === 'won' || stage === 'lost') && (
                    <FieldRow label={stage === 'won' ? 'Won' : 'Lost'} value={fmtDateTime(inquiry.closed_at)} />
                  )}
                </div>
              </DetailSection>

              <DetailSection title="Property">
                <div className="p-3 space-y-0.5">
                  <FieldRow label="Type"    value={inquiry.property_type} />
                  <FieldRow label="Address" value={inquiry.property_address} />
                </div>
              </DetailSection>

              <DetailSection title="Client message">
                <div className="p-3">
                  <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
                    {inquiry.message || <NotProvided>No message</NotProvided>}
                  </p>
                </div>
              </DetailSection>

              <DetailSection title={images.length > 0 ? `Reference photos · ${images.length}` : 'Reference photos'}>
                <PhotoGallery images={images} />
              </DetailSection>

              <div className="flex justify-end">
                <Button variant="outline" size="sm"
                  className="h-8 rounded-md text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                  onClick={confirmDelete}>
                  <Trash2 size={11} /> Delete inquiry
                </Button>
              </div>
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
      {value
        ? <a href={href} className="text-xs text-foreground hover:text-brand hover:underline truncate">{value}</a>
        : <span className="text-xs text-foreground"><NotProvided /></span>}
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
      <span className="text-xs text-foreground text-right break-words">{value == null || value === '' ? <NotProvided /> : value}</span>
    </div>
  )
}
