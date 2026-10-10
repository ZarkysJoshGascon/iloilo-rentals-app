// supabase/functions/backup-to-sheets/index.ts
// Force-capitalizes tab names, deletes orphans, styles every tab.
// Contracts tab now includes a "Contract PDF" column with a signed URL.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const GOOGLE_SA_JSON        = Deno.env.get('GOOGLE_SERVICE_ACCOUNT') || ''
const SHEET_ID              = Deno.env.get('BACKUP_SHEET_ID') || ''

const OWNER_SPLIT   = 0.75
const COMPANY_SPLIT = 0.25
const PM_OF_COMPANY = 0.35
const NO_CONTRACT = '(no contract)'

const CONTRACT_PDF_BUCKET = 'contract-pdfs'
const CONTRACT_PDF_SIGNED_TTL = 60 * 60 * 24 * 7 // 7 days

// Tabs the function owns. Everything else in the sheet gets deleted on each run.
const OWNED_TABS = [
  'Bookings',
  'Contracts',
  'Accounting',
  'Cleanings',
  'Registry',
  'Team',
  'PM Contracts',
  'Inquiries',
  'Campaigns',
]
const OWNED_LOOKUP = new Set(OWNED_TABS.map((t) => t.toLowerCase()))
const META_TAB = '_meta'

const TAB_COLORS: Record<string, { red: number; green: number; blue: number }> = {
  'Bookings':      { red: 0.176, green: 0.337, blue: 0.557 },
  'Contracts':     { red: 0.784, green: 0.129, blue: 0.129 },
  'Accounting':    { red: 0.086, green: 0.361, blue: 0.192 },
  'Cleanings':     { red: 0.133, green: 0.596, blue: 0.341 },
  'Registry':      { red: 0.545, green: 0.318, blue: 0.784 },
  'Team':          { red: 0.176, green: 0.337, blue: 0.557 },
  'Inquiries':     { red: 0.176, green: 0.337, blue: 0.557 },
  'Campaigns':     { red: 0.176, green: 0.337, blue: 0.557 },
  'PM Contracts':  { red: 0.914, green: 0.502, blue: 0.086 },
}
const HEADER_TEXT = { red: 1, green: 1, blue: 1 }

const STATUS_GREEN  = { red: 0.02, green: 0.59, blue: 0.41 }
const STATUS_AMBER  = { red: 0.85, green: 0.47, blue: 0.02 }
const STATUS_RED    = { red: 0.86, green: 0.15, blue: 0.15 }
const STATUS_BLUE   = { red: 0.15, green: 0.39, blue: 0.92 }
const STATUS_GRAY   = { red: 0.42, green: 0.45, blue: 0.50 }
const STATUS_VIOLET = { red: 0.49, green: 0.23, blue: 0.93 }

const TEAM_ROLE_TINTS: Record<string, { red: number; green: number; blue: number }> = {
  'Specialist':       { red: 0.855, green: 0.925, blue: 0.988 },
  'Affiliate':        { red: 0.996, green: 0.969, blue: 0.733 },
  'Housekeeper':      { red: 0.902, green: 0.965, blue: 0.882 },
  'Property Manager': { red: 0.992, green: 0.890, blue: 0.784 },
}

// ── Helpers ──────────────────────────────────────────────────
function computeNights(checkIn: string | null, checkOut: string | null): number {
  if (!checkIn || !checkOut) return 0
  return Math.max(0, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  ))
}

function deriveBookingStatus(b: any): string {
  if (b.cancelled_at) return 'Cancelled'
  if (b.completed_at) return 'Done'
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const ci = b.check_in ? new Date(b.check_in) : null
  const co = b.check_out ? new Date(b.check_out) : null
  if (!ci || !co) return 'Upcoming'
  if (ci > t) return 'Upcoming'
  if (ci <= t && co >= t) return 'Active'
  return 'Needs Action'
}

function deriveContractStatus(c: any): string {
  if (!c.effective_date) return 'Incomplete'
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  if (!c.expiry_date) return 'Active'
  const exp = new Date(c.expiry_date + 'T00:00:00Z')
  if (exp < today) return 'Expired'
  const days = Math.round((exp.getTime() - today.getTime()) / 86400000)
  return days <= 60 ? 'Expiring' : 'Active'
}

function derivePMContractStatus(pmc: any): string {
  if (!pmc) return 'Unknown'
  const today = new Date().toISOString().slice(0, 10)
  if (pmc.terminated_at) {
    if (pmc.termination_effective_date && pmc.termination_effective_date >= today) return 'Ending'
    return 'Terminated'
  }
  if (pmc.expiry_date && pmc.expiry_date < today) return 'Expired'
  if (pmc.expiry_date) {
    const diff = Math.round(
      (new Date(pmc.expiry_date + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000
    )
    if (diff <= 30) return 'Expiring'
  }
  return 'Active'
}

function enumerateMonths(startISO: string, endISO: string): string[] {
  const start = new Date(startISO + 'T00:00:00Z')
  const end = new Date(endISO + 'T00:00:00Z')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return []
  const out: string[] = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const endKey = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
  for (let i = 0; i < 240; i++) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`)
    if (cur.getTime() >= endKey) break
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return out
}

function toCell(v: unknown): string | number {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return v as string | number
}

function pick(row: any, key: string): unknown {
  const parts = key.split('.')
  let cur = row
  for (const p of parts) {
    if (cur == null) return ''
    cur = cur[p]
  }
  return cur
}

function resolveContractCodeForBooking(booking: any, contracts: any[]): string {
  if (!booking?.unit_id || !booking?.check_in) return NO_CONTRACT
  const candidates = contracts.filter((c) =>
    c.unit_id === booking.unit_id &&
    c.effective_date &&
    c.effective_date <= booking.check_in &&
    (!c.expiry_date || c.expiry_date >= booking.check_in),
  )
  if (candidates.length === 0) return NO_CONTRACT
  candidates.sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))
  return candidates[0].contract_code || NO_CONTRACT
}

function resolveContractCodeForCleaning(
  cleaning: any,
  bookingsById: Map<string, any>,
  contracts: any[],
): string {
  if (cleaning.booking_id) {
    const booking = bookingsById.get(cleaning.booking_id)
    if (booking) return resolveContractCodeForBooking(booking, contracts)
  }
  if (!cleaning.unit_id || !cleaning.scheduled_date) return NO_CONTRACT
  const candidates = contracts.filter((c) =>
    c.unit_id === cleaning.unit_id &&
    c.effective_date &&
    c.effective_date <= cleaning.scheduled_date &&
    (!c.expiry_date || c.expiry_date >= cleaning.scheduled_date),
  )
  if (candidates.length === 0) return NO_CONTRACT
  candidates.sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || ''))
  return candidates[0].contract_code || NO_CONTRACT
}

// ════════════════════════════════════════════════════════════════
// Google auth
// ════════════════════════════════════════════════════════════════
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  const sa = JSON.parse(GOOGLE_SA_JSON)
  const header = { alg: 'RS256', typ: 'JWT' }
  const iat = Math.floor(now / 1000)
  const exp = iat + 3600
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp,
  }
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${enc(header)}.${enc(claim)}`
  const pem = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  const binary = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8', binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' }, key,
    new TextEncoder().encode(signingInput),
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signingInput}.${sig}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  cachedToken = { token: json.access_token, expiresAt: now + json.expires_in * 1000 }
  return json.access_token
}

