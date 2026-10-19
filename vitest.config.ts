// Two test suites, sharing the app's Vite setup (the @ alias, React):
//   unit         src/**/*.test.ts(x)  — logic and components, in a simulated
//                browser (jsdom). Supabase is mocked: nothing leaves the machine.
//                Also the plain-JS parts of Edge Functions (supabase/functions).
//   integration  tests/integration    — the app's real backend: the live
//                Supabase project's access rules, functions and tables, called
//                as a signed-out visitor. Read-only; it changes no data.
// Browser end-to-end tests run with Playwright (playwright.config.ts).
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.js'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
}))
