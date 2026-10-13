// src/components/admin/campaigns/CampaignsPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Megaphone, Search, RefreshCw, X, Send, Image as ImageIcon,
  Loader2, Check, AlertTriangle, Users, History,
  Mail, ChevronLeft, ChevronRight, Info, Trash2, MailCheck,
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
import { StatusTabs } from '@/components/admin/_shared/StatusTabs'
import { StatStrip, StatTile } from '@/components/admin/_shared/StatStrip'
import { Panel, PanelHeader, InitialsAvatar } from '@/components/admin/_shared/Panel'
import { SearchKeyHint, useListShortcuts } from '@/components/admin/_shared/listTools'
import { DateRangeFilter } from '@/components/admin/_shared/DateRangeFilter'

const BRAND = 'var(--brand-solid)'
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
function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const STATUS_TEXT = {
  drafting: { label: 'Drafting', className: 'text-foreground' },
  sending:  { label: 'Sending',  className: 'text-amber-600 dark:text-amber-400' },
  sent:     { label: 'Sent',     className: 'text-emerald-600 dark:text-emerald-400' },
  failed:   { label: 'Failed',   className: 'text-red-600 dark:text-red-400' },
}
type CampaignStatusTextProps = {
  status: any
}

function CampaignStatusText({ status }: CampaignStatusTextProps) {
  const config = STATUS_TEXT[status] || STATUS_TEXT.drafting
  return <span className={cn('text-[11.5px] font-semibold whitespace-nowrap', config.className)}>{config.label}</span>
}

// The {{guest_name}} placeholder, shown as code.
function Placeholder() {
  return <code className="font-mono text-[10.5px] border border-border bg-card px-1 rounded">{'{{guest_name}}'}</code>
}

type SummaryCardsProps = {
  guests: any
  campaigns: any
  view: string
  onView: (v: any) => void
}

// KPI strip as on the Dashboard; the tiles switch between compose and history.
function SummaryCards({ guests, campaigns, view, onView }: SummaryCardsProps) {
  const stats = useMemo(() => {
    const sent = campaigns.filter((c) => c.status === 'sent')
    const delivered = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0)
    const failed = campaigns.reduce((s, c) => s + (c.failed_count || 0), 0)
    const lastSent = sent
      .map((c) => c.sent_at || c.created_at)
      .filter(Boolean)
      .sort()
      .pop()
    return { guests: guests.length, sent: sent.length, delivered, failed, lastSent }
  }, [guests, campaigns])

  const attempted = stats.delivered + stats.failed
  const rate = attempted > 0 ? Math.round((stats.delivered / attempted) * 100) : null

  return (
    <StatStrip cols={4}>
      <StatTile icon={Users} label="Eligible guests" value={stats.guests} sub="Past guests you can email" active={view === 'compose'} onClick={() => onView('compose')} />
      <StatTile
        icon={Megaphone}
        label="Campaigns sent"
        value={stats.sent}
        sub={stats.lastSent ? `Last on ${fmtDate(stats.lastSent)}` : 'Nothing sent yet'}
        active={view === 'history'}
        onClick={() => onView('history')}
      />
      <StatTile icon={MailCheck} label="Emails delivered" value={stats.delivered.toLocaleString('en-PH')} sub={rate == null ? 'No emails sent yet' : `${rate}% delivered`} onClick={() => onView('history')} />
      <StatTile
        icon={AlertTriangle}
        label="Emails failed"
        value={stats.failed.toLocaleString('en-PH')}
        sub={stats.failed > 0 ? 'See the history for details' : 'None failed'}
        attention={stats.failed > 0}
        onClick={() => onView('history')}
      />
    </StatStrip>
  )
}

type RecipientRowProps = {
  guest: any
  checked: any
  onToggle: () => any
  disabled: any
}

