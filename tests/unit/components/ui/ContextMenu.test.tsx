import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ContextMenu } from '@/components/ui/ContextMenu'

function setup() {
  const openRow = vi.fn()
  const seeInAccounting = vi.fn()
  render(
    <ContextMenu items={[
      { label: 'See in Accounting', onSelect: seeInAccounting },
      { separator: true },
      { label: 'Copy booking code', onSelect: vi.fn(), disabled: true },
    ]}>
      <button type="button" onClick={openRow}>Maria Santos · BK-ABCD2345</button>
    </ContextMenu>,
  )
  return { row: screen.getByRole('button', { name: /Maria Santos/ }), openRow, seeInAccounting }
}

const menuItem = (name: string) => screen.queryByRole('button', { name })

describe('ContextMenu with a mouse', () => {
  it('opens on right-click and runs the picked item', async () => {
    const { row, seeInAccounting } = setup()
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 })
    fireEvent.click(menuItem('See in Accounting')!)
    await waitFor(() => expect(seeInAccounting).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(menuItem('See in Accounting')).not.toBeInTheDocument())
  })

  it('shows disabled items as disabled', () => {
    const { row } = setup()
    fireEvent.contextMenu(row)
    expect(menuItem('Copy booking code')).toBeDisabled()
  })

  it('closes on Escape and on a click outside', async () => {
    const { row } = setup()
    fireEvent.contextMenu(row)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(menuItem('See in Accounting')).not.toBeInTheDocument())

    fireEvent.contextMenu(row)
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(menuItem('See in Accounting')).not.toBeInTheDocument())
  })

  it('does not open from a normal click, which still opens the row', () => {
    const { row, openRow } = setup()
    fireEvent.click(row)
    expect(openRow).toHaveBeenCalledTimes(1)
    expect(menuItem('See in Accounting')).not.toBeInTheDocument()
  })

  it('does nothing special with no items', () => {
    render(<ContextMenu items={[]}><span>Row</span></ContextMenu>)
    const ev = fireEvent.contextMenu(screen.getByText('Row'))
    expect(ev).toBe(true) // the browser's own menu is left alone
  })
})

describe('ContextMenu on a touch screen', () => {
  const touch = { pointerType: 'touch', clientX: 120, clientY: 300 }

  it('opens after holding for half a second', () => {
    vi.useFakeTimers()
    const { row } = setup()
    fireEvent.pointerDown(row, touch)
    act(() => { vi.advanceTimersByTime(499) })
    expect(menuItem('See in Accounting')).not.toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(menuItem('See in Accounting')).toBeInTheDocument()
  })

  it('does not also open the row when the finger lifts after a long press', () => {
    vi.useFakeTimers()
    const { row, openRow } = setup()
    fireEvent.pointerDown(row, touch)
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.pointerUp(row, touch)
    fireEvent.click(row)
    expect(openRow).not.toHaveBeenCalled()
    expect(menuItem('See in Accounting')).toBeInTheDocument()
  })

  it('lets a quick tap open the row as usual', () => {
    vi.useFakeTimers()
    const { row, openRow } = setup()
    fireEvent.pointerDown(row, touch)
    act(() => { vi.advanceTimersByTime(150) })
    fireEvent.pointerUp(row, touch)
    fireEvent.click(row)
    expect(openRow).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(menuItem('See in Accounting')).not.toBeInTheDocument()
  })

  it('does not open while the finger is scrolling', () => {
    vi.useFakeTimers()
    const { row } = setup()
    fireEvent.pointerDown(row, touch)
    fireEvent.pointerMove(row, { ...touch, clientY: 330 })
    act(() => { vi.advanceTimersByTime(800) })
    expect(menuItem('See in Accounting')).not.toBeInTheDocument()
  })

  it('does not open when the browser takes over the touch (pointercancel)', () => {
    vi.useFakeTimers()
    const { row } = setup()
    fireEvent.pointerDown(row, touch)
    fireEvent.pointerCancel(row, touch)
    act(() => { vi.advanceTimersByTime(800) })
    expect(menuItem('See in Accounting')).not.toBeInTheDocument()
  })

  it('ignores a held mouse button (mice use right-click)', () => {
    vi.useFakeTimers()
    const { row } = setup()
    fireEvent.pointerDown(row, { ...touch, pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(800) })
    expect(menuItem('See in Accounting')).not.toBeInTheDocument()
  })

  it('gives touch menus finger-sized rows', () => {
    vi.useFakeTimers()
    const { row } = setup()
    fireEvent.pointerDown(row, touch)
    act(() => { vi.advanceTimersByTime(600) })
    expect(menuItem('See in Accounting')!.className).toMatch(/min-h-\[44px\]/)
  })

  it('does not swallow the next real tap if the browser sent no click after the long press', () => {
    vi.useFakeTimers()
    const { row, openRow } = setup()
    fireEvent.pointerDown(row, touch)
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.pointerUp(row, touch)
    act(() => { vi.advanceTimersByTime(500) })
    fireEvent.click(row)
    expect(openRow).toHaveBeenCalledTimes(1)
  })
})
