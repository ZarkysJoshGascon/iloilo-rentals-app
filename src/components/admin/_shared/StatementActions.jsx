// src/components/admin/_shared/StatementActions.jsx
// The owner's Excel statement for a contract: download it to check, and
// once the contract has ended, email it to the owner. Shows when it was
// last sent. Used on the Contracts panel and the Accounting contract page.
import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { downloadContractStatement, sendContractStatement, listContractStatements } from '@/lib/email'

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

/**
 * compact  buttons only (for a page header); the full version adds a status line
 */
export function StatementActions({ contract, compact = false, className }) {
  const [busy, setBusy] = useState(null) // 'download' | 'send'
  const [history, setHistory] = useState([])

  const ended = !!contract?.expiry_date && contract.expiry_date < todayISO()
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
      await downloadContractStatement(contract.id)
      toast.success('Statement downloaded')
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
      const res = await sendContractStatement(contract.id)
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

  const sendBlockedReason = !ended
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
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Sent</span>
            {' '}to {lastSent.sent_to} on {formatWhen(lastSent.sent_at)}
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
    </div>
  )
}
