import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeCleaning, makePhoto } from '../../factories'

vi.mock('@/lib/supabase', () => import('../../supabaseMock'))
// Shrinking a photo needs a real browser (tests/e2e/photos.spec.ts); here a
// prepared photo is a small JPEG blob.
vi.mock('@/lib/images', () => ({
  PHOTO: { maxSide: 1600, quality: 0.75 },
  preparePhoto: vi.fn(async (file: Blob) => new Blob([file], { type: 'image/jpeg' })),
}))

const { supabase, queryBuilder, rpcResult, bucket } = await import('../../supabaseMock')
const images = await import('@/lib/images')
const {
  uploadCleaningPhoto, getSignedUrls, addPhotosToCleaning, removePhotoFromCleaning, deleteCleaning,
  submitCleaning, approveAndPayCleaning, updateLaundryPayment, purgeCleaningPhotos, parseInventory,
} = await import('@/lib/api/cleanings')

const photos = () => bucket('cleaning-photos')
const file = (name = 'IMG_0001.HEIC.jpg') => new File(['raw'], name, { type: 'image/jpeg' })
const rpcArgs = () => supabase.rpc.mock.calls.at(-1)![1]

// Each table call gets its own builder, so a test can look at what was asked.
let tables: { table: string; builder: any }[]
function onTable(table: string, result: { data: any; error: any }) {
  supabase.from.mockImplementation((t: string) => {
    const builder = queryBuilder(t === table ? result : { data: [], error: null })
    tables.push({ table: t, builder })
    return builder
  })
}
beforeEach(() => {
  tables = []
  onTable('', { data: null, error: null })
})

describe('uploadCleaningPhoto', () => {
  it('stores the shrunk JPEG, not the original, under the cleaning and category, cached for a year', async () => {
    const original = file()
    const photo = await uploadCleaningPhoto({ cleaningId: 'cl1', file: original, category: 'before' })

    expect(images.preparePhoto).toHaveBeenCalledWith(original, images.PHOTO)
    const shrunk = await vi.mocked(images.preparePhoto).mock.results[0].value
    expect(photo.path).toMatch(/^cl1\/before\/[a-z0-9]{16}\.jpg$/)
    expect(photos().upload).toHaveBeenCalledWith(photo.path, expect.anything(), { cacheControl: '31536000', upsert: false, contentType: 'image/jpeg' })
    expect(photos().upload.mock.calls[0][1]).toBe(shrunk) // that very file: blobs all look alike to toEqual
    expect(photo).toMatchObject({ size: shrunk.size, uploaded_at: expect.any(String) })
  })

  it('gives every photo its own name', async () => {
    const a = await uploadCleaningPhoto({ cleaningId: 'cl1', file: file(), category: 'after' })
    const b = await uploadCleaningPhoto({ cleaningId: 'cl1', file: file(), category: 'after' })
    expect(a.path).not.toBe(b.path)
  })

  it('refuses an unknown category before uploading anything', async () => {
    await expect(uploadCleaningPhoto({ cleaningId: 'cl1', file: file(), category: 'selfies' })).rejects.toThrow('Invalid photo category')
    expect(photos().upload).not.toHaveBeenCalled()
  })

  it('passes an upload failure on', async () => {
    photos().upload.mockResolvedValue({ data: null, error: new Error('Bucket full') })
    await expect(uploadCleaningPhoto({ cleaningId: 'cl1', file: file(), category: 'report' })).rejects.toThrow('Bucket full')
  })
})

describe('getSignedUrls', () => {
  it('maps each path to its signed address, skipping blanks', async () => {
    expect(await getSignedUrls(['a.jpg', null, 'b.jpg'])).toEqual({
      'a.jpg': 'https://signed.test/cleaning-photos/a.jpg',
      'b.jpg': 'https://signed.test/cleaning-photos/b.jpg',
    })
    expect(photos().createSignedUrls).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], 3600)
  })

  it('asks nothing for no paths', async () => {
    expect(await getSignedUrls([])).toEqual({})
    expect(photos().createSignedUrls).not.toHaveBeenCalled()
  })
})

