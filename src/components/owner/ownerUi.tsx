// src/components/owner/ownerUi.tsx
// Small pieces shared by the owner portal: money and date formats, status
// text, and the booking / cleaning rows (the same details the Accounting
// page shows, without guest contact information).
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTRACT_STATUS_TEXT, deriveContractStatus } from '@/lib/contracts'
import type { ReactNode } from 'react'

export const OWNER_PCT = 75
export const COMPANY_PCT = 25

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function formatMoney(n) {
  const v = Number(n || 0)
  return `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Whole pesos, for big KPI numbers. */
export function formatPeso(n) {
  const v = Math.round(Number(n || 0))
  return `${v < 0 ? '−' : ''}₱${Math.abs(v).toLocaleString('en-PH')}`
}

export function formatDate(iso, withYear = true) {
  if (!iso) return '—'
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

export function monthLabel(key, long = false) {
  const [y, m] = String(key).split('-').map(Number)
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`
}

export function nightsBetween(a, b) {
  const x = new Date(`${a}T00:00:00Z`).getTime()
  const y = new Date(`${b}T00:00:00Z`).getTime()
  return Number.isFinite(x) && Number.isFinite(y) ? Math.max(0, Math.round((y - x) / 86_400_000)) : 0
}

// Profit in green, loss in red (as on the Accounting page).
export function moneyTone(n) {
  const v = Number(n)
  if (v > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (v < 0) return 'text-red-600 dark:text-red-400'
  return 'text-foreground'
}

type ContractStatusProps = {
  contract: any
  className?: string
}

export function ContractStatus({ contract, className }: ContractStatusProps) {
  const s = CONTRACT_STATUS_TEXT[deriveContractStatus(contract)] || CONTRACT_STATUS_TEXT.incomplete
  return <span className={cn('text-[11.5px] font-semibold whitespace-nowrap', s.className, className)}>{s.label}</span>
}

// ── Bookings ────────────────────────────────────────────────
const BOOKING_STATUS = {
  upcoming:  { label: 'Upcoming',  className: 'text-blue-600 dark:text-blue-400' },
  inhouse:   { label: 'In-house',  className: 'text-emerald-600 dark:text-emerald-400' },
  completed: { label: 'Completed', className: 'text-foreground' },
  cancelled: { label: 'Cancelled', className: 'text-red-600 dark:text-red-400' },
}

export function bookingStatus(b, today = todayISO()) {
  if (b.cancelled_at) return 'cancelled'
  if (b.check_in > today) return 'upcoming'
  if (b.check_in <= today && b.check_out > today && !b.completed_at) return 'inhouse'
  return 'completed'
}

const PAYMENT = {
  paid:    { label: 'Paid',    className: 'text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'Partly paid', className: 'text-amber-600 dark:text-amber-400' },
  unpaid:  { label: 'Unpaid',  className: 'text-amber-600 dark:text-amber-400' },
}

type BookingRowProps = {
  booking: any
}

export function BookingRow({ booking }: BookingRowProps) {
  const status = BOOKING_STATUS[bookingStatus(booking)]
  const cancelled = !!booking.cancelled_at
  const pay = PAYMENT[booking.payment_status]
  const nights = nightsBetween(booking.check_in, booking.check_out)
  return (
    <div className="relative px-4 sm:px-5 py-3 border-b border-border last:border-0">
      <span aria-hidden className={cn('absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r', cancelled ? 'bg-red-600' : 'bg-brand-solid')} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate">{booking.guest_name || 'Guest'}</p>
          <p className="text-[11.5px] text-foreground mt-0.5 tabular-nums">
            <span className={cn(cancelled && 'line-through')}>{formatDate(booking.check_in, false)} → {formatDate(booking.check_out)}</span>
            {' · '}{nights} night{nights === 1 ? '' : 's'} · {booking.guests || 1} guest{booking.guests === 1 ? '' : 's'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[13px] font-semibold tabular-nums text-foreground">{formatMoney(booking.total_amount)}</p>
          <p className={cn('text-[11.5px] font-semibold mt-0.5', status.className)}>{status.label}</p>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-foreground tabular-nums">
        <span className="font-mono">{booking.booking_code}</span>
        {!cancelled && pay && <span className={cn('font-semibold', pay.className)}>{pay.label}</span>}
        {Number(booking.booker_commission) > 0 && (
          <span>Booker{booking.booker_name ? ` ${booking.booker_name}` : ''} <span className="font-semibold">{formatMoney(booking.booker_commission)}</span></span>
        )}
        {Number(booking.affiliate_commission) > 0 && (
          <span>Affiliate{booking.affiliate_name ? ` ${booking.affiliate_name}` : ''} <span className="font-semibold">{formatMoney(booking.affiliate_commission)}</span></span>
        )}
      </div>
      {cancelled && booking.cancelled_reason && (
        <p className="mt-1 text-[11.5px] text-foreground break-words">Reason: {booking.cancelled_reason}</p>
      )}
    </div>
  )
}

// ── Cleanings ───────────────────────────────────────────────
const CLEANING_STATUS = {
  scheduled: { label: 'Scheduled', className: 'text-amber-600 dark:text-amber-400' },
  ready:     { label: 'Ready',     className: 'text-blue-600 dark:text-blue-400' },
  submitted: { label: 'In review', className: 'text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed', className: 'text-emerald-600 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', className: 'text-red-600 dark:text-red-400' },
}

type CleaningRowProps = {
  cleaning: any
}

export function CleaningRow({ cleaning }: CleaningRowProps) {
  const status = CLEANING_STATUS[cleaning.status] || { label: cleaning.status || '—', className: 'text-foreground' }
  const cost = Number(cleaning.payment_amount || 0) + Number(cleaning.laundry_payment_amount || 0)
  return (
    <div className="relative px-4 sm:px-5 py-3 border-b border-border last:border-0">
      <span aria-hidden className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r bg-emerald-500" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate flex items-center gap-1.5">
            <Sparkles size={13} className="flex-shrink-0" />
            <span className="capitalize">{cleaning.type || 'Cleaning'}</span> cleaning
          </p>
          <p className="text-[11.5px] text-foreground mt-0.5">
            {formatDate(cleaning.scheduled_date)}
            {cleaning.booking_code && <> · after <span className="font-mono">{cleaning.booking_code}</span>{cleaning.guest_name ? ` (${cleaning.guest_name})` : ''}</>}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[13px] font-semibold tabular-nums text-foreground">{formatMoney(cost)}</p>
          <p className={cn('text-[11.5px] font-semibold mt-0.5', status.className)}>{status.label}</p>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-foreground tabular-nums">
        <span className="font-mono">{cleaning.cleaning_code}</span>
        <span>Housekeeping <span className="font-semibold">{formatMoney(cleaning.payment_amount)}</span></span>
        <span>Laundry <span className="font-semibold">{formatMoney(cleaning.laundry_payment_amount)}</span></span>
      </div>
    </div>
  )
}

type EmptyLineProps = {
  children: ReactNode
}

export function EmptyLine({ children }: EmptyLineProps) {
  return <p className="px-4 sm:px-5 py-6 text-center text-[12px] text-foreground">{children}</p>
}
