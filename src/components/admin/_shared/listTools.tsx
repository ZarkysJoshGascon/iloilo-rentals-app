// src/components/admin/_shared/listTools.tsx
// Small helpers shared by the CRM lists: sortable column headers, the
// "Showing X of Y" line with removable filters, keyboard shortcuts (/ to
// search, Esc to close the detail panel), and the phone layout (rows as
// cards, a sort picker in place of the headers, full-screen detail panels).
import { useEffect } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsPhone } from '@/hooks/useIsPhone'

/**
 * Add to a list row's grid so it reads as a card on phones: the first cell
 * runs the full width (leaving room on the right), the last cell (the status)
 * is pinned top-right, and the cells between sit two to a line.
 */
export const CARD_ON_PHONE =
  'max-md:relative max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2.5 max-md:items-start ' +
  'max-md:[&>:first-child]:col-span-2 max-md:[&>:first-child]:pr-32 ' +
  'max-md:[&>:last-child]:absolute max-md:[&>:last-child]:top-3 max-md:[&>:last-child]:right-4 ' +
  'max-md:[&>:last-child]:max-w-[7.5rem] max-md:[&>:last-child]:text-right'

/** A cell's column name, shown only on phones where the headers are hidden. */
export const PHONE_LABEL = 'md:hidden block text-[10px] font-semibold uppercase tracking-wider text-foreground/75'

type MobileSortProps = {
  options: { key: string; label: string }[]
  sort: any
  onSort: (key: string) => void
  className?: string
}

/** Phones hide the column headers; this keeps sorting within reach. */
export function MobileSort({ options, sort, onSort, className }: MobileSortProps) {
  const known = options.some((o) => o.key === sort.key)
  const asc = sort.dir === 'asc'
  const Icon = asc ? ArrowUp : ArrowDown
  return (
    <div className={cn('md:hidden flex items-center gap-2 px-4 py-2 border-b border-border bg-card', className)}>
      <span className="text-[11px] font-semibold text-foreground flex-shrink-0">Sort by</span>
      <select
        value={sort.key}
        onChange={(e) => onSort(e.target.value)}
        aria-label="Sort by"
        className="h-8 flex-1 min-w-0 rounded-md border border-border bg-card px-2 text-[12px] font-medium text-foreground"
      >
        {!known && <option value={sort.key}>Default order</option>}
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onSort(sort.key)}
        aria-label={asc ? 'Ascending, tap for descending' : 'Descending, tap for ascending'}
        className="h-8 w-8 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card text-foreground"
      >
        <Icon size={14} />
      </button>
    </div>
  )
}

const PANEL_EASE = [0.4, 0, 0.2, 1] as const

/**
 * Motion props for a list's detail panel. On a desktop it opens beside the
 * list at `width`; on a phone it slides up and covers the screen (above the
 * bottom tabs, below dialogs).
 */
export function useSidePanelMotion(width: number) {
  const phone = useIsPhone()
  if (phone) {
    return {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%' },
      transition: { duration: 0.28, ease: PANEL_EASE },
      className: 'fixed inset-0 z-[45] p-2 bg-background',
      style: {
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
      },
    }
  }
  return {
    initial: { width: 0, opacity: 0 },
    animate: { width, opacity: 1 },
    exit: { width: 0, opacity: 0 },
    transition: { width: { duration: 0.32, ease: PANEL_EASE }, opacity: { duration: 0.2, ease: 'easeOut' as const } },
    className: 'h-full flex-shrink-0 p-3',
    style: { maxWidth: '100%', width: width + 24 },
  }
}

type SortHeaderProps = {
  label: string
  sortKey: string
  sort: any
  onSort: ((...args: any[]) => any)
  align?: string
  className?: string
}

/** Column header that sorts the list. `sort` is { key, dir: 'asc' | 'desc' }. */
export function SortHeader({ label, sortKey, sort, onSort, align = 'left', className }: SortHeaderProps) {
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

type ResultsBarProps = {
  shown: any
  total: any
  noun: string
  chips?: any
  onClearAll: () => void
  hint: string
}

/**
 * "Showing 6 of 18 bookings · Upcoming × · "maria" ×  Clear all"
 * chips: [{ key, label, onRemove }]
 */
export function ResultsBar({ shown, total, noun, chips = [], onClearAll, hint }: ResultsBarProps) {
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
