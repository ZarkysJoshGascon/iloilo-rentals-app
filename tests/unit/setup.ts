// Runs before every unit test file: DOM matchers (toBeInTheDocument, …), and
// after each test a clean DOM, real timers, mocks back to their defaults
// (so one test's set-up never leaks into the next) and empty browser storage.
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'framer-motion'
import { resetSupabaseMock } from './supabaseMock'

// Animations finish instantly, so tests see the end state right away.
MotionGlobalConfig.skipAnimations = true

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  // Spied-on methods (console.error, …) come back; every vi.fn() returns to
  // the implementation it was created with.
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  resetSupabaseMock()
  // Files marked `@vitest-environment node` have no browser storage.
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
