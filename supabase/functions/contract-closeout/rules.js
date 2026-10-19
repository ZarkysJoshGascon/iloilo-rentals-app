// supabase/functions/contract-closeout/rules.js
// The nightly close-out's decisions, kept apart from the database and email
// so they can be tested (tests/unit/functions/contract-closeout/rules.test.js).
// Plain JS: runs in the Edge Function (Deno) and in the tests (Node).
// The CRM shows the same rules (src/lib/domain/closeout.ts); a test checks
// the two agree.

/** Contracts that ended before this are left as they were. */
export const CLOSEOUT_FROM = '2026-10-19'
/** Days between the statement going out and the term's records being cleared. */
export const CLEAR_AFTER_DAYS = 30
const DAY_MS = 86_400_000

/** When a term is over: midnight in Manila after its last day, in ms. */
export function termOver(expiry) {
  return Date.parse(`${expiry}T16:00:00Z`)
}

/** The statement email that covers the whole term (sent once it was over), or null. */
export function statementForTerm(statements, expiry) {
  return (statements || []).find((s) => s.status === 'sent' && s.sent_at && Date.parse(s.sent_at) >= termOver(expiry)) || null
}

/**
 * What tonight's run does with one contract, given its statement log
 * (newest first) and the time now (ms):
 *   'skip'   not part of the close-out: no end date, ended before
 *            CLOSEOUT_FROM, still running, or already cleared
 *   'send'   email the statement: none covers the term yet
 *   'wait'   statement sent; its records stay for CLEAR_AFTER_DAYS
 *   'clear'  statement sent CLEAR_AFTER_DAYS ago or more
 */
export function nextStep(contract, statements, now) {
  const expiry = contract?.expiry_date
  if (!expiry || expiry < CLOSEOUT_FROM || contract.records_cleared_at) return 'skip'
  if (now < termOver(expiry)) return 'skip'
  const sent = statementForTerm(statements, expiry)
  if (!sent) return 'send'
  return now - Date.parse(sent.sent_at) >= CLEAR_AFTER_DAYS * DAY_MS ? 'clear' : 'wait'
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Why the statement can't be emailed automatically, or null when it can.
 * warnings: months whose figures differ from the Accounting page.
 */
export function holdReason({ hasEmail, warnings }) {
  if (!hasEmail) return 'The owner has no email address. Add one in Registry, then email the statement from the contract.'
  const months = new Set((warnings || []).map((w) => w.month)).size
  if (months > 0) {
    return `Its figures differ from the Accounting page for ${plural(months, 'month')}. Download it to check, then email it from the contract.`
  }
  return null
}

/**
 * Why a term's bookings and cleanings are kept for now, or null when nothing
 * is unfinished. scope: the counts from closeout_scope().
 */
export function unfinishedNote(scope) {
  const items = [
    scope.unpaid_bookings > 0 && `${plural(scope.unpaid_bookings, 'booking')} with a balance still owed`,
    scope.open_cleanings > 0 && `${plural(scope.open_cleanings, 'cleaning')} not yet approved`,
    scope.unpaid_cleanings > 0 && `${plural(scope.unpaid_cleanings, 'cleaning')} with housekeeping or laundry pay not yet paid`,
  ].filter(Boolean)
  return items.length > 0 ? `Bookings and cleanings are kept until these are settled: ${items.join('; ')}.` : null
}

/** The columns of a cleaning that hold photos: lists, then single photos. */
export const PHOTO_COLUMNS = [
  'photos_before', 'photos_after', 'photos_report',
  'amenities_used_photo', 'amenities_replaced_photo', 'laundry_used_photo', 'laundry_replaced_photo',
]

/** Every stored photo path the cleanings point to. */
export function photoPaths(cleanings) {
  const paths = []
  for (const row of cleanings || []) {
    for (const column of PHOTO_COLUMNS) {
      for (const photo of [row?.[column]].flat()) {
        if (photo && typeof photo.path === 'string' && photo.path) paths.push(photo.path)
      }
    }
  }
  return paths
}
