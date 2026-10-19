import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))
vi.mock('@/lib/images', () => ({ preparePhoto: vi.fn(async () => new Blob(['small'], { type: 'image/jpeg' })) }))
vi.mock('@/lib/api/publicUploads', () => ({
  uploadPublicFormPhoto: vi.fn(async () => ({ path: 'inquiries/a.jpg', url: 'https://public.test/a.jpg' })),
  signedInFormHeaders: vi.fn(async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer visitor-token' })),
}))

const { supabase, queryBuilder } = await import('../../supabaseMock')
const images = await import('@/lib/images')
const uploads = await import('@/lib/api/publicUploads')
const { uploadInquiryImage, submitPropertyInquiry, listInquiries, updateInquiry, deleteInquiry } = await import('@/lib/api/inquiries')

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>
const respond = (status: number, body: unknown) => vi.fn<Fetch>(async () => new Response(JSON.stringify(body), { status }))

describe('uploadInquiryImage', () => {
  it('shrinks the photo, then uploads it through the form\'s one-time link', async () => {
    const photo = new File(['big'], 'IMG_0001.jpg', { type: 'image/jpeg' })
    expect(await uploadInquiryImage(photo)).toEqual({ path: 'inquiries/a.jpg', url: 'https://public.test/a.jpg' })
    expect(images.preparePhoto).toHaveBeenCalledWith(photo, { maxWidth: 1400, maxHeight: 2400, quality: 0.85 })
    const shrunk = await vi.mocked(images.preparePhoto).mock.results[0].value
    expect(uploads.uploadPublicFormPhoto).toHaveBeenCalledWith('property', expect.anything())
    expect(vi.mocked(uploads.uploadPublicFormPhoto).mock.calls[0][1]).toBe(shrunk)
  })

  it('refuses nothing', async () => {
    await expect(uploadInquiryImage(null)).rejects.toThrow('No file')
    expect(uploads.uploadPublicFormPhoto).not.toHaveBeenCalled()
  })
})

describe('submitPropertyInquiry', () => {
  it('sends the form as the signed-in visitor, filling in what was left blank', async () => {
    const fetch = respond(200, { ok: true, id: 'inq-1' })
    vi.stubGlobal('fetch', fetch)

    expect(await submitPropertyInquiry({ owner_name: 'Maria Santos', owner_email: 'maria@example.com', bedrooms: 0, images: ['a.jpg'] }))
      .toEqual({ ok: true, id: 'inq-1' })

    const [url, init] = fetch.mock.calls[0]
    expect(url).toMatch(/\/functions\/v1\/submit-property-inquiry$/)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer visitor-token')
    expect(JSON.parse(init.body)).toEqual({
      owner_name: 'Maria Santos', owner_email: 'maria@example.com', owner_phone: '', property_type: '',
      building: '', location: '', bedrooms: 0, bathrooms: '', square_meters: '', price_per_night: '',
      inquiry_type: 'manage', message: '', images: ['a.jpg'], website_url: '', cf_turnstile_token: '',
    })
  })

  it('sends no images unless they come as a list', async () => {
    const fetch = respond(200, { ok: true })
    vi.stubGlobal('fetch', fetch)
    await submitPropertyInquiry({ owner_name: 'M', owner_email: 'm@example.com', images: 'a.jpg' })
    expect(JSON.parse(fetch.mock.calls[0][1].body).images).toEqual([])
  })

  it('shows the server\'s reason, or the status when it gives none', async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'Too many inquiries, try again in an hour' }))
    await expect(submitPropertyInquiry({})).rejects.toThrow('Too many inquiries, try again in an hour')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502 })))
    await expect(submitPropertyInquiry({})).rejects.toThrow('Submission failed (502)')
  })
})

describe('inquiries in the CRM', () => {
  it('lists the newest first, 500 at most unless asked', async () => {
    const builder = queryBuilder({ data: [{ id: 'i2' }, { id: 'i1' }], error: null })
    supabase.from.mockReturnValue(builder)
    expect(await listInquiries()).toEqual([{ id: 'i2' }, { id: 'i1' }])
    expect(supabase.from).toHaveBeenCalledWith('property_inquiries')
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(builder.limit).toHaveBeenCalledWith(500)

    await listInquiries({ limit: 20 })
    expect(builder.limit).toHaveBeenLastCalledWith(20)
  })

  it('gives an empty list for no data, and passes errors on', async () => {
    supabase.from.mockReturnValue(queryBuilder({ data: null, error: null }))
    expect(await listInquiries()).toEqual([])
    const refused = { code: '42501', message: 'permission denied' }
    supabase.from.mockReturnValue(queryBuilder({ data: null, error: refused }))
    await expect(listInquiries()).rejects.toBe(refused)
  })

  it('tidies a change before saving it', async () => {
    const builder = queryBuilder({ data: { id: 'i1', owner_email: 'maria@example.com' }, error: null })
    supabase.from.mockReturnValue(builder)
    expect(await updateInquiry('i1', { owner_email: '  Maria@Example.COM ' })).toEqual({ id: 'i1', owner_email: 'maria@example.com' })
    expect(builder.update).toHaveBeenCalledWith({ owner_email: 'maria@example.com' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'i1')
  })

  it('refuses a bad email before saving anything', async () => {
    const builder = queryBuilder({ data: null, error: null })
    supabase.from.mockReturnValue(builder)
    await expect(updateInquiry('i1', { owner_email: 'not an email' })).rejects.toThrow('Owner email: enter a valid email address')
    expect(builder.update).not.toHaveBeenCalled()
  })

  it('deletes by id, and passes errors on', async () => {
    const builder = queryBuilder({ data: null, error: null })
    supabase.from.mockReturnValue(builder)
    await deleteInquiry('i1')
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('id', 'i1')

    const refused = { code: '42501', message: 'permission denied' }
    supabase.from.mockReturnValue(queryBuilder({ data: null, error: refused }))
    await expect(deleteInquiry('i1')).rejects.toBe(refused)
  })
})
