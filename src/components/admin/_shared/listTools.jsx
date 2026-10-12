// src/components/admin/_shared/listTools.jsx
// Small helpers shared by the Bookings and Housekeeping lists: sortable column
// headers, the "Showing X of Y" line with removable filters, and keyboard
// shortcuts (/ to search, Esc to close the detail panel).
import { useEffect } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Column header that sorts the list. `sort` is { key, dir: 'asc' | 'desc' }. */
export function SortHeader({ label, sortKey, sort, onSort, align = 'left', className }) {
  const active = sort.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label.toLowerCase()}`}
      className={cn(
        'group inline-flex items-center gap-1 min-w-0 text-[11px] font-semibold text-foreground hover:underline underline-offset-2',
        align === 'right' && 'justify-end ml-auto',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <Icon size={12} className={cn('flex-shrink-0 text-foreground', !active && 'opacity-40 group-hover:opacity-100')} />
    </button>
  )
}

/**
 * Next sort state after clicking a column. A new column starts in its
 * natural direction (`defaults[key]`, else ascending); clicking the same
 * column again flips it.
 */
export function nextSort(sort, key, defaults = {}) {
  if (sort.key === key) return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: defaults[key] || 'asc' }
}

/**
 * "Showing 6 of 18 bookings · Upcoming × · "maria" ×  Clear all"
 * chips: [{ key, label, onRemove }]
 */
export function ResultsBar({ shown, total, noun, chips = [], onClearAll, hint }) {
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-0.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-foreground">
        <span>
          Showing <span className="font-semibold text-foreground tabular-nums">{shown}</span>
          {shown !== total && <> of <span className="tabular-nums">{total}</span></>} {noun}
        </span>
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md border border-border bg-card text-[11px] font-medium text-foreground"
          >
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={`Remove filter: ${chip.label}`}
              className="p-0.5 rounded hover:bg-muted"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {chips.length > 1 && (
          <button type="button" onClick={onClearAll} className="text-[11px] font-semibold text-foreground underline underline-offset-2 hover:text-foreground/70">
            Clear all
          </button>
        )}
      </div>
      {hint && <span className="hidden lg:inline text-[11px] text-foreground">{hint}</span>}
    </div>
  )
}

/** The little "/" key shown inside a search box. */
export function SearchKeyHint() {
  return (
    <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded border border-border bg-card text-[10px] font-semibold text-foreground">
      /
    </kbd>
  )
}

/**
 * "/" focuses the search box; Esc runs onEscape (e.g. close the detail panel).
 * Ignored while typing in a field (except Esc) or while a dialog is open.
 */
export function useListShortcuts({ searchRef, onEscape }) {
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector('[role="dialog"]')) return
      const el = e.target
      const typing = el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && onEscape) {
        if (typing) el.blur()
        onEscape()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchRef, onEscape])
}
