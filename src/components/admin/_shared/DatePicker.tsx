// src/components/admin/_shared/DatePicker.tsx
// The one date picker for every CRM form and filter, styled after the
// booking calendar:
//   • Blue circle  the picked day, and the other end of a stay or range
//   • Blue tint    the days in between
//   • Red circle   a taken day (another booking, say)
//   • Blue dot     today
//   • Faded        a day that can't be picked
// It opens below its field and scrolls itself fully into view.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRevealOnOpen } from './useRevealOnOpen'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'

const SIZES = {
  sm: 'h-8 text-xs rounded-md',
  md: 'h-9 text-xs rounded-md',
  lg: 'h-10 text-sm rounded-lg',
}

function localTodayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoOf(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** "Oct 17, 2026" for a YYYY-MM-DD day, whatever the browser's time zone. */
export function formatPickedDate(iso: string) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

type DatePickerProps = {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  /** Earliest and latest days that can be picked (YYYY-MM-DD). */
  minDate?: string | null
  maxDate?: string | null
  /** Taken days: shown red and can't be picked. */
  blocked?: Set<string> | null
  blockedLabel?: string
  /** Any other rule for days that can't be picked. */
  isDisabled?: (iso: string) => boolean
  /** The other end of a range (a stay's check-in or check-out): marked blue, with the days between tinted. */
  rangeStart?: string | null
  rangeEnd?: string | null
  /** Legend name for the blue days, e.g. 'Check-in / out'. */
  pickedLabel?: string
  clearable?: boolean
  size?: keyof typeof SIZES
  align?: 'left' | 'right'
  disabled?: boolean
  id?: string
  ariaLabel?: string
  className?: string
}

export function DatePicker({
  value, onChange, placeholder = 'Pick a date',
  minDate, maxDate, blocked, blockedLabel = 'Taken', isDisabled,
  rangeStart, rangeEnd, pickedLabel, clearable = true,
  size = 'md', align = 'left', disabled = false, id, ariaLabel, className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  useRevealOnOpen(popRef, open)

  const today = localTodayISO()
  const anchor = value || rangeStart || rangeEnd || (minDate && today < minDate ? minDate : maxDate && today > maxDate ? maxDate : today)
  const [view, setView] = useState(() => ({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 }))

  // Opening shows the month of the picked day (or the range, or today).
  useEffect(() => {
    if (open) setView({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const cells = useMemo(() => {
    const out: (number | null)[] = []
    const first = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay()
    const days = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
    for (let i = 0; i < first; i++) out.push(null)
    for (let d = 1; d <= days; d++) out.push(d)
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [view])

  const lo = rangeStart || value || null
  const hi = rangeEnd || value || null
  const ends = new Set([rangeStart, rangeEnd].filter(Boolean))
  const hasBlocked = !!blocked && blocked.size > 0

  const canPick = (iso: string) => {
    if (minDate && iso < minDate) return false
    if (maxDate && iso > maxDate) return false
    if (blocked?.has(iso)) return false
    if (isDisabled?.(iso)) return false
    return true
  }

  const step = (by: number) => setView(({ year, month }) => {
    const m = month + by
    return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
  })

  const pick = (iso: string) => {
    if (!canPick(iso)) return
    onChange(iso)
    setOpen(false)
  }

  const display = value ? formatPickedDate(value) : ''

  return (
    <div className={cn('relative', className)} ref={wrapRef}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full border bg-background px-3 flex items-center justify-between gap-2 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          SIZES[size],
          open ? 'border-brand-solid ring-2 ring-brand-solid/25' : 'border-input hover:bg-muted/40',
        )}
      >
        <span className={cn('truncate tabular-nums', display ? 'text-foreground' : 'text-muted-foreground')}>{display || placeholder}</span>
        <Calendar size={size === 'lg' ? 14 : 13} className="text-foreground flex-shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel || placeholder}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute z-50 mt-2 w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-4 scroll-my-3',
              align === 'right' ? 'right-0' : 'left-0',
            )}
            style={{ boxShadow: SOFT_SHADOW }}
          >
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="p-1.5 rounded-full hover:bg-muted text-foreground transition-colors">
                <ChevronLeft size={15} />
              </button>
              <span className="text-sm font-bold text-foreground tabular-nums">{MONTHS[view.month]} {view.year}</span>
              <button type="button" onClick={() => step(1)} aria-label="Next month" className="p-1.5 rounded-full hover:bg-muted text-foreground transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1.5">
              {DOW.map((d) => (
                <div key={d} className="text-[10px] font-bold text-foreground text-center">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((day, i) => {
                if (day == null) return <div key={i} className="h-9" />
                const iso = isoOf(view.year, view.month, day)
                const picked = iso === value
                const end = !picked && ends.has(iso)
                const between = !!lo && !!hi && iso > lo && iso < hi
                const taken = !!blocked?.has(iso)
                const ok = canPick(iso)
                const isToday = iso === today
                return (
                  <div key={i} className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => pick(iso)}
                      disabled={!ok}
                      aria-pressed={picked}
                      aria-label={`${formatPickedDate(iso)}${taken ? ` · ${blockedLabel}` : ''}${isToday ? ' · today' : ''}`}
                      title={taken ? blockedLabel : undefined}
                      className={cn(
                        'relative h-9 w-9 rounded-full text-[12px] font-semibold tabular-nums transition-colors flex items-center justify-center',
                        picked || end
                          ? 'bg-brand-solid text-white shadow-sm'
                          : taken
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 cursor-not-allowed'
                            : between
                              ? 'bg-brand-solid/10 text-foreground hover:bg-brand-solid/20'
                              : ok
                                ? 'text-foreground hover:bg-muted'
                                : 'text-muted-foreground/40 cursor-not-allowed',
                        end && !ok && 'cursor-default',
                      )}
                    >
                      {day}
                      {isToday && (
                        <span aria-hidden className={cn('absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full', picked || end ? 'bg-white' : 'bg-brand-solid')} />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-foreground">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-brand-solid" />{pickedLabel || (rangeStart || rangeEnd ? 'Start / end' : 'Picked')}</span>
                {hasBlocked && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400" />{blockedLabel}</span>}
                <span className="inline-flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-brand-solid" />Today</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {canPick(today) && today !== value && (
                  <button type="button" onClick={() => pick(today)} className="text-[11px] font-semibold text-foreground hover:underline underline-offset-2">Today</button>
                )}
                {clearable && value && (
                  <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="text-[11px] font-semibold text-foreground hover:underline underline-offset-2">Clear</button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
