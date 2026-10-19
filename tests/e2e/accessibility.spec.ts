// Accessibility: every public page scanned with axe for WCAG 2.1 A/AA
// problems that block or seriously hinder people (screen readers, keyboard,
// low vision). Minor and moderate findings are listed but don't fail.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGES = ['/', '/about', '/contact', '/list-property', '/privacy', '/terms', '/login', '/unsubscribe', '/no-such-page']

for (const path of PAGES) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path)
    await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1200) // entrance animations settle (they fade text in)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    const report = blocking.map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length}×: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')})`)
    expect(report, report.join('\n')).toEqual([])
  })
}
