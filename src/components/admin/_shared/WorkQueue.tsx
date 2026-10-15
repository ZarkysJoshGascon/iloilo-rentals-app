// src/components/admin/_shared/WorkQueue.tsx
// Agenda-style lists for the "what needs doing" cards (Housekeeping's work
// queue, Bookings' Today card). Each column has a header with a count and a
// one-line hint; each row leads with its time or urgency (big, in its status
// colour), then who and where, then a status on the right.
import { Fragment, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** The time now, refreshed every `ms` so countdowns stay right while the page is open. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** A length of time as "45m", "2h 10m" or "3d 4h". */
export function formatSpan(ms: number) {
  const mins = Math.max(0, Math.floor(Math.abs(ms) / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return mins % 60 ? `${hours}h ${mins % 60}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`
}

/** A clock time as "3 PM" or "11:30 AM". */
export function formatClock(hour: number, minute = 0) {
  const h = hour % 12 || 12
  const suffix = hour < 12 ? 'AM' : 'PM'
  return minute ? `${h}:${String(minute).padStart(2, '0')} ${suffix}` : `${h} ${suffix}`
}

/** A date in this browser's time zone, as YYYY-MM-DD. */
export function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Today's date (YYYY-MM-DD, this browser's time zone); moves on at midnight. */
export function useLocalToday() {
  const [day, setDay] = useState(() => localISODate())
  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    const t = setTimeout(() => setDay(localISODate()), midnight.getTime() - now.getTime())
    return () => clearTimeout(t)
  }, [day])
  return day
}

// The row's first column (the big time or urgency), a little narrower on phones.
const LEAD_COLUMN = 'w-[88px] sm:w-[104px] flex-shrink-0 pl-4 sm:pl-5 pr-3'

/**
 * A part of a row's second line after the first, with the dot before it.
 * They wrap together, so a line never ends on a dangling dot.
 */
export function WithDot({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span aria-hidden className="flex-shrink-0">·</span>
      <span className="truncate">{children}</span>
    </span>
  )
}

// A caption that may wrap between words but never inside one ("check-out").
function keepWords(text: ReactNode) {
  if (typeof text !== 'string') return text
  return text.split(' ').map((word, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span className="whitespace-nowrap">{word}</span>
    </Fragment>
  ))
}

type QueueColumnProps = {
  icon: LucideIcon
  title: string
  hint?: ReactNode
  /** How many rows; null while loading. */
  count: number | null
  /** The count's colour when it isn't zero, e.g. red for overdue. */
  countTone?: string
  loading?: boolean
  emptyIcon?: LucideIcon
  emptyTitle: string
  emptyText?: string
  className?: string
  children: ReactNode
}

