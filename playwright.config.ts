// End-to-end tests: the real site in Chrome (the copy installed on this
// computer), on a desktop window and on a phone-sized one.
//   npm run test:e2e                      against the dev server (started if needed)
//   E2E_BASE_URL=https://www.iloilorental.com npm run test:e2e   against the live site
// CRM tests need a signed-in admin session: see tests/e2e/README.md.
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173'
const local = baseURL.startsWith('http://localhost')

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: local
    ? { command: 'npx vite --port 5173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 60_000 }
    : undefined,
})
