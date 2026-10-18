// src/components/crm/useRevealOnOpen.ts
// A dropdown that opens below its field can end up past the bottom of the
// screen or of a form's scroll box. Once it opens, scroll just enough (in
// every scrolling box around it) that the whole dropdown is in view.
import { useEffect, type RefObject } from 'react'

function reveal(el: HTMLElement | null) {
  if (!el || !el.isConnected) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
}

// Two frames: the dropdown is mounted and laid out (its open animation only
// moves it a few pixels, so its box is already right).
function afterLayout(run: () => void) {
  let second = 0
  const first = requestAnimationFrame(() => { second = requestAnimationFrame(run) })
  return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
}

export function useRevealOnOpen(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return
    return afterLayout(() => reveal(ref.current))
  }, [ref, open])
}

/** The same as a ref: `ref={revealOnMount}` on a dropdown that mounts when it opens. */
export function revealOnMount(el: HTMLElement | null) {
  if (el) afterLayout(() => reveal(el))
}
