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
const PAGE_SIZE = 25

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// Status pill
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// Section header — OUTSIDE the card
// ------------------------------------------------------------
function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-0.5">
      {Icon ? <Icon size={14} className="text-foreground flex-shrink-0" /> : null}
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground truncate">
        {title}
      </h3>
      {subtitle && (
        <span className="text-[11px] text-muted-foreground tabular-nums truncate">{subtitle}</span>
      )}
      {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
    </div>
  )
}

// ------------------------------------------------------------
// Summary cards
// ------------------------------------------------------------
function SummaryCards({ guests, campaigns }) {
  const stats = useMemo(() => {
    const totalGuests = guests.length
    const sentCampaigns = campaigns.filter((c) => c.status === 'sent').length
    const totalDelivered = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0)
    const totalFailed = campaigns.reduce((s, c) => s + (c.failed_count || 0), 0)
    return { totalGuests, sentCampaigns, totalDelivered, totalFailed }
  }, [guests, campaigns])

  const cards = [
    { label: 'Eligible Guests', value: stats.totalGuests, icon: Users },
    { label: 'Campaigns Sent', value: stats.sentCampaigns, icon: Megaphone },
    { label: 'Emails Delivered', value: stats.totalDelivered, icon: Mail },
    { label: 'Emails Failed', value: stats.totalFailed, icon: AlertTriangle },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.25 }}
          className="rounded-md bg-card border border-border shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon size={15} className="text-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{card.label}</span>
          </div>
          <p className="text-3xl font-bold text-foreground tabular-nums">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// Recipient row
