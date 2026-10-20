// Accessibility checks with axe: WCAG 2.1 A and AA problems that block or
// seriously hinder people (screen readers, keyboards, low vision). Minor and
// moderate findings don't fail a test.
import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** The page's serious and critical problems, one line each, leaving out the rules in `skip`. */
export async function seriousProblems(page: Page, { skip = [] }: { skip?: string[] } = {}): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).disableRules(skip).analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length}×: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')})`)
}

/**
 * Passes once the page has no serious problems. Pages fade their text in, and
 * half-faded text fails a contrast check, so the scan is repeated until the
 * page settles; a real problem never clears and fails with the full list.
 * A scan of the homepage takes a few seconds, more with several browsers
 * running at once, hence the long limit.
 */
export async function expectNoSeriousProblems(page: Page) {
  await expect.poll(() => seriousProblems(page), {
    message: `serious accessibility problems on ${new URL(page.url()).pathname}`,
    timeout: 30_000,
    intervals: [250, 500, 1_000, 2_000],
  }).toEqual([])
}
