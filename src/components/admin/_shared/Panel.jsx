// src/components/admin/_shared/Panel.jsx
// The Dashboard's card look, for the other CRM pages: a white bordered card,
// a header with icon + title (+ count), white section labels and plain
// initials. No grey bands, chips or text.
import { cn } from '@/lib/utils'

export function Panel({ className, children }) {
  return (
    <section className={cn('rounded-md bg-card border border-border shadow-sm overflow-hidden flex flex-col', className)}>
      {children}
    </section>
  )
}

export function PanelHeader({ icon: Icon, title, subtitle, count, action }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon size={18} strokeWidth={1.75} className="text-foreground flex-shrink-0" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-foreground truncate">{title}</h3>
            {count != null && (
              <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md border border-border text-foreground">
                {count}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function SectionLabel({ icon: Icon, title, count, emphasis = false }) {
  return (
    <div className="sticky top-0 z-[1] flex items-center gap-2 px-5 h-8 bg-card border-b border-border text-[11px] font-semibold uppercase tracking-wider text-foreground">
      {Icon && <Icon size={13} strokeWidth={2} className="text-foreground" />}
      <span>{title}</span>
      {count != null && (
        <span className={cn('tabular-nums', emphasis && count > 0 && 'text-red-600 dark:text-red-400')}>{count}</span>
      )}
    </div>
  )
}

const AVATAR_SIZES = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-[12px]',
  lg: 'w-12 h-12 text-base',
}

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// Plain initials on white with a hairline, as on the Dashboard.
export function InitialsAvatar({ name, photoUrl, size = 'md', className }) {
  const sizeClass = AVATAR_SIZES[size] || AVATAR_SIZES.md
  if (photoUrl) {
    return <img src={photoUrl} alt={name || ''} className={cn('rounded-full object-cover flex-shrink-0', sizeClass, className)} />
  }
  return (
    <div className={cn('rounded-full bg-card ring-1 ring-border text-foreground font-semibold flex items-center justify-center flex-shrink-0', sizeClass, className)}>
      {initialsOf(name)}
    </div>
  )
}
