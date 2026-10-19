import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Photo preparation itself is replaced: each call waits until the test lets it
// finish, so the queue can be watched step by step.
const pending: { files: Blob[]; onEach?: (n: number) => void; finish: (r: { photos: Blob[]; errors: string[] }) => void }[] = []
vi.mock('@/lib/images', () => ({
  PHOTO: { maxSide: 1600, quality: 0.75 },
  preparePhotos: vi.fn((files: Blob[], _options: unknown, onEach?: (n: number) => void) =>
    new Promise((finish) => pending.push({ files, onEach, finish }))),
}))
const toastError = vi.fn()
vi.mock('react-hot-toast', () => ({ default: { error: (m: string) => toastError(m) } }))

const { usePhotoPreparer } = await import('@/hooks/usePhotoPreparer')

const photo = (name: string) => new Blob([name])
// Lets queued promise callbacks run.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  pending.length = 0
  toastError.mockClear()
})

describe('usePhotoPreparer', () => {
  it('shows progress while photos are prepared, then hands them over', async () => {
    const { result } = renderHook(() => usePhotoPreparer('cleaning-1'))
    const use = vi.fn()
    expect(result.current.busyText).toBeUndefined()

    act(() => result.current.prepare([photo('a'), photo('b')], use))
    expect(result.current.busyText).toBe('Preparing photo 1 of 2…')
    await settle()
    act(() => pending[0].onEach!(1))
    expect(result.current.busyText).toBe('Preparing photo 2 of 2…')
    act(() => pending[0].onEach!(2))

    const ready = [photo('small a'), photo('small b')]
    pending[0].finish({ photos: ready, errors: [] })
    await settle()
    expect(use).toHaveBeenCalledWith(ready)
    expect(result.current.busyText).toBeUndefined()
  })

  it('prepares batches one after another, never side by side', async () => {
    const { result } = renderHook(() => usePhotoPreparer('cleaning-1'))
    act(() => {
      result.current.prepare([photo('a')], vi.fn())
      result.current.prepare([photo('b'), photo('c')], vi.fn())
    })
    expect(result.current.busyText).toBe('Preparing photo 1 of 3…')
    await settle()
    expect(pending).toHaveLength(1) // the second batch waits

    act(() => pending[0].onEach!(1))
    pending[0].finish({ photos: [photo('A')], errors: [] })
    await settle()
    expect(pending).toHaveLength(2)
    expect(pending[1].files).toHaveLength(2)
    expect(result.current.busyText).toBe('Preparing photo 2 of 3…')
  })

  it('drops photos meant for a cleaning that is no longer open', async () => {
    const { result, rerender } = renderHook(({ id }) => usePhotoPreparer(id), { initialProps: { id: 'cleaning-1' } })
    const use = vi.fn()
    act(() => result.current.prepare([photo('a')], use))
    await settle()
    rerender({ id: 'cleaning-2' })
    pending[0].finish({ photos: [photo('A')], errors: [] })
    await settle()
    expect(use).not.toHaveBeenCalled()
  })

  it("says which photos couldn't be used", async () => {
    const { result } = renderHook(() => usePhotoPreparer('cleaning-1'))
    const use = vi.fn()
    act(() => result.current.prepare([photo('a'), photo('b'), photo('c')], use))
    await settle()
    pending[0].finish({ photos: [photo('A')], errors: ['This photo is over 60 MB.', 'Unsupported image format.'] })
    await settle()
    expect(toastError).toHaveBeenCalledWith("2 photos couldn't be added. This photo is over 60 MB.")
    expect(use).toHaveBeenCalledTimes(1)
  })
})
