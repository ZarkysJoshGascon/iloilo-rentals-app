// src/admin/dashboard/workLog.ts
// The day's work as the database records it: a trigger writes one audit_logs
// row for every add, edit and delete on the CRM tables, with the fields that
// changed (migration 20261019000001_work_log.sql). This loads today's rows and
// turns each one into a sentence for the dashboard's "Work done today" card.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDebouncedRealtime } from '@/hooks/useDebouncedRealtime'

const MAX_ENTRIES = 500
const TZ = 'Asia/Manila'

/** Today's date in Manila, as YYYY-MM-DD. */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

/** Manila midnight (UTC+8, no daylight saving) as a UTC timestamp. */
export function manilaDayStart(day: string = manilaToday()): string {
  return new Date(`${day}T00:00:00+08:00`).toISOString()
}

/** The first day of this month in Manila and of the next one, as YYYY-MM-DD. */
export function manilaMonthRange(day: string = manilaToday()) {
  const [y, m] = day.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { start: `${day.slice(0, 7)}-01`, next }
}

export type Change = { from?: unknown; to?: unknown }

export type WorkEntry = {
  id: string
  created_at: string
  user_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  table_name: string
  record_id: string | null
  details: {
    label?: string
    guest?: string
    unit?: string
    contract?: string
    month?: string
    type?: string
    status?: string
    changes?: Record<string, Change>
  }
}

export type Person = { id: string; name: string; avatar: string | null }

export type Area = 'bookings' | 'cleanings' | 'contracts' | 'units' | 'inquiries' | 'team'

export const AREA_TABS: { id: 'all' | Area; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'cleanings', label: 'Cleanings' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'units', label: 'Units' },
  { id: 'inquiries', label: 'Inquiries' },
  { id: 'team', label: 'Team' },
]

