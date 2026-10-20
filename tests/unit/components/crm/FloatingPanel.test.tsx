import { describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FloatingPanel, placePanel, typesStraightAway, GAP, EDGE, type Visible } from '@/components/crm/FloatingPanel'

// A phone: 390 × 844, nothing covering it.
const PHONE: Visible = { top: 0, bottom: 844, width: 390, layoutHeight: 844 }
const field = (top: number, left = 16, width = 358, height = 40) =>
  ({ top, bottom: top + height, left, right: left + width, width })

describe('placePanel', () => {
  it('opens below its field, as wide as it, when there\'s room', () => {
    expect(placePanel(field(100), PHONE, { width: 'anchor', maxHeight: 360 }))
      .toEqual({ above: false, left: 16, width: 358, maxHeight: 360, top: 140 + GAP })
  })

  it('opens above when the room below is short and there\'s more above', () => {
    const p = placePanel(field(700), PHONE, { width: 'anchor', maxHeight: 360 })
    expect(p).toMatchObject({ above: true, maxHeight: 360, bottom: 844 - 700 + GAP })
    expect(p.top).toBeUndefined()
  })

  it('stays below when a short panel fits there, even with more room above', () => {
    expect(placePanel(field(600), PHONE, { width: 'anchor', maxHeight: 360, natural: 150 })).toMatchObject({ above: false, top: 640 + GAP })
  })

  it('is never taller than the room on its side, and scrolls instead', () => {
    // 844 - 440 - GAP - EDGE below; less above.
    expect(placePanel(field(400), PHONE, { width: 'anchor', maxHeight: 600 }).maxHeight).toBe(844 - 440 - GAP - EDGE)
  })

  it('makes do with the part of the screen above a phone\'s keyboard', () => {
    const keyboardUp: Visible = { ...PHONE, bottom: 430 }
    const p = placePanel(field(300), keyboardUp, { width: 'anchor', maxHeight: 360 })
    expect(p).toMatchObject({ above: true, maxHeight: 300 - GAP - EDGE, bottom: 844 - 300 + GAP })
  })

  it('keeps a usable height when there\'s almost no room either side', () => {
    const tiny: Visible = { top: 0, bottom: 200, width: 390, layoutHeight: 200 }
    expect(placePanel(field(80), tiny, { width: 'anchor', maxHeight: 360 }).maxHeight).toBe(120)
    expect(placePanel(field(80), tiny, { width: 'anchor', maxHeight: 90 }).maxHeight).toBe(90)
  })

  it('lines up its right edge with the field\'s when asked', () => {
    expect(placePanel(field(100, 900, 100), { ...PHONE, width: 1280 }, { width: 280, align: 'right', maxHeight: 400 }))
      .toMatchObject({ left: 1000 - 280, width: 280 })
  })

  it('stays on the screen, and is never wider than it', () => {
    expect(placePanel(field(100, 300, 80), PHONE, { width: 280, maxHeight: 400 })).toMatchObject({ left: 390 - 280 - EDGE })
    expect(placePanel(field(100, 8, 60), PHONE, { width: 280, align: 'right', maxHeight: 400 })).toMatchObject({ left: EDGE })
    expect(placePanel(field(100), PHONE, { width: 420, maxHeight: 400 })).toMatchObject({ left: EDGE, width: 390 - EDGE * 2 })
  })
})

// The app's root, as in index.html: anything outside it is another floating layer.
function renderInRoot(ui: React.ReactElement) {
  const root = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'root' }))
  return render(ui, { container: root })
}

function Dropdown({ onClose }: { onClose?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)}>Booked by</button>
      <p>Somewhere else on the page</p>
      <FloatingPanel open={open} anchorRef={ref} onClose={() => { onClose?.(); setOpen(false) }} role="dialog" aria-label="Specialists">
        <button type="button">Specialist 1</button>
      </FloatingPanel>
    </div>
  )
}

describe('FloatingPanel', () => {
  it('floats outside the page\'s boxes, at the top of the document', () => {
    const { container } = renderInRoot(<Dropdown />)
    const panel = screen.getByRole('dialog', { name: 'Specialists' })
    expect(container.contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
    expect(panel).toHaveClass('fixed') // placed against the window, not a scroll box
  })

  it('closes on a click elsewhere on the page', () => {
    const onClose = vi.fn()
    renderInRoot(<Dropdown onClose={onClose} />)
    fireEvent.mouseDown(screen.getByText('Somewhere else on the page'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open for a click inside it or on its field', () => {
    const onClose = vi.fn()
    renderInRoot(<Dropdown onClose={onClose} />)
    fireEvent.mouseDown(screen.getByText('Specialist 1'))
    fireEvent.mouseDown(screen.getByText('Booked by'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open for a click in a date picker or select menu opened from it', () => {
    const onClose = vi.fn()
    renderInRoot(<Dropdown onClose={onClose} />)
    const menu = document.body.appendChild(document.createElement('div')) // floats outside the root, like they do
    fireEvent.mouseDown(menu)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Esc without the dialog behind it hearing the key', async () => {
    const dialogEsc = vi.fn()
    window.addEventListener('keydown', dialogEsc)
    try {
      renderInRoot(<Dropdown />)
      fireEvent.keyDown(screen.getByText('Specialist 1'), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Specialists' })).toBeNull())
      expect(dialogEsc).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', dialogEsc)
    }
  })

  it('closes on Esc with nothing focused (on a phone, where the key goes to the page)', async () => {
    renderInRoot(<Dropdown />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Specialists' })).toBeNull())
  })

  it('leaves Esc to a date picker or select menu opened from it', () => {
    const onClose = vi.fn()
    renderInRoot(<Dropdown onClose={onClose} />)
    const menu = document.body.appendChild(document.createElement('button'))
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('typesStraightAway', () => {
  it('takes the keyboard on a computer, not on a phone, where it would cover the list', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: fine)' }))
    expect(typesStraightAway()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(typesStraightAway()).toBe(false)
  })
})
