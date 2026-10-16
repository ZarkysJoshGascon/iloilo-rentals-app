// src/components/common/AppToaster.tsx
// The action confirmations in the top right, in the CRM's look: a plain card
// (white, or dark in dark mode) with a thin coloured bar on the left like the
// CRM's rows: emerald when something worked, red when it didn't, logo blue
// for anything else. Icons are plain black, with no circle behind them.
import { Toaster } from 'react-hot-toast'
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react'

const BAR = { success: '#059669', error: '#dc2626', info: 'var(--brand-solid)' }

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      containerStyle={{ top: 16, right: 16 }}
      toastOptions={{
        duration: 3500,
        icon: <Info size={16} strokeWidth={2.25} className="text-foreground flex-shrink-0" />,
        style: {
          background: 'var(--card)',
          color: 'var(--card-foreground)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${BAR.info}`,
          borderRadius: 8,
          boxShadow: '0 12px 28px -12px rgba(15,23,42,0.28), 0 4px 10px -4px rgba(15,23,42,0.10)',
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.4,
          maxWidth: 380,
        },
        success: {
          icon: <CheckCircle2 size={16} strokeWidth={2.25} className="flex-shrink-0 text-foreground" />,
          style: { borderLeftColor: BAR.success },
        },
        error: {
          duration: 5000,
          icon: <AlertCircle size={16} strokeWidth={2.25} className="flex-shrink-0 text-foreground" />,
          style: { borderLeftColor: BAR.error },
        },
        loading: {
          icon: <Loader2 size={16} strokeWidth={2.25} className="text-foreground animate-spin flex-shrink-0" />,
        },
      }}
    />
  )
}
