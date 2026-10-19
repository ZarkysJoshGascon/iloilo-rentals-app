import { describe, expect, it } from 'vitest'
import {
  sanitizeText, sanitizeEmail, sanitizePhone, sanitizeMoney, sanitizeInt, sanitizeDateOnly,
  generateBookingCode, generateContractCode, generateCleaningCode,
  computeNights, cleaningTypeForStay, cn,
} from '@/lib/utils'

describe('sanitizeText', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeText('  Juan   dela\tCruz  ')).toBe('Juan dela Cruz')
  })
  it('turns blank input into null', () => {
    expect(sanitizeText('   ')).toBeNull()
    expect(sanitizeText(null)).toBeNull()
    expect(sanitizeText(undefined)).toBeNull()
  })
  it('strips control characters', () => {
    expect(sanitizeText('a\u0000b\u0007c')).toBe('abc')
  })
  it('drops line breaks unless allowed, and keeps at most one blank line', () => {
    expect(sanitizeText('one\ntwo')).toBe('one two')
    expect(sanitizeText('one\n\n\n\ntwo', { allowNewlines: true })).toBe('one\n\ntwo')
  })
  it('caps the length', () => {
    expect(sanitizeText('x'.repeat(500), { max: 10 })).toHaveLength(10)
  })
  it('normalizes composed and decomposed characters to the same text', () => {
    expect(sanitizeText('café')).toBe(sanitizeText('café'))
  })
  it('keeps script tags as plain text (React escapes them when shown)', () => {
    expect(sanitizeText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })
})

describe('sanitizeEmail', () => {
  it('lower-cases a valid address', () => {
    expect(sanitizeEmail('  Guest@Example.COM ')).toBe('guest@example.com')
  })
  it.each(['not-an-email', 'a@b', '@example.com', 'two words@example.com', ''])('rejects %j', (bad) => {
    expect(sanitizeEmail(bad)).toBeNull()
  })
})

describe('sanitizePhone', () => {
  it.each([
    ['0917 123 4567', '0917 123 4567'],
    ['+63 917 123 4567', '+63 917 123 4567'],
    ['(033) 320-1234', '(033) 320-1234'],
  ])('keeps %j', (input, out) => {
    expect(sanitizePhone(input)).toBe(out)
  })
  it('removes letters and symbols, leaving no stray spaces', () => {
    expect(sanitizePhone('tel: 0917-123-4567!')).toBe('0917-123-4567')
  })
  it.each(['123', '1234567890123456', '09+171234567', '++639171234567'])('rejects %j', (bad) => {
    expect(sanitizePhone(bad)).toBeNull()
  })
})

describe('sanitizeMoney and sanitizeInt', () => {
  it('reads numbers and keeps them in range', () => {
    expect(sanitizeMoney('1500.50')).toBe(1500.5)
    expect(sanitizeMoney(-5)).toBe(0)
    expect(sanitizeMoney(999_999_999)).toBe(100_000_000)
    expect(sanitizeMoney('abc')).toBe(0)
    expect(sanitizeMoney('')).toBe(0)
  })
  it('parses whole numbers with a fallback', () => {
    expect(sanitizeInt('4 guests')).toBe(4)
    expect(sanitizeInt('x', { fallback: 1 })).toBe(1)
    expect(sanitizeInt('50', { max: 10 })).toBe(10)
  })
})

describe('sanitizeDateOnly', () => {
  it('keeps a YYYY-MM-DD date and cuts the time off', () => {
    expect(sanitizeDateOnly('2026-10-19')).toBe('2026-10-19')
    expect(sanitizeDateOnly('2026-10-19T08:00:00Z')).toBe('2026-10-19')
  })
  it.each(['19/10/2026', 'tomorrow', '', null, '2026-1-9'])('rejects %j', (bad) => {
    expect(sanitizeDateOnly(bad)).toBeNull()
  })
})

describe('codes', () => {
  it.each([
    [generateBookingCode, 'BK'],
    [generateContractCode, 'CT'],
    [generateCleaningCode, 'CL'],
  ])('%o makes PREFIX- plus 8 easy-to-read characters', (make, prefix) => {
    const code = make()
    expect(code).toMatch(new RegExp(`^${prefix}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$`))
  })
  it('never uses look-alike characters (0, O, 1, I, L)', () => {
    const many = Array.from({ length: 300 }, () => generateBookingCode().slice(3)).join('')
    expect(many).not.toMatch(/[01OIL]/)
  })
  // 31^8 ≈ 850 billion codes: 2,000 in a row collide about once in 400,000 runs.
  it('does not repeat in 2,000 tries', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateBookingCode()))
    expect(codes.size).toBe(2000)
  })
})

describe('computeNights and cleaningTypeForStay', () => {
  it('counts nights between two dates', () => {
    expect(computeNights('2026-10-19', '2026-10-22')).toBe(3)
    expect(computeNights('2026-12-30', '2027-01-02')).toBe(3)
  })
  it('is 0 for missing, bad or reversed dates', () => {
    expect(computeNights(null, '2026-10-22')).toBe(0)
    expect(computeNights('nope', '2026-10-22')).toBe(0)
    expect(computeNights('2026-10-22', '2026-10-19')).toBe(0)
  })
  it('asks for a deep clean from 7 nights', () => {
    expect(cleaningTypeForStay('2026-10-01', '2026-10-07')).toBe('basic')
    expect(cleaningTypeForStay('2026-10-01', '2026-10-08')).toBe('deep')
  })
})

describe('cn', () => {
  it('merges class names, the later Tailwind class winning', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4')
  })

  it('skips the falsy values conditional classes produce', () => {
    expect(cn('text-sm', false, null, undefined, '', 'font-bold')).toBe('text-sm font-bold')
  })
})
