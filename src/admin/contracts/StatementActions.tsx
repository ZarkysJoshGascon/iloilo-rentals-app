// src/admin/contracts/StatementActions.tsx
// The owner's Excel statement for a contract: download it to check, and
// once the contract has ended, email it to the owner. Shows when it was
// last sent, and the nightly close-out (src/lib/domain/closeout.ts): the
// automatic email, and when the term's bookings and cleanings are cleared.
// Used on the Contracts panel and the Accounting contract page.
import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { downloadContractStatement, sendContractStatement, listContractStatements } from '@/lib/api/email'
import { closeoutState, CLEAR_AFTER_DAYS } from '@/lib/domain/closeout'
import { manilaToday } from '@/admin/dashboard/workLog'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// "Nov 2025 · Gross income: Excel ₱10,000.00, Accounting ₱12,000.00", one per line.
function describeWarnings(warnings, max = 6) {
  const lines = warnings.slice(0, max).map((w) => `${w.month} · ${w.label}: Excel ${peso(w.sheet)}, Accounting ${peso(w.accounting)}`)
  if (warnings.length > max) lines.push(`…and ${warnings.length - max} more`)
  return lines.join('\n')
}

const LINK = 'underline underline-offset-2 hover:text-brand-solid'

// The close-out line under the send status.
function CloseoutLine({ contract, history }: { contract: any; history: any[] }) {
  const state = closeoutState(contract, history, manilaToday())
  const line = 'text-[11px] text-foreground'
  switch (state.kind) {
    case 'running':
      return <p className={line}>Emailed automatically the night after it ends. Its bookings and cleanings are cleared {CLEAR_AFTER_DAYS} days after that, and a copy of the statement is kept.</p>
    case 'to-send':
      return <p className={line}>Will be emailed automatically tonight.</p>
    case 'held':
      return <p className={line}><span className="font-semibold text-red-600 dark:text-red-400">Not emailed automatically</span> · {state.reason}</p>
    case 'clears-on':
      return <p className={line}>Bookings and cleanings will be cleared on {formatWhen(state.date)}. A copy of the statement is kept.</p>
    case 'waiting':
      return <p className={line}><span className="font-semibold text-amber-600 dark:text-amber-400">Not cleared yet</span> · {state.note}</p>
    case 'cleared':
      return (
        <p className={line}>
          <span className="font-semibold">Records cleared</span> on {formatWhen(state.at)}: {state.bookings} bookings, {state.cleanings} cleanings, {state.photos} photos.
          {' '}Download Excel gives the copy kept then.
          {contract.records_archive_drive_url && <> · <a href={contract.records_archive_drive_url} target="_blank" rel="noreferrer" className={LINK}>Copy in Google Drive</a></>}
        </p>
      )
    default:
      return null
  }
}

type StatementActionsProps = {
  contract: any
  compact?: boolean
  className?: string
}

/**
 * compact  buttons only (for a page header); the full version adds a status line
 */
export function StatementActions({ contract, compact = false, className }: StatementActionsProps) {
  const [busy, setBusy] = useState(null) // 'download' | 'send'
  const [history, setHistory] = useState([])

  const ended = !!contract?.expiry_date && contract.expiry_date < todayISO()
  const cleared = !!contract?.records_cleared_at
  const ownerEmail = String(contract?.owners?.email || '').trim()
  const hasEmail = EMAIL_RE.test(ownerEmail)
  const lastSent = history.find((h) => h.status === 'sent') || null
  const lastFailed = history[0]?.status === 'failed' ? history[0] : null

  const contractId = contract?.id
  const loadHistory = useCallback(() => {
    if (!contractId) return
    listContractStatements(contractId).then(setHistory)
  }, [contractId])

  useEffect(() => { loadHistory() }, [loadHistory])

  const download = async () => {
    setBusy('download')
    try {
      const { warnings, archived } = await downloadContractStatement(contract.id)
      if (archived) {
        toast.success('Downloaded the copy kept when the records were cleared')
      } else if (warnings.length > 0) {
        toast(
          `Downloaded, but some months differ from the Accounting page:\n${describeWarnings(warnings, 3)}`,
          { icon: '⚠️', duration: 10000, style: { whiteSpace: 'pre-line', maxWidth: 460 } },
        )
      } else {
        toast.success('Statement downloaded · matches Accounting')
      }
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Could not build the statement')
    } finally {
      setBusy(null)
    }
  }

  const send = async () => {
    const again = lastSent ? `\n\nIt was already sent on ${formatWhen(lastSent.sent_at)}.` : ''
    if (!window.confirm(`Email the statement for ${contract.contract_code || 'this contract'} to ${ownerEmail}?${again}`)) return
    setBusy('send')
    try {
      let res
      try {
        res = await sendContractStatement(contract.id)
      } catch (err) {
        // The Excel disagrees with Accounting for some months: ask before sending.
        if (err?.code !== 'mismatch') throw err
        const ok = window.confirm(
          `The statement differs from the Accounting page:\n\n${describeWarnings(err.warnings)}\n\n` +
          'Download it to check first, or send it anyway?\n\nOK = send anyway · Cancel = don\'t send',
        )
        if (!ok) return
        res = await sendContractStatement(contract.id, { force: true })
      }
      toast.success(`Statement sent to ${res?.to || ownerEmail}`)
      loadHistory()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Could not send the statement')
      loadHistory()
    } finally {
      setBusy(null)
    }
  }

  const sendBlockedReason = cleared
    ? "This contract's records were cleared. Download the kept copy and forward it."
    : !ended
    ? 'The statement can be emailed once the contract has ended'
    : !hasEmail
      ? 'The owner has no email address. Add one in Registry.'
      : null

  const buttons = (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <button
        type="button"
        onClick={download}
        disabled={!!busy}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-[12px] font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
        title="Download the Excel statement to check it"
      >
        {busy === 'download' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Download Excel
      </button>
      <button
        type="button"
        onClick={send}
        disabled={!!busy || !!sendBlockedReason}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold text-white bg-brand-solid hover:bg-brand-solid/90 transition-colors disabled:opacity-50"
        title={sendBlockedReason || (lastSent ? `Last sent ${formatWhen(lastSent.sent_at)} to ${lastSent.sent_to}` : `Email it to ${ownerEmail}`)}
      >
        {busy === 'send' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        {lastSent ? 'Email again' : 'Email to owner'}
      </button>
    </div>
  )

  if (compact) return buttons

  return (
    <div className="space-y-2">
      {buttons}
      <p className="text-[11px] text-foreground">
        {lastSent ? (
          <>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Sent{lastSent.automatic ? ' automatically' : ''}</span>
            {' '}to {lastSent.sent_to} on {formatWhen(lastSent.sent_at)}
            {lastSent.drive_url && <> · <a href={lastSent.drive_url} target="_blank" rel="noreferrer" className={LINK}>Copy in Google Drive</a></>}
          </>
        ) : lastFailed ? (
          <>
            <span className="font-semibold text-red-600 dark:text-red-400">Last send failed</span>
            {lastFailed.error_message ? ` · ${lastFailed.error_message}` : ''}
          </>
        ) : ended ? (
          hasEmail ? (
            <><span className="font-semibold text-amber-600 dark:text-amber-400">Not sent yet</span> · goes to {ownerEmail}</>
          ) : (
            <span className="font-semibold text-red-600 dark:text-red-400">The owner has no email address</span>
          )
        ) : (
          `Can be emailed once the contract ends${hasEmail ? ` · goes to ${ownerEmail}` : ''}`
        )}
      </p>
      <CloseoutLine contract={contract} history={history} />
    </div>
  )
}
