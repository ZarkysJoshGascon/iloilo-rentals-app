// src/housekeeper/HousekeeperTasksPage.tsx
// The housekeeper's own tasks, in the CRM's look: header bar, stat tiles,
// status tabs, a sortable list, and a detail panel beside the list (full
// screen on phones) where the cleaning is filled in and submitted.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, Camera, X, Trash2, AlertTriangle, Image as ImageIcon, Plus, Clock, Sparkles,
  Coffee, Shirt, Wallet, Send, Lock, Search, RefreshCw, Moon, Sun, LogOut, DoorOpen,
  CheckCircle2, Hourglass, Home, Bell, BellRing,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useUserRole } from '@/hooks/useUserRole'
import { submitCleaning, parseInventory, getSignedUrl, getSignedUrls } from '@/lib/api/cleanings'
import { cn, STAY_TIMES } from '@/lib/utils'
import { stayMoment, guestState, hasGuestLeft } from '@/lib/domain/stay'
import { Panel, PanelHeader } from '@/components/crm/Panel'
import {
  QueueColumn, QueueRow, RowAction, WithDot, useNow, useLocalToday, formatSpan, formatClock, localISODate,
} from '@/components/crm/WorkQueue'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { StatStrip, StatTile } from '@/components/crm/StatStrip'
import { StatusTabs } from '@/components/crm/StatusTabs'
import { PageScrollHelper } from '@/components/crm/PageScrollHelper'
import {
  SortHeader, nextSort, ResultsBar, SearchKeyHint, useListShortcuts,
  CARD_ON_PHONE, MobileSort, useListCap, useSidePanelMotion,
} from '@/components/crm/listTools'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Code } from '@/components/common/Code'
import { WelcomeModal } from '@/components/common/WelcomeModal'

const PHOTO_LIMITS = { before: 15, after: 15, report: 10 }
const PANEL_WIDTH = 520
const ROW_GRID = `grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,1fr)_120px] gap-4 items-center ${CARD_ON_PHONE}`

// Same colours as the CRM's housekeeping list.
const STATUS_TEXT = {
  ready:     { label: 'Ready to clean', className: 'text-blue-600 dark:text-blue-400' },
  scheduled: { label: 'Scheduled',      className: 'text-amber-600 dark:text-amber-400' },
  submitted: { label: 'Submitted',      className: 'text-fuchsia-600 dark:text-fuchsia-400' },
  completed: { label: 'Approved',       className: 'text-emerald-600 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled',      className: 'text-red-600 dark:text-red-400' },
}
const TYPE_TEXT = {
  basic: { label: 'Basic', className: 'text-blue-600 dark:text-blue-400' },
  deep:  { label: 'Deep',  className: 'text-purple-600 dark:text-purple-400' },
}

const STATUS_ORDER = ['ready', 'scheduled', 'submitted', 'completed', 'cancelled']
const SORT_VALUE = {
  code:      (c) => c.cleaning_code || '',
  booking:   (c) => c.bookings?.booking_code || '',
  type:      (c) => c.type || '',
  scheduled: (c) => c.scheduled_date || '',
  status:    (c) => STATUS_ORDER.indexOf(getEffectiveStatus(c)),
}
const SORT_DEFAULT_DIR = { scheduled: 'asc' }

// Ready once the CRM confirms the guest has checked out (or their check-out
// day is over); until then the guest is still in the unit.
function getEffectiveStatus(cleaning) {
  if (cleaning.status === 'submitted' || cleaning.status === 'completed' || cleaning.status === 'cancelled') return cleaning.status
  if (!cleaning.bookings?.check_out) return 'ready'
  return hasGuestLeft(cleaning.bookings) ? 'ready' : 'scheduled'
}

// Housekeepers can't read bookings or units, so the page gets them from
// housekeeper_cleaning_details() (unit, booking code, dates, next arrival)
// and the cleaning's own copy of the check-out (guest_left_at, checkout_due_at).
// `bookings` is shaped like a booking so lib/stay can tell where the guest is.
function withStay(cleaning, details) {
  return {
    ...cleaning,
    units: details ? { unit_code: details.unit_code, building: details.building } : null,
    bookings: details?.booking_code
      ? {
          booking_code: details.booking_code,
          check_in: details.check_in,
          check_out: details.check_out,
          checked_out_at: cleaning.guest_left_at,
          late_checkout_at: cleaning.checkout_due_at,
        }
      : null,
    nextCheckInAt: details?.next_check_in_at || null,
  }
}

const clockOf = (d: Date) => formatClock(d.getHours(), d.getMinutes())

/** The agreed late check-out time, if the guest has one (anything but the usual 11 AM). */
function lateCheckout(cleaning): Date | null {
  if (!cleaning.checkout_due_at || !cleaning.bookings?.check_out) return null
  const due = new Date(cleaning.checkout_due_at)
  const usual = stayMoment(cleaning.bookings.check_out, STAY_TIMES.checkOut)
  return usual && due.getTime() !== usual.getTime() ? due : null
}

/** "Oct 15 · 11 AM", "Oct 15 · 1 PM (late)", or with the confirmed time once the guest has left. */
function checkoutLabel(cleaning) {
  const b = cleaning.bookings
  if (!b?.check_out) return '—'
  const late = lateCheckout(cleaning)
  const day = new Date(`${String(b.check_out).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const left = cleaning.guest_left_at ? new Date(cleaning.guest_left_at) : null
  if (left) return `${day} · left ${clockOf(left)}`
  return `${day} · ${late ? `${clockOf(late)} (late)` : STAY_TIMES.checkOut.label}`
}

/** The next guest's check-in, when it's on the given day (so the cleaning has to be done by then). */
function nextGuestOn(cleaning, day: string): Date | null {
  if (!cleaning.nextCheckInAt) return null
  const at = new Date(cleaning.nextCheckInAt)
  return localISODate(at) === day ? at : null
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Today", "Tomorrow", "Yesterday", "In 3 days", "4 days ago" */
function relativeDay(d) {
  if (!d) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(d); target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`
}

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function greetingFor(date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function photoCount(cleaning) {
  return (cleaning.photos_before?.length || 0) + (cleaning.photos_after?.length || 0) + (cleaning.photos_report?.length || 0)
}

function StatusText({ cleaning, className }: { cleaning: any; className?: string }) {
  const config = STATUS_TEXT[getEffectiveStatus(cleaning)] || STATUS_TEXT.scheduled
  return <span className={cn('text-[12px] font-semibold', config.className, className)}>{config.label}</span>
}

function TypeText({ type }: { type: any }) {
  const config = TYPE_TEXT[type] || TYPE_TEXT.basic
  return <span className={cn('text-[12px] font-semibold', config.className)}>{config.label}</span>
}

// ─────────────────────────────────────────────────────────────
// Detail panel building blocks (the CRM detail panel's look)
// ─────────────────────────────────────────────────────────────

type DetailSectionProps = {
  title: string
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
}

function DetailSection({ title, icon: Icon, action, children }: DetailSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
          {Icon && <Icon size={12} className="text-foreground" />}
          {title}
        </h4>
        {action}
      </div>
      <div className="rounded-md bg-card border border-border shadow-sm overflow-hidden">{children}</div>
    </section>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 gap-3">
      <span className="text-[10px] uppercase tracking-wider text-foreground font-semibold min-w-[72px] flex-shrink-0">{label}</span>
      <span className="text-xs text-foreground text-right min-w-0 truncate">{children}</span>
    </div>
  )
}

function SubLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">{children}</p>
      {right}
    </div>
  )
}

function Notice({ icon: Icon, tone = 'plain', title, children }: { icon: LucideIcon; tone?: 'plain' | 'good' | 'bad'; title: string; children: ReactNode }) {
  const toneText = tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'bad' ? 'text-red-700 dark:text-red-400' : 'text-foreground'
  return (
    <div className="rounded-md bg-card border border-border shadow-sm p-3 flex items-start gap-2">
      <Icon size={14} className={cn('flex-shrink-0 mt-0.5', toneText)} />
      <div className="min-w-0">
        <p className={cn('text-xs font-semibold', toneText)}>{title}</p>
        <p className="text-[11px] text-foreground mt-0.5">{children}</p>
      </div>
    </div>
  )
}

