// src/components/admin/_shared/PageShell.jsx
// Shared outer wrapper for every admin tab page.
// Provides consistent padding, scroll behavior, and max-width.

export default function PageShell({ children, className = '' }) {
  return (
    <div className={`h-full min-h-0 overflow-y-auto ${className}`}>
      <div className="px-6 py-5 md:px-8 md:py-6 max-w-[1600px] mx-auto">
        {children}
      </div>
    </div>
  )
}

// For pages that need a full-height flex column instead of a scrolling column
// (e.g. master-detail pages with a fixed panel).
export function PageShellFlex({ children, className = '' }) {
  return (
    <div className={`h-full min-h-0 flex flex-col px-6 py-5 md:px-8 md:py-6 ${className}`}>
      {children}
    </div>
  )
}