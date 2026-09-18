import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import xlsx from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DRY_RUN = process.argv.includes('--dry-run')
const FILE_PATH = path.join(ROOT, 'data', 'accounts.xlsx')

function loadEnv() {
  const env = {}
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    const text = fs.readFileSync(p, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const SECRET_KEY = env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function raw(value) {
  if (value === null || value === undefined) return null
  const s = String(value).replace(/\u00A0/g, ' ').trim()
  return s === '' ? null : s
}

const NON_DATE_STRINGS = /^(MISSING|N\/A|NA|#REF!|—|-|TBA|NONE)$/i

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + value * 86400000)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  if (!s) return null
  if (NON_DATE_STRINGS.test(s)) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function normalizeStatus(value) {
  const s = raw(value)
  if (!s) return 'ACTIVE'
  return s.toUpperCase().replace(/\s+/g, '_')
}

async function main() {
  console.log('')
  console.log('Registry Import (faithful — partial contracts allowed)')
  console.log('='.repeat(60))
  console.log(`File:    ${FILE_PATH}`)
  console.log(`Mode:    ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Project: ${SUPABASE_URL}`)
  console.log('='.repeat(60))
  console.log('')

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`)
    process.exit(1)
  }

  const workbook = xlsx.readFile(FILE_PATH)
  const ownersSheet = workbook.Sheets['Owners Info']
  if (!ownersSheet) {
    console.error('Sheet "Owners Info" not found')
    process.exit(1)
  }

  const rows = xlsx.utils.sheet_to_json(ownersSheet, { defval: null, raw: true })
  console.log(`Rows: ${rows.length}`)
  console.log('')

  const ownersMap = new Map()
  const units = []

  for (const row of rows) {
    const unitCode = raw(row['Property'])
    if (!unitCode) continue
    if (unitCode.startsWith('#')) continue

    const ownerName = raw(row['Unit Owner (WIP)'])
    const ownerEmail = raw(row['Email (WIP)'])
    const ownerPhone = raw(row['Contact Number'])

    const ownerKey = ownerEmail
      ? ownerEmail.toLowerCase()
      : (ownerName ? ownerName.toLowerCase() : null)

    if (ownerKey && !ownersMap.has(ownerKey)) {
      ownersMap.set(ownerKey, {
        name: ownerName,
        email: ownerEmail,
        phone: ownerPhone,
      })
    }

    const otaListings = []
    const otaMap = {
      'Airbnb':       'AIRBNB',
      'Booking.com':  'BOOKING .COM',
      'Agoda':        'AGODA',
      'Hosteeva':     'HOSTEEVA',
      'Your Rentals': 'YOUR RENTALS',
      'Trip.com':     'TRIP.COM',
    }
    for (const [channel, header] of Object.entries(otaMap)) {
      const val = raw(row[header])
      if (val) otaListings.push({ channel, name: val })
    }

    units.push({
      building:        raw(row['Building']),
      unit_code:       unitCode,
      unit_type:       raw(row['Unit Type']),
      status:          normalizeStatus(row['Status']),
      gc_status:       raw(row['GC Status']),
      marketing_title: raw(row['AIRBNB']),
      inventory_list:  raw(row['INVENTORY LIST']),
      ota_listings:    otaListings,
      owner_key:       ownerKey,
      _effective:      parseDate(row['Effective Date']),
      _expiry:         parseDate(row['Expiry Date']),
      _classification: raw(row['Classification']),
      _contract_pdf:   raw(row['Contract (WIP)']),
    })
  }

  console.log(`Owners: ${ownersMap.size}`)
  console.log(`Units:  ${units.length}`)
  const withBoth = units.filter(u => u._effective && u._expiry).length
  const withEffOnly = units.filter(u => u._effective && !u._expiry).length
  const withExpOnly = units.filter(u => !u._effective && u._expiry).length
  const withNone = units.filter(u => !u._effective && !u._expiry).length
  console.log(`  Both dates:       ${withBoth}`)
  console.log(`  Effective only:   ${withEffOnly}`)
  console.log(`  Expiry only:      ${withExpOnly}`)
  console.log(`  Neither date:     ${withNone}   → no contract`)
  const totalContracts = withBoth + withEffOnly + withExpOnly
  console.log(`  Contracts to create: ${totalContracts}`)
  console.log('')

  if (DRY_RUN) {
    console.log('DRY RUN — no writes.')
    return
  }

  console.log('Wiping existing data...')
  await supabase.from('unit_interactions').delete().not('id', 'is', null)
  await supabase.from('contracts').delete().not('id', 'is', null)
  await supabase.from('units').delete().not('id', 'is', null)
  await supabase.from('owners').delete().not('id', 'is', null)
  console.log('  ✓ Cleared')
  console.log('')

  console.log('Inserting owners...')
  const ownerIdByKey = new Map()
  let ownerCount = 0
  let ownerErrors = 0

  for (const [key, owner] of ownersMap) {
    const { data, error } = await supabase
      .from('owners')
      .insert(owner)
      .select('id')
      .single()
    if (error) {
      ownerErrors++
      if (ownerErrors <= 3) console.log(`  ✗ ${owner.name || owner.email}: ${error.message}`)
      continue
    }
    ownerIdByKey.set(key, data.id)
    ownerCount++
    if (ownerCount % 25 === 0) console.log(`  ... ${ownerCount}`)
  }
  console.log(`  ✓ ${ownerCount} owners, ${ownerErrors} errors`)
  console.log('')

  console.log('Inserting units + contracts...')
  let unitCount = 0
  let contractCount = 0
  let unitErrors = 0

  for (const u of units) {
    const ownerId = u.owner_key ? (ownerIdByKey.get(u.owner_key) || null) : null

    const { data: unit, error: unitErr } = await supabase
      .from('units')
      .insert({
        building:        u.building,
        unit_code:       u.unit_code,
        unit_type:       u.unit_type,
        status:          u.status,
        gc_status:       u.gc_status,
        owner_id:        ownerId,
        ota_listings:    u.ota_listings,
        marketing_title: u.marketing_title,
        inventory_list:  u.inventory_list,
      })
      .select('id')
      .single()

    if (unitErr) {
      unitErrors++
      console.log(`  ✗ ${u.unit_code}: ${unitErr.message}`)
      continue
    }
    unitCount++
    if (unitCount % 25 === 0) console.log(`  ... ${unitCount}`)

    // Create contract if EITHER date exists
    if (u._effective || u._expiry) {
      const { data: contract, error: cErr } = await supabase
        .from('contracts')
        .insert({
          unit_id:          unit.id,
          owner_id:         ownerId,
          effective_date:   u._effective,
          expiry_date:      u._expiry,
          classification:   u._classification,
          contract_pdf_url: u._contract_pdf,
        })
        .select('id')
        .single()

      if (cErr) {
        console.log(`  ✗ contract ${u.unit_code}: ${cErr.message}`)
      } else {
        contractCount++
        await supabase
          .from('units')
          .update({ current_contract_id: contract.id })
          .eq('id', unit.id)
      }
    }
  }

  console.log(`  ✓ ${unitCount} units, ${unitErrors} errors`)
  console.log(`  ✓ ${contractCount} contracts`)
  console.log('')

  console.log('='.repeat(60))
  console.log('DONE')
  console.log('='.repeat(60))
  console.log(`Owners:    ${ownerCount}`)
  console.log(`Units:     ${unitCount}`)
  console.log(`Contracts: ${contractCount}`)
  console.log('')
}

main().catch(err => {
  console.error('FATAL:')
  console.error(err)
  process.exit(1)
})