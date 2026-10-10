// src/components/admin/campaigns/CampaignsPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Megaphone, Search, RefreshCw, X, Send, Image as ImageIcon,
  Loader2, Check, AlertTriangle, Users, History,
  Mail, ChevronLeft, ChevronRight, Info, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import {
  listPastGuests,
  listCampaigns,
  sendPromoCampaign,
  uploadCampaignImage,
} from '@/lib/email'

const BRAND = '#2d568e'
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'
const PAGE_SIZE = 25
const MAX_RECIPIENTS = 500

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
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
function GuestAvatar({ name, size = 'md' }) {
  const [bg, text, dbg, dtext] = avatarColor(name)
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold flex-shrink-0', sizeClasses, bg, text, dbg, dtext)}>
      {initials(name)}
    </div>
  )
}

const STATUS_TEXT = {
  drafting: { label: 'Drafting', className: 'text-gray-500 dark:text-gray-400' },
  sending:  { label: 'Sending',  className: 'text-amber-600 dark:text-amber-400' },
  sent:     { label: 'Sent',     className: 'text-emerald-600 dark:text-emerald-400' },
  failed:   { label: 'Failed',   className: 'text-red-600 dark:text-red-400' },
}
function CampaignStatusPill({ status }) {
  const config = STATUS_TEXT[status] || STATUS_TEXT.drafting
  return <span className={cn('text-[11px] font-semibold', config.className)}>{config.label}</span>
}

function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-0.5">
      {Icon ? <Icon size={14} className="text-foreground flex-shrink-0" /> : null}
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">{title}</h3>
      {subtitle && <span className="text-[11px] text-muted-foreground tabular-nums truncate">{subtitle}</span>}
      {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
    </div>
  )
}

