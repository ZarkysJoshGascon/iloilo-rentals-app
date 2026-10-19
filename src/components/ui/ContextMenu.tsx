import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// A right-click menu entry, or a divider between groups.
export type ContextMenuItem = {
  separator?: boolean
  label?: ReactNode
  icon?: LucideIcon
  onSelect?: () => unknown
  hint?: ReactNode
  danger?: boolean
  disabled?: boolean
}

type ContextMenuProps = {
  items?: ContextMenuItem[]
  children: ReactNode
  className?: string
}

// On phones and tablets a long press opens the same menu: held this long,
// without the finger moving further than this (a scroll cancels it).
const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10
const MENU_WIDTH = 240

type Press = { x: number; y: number; timer: ReturnType<typeof setTimeout> }

export function ContextMenu({ items = [], children, className }: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [touch, setTouch] = useState(false)
  const menuRef = useRef(null)
  const press = useRef<Press | null>(null)
  const touchOpenedAt = useRef(0)
  // The tap the browser sends when a long press ends must not open the row.
  const swallowClick = useRef(false)

  // With a mouse the menu opens at the pointer. With a finger it opens centred
  // above it (the finger hides what's below), or below when there's no room.
  const openAt = useCallback((clientX: number, clientY: number, viaTouch: boolean) => {
    const rowHeight = viaTouch ? 44 : 36
    const menuHeight = items.length * rowHeight + 16
    let x = clientX
    let y = clientY
    if (viaTouch) {
      x = clientX - MENU_WIDTH / 2
      y = clientY - menuHeight - 16 >= 8 ? clientY - menuHeight - 16 : clientY + 28
      touchOpenedAt.current = Date.now()
    }
    setPos({
      x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
    setTouch(viaTouch)
    setOpen(true)
  }, [items])

  const cancelPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }, [])

  const handleContextMenu = useCallback((e) => {
    if (items.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    // Android sends its own contextmenu during a long press: if our timer
    // already opened the menu, leave it; if not, open it as the touch menu.
    if (Date.now() - touchOpenedAt.current < 1000) return
    const viaTouch = !!press.current || e.nativeEvent?.pointerType === 'touch'
    if (viaTouch) {
      cancelPress()
      swallowClick.current = true
    }
    openAt(e.clientX, e.clientY, viaTouch)
  }, [items, openAt, cancelPress])

  const handlePointerDown = (e) => {
    swallowClick.current = false
    if (e.pointerType !== 'touch' || items.length === 0) return
    cancelPress()
    const { clientX: x, clientY: y } = e
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        press.current = null
        swallowClick.current = true
        navigator.vibrate?.(12)
        openAt(x, y, true)
      }, LONG_PRESS_MS),
    }
  }

  const handlePointerMove = (e) => {
    const p = press.current
    if (p && (Math.abs(e.clientX - p.x) > MOVE_TOLERANCE || Math.abs(e.clientY - p.y) > MOVE_TOLERANCE)) cancelPress()
  }

  const handlePointerUp = () => {
    cancelPress()
    // Some browsers send no tap after a long press; don't swallow the next real one.
    if (swallowClick.current) setTimeout(() => { swallowClick.current = false }, 400)
  }

  const handleClickCapture = (e) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  useEffect(() => cancelPress, [cancelPress])

  useEffect(() => {
    if (!open) return
    // pointerdown, not mousedown: phones send a mousedown when the long press
    // ends, which would close the menu the moment it opened.
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)

    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onDown)
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
    <div
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelPress}
      onClickCapture={handleClickCapture}
      className={cn(items.length > 0 && 'long-press', className)}
    >
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
              className={cn(
                'rounded-lg border border-border bg-popover shadow-xl py-1.5 overflow-hidden',
                touch ? 'w-[240px] max-w-[calc(100vw-16px)]' : 'min-w-[220px]',
              )}
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
                      'w-full text-left px-3 font-medium flex items-center gap-2.5 transition-colors',
                      touch ? 'min-h-[44px] text-[13px]' : 'py-2 text-xs',
                      item.danger
                        ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
                        : 'text-foreground hover:bg-muted',
                      item.disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
                    )}
                  >
                    {Icon && <Icon size={touch ? 15 : 13} className="flex-shrink-0 opacity-70" />}
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
