// Accessibility: every public page scanned with axe for WCAG 2.1 A/AA
// problems that block or seriously hinder people (screen readers, keyboard,
// low vision). See support/a11y.ts.
import { test } from '@playwright/test'
import { expectNoSeriousProblems } from './support/a11y'

const PAGES = ['/', '/about', '/contact', '/list-property', '/privacy', '/terms', '/login', '/unsubscribe', '/no-such-page']

for (const path of PAGES) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path)
    await expectNoSeriousProblems(page)
  })
}
