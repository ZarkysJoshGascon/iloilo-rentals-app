// src/components/admin/ContractAlertBar.jsx
// Warning bar on the Dashboard, under the header: contracts that have expired or are about
// to. Expands into a list; each row opens that contract. Dismissing hides it
// for the rest of the day, unless something new comes up.
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, X, ArrowRight } from 'lucide-react'
import { CONTRACT_ALERT_DAYS, CONTRACT_URGENT_DAYS } from '@/hooks/useContractAlerts'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'ir:contractAlert:dismissed'

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
}
function writeDismissed(value) {
  try { localStorage.setItem(DISMISS_KEY, value) } catch { /* private mode etc. */ }
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Status in font colour: red once expired, amber within the urgent window.
function toneFor(days) {
  if (days < 0) return 'text-red-600 dark:text-red-400'
  if (days <= CONTRACT_URGENT_DAYS) return 'text-amber-600 dark:text-amber-400'
  return 'text-foreground'
}

function relative(days) {
  if (days < 0) return `Expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `Expires in ${days} days`
}

export default function ContractAlertBar({ alerts, onOpenContract, onOpenContracts }) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)

  // Changes whenever a contract joins the list or crosses into a more urgent
  // group, so a dismissed bar comes back for anything new.
  const signature = useMemo(
    () => `${todayKey()}|${alerts.items.map((c) => `${c.id}:${c.days < 0 ? 'x' : c.days <= CONTRACT_URGENT_DAYS ? 'u' : 's'}`).join(',')}`,
    [alerts.items],
  )

  if (alerts.loading || alerts.total === 0 || dismissed === signature) return null

  const parts = [
    alerts.expired > 0 && { text: `${alerts.expired} expired`, tone: 'text-red-600 dark:text-red-400' },
    alerts.urgent > 0 && { text: `${alerts.urgent} expire${alerts.urgent === 1 ? 's' : ''} within ${CONTRACT_URGENT_DAYS} days`, tone: 'text-amber-600 dark:text-amber-400' },
    alerts.soon > 0 && { text: `${alerts.soon} within ${CONTRACT_ALERT_DAYS} days`, tone: 'text-foreground' },
  ].filter(Boolean)

  const dismiss = () => {
    writeDismissed(signature)
    setDismissed(signature)
  }

  return (
    <div role="status" className="flex-shrink-0 border-b border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-[#1c1709]">
      <div className="flex items-center gap-3 px-5 h-10">
        <AlertTriangle size={15} strokeWidth={2} className="text-foreground flex-shrink-0" />
        <p className="flex-1 min-w-0 truncate text-[12.5px] text-foreground">
          <span className="font-semibold">Contract renewals:</span>{' '}
          {parts.map((p, i) => (
            <span key={p.text}>
              {i > 0 && <span className="text-foreground"> · </span>}
              <span className={cn('font-semibold', p.tone)}>{p.text}</span>
            </span>
          ))}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
        >
          {open ? 'Hide' : 'Show'}
          <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
        <button
          type="button"
          onClick={onOpenContracts}
          className="hidden sm:inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold text-white bg-brand-solid hover:bg-brand-solid/90"
        >
          Open Contracts <ArrowRight size={13} />
        </button>
        <button
          type="button"
          onClick={dismiss}
          title="Hide until something new comes up (or tomorrow)"
          aria-label="Dismiss contract warning"
          className="p-1.5 rounded-md text-foreground hover:text-foreground hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
        >
          <X size={14} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ul className="max-h-56 overflow-y-auto px-5 pb-2.5">
              {alerts.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpenContract(c.id)}
                    className="w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-4 px-3 py-2 rounded-md text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0 truncate text-[12.5px] text-foreground">
                      <span className="font-mono font-bold">{c.unitCode || '—'}</span>
                      {c.building && <span className="text-foreground"> · {c.building}</span>}
                    </span>
                    <span className="min-w-0 truncate text-[12.5px] text-foreground">{c.owner || 'No owner'}</span>
                    <span className="text-[12px] tabular-nums text-foreground">{formatDate(c.expiry)}</span>
                    <span className={cn('text-[12px] font-semibold tabular-nums text-right min-w-[150px]', toneFor(c.days))}>
                      {relative(c.days)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