describe('adding and removing photos (CRM)', () => {
  it('adds new photos after the ones already there, in order', async () => {
    const cleaning = makeCleaning({ id: 'cl1', photos_after: [makePhoto('cl1/after/old.jpg')] })
    const { uploaded, next } = await addPhotosToCleaning(cleaning, 'after', [file('1.jpg'), file('2.jpg')])

    expect(uploaded).toHaveLength(2)
    expect(next.map((p: any) => p.path)).toEqual(['cl1/after/old.jpg', uploaded[0].path, uploaded[1].path])
    const update = tables.find((t) => t.table === 'cleanings')!.builder.update
    expect(update).toHaveBeenCalledWith({ photos_after: next })
  })

  it('removes a photo from the cleaning, then from storage', async () => {
    const cleaning = makeCleaning({ id: 'cl1', photos_before: [makePhoto('a.jpg'), makePhoto('b.jpg')] })
    await removePhotoFromCleaning(cleaning, 'before', 'a.jpg')
    expect(tables[0].builder.update).toHaveBeenCalledWith({ photos_before: [makePhoto('b.jpg')] })
    expect(photos().remove).toHaveBeenCalledWith(['a.jpg'])
  })

  it('keeps the cleaning updated even if the file can\'t be deleted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    photos().remove.mockResolvedValue({ data: null, error: new Error('gone already') })
    const cleaning = makeCleaning({ id: 'cl1', photos_before: [makePhoto('a.jpg')] })
    await expect(removePhotoFromCleaning(cleaning, 'before', 'a.jpg')).resolves.toBeUndefined()
  })

  it('refuses an unknown photo set', async () => {
    await expect(addPhotosToCleaning(makeCleaning(), 'amenities_used', [file()])).rejects.toThrow('Invalid photo category')
  })
})

describe('deleteCleaning', () => {
  it('deletes every photo of the cleaning, then the cleaning', async () => {
    onTable('cleanings', {
      data: {
        photos_before: [makePhoto('b1.jpg')], photos_after: [makePhoto('a1.jpg'), makePhoto('a2.jpg')], photos_report: [],
        amenities_used_photo: makePhoto('am.jpg'), amenities_replaced_photo: null, laundry_used_photo: null, laundry_replaced_photo: makePhoto('lr.jpg'),
      },
      error: null,
    })
    await deleteCleaning('cl1')
    expect(photos().remove).toHaveBeenCalledWith(['b1.jpg', 'a1.jpg', 'a2.jpg', 'am.jpg', 'lr.jpg'])
    const del = tables.at(-1)!.builder
    expect(del.delete).toHaveBeenCalled()
    expect(del.eq).toHaveBeenCalledWith('id', 'cl1')
  })

  it('still deletes the cleaning when the photos can\'t be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    supabase.from.mockImplementationOnce(() => { throw new Error('network') })
    await expect(deleteCleaning('cl1')).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })
})

