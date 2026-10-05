import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Palette, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const MAX_STACK = 3
const AUTO_DISMISS_MS = 8000

function makeId() {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function InquiryNotifications({ onNavigateTab }) {
  const [items, setItems] = useState([])
  const timersRef = useRef(new Map())

  const dismiss = (id) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setItems((prev) => prev.filter((n) => n.id !== id))
  }

  const push = (notification) => {
    const id = makeId()
    const item = { id, ...notification }
    setItems((prev) => [...prev, item].slice(-MAX_STACK))

    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    timersRef.current.set(id, timer)
  }

  useEffect(() => {
    const ch = supabase
      .channel(`inquiry-notifications-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'property_inquiries' },
        (payload) => {
          const row = payload?.new || {}
          push({
            kind: 'property',
            tab: 'inquiries',
            title: 'New property inquiry',
            name: row.owner_name || 'Unknown',
            detail: row.building || row.location || row.property_type || 'No details',
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interior_design_inquiries' },
        (payload) => {
          const row = payload?.new || {}
          push({
            kind: 'interior',
            tab: 'interior',
            title: 'New design inquiry',
            name: row.client_name || 'Unknown',
            detail: row.property_address || row.property_type || 'No details',
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [])

  const handleClick = (item) => {
    dismiss(item.id)
    if (typeof onNavigateTab === 'function' && item.tab) {
      onNavigateTab(item.tab)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[2147483647] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="pointer-events-auto"
          >
            <button
              type="button"
              onClick={() => handleClick(item)}
              className={cn(
                'group flex items-center gap-3 pl-3 pr-2 py-2 rounded-full',
                'bg-card/98 backdrop-blur-md border border-border shadow-2xl',
                'hover:bg-muted/40 transition-colors',
                'max-w-[92vw] sm:max-w-[520px]',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0',
                  item.kind === 'property'
                    ? 'bg-[#2d568e]/10 text-[#2d568e] dark:text-blue-400'
                    : 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                )}
              >
                {item.kind === 'property'
                  ? <Building2 size={14} />
                  : <Palette size={14} />
                }
              </span>

              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {item.title}
                </span>
                <span className="text-xs font-semibold text-foreground truncate w-full text-left">
                  {item.name}
                  <span className="text-muted-foreground font-normal mx-1.5">·</span>
                  <span className="text-muted-foreground font-normal truncate">{item.detail}</span>
                </span>
              </div>

              <span className="text-[10px] font-semibold text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                View
              </span>

              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); dismiss(item.id) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dismiss(item.id) } }}
                className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0 cursor-pointer"
                aria-label="Dismiss"
              >
                <X size={12} />
              </span>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}