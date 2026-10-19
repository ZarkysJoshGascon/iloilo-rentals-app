import { describe, expect, it } from 'vitest'
import { cleanFields } from '@/lib/domain/clean'

describe('cleanFields (what every CRM form saves)', () => {
  it('trims names and collapses spaces', () => {
    expect(cleanFields({ guest_name: '  Maria   Santos ' })).toEqual({ guest_name: 'Maria Santos' })
  })

  it('saves a blank field as empty (null)', () => {
    expect(cleanFields({ notes: '   ', guest_email: '' })).toEqual({ notes: null, guest_email: null })
  })

  it('keeps line breaks in notes but drops spaces at line ends', () => {
    expect(cleanFields({ notes: 'Line one   \nLine two' })).toEqual({ notes: 'Line one\nLine two' })
  })

  it('caps long text at the field limit', () => {
    expect(cleanFields({ guest_name: 'x'.repeat(300) }).guest_name).toHaveLength(120)
    expect(cleanFields({ notes: 'y'.repeat(5000) }).notes).toHaveLength(2000)
  })

  it('lower-cases a valid email', () => {
    expect(cleanFields({ owner_email: 'Owner@Mail.COM' })).toEqual({ owner_email: 'owner@mail.com' })
  })

  it('stops the save on a bad email, naming the field', () => {
    expect(() => cleanFields({ guest_email: 'guest@' })).toThrow('Guest email: enter a valid email address')
  })

  it('accepts real phone numbers', () => {
    expect(cleanFields({ phone: '+63 917 123 4567' })).toEqual({ phone: '+63 917 123 4567' })
  })

  it('drops letters from a phone without leaving a stray space', () => {
    expect(cleanFields({ phone: 'Tel: 0917 123 4567' })).toEqual({ phone: '0917 123 4567' })
  })

  it('keeps words apart when a name or address is pasted with tabs or line breaks', () => {
    expect(cleanFields({ guest_name: 'Juan\tdela Cruz', property_address: '123 Diversion Rd\nMandurriao' }))
      .toEqual({ guest_name: 'Juan dela Cruz', property_address: '123 Diversion Rd Mandurriao' })
  })

  it.each(['12345', '+63+917', '0917-123-4567-8888-99'])('stops the save on a bad phone %j', (bad) => {
    expect(() => cleanFields({ owner_phone: bad })).toThrow('Owner phone: enter a valid number (7 to 15 digits)')
  })

  it('leaves numbers, dates, ids and lists alone', () => {
    const input = { total_amount: 1500, check_in: '2026-10-19', unit_id: 'abc', transactions: [{ amount: 1 }], guests: 2 }
    expect(cleanFields(input)).toEqual(input)
  })

  it('leaves fields without a rule untouched', () => {
    expect(cleanFields({ custom_thing: '  keep  me  ' })).toEqual({ custom_thing: '  keep  me  ' })
  })

  it('passes non-objects straight through', () => {
    expect(cleanFields(null)).toBeNull()
    expect(cleanFields([1, 2] as any)).toEqual([1, 2])
  })
})