// Whether the housekeeper can go in: ready (the CRM confirmed the guest
// left), the guest still in (with the countdown), or check-out time passed
// but not confirmed yet (don't go in).
function StayNotice({ cleaning }: { cleaning: any }) {
  const now = useNow()
  const today = useLocalToday()
  const status = getEffectiveStatus(cleaning)
  if (!cleaning.bookings?.check_out || status === 'submitted' || status === 'completed' || status === 'cancelled') return null
  const state = guestState(cleaning.bookings, now)
  const late = lateCheckout(cleaning)
  const nextGuest = nextGuestOn(cleaning, today)

  if (state.kind === 'left') {
    return (
      <Notice
        icon={DoorOpen}
        tone="good"
        title={state.confirmed ? `Ready to clean · guest checked out ${clockOf(state.at)}` : 'Ready to clean · the guest has left'}
      >
        {nextGuest
          ? `The next guest checks in at ${clockOf(nextGuest)}. Finish before then.`
          : 'No guest checks in here today.'}
      </Notice>
    )
  }
  if (state.kind === 'unconfirmed') {
    return (
      <Notice icon={Clock} title="Waiting for the check-out to be confirmed">
        Check-out was at {clockOf(state.due)}. Don't go in until the guest is confirmed out; this turns green when they are.
      </Notice>
    )
  }
  if (state.kind === 'staying') {
    const outToday = String(cleaning.bookings.check_out).slice(0, 10) === today
    return (
      <Notice icon={Clock} title="Guest is still in the unit">
        {outToday
          ? `Checks out at ${clockOf(state.due)}${late ? ' (late check-out)' : ''}, in ${formatSpan(state.due.getTime() - now)}.`
          : `Checks out ${formatDate(cleaning.bookings.check_out)} at ${clockOf(state.due)}.`}
        {' '}You'll be alerted when they've left.
      </Notice>
    )
  }
  return null
}

