// src/components/admin/inquiries/InquiriesPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox, Search, RefreshCw, X, Mail, Phone,
  Check, Trash2, AlertTriangle,
  ExternalLink, ChevronLeft, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { listInquiries, updateInquiry, deleteInquiry } from '@/lib/inquiries'

const BRAND = '#2d568e'
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'
const PAGE_SIZE = 25

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
function fmtDateShort(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
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
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash = hash & hash
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function OwnerAvatar({ name, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses =
    size === 'lg' ? 'w-12 h-12 text-base' :
    size === 'sm' ? 'w-8 h-8 text-[11px]' :
    'w-10 h-10 text-sm'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

const STATUS_META = {
  new:       { label: 'New',       pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  contacted: { label: 'Contacted', pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  closed:    { label: 'Closed',    pill: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20' },
}
const INQUIRY_TYPE_LABEL = { manage: 'Manage', sell: 'Sell', both: 'Both' }

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.new
  return (
    <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border', m.pill)}>
      {m.label}
    </span>
  )
}

function SummaryCards({ inquiries }) {
  const stats = useMemo(() => ({
    total:     inquiries.length,
    new:       inquiries.filter((i) => i.status === 'new').length,
    contacted: inquiries.filter((i) => i.status === 'contacted').length,
    closed:    inquiries.filter((i) => i.status === 'closed').length,
  }), [inquiries])

  const cards = [
    { label: 'Total',     value: stats.total,     icon: Inbox },
    { label: 'New',       value: stats.new,       icon: AlertTriangle },
    { label: 'Contacted', value: stats.contacted, icon: Phone },
    { label: 'Closed',    value: stats.closed,    icon: Check },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-lg bg-card border border-border shadow-sm p-4"
        >
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

function PillBar({ tabs, active, onChange, counts }) {
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
  }, [active, counts])

  return (
    <div className="inline-flex items-center p-1 rounded-full bg-muted/60 border border-border/60">
      <div ref={containerRef} className="relative inline-flex items-center gap-1">
        <motion.div
          className="absolute top-0 bottom-0 rounded-full bg-card shadow-sm border border-border z-0"
          animate={{ left: indicator.left, width: indicator.width }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        />
        {tabs.map((tab) => {
          const isActive = active === tab.id
          const count = counts[tab.id] ?? 0
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
              <span className={cn('ml-1 tabular-nums', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DateRangeFilter({ from, to, onFromChange, onToChange, onClear }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const [localFrom, setLocalFrom] = useState(from || '')
  const [localTo, setLocalTo] = useState(to || '')

  useEffect(() => {
    setLocalFrom(from || '')
    setLocalTo(to || '')
  }, [from, to])

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
    onFromChange(localFrom)
    onToChange(localTo)
    setOpen(false)
  }
  const clear = () => {
    setLocalFrom('')
    setLocalTo('')
    onClear?.()
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold transition-colors border',
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
        <span className="hidden sm:inline truncate max-w-[160px]">{summary}</span>
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
            className="absolute right-0 z-30 mt-1 w-[280px] rounded-xl bg-popover border border-border shadow-xl p-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Received date range
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">From</label>
                <input
                  type="date"
                  value={localFrom}
                  onChange={(e) => setLocalFrom(e.target.value)}
                  max={localTo || undefined}
                  className="w-full h-8 text-xs rounded border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">To</label>
                <input
                  type="date"
                  value={localTo}
                  onChange={(e) => setLocalTo(e.target.value)}
                  min={localFrom || undefined}
                  className="w-full h-8 text-xs rounded border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>
            {localFrom && localTo && localTo < localFrom && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-1.5">
                End date must be on or after start date.
              </p>
            )}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
              <button
                type="button"
                onClick={clear}
                disabled={!localFrom && !localTo}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!!localFrom && !!localTo && localTo < localFrom}
                className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-foreground text-background text-[11px] font-semibold hover:opacity-90 disabled:opacity-40"
              >
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

function InquiryRow({ inquiry, selected, onClick }) {
  const ago = timeAgo(inquiry.created_at)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={{
        backgroundColor: selected ? 'rgba(45, 86, 142, 0.10)' : 'rgba(45, 86, 142, 0)',
      }}
      transition={{ duration: 0.22 }}
      whileHover={{ backgroundColor: selected ? 'rgba(45, 86, 142, 0.14)' : 'rgba(45, 86, 142, 0.05)' }}
      className="w-full text-left px-4 py-3 border-b border-border cursor-pointer select-none
                 grid grid-cols-[1.6fr_1.2fr_1.2fr_120px_120px] gap-4 items-center"
    >
      <div className="flex items-center gap-2 min-w-0">
        <OwnerAvatar name={inquiry.owner_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{inquiry.owner_name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{inquiry.owner_email}</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-foreground truncate">{inquiry.building || inquiry.location || '—'}</p>
        <p className="text-[10px] text-muted-foreground truncate">{inquiry.property_type || 'Property TBD'}</p>
      </div>
      <div className="min-w-0">
        <span className={cn(
          'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border',
          inquiry.inquiry_type === 'sell'
            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
            : inquiry.inquiry_type === 'both'
              ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
              : 'bg-[#2d568e]/10 text-[#2d568e] dark:text-blue-400 border-[#2d568e]/20',
        )}>
          {INQUIRY_TYPE_LABEL[inquiry.inquiry_type] || 'Manage'}
        </span>
      </div>
      <div className="text-[11px] tabular-nums text-foreground min-w-0">
        <div className="truncate">{fmtDate(inquiry.created_at)}</div>
        <div className="text-[10px] text-muted-foreground truncate">{ago}</div>
      </div>
      <div className="flex items-center justify-end flex-shrink-0">
        <StatusBadge status={inquiry.status} />
      </div>
    </motion.button>
  )
}

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const [selectedId, setSelectedId] = useState(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async (signal) => {
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    try {
      const data = await listInquiries()
      if (signal?.aborted) return
      setInquiries(data)
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load inquiries:', err)
      toast.error('Failed to load inquiries')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
        hasLoadedOnce.current = true
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
      .channel(`inquiries-realtime-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_inquiries' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchData])

  const counts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const scoped = tokens.length === 0
      ? inquiries
      : inquiries.filter((i) => {
          const hay = [
            i.owner_name, i.owner_email, i.owner_phone,
            i.building, i.location, i.property_type, i.message,
          ].filter(Boolean).join(' ').toLowerCase()
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
        const hay = [
          i.owner_name, i.owner_email, i.owner_phone,
          i.building, i.location, i.property_type, i.message,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!tokens.every((tok) => hay.includes(tok))) return false
      }
      return true
    })
  }, [inquiries, debouncedSearch, statusFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])
  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter, dateFrom, dateTo])

  const selected = useMemo(() => inquiries.find((i) => i.id === selectedId) || null, [inquiries, selectedId])

  const handleUpdate = useCallback(async (id, patch) => {
    try {
      const updated = await updateInquiry(id, patch)
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
      await deleteInquiry(id)
      setInquiries((prev) => prev.filter((i) => i.id !== id))
      setSelectedId(null)
      toast.success('Inquiry deleted')
    } catch (err) {
      console.error(err)
      toast.error('Failed to delete')
    }
  }, [])

  const tabs = [
    { id: 'all',       label: 'All' },
    { id: 'new',       label: 'New' },
    { id: 'contacted', label: 'Contacted' },
    { id: 'closed',    label: 'Closed' },
  ]

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">
        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards inquiries={inquiries} />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search name, email, building, message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-lg"
            />
          </div>
          <Button
            variant="outline" size="sm"
            onClick={fetchData} disabled={refreshing}
            className="h-9 rounded-lg transition-all duration-150"
            title="Refresh"
          >
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          </Button>
          <DateRangeFilter
            from={dateFrom} to={dateTo}
            onFromChange={setDateFrom} onToChange={setDateTo}
            onClear={() => { setDateFrom(''); setDateTo('') }}
          />
        </div>

        <div className="flex-shrink-0 flex items-center gap-3 flex-wrap">
          <PillBar tabs={tabs} active={statusFilter} onChange={setStatusFilter} counts={counts} />
        </div>

        <div className="flex-1 min-h-0 rounded-lg border border-border shadow-sm overflow-hidden bg-card flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 px-4 py-2.5 border-b border-border bg-card
                            grid grid-cols-[1.6fr_1.2fr_1.2fr_120px_120px] gap-4 items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Owner</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Property</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Intent</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground truncate">Received</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground text-right truncate">Status</span>
            </div>

            {loading ? (
              <div className="space-y-2 p-3">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : pageItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center py-12">
                <div>
                  <Inbox size={36} className="text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-foreground font-semibold">
                    {inquiries.length === 0 ? 'No inquiries yet' : 'Nothing matches these filters'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {inquiries.length === 0
                      ? "When owners submit inquiries on your website, they'll appear here"
                      : 'Try clearing the search or filters'}
                  </p>
                </div>
              </div>
            ) : (
              pageItems.map((inquiry) => (
                <InquiryRow
                  key={inquiry.id}
                  inquiry={inquiry}
                  selected={selectedId === inquiry.id}
                  onClick={() => setSelectedId((prev) => (prev === inquiry.id ? null : inquiry.id))}
                />
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-border bg-card px-3 py-2">
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cn(
                    'p-1.5 rounded-lg border border-border transition-colors',
                    page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted',
                  )}
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="text-[11px] text-muted-foreground tabular-nums px-3">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={cn(
                    'p-1.5 rounded-lg border border-border transition-colors',
                    page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted',
                  )}
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && (
          <InquiryDetailPanel
            inquiry={selected}
            onClose={() => setSelectedId(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function InquiryDetailPanel({ inquiry, onClose, onUpdate, onDelete }) {
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState(inquiry.admin_notes || '')
  const [notesSaving, setNotesSaving] = useState(false)

  useEffect(() => { setNotesDraft(inquiry.admin_notes || '') }, [inquiry.id])

  const setStatus = async (status) => {
    if (status === inquiry.status) return
    setSaving(true)
    try {
      const patch = { status }
      if (status === 'contacted' && !inquiry.contacted_at) patch.contacted_at = new Date().toISOString()
      if (status === 'closed' && !inquiry.closed_at) patch.closed_at = new Date().toISOString()
      await onUpdate(inquiry.id, patch)
      toast.success(`Marked as ${status}`)
    } finally {
      setSaving(false)
    }
  }

  const saveNotes = async () => {
    const cleaned = notesDraft.trim()
    if (cleaned === (inquiry.admin_notes || '')) return
    setNotesSaving(true)
    try {
      await onUpdate(inquiry.id, { admin_notes: cleaned || null })
      toast.success('Notes saved')
    } finally {
      setNotesSaving(false)
    }
  }

  const confirmDelete = () => {
    if (!window.confirm(`Delete inquiry from "${inquiry.owner_name}"?\n\nThis cannot be undone.`)) return
    onDelete(inquiry.id)
  }

  const images = Array.isArray(inquiry.images) ? inquiry.images : []

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 448, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{
        width: { duration: 0.32, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.2 },
      }}
      className="h-full flex-shrink-0 p-3"
      style={{ maxWidth: '100%', width: 448 + 24 }}
    >
      <div
        className="h-full rounded-lg border border-border overflow-hidden flex flex-col bg-card"
        style={{
          boxShadow: '0 12px 32px -12px rgba(15,23,42,0.18), 0 4px 12px -4px rgba(15,23,42,0.08)',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={inquiry.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="h-full flex flex-col min-h-0"
          >
            <div className="flex-shrink-0 px-5 py-4 border-b border-border">
              <div className="flex items-start gap-3">
                <OwnerAvatar name={inquiry.owner_name} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground truncate">{inquiry.owner_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{inquiry.owner_email}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <StatusBadge status={inquiry.status} />
                  </div>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-muted text-foreground flex-shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {inquiry.status !== 'contacted' && (
                  <Button variant="outline" size="sm" className="h-8 rounded-lg text-[11px] gap-1.5"
                    onClick={() => setStatus('contacted')} disabled={saving}>
                    <Phone size={11} /> Mark contacted
                  </Button>
                )}
                {inquiry.status !== 'closed' && (
                  <Button variant="outline" size="sm"
                    className="h-8 rounded-lg text-[11px] gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                    onClick={() => setStatus('closed')} disabled={saving}>
                    <Check size={11} /> Mark closed
                  </Button>
                )}
                {inquiry.status !== 'new' && (
                  <Button variant="outline" size="sm" className="h-8 rounded-lg text-[11px] gap-1.5"
                    onClick={() => setStatus('new')} disabled={saving}>
                    Reopen
                  </Button>
                )}
                <Button variant="outline" size="sm"
                  className="h-8 rounded-lg text-[11px] gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20 ml-auto"
                  onClick={confirmDelete}>
                  <Trash2 size={11} /> Delete
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
              <DetailSection title="Contact">
                <div className="p-3 space-y-2">
                  <ContactRow icon={Mail} label="Email" value={inquiry.owner_email} href={`mailto:${inquiry.owner_email}`} />
                  {inquiry.owner_phone && (
                    <ContactRow icon={Phone} label="Phone" value={inquiry.owner_phone} href={`tel:${inquiry.owner_phone}`} />
                  )}
                </div>
              </DetailSection>

              <DetailSection title="Inquiry">
                <div className="p-3 space-y-0.5">
                  <FieldRow label="Intent"    value={INQUIRY_TYPE_LABEL[inquiry.inquiry_type] || '—'} />
                  <FieldRow label="Received"  value={fmtDateTime(inquiry.created_at)} />
                  {inquiry.contacted_at && <FieldRow label="Contacted" value={fmtDateTime(inquiry.contacted_at)} />}
                  {inquiry.closed_at    && <FieldRow label="Closed"    value={fmtDateTime(inquiry.closed_at)} />}
                </div>
              </DetailSection>

              {(inquiry.property_type || inquiry.building || inquiry.location ||
                inquiry.bedrooms != null || inquiry.bathrooms != null ||
                inquiry.square_meters != null || inquiry.price_per_night != null) && (
                <DetailSection title="Property details">
                  <div className="p-3 space-y-0.5">
                    {inquiry.property_type && <FieldRow label="Type"      value={inquiry.property_type} />}
                    {inquiry.building      && <FieldRow label="Building"  value={inquiry.building} />}
                    {inquiry.location      && <FieldRow label="Location"  value={inquiry.location} />}
                    {inquiry.bedrooms != null     && <FieldRow label="Bedrooms"  value={String(inquiry.bedrooms)} />}
                    {inquiry.bathrooms != null    && <FieldRow label="Bathrooms" value={String(inquiry.bathrooms)} />}
                    {inquiry.square_meters != null && <FieldRow label="Sqm"       value={String(inquiry.square_meters)} />}
                    {inquiry.price_per_night != null && (
                      <FieldRow
                        label="Nightly"
                        value={`₱${Number(inquiry.price_per_night).toLocaleString('en-PH')}`}
                      />
                    )}
                  </div>
                </DetailSection>
              )}

              {inquiry.message && (
                <DetailSection title="Message from owner">
                  <div className="p-3">
                    <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
                      {inquiry.message}
                    </p>
                  </div>
                </DetailSection>
              )}

              {images.length > 0 && (
                <DetailSection title={`Photos · ${images.length}`}>
                  <div className="p-3">
                    <div className="grid grid-cols-3 gap-2">
                      {images.map((img, idx) => (
                        <a
                          key={idx}
                          href={img.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity group flex items-center justify-center"
                        >
                          <img
                            src={img.url}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
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
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    onBlur={saveNotes}
                    rows={4}
                    maxLength={2000}
                    placeholder="Internal notes — only you see these"
                    className="w-full text-xs rounded-lg resize-none bg-background border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/30 placeholder:text-muted-foreground/60"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 text-right tabular-nums">
                    {notesSaving ? 'Saving…' : 'Auto-saves on blur'}
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

function DetailSection({ title, children }) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2 px-0.5">
        {title}
      </h4>
      <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function ContactRow({ icon: Icon, label, value, href }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon size={12} className="text-muted-foreground flex-shrink-0" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[52px] flex-shrink-0">
        {label}
      </span>
      <a href={href} className="text-xs text-foreground hover:text-[#2d568e] hover:underline truncate">
        {value}
      </a>
    </div>
  )
}

function FieldRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold min-w-[72px]">
        {label}
      </span>
      <span className="text-xs text-foreground text-right break-words">
        {value}
      </span>
    </div>
  )
}