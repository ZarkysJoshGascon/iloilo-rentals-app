// The unit tests run on Manila time (vitest.config.ts), whatever the
// computer's own setting. Many date tests rely on it, so check it holds.
import { describe, expect, it } from 'vitest'

describe('test environment', () => {
  it('runs on Manila time (UTC+8, no daylight saving)', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Manila')
    // 16:30 UTC is already half past midnight the next day in Manila.
    expect(new Date('2026-10-19T16:30:00Z').getDate()).toBe(20)
    expect(new Date('2026-06-01T00:00:00Z').getTimezoneOffset()).toBe(-480)
    expect(new Date('2026-12-01T00:00:00Z').getTimezoneOffset()).toBe(-480)
  })
})
