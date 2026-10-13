// src/components/admin/_shared/PageScrollHelper.tsx
// Up/down buttons that scroll the page itself (not the list) when a list
// fills most of the screen. A swipe or wheel over a list scrolls the list
// first, so without these the page can feel stuck behind it.
//
// Pages mark their scrolling element with `data-page-scroll`; lists get
// `data-table-scroll` from useListCap.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// The list must cover at least this share of the page's visible height.
const DOMINANT = 0.5

type PageScrollHelperProps = {
  rootRef: RefObject<HTMLElement | null>
  bottom: string
}

export function PageScrollHelper({ rootRef, bottom }: PageScrollHelperProps) {
  const [state, setState] = useState({ show: false, up: false, down: false })
  const pageRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const page = [...root.querySelectorAll<HTMLElement>('[data-page-scroll]')].find((el) => el.clientHeight > 0)
        pageRef.current = page || null
        let next = { show: false, up: false, down: false }
        if (page) {
          const box = page.getBoundingClientRect()
          const up = page.scrollTop > 4
          const down = page.scrollTop + page.clientHeight < page.scrollHeight - 4
          let dominant = false
          for (const list of page.querySelectorAll<HTMLElement>('[data-table-scroll]')) {
            if (list.scrollHeight <= list.clientHeight + 1) continue
            const r = list.getBoundingClientRect()
            const visible = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)
            if (visible > box.height * DOMINANT) { dominant = true; break }
          }
          next = { show: dominant && (up || down), up, down }
        }
        setState((s) => (s.show === next.show && s.up === next.up && s.down === next.down ? s : next))
      })
    }
    update()
    root.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    const changes = new MutationObserver(update)
    changes.observe(root, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      changes.disconnect()
    }
  }, [rootRef])

  const scrollPage = (dir: 1 | -1) => {
    const page = pageRef.current
    if (page) page.scrollBy({ top: dir * Math.round(page.clientHeight * 0.75), behavior: 'smooth' })
  }

  const button = (enabled: boolean) => cn(
    'w-10 h-10 inline-flex items-center justify-center text-foreground transition-colors',
    enabled ? 'hover:bg-muted' : 'opacity-30 cursor-default',
  )

  return (
    <AnimatePresence>
      {state.show && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed right-3 z-30 flex flex-col rounded-md border border-border bg-card shadow-lg overflow-hidden divide-y divide-border"
          style={{ bottom }}
          role="group"
          aria-label="Scroll the page"
        >
          <button type="button" onClick={() => scrollPage(-1)} disabled={!state.up} className={button(state.up)} aria-label="Scroll the page up" title="Scroll the page up">
            <ChevronUp size={16} />
          </button>
          <button type="button" onClick={() => scrollPage(1)} disabled={!state.down} className={button(state.down)} aria-label="Scroll the page down" title="Scroll the page down">
            <ChevronDown size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
