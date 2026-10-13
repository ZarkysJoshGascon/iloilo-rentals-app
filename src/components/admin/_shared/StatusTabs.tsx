// src/components/admin/_shared/StatusTabs.tsx
// The one status switch for every CRM page: a white track with the selected
// option in the logo blue (it slides between options), optional counts and
// icons, and arrow-key support. Also the prev/next stepper used for years
// and months.
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type StatusTabsProps = {
  tabs: any
  value: any
  onChange: any
  counts?: any
  label: string
  fill?: boolean
  className?: string
}

/**
 * tabs    [{ id, label, icon? }]
 * value   the selected id
 * counts  optional { [id]: number } shown after each label
 * label   accessible name for the group, e.g. "Filter by status"
 * fill    stretch the options across the full width (side panels, forms)
 */
export function StatusTabs({ tabs, value, onChange, counts, label, fill = false, className }: StatusTabsProps) {
  const trackRef = useRef(null)
  const [indicator, setIndicator] = useState(null)

  // Offsets rather than bounding boxes, so a page that scales in on load
  // doesn't leave the indicator misplaced.
  useEffect(() => {
    const node = trackRef.current
    if (!node) return
    const measure = () => {
      const el = node.querySelector('[aria-pressed="true"]')
      setIndicator(el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(node)
    return () => ro?.disconnect()
  }, [value, counts, tabs])

  const onKeyDown = (e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const i = Math.max(0, tabs.findIndex((t) => t.id === value))
    const next =
      e.key === 'Home' ? 0
        : e.key === 'End' ? tabs.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    onChange(tabs[next].id)
    trackRef.current?.querySelectorAll('button')[next]?.focus()
  }

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'relative items-center gap-0.5 p-0.5 rounded-md bg-card border border-border max-w-full overflow-x-auto [scrollbar-width:none]',
        fill ? 'flex w-full' : 'inline-flex',
        className,
      )}
    >
      {indicator && (
        <motion.span
          aria-hidden
          className="absolute z-0 rounded-md bg-brand-solid"
          initial={false}
          animate={indicator}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
      {tabs.map((tab) => {
        const active = tab.id === value
        const count = counts ? counts[tab.id] ?? 0 : null
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative z-10 inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              fill && 'flex-1',
              active ? 'text-white' : 'text-foreground hover:bg-muted/60',
            )}
          >
            {Icon && <Icon size={13} strokeWidth={2} className="flex-shrink-0" />}
            {tab.label}
            {count != null && <span className="tabular-nums font-semibold">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

type PeriodStepperProps = {
  label: any
  onPrev: ((...args: any[]) => any)
  onNext: ((...args: any[]) => any)
  canPrev?: boolean
  canNext?: boolean
  prevLabel?: string
  nextLabel?: string
  minWidth?: number
}

/** "‹ 2026 ›" — steps through years or months. */
export function PeriodStepper({ label, onPrev, onNext, canPrev = true, canNext = true, prevLabel = 'Previous', nextLabel = 'Next', minWidth = 44 }: PeriodStepperProps) {
  const btn = 'h-full px-2 text-foreground transition-colors hover:bg-muted/60 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed'
  return (
    <div className="inline-flex items-center h-8 rounded-md border border-border bg-card overflow-hidden">
      <button type="button" onClick={onPrev} disabled={!canPrev} aria-label={prevLabel} className={btn}>
        <ChevronLeft size={15} />
      </button>
      <span className="text-[12px] font-semibold tabular-nums text-foreground px-1 text-center" style={{ minWidth }}>
        {label}
      </span>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label={nextLabel} className={btn}>
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
