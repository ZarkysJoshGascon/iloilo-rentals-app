import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  X, Loader2, Send, Mail, History, AlertTriangle, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  sendBookingConfirmation,
  listBookingConfirmations,
  formatDateLong,
  formatMoney,
  computeNights,
  BOOKING_CONFIRMATION,
} from '@/lib/email'

const BRAND = '#2d568e'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function BookingConfirmationModal({ open, onClose, booking, onSent }) {
  const [sending, setSending]       = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory]       = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const guestEmail = (booking?.guest_email || '').trim().toLowerCase()
  const validEmail = EMAIL_RE.test(guestEmail)

  const nights = useMemo(
    () => computeNights(booking?.check_in, booking?.check_out),
    [booking?.check_in, booking?.check_out],
  )

  const subject = booking
    ? `${BOOKING_CONFIRMATION.subjectPrefix} ${booking.booking_code || ''}`.trim()
    : ''

  // Reset when modal opens/closes
  useEffect(() => {
    if (!open) return
    setHistoryOpen(false)
    setHistory([])
    setSending(false)
  }, [open, booking?.id])

  // Load history when the tab is opened
  useEffect(() => {
    if (!open || !historyOpen || !booking?.id) return
    setHistoryLoading(true)
    listBookingConfirmations(booking.id)
      .then(setHistory)
      .catch((err) => {
        console.error(err)
        toast.error('Failed to load history')
      })
      .finally(() => setHistoryLoading(false))
  }, [open, historyOpen, booking?.id])

  const handleSend = async () => {
    if (!booking?.id) return
    if (!validEmail) {
      toast.error('This booking has no valid email on file.')
      return
    }

    const ok = window.confirm(
      `Send booking confirmation to ${guestEmail}?\n\nSubject: ${subject}`,
    )
    if (!ok) return

    setSending(true)
    try {
      const result = await sendBookingConfirmation(booking.id)
      toast.success(`Confirmation sent to ${result.to || guestEmail}`)
      onSent?.()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (!open || !booking) return null

  const unit       = booking.units || {}
  const unitLine   = `${unit.unit_code || '—'}${unit.building ? ` (${unit.building})` : ''}${unit.unit_type ? ` · ${unit.unit_type}` : ''}`
  const nightsLabel = nights === 1 ? '1 night' : `${nights} nights`
  const guestsLabel = (booking.guests || 1) === 1 ? '1 guest' : `${booking.guests} guests`

  const totalAmount = formatMoney(booking.total_amount)
  const amountPaid  = formatMoney(booking.amount_paid)
  const balance     = formatMoney(booking.balance)

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="relative bg-card rounded-lg shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-border"
      >
        {/* ---------- Header ---------- */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Mail size={16} className="text-foreground flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">
                Send Booking Confirmation
              </h2>
              <p className="text-[11px] text-muted-foreground truncate">
                {booking.guest_name || 'Guest'} · {booking.booking_code}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-semibold transition-colors border',
                historyOpen
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border text-foreground hover:bg-muted',
              )}
              title="Sent history"
            >
              <History size={11} />
              History
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-muted"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ---------- Body ---------- */}
        <div className="flex-1 overflow-y-auto">
          {historyOpen ? (
            <HistoryPanel
              loading={historyLoading}
              items={history}
            />
          ) : (
            <PreviewPanel
              guestEmail={guestEmail}
              validEmail={validEmail}
              subject={subject}
              booking={booking}
              nightsLabel={nightsLabel}
              guestsLabel={guestsLabel}
              unitLine={unitLine}
              totalAmount={totalAmount}
              amountPaid={amountPaid}
              balance={balance}
            />
          )}
        </div>

        {/* ---------- Footer ---------- */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
          <p className="text-[10px] text-muted-foreground hidden sm:block truncate">
            Preview is read-only · Confirmation email is locked by design.
          </p>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded text-xs"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 rounded text-xs gap-1.5 text-white"
              style={{ backgroundColor: BRAND }}
              onClick={handleSend}
              disabled={sending || !validEmail}
              title={validEmail ? 'Send confirmation' : 'No valid guest email on this booking'}
            >
              {sending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/* ================================================================
   Preview panel — mirrors what the guest will receive.
   Keep this in sync with the Edge Function's render function.
   ================================================================ */
function PreviewPanel({
  guestEmail, validEmail, subject, booking,
  nightsLabel, guestsLabel, unitLine,
  totalAmount, amountPaid, balance,
}) {
  return (
    <div className="p-5 space-y-4">

      {/* To */}
      <div className="flex items-start gap-2 text-xs">
        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] min-w-[64px] pt-0.5">
          To
        </span>
        <span className={cn(
          'font-mono break-all',
          validEmail ? 'text-foreground' : 'text-red-600 dark:text-red-400',
        )}>
          {guestEmail || '— no email on this booking —'}
        </span>
      </div>

      {!validEmail && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <AlertTriangle size={13} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 dark:text-red-400">
            This booking has no valid guest email. Edit the booking to add one before sending.
          </p>
        </div>
      )}

      {/* Subject */}
      <div className="flex items-start gap-2 text-xs">
        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] min-w-[64px] pt-0.5">
          Subject
        </span>
        <span className="text-foreground font-semibold break-words">{subject}</span>
      </div>

      {/* Divider */}
      <div className="relative pt-2">
        <div className="border-t border-border" />
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 bg-card text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Preview
        </span>
      </div>

      {/* Email body preview */}
      <div className="rounded-md border border-border bg-background p-4 space-y-4">

        <p className="text-sm text-foreground">
          Hi <span className="font-semibold">{booking.guest_name || 'Guest'}</span>,
        </p>

        <p className="text-sm text-foreground">
          Thank you for booking with Iloilo Rentals! Here are your stay details:
        </p>

        {/* Stay details card */}
        <div className="rounded-md bg-muted/40 p-4">
          <PreviewRow label="Booking code" value={booking.booking_code || '—'} mono />
          <PreviewRow label="Unit"         value={unitLine} />
          <PreviewRow
            label="Check-in"
            value={`${formatDateLong(booking.check_in)} · from ${BOOKING_CONFIRMATION.checkInTime}`}
          />
          <PreviewRow
            label="Check-out"
            value={`${formatDateLong(booking.check_out)} · by ${BOOKING_CONFIRMATION.checkOutTime}`}
          />
          <PreviewRow
            label="Guests"
            value={`${guestsLabel} · ${nightsLabel}`}
          />
        </div>

        {/* Amounts card */}
        <div className="rounded-md bg-muted/40 p-4">
          <AmountRow label="Total amount" value={totalAmount} />
          <AmountRow label="Amount paid"  value={amountPaid} />
          <AmountRow label="Balance"      value={balance} bold />
        </div>

        {/* Notes (if any) */}
        {booking.notes && (
          <div className="rounded-md bg-muted/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
              Notes
            </p>
            <p className="text-xs text-foreground whitespace-pre-wrap break-words">
              {booking.notes}
            </p>
          </div>
        )}

        <p className="text-sm text-foreground">
          If you have any questions before your arrival, just reply to this email — we read every message.
        </p>

        <p className="text-sm text-foreground">
          {BOOKING_CONFIRMATION.signoff1}
          <br />
          <span className="font-semibold">{BOOKING_CONFIRMATION.signoff2}</span>
        </p>

        <p className="text-[10px] text-muted-foreground text-center pt-3 border-t border-border">
          {BOOKING_CONFIRMATION.disclaimer}
        </p>
      </div>

      {/* Info footer */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border">
        <Check size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">
          This email is generated automatically from the booking record and cannot be edited.
          If the details are wrong, edit the booking and resend.
        </p>
      </div>
    </div>
  )
}

function PreviewRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[11px] text-muted-foreground min-w-[92px] flex-shrink-0">
        {label}
      </span>
      <span className={cn(
        'text-xs text-foreground text-right break-words',
        mono && 'font-mono',
      )}>
        {value}
      </span>
    </div>
  )
}

