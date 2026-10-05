import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ContextMenu({ items = [], children, className }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const menuRef = useRef(null)

  const handleContextMenu = useCallback((e) => {
    if (items.length === 0) return
    e.preventDefault()
    e.stopPropagation()

    const MENU_WIDTH = 240
    const MENU_HEIGHT_ESTIMATE = items.length * 36 + 16
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8)
    const y = Math.min(e.clientY, window.innerHeight - MENU_HEIGHT_ESTIMATE - 8)
    setPos({ x, y })
    setOpen(true)
  }, [items])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)

    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const handleSelect = (item) => {
    setOpen(false)
    requestAnimationFrame(() => item.onSelect?.())
  }

  return (
    <div onContextMenu={handleContextMenu} className={className}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.1 }}
              style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 2147483647 }}
              className="min-w-[220px] rounded-lg border border-border bg-popover shadow-xl py-1.5 overflow-hidden"
            >
              {items.map((item, i) => {
                if (item.separator) return <div key={i} className="h-px bg-border my-1" />
                const Icon = item.icon
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2.5 transition-colors',
                      item.danger
                        ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
                        : 'text-foreground hover:bg-muted',
                      item.disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
                    )}
                  >
                    {Icon && <Icon size={13} className="flex-shrink-0 opacity-70" />}
                    <span className="truncate">{item.label}</span>
                    {item.hint && (
                      <span className="ml-auto text-[10px] text-muted-foreground tabular-nums font-mono">
                        {item.hint}
                      </span>
                    )}
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}