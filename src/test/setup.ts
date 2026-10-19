// Runs before every unit test file: DOM matchers (toBeInTheDocument, …),
// a clean DOM and real timers between tests, and empty browser storage.
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'framer-motion'

// Animations finish instantly, so tests see the end state right away.
MotionGlobalConfig.skipAnimations = true

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})
