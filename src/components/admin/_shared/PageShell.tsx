import type { ReactNode } from 'react'
type PageShellProps = {
  children?: ReactNode
  className?: string
}

// src/components/admin/_shared/PageShell.tsx
// Shared outer wrapper for every admin tab page.
// Provides consistent padding, scroll behavior, and max-width.

export default function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <div className={`h-full min-h-0 overflow-y-auto ${className}`}>
      <div className="px-6 py-5 md:px-8 md:py-6 max-w-[1600px] mx-auto">
        {children}
      </div>
    </div>
  )
}

type PageShellFlexProps = {
  children?: ReactNode
  className?: string
}

// For pages that need a full-height flex column instead of a scrolling column
// (e.g. master-detail pages with a fixed panel).
export function PageShellFlex({ children, className = '' }: PageShellFlexProps) {
  return (
    <div className={`h-full min-h-0 flex flex-col px-6 py-5 md:px-8 md:py-6 ${className}`}>
      {children}
    </div>
  )
}