/** Today's work log, newest first, kept live. Rolls over at Manila midnight. */
export function useWorkLog() {
  const [day, setDay] = useState(manilaToday)
  const [state, setState] = useState<{ loading: boolean; entries: WorkEntry[]; people: Record<string, Person> }>({
    loading: true,
    entries: [],
    people: {},
  })

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, created_at, user_id, action, table_name, record_id, details')
        .in('action', ['INSERT', 'UPDATE', 'DELETE'])
        .gte('created_at', manilaDayStart(day))
        .order('created_at', { ascending: false })
        .limit(MAX_ENTRIES)
      if (signal?.aborted) return
      if (error) throw error

      const entries = (data || []) as WorkEntry[]
      const ids = [...new Set(entries.map((e) => e.user_id).filter(Boolean))]
      const people: Record<string, Person> = {}
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, avatar_url').in('id', ids)
        if (signal?.aborted) return
        for (const p of profiles || []) {
          people[p.id] = { id: p.id, name: p.full_name || p.email?.split('@')[0] || 'Someone', avatar: p.avatar_url || null }
        }
      }
      setState({ loading: false, entries, people })
    } catch (err) {
      console.error('Work log load failed:', err)
      if (!signal?.aborted) setState((s) => ({ ...s, loading: false }))
    }
  }, [day])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [load])

  useEffect(() => {
    const t = setInterval(() => {
      const d = manilaToday()
      setDay((prev) => (prev === d ? prev : d))
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  const reload = useCallback(() => { load() }, [load])
  useDebouncedRealtime({ table: 'audit_logs', onChange: reload, debounceMs: 1500 })

  return { ...state, day, reload }
}

// ─────────────────────────────────────────────────────────────
// Wording
// ─────────────────────────────────────────────────────────────

const TABLES: Record<string, { noun: string; area: Area; tab: string }> = {
  bookings:                  { noun: 'booking',                 area: 'bookings',  tab: 'bookings' },
  cleanings:                 { noun: 'cleaning',                area: 'cleanings', tab: 'housekeeping' },
  contracts:                 { noun: 'contract',                area: 'contracts', tab: 'contracts' },
  pm_contracts:              { noun: 'PM contract',             area: 'contracts', tab: 'contracts' },
  contract_monthly_expenses: { noun: 'monthly expenses',        area: 'contracts', tab: 'accounting' },
  units:                     { noun: 'unit',                    area: 'units',     tab: 'registry' },
  unit_interactions:         { noun: 'unit interaction',        area: 'units',     tab: 'registry' },
  owners:                    { noun: 'owner',                   area: 'units',     tab: 'registry' },
  property_inquiries:        { noun: 'property inquiry',        area: 'inquiries', tab: 'inquiries' },
  interior_design_inquiries: { noun: 'interior design inquiry', area: 'inquiries', tab: 'interior' },
  inquiry_activities:        { noun: 'inquiry note',            area: 'inquiries', tab: 'inquiries' },
  contact_messages:          { noun: 'contact message',         area: 'inquiries', tab: 'inquiries' },
  specialists:               { noun: 'specialist',              area: 'team',      tab: 'team' },
  affiliates:                { noun: 'affiliate',               area: 'team',      tab: 'team' },
  housekeepers:              { noun: 'housekeeper',             area: 'team',      tab: 'team' },
  property_managers:         { noun: 'property manager',        area: 'team',      tab: 'team' },
}

// Rows the public sends in through the website, not someone on the team.
const WEBSITE_TABLES = new Set(['property_inquiries', 'interior_design_inquiries', 'contact_messages'])

const FIELD_LABELS: Record<string, string> = {
  guest_name: 'Guest',
  guest_email: 'Guest email',
  guest_contact: 'Guest contact',
  check_in: 'Check-in',
  check_out: 'Check-out',
  total_amount: 'Total',
  transactions: 'Payments',
  amount_paid: 'Amount paid',
  booker_code: 'Booker',
  booker_rate: 'Booker rate',
  affiliate_code: 'Affiliate',
  affiliate_rate: 'Affiliate rate',
  cancelled_reason: 'Cancel reason',
  checked_out_by_name: 'Checked out by',
  late_checkout_by_name: 'Late check-out by',
  late_checkout_at: 'Late check-out',
  checked_out_at: 'Check-out confirmed',
  scheduled_date: 'Scheduled for',
  payment_amount: 'Pay',
  laundry_payment_amount: 'Laundry pay',
  laundry_paid_at: 'Laundry paid',
  photos_before: 'Before photos',
  photos_after: 'After photos',
  photos_report: 'Report photos',
  effective_date: 'Start date',
  expiry_date: 'End date',
  contract_terms_months: 'Term (months)',
  contract_pdf_url: 'Contract PDF',
  contract_pdf_path: 'Contract PDF',
  pm_pdf_url: 'PM contract PDF',
  pm_pdf_path: 'PM contract PDF',
  superseded_by: 'Renewed as',
  marketing_title: 'Listing title',
  ota_listings: 'OTA listings',
  inventory_list: 'Inventory',
  gc_status: 'GC status',
  current_contract_id: 'Current contract',
  follow_up_on: 'Follow-up',
  next_follow_up_date: 'Next follow-up',
  admin_notes: 'Admin notes',
  custom_items: 'Other expenses',
}

const MONEY_FIELDS = new Set([
  'total_amount', 'amount_paid', 'balance', 'booker_commission', 'affiliate_commission',
  'payment_amount', 'laundry_payment_amount', 'electricity', 'internet', 'water', 'marketing', 'price_per_night',
])
const PERCENT_FIELDS = new Set(['booker_rate', 'affiliate_rate', 'pm_share_of_company_pct'])

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || capitalize(key.replace(/_id$/, '').replace(/_(at|on)$/, '').replace(/_/g, ' '))
}

// Status words as the pages show them: "submitted" is "To be evaluated" on a cleaning.
function statusWord(table: string, v: string) {
  if (table === 'cleanings' && v === 'submitted') return 'To be evaluated'
  return capitalize(v.toLowerCase().replace(/[_-]+/g, ' '))
}

function formatValue(table: string, key: string, v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') {
    if (MONEY_FIELDS.has(key)) return `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
    if (PERCENT_FIELDS.has(key)) return `${v}%`
    return v.toLocaleString('en-PH')
  }
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })
    }
  }
  if (key === 'status' || key.endsWith('_status') || key === 'type' || key === 'stage') return statusWord(table, s)
  return s
}

export type DescribedChange = { key: string; label: string; from: string; to: string; list: boolean }

export type Described = {
  id: string
  actorKey: string
  groupName: string
  actor: string
  avatar: string | null
  verb: string
  noun: string
  label: string
  context: string[]
  changes: DescribedChange[]
  area: Area
  href: string | null
  time: string
}

export function describeEntry(entry: WorkEntry, people: Record<string, Person>): Described {
  const table = TABLES[entry.table_name] || { noun: entry.table_name.replace(/_/g, ' '), area: 'team' as Area, tab: 'dashboard' }
  const details = entry.details || {}
  const ch = details.changes || {}
  const person = entry.user_id ? people[entry.user_id] : null
  const fromWebsite = !entry.user_id && entry.action === 'INSERT' && WEBSITE_TABLES.has(entry.table_name)

  const has = (k: string) => k in ch
  const turnedOn = (k: string) => has(k) && ch[k]?.from == null && ch[k]?.to != null
  const turnedOff = (k: string) => has(k) && ch[k]?.from != null && ch[k]?.to == null
  const shown = new Set(Object.keys(ch))
  const hide = (...keys: string[]) => keys.forEach((k) => shown.delete(k))

  let verb = 'edited'
  if (entry.action === 'INSERT') verb = fromWebsite ? 'sent a' : entry.table_name === 'bookings' ? 'created' : 'added'
  else if (entry.action === 'DELETE') verb = 'deleted'
  else if (entry.table_name === 'bookings') {
    if (turnedOn('deleted_at')) { verb = 'deleted'; hide('deleted_at') }
    else if (turnedOn('cancelled_at')) { verb = 'cancelled'; hide('cancelled_at') }
    else if (turnedOn('completed_at')) { verb = 'completed'; hide('completed_at') }
    else if (turnedOn('checked_out_at')) { verb = 'confirmed check-out on'; hide('checked_out_at', 'checked_out_by', 'checked_out_by_name') }
    else if (turnedOff('checked_out_at')) { verb = 'undid the check-out on'; hide('checked_out_at', 'checked_out_by', 'checked_out_by_name') }
    else if (turnedOn('late_checkout_at')) { verb = 'set a late check-out on'; hide('late_checkout_at', 'late_checkout_by_name') }
    else if (has('transactions') || has('amount_paid')) { verb = 'recorded a payment on'; hide('transactions') }
  } else if (entry.table_name === 'cleanings') {
    if (turnedOn('paid_at')) { verb = 'approved and paid'; hide('paid_at', 'completed_at', 'status') }
    else if (turnedOn('submitted_at')) { verb = 'submitted'; hide('submitted_at', 'status') }
  } else if (entry.table_name === 'contracts' && turnedOn('superseded_by')) {
    verb = 'renewed'
  }

  const changes: DescribedChange[] = [...shown].map((key) => {
    const c = ch[key] || {}
    const list = !('from' in c) && !('to' in c)
    return {
      key,
      label: fieldLabel(key),
      from: list ? '' : formatValue(entry.table_name, key, c.from),
      to: list ? '' : formatValue(entry.table_name, key, c.to),
      list,
    }
  })

  const context = [
    details.guest,
    details.unit && details.unit !== details.label ? details.unit : null,
    details.contract && details.contract !== details.label ? details.contract : null,
    details.month,
    fromWebsite ? 'Website' : null,
  ].filter(Boolean) as string[]

  const deep = entry.record_id && entry.action !== 'DELETE'
    ? entry.table_name === 'bookings' ? `&booking=${entry.record_id}`
      : entry.table_name === 'cleanings' ? `&cleaning=${entry.record_id}`
        : entry.table_name === 'contracts' ? `&contract=${entry.record_id}`
          : ''
    : ''

  // A website submission reads "Juan Cruz sent a property inquiry"; the people
  // list groups those under "Website".
  return {
    id: entry.id,
    actorKey: entry.user_id || (fromWebsite ? 'website' : 'system'),
    groupName: person?.name || (fromWebsite ? 'Website' : 'System'),
    actor: person?.name || (fromWebsite ? details.label || 'A visitor' : 'System'),
    avatar: person?.avatar || null,
    verb,
    noun: table.noun,
    label: fromWebsite ? '' : details.label || '',
    context,
    changes,
    area: table.area,
    href: entry.action === 'DELETE' ? null : `/admin?tab=${table.tab}${deep}`,
    time: new Date(entry.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: TZ }),
  }
}