// ------------------------------------------------------------
function RecipientRow({ guest, checked, onToggle, disabled }) {
  const staysAgo = useMemo(() => {
    if (!guest.last_check_out) return ''
    const then = new Date(guest.last_check_out + 'T00:00:00Z').getTime()
    // eslint-disable-next-line react-hooks/purity
    const days = Math.floor((Date.now() - then) / 86400000)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
  }, [guest.last_check_out])

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'w-full text-left px-4 py-2.5 border-b border-border last:border-0 transition-colors flex items-center gap-3',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="rounded border-border flex-shrink-0 pointer-events-none"
      />
      <GuestAvatar name={guest.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-medium text-foreground truncate">{guest.name || 'Guest'}</span>
          {guest.last_unit && (
            <span className="text-[10px] text-muted-foreground font-mono truncate flex-shrink-0">
              {guest.last_unit}
            </span>
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

// ------------------------------------------------------------
// Time filter chips
// ------------------------------------------------------------
const TIME_FILTERS = [
  { id: 'all', label: 'All time' },
  { id: '6',   label: 'Last 6 months' },
  { id: '12',  label: 'Last 12 months' },
  { id: '24',  label: 'Last 2 years' },
]

// ============================================================
// Main page
// ============================================================
export default function CampaignsPage() {
  const [guests, setGuests] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState('all')

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

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Load data
  const fetchData = useCallback(async () => {
    if (!hasLoadedOnce.current) setLoading(true)
    else setRefreshing(true)
    try {
      const [g, c] = await Promise.all([listPastGuests(), listCampaigns()])
      setGuests(g)
      setCampaigns(c)
    } catch (err) {
      console.error('Failed to load campaigns data:', err)
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
      setRefreshing(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtered guests
  const filteredGuests = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const cutoffISO = (() => {
      if (timeFilter === 'all') return null
      const months = Number(timeFilter)
      const d = new Date()
      d.setMonth(d.getMonth() - months)
      return d.toISOString().slice(0, 10)
    })()

    return guests.filter((g) => {
      if (cutoffISO && (g.last_check_out || '') < cutoffISO) return false
      if (q) {
        const hay = `${g.name || ''} ${g.email || ''} ${g.last_unit || ''} ${g.last_building || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [guests, debouncedSearch, timeFilter])

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return campaigns
    return campaigns.filter((c) => {
      const hay = `${c.name || ''} ${c.subject || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [campaigns, debouncedSearch])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredGuests.length / PAGE_SIZE))
  const pageItems = useMemo(
    () => filteredGuests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredGuests, page],
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  // Selection
  const toggleOne = useCallback((email) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }, [])

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allVisibleSelected = pageItems.every((g) => next.has(g.email))
      if (allVisibleSelected) {
        for (const g of pageItems) next.delete(g.email)
      } else {
        for (const g of pageItems) next.add(g.email)
      }
      return next
    })
  }, [pageItems])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const allVisibleSelected = pageItems.length > 0 && pageItems.every((g) => selected.has(g.email))

  const selectedGuests = useMemo(
    () => guests.filter((g) => selected.has(g.email)),
    [guests, selected],
  )

  // Image upload
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

  // Reset form
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

  // Validation
  const validatePayload = () => {
    if (!campaignName.trim()) { toast.error('Give this campaign a name'); return false }
    if (!subject.trim())      { toast.error('Subject is required');       return false }
    if (!greeting.trim())     { toast.error('Greeting is required');      return false }
    if (!body.trim())         { toast.error('Message body is required');  return false }
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
    if (selectedGuests.length === 0) {
      toast.error('Select at least one recipient')
      return
    }
    setShowConfirm(true)
  }

  // ✅ FIX: partial-failure handling
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

      // res = { ok, campaign_id, recipient_count, sent, failed, failures[] }
      const sentCount   = Number(res?.sent ?? 0)
      const failedCount = Number(res?.failed ?? 0)
      const totalCount  = Number(res?.recipient_count ?? selectedGuests.length)
      const skipped     = Math.max(0, totalCount - sentCount - failedCount)

      setSendProgress({ current: sentCount + failedCount, total: totalCount })

      // ── Report accurately, not as all-or-nothing ─────────────
      if (failedCount === 0 && skipped === 0) {
        toast.success(`Sent to all ${sentCount} guest${sentCount === 1 ? '' : 's'}`)
      } else if (sentCount === 0 && failedCount > 0) {
        toast.error(`Send failed for all ${failedCount} recipient${failedCount === 1 ? '' : 's'}. Check history.`)
      } else {
        // Mixed result — surface counts plainly
        const parts = [`Sent to ${sentCount}`]
        if (failedCount > 0) parts.push(`${failedCount} failed`)
        if (skipped > 0)     parts.push(`${skipped} skipped`)
        toast(
          parts.join(' · ') + ' — see history for details',
          { icon: '⚠️', duration: 6000 },
        )
      }

      // Log the first few failures for debugging
      if (Array.isArray(res?.failures) && res.failures.length > 0) {
        console.warn('Campaign send failures:', res.failures)
      }

      resetForm()
      clearSelection()
      setView('history')
      fetchData()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Send failed')
    } finally {
      setSending(false)
      setSendProgress(null)
    }
  }

  const handleViewChange = (v) => {
    setView(v)
    setPage(1)
  }

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3">

        {/* Summary cards */}
        <div className="flex-shrink-0 pt-1 pb-2">
          <SummaryCards guests={guests} campaigns={campaigns} />
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="inline-flex items-center gap-1 bg-muted/60 rounded-full p-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleViewChange('compose')}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap',
                view === 'compose' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Megaphone size={11} /> Compose
            </button>
            <button
              type="button"
              onClick={() => handleViewChange('history')}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap',
                view === 'history' ? 'bg-card border border-border text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <History size={11} /> History
              <span className="opacity-60">{campaigns.length}</span>
            </button>
          </div>

          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={view === 'compose' ? 'Search guests by name, email, unit…' : 'Search campaigns by name or subject…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs rounded"
            />
          </div>

          <Button
            variant="outline" size="sm"
            onClick={fetchData} disabled={refreshing}
            className="h-8 rounded transition-all duration-150 flex-shrink-0"
          >
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          </Button>
        </div>

        {view === 'compose' ? (
          <ComposeView
            loading={loading}
            filteredGuests={filteredGuests}
            pageItems={pageItems}
            page={page}
            setPage={setPage}
            totalPages={totalPages}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            selected={selected}
            toggleOne={toggleOne}
            toggleAllVisible={toggleAllVisible}
            clearSelection={clearSelection}
            allVisibleSelected={allVisibleSelected}
            selectedCount={selectedGuests.length}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            subject={subject}
            setSubject={setSubject}
            greeting={greeting}
            setGreeting={setGreeting}
            body={body}
            setBody={setBody}
            signoff1={signoff1}
            setSignoff1={setSignoff1}
            signoff2={signoff2}
            setSignoff2={setSignoff2}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            heroImage={heroImage}
            setHeroImage={setHeroImage}
            imageInputRef={imageInputRef}
            uploadingImage={uploadingImage}
            handleImagePick={handleImagePick}
            sending={sending}
            sendProgress={sendProgress}
            onSend={handleOpenConfirm}
          />
        ) : (
          <HistoryView
            campaigns={filteredCampaigns}
            totalCampaigns={campaigns.length}
            loading={loading}
            onDeleted={fetchData}
          />
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

// ============================================================
// Compose view
// ============================================================
function ComposeView({
  loading, filteredGuests, pageItems, page, setPage, totalPages,
  timeFilter, setTimeFilter,
  selected, toggleOne, toggleAllVisible, clearSelection, allVisibleSelected, selectedCount,
  campaignName, setCampaignName, subject, setSubject, greeting, setGreeting,
  body, setBody, signoff1, setSignoff1, signoff2, setSignoff2, replyTo, setReplyTo,
  heroImage, setHeroImage, imageInputRef, uploadingImage, handleImagePick,
  sending, sendProgress, onSend,
}) {
  const labelClass = 'text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block'

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">

      {/* ─────────── LEFT: Recipients ─────────── */}
      <div className="flex flex-col min-h-0">
        <SectionHeader
          icon={Users}
          title="Recipients"
          subtitle={`· ${selectedCount} selected of ${filteredGuests.length}`}
          action={
            selectedCount > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[10px] font-semibold text-muted-foreground hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
            )
          }
        />

        <div className="flex-1 min-h-0 flex flex-col rounded border border-border shadow-sm overflow-hidden bg-card">

          {/* Time filters */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-border space-y-2">
            <div className="flex items-center gap-1 flex-wrap">
              {TIME_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTimeFilter(f.id)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors whitespace-nowrap',
                    timeFilter === f.id
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleAllVisible}
                disabled={pageItems.length === 0}
                className="text-[11px] font-semibold text-foreground hover:underline disabled:opacity-50"
              >
                {allVisibleSelected ? 'Deselect page' : 'Select page'}
              </button>
            </div>
          </div>

          {/* Recipient list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
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
                <RecipientRow
                  key={guest.email}
                  guest={guest}
                  checked={selected.has(guest.email)}
                  onToggle={() => toggleOne(guest.email)}
                  disabled={sending}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-border bg-card px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cn(
                    'p-1 rounded border border-border',
                    page === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted',
                  )}
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={cn(
                    'p-1 rounded border border-border',
                    page === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted',
                  )}
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─────────── RIGHT: Compose ─────────── */}
      <div className="flex flex-col min-h-0">
        <SectionHeader
          icon={Mail}
          title="Compose Email"
          subtitle={
            selectedCount > 0
              ? `· ${selectedCount} recipient${selectedCount === 1 ? '' : 's'}`
              : '· No recipients selected'
          }
        />

        <div className="flex-1 min-h-0 flex flex-col rounded border border-border shadow-sm overflow-hidden bg-card">

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">

            <div>
              <label className={labelClass}>Campaign name *</label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Valentine's 2026"
                maxLength={120}
                className="h-8 text-xs rounded"
                disabled={sending}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Only you see this. Used to identify the campaign in history.
              </p>
            </div>

            <div>
              <label className={labelClass}>Subject *</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. A special Valentine's offer from us"
                maxLength={200}
                className="h-8 text-xs rounded"
                disabled={sending}
              />
            </div>

            <div>
              <label className={labelClass}>Greeting *</label>
              <Input
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Hi {{guest_name}},"
                maxLength={300}
                className="h-8 text-xs rounded"
                disabled={sending}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Use <code className="font-mono bg-muted px-1 rounded">{'{{guest_name}}'}</code> — it's replaced with each recipient's name automatically
              </p>
            </div>

            <div>
              <label className={labelClass}>Message *</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`This February, we're offering 15% off any stay booked before the 20th.\n\nJust reply to this email to claim it.`}
                rows={8}
                maxLength={20000}
                className="text-xs rounded resize-none"
                disabled={sending}
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right tabular-nums">
                {body.length.toLocaleString()} / 20,000
              </p>
            </div>

            <div>
              <label className={labelClass}>Hero image (optional)</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImagePick}
                disabled={uploadingImage || sending}
              />
              {heroImage ? (
                <div className="relative rounded-md overflow-hidden border border-border bg-muted">
                  <img src={heroImage.url} alt="" className="w-full h-auto max-h-64 object-cover" />
                  <button
                    type="button"
                    onClick={() => setHeroImage(null)}
                    disabled={sending}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 disabled:opacity-50"
                    title="Remove"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage || sending}
                  className="w-full flex flex-col items-center justify-center gap-1.5 py-5 rounded-md border-2 border-dashed border-border text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                >
                  {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                  <span className="text-[11px] font-semibold">
                    {uploadingImage ? 'Uploading…' : 'Add a hero image'}
                  </span>
                  <span className="text-[10px]">JPEG, PNG, or WebP · max 5 MB</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Sign-off line 1</label>
                <Input
                  value={signoff1}
                  onChange={(e) => setSignoff1(e.target.value)}
                  maxLength={200}
                  className="h-8 text-xs rounded"
                  disabled={sending}
                />
              </div>
              <div>
                <label className={labelClass}>Sign-off line 2</label>
                <Input
                  value={signoff2}
                  onChange={(e) => setSignoff2(e.target.value)}
                  maxLength={200}
                  className="h-8 text-xs rounded"
                  disabled={sending}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Reply-to (optional)</label>
              <Input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="Leave blank to use your default support address"
                maxLength={254}
                className="h-8 text-xs rounded"
                disabled={sending}
              />
            </div>

            <div className="rounded-md bg-muted/40 border border-border p-3 flex items-start gap-2">
              <Info size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Each guest gets a personalized email with <code className="font-mono bg-background px-1 rounded">{'{{guest_name}}'}</code> replaced, plus an unsubscribe link. Guests who unsubscribe won't receive future campaigns.
              </p>
            </div>

          </div>

          {/* Footer actions */}
          <div className="flex-shrink-0 border-t border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground hidden sm:block truncate">
              {sendProgress
                ? `Sending… ${sendProgress.current} of ${sendProgress.total}`
                : selectedCount > 0
                  ? `Ready to send to ${selectedCount} guest${selectedCount === 1 ? '' : 's'}`
                  : 'Select recipients on the left to continue'}
            </p>
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <Button
                size="sm"
                className="h-8 rounded text-xs gap-1.5 text-white"
                style={{ backgroundColor: BRAND }}
                onClick={onSend}
                disabled={sending || selectedCount === 0}
              >
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

// ============================================================
// History view
// ============================================================
function HistoryView({ campaigns, totalCampaigns, loading, onDeleted }) {
  const [deletingId, setDeletingId] = useState(null)
  const [clearingAll, setClearingAll] = useState(false)

  const showingLabel = totalCampaigns === campaigns.length
    ? `${totalCampaigns}`
    : `${campaigns.length} of ${totalCampaigns}`

  const handleDeleteOne = async (campaign) => {
    const ok = window.confirm(
      `Delete campaign "${campaign.name}"?\n\n` +
      `Recipients: ${campaign.recipient_count}\n` +
      `Sent: ${campaign.sent_count} · Failed: ${campaign.failed_count}\n\n` +
      `This removes it from history. Individual email logs are preserved for audit.`
    )
    if (!ok) return

    setDeletingId(campaign.id)
    try {
      const { error } = await supabase
        .from('email_campaigns')
        .delete()
        .eq('id', campaign.id)
      if (error) throw error
      toast.success('Campaign deleted')
      onDeleted?.()
    } catch (err) {
      console.error('Delete campaign failed:', err)
      toast.error(err?.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAll = async () => {
    if (campaigns.length === 0) return

    const ok = window.confirm(
      `Delete ALL ${totalCampaigns} campaign${totalCampaigns === 1 ? '' : 's'} from history?\n\n` +
      `This removes every campaign record. Individual email logs are preserved for audit. ` +
      `This cannot be undone.`
    )
    if (!ok) return

    const doubleCheck = window.confirm('Are you absolutely sure? This will wipe the whole history.')
    if (!doubleCheck) return

    setClearingAll(true)
    try {
      const { error } = await supabase
        .from('email_campaigns')
        .delete()
        .not('id', 'is', null)
      if (error) throw error
      toast.success(`Cleared ${totalCampaigns} campaign${totalCampaigns === 1 ? '' : 's'}`)
      onDeleted?.()
    } catch (err) {
      console.error('Clear all failed:', err)
      toast.error(err?.message || 'Failed to clear history')
    } finally {
      setClearingAll(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <SectionHeader
        icon={History}
        title="Campaign History"
        subtitle={`· ${showingLabel}`}
        action={
          totalCampaigns > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearingAll || deletingId !== null}
              className={cn(
                'text-[10px] font-semibold transition-colors',
                clearingAll || deletingId !== null
                  ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                  : 'text-muted-foreground hover:text-red-600',
              )}
            >
              {clearingAll ? 'Clearing…' : 'Clear all'}
            </button>
          )
        }
      />

      <div className="flex-1 min-h-0 rounded border border-border shadow-sm overflow-hidden bg-card flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center py-12">
              <div>
                <Megaphone size={28} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-foreground font-semibold">No campaigns yet</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Compose your first campaign and it will appear here
                </p>
              </div>
            </div>
          ) : (
            campaigns.map((c) => {
              const isDeleting = deletingId === c.id
              const hasFailures = (c.failed_count || 0) > 0
              return (
                <div
                  key={c.id}
                  className={cn(
                    'group/history px-4 py-3 border-b border-border last:border-0 transition-colors flex items-start gap-3',
                    isDeleting ? 'opacity-50' : 'hover:bg-muted/30',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{c.subject}</p>
                      </div>
                      <CampaignStatusPill status={c.status} />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users size={10} /> {c.recipient_count} recipient{c.recipient_count === 1 ? '' : 's'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check size={10} /> {c.sent_count} sent
                      </span>
                      {hasFailures && (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                          <AlertTriangle size={10} /> {c.failed_count} failed
                        </span>
                      )}
                      <span className="ml-auto">{fmtDateTime(c.sent_at || c.created_at)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteOne(c)}
                    disabled={isDeleting || clearingAll}
                    className={cn(
                      'flex-shrink-0 p-1.5 rounded transition-all',
                      'opacity-0 group-hover/history:opacity-100',
                      'text-muted-foreground hover:text-red-600 hover:bg-red-500/10',
                      (isDeleting || clearingAll) && 'opacity-50 cursor-not-allowed',
                    )}
                    title="Delete campaign"
                  >
                    {isDeleting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
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

// ============================================================
// Confirm Send dialog
// ============================================================
function ConfirmSendDialog({
  recipientCount, subject, greeting, body, heroImage,
  onCancel, onConfirm,
}) {
  const bodyPreview = body.length > 280 ? body.slice(0, 280) + '…' : body

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="relative bg-card rounded-md shadow-2xl max-w-md w-full border border-border overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Confirm send</h3>
          <button onClick={onCancel} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>This cannot be undone.</strong> Once sent, emails cannot be recalled or edited.
              Each guest will receive a personalized email with their name substituted for <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{'{{guest_name}}'}</code>.
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Recipients</span>
              <span className="font-semibold text-foreground tabular-nums">
                {recipientCount} guest{recipientCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground flex-shrink-0">Subject</span>
              <span className="font-semibold text-foreground text-right break-words">{subject}</span>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Preview</p>

            {heroImage && (
              <img
                src={heroImage.url}
                alt=""
                className="w-full h-auto max-h-32 object-cover rounded border border-border"
              />
            )}

            <p className="text-xs font-semibold text-foreground break-words">
              {greeting || 'Hi {{guest_name}},'}
            </p>

            <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
              {bodyPreview}
            </p>
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" className="h-8 rounded text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 rounded text-xs gap-1.5 text-white"
            style={{ backgroundColor: BRAND }}
            onClick={onConfirm}
          >
            <Send size={12} />
            Send to {recipientCount}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}