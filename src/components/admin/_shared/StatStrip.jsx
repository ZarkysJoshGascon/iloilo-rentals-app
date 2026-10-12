// src/components/admin/_shared/StatStrip.jsx
// KPI strip shared by the admin pages: one bordered card split by hairlines
// (the gap-px lets the border colour show through) instead of separate cards.
import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const COLS = {
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-3 xl:grid-cols-6',
}

export function StatStrip({ cols = 5, children, className }) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-border shadow-sm overflow-hidden grid grid-cols-2 gap-px',
        COLS[cols],
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * icon      lucide icon (black)
 * attention shows a warning icon and turns `sub` into amber status text
 * active    marks the tile whose filter is applied (dark bar along the bottom)
 * valueClassName  overrides the number size (e.g. smaller for long peso amounts)
 * trend     optional small chart (e.g. a Sparkline) shown between the number and `sub`
 */
export function StatTile({
  icon: Icon, label, value, sub, attention = false, loading = false, active = false, onClick, className, valueClassName, trend,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        'group relative isolate bg-card px-4 py-3.5 text-left flex flex-col min-h-[104px] w-full min-w-0',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {/* Tint as a layer over the opaque card: a translucent background would let
          the strip's hairline colour show through the whole tile. */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 -z-10 pointer-events-none transition-colors',
          !active && onClick && 'group-hover:bg-muted/60',
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0 text-[12px] font-medium text-foreground">
          <Icon size={15} strokeWidth={1.9} className="text-foreground flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {attention ? (
          <AlertTriangle size={15} strokeWidth={2} className="text-foreground flex-shrink-0" aria-label="Needs action" />
        ) : (
          onClick && (
            <ArrowUpRight size={15} className="flex-shrink-0 text-foreground/0 group-hover:text-foreground transition-colors" />
          )
        )}
      </div>
      <div className="mt-auto pt-3">
        {loading ? (
          <span className="block h-7 w-14 rounded-md bg-muted animate-pulse" />
        ) : (
          <p className={cn('text-[28px] font-semibold text-foreground leading-none tracking-tight tabular-nums', valueClassName)}>{value}</p>
        )}
        {trend && <div className="mt-2.5">{loading ? <span className="block h-7 rounded-md bg-muted animate-pulse" /> : trend}</div>}
        {sub && (
          <p className={cn('text-[11px] mt-1.5 truncate', attention ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-foreground')}>
            {loading ? ' ' : sub}
          </p>
        )}
      </div>
      {active && <span aria-hidden className="absolute left-0 right-0 bottom-0 h-[3px] bg-brand-solid" />}
    </button>
  )
}
