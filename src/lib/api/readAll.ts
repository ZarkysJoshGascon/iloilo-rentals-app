// src/lib/api/readAll.ts
// The API returns at most 1,000 rows per request (the project's "Max rows"),
// and a bigger result is cut off without an error. readAll reads a query a
// page at a time until a short page comes back. The query must end in a
// unique order (add .order('id')), or a row could be skipped or repeated
// between pages. The backup function has the same helper.
export const PAGE_SIZE = 1000

export async function readAll<T = any>(query: any, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}
