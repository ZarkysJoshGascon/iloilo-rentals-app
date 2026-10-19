import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))

const OCT_1 = '2026-10-01T00:00:00Z'
const OCT_5 = '2026-10-05T00:00:00Z'

// Storage listings: files have an id, folders don't.
const file = (name: string, updated = OCT_1, created = updated) => ({ id: `id-${name}`, name, updated_at: updated, created_at: created })
const folder = (name: string) => ({ id: null, name })
// The address the fake storage gives a file, with the version that changes when it's replaced.
const url = (path: string, updated = OCT_1) => `https://public.test/hero-images/${path}?v=${Date.parse(updated)}`

type Listing = unknown[] | Error | Promise<unknown>

/** A listing that answers when the test says so. */
function later() {
  let answer!: (files: unknown[]) => void
  const listing = new Promise((resolve) => { answer = (files) => resolve({ data: files, error: null }) })
  return { listing, answer }
}

// The module remembers its listings for the session, so each test loads its
// own copy. The fake client is the one the module gets (Vitest keeps a mocked
// module across resetModules), so it's fetched the same way.
async function load(listings: Record<string, Listing>) {
  vi.resetModules()
  const { supabase } = await import('@/lib/supabase')
  const storage = (supabase as any).storage.from('hero-images')
  storage.list.mockImplementation((path: string) => {
    const entry = listings[path]
    if (entry instanceof Promise) return entry
    return Promise.resolve(entry instanceof Error ? { data: null, error: entry } : { data: entry ?? [], error: null })
  })
  return { storage, ...(await import('@/lib/api/siteImages')) }
}

describe('homepage photo spots', () => {
  it('load nothing until the folder is listed, then the upload, with its version in the address', async () => {
    const { listing, answer } = later()
    const { storage, useSitePhotos, spot } = await load({ home: listing })
    const hero = spot('hero', '/hero-placeholder.jpg')
    const { result } = renderHook(() => useSitePhotos())

    expect(result.current(hero)).toEqual({ src: undefined, fallback: '/hero-placeholder.jpg' })
    answer([file('hero.jpg', OCT_5)])
    await waitFor(() => expect(result.current(hero).src).toBe(url('home/hero.jpg', OCT_5)))
    expect(result.current(hero).fallback).toBe('/hero-placeholder.jpg')
    expect(storage.getPublicUrl).toHaveBeenCalledWith('home/hero.jpg', { transform: { width: 1200, quality: 75, resize: 'contain' } })
  })

  it('show the newest upload, whatever its file type', async () => {
    const { useSitePhotos, spot } = await load({ home: [file('card-buy.jpg', OCT_1), file('card-buy.png', OCT_5)] })
    const { result } = renderHook(() => useSitePhotos())
    await waitFor(() => expect(result.current(spot('card-buy', null)).src).toBe(url('home/card-buy.png', OCT_5)))
  })

  it('show the placeholder until uploaded, which can be another spot\'s photo', async () => {
    const { useSitePhotos, spot } = await load({ home: [file('hero.jpg')] })
    const { result } = renderHook(() => useSitePhotos())
    await waitFor(() => expect(result.current(spot('hero', null)).src).toBeDefined())

    expect(result.current(spot('card-sell', '/sell.jpg'))).toEqual({ src: '/sell.jpg' })
    expect(result.current(spot('card-rent', spot('hero', '/hero.jpg')))).toEqual({ src: url('home/hero.jpg') })
  })

  it('ask for a smaller copy of small photos', async () => {
    const { storage, useSitePhotos, spot } = await load({ home: [file('logo-strip.jpg')] })
    const { result } = renderHook(() => useSitePhotos())
    await waitFor(() => expect(result.current(spot('logo-strip', null, 400)).src).toBeDefined())
    expect(storage.getPublicUrl).toHaveBeenLastCalledWith('home/logo-strip.jpg', { transform: { width: 400, quality: 75, resize: 'contain' } })
  })

  it('still try the photo when the folder can\'t be listed, keeping the placeholder behind it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { useSitePhotos, spot } = await load({ home: new Error('network down') })
    const { result } = renderHook(() => useSitePhotos())
    await waitFor(() => expect(result.current(spot('hero', '/hero.jpg'))).toEqual({
      src: 'https://public.test/hero-images/home/hero.jpg', fallback: '/hero.jpg',
    }))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not list home/'), expect.any(Error))
  })

  it('let the loading screen wait until the page\'s photos are known', async () => {
    const { listing, answer } = later()
    const { useSitePhotos, whenSitePhotosListed } = await load({ home: listing })
    renderHook(() => useSitePhotos())
    let ready = false
    void whenSitePhotosListed().then(() => { ready = true })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(ready).toBe(false)
    answer([])
    await waitFor(() => expect(ready).toBe(true))
  })
})

