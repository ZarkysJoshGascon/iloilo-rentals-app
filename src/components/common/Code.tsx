// src/components/common/Code.tsx
// Every code in the app (booking, cleaning, contract, PM contract, team and
// unit codes) shows the same way: bold, monospaced, with a copy button on
// its right. The button works inside clickable rows and cards: copying
// doesn't open the row, start a drag or move the focus.
import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'

/** Copies text, falling back to a hidden textarea where the clipboard API is off. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

type CopyButtonProps = {
  value: string
  /** What's copied, e.g. "Booking code"; used in the toast and for screen readers. */
  label?: string
  size?: number
  className?: string
}

/**
 * A small copy button. A span acting as a button, so it can sit inside the
 * button-shaped rows and cards the CRM uses for its lists.
 */
export function CopyButton({ value, label = 'Code', size = 12, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = async (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (await copyText(value)) {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
      toast.success(`${label} copied`, { id: `copy-${value}`, duration: 1600 })
    } else {
      toast.error("Couldn't copy. Select the code and copy it instead.")
    }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title={copied ? 'Copied' : `Copy ${value}`}
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()} ${value}`}
      onClick={copy}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') copy(e) }}
      // Keep presses from reaching a draggable or clickable parent.
      onPointerDown={(e: PointerEvent) => e.stopPropagation()}
      onMouseDown={(e: MouseEvent) => e.stopPropagation()}
      className={cn(
        // Above (and clickable through) rows that lay their own click target over the text.
        'relative pointer-events-auto inline-flex flex-shrink-0 items-center justify-center rounded text-foreground cursor-pointer outline-none transition-colors',
        'h-5 w-5 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-brand/40',
        copied && 'text-emerald-600 dark:text-emerald-400',
        className,
      )}
    >
      {copied ? <Check size={size} strokeWidth={2.5} aria-hidden /> : <Copy size={size} aria-hidden />}
    </span>
  )
}

type CodeProps = {
  value: string | null | undefined
  /** What it is, e.g. "Booking code" (the toast says "Booking code copied"). */
  label?: string
  /** Size and colour for the text, e.g. "text-[12px]". Always bold and monospaced. */
  className?: string
  /** Shown when there's no code. */
  empty?: ReactNode
  /** Fill the line (for codes in their own row or cell) instead of sitting in a sentence. */
  block?: boolean
  /** The copy icon's size. */
  iconSize?: number
  /** Classes for the copy button, e.g. white on a dark header. */
  buttonClassName?: string
}

/** A code, bold and monospaced, with a copy button on its right. */
export function Code({ value, label = 'Code', className, empty = '—', block = false, iconSize = 12, buttonClassName }: CodeProps) {
  if (!value) return <span className={className}>{empty}</span>
  return (
    <span className={cn('items-center gap-1 min-w-0 max-w-full align-middle', block ? 'flex' : 'inline-flex')}>
      <span className={cn('font-mono font-bold truncate', className)}>{value}</span>
      <CopyButton value={value} label={label} size={iconSize} className={buttonClassName} />
    </span>
  )
}
