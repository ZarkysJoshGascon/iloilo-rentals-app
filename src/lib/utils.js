// src/lib/utils.js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// ------------------------------------------------------------
// Cryptographically-strong booking code
// Alphabet omits 0/O/1/I/L to reduce human transcription errors.
// 8 chars from a 32-char alphabet = 32^8 ≈ 1.1e12 combinations.
// ------------------------------------------------------------
const BOOKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateBookingCode(prefix = 'BK') {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += BOOKING_ALPHABET[bytes[i] % BOOKING_ALPHABET.length]
  }
  return `${prefix}-${s}`
}

// ------------------------------------------------------------
// Input hardening helpers
// ------------------------------------------------------------

/**
 * Trim, collapse repeated whitespace, strip control chars, and cap length.
 * Safe for names, codes, references, etc.
 */
/**
 * Trim, collapse repeated whitespace, strip control chars, and cap length.
 * Safe for names, codes, references, etc.
 */
export function sanitizeText(input, { max = 200, allowNewlines = false } = {}) {
  if (input == null) return null
  let s = String(input)
  // strip control chars except tab/newline if allowed
  // eslint-disable-next-line no-control-regex
  s = s.replace(allowNewlines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
  s = allowNewlines ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ')
  s = s.trim()
  if (s.length > max) s = s.slice(0, max)
  return s.length === 0 ? null : s
}

export function sanitizeEmail(input) {
  const s = sanitizeText(input, { max: 254 })
  if (!s) return null
  // conservative email check — real validation happens server-side too
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null
  return s.toLowerCase()
}

export function sanitizePhone(input) {
  const s = sanitizeText(input, { max: 40 })
  if (!s) return null
  return s.replace(/[^\d+\-() .]/g, '')
}

export function sanitizeMoney(input, { min = 0, max = 100_000_000 } = {}) {
  if (input === '' || input == null) return 0
  const n = Number(input)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(n, min), max)
}

export function sanitizeInt(input, { min = 0, max = 1_000_000, fallback = 0 } = {}) {
  const n = Number.parseInt(input, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

export function sanitizeDateOnly(input) {
  if (!input) return null
  const s = String(input).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return s
}
export function generateContractCode(prefix = 'CT') {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += BOOKING_ALPHABET[bytes[i] % BOOKING_ALPHABET.length]
  }
  return `${prefix}-${s}`
}
export function generateCleaningCode(prefix = 'CL') {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += BOOKING_ALPHABET[bytes[i] % BOOKING_ALPHABET.length]
  }
  return `${prefix}-${s}`
}
// ------------------------------------------------------------
// Stay timing constants (Iloilo Rentals policy)
//   Check-in:  3:00 PM
//   Check-out: 11:00 AM
// Change them here and every reference across the app updates.
// ------------------------------------------------------------
export const STAY_TIMES = {
  checkIn:  { hour: 15, minute: 0, label: '3:00 PM' },
  checkOut: { hour: 11, minute: 0, label: '11:00 AM' },
}

export const CLEANING_WINDOW = {
  label: '11:00 AM – 3:00 PM',
}

// Nights between two YYYY-MM-DD strings
export function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  const a = new Date(checkIn + 'T00:00:00Z')
  const b = new Date(checkOut + 'T00:00:00Z')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

// < 7 nights → basic, >= 7 nights → deep
export function cleaningTypeForStay(checkIn, checkOut) {
  return computeNights(checkIn, checkOut) >= 7 ? 'deep' : 'basic'
}