type TabInfo = { sheetId: number; title: string }

async function listTabsDetailed(token: string): Promise<TabInfo[]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Sheets get failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return (json.sheets || []).map((s: any) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
  }))
}

function findTab(tabs: TabInfo[], wanted: string): TabInfo | null {
  const want = wanted.toLowerCase().trim()
  return tabs.find((t) => t.title.toLowerCase().trim() === want) || null
}

async function createTab(token: string, title: string): Promise<number> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    },
  )
  if (!res.ok) throw new Error(`Create ${title} failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.replies?.[0]?.addSheet?.properties?.sheetId ?? -1
}

async function renameTab(token: string, sheetId: number, newTitle: string): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          updateSheetProperties: {
            properties: { sheetId, title: newTitle },
            fields: 'title',
          },
        }],
      }),
    },
  )
  if (!res.ok) throw new Error(`Rename to ${newTitle} failed: ${res.status} ${await res.text()}`)
}

async function deleteTab(token: string, sheetId: number): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }),
    },
  )
  if (!res.ok) throw new Error(`Delete sheet failed: ${res.status} ${await res.text()}`)
}

async function clearTab(token: string, title: string): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(title)}:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Clear ${title} failed: ${res.status} ${await res.text()}`)
}

async function writeRange(
  token: string,
  title: string,
  values: (string | number)[][],
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(title)}!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    },
  )
  if (!res.ok) throw new Error(`Write ${title} failed: ${res.status} ${await res.text()}`)
}

// ════════════════════════════════════════════════════════════════
// Signed URL for contract PDFs
// ════════════════════════════════════════════════════════════════
async function createSignedPdfUrl(
  supabase: any,
  path: string | null,
): Promise<string> {
  if (!path) return ''
  try {
    const { data, error } = await supabase.storage
      .from(CONTRACT_PDF_BUCKET)
      .createSignedUrl(path, CONTRACT_PDF_SIGNED_TTL)
    if (error) {
      console.warn(`Failed to sign ${path}:`, error.message)
      return ''
    }
    return data?.signedUrl || ''
  } catch (err) {
    console.warn(`Signed URL exception for ${path}:`, (err as Error).message)
    return ''
  }
}

// ════════════════════════════════════════════════════════════════
// Tab maintenance — rename lowercase, delete orphans
// ════════════════════════════════════════════════════════════════
async function reconcileTabs(token: string): Promise<TabInfo[]> {
  const tabs = await listTabsDetailed(token)

  for (const wanted of OWNED_TABS) {
    const lower = wanted.toLowerCase()
    const existing = tabs.find((t) => t.title.toLowerCase() === lower && t.title !== wanted)
    if (existing) {
      try {
        await renameTab(token, existing.sheetId, wanted)
        console.log(`Renamed "${existing.title}" → "${wanted}"`)
      } catch (e) {
        console.warn(`Rename ${existing.title} → ${wanted} failed:`, (e as Error).message)
      }
    }
  }

  const fresh = await listTabsDetailed(token)
  for (const tab of fresh) {
    const lower = tab.title.toLowerCase()
    const isMeta = lower === META_TAB
    const isOwned = OWNED_LOOKUP.has(lower)
    if (isMeta || isOwned) continue
    if (tab.title.startsWith('_')) continue

    try {
      await deleteTab(token, tab.sheetId)
      console.log(`Deleted orphan tab "${tab.title}"`)
    } catch (e) {
      console.warn(`Delete ${tab.title} failed:`, (e as Error).message)
    }
  }

  return listTabsDetailed(token)
}

// ════════════════════════════════════════════════════════════════
// Formatting
// ════════════════════════════════════════════════════════════════
type ColumnType = 'text' | 'currency' | 'date' | 'integer' | 'percent' | 'url'
type ConditionalRule = {
  equals?: string
  contains?: string
  color: { red: number; green: number; blue: number }
}
type ColumnSpec = {
  key: string
  label: string
  type?: ColumnType
  width?: number
  conditional?: ConditionalRule | ConditionalRule[]
}

function normalizeRules(r: ConditionalRule | ConditionalRule[] | undefined): ConditionalRule[] {
  if (!r) return []
  return Array.isArray(r) ? r : [r]
}

function columnLetter(idx: number): string {
  let s = ''
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

async function sheetsBatchUpdate(token: string, requests: any[]): Promise<void> {
  if (requests.length === 0) return
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`batchUpdate failed: ${res.status} ${text}`)
  }
}

