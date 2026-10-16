// src/components/common/TouchScrollIndicator.tsx
// Phones and tablets draw their own scroll indicator, grey, and no website
// can colour or shape it. So on touch screens scrollbar.css hides it and this
// draws the app's own instead: the same thin logo-blue bar with square ends
// as on computers, beside whatever is being scrolled (the page, a list, a
// sideways table), fading out shortly after the scrolling stops.
// Mounted once, in App. Strips that hide their scrollbar on purpose opt out
// with data-no-scroll-indicator.
import { useEffect, useRef } from 'react'

const TOUCH = '(pointer: coarse)'
const THICKNESS = 4   // px, as the computer scrollbar's bar
const INSET = 2       // px from the edge of the scrolling area
const MIN_LENGTH = 28 // px, so a very long page still has a bar to see
const HIDE_AFTER = 900

type Last = { top: number; left: number }

export function TouchScrollIndicator() {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const media = window.matchMedia(TOUCH)
    const last = new WeakMap<Element, Last>()
    let frame = 0
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    let pending: Element | null = null

    const draw = () => {
      frame = 0
      const el = pending
      const bar = barRef.current
      if (!el || !bar) return

      const isPage = el === document.scrollingElement
      const box = isPage
        ? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight }
        : el.getBoundingClientRect()
      // Only the part of the area that's on screen.
      const top = Math.max(box.top, 0)
      const bottom = Math.min(box.bottom, window.innerHeight)
      const left = Math.max(box.left, 0)
      const right = Math.min(box.right, window.innerWidth)

      // Which way it moved since last time; the first time, whichever way it can scroll.
      const prev = last.get(el)
      const movedSideways = prev
        ? Math.abs(el.scrollLeft - prev.left) > Math.abs(el.scrollTop - prev.top)
        : el.scrollWidth > el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1
      last.set(el, { top: el.scrollTop, left: el.scrollLeft })

      const vertical = !movedSideways && el.scrollHeight > el.clientHeight + 1
      const horizontal = movedSideways && el.scrollWidth > el.clientWidth + 1
      if (!vertical && !horizontal) return

      if (vertical) {
        const track = bottom - top - INSET * 2
        if (track <= MIN_LENGTH) return
        const length = Math.max(MIN_LENGTH, track * (el.clientHeight / el.scrollHeight))
        const progress = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)
        bar.style.width = `${THICKNESS}px`
        bar.style.height = `${length}px`
        bar.style.transform = `translate(${right - INSET - THICKNESS}px, ${top + INSET + (track - length) * Math.min(1, Math.max(0, progress))}px)`
      } else {
        const track = right - left - INSET * 2
        if (track <= MIN_LENGTH) return
        const length = Math.max(MIN_LENGTH, track * (el.clientWidth / el.scrollWidth))
        const progress = el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth)
        bar.style.width = `${length}px`
        bar.style.height = `${THICKNESS}px`
        bar.style.transform = `translate(${left + INSET + (track - length) * Math.min(1, Math.max(0, progress))}px, ${bottom - INSET - THICKNESS}px)`
      }
      bar.style.opacity = '1'
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => { if (barRef.current) barRef.current.style.opacity = '0' }, HIDE_AFTER)
    }

    const onScroll = (e: Event) => {
      if (!media.matches) return
      const target = e.target === document ? document.scrollingElement : e.target
      if (!(target instanceof Element)) return
      // Strips that hide their scrollbar on purpose (tabs, stage arrows, charts).
      if (target.closest('[data-no-scroll-indicator]')) return
      pending = target
      if (!frame) frame = requestAnimationFrame(draw)
    }

    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      cancelAnimationFrame(frame)
      clearTimeout(hideTimer)
    }
  }, [])

  return (
    <div
      ref={barRef}
      aria-hidden
      className="fixed left-0 top-0 z-[2147483000] pointer-events-none bg-brand opacity-0 transition-opacity duration-300"
      style={{ width: 0, height: 0 }}
    />
  )
}
