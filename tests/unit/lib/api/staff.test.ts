import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const { supabase, queryBuilder, rpcResult } = await import('../../supabaseMock')
const { validateStaffEmail, searchProfiles, roleMeta, STAFF_ROLES } = await import('@/lib/api/staff')

const PROFILE = { id: 'p1', email: 'ana@example.com', full_name: 'Ana Reyes', avatar_url: null }

// profiles answers the "has this person signed in before?" question; the
// role's own table answers "are they already in this role?".
function people({ registered, inRole }: { registered: boolean; inRole?: { id: string; code: string; name: string } }) {
  supabase.from.mockImplementation((table: string) =>
    table === 'profiles'
      ? queryBuilder({ data: registered ? [PROFILE] : [], error: null })
      : queryBuilder({ data: inRole ? [inRole] : [], error: null }))
}

describe('validateStaffEmail (adding someone to the team)', () => {
  const role = Object.keys(STAFF_ROLES)[0]

  it('accepts someone who has signed in before and isn\'t in this role yet', async () => {
    people({ registered: true })
    expect(await validateStaffEmail(role, '  Ana@Example.com ')).toEqual({ ok: true, profile: PROFILE })
  })

  it.each([
    ['', 'empty', 'Email is required'],
    ['ana@', 'invalid', 'Enter a valid email address'],
  ])('refuses %j (%s) without asking the database', async (email, reason, message) => {
    expect(await validateStaffEmail(role, email)).toEqual({ ok: false, reason, message })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('asks them to sign in first when there\'s no account yet', async () => {
    people({ registered: false })
    expect(await validateStaffEmail(role, 'new@example.com')).toMatchObject({ ok: false, reason: 'not_registered' })
  })

  it('names the existing team member when the email already has this role', async () => {
    people({ registered: true, inRole: { id: 's9', code: 'SP-0042', name: 'Ana Reyes' } })
    const result = await validateStaffEmail(role, 'ana@example.com')
    expect(result).toMatchObject({ ok: false, reason: 'duplicate_role', conflict: { code: 'SP-0042' } })
    expect((result as any).message).toContain('SP-0042')
    expect((result as any).message).toContain(roleMeta(role)!.label)
  })

  it('lets a member keep their own email when editing', async () => {
    people({ registered: true })
    await validateStaffEmail(role, 'ana@example.com', 's9')
    const roleQuery = supabase.from.mock.results.find((r: any, i: number) => supabase.from.mock.calls[i][0] !== 'profiles')!.value
    expect(roleQuery.neq).toHaveBeenCalledWith('id', 's9')
  })
})

describe('searchProfiles', () => {
  it('needs at least two characters', async () => {
    expect(await searchProfiles('a')).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns tidy profiles', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: [{ id: 'p1', email: 'ana@example.com', full_name: null, avatar_url: undefined }], error: null }))
    expect(await searchProfiles(' ana ')).toEqual([{ id: 'p1', email: 'ana@example.com', full_name: '', avatar_url: null }])
    expect(supabase.rpc).toHaveBeenCalledWith('search_profiles', { p_query: 'ana', p_limit: 10 })
  })

  it('gives nothing, quietly, when the search is cancelled or fails', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: aborted }))
    expect(await searchProfiles('ana')).toEqual([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: new Error('down') }))
    expect(await searchProfiles('ana')).toEqual([])
  })
})

describe('roleMeta', () => {
  it('describes each staff role, and nothing else', () => {
    for (const [role, meta] of Object.entries(STAFF_ROLES)) {
      expect(roleMeta(role)).toBe(meta)
      expect(meta).toMatchObject({ table: expect.any(String), label: expect.any(String) })
    }
    expect(roleMeta('owner')).toBeNull()
  })
})
