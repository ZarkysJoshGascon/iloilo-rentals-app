// src/components/admin/_shared/listTools.tsx
// Small helpers shared by the CRM lists: sortable column headers, the
// "Showing X of Y" line with removable filters, keyboard shortcuts (/ to
// search, Esc to close the detail panel), and the phone layout (rows as
// cards, a sort picker in place of the headers, full-screen detail panels)
// and the row cap that gives every list the same height.
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
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

// A list shows this many rows, then scrolls inside itself.
const LIST_ROWS = { phone: 4, desktop: 8 }
// How much of the next row stays visible, so the list reads as scrollable.
const ROW_PEEK = 28
// Screen height kept free for the page around a list (app header, bottom
// tabs on phones, and a band of page), so the page can always be scrolled
// past it.
const PAGE_ROOM = { phone: 236, desktop: 176 }

/**
 * Caps a list's scroll box at N rows plus a peek of the next one; shorter
 * lists just fit their rows. Rows are the elements marked `data-row`. Spread
 * the result onto the scrolling element (it brings its own style):
 * `<div {...listCap} className="overflow-y-auto">`
 */
export function useListCap(rows?: number) {
  const phone = useIsPhone()
  const n = rows ?? (phone ? LIST_ROWS.phone : LIST_ROWS.desktop)
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [cap, setCap] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!el) return
    let frame = 0
    let settle = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const items = el.querySelectorAll('[data-row]')
        if (items.length <= n) { setCap(null); return }
        // Distance from the top of the scrolled content to row N+1.
        const top = el.getBoundingClientRect().top - el.scrollTop
        setCap(Math.round(items[n].getBoundingClientRect().top - top + ROW_PEEK))
      })
    }
    // While a detail panel opens or closes the list resizes every frame;
    // measuring once it has settled keeps the page from re-rendering on each.
    const measureWhenSettled = () => {
      clearTimeout(settle)
      settle = window.setTimeout(measure, 140)
    }
    measure()
    const resize = new ResizeObserver(measureWhenSettled)
    resize.observe(el)
    const rowsChange = new MutationObserver(measure)
    rowsChange.observe(el, { childList: true, subtree: true })
    return () => { cancelAnimationFrame(frame); clearTimeout(settle); resize.disconnect(); rowsChange.disconnect() }
  }, [el, n])

  const room = `calc(100dvh - ${phone ? PAGE_ROOM.phone : PAGE_ROOM.desktop}px)`
  const style: CSSProperties = { scrollbarGutter: 'stable', maxHeight: cap == null ? room : `min(${cap}px, ${room})` }
  return { ref: setEl, 'data-table-scroll': '', style }
}

const PANEL_EASE = [0.4, 0, 0.2, 1] as const

/**
 * Motion props for a list's detail panel. On a desktop it opens beside the
 * list at `width`; on a phone it slides up and covers the screen (above the
 * bottom tabs, below dialogs). On a desktop it only fades and settles from
 * a hair smaller: opacity and transform are drawn by the GPU, so nothing is
 * laid out again while it moves. The list makes room once, as it opens, and
 * takes the room back once, after it has faded out. (Animating the width
 * made the browser lay the whole list out on every frame, which is what
 * dropped frames.)
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
    initial: { opacity: 0, scale: 0.985 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.985, transition: { duration: 0.14, ease: PANEL_EASE } },
    transition: { duration: 0.2, ease: PANEL_EASE },
    className: 'h-full flex-shrink-0 p-3',
    // width + p-3 either side; shrinks (never grows) from its right edge, so it can't poke past the page.
    style: { width: width + 24, maxWidth: '100%', transformOrigin: 'right center', willChange: 'transform, opacity' } as CSSProperties,
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
