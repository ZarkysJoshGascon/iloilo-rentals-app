import { describe, expect, it, vi } from 'vitest'
import { readAll, PAGE_SIZE } from '@/lib/api/readAll'

// A query that holds `total` rows and answers .range(from, to) like the API.
function fakeQuery(total: number, failOnPage?: number) {
  const calls: [number, number][] = []
  const query = {
    range: vi.fn((from: number, to: number) => {
      calls.push([from, to])
      if (failOnPage != null && calls.length === failOnPage) return Promise.resolve({ data: null, error: new Error('network down') })
      const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ id: from + i }))
      return Promise.resolve({ data: rows, error: null })
    }),
  }
  return { query, calls }
}

describe('readAll', () => {
  it('reads past the 1,000-row cap, page by page, without gaps or repeats', async () => {
    const { query, calls } = fakeQuery(2_345)
    const rows = await readAll<{ id: number }>(query)
    expect(rows).toHaveLength(2_345)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_345)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('makes one request when everything fits in a page', async () => {
    const { query, calls } = fakeQuery(72)
    expect(await readAll(query)).toHaveLength(72)
    expect(calls).toHaveLength(1)
  })

  it('asks once more when the table is an exact multiple of the page size', async () => {
    const { query, calls } = fakeQuery(PAGE_SIZE * 2)
    expect(await readAll(query)).toHaveLength(PAGE_SIZE * 2)
    expect(calls).toHaveLength(3)
  })

  it('returns nothing for an empty table', async () => {
    expect(await readAll(fakeQuery(0).query)).toEqual([])
  })

  it('fails loudly instead of returning a partial list', async () => {
    await expect(readAll(fakeQuery(2_500, 2).query)).rejects.toThrow('network down')
  })
})