describe('submitCleaning (housekeeper)', () => {
  const kept = [makePhoto('cl1/before/kept.jpg')]

  it('uploads new photos and sends the full set: kept ones first', async () => {
    const cleaning = makeCleaning({ id: 'cl1', photos_before: [...kept, makePhoto('cl1/before/removed.jpg')] })
    await submitCleaning({ cleaning, newPhotosBefore: [file()], keepPhotosBefore: kept, notes: '' })

    const args = rpcArgs()
    expect(supabase.rpc).toHaveBeenCalledWith('housekeeper_submit_cleaning', expect.any(Object))
    expect(args.p_cleaning_id).toBe('cl1')
    expect(args.p_photos_before.map((p: any) => p.path)).toEqual(['cl1/before/kept.jpg', expect.stringMatching(/^cl1\/before\//)])
  })

  it('keeps the photos already on the cleaning when no list of kept ones is given', async () => {
    const cleaning = makeCleaning({ id: 'cl1', photos_after: kept })
    await submitCleaning({ cleaning, notes: '' })
    expect(rpcArgs().p_photos_after).toEqual(kept)
  })

  it('replaces a single photo and deletes the old file', async () => {
    const cleaning = makeCleaning({ id: 'cl1', laundry_used_photo: makePhoto('cl1/laundry_used/old.jpg') })
    await submitCleaning({ cleaning, newLaundryUsedPhoto: file(), notes: '' })
    expect(rpcArgs().p_laundry_used_photo.path).toMatch(/^cl1\/laundry_used\//)
    expect(photos().remove).toHaveBeenCalledWith(['cl1/laundry_used/old.jpg'])
  })

  it('cleans up item lists, laundry payment and notes before sending', async () => {
    await submitCleaning({
      cleaning: makeCleaning({ id: 'cl1' }),
      amenitiesUsedItems: [{ name: 'Coffee', quantity: '2' }, { name: '', quantity: 1 }, null],
      laundryPaymentAmount: '450',
      laundryPaymentMethod: '  GCash  ',
      laundryPaymentReference: '   ',
      notes: '  Towel stain in bedroom  ',
    })
    expect(rpcArgs()).toMatchObject({
      p_amenities_used_items: [{ name: 'Coffee', quantity: 2, note: '' }],
      p_laundry_payment_amount: 450,
      p_laundry_payment_method: 'GCash',
      p_laundry_payment_reference: null,
      p_notes: 'Towel stain in bedroom',
    })
  })

  it('sends no laundry payment when none was entered', async () => {
    await submitCleaning({ cleaning: makeCleaning(), laundryPaymentAmount: 0, laundryPaymentMethod: '', notes: '' })
    expect(rpcArgs()).toMatchObject({ p_laundry_payment_amount: null, p_laundry_payment_method: null, p_notes: null })
  })

  it('passes a refusal from the database on (e.g. already approved)', async () => {
    supabase.rpc.mockReturnValue(rpcResult({ data: null, error: new Error('This cleaning has been approved') }))
    await expect(submitCleaning({ cleaning: makeCleaning(), notes: '' })).rejects.toThrow('This cleaning has been approved')
  })
})

describe('payments', () => {
  it('approves and pays with tidy details', async () => {
    await approveAndPayCleaning({ cleaningId: 'cl1', amount: '500', method: ' Cash ', reference: '', note: ' Thanks ' })
    expect(supabase.rpc).toHaveBeenCalledWith('admin_approve_and_pay_cleaning', {
      p_cleaning_id: 'cl1', p_payment_amount: 500, p_payment_method: 'Cash', p_payment_reference: null, p_payment_note: 'Thanks',
    })
  })

  it.each([
    [{ cleaningId: '', amount: 500, method: 'Cash' }, 'Missing cleaning'],
    [{ cleaningId: 'cl1', amount: 0, method: 'Cash' }, 'Amount must be greater than 0'],
    [{ cleaningId: 'cl1', amount: -5, method: 'Cash' }, 'Amount must be greater than 0'],
    [{ cleaningId: 'cl1', amount: 500, method: '  ' }, 'Payment method is required'],
  ])('refuses %o: %s', async (input, message) => {
    await expect(approveAndPayCleaning(input as any)).rejects.toThrow(message)
    await expect(updateLaundryPayment(input as any)).rejects.toThrow(message)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('records a laundry payment', async () => {
    await updateLaundryPayment({ cleaningId: 'cl1', amount: 250, method: 'GCash', reference: ' 1234 ', note: '' })
    expect(supabase.rpc).toHaveBeenCalledWith('update_laundry_payment', {
      p_cleaning_id: 'cl1', p_amount: 250, p_method: 'GCash', p_reference: '1234', p_note: null,
    })
  })
})

describe('purgeCleaningPhotos (after approval)', () => {
  const withPhotos = {
    photos_before: [makePhoto('b.jpg')], photos_after: [makePhoto('a.jpg')], photos_report: null,
    amenities_used_photo: null, amenities_replaced_photo: makePhoto('ar.jpg'), laundry_used_photo: null, laundry_replaced_photo: null,
  }

  it('deletes the files and clears every photo on the cleaning', async () => {
    onTable('cleanings', { data: withPhotos, error: null })
    expect(await purgeCleaningPhotos('cl1')).toEqual({ deleted: 3 })
    expect(photos().remove).toHaveBeenCalledWith(['b.jpg', 'a.jpg', 'ar.jpg'])
    expect(tables.at(-1)!.builder.update).toHaveBeenCalledWith({
      photos_before: [], photos_after: [], photos_report: [],
      amenities_used_photo: null, amenities_replaced_photo: null, laundry_used_photo: null, laundry_replaced_photo: null,
    })
  })

  it('still clears the cleaning when some files couldn\'t be deleted (so it never retries forever)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    onTable('cleanings', { data: withPhotos, error: null })
    photos().remove.mockResolvedValue({ data: null, error: new Error('partial') })
    expect(await purgeCleaningPhotos('cl1')).toEqual({ deleted: 3 })
    expect(tables.at(-1)!.builder.update).toHaveBeenCalled()
  })

  it('does nothing when there are no photos, or no cleaning', async () => {
    onTable('cleanings', { data: { photos_before: [], photos_after: [], photos_report: [] }, error: null })
    expect(await purgeCleaningPhotos('cl1')).toEqual({ deleted: 0 })
    expect(await purgeCleaningPhotos(null)).toEqual({ deleted: 0 })
    expect(photos().remove).not.toHaveBeenCalled()
  })
})

describe('parseInventory', () => {
  it('keeps named items with whole quantities, trimmed to size', () => {
    expect(parseInventory([
      { name: 'Bath towel', quantity: '3' },
      { name: 'x'.repeat(100), quantity: 1, note: 'n'.repeat(300) },
      { name: '', quantity: 2 },
      { quantity: 1 },
      'junk',
      null,
    ])).toEqual([
      { name: 'Bath towel', quantity: 3, note: '' },
      { name: 'x'.repeat(80), quantity: 1, note: 'n'.repeat(200) },
    ])
  })

  it('is empty for anything that isn\'t a list', () => {
    expect(parseInventory(null)).toEqual([])
    expect(parseInventory({ name: 'x' })).toEqual([])
  })
})