async function applyFormatting(
  token: string,
  tab: TabInfo,
  columns: ColumnSpec[],
  rowCount: number,
  tabName: string,
): Promise<void> {
  if (rowCount === 0) return

  const sheetId = tab.sheetId
  const headerColor = TAB_COLORS[tabName] || TAB_COLORS['Bookings']

  try {
    const meta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?includeGridData=false`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then((r) => r.json())

    const thisSheet = (meta.sheets || []).find((s: any) => s.properties.sheetId === sheetId)
    if (thisSheet) {
      const clearReqs: any[] = []
      const cfCount = (thisSheet.conditionalFormats || []).length
      for (let i = cfCount - 1; i >= 0; i--) {
        clearReqs.push({ deleteConditionalFormatRule: { sheetId, index: i } })
      }
      if (thisSheet.bandedRanges && thisSheet.bandedRanges.length > 0) {
        for (const br of thisSheet.bandedRanges) {
          clearReqs.push({ deleteBanding: { bandedRangeId: br.bandedRangeId } })
        }
      }
      if (thisSheet.basicFilter) {
        clearReqs.push({ clearBasicFilter: { sheetId } })
      }
      if (clearReqs.length > 0) {
        await sheetsBatchUpdate(token, clearReqs).catch((e) => {
          console.warn(`Clear formats for ${tab.title}:`, e.message)
        })
      }
    }
  } catch (e) {
    console.warn(`Introspection failed for ${tab.title}:`, e)
  }

  const requests: any[] = []

  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    },
  })

  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: headerColor,
          textFormat: { bold: true, foregroundColor: HEADER_TEXT, fontSize: 10 },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })

  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 34 },
      fields: 'pixelSize',
    },
  })

  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: rowCount + 1 },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 10 },
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(textFormat,verticalAlignment)',
    },
  })

  columns.forEach((col, i) => {
    const width = col.width
      ?? (col.type === 'currency' ? 130
        : col.type === 'date' ? 110
        : col.type === 'integer' ? 80
        : col.type === 'url' ? 140
        : col.key === 'notes' ? 240
        : 140)

    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: width },
        fields: 'pixelSize',
      },
    })

    if (col.type && col.type !== 'text' && col.type !== 'url') {
      let pattern = '#,##0'
      if (col.type === 'currency') pattern = '₱#,##0.00'
      else if (col.type === 'date') pattern = 'mmm d, yyyy'
      else if (col.type === 'percent') pattern = '0.##"%"'

      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: i,
            endColumnIndex: i + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern } } },
          fields: 'userEnteredFormat.numberFormat',
        },
      })
    }

    if (col.type === 'currency') {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: i,
            endColumnIndex: i + 1,
          },
          cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
          fields: 'userEnteredFormat.horizontalAlignment',
        },
      })
    }

    // Style URL columns: blue text + underline + hyperlink.
    if (col.type === 'url') {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount + 1,
            startColumnIndex: i,
            endColumnIndex: i + 1,
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: { red: 0.06, green: 0.29, blue: 0.71 },
                underline: true,
              },
            },
          },
          fields: 'userEnteredFormat.textFormat',
        },
      })
    }
  })

  requests.push({
    setBasicFilter: {
      filter: { range: { sheetId, startRowIndex: 0, endRowIndex: rowCount + 1 } },
    },
  })

  columns.forEach((col, i) => {
    const rules = normalizeRules(col.conditional)
    if (rules.length === 0) return

    const range = [{
      sheetId,
      startRowIndex: 1,
      endRowIndex: rowCount + 1,
      startColumnIndex: i,
      endColumnIndex: i + 1,
    }]

    for (const rule of rules) {
      let condition: any = null
      if (rule.equals !== undefined) {
        condition = { type: 'TEXT_EQ', values: [{ userEnteredValue: rule.equals }] }
      } else if (rule.contains !== undefined) {
        condition = { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: rule.contains }] }
      }
      if (!condition) continue

      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: range,
            booleanRule: {
              condition,
              format: { textFormat: { foregroundColor: rule.color, bold: true } },
            },
          },
          index: 0,
        },
      })
    }
  })

  if (tabName === 'Team') {
    const roleColIdx = columns.findIndex((c) => c.key === 'role')
    if (roleColIdx >= 0) {
      const letter = columnLetter(roleColIdx)
      for (const [roleName, tint] of Object.entries(TEAM_ROLE_TINTS)) {
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [{
                sheetId,
                startRowIndex: 1,
                endRowIndex: rowCount + 1,
                startColumnIndex: 0,
                endColumnIndex: columns.length,
              }],
              booleanRule: {
                condition: {
                  type: 'CUSTOM_FORMULA',
                  values: [{ userEnteredValue: `=$${letter}2="${roleName}"` }],
                },
                format: { backgroundColor: tint },
              },
            },
            index: 0,
          },
        })
      }
    }
  }

  if (tabName === 'Bookings') {
    const statusColIdx = columns.findIndex((c) => c.key === '__status')
    if (statusColIdx >= 0) {
      const letter = columnLetter(statusColIdx)
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{
              sheetId,
              startRowIndex: 1,
              endRowIndex: rowCount + 1,
              startColumnIndex: 0,
              endColumnIndex: columns.length,
            }],
            booleanRule: {
              condition: {
                type: 'CUSTOM_FORMULA',
                values: [{ userEnteredValue: `=$${letter}2="Cancelled"` }],
              },
              format: { textFormat: { foregroundColor: STATUS_GRAY, bold: true } },
            },
          },
          index: 0,
        },
      })
    }
  }

  await sheetsBatchUpdate(token, requests).catch((e) => {
    console.error(`Format ${tab.title} failed:`, e.message)
  })
}

// ════════════════════════════════════════════════════════════════
// Views
// ════════════════════════════════════════════════════════════════
type View = {
  tab: string
  build: (supabase: any) => Promise<{ rows: Record<string, unknown>[]; columns: ColumnSpec[] }>
}

async function buildBookingsView(supabase: any) {
  const [bRes, cRes] = await Promise.all([
    supabase.from('bookings').select(`
      id, booking_code, guest_name, guest_email, guest_contact, guests,
      unit_id, check_in, check_out, total_amount, amount_paid, balance, payment_status,
      booker_name, booker_code, booker_commission, booker_rate,
      affiliate_name, affiliate_code, affiliate_commission, affiliate_rate,
      notes, created_at, updated_at, completed_at, cancelled_at, cancelled_reason,
      units:unit_id ( unit_code, building )
    `).is('deleted_at', null).order('check_in', { ascending: false }),
    supabase.from('contracts').select('id, unit_id, contract_code, effective_date, expiry_date'),
  ])

  const bookings = bRes.data || []
  const contracts = cRes.data || []

  const columns: ColumnSpec[] = [
    { key: 'booking_code', label: 'Code', type: 'text', width: 120 },
    { key: '__contract_code', label: 'Contract Code', type: 'text', width: 130 },
    { key: 'guest_name', label: 'Guest', type: 'text', width: 180 },
    { key: 'guest_email', label: 'Email', type: 'text', width: 220 },
    { key: 'guest_contact', label: 'Contact', type: 'text', width: 140 },
    { key: 'units.unit_code', label: 'Unit', type: 'text', width: 100 },
    { key: 'units.building', label: 'Building', type: 'text', width: 160 },
    { key: 'check_in', label: 'Check-in', type: 'date' },
    { key: 'check_out', label: 'Check-out', type: 'date' },
    { key: '__nights', label: 'Nights', type: 'integer' },
    { key: 'guests', label: 'Guests', type: 'integer' },
    {
      key: '__status', label: 'Status', type: 'text',
      conditional: [
        { equals: 'Cancelled',    color: STATUS_RED },
        { equals: 'Done',         color: STATUS_GRAY },
        { equals: 'Active',       color: STATUS_GREEN },
        { equals: 'Upcoming',     color: STATUS_BLUE },
        { equals: 'Needs Action', color: STATUS_AMBER },
      ],
    },
    {
      key: 'payment_status', label: 'Payment', type: 'text',
      conditional: [
        { equals: 'paid',    color: STATUS_GREEN },
        { equals: 'partial', color: STATUS_AMBER },
        { equals: 'unpaid',  color: STATUS_RED },
      ],
    },
    { key: 'total_amount', label: 'Total (₱)', type: 'currency' },
    { key: 'amount_paid', label: 'Paid (₱)', type: 'currency' },
    { key: 'balance', label: 'Balance (₱)', type: 'currency' },
    { key: 'booker_name', label: 'Booker', type: 'text', width: 140 },
    { key: 'booker_code', label: 'Booker Code', type: 'text', width: 100 },
    { key: 'booker_rate', label: 'Booker %', type: 'percent', width: 80 },
    { key: 'booker_commission', label: 'Booker Comm (₱)', type: 'currency', width: 140 },
    { key: 'affiliate_name', label: 'Affiliate', type: 'text', width: 140 },
    { key: 'affiliate_code', label: 'Affiliate Code', type: 'text', width: 110 },
    { key: 'affiliate_rate', label: 'Affiliate %', type: 'percent', width: 90 },
    { key: 'affiliate_commission', label: 'Affiliate Comm (₱)', type: 'currency', width: 150 },
    { key: 'notes', label: 'Notes', type: 'text', width: 240 },
    { key: 'created_at', label: 'Booked At', type: 'date', width: 130 },
    { key: 'updated_at', label: 'Last Edited', type: 'date', width: 130 },
    { key: 'completed_at', label: 'Completed At', type: 'date', width: 130 },
    { key: 'cancelled_at', label: 'Cancelled At', type: 'date', width: 130 },
    { key: 'cancelled_reason', label: 'Cancel Reason', type: 'text', width: 200 },
  ]

  const rows = bookings.map((b: any) => ({
    booking_code: b.booking_code,
    __contract_code: resolveContractCodeForBooking(b, contracts),
    guest_name: b.guest_name,
    guest_email: b.guest_email,
    guest_contact: b.guest_contact,
    units: b.units,
    check_in: b.check_in,
    check_out: b.check_out,
    __nights: computeNights(b.check_in, b.check_out),
    guests: b.guests,
    __status: deriveBookingStatus(b),
    payment_status: b.payment_status,
    total_amount: b.total_amount,
    amount_paid: b.amount_paid,
    balance: b.balance,
    booker_name: b.booker_name,
    booker_code: b.booker_code,
    booker_rate: b.booker_rate,
    booker_commission: b.booker_commission,
    affiliate_name: b.affiliate_name,
    affiliate_code: b.affiliate_code,
    affiliate_rate: b.affiliate_rate,
    affiliate_commission: b.affiliate_commission,
    notes: b.notes,
    created_at: b.created_at,
    updated_at: b.updated_at,
    completed_at: b.completed_at,
    cancelled_at: b.cancelled_at,
    cancelled_reason: b.cancelled_reason,
  }))

  return { rows, columns }
}

async function buildCleaningsView(supabase: any) {
  const [clRes, bRes, cRes] = await Promise.all([
    supabase.from('cleanings').select(`
      id, cleaning_code, type, status, scheduled_date, submitted_at, completed_at,
      unit_id, booking_id,
      payment_amount, payment_method, payment_reference, paid_at,
      laundry_payment_amount, laundry_payment_method, laundry_paid_at,
      notes,
      units:unit_id ( unit_code, building ),
      bookings:booking_id ( booking_code, guest_name ),
      housekeepers:housekeeper_id ( code, name )
    `).order('scheduled_date', { ascending: false }),
    supabase.from('bookings').select('id, unit_id, check_in, check_out, booking_code'),
    supabase.from('contracts').select('id, unit_id, contract_code, effective_date, expiry_date'),
  ])

  const cleanings = clRes.data || []
  const bookings = bRes.data || []
  const contracts = cRes.data || []
  const bookingsById = new Map(bookings.map((b: any) => [b.id, b]))

  const columns: ColumnSpec[] = [
    { key: 'cleaning_code', label: 'Code', type: 'text', width: 130 },
    { key: '__contract_code', label: 'Contract Code', type: 'text', width: 130 },
    { key: 'units.unit_code', label: 'Unit', type: 'text', width: 100 },
    { key: 'units.building', label: 'Building', type: 'text', width: 160 },
    { key: 'bookings.booking_code', label: 'Booking', type: 'text', width: 120 },
    { key: 'bookings.guest_name', label: 'Guest', type: 'text', width: 180 },
    { key: 'type', label: 'Type', type: 'text', width: 90 },
    {
      key: 'status', label: 'Status', type: 'text',
      conditional: [
        { equals: 'completed', color: STATUS_GREEN },
        { equals: 'cancelled', color: STATUS_RED },
        { equals: 'submitted', color: STATUS_VIOLET },
        { equals: 'scheduled', color: STATUS_AMBER },
        { equals: 'ready',     color: STATUS_BLUE },
      ],
    },
    { key: 'scheduled_date', label: 'Scheduled', type: 'date' },
    { key: 'submitted_at', label: 'Submitted', type: 'date', width: 130 },
    { key: 'completed_at', label: 'Completed', type: 'date', width: 130 },
    { key: 'housekeepers.name', label: 'Housekeeper', type: 'text', width: 150 },
    { key: 'housekeepers.code', label: 'HK Code', type: 'text', width: 100 },
    { key: 'payment_amount', label: 'HK Pay (₱)', type: 'currency' },
    { key: 'payment_method', label: 'HK Method', type: 'text', width: 120 },
    { key: 'payment_reference', label: 'HK Ref', type: 'text', width: 140 },
    { key: 'paid_at', label: 'HK Paid At', type: 'date', width: 130 },
    { key: 'laundry_payment_amount', label: 'Laundry Pay (₱)', type: 'currency', width: 140 },
    { key: 'laundry_payment_method', label: 'Laundry Method', type: 'text', width: 130 },
    { key: 'laundry_paid_at', label: 'Laundry Paid At', type: 'date', width: 130 },
    { key: 'notes', label: 'Notes', type: 'text', width: 240 },
  ]

  const rows = cleanings.map((cl: any) => ({
    cleaning_code: cl.cleaning_code,
    __contract_code: resolveContractCodeForCleaning(cl, bookingsById, contracts),
    units: cl.units,
    bookings: cl.bookings,
    type: cl.type,
    status: cl.status,
    scheduled_date: cl.scheduled_date,
    submitted_at: cl.submitted_at,
    completed_at: cl.completed_at,
    housekeepers: cl.housekeepers,
    payment_amount: cl.payment_amount,
    payment_method: cl.payment_method,
    payment_reference: cl.payment_reference,
    paid_at: cl.paid_at,
    laundry_payment_amount: cl.laundry_payment_amount,
    laundry_payment_method: cl.laundry_payment_method,
    laundry_paid_at: cl.laundry_paid_at,
    notes: cl.notes,
  }))

  return { rows, columns }
}

// ────────────────────────────────────────────────────────────────
// CONTRACTS — now includes a signed PDF URL column
// ────────────────────────────────────────────────────────────────
async function buildContractsView(supabase: any) {
  const { data } = await supabase
    .from('contracts')
    .select(`
      id, contract_code, effective_date, expiry_date, notes, contract_pdf_path,
      units:unit_id ( unit_code, building ),
      owners:owner_id ( name, email, phone )
    `)
    .order('effective_date', { ascending: false })

  const contracts = data || []

  // Sign every PDF in parallel.
  const pdfUrlById = new Map<string, string>()
  await Promise.all(
    contracts
      .filter((c: any) => c.contract_pdf_path)
      .map(async (c: any) => {
        const url = await createSignedPdfUrl(supabase, c.contract_pdf_path)
        if (url) pdfUrlById.set(c.id, url)
      }),
  )

  const columns: ColumnSpec[] = [
    { key: 'contract_code', label: 'Contract Code', type: 'text', width: 140 },
    { key: 'units.unit_code', label: 'Unit', type: 'text', width: 100 },
    { key: 'units.building', label: 'Building', type: 'text', width: 160 },
    { key: 'owners.name', label: 'Owner', type: 'text', width: 180 },
    { key: 'owners.email', label: 'Owner Email', type: 'text', width: 220 },
    { key: 'owners.phone', label: 'Owner Phone', type: 'text', width: 140 },
    {
      key: '__status', label: 'Status', type: 'text', width: 110,
      conditional: [
        { equals: 'Expired',    color: STATUS_RED },
        { equals: 'Expiring',   color: STATUS_AMBER },
        { equals: 'Active',     color: STATUS_GREEN },
        { equals: 'Incomplete', color: STATUS_GRAY },
      ],
    },
    { key: 'effective_date', label: 'Effective', type: 'date' },
    { key: 'expiry_date', label: 'Expiry', type: 'date' },
    { key: '__has_pdf', label: 'Has PDF', type: 'text', width: 90 },
    { key: '__pdf_link', label: 'Contract PDF', type: 'url', width: 140 },
    { key: 'notes', label: 'Notes', type: 'text', width: 240 },
  ]

  const rows = contracts.map((c: any) => {
    const url = pdfUrlById.get(c.id) || ''
    return {
      contract_code: c.contract_code,
      units: c.units,
      owners: c.owners,
      __status: deriveContractStatus(c),
      effective_date: c.effective_date,
      expiry_date: c.expiry_date,
      __has_pdf: c.contract_pdf_path ? 'Yes' : 'No',
      // Sheets interprets values starting with "=" as formulas.
      // Using HYPERLINK makes the cell clickable and lets us put a
      // friendly label ("Open PDF") instead of a long signed URL.
      __pdf_link: url ? `=HYPERLINK("${url.replace(/"/g, '""')}", "Open PDF")` : '',
      notes: c.notes,
    }
  })

  return { rows, columns }
}

