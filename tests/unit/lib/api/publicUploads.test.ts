import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const { supabase, bucket } = await import('../../supabaseMock')
const { signedInFormHeaders, uploadPublicFormPhoto } = await import('@/lib/api/publicUploads')

const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' })
const respond = (status: number, body: unknown) => vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))

describe('signedInFormHeaders', () => {
  it('sends the visitor\'s sign-in token', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'visitor-token' } } })
    expect(await signedInFormHeaders()).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer visitor-token' })
  })

  it('asks the visitor to sign in first', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    await expect(signedInFormHeaders()).rejects.toThrow('Please sign in with Google first.')
  })
})

describe('uploadPublicFormPhoto', () => {
  it('gets a one-time link for the form, uploads the JPEG with it, and returns its public address', async () => {
    const fetch = respond(200, { path: 'inquiries/abc.jpg', token: 'one-time' })
    vi.stubGlobal('fetch', fetch)

    const result = await uploadPublicFormPhoto('property', jpeg)

    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/functions\/v1\/inquiry-upload-url$/), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ form: 'property' }),
    }))
    expect(bucket('property-inquiry-images').uploadToSignedUrl)
      .toHaveBeenCalledWith('inquiries/abc.jpg', 'one-time', jpeg, { contentType: 'image/jpeg', cacheControl: '31536000' })
    expect(result).toEqual({ path: 'inquiries/abc.jpg', url: 'https://public.test/property-inquiry-images/inquiries/abc.jpg' })
  })

  it('uses the interior design bucket for that form', async () => {
    vi.stubGlobal('fetch', respond(200, { path: 'p.jpg', token: 't' }))
    await uploadPublicFormPhoto('interior', jpeg)
    expect(bucket('interior-design-images').uploadToSignedUrl).toHaveBeenCalled()
  })

  it('shows the server\'s reason when no link is given (limits, sign-in)', async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'Too many photos today. Try again tomorrow.' }))
    await expect(uploadPublicFormPhoto('property', jpeg)).rejects.toThrow('Too many photos today. Try again tomorrow.')
    expect(bucket('property-inquiry-images').uploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('fails clearly when the upload itself fails', async () => {
    vi.stubGlobal('fetch', respond(200, { path: 'p.jpg', token: 't' }))
    bucket('property-inquiry-images').uploadToSignedUrl.mockResolvedValue({ data: null, error: new Error('Upload expired') })
    await expect(uploadPublicFormPhoto('property', jpeg)).rejects.toThrow('Upload expired')
  })
})
