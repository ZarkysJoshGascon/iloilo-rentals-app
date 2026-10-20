// Layout checks for the browser tests: what a person would see as broken on
// their screen. Each is measured the way a tap lands, with
// document.elementFromPoint, which respects clipping, stacking and the
// screen's edges: a list cut off by the box it's in, or hidden behind a form,
// fails here even when Playwright could still click it (Playwright scrolls
// things into view first; a person may not know they're there).
//
//   await installLayoutProbes(page)             // before page.goto
//   expect(await sticksOut(page)).toEqual([])
//   expect(await popupProblems(page, page.locator('[data-page-scroll]'))).toEqual([])
import type { Locator, Page } from '@playwright/test'

/** What opens a list, menu or calendar. */
export const POPUP_TRIGGERS = [
  '[aria-haspopup]:not([aria-haspopup="false"])',
  '[data-slot="select-trigger"]',
  '[role="combobox"]',
].join(', ')

// Runs in the page. Kept to plain browser code: Playwright sends its source.
function probes() {
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  }
  const describe = (el: Element | null) => {
    if (!el) return 'nothing (off the screen)'
    const label = el.getAttribute('aria-label')
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `<${el.tagName.toLowerCase()}${label ? ` "${label}"` : ''}> ${text}`
  }
  const screenWidth = () => document.documentElement.clientWidth
  const screenHeight = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight)

  ;(window as any).__layout = {
    describe,

    /** Marks everything on screen now, so what a click brings up can be found. */
    mark() {
      for (const el of document.querySelectorAll('body *')) if (visible(el)) el.setAttribute('data-seen', '')
    },

    /** The outermost things that came up since mark(): lists, menus, calendars. */
    appeared() {
      const out: Element[] = []
      for (const el of document.querySelectorAll('body *:not([data-seen])')) {
        if (!visible(el) || getComputedStyle(el).pointerEvents === 'none') continue
        const r = el.getBoundingClientRect()
        if (r.width * r.height < 1500) continue
        // A backdrop covers the screen and says nothing.
        if (r.width >= screenWidth() - 2 && r.height >= screenHeight() - 2 && !el.textContent?.trim()) continue
        if (out.some((o) => o.contains(el))) continue
        for (let i = out.length - 1; i >= 0; i--) if (el.contains(out[i])) out.splice(i, 1)
        out.push(el)
      }
      ;(window as any).__appeared = out
      return out.map(describe)
    },

    /**
     * How much of each thing that came up a person can see and touch: points
     * on a grid across it, each either on it, off the screen, or under
     * something else (cut off by a box it's in, or behind another layer).
     */
    coverage() {
      return ((window as any).__appeared as Element[]).map((el) => {
        const r = el.getBoundingClientRect()
        const inset = 8
        let offScreen = 0
        const covers = new Set<string>()
        for (let i = 0; i < 5; i++) for (let j = 0; j < 7; j++) {
          const x = r.left + inset + (r.width - 2 * inset) * (i / 4)
          const y = r.top + inset + (r.height - 2 * inset) * (j / 6)
          if (x < 0 || y < 0 || x >= screenWidth() || y >= screenHeight()) { offScreen++; continue }
          const hit = document.elementFromPoint(x, y)
          if (!hit || !el.contains(hit)) covers.add(describe(hit))
        }
        // Wider inside than it is, and cut at the side with nothing to say so:
        // options too long for the list. (Not the 1px inputs a select hides
        // inside itself for forms.)
        const cut = [el, ...el.querySelectorAll('*')].some((x) => {
          const s = getComputedStyle(x)
          return visible(x) && x.clientWidth > 8 && x.scrollWidth > x.clientWidth + 1 && /hidden|clip/.test(s.overflowX) && s.textOverflow !== 'ellipsis'
        })
        return { what: describe(el), offScreen, coveredBy: [...covers].slice(0, 2), cut }
      })
    },

    /** Things sticking out past the screen's left or right edge (outside any sideways scroller). */
    sticksOut() {
      const W = screenWidth()
      const out: string[] = []
      const insideScroller = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p)
          if (/auto|scroll/.test(s.overflowX)) return true
          if (/hidden|clip/.test(s.overflowX)) {
            const pr = p.getBoundingClientRect()
            if (pr.left >= -1 && pr.right <= W + 1) return true // cut by a box that fits the screen
          }
        }
        return false
      }
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el)) continue
        const r = el.getBoundingClientRect()
        if (r.right <= W + 1 && r.left >= -1) continue
        if (r.right <= 0 || r.left >= W) continue // parked off the screen on purpose (a drawer, a hidden field)
        const pr = el.parentElement?.getBoundingClientRect()
        if (pr && (pr.right > W + 1 || pr.left < -1)) continue // only the outermost
        if (insideScroller(el)) continue
        out.push(`${describe(el)} spans ${Math.round(r.left)}–${Math.round(r.right)}px of ${W}px`)
      }
      return out
    },

    /** Codes (booking, unit, contract…) cut short: a code is only any use whole. */
    cutCodes() {
      return [...document.querySelectorAll('.font-mono')]
        .filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.textContent?.trim()} shows ${el.clientWidth}px of ${el.scrollWidth}px`)
    },

    /** Fields with text under 16px: iPhone Safari zooms the page in when one is tapped. */
    zoomingFields() {
      return [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')]
        .filter((el) => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${describe(el)} ${getComputedStyle(el).fontSize}`)
    },
  }
}

export async function installLayoutProbes(page: Page) {
  await page.addInitScript(probes)
}

export const sticksOut = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__layout.sticksOut())
export const cutCodes = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__layout.cutCodes())
export const zoomingFields = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__layout.zoomingFields())

/**
 * Opens each list, menu and calendar inside `scope`, one at a time, and says
 * what's wrong with any: off the screen, cut off, under something, or its
 * options cut at the side; or Esc closing the form it's in along with it.
 * Empty when all is well.
 */
export async function popupProblems(page: Page, scope: Locator): Promise<string[]> {
  const problems: string[] = []
  const triggers = scope.locator(POPUP_TRIGGERS)
  const count = await triggers.count()
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i)
    if (!(await trigger.isVisible()) || !(await trigger.isEnabled())) continue
    const name = await trigger.evaluate((el) => el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 40))
    await page.evaluate(() => (window as any).__layout.mark())
    try {
      await trigger.click({ timeout: 3000 })
    } catch (error) {
      problems.push(`"${name}" can't be clicked: ${String(error).split('\n').find((l) => /intercepts|outside/.test(l))?.trim() ?? 'timed out'}`)
      continue
    }
    // Lists fade and slide in; a select also lays a guard over itself as it opens.
    await page.waitForTimeout(450)
    const opened: string[] = await page.evaluate(() => (window as any).__layout.appeared())
    for (const c of await page.evaluate(() => (window as any).__layout.coverage())) {
      if (c.offScreen) problems.push(`"${name}" opens ${c.what}: ${c.offScreen} of 35 points off the screen`)
      if (c.coveredBy.length) problems.push(`"${name}" opens ${c.what}: partly under ${c.coveredBy.join(' and ')}`)
      if (c.cut) problems.push(`"${name}" opens ${c.what}: text cut off at its side`)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    if (opened.length && !(await scope.isVisible())) {
      problems.push(`Esc on "${name}" closed what it's in, not just the list`)
      break
    }
  }
  return problems
}