async function buildAccountingView(supabase: any) {
  const [contractsRes, bookingsRes, cleaningsRes, manualRes, pmRes] = await Promise.all([
    supabase.from('contracts').select(`
      id, unit_id, contract_code, effective_date, expiry_date,
      units:unit_id ( unit_code, building ),
      owners:owner_id ( name )
    `),
    supabase.from('bookings')
      .select('unit_id, check_in, total_amount, booker_commission, affiliate_commission')
      .is('deleted_at', null),
    supabase.from('cleanings')
      .select('unit_id, scheduled_date, payment_amount, laundry_payment_amount'),
    supabase.from('contract_monthly_expenses').select('*'),
    supabase.from('pm_contracts').select('unit_id, effective_date, expiry_date, termination_effective_date'),
  ])

  const contracts = contractsRes.data || []
  const bookings = bookingsRes.data || []
  const cleanings = cleaningsRes.data || []
  const manual = manualRes.data || []
  const pmContracts = pmRes.data || []

  const rows: Record<string, unknown>[] = []

  for (const c of contracts) {
    if (!c.effective_date) continue
    const exp = c.expiry_date || new Date().toISOString().slice(0, 10)
    const months = enumerateMonths(c.effective_date, exp)
    if (months.length === 0) continue

    let gross = 0, bookingComm = 0, affiliateComm = 0, housekeeping = 0, laundry = 0
    let electricity = 0, internet = 0, water = 0, marketing = 0, customTotal = 0
    let pmShareTotal = 0, bookingsCount = 0, cleaningsCount = 0

    for (const month of months) {
      const [y, m] = month.split('-').map(Number)
      const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
      const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)

      const mb = bookings.filter((b: any) =>
        b.unit_id === c.unit_id &&
        b.check_in >= c.effective_date &&
        b.check_in >= monthStart &&
        b.check_in < nextMonth &&
        (!c.expiry_date || b.check_in <= c.expiry_date)
      )
      const mc = cleanings.filter((cl: any) =>
        cl.unit_id === c.unit_id &&
        cl.scheduled_date >= c.effective_date &&
        cl.scheduled_date >= monthStart &&
        cl.scheduled_date < nextMonth &&
        (!c.expiry_date || cl.scheduled_date <= c.expiry_date)
      )
      const me = manual.find((e: any) =>
        e.contract_id === c.id && String(e.month).slice(0, 7) === month
      ) || {}

      const monthGross = mb.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0)
      const monthBookComm = mb.reduce((s: number, b: any) => s + Number(b.booker_commission || 0), 0)
      const monthAffComm = mb.reduce((s: number, b: any) => s + Number(b.affiliate_commission || 0), 0)
      const monthHk = mc.reduce((s: number, cl: any) => s + Number(cl.payment_amount || 0), 0)
      const monthLaundry = mc.reduce((s: number, cl: any) => s + Number(cl.laundry_payment_amount || 0), 0)
      const monthElec = Number(me.electricity || 0)
      const monthInt = Number(me.internet || 0)
      const monthWater = Number(me.water || 0)
      const monthMkt = Number(me.marketing || 0)
      const customItems = Array.isArray(me.custom_items) ? me.custom_items : []
      const monthCustom = customItems.reduce((s: number, x: any) => s + Number(x.amount || 0), 0)

      bookingsCount += mb.length
      cleaningsCount += mc.length
      gross += monthGross
      bookingComm += monthBookComm
      affiliateComm += monthAffComm
      housekeeping += monthHk
      laundry += monthLaundry
      electricity += monthElec
      internet += monthInt
      water += monthWater
      marketing += monthMkt
      customTotal += monthCustom

      const pmActive = pmContracts.some((pc: any) =>
        pc.unit_id === c.unit_id &&
        pc.effective_date <= nextMonth &&
        (!pc.expiry_date || pc.expiry_date >= monthStart) &&
        (!pc.termination_effective_date || pc.termination_effective_date >= monthStart)
      )
      if (pmActive) {
        const monthNet = monthGross - monthBookComm - monthAffComm - monthHk - monthLaundry
          - monthElec - monthInt - monthWater - monthMkt - monthCustom
        pmShareTotal += Math.round((monthNet * COMPANY_SPLIT) * PM_OF_COMPANY * 100) / 100
      }
    }

    const totalExpenses = bookingComm + affiliateComm + housekeeping + laundry +
      electricity + internet + water + marketing + customTotal
    const net = gross - totalExpenses
    const ownerShare = Math.round(net * OWNER_SPLIT * 100) / 100
    const companyShare = Math.round(net * COMPANY_SPLIT * 100) / 100

    rows.push({
      contract_code: c.contract_code,
      units: c.units,
      owners: c.owners,
      effective_date: c.effective_date,
      expiry_date: c.expiry_date,
      months_active: months.length,
      first_month: months[0],
      last_month: months[months.length - 1],
      bookings_count: bookingsCount,
      cleanings_count: cleaningsCount,
      gross,
      booking_commission: bookingComm,
      affiliate_commission: affiliateComm,
      housekeeping,
      laundry,
      electricity,
      internet,
      water,
      marketing,
      custom_total: customTotal,
      total_expenses: totalExpenses,
      net,
      owner_share: ownerShare,
      company_share: companyShare,
      pm_share: pmShareTotal,
      __has_pm: pmShareTotal > 0 ? 'Yes' : 'No',
    })
  }

  rows.sort((a: any, b: any) => String(a.contract_code).localeCompare(String(b.contract_code)))

  const columns: ColumnSpec[] = [
    { key: 'contract_code', label: 'Contract Code', type: 'text', width: 140 },
    { key: 'units.unit_code', label: 'Unit', type: 'text', width: 100 },
    { key: 'units.building', label: 'Building', type: 'text', width: 160 },
    { key: 'owners.name', label: 'Owner', type: 'text', width: 180 },
    { key: 'effective_date', label: 'Effective', type: 'date' },
    { key: 'expiry_date', label: 'Expiry', type: 'date' },
    { key: 'months_active', label: 'Months', type: 'integer', width: 80 },
    { key: 'first_month', label: 'First Month', type: 'text', width: 110 },
    { key: 'last_month', label: 'Last Month', type: 'text', width: 110 },
    { key: 'bookings_count', label: 'Bookings', type: 'integer', width: 90 },
    { key: 'cleanings_count', label: 'Cleanings', type: 'integer', width: 90 },
    { key: 'gross', label: 'Gross (₱)', type: 'currency' },
    { key: 'booking_commission', label: 'Booking Comm (₱)', type: 'currency', width: 150 },
    { key: 'affiliate_commission', label: 'Affiliate Comm (₱)', type: 'currency', width: 150 },
    { key: 'housekeeping', label: 'Housekeeping (₱)', type: 'currency', width: 140 },
    { key: 'laundry', label: 'Laundry (₱)', type: 'currency', width: 120 },
    { key: 'electricity', label: 'Electricity (₱)', type: 'currency', width: 130 },
    { key: 'internet', label: 'Internet (₱)', type: 'currency', width: 120 },
    { key: 'water', label: 'Water (₱)', type: 'currency', width: 110 },
    { key: 'marketing', label: 'Marketing (₱)', type: 'currency', width: 130 },
    { key: 'custom_total', label: 'Custom (₱)', type: 'currency', width: 120 },
    { key: 'total_expenses', label: 'Total Expenses (₱)', type: 'currency', width: 160 },
    { key: 'net', label: 'Net (₱)', type: 'currency' },
    { key: 'owner_share', label: 'Owner Share (₱)', type: 'currency', width: 140 },
    { key: 'company_share', label: 'Company Share (₱)', type: 'currency', width: 150 },
    { key: 'pm_share', label: 'PM Share (₱)', type: 'currency', width: 120 },
    { key: '__has_pm', label: 'PM Active', type: 'text', width: 100 },
  ]

  return { rows, columns }
}

