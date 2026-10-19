// The app's own data functions (src/lib/api), run for real against the live
// backend while signed out. Lists must come back empty (not crash), and
// anything that needs staff or a sign-in must refuse with a clear message.
// Nothing is saved or sent.
import { describe, expect, it } from 'vitest'
import { listPastGuests, listCampaigns, getCampaignDetails, previewPromo, sendPromoCampaign, sendBookingConfirmation, listBookingConfirmations } from '@/lib/api/email'
import { listInquiries, submitPropertyInquiry } from '@/lib/api/inquiries'
import { listUnits } from '@/lib/api/registry'
import { listCleanings } from '@/lib/api/cleanings'

const NO_ID = '00000000-0000-0000-0000-000000000000'

describe('lists come back empty for a signed-out visitor', () => {
  it('past guests for campaigns', async () => {
    expect(await listPastGuests()).toEqual([])
  })
  it('campaign history', async () => {
    expect(await listCampaigns()).toEqual([])
  })
  it('a campaign\'s details', async () => {
    expect(await getCampaignDetails(NO_ID)).toEqual({ html: '', replyTo: null, recipients: [] })
  })
  it('a booking\'s confirmation emails', async () => {
    expect(await listBookingConfirmations(NO_ID)).toEqual([])
  })
  it('inquiries', async () => {
    expect(await listInquiries()).toEqual([])
  })
  it('units (registry pipeline): the view is closed to visitors outright', async () => {
    await expect(listUnits()).rejects.toThrow(/permission denied/i)
  })
  it('cleanings', async () => {
    expect(await listCleanings()).toEqual([])
  })
})

describe('staff actions refuse without a sign-in', () => {
  it('booking confirmation email', async () => {
    await expect(sendBookingConfirmation(NO_ID)).rejects.toThrow('Not signed in')
  })
  it('booking confirmation needs a booking', async () => {
    await expect(sendBookingConfirmation('')).rejects.toThrow('Missing booking id')
  })
  it('campaign preview and send', async () => {
    await expect(previewPromo({ subject: 'x' })).rejects.toThrow('Not signed in')
    await expect(sendPromoCampaign({ subject: 'x', recipients: [] })).rejects.toThrow('Not signed in')
  })
  it('property inquiry asks for a Google sign-in', async () => {
    await expect(submitPropertyInquiry({ owner_name: 'Test', owner_email: 'test@example.com' })).rejects.toThrow(/sign in/i)
  })
})
