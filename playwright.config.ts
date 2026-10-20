// End-to-end tests: the real site in Chrome (the copy installed on this
// computer), on a desktop window and on a phone-sized one.
//   npm run test:e2e                      against the dev server (started if needed)
//   E2E_BASE_URL=https://www.iloilorental.com npm run test:e2e   against the live site
// CRM tests need a signed-in admin session: see tests/e2e/README.md.
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173'
const local = baseURL.startsWith('http://localhost')

// What also runs in Firefox and in Safari's engine: the public site and the
// pages staff and owners open on their phones (most of them iPhones), and
// the CRM's dropdowns.
const OTHER_ENGINES = /(public-site|smoke|photos|owner-portal|housekeeper|crm-dropdowns)\.spec\.ts$/

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    // The browsers' clock is in Manila, as for the business, on any computer
    // (GitHub's run on UTC). A test can choose another zone.
    timezoneId: 'Asia/Manila',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    // Other engines (installed with: npx playwright install firefox webkit).
    // WebKit is what Safari runs on iPhones and Macs.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: OTHER_ENGINES },
    { name: 'iphone-safari', use: { ...devices['iPhone 14'] }, testMatch: OTHER_ENGINES },
  ],
  webServer: local
    ? { command: 'npx vite --port 5173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 60_000 }
    : undefined,
})