async function buildRegistryView(supabase: any) {
  const [unitsRes, contractsRes] = await Promise.all([
    supabase.from('units').select(`
      id, unit_code, building, unit_type, status, gc_status,
      marketing_title, inventory_list, ota_listings,
      owners:owner_id ( name, email, phone )
    `).order('unit_code'),
    supabase.from('contracts').select('unit_id, contract_code, effective_date, expiry_date'),
  ])

  const units = unitsRes.data || []
  const contracts = contractsRes.data || []
  const contractByUnit = new Map<string, any>()
  for (const c of contracts) contractByUnit.set(c.unit_id, c)

  const columns: ColumnSpec[] = [
    { key: 'unit_code', label: 'Unit', type: 'text', width: 110 },
    { key: 'building', label: 'Building', type: 'text', width: 160 },
    { key: 'unit_type', label: 'Type', type: 'text', width: 130 },
    {
      key: 'status', label: 'Status', type: 'text', width: 110,
      conditional: [
        { equals: 'ACTIVE',   color: STATUS_GREEN },
        { equals: 'INACTIVE', color: STATUS_GRAY },
      ],
    },
    { key: 'owners.name', label: 'Owner', type: 'text', width: 180 },
    { key: 'owners.email', label: 'Owner Email', type: 'text', width: 220 },
    { key: 'owners.phone', label: 'Owner Phone', type: 'text', width: 140 },
    { key: 'gc_status', label: 'GC Status', type: 'text', width: 100 },
    { key: 'marketing_title', label: 'Marketing Title', type: 'text', width: 220 },
    { key: '__contract_code', label: 'Contract', type: 'text', width: 140 },
    { key: '__effective', label: 'Effective', type: 'date' },
    { key: '__expiry', label: 'Expiry', type: 'date' },
    {
      key: '__contract_status', label: 'Contract Status', type: 'text', width: 130,
      conditional: [
        { equals: 'Expired',    color: STATUS_RED },
        { equals: 'Expiring',   color: STATUS_AMBER },
        { equals: 'Active',     color: STATUS_GREEN },
        { equals: 'Incomplete', color: STATUS_GRAY },
      ],
    },
  ]

  const rows = units.map((u: any) => {
    const c = contractByUnit.get(u.id)
    return {
      unit_code: u.unit_code,
      building: u.building,
      unit_type: u.unit_type,
      status: u.status,
      owners: u.owners,
      gc_status: u.gc_status,
      marketing_title: u.marketing_title,
      __contract_code: c?.contract_code || '',
      __effective: c?.effective_date || '',
      __expiry: c?.expiry_date || '',
      __contract_status: c ? deriveContractStatus(c) : 'No contract',
    }
  })

  return { rows, columns }
}