describe('the reviews gallery', () => {
  it('shows every screenshot, newest first, as a thumbnail and a full-size copy', async () => {
    const { storage, useSiteGallery, REVIEWS } = await load({
      'home/reviews': [file('a.jpg', OCT_1), file('b.webp', OCT_5), file('notes.txt'), folder('old')],
    })
    const { result } = renderHook(() => useSiteGallery(REVIEWS))
    expect(result.current).toBeUndefined() // still listing

    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(result.current).toEqual([
      { key: 'b.webp', thumb: url('home/reviews/b.webp', OCT_5), full: url('home/reviews/b.webp', OCT_5) },
      { key: 'a.jpg', thumb: url('home/reviews/a.jpg'), full: url('home/reviews/a.jpg') },
    ])
    expect(storage.getPublicUrl).toHaveBeenCalledWith('home/reviews/b.webp', { transform: { height: 720, quality: 80, resize: 'contain' } })
    expect(storage.getPublicUrl).toHaveBeenCalledWith('home/reviews/b.webp', { transform: { width: 1600, quality: 85, resize: 'contain' } })
  })

  it('is empty, not broken, when the folder can\'t be listed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { useSiteGallery, REVIEWS } = await load({ 'home/reviews': new Error('network down') })
    const { result } = renderHook(() => useSiteGallery(REVIEWS))
    await waitFor(() => expect(result.current).toEqual([]))
  })
})

describe('interior projects', () => {
  const STUDIO = '1 Studio makeover - Megaworld Tower'
  const CONDO = '2 Condo - Ayala'
  const PENTHOUSE = '10 Penthouse'
  const LIVING = '01 Living room - Stepping in from the door'

  it('are read in number order, with rooms, captions, depth maps, the floor plan and tour markers', async () => {
    const tour = { type: 'condo', facts: '35 sqm floor area', stops: { '02 Bedroom.jpg': { x: 0.5, y: 0.25, note: 'Queen bed by the window' } } }
    const fetch = vi.fn(async () => new Response(JSON.stringify(tour)))
    vi.stubGlobal('fetch', fetch)
    const { useInteriorProjects } = await load({
      // Listed in name order, where 10 comes before 2.
      interior: [folder(PENTHOUSE), folder(STUDIO), folder(CONDO), folder('3 Empty')],
      [`interior/${STUDIO}`]: [
        file('02 Bedroom.jpg'), file(`${LIVING}.jpg`), file(`${LIVING}.depth.png`),
        file('plan.png'), file('tour.json'), file('.emptyFolderPlaceholder'),
      ],
      [`interior/${CONDO}`]: [file('01 kitchen_view.jpg')],
      [`interior/${PENTHOUSE}`]: [file('1 Terrace.jpg')],
      'interior/3 Empty': [],
    })

    const { result } = renderHook(() => useInteriorProjects())
    expect(result.current).toBeUndefined() // loading
    await waitFor(() => expect(result.current).toBeDefined())

    expect(fetch).toHaveBeenCalledWith(url(`interior/${STUDIO}/tour.json`))
    expect(result.current).toEqual([
      {
        key: STUDIO,
        title: 'Studio makeover',
        location: '35 sqm floor area', // the tour's facts win over the folder's caption
        type: 'condo',
        plan: url(`interior/${STUDIO}/plan.png`),
        shots: [
          { key: `${LIVING}.jpg`, src: url(`interior/${STUDIO}/${LIVING}.jpg`), depth: url(`interior/${STUDIO}/${LIVING}.depth.png`),
            room: 'Living room', note: 'Stepping in from the door', marker: null },
          { key: '02 Bedroom.jpg', src: url(`interior/${STUDIO}/02 Bedroom.jpg`), depth: null,
            room: 'Bedroom', note: 'Queen bed by the window', marker: { x: 0.5, y: 0.25 } },
        ],
      },
      {
        key: CONDO, title: 'Condo', location: 'Ayala', type: null, plan: null,
        shots: [{ key: '01 kitchen_view.jpg', src: url(`interior/${CONDO}/01 kitchen_view.jpg`), depth: null, room: 'Kitchen view', note: '', marker: null }],
      },
      {
        key: PENTHOUSE, title: 'Penthouse', location: '', type: null, plan: null,
        shots: [{ key: '1 Terrace.jpg', src: url(`interior/${PENTHOUSE}/1 Terrace.jpg`), depth: null, room: 'Terrace', note: '', marker: null }],
      },
      // "3 Empty" has no photos yet, so it isn't shown.
    ])
  })

  it('still show when a tour can\'t be read, without its extras', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const { useInteriorProjects } = await load({
      interior: [folder(CONDO)],
      [`interior/${CONDO}`]: [file('01 Kitchen.jpg'), file('tour.json')],
    })
    const { result } = renderHook(() => useInteriorProjects())
    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(result.current![0]).toMatchObject({ location: 'Ayala', type: null, shots: [{ note: '', marker: null }] })
  })

  it('are none, not an error, when the folder can\'t be listed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { useInteriorProjects } = await load({ interior: new Error('network down') })
    const { result } = renderHook(() => useInteriorProjects())
    await waitFor(() => expect(result.current).toEqual([]))
    expect(warn).toHaveBeenCalledWith('[siteImages] could not list interior projects', expect.any(Error))
  })

  it('are listed once a session, however many pages show them', async () => {
    const { storage, useInteriorProjects } = await load({ interior: [] })
    const first = renderHook(() => useInteriorProjects())
    await waitFor(() => expect(first.result.current).toEqual([]))
    const second = renderHook(() => useInteriorProjects())
    expect(second.result.current).toEqual([]) // straight away, no loading
    expect(storage.list).toHaveBeenCalledTimes(1)
  })
})
