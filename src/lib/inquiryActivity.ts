// src/lib/inquiryActivity.ts
// The timeline on each inquiry (table inquiry_activities): stage moves, with
// an optional note on how it went, and notes added any time. One table for
// both inquiry boards; `board` picks which inquiry table a row belongs to.
// Who wrote a row and when are filled in by the database.
import { supabase } from './supabase'

export type InquiryBoard = 'property' | 'interior'

const INQUIRY_COLUMN: Record<InquiryBoard, string> = {
  property: 'property_inquiry_id',
  interior: 'interior_inquiry_id',
}

export type ActivityEntry = {
  kind?: 'note' | 'stage'
  stage?: string | null
  from_stage?: string | null
  tag?: string | null
  body?: string | null
}

/** The inquiry a row belongs to. */
export function activityInquiryId(board: InquiryBoard, row) {
  return row?.[INQUIRY_COLUMN[board]] ?? null
}

/** Every row on one board, newest first. */
export async function listActivities(board: InquiryBoard, { limit = 1000 } = {}) {
  const { data, error } = await supabase
    .from('inquiry_activities')
    .select('*')
    .not(INQUIRY_COLUMN[board], 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function addActivity(board: InquiryBoard, inquiryId, entry: ActivityEntry) {
  const body = entry.body?.trim() || null
  const { data, error } = await supabase
    .from('inquiry_activities')
    .insert({
      [INQUIRY_COLUMN[board]]: inquiryId,
      kind: entry.kind || 'note',
      stage: entry.stage ?? null,
      from_stage: entry.from_stage ?? null,
      tag: entry.tag || null,
      body: body ? body.slice(0, 2000) : null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteActivity(id) {
  const { error } = await supabase.from('inquiry_activities').delete().eq('id', id)
  if (error) throw error
}