async function buildTeamView(supabase: any) {
  const [spec, aff, hk, pm, bookingsRes, cleaningsRes, pmcRes] = await Promise.all([
    supabase.from('specialists').select('code, name, email, phone, created_at'),
    supabase.from('affiliates').select('code, name, email, phone, created_at'),
    supabase.from('housekeepers').select('code, id, name, email, phone, created_at'),
    supabase.from('property_managers').select('code, id, name, email, phone, status, created_at'),
    supabase.from('bookings').select('booker_code, affiliate_code, booker_commission, affiliate_commission, completed_at, cancelled_at').is('deleted_at', null),
    supabase.from('cleanings').select('housekeeper_id, payment_amount, status'),
    supabase.from('pm_contracts').select('pm_id, unit_id, effective_date, expiry_date, termination_effective_date, pm_share_of_company_pct'),
  ])

  const bookings = bookingsRes.data || []
  const cleanings = cleaningsRes.data || []
  const pmContracts = pmcRes.data || []

  const specEarnings: Record<string, number> = {}
  const specJobs: Record<string, number> = {}
  for (const b of bookings) {
    if (!b.booker_code) continue
    if (b.cancelled_at) continue
    specEarnings[b.booker_code] = (specEarnings[b.booker_code] || 0) + Number(b.booker_commission || 0)
    if (b.completed_at) specJobs[b.booker_code] = (specJobs[b.booker_code] || 0) + 1
  }
  const affEarnings: Record<string, number> = {}
  const affJobs: Record<string, number> = {}
  for (const b of bookings) {
    if (!b.affiliate_code) continue
    if (b.cancelled_at) continue
    affEarnings[b.affiliate_code] = (affEarnings[b.affiliate_code] || 0) + Number(b.affiliate_commission || 0)
    if (b.completed_at) affJobs[b.affiliate_code] = (affJobs[b.affiliate_code] || 0) + 1
  }
  const hkById: Record<string, { earnings: number; jobs: number }> = {}
  for (const c of cleanings) {
    if (!c.housekeeper_id) continue
    if (!hkById[c.housekeeper_id]) hkById[c.housekeeper_id] = { earnings: 0, jobs: 0 }
    hkById[c.housekeeper_id].earnings += Number(c.payment_amount || 0)
    if (c.status === 'completed') hkById[c.housekeeper_id].jobs += 1
  }

  const pmEarnings: Record<string, number> = {}
  const [cRes2, bRes2, clRes2, manualRes2] = await Promise.all([
    supabase.from('contracts').select('id, unit_id, effective_date, expiry_date'),
    supabase.from('bookings').select('unit_id, check_in, total_amount, booker_commission, affiliate_commission').is('deleted_at', null),
    supabase.from('cleanings').select('unit_id, scheduled_date, payment_amount, laundry_payment_amount'),
    supabase.from('contract_monthly_expenses').select('*'),
  ])
  const contracts2 = cRes2.data || []
  const bookings2 = bRes2.data || []
  const cleanings2 = clRes2.data || []
  const manual2 = manualRes2.data || []

  for (const c of contracts2) {
    if (!c.effective_date) continue
    const exp = c.expiry_date || new Date().toISOString().slice(0, 10)
    const months = enumerateMonths(c.effective_date, exp)
    for (const month of months) {
      const [y, m] = month.split('-').map(Number)
      const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
      const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)

      const mb = bookings2.filter((b: any) =>
        b.unit_id === c.unit_id && b.check_in >= c.effective_date &&
        b.check_in >= monthStart && b.check_in < nextMonth &&
        (!c.expiry_date || b.check_in <= c.expiry_date))
      const mc = cleanings2.filter((cl: any) =>
        cl.unit_id === c.unit_id && cl.scheduled_date >= c.effective_date &&
        cl.scheduled_date >= monthStart && cl.scheduled_date < nextMonth &&
        (!c.expiry_date || cl.scheduled_date <= c.expiry_date))
      const me = manual2.find((e: any) =>
        e.contract_id === c.id && String(e.month).slice(0, 7) === month) || {}

      const monthGross = mb.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0)
      const monthExp = mb.reduce((s: number, b: any) => s + Number(b.booker_commission || 0) + Number(b.affiliate_commission || 0), 0)
        + mc.reduce((s: number, cl: any) => s + Number(cl.payment_amount || 0) + Number(cl.laundry_payment_amount || 0), 0)
        + Number(me.electricity || 0) + Number(me.internet || 0) + Number(me.water || 0) + Number(me.marketing || 0)
        + (Array.isArray(me.custom_items) ? me.custom_items.reduce((s: number, x: any) => s + Number(x.amount || 0), 0) : 0)
      const monthNet = monthGross - monthExp
      const monthCompanyShare = monthNet * COMPANY_SPLIT

      const activePMs = pmContracts.filter((pc: any) =>
        pc.unit_id === c.unit_id &&
        pc.effective_date <= nextMonth &&
        (!pc.expiry_date || pc.expiry_date >= monthStart) &&
        (!pc.termination_effective_date || pc.termination_effective_date >= monthStart))

      for (const pc of activePMs) {
        const pct = Number(pc.pm_share_of_company_pct || PM_OF_COMPANY) / 100
        pmEarnings[pc.pm_id] = (pmEarnings[pc.pm_id] || 0) + monthCompanyShare * pct
      }
    }
  }

  const rows: Record<string, unknown>[] = []
  const push = (arr: any[], role: string) => {
    for (const w of (arr || [])) {
      let jobs = 0
      let earnings = 0
      if (role === 'Specialist') {
        jobs = specJobs[w.code] || 0
        earnings = specEarnings[w.code] || 0
      } else if (role === 'Affiliate') {
        jobs = affJobs[w.code] || 0
        earnings = affEarnings[w.code] || 0
      } else if (role === 'Housekeeper') {
        jobs = hkById[w.id]?.jobs || 0
        earnings = hkById[w.id]?.earnings || 0
      } else if (role === 'Property Manager') {
        jobs = pmContracts.filter((pc: any) => pc.pm_id === w.id).length
        earnings = pmEarnings[w.id] || 0
      }
      rows.push({
        code: w.code,
        role,
        name: w.name,
        email: w.email,
        phone: w.phone,
        status: w.status || 'active',
        hired: w.created_at,
        jobs,
        earnings,
      })
    }
  }
  push(spec.data || [], 'Specialist')
  push(aff.data || [], 'Affiliate')
  push(hk.data || [], 'Housekeeper')
  push(pm.data || [], 'Property Manager')

  const roleOrder: Record<string, number> = {
    'Specialist': 1, 'Affiliate': 2, 'Housekeeper': 3, 'Property Manager': 4,
  }
  rows.sort((a: any, b: any) => {
    const ra = roleOrder[a.role] || 99
    const rb = roleOrder[b.role] || 99
    if (ra !== rb) return ra - rb
    return String(a.name || '').localeCompare(String(b.name || ''))
  })

  const columns: ColumnSpec[] = [
    { key: 'code', label: 'Code', type: 'text', width: 110 },
    { key: 'role', label: 'Role', type: 'text', width: 140 },
    { key: 'name', label: 'Name', type: 'text', width: 180 },
    { key: 'email', label: 'Email', type: 'text', width: 220 },
    { key: 'phone', label: 'Phone', type: 'text', width: 140 },
    {
      key: 'status', label: 'Status', type: 'text', width: 100,
      conditional: [
        { equals: 'active',   color: STATUS_GREEN },
        { equals: 'inactive', color: STATUS_GRAY },
      ],
    },
    { key: 'hired', label: 'Hired', type: 'date' },
    { key: 'jobs', label: 'Completed Jobs', type: 'integer', width: 130 },
    { key: 'earnings', label: 'Total Earnings (₱)', type: 'currency', width: 160 },
  ]

  return { rows, columns }
}

