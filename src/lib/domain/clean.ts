// src/lib/domain/clean.ts
// Tidies what a CRM form saves, at the point it's written, so every screen
// gets the same rules: text loses stray control characters and extra spaces,
// is trimmed and capped; a blank field is saved as empty (null); an email or
// phone that doesn't look right stops the save with a message naming the
// field. Rules go by field name, so `cleanFields(patch)` fits any insert or
// update. Fields without a rule, and anything that isn't text (numbers,
// dates, ids, lists, true/false), are left as they are.
import { sanitizeText } from '@/lib/utils'

type Rule =
  | { kind: 'text'; max: number }   // one line
  | { kind: 'note'; max: number }   // line breaks kept
  | { kind: 'email' }
  | { kind: 'phone' }

const text = (max: number): Rule => ({ kind: 'text', max })
const note = (max: number): Rule => ({ kind: 'note', max })
const EMAIL: Rule = { kind: 'email' }
const PHONE: Rule = { kind: 'phone' }

const RULES: Record<string, Rule> = {
  // People: owners, staff, guests, inquiry contacts
  name: text(120),
  guest_name: text(120),
  owner_name: text(120),
  client_name: text(120),
  author_name: text(120),
  email: EMAIL,
  guest_email: EMAIL,
  owner_email: EMAIL,
  client_email: EMAIL,
  phone: PHONE,
  owner_phone: PHONE,
  client_phone: PHONE,

  // Units
  building: text(120),
  unit_code: text(40),
  unit_type: text(60),
  marketing_title: text(160),
  inventory_list: note(4000),

  // Notes and free text
  notes: note(2000),
  owner_notes: note(2000),
  admin_notes: note(4000),
  content: note(2000),
  body: note(2000),
  message: note(5000),
  affiliate_notes: note(2000),
  payment_note: note(500),
  laundry_payment_note: note(500),

  // Payments
  payment_method: text(60),
  laundry_payment_method: text(60),
  payment_reference: text(100),
  laundry_payment_reference: text(100),

  // Inquiry details
  property_address: text(240),
  location: text(200),
  tag: text(40),
}

const LABELS: Record<string, string> = {
  email: 'Email',
  guest_email: 'Guest email',
  owner_email: 'Owner email',
  client_email: 'Client email',
  phone: 'Phone',
  owner_phone: 'Owner phone',
  client_phone: 'Client phone',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanPhone(raw: string, field: string): string | null {
  const s = sanitizeText(raw, { max: 40 })
  if (!s) return null
  const kept = s.replace(/[^\d+() -]/g, '')
  const digits = (kept.match(/\d/g) || []).length
  const plus = (kept.match(/\+/g) || []).length
  if (digits < 7 || digits > 15 || plus > 1 || (plus === 1 && !kept.startsWith('+'))) {
    throw new Error(`${LABELS[field] || 'Phone'}: enter a valid number (7 to 15 digits)`)
  }
  return kept
}

function cleanValue(field: string, value: unknown) {
  const rule = RULES[field]
  if (!rule || typeof value !== 'string') return value
  switch (rule.kind) {
    case 'text': return sanitizeText(value, { max: rule.max })
    case 'note': {
      // Spaces left at the end of a line go too.
      const s = sanitizeText(value.replace(/[ \t]+(?=\r?\n)/g, ''), { max: rule.max, allowNewlines: true })
      return s
    }
    case 'email': {
      const s = sanitizeText(value, { max: 254 })
      if (!s) return null
      if (!EMAIL_RE.test(s)) throw new Error(`${LABELS[field] || 'Email'}: enter a valid email address`)
      return s.toLowerCase()
    }
    case 'phone': return cleanPhone(value, field)
  }
}

/** A copy of `record` with its text fields tidied; throws if an email or phone isn't valid. */
export function cleanFields<T extends Record<string, any>>(record: T): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record
  const out: Record<string, any> = {}
  for (const [field, value] of Object.entries(record)) out[field] = cleanValue(field, value)
  return out as T
}
