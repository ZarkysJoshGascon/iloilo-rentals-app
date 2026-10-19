// Two test suites, sharing the app's Vite setup (the @ alias, React):
//   unit         tests/unit/          — logic and components, in a simulated
//                browser (jsdom). Supabase is mocked: nothing leaves the machine.
//                Laid out like src/ (and the Edge Functions' plain-JS parts).
//   integration  tests/integration    — the app's real backend: the live
//                Supabase project's access rules, functions and tables, called
//                as a signed-out visitor. Read-only; it changes no data.
// Browser end-to-end tests run with Playwright (playwright.config.ts).
//
// Coverage (npm run test:coverage) measures the code unit tests are for: the
// rules, the data layer and the hooks. Pages are covered by the browser tests.
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/**/*.ts',
        'src/hooks/**/*.ts',
        'src/owner/ownerUi.tsx',
        'src/admin/dashboard/workLog.ts',
        'supabase/functions/**/*.js',
      ],
      exclude: [
        'src/lib/supabase.ts',    // the real client: replaced in every unit test
        'src/lib/googleSignIn.ts', // loads Google's script: browser tests only
      ],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
      // Raise these as coverage grows; never lower them to make a change pass.
      thresholds: {
        'src/lib/domain/**': { lines: 95, branches: 78, functions: 90 },
        'src/lib/api/**': { lines: 70, branches: 55 },
        'src/hooks/**': { lines: 85, branches: 90 },
        'supabase/functions/**': { lines: 85, branches: 70 },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx,js}'],
          setupFiles: ['./tests/unit/setup.ts'],
          // Dates in the app are Manila dates; tests give the same answers on
          // any computer (a build server usually runs on UTC).
          env: { TZ: 'Asia/Manila' },
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
