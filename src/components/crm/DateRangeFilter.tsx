// src/components/crm/DateRangeFilter.tsx
// "Filter by date" button with a from/to popover, shared by the Leads pages.
// The button turns logo blue while a range is applied.
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatePicker } from './DatePicker'
import { revealOnMount } from './useRevealOnOpen'

function fmtDateShort(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}

const LABEL = 'text-[11px] font-semibold text-foreground mb-1 block'

type DateRangeFilterProps = {
  from: string
  to: string
  onFromChange: (...args: any[]) => any
  onToChange: (...args: any[]) => any
  onClear: () => void
  title?: string
}

export function DateRangeFilter({ from, to, onFromChange, onToChange, onClear, title = 'Date range' }: DateRangeFilterProps) {
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
  const invalid = !!localFrom && !!localTo && localTo < localFrom

  const apply = () => {
    if (invalid) return
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
    <div className="relative flex-shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 h-9 px-3 rounded-md text-xs font-semibold transition-colors border',
          hasAny
            ? 'bg-brand-solid text-white border-brand-solid'
            : 'bg-card text-foreground border-border hover:bg-muted/50',
        )}
        title={hasAny ? summary : title}
        aria-expanded={open}
      >
        <Calendar size={13} />
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
            ref={revealOnMount} className="absolute right-0 z-30 mt-1 w-[280px] max-w-[calc(100vw-2rem)] rounded-md bg-popover border border-border shadow-xl p-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground mb-2">{title}</p>
            <div className="space-y-2">
              <div>
                <label className={LABEL}>From</label>
                <DatePicker value={localFrom} onChange={setLocalFrom} maxDate={localTo || null} rangeEnd={localTo || null} placeholder="Any day" size="sm" align="right" ariaLabel="From" />
              </div>
              <div>
                <label className={LABEL}>To</label>
                <DatePicker value={localTo} onChange={setLocalTo} minDate={localFrom || null} rangeStart={localFrom || null} placeholder="Any day" size="sm" align="right" ariaLabel="To" />
              </div>
            </div>
            {invalid && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">
                End date must be on or after start date.
              </p>
            )}
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
              <button
                type="button"
                onClick={clear}
                disabled={!localFrom && !localTo}
                className="text-[11px] font-semibold text-foreground hover:underline underline-offset-2 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={invalid}
                className="inline-flex items-center gap-1 h-7 px-3 rounded-md bg-brand-solid text-white text-[11px] font-semibold hover:bg-brand-solid/90 disabled:opacity-40"
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