function SummaryCards({ guests, campaigns }) {
  const stats = useMemo(() => {
    const totalGuests = guests.length
    const sentCampaigns = campaigns.filter((c) => c.status === 'sent').length
    const totalDelivered = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0)
    const totalFailed = campaigns.reduce((s, c) => s + (c.failed_count || 0), 0)
    return { totalGuests, sentCampaigns, totalDelivered, totalFailed }
  }, [guests, campaigns])

  const cards = [
    { label: 'Eligible Guests',  value: stats.totalGuests,     icon: Users },
    { label: 'Campaigns Sent',   value: stats.sentCampaigns,   icon: Megaphone },
    { label: 'Emails Delivered', value: stats.totalDelivered,  icon: Mail },
    { label: 'Emails Failed',    value: stats.totalFailed,     icon: AlertTriangle },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div key={card.label}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-lg bg-card border border-border shadow-sm p-4">
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

function RecipientRow({ guest, checked, onToggle, disabled }) {
  const staysAgo = useMemo(() => {
    if (!guest.last_check_out) return ''
    const then = new Date(`${guest.last_check_out}T00:00:00Z`).getTime()
    const days = Math.floor((Date.now() - then) / 86_400_000)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
  }, [guest.last_check_out])

  return (
    <button type="button" disabled={disabled} onClick={onToggle}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors flex items-center gap-3',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40',
      )}>
      <input type="checkbox" checked={checked} readOnly
        className="rounded border-border flex-shrink-0 pointer-events-none w-4 h-4" />
      <GuestAvatar name={guest.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-medium text-foreground truncate">{guest.name || 'Guest'}</span>
          {guest.last_unit && (
            <span className="text-[10px] text-muted-foreground font-mono truncate flex-shrink-0">{guest.last_unit}</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{guest.email}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[11px] text-foreground tabular-nums">{fmtDate(guest.last_check_out)}</div>
        <div className="text-[10px] text-muted-foreground">{staysAgo}</div>
      </div>
    </button>
  )
}

const TIME_FILTERS = [
  { id: 'all', label: 'All time' },
  { id: '6',   label: 'Last 6 months' },
  { id: '12',  label: 'Last 12 months' },
  { id: '24',  label: 'Last 2 years' },
]

// ─────────────────────────────────────────────────────────────
// PillBar — matches shared shape
// ─────────────────────────────────────────────────────────────
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
                <span className={cn('ml-1 tabular-nums', isActive ? 'opacity-90' : 'opacity-60')}>{count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DateRangeFilter — matches BookingsPage shape
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
    setLocalFrom(''); setLocalTo(''); onClear?.(); setOpen(false)
  }

  return (
    <div className="relative flex-shrink-0" ref={wrapRef}>
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
            className="absolute right-0 z-30 mt-1 w-[280px] rounded-xl bg-popover border border-border shadow-xl p-3"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Date range
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">From</label>
                <input type="date" value={localFrom} onChange={(e) => setLocalFrom(e.target.value)} max={localTo || undefined}
                  className="w-full h-8 text-xs rounded border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">To</label>
                <input type="date" value={localTo} onChange={(e) => setLocalTo(e.target.value)} min={localFrom || undefined}
                  className="w-full h-8 text-xs rounded border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring/30" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
              <button type="button" onClick={clear} disabled={!localFrom && !localTo}
                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">
                Clear
              </button>
              <button type="button" onClick={apply}
                className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-foreground text-background text-[11px] font-semibold hover:opacity-90">
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

export default function CampaignsPage() {
  const [guests, setGuests] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [selected, setSelected] = useState(new Set())
  const [page, setPage] = useState(1)

  const [campaignName, setCampaignName] = useState('')
  const [subject, setSubject] = useState('')
  const [greeting, setGreeting] = useState('Hi {{guest_name}},')
  const [body, setBody] = useState('')
  const [signoff1, setSignoff1] = useState('Warm regards,')
  const [signoff2, setSignoff2] = useState('Iloilo Rentals')
  const [replyTo, setReplyTo] = useState('')
  const [heroImage, setHeroImage] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState(null)

  const [view, setView] = useState('compose')
  const [showConfirm, setShowConfirm] = useState(false)

  const imageInputRef = useRef(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async (signal) => {
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    try {
      const [g, c] = await Promise.all([listPastGuests(), listCampaigns()])
      if (signal?.aborted) return
      setGuests(g)
      setCampaigns(c)
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Failed to load campaigns data:', err)
      toast.error('Failed to load campaigns')
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

  const filteredGuests = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    const cutoffISO = (() => {
      if (timeFilter === 'all') return null
      const months = Number(timeFilter)
      const d = new Date()
      d.setMonth(d.getMonth() - months)
      return d.toISOString().slice(0, 10)
    })()

    return guests.filter((g) => {
      if (cutoffISO && (g.last_check_out || '') < cutoffISO) return false
      if (dateFrom && (g.last_check_out || '') < dateFrom) return false
      if (dateTo && (g.last_check_out || '') > dateTo) return false
      if (tokens.length > 0) {
        const hay = `${g.name || ''} ${g.email || ''} ${g.last_unit || ''} ${g.last_building || ''}`.toLowerCase()
        if (!tokens.every((tok) => hay.includes(tok))) return false
      }
      return true
    })
  }, [guests, debouncedSearch, timeFilter, dateFrom, dateTo])

  const filteredCampaigns = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const tokens = q ? q.split(/\s+/).filter(Boolean) : []
    let list = campaigns
    if (dateFrom) list = list.filter((c) => (c.created_at || '').slice(0, 10) >= dateFrom)
    if (dateTo) list = list.filter((c) => (c.created_at || '').slice(0, 10) <= dateTo)
    if (tokens.length === 0) return list
    return list.filter((c) => {
      const hay = `${c.name || ''} ${c.subject || ''}`.toLowerCase()
      return tokens.every((tok) => hay.includes(tok))
    })
  }, [campaigns, debouncedSearch, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filteredGuests.length / PAGE_SIZE))
  const pageItems = useMemo(() => filteredGuests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredGuests, page])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])

  const toggleOne = useCallback((email) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else {
        if (next.size >= MAX_RECIPIENTS) { toast.error(`Maximum ${MAX_RECIPIENTS} recipients per campaign.`); return prev }
        next.add(email)
      }
      return next
    })
  }, [])

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allVisibleSelected = pageItems.length > 0 && pageItems.every((g) => next.has(g.email))
      if (allVisibleSelected) { for (const g of pageItems) next.delete(g.email) }
      else {
        const toAdd = pageItems.filter((g) => !next.has(g.email))
        const canAddCount = MAX_RECIPIENTS - next.size
        if (toAdd.length > canAddCount) {
          if (canAddCount <= 0) { toast.error(`You already have the maximum ${MAX_RECIPIENTS} selected.`); return prev }
          toast.error(`Only added ${canAddCount} of ${toAdd.length}. Max is ${MAX_RECIPIENTS}.`)
          for (let i = 0; i < canAddCount; i++) next.add(toAdd[i].email)
        } else { for (const g of pageItems) next.add(g.email) }
      }
      return next
    })
  }, [pageItems])

  const clearSelection = useCallback(() => setSelected(new Set()), [])
  const allVisibleSelected = pageItems.length > 0 && pageItems.every((g) => selected.has(g.email))
  const selectedGuests = useMemo(() => guests.filter((g) => selected.has(g.email)), [guests, selected])

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const { url } = await uploadCampaignImage(file)
      setHeroImage({ url, alt: file.name })
      toast.success('Image attached')
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Upload failed')
    } finally {
      setUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const resetForm = useCallback(() => {
    setCampaignName('')
    setSubject('')
    setGreeting('Hi {{guest_name}},')
    setBody('')
    setSignoff1('Warm regards,')
    setSignoff2('Iloilo Rentals')
    setReplyTo('')
    setHeroImage(null)
  }, [])

  const validatePayload = () => {
    if (!campaignName.trim()) { toast.error('Give this campaign a name'); return false }
    if (!subject.trim())      { toast.error('Subject is required');       return false }
    if (!greeting.trim())     { toast.error('Greeting is required');      return false }
    if (!body.trim())         { toast.error('Message body is required');  return false }
    if (selectedGuests.length > MAX_RECIPIENTS) { toast.error(`You can select at most ${MAX_RECIPIENTS} recipients.`); return false }
    return true
  }

  const buildPayload = () => ({
    name: campaignName.trim(),
    subject: subject.trim(),
    greeting: greeting.trim(),
    body: body.trim(),
    signoff1: signoff1.trim(),
    signoff2: signoff2.trim(),
    image_url: heroImage?.url || null,
    image_alt: heroImage?.alt || null,
    reply_to: replyTo.trim() || null,
  })

  const handleOpenConfirm = () => {
    if (!validatePayload()) return
    if (selectedGuests.length === 0) { toast.error('Select at least one recipient'); return }
    setShowConfirm(true)
  }

  const handleSendReal = async () => {
    setShowConfirm(false)
    setSending(true)
    setSendProgress({ current: 0, total: selectedGuests.length })
    try {
      const payload = {
        ...buildPayload(),
        recipients: selectedGuests.map((g) => ({ email: g.email, name: g.name })),
      }
      const res = await sendPromoCampaign(payload)
      const sentCount = Number(res?.sent ?? 0)
      const failedCount = Number(res?.failed ?? 0)
      const totalCount = Number(res?.recipient_count ?? selectedGuests.length)
      const skippedOptedOut = Number(res?.skipped_opted_out ?? 0)
      const skippedThrottled = Number(res?.skipped_throttled ?? 0)
      const skipped = skippedOptedOut + skippedThrottled
      setSendProgress({ current: sentCount + failedCount, total: totalCount })
      if (failedCount === 0 && skipped === 0) toast.success(`Sent to all ${sentCount} guest${sentCount === 1 ? '' : 's'}`)
      else if (sentCount === 0 && failedCount > 0) toast.error(`Send failed for all ${failedCount} recipient${failedCount === 1 ? '' : 's'}.`)
      else {
        const parts = [`Sent ${sentCount}`]
        if (failedCount > 0) parts.push(`${failedCount} failed`)
        if (skippedOptedOut > 0) parts.push(`${skippedOptedOut} opted out`)
        if (skippedThrottled > 0) parts.push(`${skippedThrottled} throttled`)
        toast(parts.join(' · '), { icon: '⚠️', duration: 6000 })
      }
      resetForm(); clearSelection(); setView('history'); setPage(1); fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Send failed')
    } finally {
      setSending(false)
      setSendProgress(null)
    }
  }

  const handleViewChange = (v) => { setView(v); setPage(1) }

  const viewTabs = [
    { id: 'compose', label: 'Compose' },
    { id: 'history', label: 'History' },
  ]

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">
        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards guests={guests} campaigns={campaigns} />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
          <PillBar tabs={viewTabs} active={view} onChange={handleViewChange} />

          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={view === 'compose' ? 'Search guests by name, email, unit…' : 'Search campaigns by name or subject…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-lg"
            />
          </div>

          <Button variant="outline" size="sm" onClick={fetchData} disabled={refreshing} className="h-9 rounded-lg flex-shrink-0" title="Refresh">
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          </Button>

          <DateRangeFilter
            from={dateFrom} to={dateTo}
            onFromChange={setDateFrom} onToChange={setDateTo}
            onClear={() => { setDateFrom(''); setDateTo('') }}
          />
        </div>

        {view === 'compose' ? (
          <ComposeView
            loading={loading}
            filteredGuests={filteredGuests}
            pageItems={pageItems}
            page={page} setPage={setPage} totalPages={totalPages}
            timeFilter={timeFilter} setTimeFilter={setTimeFilter}
            selected={selected}
            toggleOne={toggleOne}
            toggleAllVisible={toggleAllVisible}
            clearSelection={clearSelection}
            allVisibleSelected={allVisibleSelected}
            selectedCount={selectedGuests.length}
            campaignName={campaignName} setCampaignName={setCampaignName}
            subject={subject} setSubject={setSubject}
            greeting={greeting} setGreeting={setGreeting}
            body={body} setBody={setBody}
            signoff1={signoff1} setSignoff1={setSignoff1}
            signoff2={signoff2} setSignoff2={setSignoff2}
            replyTo={replyTo} setReplyTo={setReplyTo}
            heroImage={heroImage} setHeroImage={setHeroImage}
            imageInputRef={imageInputRef}
            uploadingImage={uploadingImage}
            handleImagePick={handleImagePick}
            sending={sending}
            sendProgress={sendProgress}
            onSend={handleOpenConfirm}
          />
        ) : (
          <HistoryView campaigns={filteredCampaigns} totalCampaigns={campaigns.length} loading={loading} onDeleted={fetchData} />
        )}
      </div>

      <AnimatePresence>
        {showConfirm && (
          <ConfirmSendDialog
            recipientCount={selectedGuests.length}
            subject={subject}
            greeting={greeting}
            body={body}
            heroImage={heroImage}
            onCancel={() => setShowConfirm(false)}
            onConfirm={handleSendReal}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ComposeView({
  loading, filteredGuests, pageItems, page, setPage, totalPages, timeFilter, setTimeFilter,
  selected, toggleOne, toggleAllVisible, clearSelection, allVisibleSelected, selectedCount,
  campaignName, setCampaignName, subject, setSubject, greeting, setGreeting,
  body, setBody, signoff1, setSignoff1, signoff2, setSignoff2, replyTo, setReplyTo,
  heroImage, setHeroImage, imageInputRef, uploadingImage, handleImagePick,
  sending, sendProgress, onSend,
}) {
  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block'

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
      <div className="flex flex-col min-h-0">
        <SectionHeader
          icon={Users}
          title="Recipients"
          subtitle={`· ${selectedCount} selected of ${filteredGuests.length} (max ${MAX_RECIPIENTS})`}
          action={selectedCount > 0 && (
            <button type="button" onClick={clearSelection} className="text-[10px] font-semibold text-muted-foreground hover:text-red-600 transition-colors">
              Clear all
            </button>
          )}
        />

        <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border shadow-sm overflow-hidden bg-card">
          <div className="flex-shrink-0 px-3 py-2 border-b border-border space-y-2">
            <PillBar tabs={TIME_FILTERS} active={timeFilter} onChange={setTimeFilter} />
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={toggleAllVisible} disabled={pageItems.length === 0}
                className="text-[11px] font-semibold text-foreground hover:underline disabled:opacity-50">
                {allVisibleSelected ? 'Deselect page' : 'Select page'}
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : pageItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center py-8">
                <div>
                  <Users size={28} className="text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-foreground font-semibold">No eligible guests</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {filteredGuests.length === 0 ? 'Try clearing the search or time filter' : 'Nothing on this page'}
                  </p>
                </div>
              </div>
            ) : (
              pageItems.map((guest) => (
                <RecipientRow key={guest.email} guest={guest}
                  checked={selected.has(guest.email)} onToggle={() => toggleOne(guest.email)} disabled={sending} />
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-border bg-card px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground tabular-nums">Page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className={cn('p-1 rounded-lg border border-border', page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted')}>
                  <ChevronLeft size={12} />
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className={cn('p-1 rounded-lg border border-border', page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted')}>
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col min-h-0">
        <SectionHeader
          icon={Mail}
          title="Compose Email"
          subtitle={selectedCount > 0
            ? `· ${selectedCount} recipient${selectedCount === 1 ? '' : 's'} (max ${MAX_RECIPIENTS})`
            : '· No recipients selected'}
        />

        <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border shadow-sm overflow-hidden bg-card">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <div>
              <label className={labelClass}>Campaign name *</label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Valentine's 2026" maxLength={120} className="h-9 text-xs rounded-lg" disabled={sending} />
              <p className="text-[10px] text-muted-foreground mt-1">Only you see this. Used to identify the campaign in history.</p>
            </div>

            <div>
              <label className={labelClass}>Subject *</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. A special Valentine's offer from us" maxLength={200} className="h-9 text-xs rounded-lg" disabled={sending} />
            </div>

            <div>
              <label className={labelClass}>Greeting *</label>
              <Input value={greeting} onChange={(e) => setGreeting(e.target.value)}
                placeholder="Hi {{guest_name}}," maxLength={300} className="h-9 text-xs rounded-lg" disabled={sending} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Use <code className="font-mono bg-muted px-1 rounded">{'{{guest_name}}'}</code> — replaced automatically per recipient
              </p>
            </div>

            <div>
              <label className={labelClass}>Message *</label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={`This February, we're offering 15% off any stay booked before the 20th.\n\nJust reply to this email to claim it.`}
                rows={8} maxLength={20000} className="text-xs rounded-lg resize-none" disabled={sending} />
              <p className="text-[10px] text-muted-foreground mt-1 text-right tabular-nums">
                {body.length.toLocaleString()} / 20,000
              </p>
            </div>

            <div>
              <label className={labelClass}>Hero image (optional)</label>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={handleImagePick} disabled={uploadingImage || sending} />
              {heroImage ? (
                <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
                  <img src={heroImage.url} alt="" className="w-full h-auto max-h-64 object-cover" />
                  <button type="button" onClick={() => setHeroImage(null)} disabled={sending}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-50" title="Remove">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage || sending}
                  className="w-full flex flex-col items-center justify-center gap-1.5 py-5 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50">
                  {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                  <span className="text-[11px] font-semibold">{uploadingImage ? 'Uploading…' : 'Add a hero image'}</span>
                  <span className="text-[10px]">JPEG, PNG, or WebP · max 5 MB</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Sign-off line 1</label>
                <Input value={signoff1} onChange={(e) => setSignoff1(e.target.value)} placeholder="Warm regards," maxLength={200} className="h-9 text-xs rounded-lg" disabled={sending} />
              </div>
              <div>
                <label className={labelClass}>Sign-off line 2</label>
                <Input value={signoff2} onChange={(e) => setSignoff2(e.target.value)} placeholder="Iloilo Rentals" maxLength={200} className="h-9 text-xs rounded-lg" disabled={sending} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Reply-to (optional)</label>
              <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)}
                placeholder="Leave blank to use your default support address" maxLength={254} className="h-9 text-xs rounded-lg" disabled={sending} />
            </div>

            <div className="rounded-lg bg-muted/40 border border-border p-3 flex items-start gap-2">
              <Info size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Each guest gets a personalized email with <code className="font-mono bg-background px-1 rounded">{'{{guest_name}}'}</code> replaced, plus an unsubscribe link. Guests who unsubscribe won't receive future campaigns.
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground hidden sm:block truncate">
              {sendProgress ? `Sending… ${sendProgress.current} of ${sendProgress.total}`
                : selectedCount > 0 ? `Ready to send to ${selectedCount} guest${selectedCount === 1 ? '' : 's'}`
                : 'Select recipients on the left to continue'}
            </p>
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <Button size="sm" className="h-9 rounded-lg text-xs gap-1.5 text-white" style={{ backgroundColor: BRAND }}
                onClick={onSend} disabled={sending || selectedCount === 0}>
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                {sending ? 'Sending…' : `Send to ${selectedCount}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryView({ campaigns, totalCampaigns, loading, onDeleted }) {
  const [deletingId, setDeletingId] = useState(null)
  const [clearingAll, setClearingAll] = useState(false)

  const showingLabel = totalCampaigns === campaigns.length
    ? `${totalCampaigns}`
    : `${campaigns.length} of ${totalCampaigns}`

  const handleDeleteOne = async (campaign) => {
    const ok = window.confirm(
      `Delete campaign "${campaign.name}"?\n\nRecipients: ${campaign.recipient_count}\nSent: ${campaign.sent_count} · Failed: ${campaign.failed_count}\n\nThis removes it from history. Individual email logs are preserved for audit.`
    )
    if (!ok) return
    setDeletingId(campaign.id)
    try {
      const { error } = await supabase.from('email_campaigns').delete().eq('id', campaign.id)
      if (error) throw error
      toast.success('Campaign deleted')
      onDeleted?.()
    } catch (err) {
      console.error('Delete campaign failed:', err)
      toast.error(err?.message || 'Failed to delete')
    } finally { setDeletingId(null) }
  }

  const handleClearAll = async () => {
    if (campaigns.length === 0) return
    const ok = window.confirm(
      `Delete ALL ${totalCampaigns} campaign${totalCampaigns === 1 ? '' : 's'} from history?\n\nThis removes every campaign record. Individual email logs are preserved for audit. This cannot be undone.`
    )
    if (!ok) return
    const doubleCheck = window.confirm('Are you absolutely sure? This will wipe the whole history.')
    if (!doubleCheck) return
    setClearingAll(true)
    try {
      const { error } = await supabase.from('email_campaigns').delete().not('id', 'is', null)
      if (error) throw error
      toast.success(`Cleared ${totalCampaigns} campaign${totalCampaigns === 1 ? '' : 's'}`)
      onDeleted?.()
    } catch (err) {
      console.error('Clear all failed:', err)
      toast.error(err?.message || 'Failed to clear history')
    } finally { setClearingAll(false) }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <SectionHeader
        icon={History}
        title="Campaign History"
        subtitle={`· ${showingLabel}`}
        action={totalCampaigns > 0 && (
          <button type="button" onClick={handleClearAll} disabled={clearingAll || deletingId !== null}
            className={cn('text-[10px] font-semibold transition-colors',
              clearingAll || deletingId !== null ? 'opacity-50 cursor-not-allowed text-muted-foreground' : 'text-muted-foreground hover:text-red-600')}>
            {clearingAll ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      />

      <div className="flex-1 min-h-0 rounded-lg border border-border shadow-sm overflow-hidden bg-card flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : campaigns.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center py-12">
              <div>
                <Megaphone size={28} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-foreground font-semibold">No campaigns yet</p>
                <p className="text-[10px] text-muted-foreground mt-1">Compose your first campaign and it will appear here</p>
              </div>
            </div>
          ) : (
            campaigns.map((c) => {
              const isDeleting = deletingId === c.id
              const hasFailures = (c.failed_count || 0) > 0
              return (
                <div key={c.id}
                  className={cn('group/history px-4 py-3 border-b border-border last:border-0 transition-colors flex items-start gap-3',
                    isDeleting ? 'opacity-50' : 'hover:bg-muted/30')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{c.subject}</p>
                      </div>
                      <CampaignStatusPill status={c.status} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                      <span className="inline-flex items-center gap-1"><Users size={10} /> {c.recipient_count} recipient{c.recipient_count === 1 ? '' : 's'}</span>
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check size={10} /> {c.sent_count} sent</span>
                      {hasFailures && <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle size={10} /> {c.failed_count} failed</span>}
                      <span className="ml-auto">{fmtDateTime(c.sent_at || c.created_at)}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleDeleteOne(c)} disabled={isDeleting || clearingAll}
                    className={cn('flex-shrink-0 p-1.5 rounded-lg transition-all opacity-0 group-hover/history:opacity-100',
                      'text-muted-foreground hover:text-red-600 hover:bg-red-500/10',
                      (isDeleting || clearingAll) && 'opacity-50 cursor-not-allowed')}
                    title="Delete campaign">
                    {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmSendDialog({ recipientCount, subject, greeting, body, heroImage, onCancel, onConfirm }) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  const bodyPreview = body.length > 280 ? body.slice(0, 280) + '…' : body

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50 cursor-default"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-send-title"
        className="relative bg-card rounded-lg max-w-md w-full border border-border overflow-hidden flex flex-col max-h-[92vh]"
        style={{ boxShadow: SOFT_SHADOW }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 id="confirm-send-title" className="text-sm font-bold text-foreground">Confirm send</h3>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-muted"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>This cannot be undone.</strong> Once sent, emails cannot be recalled or edited.
              Each guest will receive a personalized email with their name substituted for <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{'{{guest_name}}'}</code>.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Recipients</span>
              <span className="font-semibold text-foreground tabular-nums">{recipientCount} guest{recipientCount === 1 ? '' : 's'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground flex-shrink-0">Subject</span>
              <span className="font-semibold text-foreground text-right break-words">{subject}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Preview</p>
            {heroImage && (
              <img src={heroImage.url} alt="" className="w-full h-auto max-h-32 object-cover rounded border border-border" />
            )}
            <p className="text-xs font-semibold text-foreground break-words">{greeting || 'Hi {{guest_name}},'}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">{bodyPreview}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-9 rounded-lg text-xs" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="h-9 rounded-lg text-xs gap-1.5 text-white" style={{ backgroundColor: BRAND }} onClick={onConfirm}>
            <Send size={12} /> Send to {recipientCount}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}