function RecipientRow({ guest, checked, onToggle, disabled }: RecipientRowProps) {
  // "Stayed 3mo ago" is measured from when the row first showed.
  const [now] = useState(Date.now)
  const staysAgo = useMemo(() => {
    if (!guest.last_check_out) return ''
    const then = new Date(`${guest.last_check_out}T00:00:00Z`).getTime()
    const days = Math.floor((now - then) / 86_400_000)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
  }, [guest.last_check_out, now])

  return (
    <button type="button" disabled={disabled} onClick={onToggle} aria-pressed={checked}
      className={cn(
        'w-full text-left px-5 py-3 border-b border-border last:border-0 transition-colors flex items-center gap-3',
        disabled ? 'opacity-50 cursor-not-allowed' : checked ? 'bg-brand-solid/5 hover:bg-brand-solid/10' : 'hover:bg-muted/40',
      )}>
      <input type="checkbox" checked={checked} readOnly tabIndex={-1}
        className="rounded border-border flex-shrink-0 pointer-events-none w-4 h-4 accent-[var(--brand-solid)]" />
      <InitialsAvatar name={guest.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-foreground truncate">{guest.name || 'Guest'}</span>
          {guest.last_unit && (
            <span className="text-[11px] text-foreground font-mono truncate flex-shrink-0">{guest.last_unit}</span>
          )}
        </div>
        <div className="text-[11px] text-foreground truncate mt-0.5">{guest.email}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[12px] text-foreground tabular-nums">{fmtDate(guest.last_check_out)}</div>
        <div className="text-[11px] text-foreground">{staysAgo}</div>
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

  // "/" jumps to the search box.
  const searchRef = useRef(null)
  useListShortcuts({ searchRef, onEscape: null })

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async (signal?) => {
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
      <div className="flex-1 min-w-0 min-h-0 flex flex-col px-4 py-4 md:px-8 md:py-6 gap-4">
        <div className="flex-shrink-0">
          <SummaryCards guests={guests} campaigns={campaigns} view={view} onView={handleViewChange} />
        </div>

        <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
          <StatusTabs tabs={viewTabs} value={view} onChange={handleViewChange} label="Compose or history" />

          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder={view === 'compose' ? 'Search guests by name, email, unit…' : 'Search campaigns by name or subject…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9 h-9 text-xs rounded-md"
            />
            {!search && <SearchKeyHint />}
          </div>

          <DateRangeFilter
            from={dateFrom} to={dateTo}
            onFromChange={setDateFrom} onToChange={setDateTo}
            onClear={() => { setDateFrom(''); setDateTo('') }}
            title={view === 'compose' ? 'Last stay between' : 'Created between'}
          />

          <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={refreshing} className="h-9 rounded-md flex-shrink-0" title="Refresh">
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          </Button>
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

type ComposeViewProps = {
  loading: boolean
  filteredGuests: any
  pageItems: any
  page: number
  setPage: (...args: any[]) => any
  totalPages: number
  timeFilter: string
  setTimeFilter: (...args: any[]) => any
  selected: any
  toggleOne: (email: any) => void
  toggleAllVisible: () => void
  clearSelection: () => void
  allVisibleSelected: boolean
  selectedCount: number
  campaignName: string
  setCampaignName: (...args: any[]) => any
  subject: string
  setSubject: (...args: any[]) => any
  greeting: string
  setGreeting: (...args: any[]) => any
  body: string
  setBody: (...args: any[]) => any
  signoff1: string
  setSignoff1: (...args: any[]) => any
  signoff2: string
  setSignoff2: (...args: any[]) => any
  replyTo: string
  setReplyTo: (...args: any[]) => any
  heroImage: any
  setHeroImage: (...args: any[]) => any
  imageInputRef: any
  uploadingImage: boolean
  handleImagePick: (e: any) => Promise<void>
  sending: boolean
  sendProgress: any
  onSend: () => void
}

function ComposeView({
  loading, filteredGuests, pageItems, page, setPage, totalPages, timeFilter, setTimeFilter,
  selected, toggleOne, toggleAllVisible, clearSelection, allVisibleSelected, selectedCount,
  campaignName, setCampaignName, subject, setSubject, greeting, setGreeting,
  body, setBody, signoff1, setSignoff1, signoff2, setSignoff2, replyTo, setReplyTo,
  heroImage, setHeroImage, imageInputRef, uploadingImage, handleImagePick,
  sending, sendProgress, onSend,
}: ComposeViewProps) {
  const labelClass = 'text-[11px] font-semibold text-foreground mb-1.5 block'
  const helpClass = 'text-[11px] text-foreground mt-1'
  const pagerButton = (disabled) => cn(
    'p-1.5 rounded-md border border-border text-foreground',
    disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50',
  )

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
      <Panel className="min-h-0">
        <PanelHeader
          icon={Users}
          title="Recipients"
          subtitle={`${selectedCount} selected of ${filteredGuests.length} · up to ${MAX_RECIPIENTS} per campaign`}
          action={selectedCount > 0 && (
            <button type="button" onClick={clearSelection} className="text-[11px] font-semibold text-foreground hover:text-red-600 hover:underline underline-offset-2 transition-colors flex-shrink-0">
              Clear selection
            </button>
          )}
        />

        <div className="flex-shrink-0 px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <StatusTabs tabs={TIME_FILTERS} value={timeFilter} onChange={setTimeFilter} label="Last stay" />
          <button type="button" onClick={toggleAllVisible} disabled={pageItems.length === 0}
            className="text-[11px] font-semibold text-foreground hover:underline underline-offset-2 disabled:opacity-50">
            {allVisibleSelected ? 'Deselect this page' : 'Select this page'}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : pageItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center py-8">
              <div>
                <Users size={24} strokeWidth={1.5} className="text-foreground mx-auto mb-2" />
                <p className="text-[12px] text-foreground font-semibold">No eligible guests</p>
                <p className="text-[11px] text-foreground mt-1">
                  {filteredGuests.length === 0 ? 'Try clearing the search or time filter.' : 'Nothing on this page.'}
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
          <div className="flex-shrink-0 border-t border-border px-5 py-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-foreground tabular-nums">Page {page} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className={pagerButton(page === 1)} aria-label="Previous page">
                <ChevronLeft size={12} />
              </button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className={pagerButton(page === totalPages)} aria-label="Next page">
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="min-h-0">
        <PanelHeader
          icon={Mail}
          title="Compose email"
          subtitle={selectedCount > 0
            ? `Going to ${selectedCount} guest${selectedCount === 1 ? '' : 's'}`
            : 'Pick recipients on the left first'}
        />

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <div>
            <label className={labelClass}>Campaign name *</label>
            <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Valentine's 2026" maxLength={120} className="h-9 text-xs rounded-md" disabled={sending} />
            <p className={helpClass}>Only you see this. It names the campaign in the history.</p>
          </div>

          <div>
            <label className={labelClass}>Subject *</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. A special Valentine's offer from us" maxLength={200} className="h-9 text-xs rounded-md" disabled={sending} />
          </div>

          <div>
            <label className={labelClass}>Greeting *</label>
            <Input value={greeting} onChange={(e) => setGreeting(e.target.value)}
              placeholder="Hi {{guest_name}}," maxLength={300} className="h-9 text-xs rounded-md" disabled={sending} />
            <p className={helpClass}>
              <Placeholder /> is replaced with each guest's name.
            </p>
          </div>

          <div>
            <label className={labelClass}>Message *</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={`This February, we're offering 15% off any stay booked before the 20th.\n\nJust reply to this email to claim it.`}
              rows={8} maxLength={20000} className="text-xs rounded-md resize-none" disabled={sending} />
            <p className={cn(helpClass, 'text-right tabular-nums')}>
              {body.length.toLocaleString()} / 20,000
            </p>
          </div>

          <div>
            <label className={labelClass}>Hero image (optional)</label>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={handleImagePick} disabled={uploadingImage || sending} />
            {heroImage ? (
              <div className="relative rounded-md overflow-hidden border border-border bg-card">
                <img src={heroImage.url} alt="" className="w-full h-auto max-h-64 object-cover" />
                <button type="button" onClick={() => setHeroImage(null)} disabled={sending}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-50" title="Remove" aria-label="Remove image">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage || sending}
                className="w-full flex flex-col items-center justify-center gap-1.5 py-5 rounded-md border-2 border-dashed border-border text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50">
                {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                <span className="text-[12px] font-semibold">{uploadingImage ? 'Uploading…' : 'Add a hero image'}</span>
                <span className="text-[11px]">JPEG, PNG or WebP · up to 5 MB</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Sign-off line 1</label>
              <Input value={signoff1} onChange={(e) => setSignoff1(e.target.value)} placeholder="Warm regards," maxLength={200} className="h-9 text-xs rounded-md" disabled={sending} />
            </div>
            <div>
              <label className={labelClass}>Sign-off line 2</label>
              <Input value={signoff2} onChange={(e) => setSignoff2(e.target.value)} placeholder="Iloilo Rentals" maxLength={200} className="h-9 text-xs rounded-md" disabled={sending} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Reply-to (optional)</label>
            <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)}
              placeholder="Leave blank to use your default support address" maxLength={254} className="h-9 text-xs rounded-md" disabled={sending} />
          </div>

          <div className="rounded-md border border-border p-3 flex items-start gap-2">
            <Info size={13} className="text-foreground flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-foreground leading-relaxed">
              Each guest gets their own email with <Placeholder /> filled in, plus an unsubscribe link. Guests who unsubscribe won't get future campaigns.
            </p>
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-border px-5 py-3 flex items-center justify-between gap-2">
          <p className="text-[12px] text-foreground hidden sm:block truncate">
            {sendProgress ? `Sending… ${sendProgress.current} of ${sendProgress.total}`
              : selectedCount > 0 ? `Ready to send to ${selectedCount} guest${selectedCount === 1 ? '' : 's'}`
              : 'Select recipients on the left to continue'}
          </p>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <Button size="sm" className="h-9 rounded-md text-xs gap-1.5 text-white" style={{ backgroundColor: BRAND }}
              onClick={onSend} disabled={sending || selectedCount === 0}>
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {sending ? 'Sending…' : `Send to ${selectedCount}`}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

type HistoryViewProps = {
  campaigns: any
  totalCampaigns: number
  loading: boolean
  onDeleted: (signal?: any) => Promise<void>
}

function HistoryView({ campaigns, totalCampaigns, loading, onDeleted }: HistoryViewProps) {
  const [deletingId, setDeletingId] = useState(null)
  const [clearingAll, setClearingAll] = useState(false)

  const showingLabel = totalCampaigns === campaigns.length
    ? `${totalCampaigns} campaign${totalCampaigns === 1 ? '' : 's'}`
    : `Showing ${campaigns.length} of ${totalCampaigns}`

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

  const busy = clearingAll || deletingId !== null

  return (
    <Panel className="flex-1 min-h-0">
      <PanelHeader
        icon={History}
        title="Campaign history"
        subtitle={showingLabel}
        action={totalCampaigns > 0 && (
          <button type="button" onClick={handleClearAll} disabled={busy}
            className={cn('text-[11px] font-semibold transition-colors flex-shrink-0',
              busy ? 'opacity-50 cursor-not-allowed text-foreground' : 'text-red-600 dark:text-red-400 hover:underline underline-offset-2')}>
            {clearingAll ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : campaigns.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center py-12">
            <div>
              <Megaphone size={24} strokeWidth={1.5} className="text-foreground mx-auto mb-2" />
              <p className="text-[12px] text-foreground font-semibold">No campaigns yet</p>
              <p className="text-[11px] text-foreground mt-1">Compose your first campaign and it will show up here.</p>
            </div>
          </div>
        ) : (
          campaigns.map((c) => {
            const isDeleting = deletingId === c.id
            const hasFailures = (c.failed_count || 0) > 0
            return (
              <div key={c.id}
                className={cn('group/history px-5 py-3 border-b border-border last:border-0 transition-colors flex items-start gap-3',
                  isDeleting ? 'opacity-50' : 'hover:bg-muted/40')}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">{c.name}</p>
                      <p className="text-[11px] text-foreground truncate mt-0.5">{c.subject}</p>
                    </div>
                    <CampaignStatusText status={c.status} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-foreground tabular-nums flex-wrap">
                    <span className="inline-flex items-center gap-1"><Users size={11} /> {c.recipient_count} recipient{c.recipient_count === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400"><Check size={11} /> {c.sent_count} sent</span>
                    {hasFailures && <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400"><AlertTriangle size={11} /> {c.failed_count} failed</span>}
                    <span className="ml-auto">{fmtDateTime(c.sent_at || c.created_at)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => handleDeleteOne(c)} disabled={isDeleting || clearingAll}
                  className={cn('flex-shrink-0 p-1.5 rounded-md transition-all opacity-0 group-hover/history:opacity-100 focus-visible:opacity-100',
                    'text-foreground hover:text-red-600 hover:bg-muted',
                    (isDeleting || clearingAll) && 'opacity-50 cursor-not-allowed')}
                  title="Delete campaign" aria-label={`Delete campaign ${c.name}`}>
                  {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            )
          })
        )}
      </div>
    </Panel>
  )
}

type ConfirmSendDialogProps = {
  recipientCount: number
  subject: string
  greeting: string
  body: string
  heroImage: any
  onCancel: () => void
  onConfirm: () => Promise<void>
}

function ConfirmSendDialog({ recipientCount, subject, greeting, body, heroImage, onCancel, onConfirm }: ConfirmSendDialogProps) {
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
        className="relative bg-card rounded-md max-w-md w-full border border-border overflow-hidden flex flex-col max-h-[92vh]"
        style={{ boxShadow: SOFT_SHADOW }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 id="confirm-send-title" className="text-[14px] font-semibold text-foreground">Confirm send</h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="p-1.5 rounded-md text-foreground hover:bg-muted/60"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-foreground leading-relaxed">
              <strong className="text-amber-700 dark:text-amber-400">This can't be undone.</strong> Sent emails can't be recalled or edited.
              Each guest gets their own email with <Placeholder /> replaced by their name.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-foreground">Recipients</span>
              <span className="font-semibold text-foreground tabular-nums">{recipientCount} guest{recipientCount === 1 ? '' : 's'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-foreground flex-shrink-0">Subject</span>
              <span className="font-semibold text-foreground text-right break-words">{subject}</span>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground">Preview</p>
            {heroImage && (
              <img src={heroImage.url} alt="" className="w-full h-auto max-h-32 object-cover rounded border border-border" />
            )}
            <p className="text-xs font-semibold text-foreground break-words">{greeting || 'Hi {{guest_name}},'}</p>
            <p className="text-[12px] text-foreground leading-relaxed whitespace-pre-wrap break-words">{bodyPreview}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-card">
          <Button variant="outline" size="sm" className="h-9 rounded-md text-xs" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="h-9 rounded-md text-xs gap-1.5 text-white" style={{ backgroundColor: BRAND }} onClick={onConfirm}>
            <Send size={12} /> Send to {recipientCount}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