export function QueueColumn({
  icon: Icon, title, hint, count, countTone, loading = false,
  emptyIcon, emptyTitle, emptyText, className, children,
}: QueueColumnProps) {
  const EmptyIcon = emptyIcon || Icon
  return (
    <section aria-label={title} className={cn('min-w-0 flex flex-col', className)}>
      <header className="flex items-start gap-2.5 px-5 pt-3.5 pb-3 border-b border-border">
        <Icon size={16} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-shrink-0 text-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
            {count != null && (
              <span
                className={cn(
                  'min-w-[22px] h-5 px-1.5 inline-flex items-center justify-center rounded-md border border-border text-[11px] font-semibold tabular-nums',
                  count > 0 && countTone ? countTone : 'text-foreground',
                )}
              >
                {count}
              </span>
            )}
          </div>
          {hint && <p className="mt-0.5 text-[11.5px] text-foreground line-clamp-2">{hint}</p>}
        </div>
      </header>
      {/* About four rows; more scroll inside. */}
      <div className="max-h-[276px] overflow-y-auto overscroll-contain">
        {loading ? (
          <QueueSkeleton />
        ) : count === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center text-center">
            <EmptyIcon size={20} strokeWidth={1.75} aria-hidden className="text-foreground" />
            <p className="mt-2 text-[12.5px] font-semibold text-foreground">{emptyTitle}</p>
            {emptyText && <p className="mt-0.5 text-[11.5px] text-foreground">{emptyText}</p>}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}

function QueueSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-stretch border-b border-border last:border-b-0">
          <div className={cn(LEAD_COLUMN, 'py-3.5 space-y-1.5 border-r border-border')}>
            <div className="h-3.5 w-11 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-14 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex-1 px-4 py-3.5 space-y-1.5">
            <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

type QueueRowProps = {
  /** The big value on the left: a countdown, a time, how late. */
  lead: ReactNode
  /** What that value means, under it ("late", "to check-out"). */
  leadCaption?: ReactNode
  /** The status colour for `lead`. */
  leadTone?: string
  title: ReactNode
  /** The second line: who, where, how long. */
  subtitle?: ReactNode
  /** Top right, e.g. a status or amount in its colour. */
  aside?: ReactNode
  /** Under `aside`. */
  asideSub?: ReactNode
  /** Buttons under the text, e.g. "Guest checked out". */
  actions?: ReactNode
  /** Opens the item. */
  onClick: () => void
  /** What opening it means, read out by screen readers. */
  label: string
}

// The whole row opens the item through a button laid under the content, so
// `actions` (sitting above it) can be buttons of their own. Actions go under
// the text; on phones they take the row's full width.
export function QueueRow({ lead, leadCaption, leadTone, title, subtitle, aside, asideSub, actions, onClick, label }: QueueRowProps) {
  return (
    <div className="group relative grid grid-cols-[auto_minmax(0,1fr)] border-b border-border last:border-b-0 transition-colors hover:bg-muted/40 has-[>button:focus-visible]:bg-brand/[0.06]">
      <button type="button" onClick={onClick} aria-label={label} className="absolute inset-0 w-full outline-none" />
      <div className={cn(LEAD_COLUMN, 'pointer-events-none py-3 flex flex-col justify-center border-r border-border', actions && 'sm:row-span-2')}>
        <span className={cn('text-[14px] font-bold leading-tight tabular-nums truncate', leadTone || 'text-foreground')}>{lead}</span>
        {leadCaption && <span className="mt-0.5 text-[10.5px] font-medium leading-tight text-foreground line-clamp-2">{keepWords(leadCaption)}</span>}
      </div>
      <div className="pointer-events-none min-w-0 flex-1 pl-4 pr-3 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {/* Wraps, so a code beside a long name still shows on phones. */}
          <div className="text-[13px] font-semibold text-foreground flex flex-wrap items-center min-w-0 break-words">{title}</div>
          {/* Wraps rather than cutting names short on narrow screens. */}
          {subtitle && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 text-[11.5px] text-foreground [&>*]:max-w-full [&>*]:truncate">
              {subtitle}
            </div>
          )}
        </div>
        {(aside || asideSub) && (
          <div className="flex-shrink-0 text-right">
            {aside && <div className="text-[11.5px] font-semibold whitespace-nowrap">{aside}</div>}
            {/* The extra detail gives way to the names on phones. */}
            {asideSub && <div className="mt-1 text-[11px] text-foreground tabular-nums whitespace-nowrap max-sm:hidden">{asideSub}</div>}
          </div>
        )}
        <ChevronRight
          size={15}
          aria-hidden
          className="flex-shrink-0 text-foreground transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </div>
      {actions && (
        <div className="relative max-sm:col-span-2 -mt-1 pb-3 pl-4 pr-3 flex flex-wrap items-center gap-2 max-sm:[&>*]:flex-1 max-sm:[&>*]:justify-center">
          {actions}
        </div>
      )}
    </div>
  )
}

type RowActionProps = {
  icon?: LucideIcon
  children: ReactNode
  onClick: () => void
  /** Filled with the logo blue, for the main action. */
  primary?: boolean
  disabled?: boolean
  title?: string
}

/** A small button in a row's `actions`. */
export function RowAction({ icon: Icon, children, onClick, primary = false, disabled = false, title }: RowActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 md:h-7 px-2.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50',
        primary
          ? 'bg-brand-solid text-white hover:opacity-90'
          : 'border border-border bg-card text-foreground hover:border-brand/40 hover:bg-brand/[0.05]',
      )}
    >
      {Icon && <Icon size={13} aria-hidden className="flex-shrink-0" />}
      {children}
    </button>
  )
}