async function buildInquiriesView(supabase: any) {
  const [prop, int] = await Promise.all([
    supabase.from('property_inquiries').select('*').order('created_at', { ascending: false }),
    supabase.from('interior_design_inquiries').select('*').order('created_at', { ascending: false }),
  ])

  const rows: Record<string, unknown>[] = []

  for (const i of (prop.data || [])) {
    rows.push({
      type: 'Property',
      name: i.owner_name,
      email: i.owner_email,
      phone: i.owner_phone,
      subject: i.inquiry_type || '',
      detail: [i.building, i.location, i.property_type].filter(Boolean).join(' · '),
      status: i.status,
      received: i.created_at,
      message: i.message,
    })
  }
  for (const i of (int.data || [])) {
    rows.push({
      type: 'Interior',
      name: i.client_name,
      email: i.client_email,
      phone: i.client_phone,
      subject: i.service_type || '',
      detail: [i.property_address, i.property_type].filter(Boolean).join(' · '),
      status: i.status,
      received: i.created_at,
      message: i.message,
    })
  }
  rows.sort((a: any, b: any) => String(b.received).localeCompare(String(a.received)))

  const columns: ColumnSpec[] = [
    { key: 'type', label: 'Type', type: 'text', width: 100 },
    { key: 'name', label: 'Name', type: 'text', width: 180 },
    { key: 'email', label: 'Email', type: 'text', width: 220 },
    { key: 'phone', label: 'Phone', type: 'text', width: 140 },
    { key: 'subject', label: 'Subject', type: 'text', width: 150 },
    { key: 'detail', label: 'Detail', type: 'text', width: 240 },
    {
      key: 'status', label: 'Status', type: 'text', width: 100,
      conditional: [
        { equals: 'new',       color: STATUS_BLUE },
        { equals: 'contacted', color: STATUS_AMBER },
        { equals: 'closed',    color: STATUS_GRAY },
      ],
    },
    { key: 'received', label: 'Received', type: 'date', width: 130 },
    { key: 'message', label: 'Message', type: 'text', width: 320 },
  ]

  return { rows, columns }
}

async function buildCampaignsView(supabase: any) {
  const { data } = await supabase
    .from('email_campaigns')
    .select('id, name, subject, recipient_count, sent_count, failed_count, status, created_at, sent_at, created_by_email')
    .order('created_at', { ascending: false })

  const columns: ColumnSpec[] = [
    { key: 'name', label: 'Name', type: 'text', width: 180 },
    { key: 'subject', label: 'Subject', type: 'text', width: 260 },
    {
      key: 'status', label: 'Status', type: 'text', width: 100,
      conditional: [
        { equals: 'sent',     color: STATUS_GREEN },
        { equals: 'failed',   color: STATUS_RED },
        { equals: 'sending',  color: STATUS_AMBER },
        { equals: 'drafting', color: STATUS_GRAY },
      ],
    },
    { key: 'recipient_count', label: 'Recipients', type: 'integer' },
    { key: 'sent_count', label: 'Sent', type: 'integer' },
    { key: 'failed_count', label: 'Failed', type: 'integer' },
    { key: 'sent_at', label: 'Sent At', type: 'date', width: 130 },
    { key: 'created_at', label: 'Created At', type: 'date', width: 130 },
    { key: 'created_by_email', label: 'Created By', type: 'text', width: 220 },
  ]

  return { rows: data || [], columns }
}