function useSignedUrls(photos) {
  const paths = useMemo(
    () => (photos || []).map((p) => p?.path).filter(Boolean),
    [photos],
  )
  const key = paths.join('|')
  const [map, setMap] = useState({})
  const [loading, setLoading] = useState(paths.length > 0)

  useEffect(() => {
    let cancelled = false
    if (paths.length === 0) { setMap({}); setLoading(false); return }
    setLoading(true)
    getSignedUrls(paths)
      .then((m) => { if (!cancelled) { setMap(m); setLoading(false) } })
      .catch((err) => {
        console.error('Signed URL fetch failed:', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [key])

  return { map, loading }
}

function useSignedUrl(photo) {
  const path = photo?.path || null
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(!!path)

  useEffect(() => {
    let cancelled = false
    if (!path) { setUrl(null); setLoading(false); return }
    setLoading(true)
    getSignedUrl(path)
      .then((u) => { if (!cancelled) { setUrl(u); setLoading(false) } })
      .catch((err) => {
        console.error('Signed URL fetch failed:', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [path])

  return { url, loading }
}

// ─────────────────────────────────────────────────────────────
// Read-only views (approved or cancelled cleanings)
// ─────────────────────────────────────────────────────────────

function ReadOnlyPhotoGrid({ photos, label }: { photos: any; label: string }) {
  const safePhotos = Array.isArray(photos) ? photos : []
  const { map: signedMap, loading } = useSignedUrls(safePhotos)
  if (safePhotos.length === 0) return null

  return (
    <div>
      <SubLabel right={<span className="text-[10px] text-foreground tabular-nums">{safePhotos.length}</span>}>{label}</SubLabel>
      <div className="grid grid-cols-3 gap-2">
        {safePhotos.map((p, i) => {
          const src = signedMap[p.path]
          return (
            <div key={p.path || i} className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted">
              {src ? (
                <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : loading ? (
                <Skeleton className="w-full h-full rounded-none" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-foreground"><ImageIcon size={16} /></div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReadOnlySinglePhoto({ photo }: { photo: any }) {
  const { url, loading } = useSignedUrl(photo)
  if (!photo) {
    return (
      <div className="w-full aspect-video rounded-md border border-dashed border-border flex items-center justify-center">
        <ImageIcon size={16} className="text-foreground" />
      </div>
    )
  }
  return (
    <div className="aspect-video rounded-md overflow-hidden border border-border bg-muted">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : loading ? (
        <Skeleton className="w-full h-full rounded-none" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-foreground"><ImageIcon size={16} /></div>
      )}
    </div>
  )
}

function ReadOnlyItemsList({ items }: { items: any }) {
  const parsed = parseInventory(items)
  if (parsed.length === 0) return <p className="text-[11px] italic text-foreground py-1">No items</p>
  return (
    <div className="divide-y divide-border">
      {parsed.map((it, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 text-xs">
          <span className="text-foreground truncate">{it.name}</span>
          <span className="text-foreground font-semibold tabular-nums">×{it.quantity}</span>
        </div>
      ))}
    </div>
  )
}

function ReadOnlyUsedReplaced({ cleaning, prefix }: { cleaning: any; prefix: 'amenities' | 'laundry' }) {
  return (
    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {(['used', 'replaced'] as const).map((side) => (
        <div key={side}>
          <SubLabel>{side === 'used' ? 'Used' : 'Replaced'}</SubLabel>
          <ReadOnlySinglePhoto photo={cleaning[`${prefix}_${side}_photo`]} />
          <div className="mt-2"><ReadOnlyItemsList items={cleaning[`${prefix}_${side}_items`]} /></div>
        </div>
      ))}
    </div>
  )
}

function LockedSummary({ cleaning }: { cleaning: any }) {
  const hasAny = ['photos_before', 'photos_after', 'photos_report'].some((k) => Array.isArray(cleaning[k]) && cleaning[k].length > 0)
  const has = (prefix) =>
    parseInventory(cleaning[`${prefix}_used_items`]).length > 0 ||
    parseInventory(cleaning[`${prefix}_replaced_items`]).length > 0 ||
    cleaning[`${prefix}_used_photo`] || cleaning[`${prefix}_replaced_photo`]
  const laundryAmount = Number(cleaning.laundry_payment_amount || 0)

  return (
    <>
      <DetailSection title="Cleaning photos" icon={ImageIcon}>
        <div className="p-3 space-y-3">
          <ReadOnlyPhotoGrid photos={cleaning.photos_before} label="Before" />
          <ReadOnlyPhotoGrid photos={cleaning.photos_after} label="After" />
          <ReadOnlyPhotoGrid photos={cleaning.photos_report} label="Report" />
          {!hasAny && <p className="text-[11px] italic text-foreground text-center py-2">No photos on file</p>}
        </div>
      </DetailSection>

      {has('amenities') && (
        <DetailSection title="Amenities" icon={Coffee}>
          <ReadOnlyUsedReplaced cleaning={cleaning} prefix="amenities" />
        </DetailSection>
      )}

      {has('laundry') && (
        <DetailSection title="Laundry" icon={Shirt}>
          <ReadOnlyUsedReplaced cleaning={cleaning} prefix="laundry" />
        </DetailSection>
      )}

      <DetailSection title="Laundry payment" icon={Wallet}>
        <div className="p-3">
          {laundryAmount > 0 ? (
            <div className="space-y-0.5">
              <InfoRow label="Amount">
                <span className="font-semibold tabular-nums">
                  {`₱${laundryAmount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                </span>
              </InfoRow>
              {cleaning.laundry_payment_method && <InfoRow label="Method">{cleaning.laundry_payment_method}</InfoRow>}
              {cleaning.laundry_payment_reference && <InfoRow label="Reference"><span className="font-mono">{cleaning.laundry_payment_reference}</span></InfoRow>}
              {cleaning.laundry_paid_at && <InfoRow label="Paid at"><span className="tabular-nums">{formatDateTime(cleaning.laundry_paid_at)}</span></InfoRow>}
              {cleaning.laundry_payment_note && (
                <div className="pt-2 mt-1 border-t border-border">
                  <p className="text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1">Note</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap break-words">{cleaning.laundry_payment_note}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] italic text-foreground text-center py-1">No laundry payment was recorded.</p>
          )}
        </div>
      </DetailSection>

      {cleaning.notes && (
        <DetailSection title="Notes" icon={Sparkles}>
          <p className="p-3 text-xs text-foreground whitespace-pre-wrap break-words">{cleaning.notes}</p>
        </DetailSection>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Editable pieces (until the admin approves the cleaning)
// ─────────────────────────────────────────────────────────────

function PickPhotoButtons({ onFiles, multiple = false }: { onFiles: (e: any) => void; multiple?: boolean }) {
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const button = 'flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-border text-foreground text-xs font-medium hover:bg-muted/60 active:bg-muted transition-colors'
  return (
    <>
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple={multiple} className="hidden" onChange={onFiles} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} className="hidden" onChange={onFiles} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => cameraRef.current?.click()} className={button}><Camera size={14} /> Take photo</button>
        <button type="button" onClick={() => galleryRef.current?.click()} className={button}><ImageIcon size={14} /> Gallery</button>
      </div>
    </>
  )
}

const NEW_TAG = 'text-[9px] font-bold uppercase tracking-wider bg-brand-solid text-white px-1.5 py-0.5 rounded'
const REMOVE_PHOTO = 'absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform'

type PhotoGridLocalProps = {
  existing?: any
  newFiles?: any
  limit?: number
  onAdd: (files: any) => void
  onRemoveExisting: (photo: any) => void
  onRemoveNew: (i: any) => void
}

function PhotoGridLocal({ existing = [], newFiles = [], limit = 15, onAdd, onRemoveExisting, onRemoveNew }: PhotoGridLocalProps) {
  const total = existing.length + newFiles.length
  const { map: signedMap } = useSignedUrls(existing)

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const remaining = limit - total
    if (files.length > remaining) toast.error(`Max ${limit} photos`)
    onAdd(files.slice(0, remaining))
    if (e.target) e.target.value = ''
  }

  return (
    <div>
      <p className="text-[11px] text-foreground tabular-nums mb-2">{total} of {limit} photos</p>
      {total > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {existing.map((p, i) => {
            const src = signedMap[p.path]
            return (
              <div key={`e-${p.path || i}`} className="relative aspect-square rounded-md overflow-hidden bg-muted border border-border">
                {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <Skeleton className="w-full h-full rounded-none" />}
                <button type="button" onClick={() => onRemoveExisting(p)} className={REMOVE_PHOTO} aria-label="Remove photo"><X size={14} /></button>
              </div>
            )
          })}
          {newFiles.map((f, i) => (
            <div key={`n-${i}`} className="relative aspect-square rounded-md overflow-hidden bg-muted border-2 border-dashed border-brand-solid/50">
              <img src={f.preview} alt="" className="w-full h-full object-cover" />
              <span className={cn('absolute bottom-1 left-1', NEW_TAG)}>New</span>
              <button type="button" onClick={() => onRemoveNew(i)} className={REMOVE_PHOTO} aria-label="Remove photo"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {total < limit && <PickPhotoButtons onFiles={handleFiles} multiple />}
    </div>
  )
}

type SinglePhotoLocalProps = {
  existing: any
  newFile: any
  onPick: (f: any) => void
  onClear: () => void
}

function SinglePhotoLocal({ existing, newFile, onPick, onClear }: SinglePhotoLocalProps) {
  const { url: signedUrl, loading: signedLoading } = useSignedUrl(existing)
  const preview = newFile?.preview || signedUrl || null

  const handleFiles = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    onPick(f)
    if (e.target) e.target.value = ''
  }

  if (preview) {
    return (
      <div className="relative aspect-video rounded-md overflow-hidden bg-muted border border-border">
        <img src={preview} alt="" className="w-full h-full object-cover" />
        {newFile && <span className={cn('absolute top-2 left-2', NEW_TAG)}>New</span>}
        <button type="button" onClick={onClear} className={REMOVE_PHOTO} aria-label="Remove photo"><X size={14} /></button>
      </div>
    )
  }
  if (existing && signedLoading) return <Skeleton className="aspect-video w-full" />
  return <PickPhotoButtons onFiles={handleFiles} />
}

type ListEditorProps = {
  items: any
  onChange: (items: any) => void
  placeholder?: string
}

function ListEditor({ items, onChange, placeholder = 'Item name' }: ListEditorProps) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')

  const handleAdd = () => {
    const n = name.trim().slice(0, 80)
    const q = Number(qty) || 0
    if (!n) return toast.error('Enter item name')
    if (q <= 0) return toast.error('Quantity must be > 0')
    if (items.length >= 50) return toast.error('Too many items')
    onChange([...items, { name: n, quantity: q }])
    setName(''); setQty('1')
  }

  const handleRemove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const handleQtyChange = (i, q) => onChange(items.map((it, idx) => idx === i ? { ...it, quantity: Math.max(0, Math.min(9999, Number(q) || 0)) } : it))
  const handleNameChange = (i, n) => onChange(items.map((it, idx) => idx === i ? { ...it, name: n.slice(0, 80) } : it))

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={it.name} maxLength={80} onChange={(e) => handleNameChange(i, e.target.value)} aria-label="Item name" className="flex-1 h-9 text-xs rounded-md" />
              <Input type="number" min={0} max={9999} value={it.quantity} onChange={(e) => handleQtyChange(i, e.target.value)} aria-label="Quantity" className="w-16 h-9 text-xs text-right tabular-nums rounded-md" />
              <button type="button" onClick={() => handleRemove(i)} className="w-9 h-9 inline-flex items-center justify-center rounded-md text-foreground hover:text-red-600 hover:bg-muted" aria-label="Remove item">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder} aria-label="New item name" className="flex-1 h-9 text-xs rounded-md" />
        <Input type="number" min={1} max={9999} value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          aria-label="New item quantity" className="w-16 h-9 text-xs text-center tabular-nums rounded-md" />
        <button type="button" onClick={handleAdd} className="w-9 h-9 inline-flex items-center justify-center rounded-md bg-brand-solid text-white hover:opacity-90 active:scale-95 transition" aria-label="Add item">
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}

type UsedReplacedEditorProps = {
  used: { existing: any; newFile: any }
  replaced: { existing: any; newFile: any }
  onPickUsed: (f: any) => void
  onPickReplaced: (f: any) => void
  onClearUsed: () => void
  onClearReplaced: () => void
  usedItems: any
  replacedItems: any
  onUsedItemsChange: (items: any) => void
  onReplacedItemsChange: (items: any) => void
  placeholder: string
}

function UsedReplacedEditor({ used, replaced, onPickUsed, onPickReplaced, onClearUsed, onClearReplaced,
  usedItems, replacedItems, onUsedItemsChange, onReplacedItemsChange, placeholder }: UsedReplacedEditorProps) {
  return (
    <div className="divide-y divide-border">
      <div className="p-3">
        <SubLabel>Used</SubLabel>
        <SinglePhotoLocal existing={used.existing} newFile={used.newFile} onPick={onPickUsed} onClear={onClearUsed} />
        <div className="mt-3"><ListEditor items={usedItems} onChange={onUsedItemsChange} placeholder={placeholder} /></div>
      </div>
      <div className="p-3">
        <SubLabel>Replaced</SubLabel>
        <SinglePhotoLocal existing={replaced.existing} newFile={replaced.newFile} onPick={onPickReplaced} onClear={onClearReplaced} />
        <div className="mt-3"><ListEditor items={replacedItems} onChange={onReplacedItemsChange} placeholder={placeholder} /></div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Detail panel
// ─────────────────────────────────────────────────────────────

type CleaningPanelProps = {
  cleaning: any
  onClose: () => void
  onChanged: () => void
}

function CleaningPanel({ cleaning, onClose, onChanged }: CleaningPanelProps) {
  const panelMotion = useSidePanelMotion(PANEL_WIDTH)
  const [photoTab, setPhotoTab] = useState('before')
  const [submitting, setSubmitting] = useState(false)

  const [keepBefore, setKeepBefore] = useState(() => Array.isArray(cleaning.photos_before) ? cleaning.photos_before : [])
  const [keepAfter, setKeepAfter] = useState(() => Array.isArray(cleaning.photos_after) ? cleaning.photos_after : [])
  const [keepReport, setKeepReport] = useState(() => Array.isArray(cleaning.photos_report) ? cleaning.photos_report : [])
  const [newBefore, setNewBefore] = useState([])
  const [newAfter, setNewAfter] = useState([])
  const [newReport, setNewReport] = useState([])

  const [amenitiesUsedExisting, setAmenitiesUsedExisting] = useState(cleaning.amenities_used_photo || null)
  const [amenitiesUsedFile, setAmenitiesUsedFile] = useState(null)
  const [amenitiesReplacedExisting, setAmenitiesReplacedExisting] = useState(cleaning.amenities_replaced_photo || null)
  const [amenitiesReplacedFile, setAmenitiesReplacedFile] = useState(null)
  const [amenitiesUsedItems, setAmenitiesUsedItems] = useState(() => parseInventory(cleaning.amenities_used_items))
  const [amenitiesReplacedItems, setAmenitiesReplacedItems] = useState(() => parseInventory(cleaning.amenities_replaced_items))

  const [laundryUsedExisting, setLaundryUsedExisting] = useState(cleaning.laundry_used_photo || null)
  const [laundryUsedFile, setLaundryUsedFile] = useState(null)
  const [laundryReplacedExisting, setLaundryReplacedExisting] = useState(cleaning.laundry_replaced_photo || null)
  const [laundryReplacedFile, setLaundryReplacedFile] = useState(null)
  const [laundryUsedItems, setLaundryUsedItems] = useState(() => parseInventory(cleaning.laundry_used_items))
  const [laundryReplacedItems, setLaundryReplacedItems] = useState(() => parseInventory(cleaning.laundry_replaced_items))

  const [laundryAmount, setLaundryAmount] = useState(cleaning.laundry_payment_amount != null ? String(cleaning.laundry_payment_amount) : '')
  const [laundryMethod, setLaundryMethod] = useState(cleaning.laundry_payment_method || '')
  const [laundryReference, setLaundryReference] = useState(cleaning.laundry_payment_reference || '')
  const [laundryNote, setLaundryNote] = useState(cleaning.laundry_payment_note || '')

  const [notesDraft, setNotesDraft] = useState(cleaning.notes || '')

  useEffect(() => {
    setKeepBefore(Array.isArray(cleaning.photos_before) ? cleaning.photos_before : [])
    setKeepAfter(Array.isArray(cleaning.photos_after) ? cleaning.photos_after : [])
    setKeepReport(Array.isArray(cleaning.photos_report) ? cleaning.photos_report : [])
    setNewBefore([]); setNewAfter([]); setNewReport([])

    setAmenitiesUsedExisting(cleaning.amenities_used_photo || null)
    setAmenitiesUsedFile(null)
    setAmenitiesReplacedExisting(cleaning.amenities_replaced_photo || null)
    setAmenitiesReplacedFile(null)
    setAmenitiesUsedItems(parseInventory(cleaning.amenities_used_items))
    setAmenitiesReplacedItems(parseInventory(cleaning.amenities_replaced_items))

    setLaundryUsedExisting(cleaning.laundry_used_photo || null)
    setLaundryUsedFile(null)
    setLaundryReplacedExisting(cleaning.laundry_replaced_photo || null)
    setLaundryReplacedFile(null)
    setLaundryUsedItems(parseInventory(cleaning.laundry_used_items))
    setLaundryReplacedItems(parseInventory(cleaning.laundry_replaced_items))

    setLaundryAmount(cleaning.laundry_payment_amount != null ? String(cleaning.laundry_payment_amount) : '')
    setLaundryMethod(cleaning.laundry_payment_method || '')
    setLaundryReference(cleaning.laundry_payment_reference || '')
    setLaundryNote(cleaning.laundry_payment_note || '')

    setNotesDraft(cleaning.notes || '')
  }, [cleaning.id])

  // Revoke all pending new-file object URLs on unmount.
  useEffect(() => {
    return () => {
      newBefore.forEach((f) => URL.revokeObjectURL(f.preview))
      newAfter.forEach((f) => URL.revokeObjectURL(f.preview))
      newReport.forEach((f) => URL.revokeObjectURL(f.preview))
      if (amenitiesUsedFile?.preview) URL.revokeObjectURL(amenitiesUsedFile.preview)
      if (amenitiesReplacedFile?.preview) URL.revokeObjectURL(amenitiesReplacedFile.preview)
      if (laundryUsedFile?.preview) URL.revokeObjectURL(laundryUsedFile.preview)
      if (laundryReplacedFile?.preview) URL.revokeObjectURL(laundryReplacedFile.preview)
    }
  }, [])

  const effective = getEffectiveStatus(cleaning)
  const isApproved = effective === 'completed'
  const isCancelled = effective === 'cancelled'
  const isLocked = isApproved || isCancelled

  const toPreview = (file) => ({ file, preview: URL.createObjectURL(file) })
  const handleAddBefore = (files) => setNewBefore((p) => [...p, ...files.map(toPreview)])
  const handleAddAfter = (files) => setNewAfter((p) => [...p, ...files.map(toPreview)])
  const handleAddReport = (files) => setNewReport((p) => [...p, ...files.map(toPreview)])

  const removeNew = (setter) => (i) => {
    setter((p) => {
      const copy = [...p]
      URL.revokeObjectURL(copy[i].preview)
      copy.splice(i, 1)
      return copy
    })
  }

  const handleRemoveExisting = (setter, existingArr) => (photo) => {
    if (!window.confirm('Remove this photo? It will be deleted when you Submit.')) return
    setter(existingArr.filter((p) => p.path !== photo.path))
  }

  const handleSubmit = async () => {
    // Never submit an approved or cancelled cleaning.
    if (isLocked) {
      toast.error(isCancelled ? 'This cleaning was cancelled.' : 'This cleaning has been approved by admin and can no longer be edited.')
      return
    }
    const ok = window.confirm('Submit this cleaning? You can still edit after submitting.')
    if (!ok) return
    setSubmitting(true)
    try {
      await submitCleaning({
        cleaning,
        newPhotosBefore: newBefore.map((x) => x.file),
        newPhotosAfter: newAfter.map((x) => x.file),
        newPhotosReport: newReport.map((x) => x.file),
        newAmenitiesUsedPhoto: amenitiesUsedFile?.file || null,
        newAmenitiesReplacedPhoto: amenitiesReplacedFile?.file || null,
        newLaundryUsedPhoto: laundryUsedFile?.file || null,
        newLaundryReplacedPhoto: laundryReplacedFile?.file || null,
        keepPhotosBefore: keepBefore,
        keepPhotosAfter: keepAfter,
        keepPhotosReport: keepReport,
        amenitiesUsedItems,
        amenitiesReplacedItems,
        laundryUsedItems,
        laundryReplacedItems,
        laundryPaymentAmount: laundryAmount ? Number(laundryAmount) : null,
        laundryPaymentMethod: laundryMethod || null,
        laundryPaymentReference: laundryReference || null,
        laundryPaymentNote: laundryNote || null,
        notes: notesDraft,
      })
      toast.success('Cleaning submitted')
      onChanged()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const booking = cleaning.bookings
  const unit = cleaning.units
  const photoTabs = [
    { id: 'before', label: 'Before' },
    { id: 'after', label: 'After' },
    { id: 'report', label: 'Report' },
  ]
  const photoCounts = {
    before: keepBefore.length + newBefore.length,
    after: keepAfter.length + newAfter.length,
    report: keepReport.length + newReport.length,
  }
  const fieldLabel = 'text-[10px] uppercase tracking-wider text-foreground font-semibold mb-1 block'

  return (
    <motion.div {...panelMotion}>
      <div className="h-full rounded-md border border-border bg-card shadow-lg overflow-hidden flex flex-col">
        <div className="flex-shrink-0 px-5 py-4 line-below">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Code value={cleaning.cleaning_code} label="Cleaning code" className="text-sm" block />
              <p className="text-xs text-foreground mt-0.5 flex items-center gap-1 min-w-0">
                <Code value={unit?.unit_code} label="Unit code" className="text-xs" />
                {unit?.building && <span className="truncate">· {unit.building}</span>}
              </p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <TypeText type={cleaning.type} />
                <StatusText cleaning={cleaning} />
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-foreground flex-shrink-0" aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {isApproved && (
            <Notice icon={Lock} tone="good" title="Approved by admin · locked">
              This cleaning is complete and can't be edited. Contact the admin if something needs fixing.
            </Notice>
          )}
          {isCancelled && (
            <Notice icon={X} tone="bad" title="This cleaning was cancelled">
              Cancelled cleanings are locked. Nothing to do here.
            </Notice>
          )}
          {effective === 'submitted' && (
            <Notice icon={Hourglass} title="Submitted · waiting for the admin">
              You can still fix anything below and resubmit.
            </Notice>
          )}
          <StayNotice cleaning={cleaning} />

          <DetailSection title="Overview" icon={Clock}>
            <div className="p-3 space-y-0.5">
              <InfoRow label="Code"><Code value={cleaning.cleaning_code} label="Cleaning code" className="text-xs" /></InfoRow>
              <InfoRow label="Type"><TypeText type={cleaning.type} /></InfoRow>
              {booking ? (
                <>
                  <InfoRow label="Booking"><Code value={booking.booking_code} label="Booking code" className="text-xs" /></InfoRow>
                  <InfoRow label="Stay"><span className="tabular-nums">{formatDate(booking.check_in)} → {formatDate(booking.check_out)}</span></InfoRow>
                  <InfoRow label="Check-out">
                    <span className="tabular-nums">
                      {checkoutLabel(cleaning)}
                    </span>
                  </InfoRow>
                  {cleaning.nextCheckInAt && (
                    <InfoRow label="Next guest">
                      <span className="tabular-nums">{formatDate(cleaning.nextCheckInAt)} · {clockOf(new Date(cleaning.nextCheckInAt))}</span>
                    </InfoRow>
                  )}
                </>
              ) : (
                <InfoRow label="Booking"><span className="italic">Standalone deep clean</span></InfoRow>
              )}
              <InfoRow label="Scheduled">
                <span className="tabular-nums">{formatDate(cleaning.scheduled_date)}{relativeDay(cleaning.scheduled_date) ? ` · ${relativeDay(cleaning.scheduled_date)}` : ''}</span>
              </InfoRow>
            </div>
          </DetailSection>

          {isLocked ? (
            <LockedSummary cleaning={cleaning} />
          ) : (
            <>
              <DetailSection title="Cleaning photos" icon={ImageIcon}>
                <div className="p-3 border-b border-border">
                  <StatusTabs tabs={photoTabs} value={photoTab} onChange={setPhotoTab} counts={photoCounts} label="Photo set" fill />
                </div>
                <div className="p-3">
                  {photoTab === 'before' && <PhotoGridLocal existing={keepBefore} newFiles={newBefore} limit={PHOTO_LIMITS.before} onAdd={handleAddBefore} onRemoveExisting={handleRemoveExisting(setKeepBefore, keepBefore)} onRemoveNew={removeNew(setNewBefore)} />}
                  {photoTab === 'after' && <PhotoGridLocal existing={keepAfter} newFiles={newAfter} limit={PHOTO_LIMITS.after} onAdd={handleAddAfter} onRemoveExisting={handleRemoveExisting(setKeepAfter, keepAfter)} onRemoveNew={removeNew(setNewAfter)} />}
                  {photoTab === 'report' && <PhotoGridLocal existing={keepReport} newFiles={newReport} limit={PHOTO_LIMITS.report} onAdd={handleAddReport} onRemoveExisting={handleRemoveExisting(setKeepReport, keepReport)} onRemoveNew={removeNew(setNewReport)} />}
                </div>
              </DetailSection>

              <DetailSection title="Amenities" icon={Coffee}>
                <UsedReplacedEditor
                  used={{ existing: amenitiesUsedExisting, newFile: amenitiesUsedFile }}
                  replaced={{ existing: amenitiesReplacedExisting, newFile: amenitiesReplacedFile }}
                  onPickUsed={(f) => setAmenitiesUsedFile({ file: f, preview: URL.createObjectURL(f) })}
                  onPickReplaced={(f) => setAmenitiesReplacedFile({ file: f, preview: URL.createObjectURL(f) })}
                  onClearUsed={() => { setAmenitiesUsedFile(null); setAmenitiesUsedExisting(null) }}
                  onClearReplaced={() => { setAmenitiesReplacedFile(null); setAmenitiesReplacedExisting(null) }}
                  usedItems={amenitiesUsedItems}
                  replacedItems={amenitiesReplacedItems}
                  onUsedItemsChange={setAmenitiesUsedItems}
                  onReplacedItemsChange={setAmenitiesReplacedItems}
                  placeholder="e.g. Coffee, Water"
                />
              </DetailSection>

              <DetailSection title="Laundry" icon={Shirt}>
                <UsedReplacedEditor
                  used={{ existing: laundryUsedExisting, newFile: laundryUsedFile }}
                  replaced={{ existing: laundryReplacedExisting, newFile: laundryReplacedFile }}
                  onPickUsed={(f) => setLaundryUsedFile({ file: f, preview: URL.createObjectURL(f) })}
                  onPickReplaced={(f) => setLaundryReplacedFile({ file: f, preview: URL.createObjectURL(f) })}
                  onClearUsed={() => { setLaundryUsedFile(null); setLaundryUsedExisting(null) }}
                  onClearReplaced={() => { setLaundryReplacedFile(null); setLaundryReplacedExisting(null) }}
                  usedItems={laundryUsedItems}
                  replacedItems={laundryReplacedItems}
                  onUsedItemsChange={setLaundryUsedItems}
                  onReplacedItemsChange={setLaundryReplacedItems}
                  placeholder="e.g. Bath towel, Bedsheet"
                />
              </DetailSection>

              <DetailSection title="Laundry payment (optional)" icon={Wallet}>
                <div className="p-3 space-y-3">
                  <p className="text-[11px] text-foreground">
                    If the laundry shop was paid for a replacement, enter it here. The admin can fill this in too.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={fieldLabel} htmlFor="hk-laundry-amount">Amount (₱)</label>
                      <Input id="hk-laundry-amount" type="number" min={0} value={laundryAmount} onChange={(e) => setLaundryAmount(e.target.value)} placeholder="0" className="h-9 text-xs rounded-md" />
                    </div>
                    <div>
                      <label className={fieldLabel} htmlFor="hk-laundry-method">Method</label>
                      <Input id="hk-laundry-method" maxLength={60} value={laundryMethod} onChange={(e) => setLaundryMethod(e.target.value)} placeholder="GCash, Cash…" className="h-9 text-xs rounded-md" />
                    </div>
                  </div>
                  <div>
                    <label className={fieldLabel} htmlFor="hk-laundry-ref">Reference</label>
                    <Input id="hk-laundry-ref" maxLength={100} value={laundryReference} onChange={(e) => setLaundryReference(e.target.value)} className="h-9 text-xs rounded-md" />
                  </div>
                  <div>
                    <label className={fieldLabel} htmlFor="hk-laundry-note">Note</label>
                    <Textarea id="hk-laundry-note" maxLength={2000} value={laundryNote} onChange={(e) => setLaundryNote(e.target.value)} rows={2} className="text-xs rounded-md resize-none" />
                  </div>
                </div>
              </DetailSection>

              <DetailSection title="Notes" icon={Sparkles}>
                <div className="p-3">
                  <Textarea maxLength={2000} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3}
                    placeholder="Anything the admin should know about this cleaning…" aria-label="Notes" className="text-xs rounded-md resize-none" />
                </div>
              </DetailSection>
            </>
          )}
        </div>

        {!isLocked && (
          <div className="flex-shrink-0 border-t border-border p-3">
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="w-full h-10 rounded-md bg-brand-solid text-white font-semibold text-[13px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50">
              <Send size={15} />
              {submitting ? 'Submitting…' : effective === 'submitted' ? 'Resubmit' : 'Submit cleaning'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// The signal: a unit has just been cleared for cleaning
// ─────────────────────────────────────────────────────────────

function placeOf(cleaning) {
  return [cleaning.units?.unit_code, cleaning.units?.building].filter(Boolean).join(' · ') || 'A unit'
}

// A toast with Open, a buzz on phones, and a system notification when alerts
// are on and the page is in the background (only while the page is open: it
// has no way to reach a closed browser).
function announceReady(cleaning, open: () => void) {
  const place = placeOf(cleaning)
  toast((t) => (
    <span className="flex items-start gap-3 text-[13px]">
      <DoorOpen size={18} aria-hidden className="flex-shrink-0 mt-0.5" />
      <span className="min-w-0">
        <strong className="block font-semibold">{place} is ready to clean</strong>
        <span>The guest has checked out.</span>
      </span>
      <button
        type="button"
        onClick={() => { toast.dismiss(t.id); open() }}
        className="flex-shrink-0 font-semibold underline underline-offset-2"
      >
        Open
      </button>
    </span>
  ), { id: `ready-${cleaning.id}`, duration: 12000 })

  try { navigator.vibrate?.([200, 100, 200]) } catch { /* no vibration here */ }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
  const title = `${place} is ready to clean`
  const options = { body: 'The guest has checked out.', tag: `ready-${cleaning.id}` }
  try {
    const n = new Notification(title, options)
    n.onclick = () => { window.focus(); open(); n.close() }
  } catch {
    // Phones only allow notifications through a service worker.
    navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.showNotification(title, options)).catch(() => {})
  }
}

type AlertsState = NotificationPermission | 'unsupported'

function alertsState(): AlertsState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

// ─────────────────────────────────────────────────────────────
// Today: what's ready now, and what's waiting for a guest to leave
// ─────────────────────────────────────────────────────────────

const READY_TONE = STATUS_TEXT.ready.className
const WAITING_TONE = STATUS_TEXT.scheduled.className

/** Where a cleaning stands today, for the Today card. */
function todayState(cleaning, now: number, today: string) {
  const status = getEffectiveStatus(cleaning)
  if (status === 'submitted' || status === 'completed' || status === 'cancelled') return null
  if (!cleaning.bookings?.check_out) return { kind: 'ready' as const, since: null }
  const state = guestState(cleaning.bookings, now)
  if (state.kind === 'left') return { kind: 'ready' as const, since: state.at }
  // Still in: only today's check-outs belong on the Today card.
  const outToday = String(cleaning.bookings.check_out).slice(0, 10) === today || cleaning.scheduled_date === today
  if (!outToday || state.kind === 'none') return null
  return { kind: 'waiting' as const, state }
}

type TodayRowProps = {
  cleaning: any
  now: number
  today: string
  onOpen: () => void
}

function ReadyRow({ cleaning, now, today, onOpen }: TodayRowProps) {
  const unit = cleaning.units
  const state = todayState(cleaning, now, today)
  const since = state?.kind === 'ready' ? state.since : null
  const nextGuest = nextGuestOn(cleaning, today)
  const place = [unit?.unit_code, unit?.building].filter(Boolean).join(' · ') || 'Unit not set'
  const lead = since ? formatSpan(now - since.getTime()) : 'Ready'
  const caption = since ? 'since guest left' : 'no guest'
  return (
    <QueueRow
      lead={lead}
      leadCaption={caption}
      leadTone={READY_TONE}
      label={`Open ${place}: ready to clean`}
      title={(
        <>
          {place}
          {cleaning.cleaning_code && <span className="ml-2 inline-flex align-middle"><Code value={cleaning.cleaning_code} label="Cleaning code" className="text-[11px]" /></span>}
        </>
      )}
      subtitle={(
        <>
          <span className="font-semibold">{since ? `Guest checked out ${clockOf(since)}` : 'No guest before this one'}</span>
          {nextGuest
            ? <WithDot><span className="font-semibold text-amber-600 dark:text-amber-400">Finish by {clockOf(nextGuest)}</span></WithDot>
            : cleaning.scheduled_date && cleaning.scheduled_date !== today && <WithDot>{relativeDay(cleaning.scheduled_date)}</WithDot>}
        </>
      )}
      aside={<TypeText type={cleaning.type} />}
      asideSub={nextGuest ? 'Next guest today' : null}
      actions={<RowAction primary icon={Sparkles} onClick={onOpen}>Start cleaning</RowAction>}
      onClick={onOpen}
    />
  )
}

function WaitingRow({ cleaning, now, today, onOpen }: TodayRowProps) {
  const unit = cleaning.units
  const state = todayState(cleaning, now, today)
  if (state?.kind !== 'waiting') return null
  const guest = state.state
  const late = lateCheckout(cleaning)
  const place = [unit?.unit_code, unit?.building].filter(Boolean).join(' · ') || 'Unit not set'
  const staying = guest.kind === 'staying'
  const due = 'due' in guest ? guest.due : null
  const lead = staying && due ? formatSpan(due.getTime() - now) : due ? clockOf(due) : '—'
  const caption = staying ? (late ? 'to late check-out' : 'to check-out') : 'not confirmed'
  return (
    <QueueRow
      lead={lead}
      leadCaption={caption}
      leadTone={WAITING_TONE}
      label={`Open ${place}: guest still in`}
      title={(
        <>
          {place}
          {cleaning.cleaning_code && <span className="ml-2 inline-flex align-middle"><Code value={cleaning.cleaning_code} label="Cleaning code" className="text-[11px]" /></span>}
        </>
      )}
      subtitle={(
        <>
          <span>{staying ? 'Guest is still in' : 'Check-out not confirmed'}</span>
          {!staying && <WithDot><span className="font-semibold">Don&apos;t go in yet</span></WithDot>}
          {late && <WithDot><span className="font-semibold">Late check-out {clockOf(late)}</span></WithDot>}
                  </>
      )}
      aside={<TypeText type={cleaning.type} />}
      onClick={onOpen}
    />
  )
}

type HousekeeperTodayProps = {
  cleanings: any[]
  loading: boolean
  onOpen: (id: any) => void
}

// The top of the page: units the booker has cleared (start these now) and
// today's check-outs still in progress. Ticks every minute; a unit moves
// across as soon as its check-out is confirmed in the CRM.
function HousekeeperToday({ cleanings, loading, onOpen }: HousekeeperTodayProps) {
  const now = useNow()
  const today = useLocalToday()
  const { ready, waiting } = useMemo(() => {
    const ready = []
    const waiting = []
    for (const c of cleanings) {
      const state = todayState(c, now, today)
      if (state?.kind === 'ready') ready.push({ c, since: state.since })
      else if (state?.kind === 'waiting') waiting.push({ c, due: 'due' in state.state ? state.state.due : null })
    }
    // Ready: a next guest arriving today first, then whoever has waited longest.
    ready.sort((a, b) =>
      Number(!!nextGuestOn(b.c, today)) - Number(!!nextGuestOn(a.c, today))
      || (a.since?.getTime() ?? 0) - (b.since?.getTime() ?? 0))
    waiting.sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0))
    return { ready: ready.map((r) => r.c), waiting: waiting.map((w) => w.c) }
  }, [cleanings, now, today])

  const summary = loading
    ? 'Loading…'
    : ready.length > 0
      ? `${ready.length} unit${ready.length === 1 ? '' : 's'} ready to clean`
      : waiting.length > 0
        ? 'Waiting for guests to check out'
        : 'Nothing to clean right now'

  return (
    <Panel>
      <PanelHeader icon={DoorOpen} title="Today" subtitle={summary} />
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <QueueColumn
          icon={DoorOpen}
          title="Ready to clean"
          hint="The guest has checked out. You can go in."
          count={loading ? null : ready.length}
          countTone={READY_TONE}
          loading={loading}
          emptyIcon={Clock}
          emptyTitle="Nothing ready yet"
          emptyText="A unit shows up here the moment its guest checks out."
        >
          {ready.map((c) => <ReadyRow key={c.id} cleaning={c} now={now} today={today} onOpen={() => onOpen(c.id)} />)}
        </QueueColumn>
        <QueueColumn
          icon={Clock}
          title="Waiting for check-out"
          hint="Today's guests still in. Wait until they show as ready."
          count={loading ? null : waiting.length}
          loading={loading}
          emptyIcon={CheckCircle2}
          emptyTitle="No one left to check out"
          emptyText="Every guest leaving today is out."
        >
          {waiting.map((c) => <WaitingRow key={c.id} cleaning={c} now={now} today={today} onOpen={() => onOpen(c.id)} />)}
        </QueueColumn>
      </div>
    </Panel>
  )
}

type TaskRowProps = {
  cleaning: any
  selected: boolean
  onClick: () => void
}

function TaskRow({ cleaning, selected, onClick }: TaskRowProps) {
  const unit = cleaning.units
  const booking = cleaning.bookings
  const photos = photoCount(cleaning)
  const rel = relativeDay(cleaning.scheduled_date)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      data-row
      initial={false}
      animate={{ backgroundColor: selected ? 'rgba(34, 81, 147, 0.10)' : 'rgba(34, 81, 147, 0)' }}
      transition={{ duration: 0.22 }}
      whileHover={{ backgroundColor: selected ? 'rgba(34, 81, 147, 0.14)' : 'rgba(34, 81, 147, 0.05)' }}
      className={cn('row-line w-full text-left px-4 py-3 cursor-pointer select-none', ROW_GRID)}
    >
      <div className="min-w-0">
        <Code value={cleaning.cleaning_code} label="Cleaning code" className="text-[12.5px]" block />
        <span className="text-[11.5px] text-foreground flex items-center gap-1 min-w-0">
          <Code value={unit?.unit_code} label="Unit code" className="text-[11.5px]" />
          {unit?.building && <span className="truncate">· {unit.building}</span>}
        </span>
      </div>
      <div className="min-w-0 max-md:col-span-2">
        {booking ? (
          <>
            <Code value={booking.booking_code} label="Booking code" className="text-[12px]" block />
            <span className="text-[11.5px] text-foreground truncate block">
              {booking.check_out ? `Out ${checkoutLabel(cleaning)}` : ''}
            </span>
          </>
        ) : (
          <span className="text-[11.5px] italic text-foreground">Standalone</span>
        )}
      </div>
      <div className="min-w-0"><TypeText type={cleaning.type} /></div>
      <div className="min-w-0 tabular-nums">
        <span className="text-[12.5px] font-medium text-foreground truncate block">{formatDate(cleaning.scheduled_date)}</span>
        <span className="text-[11.5px] text-foreground truncate block">
          {[rel, photos > 0 ? `${photos} photo${photos === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="flex items-center justify-end min-w-0">
        <StatusText cleaning={cleaning} />
      </div>
    </motion.button>
  )
}

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'completed', label: 'Approved' },
]

export default function HousekeeperTasksPage() {
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { housekeeper } = useUserRole()
  const listCap = useListCap()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef(null)

  const [cleanings, setCleanings] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'status', dir: 'asc' })
  const [now] = useState(() => new Date())
  const hasLoaded = useRef(false)

  const fetchData = useCallback(async (hkId?) => {
    const id = hkId || housekeeper?.id
    if (!id) { setCleanings([]); setLoading(false); return }
    if (hasLoaded.current) setRefreshing(true)
    else setLoading(true)
    setFetchError(null)
    try {
      const [cRes, dRes] = await Promise.all([
        supabase
          .from('cleanings')
          .select('*')
          .eq('housekeeper_id', id)
          .order('scheduled_date', { ascending: true, nullsFirst: false }),
        supabase.rpc('housekeeper_cleaning_details'),
      ])
      if (cRes.error) throw cRes.error
      if (dRes.error) throw dRes.error
      const details = new Map((dRes.data || []).map((d) => [d.cleaning_id, d]))
      setCleanings((cRes.data || []).map((c) => withStay(c, details.get(c.id))))
      hasLoaded.current = true
    } catch (err) {
      console.error('Fetch cleanings failed:', err)
      setFetchError(err?.message || 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [housekeeper?.id])

  useEffect(() => {
    if (!housekeeper?.id) { setCleanings([]); setLoading(false); return }
    fetchData(housekeeper.id)
  }, [housekeeper?.id, fetchData])

  useEffect(() => {
    if (!housekeeper?.id) return
    const channel = supabase
      .channel(`hk-cleanings-${housekeeper.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleanings', filter: `housekeeper_id=eq.${housekeeper.id}` },
        () => { fetchData(housekeeper.id) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [housekeeper?.id, fetchData])

  const closePanel = useCallback(() => setSelectedId(null), [])
  useListShortcuts({ searchRef, onEscape: closePanel })

  const counts = useMemo(() => {
    const c = { all: cleanings.length, ready: 0, scheduled: 0, submitted: 0, completed: 0, cancelled: 0 }
    for (const x of cleanings) c[getEffectiveStatus(x)]++
    return c
  }, [cleanings])

  // A unit turning Ready after the first load (its check-out was just
  // confirmed in the CRM; the change arrives live) is announced.
  const readySeen = useRef<Set<any> | null>(null)
  useEffect(() => {
    if (loading) return
    const readyNow = new Set(cleanings.filter((c) => getEffectiveStatus(c) === 'ready').map((c) => c.id))
    const seen = readySeen.current
    readySeen.current = readyNow
    if (!seen) return
    for (const c of cleanings) {
      if (readyNow.has(c.id) && !seen.has(c.id)) announceReady(c, () => setSelectedId(c.id))
    }
  }, [cleanings, loading])

  // The tab shows how many units are ready, e.g. "(2) Ready to clean".
  useEffect(() => {
    const before = document.title
    if (counts.ready > 0) document.title = `(${counts.ready}) Ready to clean · Iloilo Rentals`
    return () => { document.title = before }
  }, [counts.ready])

  // System notifications, for when the page is in the background.
  const [alerts, setAlerts] = useState<AlertsState>(alertsState)
  const turnOnAlerts = async () => {
    if (alerts === 'unsupported') {
      toast("This browser can't show alerts. Keep this page open: ready units pop up here.")
      return
    }
    if (alerts === 'granted') {
      toast.success("Alerts are on. You'll get one when a unit is ready.")
      return
    }
    if (alerts === 'denied') {
      toast('Alerts are blocked for this site. Allow notifications in your browser settings.')
      return
    }
    const answer = await Notification.requestPermission()
    setAlerts(answer)
    if (answer === 'granted') toast.success("Alerts on. You'll get one when a unit is ready.")
  }

  const tabs = counts.cancelled > 0 ? [...STATUS_TABS, { id: 'cancelled', label: 'Cancelled' }] : STATUS_TABS

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = cleanings.filter((c) => {
      if (statusFilter !== 'all' && getEffectiveStatus(c) !== statusFilter) return false
      if (!q) return true
      return [c.cleaning_code, c.units?.unit_code, c.units?.building, c.bookings?.booking_code, c.bookings?.guest_name, c.type]
        .some((v) => String(v || '').toLowerCase().includes(q))
    })
    const value = SORT_VALUE[sort.key] || SORT_VALUE.status
    const dir = sort.dir === 'asc' ? 1 : -1
    return rows.sort((a, b) => {
      const va = value(a), vb = value(b)
      if (va < vb) return -dir
      if (va > vb) return dir
      return String(a.scheduled_date || '').localeCompare(String(b.scheduled_date || ''))
    })
  }, [cleanings, statusFilter, search, sort])

  const onSort = (key) => setSort((s) => nextSort(s, key, SORT_DEFAULT_DIR))
  const pick = (id) => setStatusFilter((cur) => (cur === id ? 'all' : id))
  const selected = cleanings.find((c) => c.id === selectedId) || null

  const firstName = (housekeeper?.name || '').trim().split(/\s+/)[0]
  const summary = [
    counts.ready > 0 && `${counts.ready} ready to clean`,
    counts.scheduled > 0 && `${counts.scheduled} scheduled`,
    counts.submitted > 0 && `${counts.submitted} waiting for review`,
  ].filter(Boolean).join(' · ') || (loading ? ' ' : 'Nothing to clean right now')

  const chips = []
  if (statusFilter !== 'all') chips.push({ key: 'status', label: tabs.find((t) => t.id === statusFilter)?.label || statusFilter, onRemove: () => setStatusFilter('all') })
  if (search.trim()) chips.push({ key: 'search', label: `"${search.trim()}"`, onRemove: () => setSearch('') })

  const headerButton = 'inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-border text-[12px] font-medium text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-[#070a12] text-foreground">
      <WelcomeModal workspace="housekeeping" userId={user?.id} name={housekeeper?.name} ready={!!housekeeper} />
      <header className="flex-shrink-0 h-14 flex items-center justify-between gap-3 px-4 md:px-5 border-b border-[#e1e7ef] dark:border-white/[0.07] bg-white dark:bg-[#0f131c]">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles size={18} strokeWidth={1.75} className="text-foreground flex-shrink-0" />
          <h2 className="text-[15px] font-semibold text-foreground truncate tracking-tight">Housekeeping tasks</h2>
          <span className="hidden md:inline text-[11px] text-foreground tabular-nums whitespace-nowrap ml-1">
            <span className="mx-1.5">·</span>
            {now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={turnOnAlerts}
            className={cn(headerButton, 'w-8 sm:w-auto sm:px-3', alerts === 'granted' && 'border-brand-solid')}
            aria-label={alerts === 'granted' ? 'Alerts are on' : 'Turn on alerts'}
            title={alerts === 'granted' ? 'Alerts are on' : 'Get an alert when a unit is ready to clean'}
          >
            {alerts === 'granted' ? <BellRing size={14} /> : <Bell size={14} />}
            <span className="hidden sm:inline">{alerts === 'granted' ? 'Alerts on' : 'Turn on alerts'}</span>
          </button>
          <button onClick={() => navigate('/')} className={cn(headerButton, 'w-8 sm:w-auto sm:px-3')} aria-label="Back to site" title="Back to site">
            <ArrowLeft size={13} className="hidden sm:block" />
            <Home size={14} className="sm:hidden" />
            <span className="hidden sm:inline">Back to site</span>
          </button>
          <button onClick={toggleTheme} className={cn(headerButton, 'w-8')} aria-label="Toggle theme" title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={async () => { await signOut(); navigate('/') }} className={cn(headerButton, 'w-8 sm:w-auto sm:px-3 hover:text-red-600')} aria-label="Sign out" title="Sign out">
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div ref={rootRef} className="flex-1 min-h-0 flex relative">
        <div data-page-scroll className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-4 py-4 md:px-8 md:py-6 max-w-[1600px] mx-auto flex flex-col gap-4">
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold text-foreground tracking-tight leading-tight">
                {greetingFor(now)}{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="text-[12.5px] text-foreground mt-1 truncate">{summary}</p>
            </div>

            {fetchError ? (
              <div className="rounded-md border border-border bg-card shadow-sm text-center py-14 px-4">
                <AlertTriangle size={32} className="mx-auto mb-3 text-foreground" />
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">Couldn't load your cleanings</p>
                <p className="text-xs text-foreground mt-1 break-words">{fetchError}</p>
                <button type="button" onClick={() => fetchData()} className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted">
                  <RefreshCw size={12} /> Try again
                </button>
              </div>
            ) : !loading && !housekeeper ? (
              <div className="rounded-md border border-border bg-card shadow-sm text-center py-14 px-4">
                <AlertTriangle size={32} className="text-foreground mx-auto mb-3" />
                <p className="text-sm font-semibold text-foreground">Account not linked</p>
                <p className="text-xs text-foreground mt-1">Ask the admin to link your account to your housekeeper profile.</p>
              </div>
            ) : (
              <>
                <HousekeeperToday cleanings={cleanings} loading={loading} onOpen={setSelectedId} />

                <StatStrip cols={4}>
                  <StatTile icon={DoorOpen} label="Ready to clean" value={counts.ready} loading={loading}
                    sub={counts.ready > 0 ? 'Guest has left · clean these next' : 'Nothing waiting'}
                    attention={counts.ready > 0} active={statusFilter === 'ready'} onClick={() => pick('ready')} />
                  <StatTile icon={Clock} label="Scheduled" value={counts.scheduled} loading={loading}
                    sub="Guest still in the unit" active={statusFilter === 'scheduled'} onClick={() => pick('scheduled')} />
                  <StatTile icon={Hourglass} label="Submitted" value={counts.submitted} loading={loading}
                    sub="Waiting for admin review" active={statusFilter === 'submitted'} onClick={() => pick('submitted')} />
                  <StatTile icon={CheckCircle2} label="Approved" value={counts.completed} loading={loading}
                    sub="Done and locked" active={statusFilter === 'completed'} onClick={() => pick('completed')} />
                </StatStrip>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground" />
                    <Input ref={searchRef} placeholder="Search code, unit, booking, guest…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 pr-9 h-8 text-xs rounded" />
                    {!search && <SearchKeyHint />}
                  </div>
                  <button type="button" onClick={() => fetchData()} disabled={refreshing || loading} className="h-8 w-8 inline-flex items-center justify-center rounded border border-border bg-card text-foreground hover:bg-muted disabled:opacity-60" aria-label="Refresh" title="Refresh">
                    <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
                  </button>
                </div>

                <StatusTabs tabs={tabs} value={statusFilter} onChange={setStatusFilter} counts={counts} label="Filter cleanings by status" />

                {!loading && (
                  <ResultsBar shown={sorted.length} total={cleanings.length} noun={cleanings.length === 1 ? 'cleaning' : 'cleanings'}
                    chips={chips} onClearAll={() => { setStatusFilter('all'); setSearch('') }} hint="Click a column to sort · Press / to search" />
                )}

                <div className="rounded-md border border-border shadow-sm overflow-hidden bg-card">
                  <div {...listCap} className="overflow-y-auto">
                    <MobileSort
                      options={[{ key: 'code', label: 'Code · Unit' }, { key: 'booking', label: 'Booking' }, { key: 'type', label: 'Type' }, { key: 'scheduled', label: 'Scheduled' }, { key: 'status', label: 'Status' }]}
                      sort={sort}
                      onSort={onSort}
                      className="sticky top-0 z-10"
                    />
                    <div className={cn('sticky top-0 z-10 px-4 py-2.5 border-b border-border bg-card max-md:hidden', ROW_GRID)}>
                      <SortHeader label="Code · Unit" sortKey="code" sort={sort} onSort={onSort} />
                      <SortHeader label="Booking" sortKey="booking" sort={sort} onSort={onSort} />
                      <SortHeader label="Type" sortKey="type" sort={sort} onSort={onSort} />
                      <SortHeader label="Scheduled" sortKey="scheduled" sort={sort} onSort={onSort} />
                      <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} align="right" />
                    </div>

                    {loading ? (
                      <div className="space-y-2 p-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : sorted.length === 0 ? (
                      <div className="text-center py-12 px-4">
                        <Sparkles size={32} strokeWidth={1.5} className="text-foreground mx-auto mb-3" />
                        <p className="text-sm font-semibold text-foreground">
                          {cleanings.length === 0 ? 'No cleanings assigned to you' : 'No cleanings match'}
                        </p>
                        <p className="text-xs text-foreground mt-1">
                          {cleanings.length === 0 ? "You're all caught up. New ones show up here as soon as they're assigned." : 'Try another status or clear the search.'}
                        </p>
                      </div>
                    ) : (
                      sorted.map((c) => (
                        <TaskRow key={c.id} cleaning={c} selected={selectedId === c.id} onClick={() => setSelectedId((id) => (id === c.id ? null : c.id))} />
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {selected && (
            <CleaningPanel key="panel" cleaning={selected} onClose={closePanel} onChanged={() => fetchData()} />
          )}
        </AnimatePresence>

        <PageScrollHelper rootRef={rootRef} bottom="20px" />
      </div>
    </div>
  )
}