function AmountRow({ label, value, bold = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn(
        'text-xs tabular-nums text-right text-foreground',
        bold ? 'font-bold' : 'font-medium',
      )}>
        {value}
      </span>
    </div>
  )
}

/* ================================================================
   History panel — shows prior sends for this booking.
   ================================================================ */
function HistoryPanel({ loading, items }) {
  if (loading) {
    return (
      <div className="p-5 space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-8 text-center">
        <History size={20} className="text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground italic">
          No confirmation emails sent yet
        </p>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-2">
      {items.map((h) => (
        <div
          key={h.id}
          className="rounded-md border border-border bg-background px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-foreground truncate">
              {h.subject}
            </span>
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide flex-shrink-0',
                h.status === 'sent'   && 'text-emerald-600 dark:text-emerald-400',
                h.status === 'failed' && 'text-red-600 dark:text-red-400',
                h.status === 'queued' && 'text-amber-600 dark:text-amber-400',
              )}
            >
              {h.status}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground truncate">
            To: {h.guest_email}
          </p>

          <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
            {new Date(h.sent_at || h.created_at).toLocaleString('en-PH', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
            {h.sent_by_email ? ` · by ${h.sent_by_email}` : ''}
          </p>

          {h.error_message && (
            <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 break-words">
              {h.error_message}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}