async function buildPMContractsView(supabase: any) {
  const { data } = await supabase
    .from('pm_contracts')
    .select(`
      id, pm_contract_code, pm_id, unit_id, contract_id,
      effective_date, expiry_date,
      termination_requested_at, termination_effective_date, terminated_at,
      pm_share_of_company_pct, notes, pm_pdf_path,
      property_managers:pm_id ( code, name ),
      units:unit_id ( unit_code, building )
    `)
    .order('effective_date', { ascending: false })

  const columns: ColumnSpec[] = [
    { key: 'pm_contract_code', label: 'PM Contract Code', type: 'text', width: 160 },
    { key: 'property_managers.name', label: 'PM Name', type: 'text', width: 180 },
    { key: 'property_managers.code', label: 'PM Code', type: 'text', width: 110 },
    { key: 'units.unit_code', label: 'Unit', type: 'text', width: 100 },
    { key: 'units.building', label: 'Building', type: 'text', width: 160 },
    { key: 'effective_date', label: 'Effective', type: 'date' },
    { key: 'expiry_date', label: 'Expiry', type: 'date' },
    {
      key: '__status', label: 'Status', type: 'text', width: 110,
      conditional: [
        { equals: 'Active',     color: STATUS_GREEN },
        { equals: 'Expiring',   color: STATUS_AMBER },
        { equals: 'Ending',     color: STATUS_AMBER },
        { equals: 'Expired',    color: STATUS_RED },
        { equals: 'Terminated', color: STATUS_GRAY },
      ],
    },
    { key: 'pm_share_of_company_pct', label: 'PM % of Company', type: 'integer', width: 150 },
    { key: '__pm_net_pct', label: 'PM Earns (% of Net)', type: 'percent', width: 160 },
    { key: 'termination_effective_date', label: 'Termination Effective', type: 'date', width: 170 },
    { key: 'notes', label: 'Notes', type: 'text', width: 240 },
  ]

  const rows = (data || []).map((pmc: any) => ({
    pm_contract_code: pmc.pm_contract_code || '',
    property_managers: pmc.property_managers,
    units: pmc.units,
    effective_date: pmc.effective_date,
    expiry_date: pmc.expiry_date,
    __status: derivePMContractStatus(pmc),
    pm_share_of_company_pct: pmc.pm_share_of_company_pct,
    __pm_net_pct: (Number(pmc.pm_share_of_company_pct || PM_OF_COMPANY) * COMPANY_SPLIT * 100).toFixed(2),
    termination_effective_date: pmc.termination_effective_date,
    notes: pmc.notes,
  }))

  return { rows, columns }
}

const VIEWS: View[] = [
  { tab: 'Bookings',      build: buildBookingsView },
  { tab: 'Contracts',     build: buildContractsView },
  { tab: 'Accounting',    build: buildAccountingView },
  { tab: 'Cleanings',     build: buildCleaningsView },
  { tab: 'Registry',      build: buildRegistryView },
  { tab: 'Team',          build: buildTeamView },
  { tab: 'PM Contracts',  build: buildPMContractsView },
  { tab: 'Inquiries',     build: buildInquiriesView },
  { tab: 'Campaigns',     build: buildCampaignsView },
]

// ════════════════════════════════════════════════════════════════
// Main handler
// ════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const startedAt = Date.now()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  let runId: string | null = null

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing auth header' }, 401)
    const token = authHeader.slice(7)

    let jwtPayload: Record<string, unknown> | null = null
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const pad = (s: string) => s + '='.repeat((4 - (s.length % 4)) % 4)
        jwtPayload = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))))
      }
    } catch { /* not a JWT */ }

    let triggerSource: 'cron' | 'manual' = 'cron'
    let createdBy: string | null = null

    if (jwtPayload && jwtPayload.role === 'service_role') {
      triggerSource = 'cron'
    } else {
      const { data: { user } } = await supabase.auth.getUser(token)
      if (!user) return json({ error: 'Invalid auth' }, 401)
      const { data: adminRow } = await supabase
        .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
      if (!adminRow) return json({ error: 'Not an admin' }, 403)
      triggerSource = 'manual'
      createdBy = user.id
    }

    const { data: runRow } = await supabase
      .from('backup_runs')
      .insert({ status: 'running', trigger_source: triggerSource, created_by: createdBy })
      .select('id').single()
    runId = runRow?.id || null

    const accessToken = await getAccessToken()

    let tabs = await reconcileTabs(accessToken)

    const rowCounts: Record<string, number> = {}
    const errors: string[] = []

    for (const view of VIEWS) {
      try {
        const { rows, columns } = await view.build(supabase)
        rowCounts[view.tab] = rows.length

        tabs = await listTabsDetailed(accessToken)
        let tabInfo = findTab(tabs, view.tab)

        if (!tabInfo) {
          try {
            const id = await createTab(accessToken, view.tab)
            tabInfo = { sheetId: id, title: view.tab }
          } catch (createErr) {
            tabs = await listTabsDetailed(accessToken)
            tabInfo = findTab(tabs, view.tab)
            if (!tabInfo) throw createErr
          }
        }

        const values: (string | number)[][] = [columns.map((c) => c.label)]
        for (const row of rows) {
          values.push(
            columns.map((col) => {
              if (col.key.startsWith('__')) return toCell(row[col.key])
              return toCell(pick(row, col.key))
            }),
          )
        }

        await clearTab(accessToken, tabInfo.title).catch((e) => {
          console.warn(`clearTab ${tabInfo!.title} failed (continuing):`, e)
        })
        await writeRange(accessToken, tabInfo.title, values)
        await applyFormatting(accessToken, tabInfo, columns, rows.length, view.tab)
      } catch (err) {
        console.error(`View ${view.tab} failed:`, err)
        errors.push(`${view.tab}: ${(err as Error).message}`)
      }
    }

    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - startedAt
    const status = errors.length === 0
      ? 'success'
      : (Object.keys(rowCounts).length === 0 ? 'failed' : 'partial')

    const metaRows: (string | number)[][] = [
      ['field', 'value'],
      ['started_at', new Date(startedAt).toISOString()],
      ['finished_at', finishedAt],
      ['duration_ms', durationMs],
      ['status', status],
      ['trigger_source', triggerSource],
      ...Object.entries(rowCounts).map(([k, v]) => [`rows:${k}`, v]),
      ...(errors.length ? [['errors', errors.join(' | ')]] : []),
    ]

    tabs = await listTabsDetailed(accessToken)
    let metaTab = findTab(tabs, META_TAB)
    if (!metaTab) {
      try {
        const id = await createTab(accessToken, META_TAB)
        metaTab = { sheetId: id, title: META_TAB }
      } catch {
        tabs = await listTabsDetailed(accessToken)
        metaTab = findTab(tabs, META_TAB)
      }
    }
    if (metaTab) {
      await clearTab(accessToken, metaTab.title).catch(() => {})
      await writeRange(accessToken, metaTab.title, metaRows)
    }

    if (runId) {
      await supabase.from('backup_runs').update({
        status, finished_at: finishedAt, duration_ms: durationMs,
        row_counts: rowCounts,
        error_message: errors.length ? errors.join(' | ') : null,
      }).eq('id', runId)
    }

    return json({
      ok: true, status, duration_ms: durationMs,
      row_counts: rowCounts, errors,
      sheet_url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}`,
    })
  } catch (err) {
    const msg = (err as Error).message || 'Unknown error'
    if (runId) {
      await supabase.from('backup_runs').update({
        status: 'failed', finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt, error_message: msg,
      }).eq('id', runId)
    }
    return json({ error: msg }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}