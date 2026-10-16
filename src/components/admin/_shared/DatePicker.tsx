// src/components/admin/_shared/DatePicker.tsx
// The one date picker for every CRM form and filter, styled after the
// booking calendar:
//   • Blue circle  the picked day, and the other end of a stay or range
//   • Blue tint    the days in between
//   • Red circle   a taken day (another booking, say)
//   • Blue dot     today
//   • Faded        a day that can't be picked
// The calendar floats above the page, so a card or side panel can't cut it
// off; it opens below its field, or above when there's more room there, and
// stays in the window. Picking a day keeps it open with the pick shown; it
// closes on a click outside (another field, say), Esc, or Done.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const SOFT_SHADOW = '0 20px 40px -16px rgba(15,23,42,0.24), 0 6px 16px -6px rgba(15,23,42,0.10)'
const POP_WIDTH = 300
const GAP = 8
const EDGE = 12 // keep this far from the window's edges

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
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)

  const today = localTodayISO()
  const anchor = value || rangeStart || rangeEnd || (minDate && today < minDate ? minDate : maxDate && today > maxDate ? maxDate : today)
  const [view, setView] = useState(() => ({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 }))

  // Opening shows the month of the picked day (or the range, or today).
  useEffect(() => {
    if (open) setView({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 })
  }, [open])

  // Where the calendar goes: under the field, or above it when there's more
  // room there, always inside the window. Follows the field as things scroll.
  const place = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const width = Math.min(POP_WIDTH, window.innerWidth - EDGE * 2)
    const height = popRef.current?.offsetHeight || 400
    const left = Math.max(EDGE, Math.min(align === 'right' ? r.right - width : r.left, window.innerWidth - width - EDGE))
    const below = window.innerHeight - r.bottom - GAP - EDGE
    const above = r.top - GAP - EDGE
    const goAbove = below < height && above > below
    const top = goAbove
      ? Math.max(EDGE, r.top - GAP - height)
      : Math.max(EDGE, Math.min(r.bottom + GAP, window.innerHeight - height - EDGE))
    setPos((p) => (p && p.top === top && p.left === left && p.above === goAbove ? p : { top, left, above: goAbove }))
  }, [align])

  // Placed before the browser paints, so it never shows at an old spot; the
  // last spot is kept while it fades out after closing.
  useLayoutEffect(() => {
    if (!open) return
    place()
    // Once it's drawn its real height is known; place it again with that.
    const frame = requestAnimationFrame(place)
    return () => cancelAnimationFrame(frame)
  }, [open, view, place])

  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
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

  // Stays open, so the pick shows; a click outside or Done closes it.
  const pick = (iso: string) => {
    if (!canPick(iso)) return
    onChange(iso)
  }

  const display = value ? formatPickedDate(value) : ''

  return (
    <div className={cn('relative', className)} ref={wrapRef}>
      <button
        ref={btnRef}
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

      {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            role="dialog"
            aria-label={ariaLabel || placeholder}
            initial={{ opacity: 0, y: pos?.above ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: pos?.above ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            // It lives outside whatever opened it (a filter popover, say), so
            // keep its clicks from reaching their "clicked outside, close" checks.
            onMouseDown={(e) => e.nativeEvent.stopPropagation()}
            data-floating-popup=""
            // Above the CRM's dialogs (z 10000) and side panels.
            className="fixed z-[10050] rounded-2xl border border-border bg-popover p-4"
            style={{
              boxShadow: SOFT_SHADOW,
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: `min(${POP_WIDTH}px, calc(100vw - ${EDGE * 2}px))`,
              visibility: pos ? 'visible' : 'hidden',
            }}
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
                  <button type="button" onClick={() => onChange('')} className="text-[11px] font-semibold text-foreground hover:underline underline-offset-2">Clear</button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-7 px-3 rounded-md bg-brand-solid text-white text-[11px] font-semibold hover:bg-brand-solid/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  )
}
