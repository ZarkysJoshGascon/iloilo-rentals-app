// src/components/crm/FloatingPanel.tsx
// The one way a dropdown opens in the CRM: a list of people, a filter, a
// search's suggestions. It floats above the page (like the date picker), so
// a form's scroll box, a card or a dialog can't cut it off. It opens below its
// field, or above when there's more room there; it's never taller than the
// part of the screen that's showing (on a phone, the part above the keyboard),
// and what doesn't fit scrolls inside it. It follows its field as the page
// scrolls, and closes on a click outside it or on Esc.
//
//   const fieldRef = useRef(null)
//   <button ref={fieldRef} onClick={() => setOpen(!open)}>…</button>
//   <FloatingPanel open={open} anchorRef={fieldRef} onClose={() => setOpen(false)} maxHeight={360}>…</FloatingPanel>
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export const GAP = 6 // between the field and the panel
export const EDGE = 8 // kept clear of the screen's edges
const MIN_HEIGHT = 120 // shorter than this a list is no use; it may run off the screen instead

type Box = { top: number; bottom: number; left: number; right: number; width: number }
/** The part of the window that's showing, in the page's fixed coordinates. */
export type Visible = { top: number; bottom: number; width: number; layoutHeight: number }
export type Placement = { above: boolean; left: number; width: number; maxHeight: number; top?: number; bottom?: number }

/**
 * Where a panel goes for a field at `anchor`. `natural` is the panel's own
 * height when it's known to be shorter than `maxHeight`.
 */
export function placePanel(
  anchor: Box,
  visible: Visible,
  { width, align = 'left', maxHeight, natural }: { width: number | 'anchor'; align?: 'left' | 'right'; maxHeight: number; natural?: number },
): Placement {
  const w = Math.max(0, Math.min(width === 'anchor' ? anchor.width : width, visible.width - EDGE * 2))
  const wantedLeft = align === 'right' ? anchor.right - w : anchor.left
  const left = Math.max(EDGE, Math.min(wantedLeft, visible.width - w - EDGE))

  const roomBelow = visible.bottom - anchor.bottom - GAP - EDGE
  const roomAbove = anchor.top - visible.top - GAP - EDGE
  const wanted = Math.min(maxHeight, natural ?? maxHeight)
  const above = roomBelow < wanted && roomAbove > roomBelow
  const room = above ? roomAbove : roomBelow
  const height = Math.max(Math.min(maxHeight, room), Math.min(MIN_HEIGHT, maxHeight))

  return above
    ? { above, left, width: w, maxHeight: height, bottom: visible.layoutHeight - anchor.top + GAP }
    : { above, left, width: w, maxHeight: height, top: anchor.bottom + GAP }
}

function visibleArea(): Visible {
  const vv = window.visualViewport
  return {
    top: vv ? vv.offsetTop : 0,
    bottom: vv ? vv.offsetTop + vv.height : window.innerHeight,
    width: document.documentElement.clientWidth || window.innerWidth,
    layoutHeight: window.innerHeight,
  }
}

// Date pickers, select menus and other dropdowns also float outside the app's
// root. A click in one of them (one opened from inside this panel, say) isn't
// a click outside this panel.
function inAnotherFloatingLayer(target: Node) {
  const root = document.getElementById('root')
  if (!root || !target.isConnected || root.contains(target)) return false
  // The page itself isn't one: with nothing focused, a key goes to the body.
  return target !== document.body && target !== document.documentElement
}

/** Whether a field should take the keyboard as soon as its dropdown opens: on a computer, not on a phone, where the keyboard would cover the list. */
export function typesStraightAway() {
  return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(pointer: fine)').matches
}

type FloatingPanelProps = {
  open: boolean
  /** What it opens from: it's placed against this, and a click on it isn't a click outside. */
  anchorRef: RefObject<HTMLElement | null>
  /** On a click outside the panel and its field, and on Esc. */
  onClose?: () => void
  /** 'anchor' (the default) is the field's width; a number is a fixed width. */
  width?: number | 'anchor'
  /** Which edge lines up with the field's when the widths differ. */
  align?: 'left' | 'right'
  /** The tallest it gets; less when the screen has less room. */
  maxHeight?: number
  /**
   * The panel scrolls as a whole (the default), or, for a header over a
   * list, it stays put and a child with `min-h-0 overflow-y-auto` scrolls.
   */
  scrollsInside?: boolean
  className?: string
  style?: CSSProperties
  role?: string
  'aria-label'?: string
  id?: string
  children: ReactNode
}

export function FloatingPanel({
  open, anchorRef, onClose, width = 'anchor', align = 'left', maxHeight = 360, scrollsInside = false,
  className, style, children, ...attrs
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<Placement | null>(null)
  const last = useRef<Placement | null>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  const reposition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const panel = panelRef.current
    // Shorter than the room it was given: that's its own height.
    const natural = panel && last.current && panel.offsetHeight < last.current.maxHeight - 1 ? panel.offsetHeight : undefined
    const next = placePanel(anchor.getBoundingClientRect(), visibleArea(), { width, align, maxHeight, natural })
    const prev = last.current
    if (prev && prev.above === next.above && prev.left === next.left && prev.width === next.width
      && prev.maxHeight === next.maxHeight && prev.top === next.top && prev.bottom === next.bottom) return
    last.current = next
    setPlace(next)
  }, [anchorRef, width, align, maxHeight])

  // Placed before the browser paints, so it never shows at an old spot; once
  // drawn, its height is known and it's placed again.
  useLayoutEffect(() => {
    if (!open) { last.current = null; return }
    reposition()
    const frame = requestAnimationFrame(reposition)
    return () => cancelAnimationFrame(frame)
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    // Anything that moves the field or changes the room: scrolling (except the
    // panel's own list), a resize, a phone's keyboard opening, the content changing.
    const onScroll = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) reposition() }
    const vv = window.visualViewport
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', reposition)
    vv?.addEventListener('resize', reposition)
    vv?.addEventListener('scroll', reposition)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reposition) : null
    if (panelRef.current) observer?.observe(panelRef.current)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', reposition)
      vv?.removeEventListener('resize', reposition)
      vv?.removeEventListener('scroll', reposition)
      observer?.disconnect()
    }
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const outside = (target: Node) =>
      !panelRef.current?.contains(target) && !anchorRef.current?.contains(target) && !inAnotherFloatingLayer(target)
    const onDown = (e: MouseEvent) => { if (outside(e.target as Node)) closeRef.current?.() }
    // Esc closes the dropdown, not the dialog it's in; one opened from it (a
    // date picker, a select menu) closes first.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !closeRef.current) return
      if (e.target instanceof Node && inAnotherFloatingLayer(e.target) && !panelRef.current?.contains(e.target)) return
      e.stopPropagation()
      closeRef.current()
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchorRef])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          {...attrs}
          data-floating-popup=""
          initial={{ opacity: 0, y: place?.above ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: place?.above ? 4 : -4 }}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          // Above the CRM's dialogs (z 10000–10002); date pickers (10050) and
          // select menus opened from it go above it.
          className={cn(
            'fixed z-[10040] overscroll-contain',
            scrollsInside ? 'flex flex-col overflow-hidden' : 'overflow-y-auto',
            className,
          )}
          style={{
            ...style,
            left: place?.left ?? 0,
            width: place?.width,
            maxHeight: place?.maxHeight,
            top: place?.top ?? 'auto',
            bottom: place?.bottom ?? 'auto',
            visibility: place ? 'visible' : 'hidden',
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
