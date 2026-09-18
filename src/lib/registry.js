import { supabase } from './supabase'

export async function listUnits({ pipeline, building, search } = {}) {
  let query = supabase.from('v_pipeline').select('*')

  if (pipeline && pipeline !== 'all') {
    query = query.eq('pipeline_status', pipeline)
  }
  if (building && building !== 'all') {
    query = query.eq('building', building)
  }
  if (search && search.trim()) {
    const s = search.trim()
    query = query.or(
      [
        `unit_code.ilike.%${s}%`,
        `owner_name.ilike.%${s}%`,
        `owner_email.ilike.%${s}%`,
        `owner_phone.ilike.%${s}%`,
        `building.ilike.%${s}%`,
        `marketing_title.ilike.%${s}%`,
        `unit_type.ilike.%${s}%`,
        `gc_status.ilike.%${s}%`,
      ].join(',')
    )
  }

  const { data, error } = await query.order('unit_code', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getUnit(id) {
  const { data, error } = await supabase
    .from('v_pipeline')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getUnitContracts(unitId) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('unit_id', unitId)
    .order('effective_date', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data || []
}

export async function getUnitInteractions(unitId) {
  const { data, error } = await supabase
    .from('unit_interactions')
    .select('*')
    .eq('unit_id', unitId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createUnit(payload) {
  const { data, error } = await supabase
    .from('units')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateUnit(id, patch) {
  const ownerFields = ['owner_name', 'owner_email', 'owner_phone']
  const ownerPatch = {}
  const unitPatch = { ...patch }

  for (const f of ownerFields) {
    if (f in unitPatch) {
      ownerPatch[f.replace('owner_', '')] = unitPatch[f]
      delete unitPatch[f]
    }
  }

  let unit = null
  if (Object.keys(unitPatch).length > 0) {
    const { data, error } = await supabase
      .from('units')
      .update(unitPatch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    unit = data
  }

  if (Object.keys(ownerPatch).length > 0) {
    const { data: current } = await supabase
      .from('units')
      .select('owner_id')
      .eq('id', id)
      .single()

    if (current?.owner_id) {
      const { error: ownerErr } = await supabase
        .from('owners')
        .update(ownerPatch)
        .eq('id', current.owner_id)
      if (ownerErr) throw ownerErr
    }
  }

  return unit
}

export async function deleteUnit(id) {
  const { error } = await supabase.from('units').delete().eq('id', id)
  if (error) throw error
}

export async function createContract(payload) {
  const { data, error } = await supabase
    .from('contracts')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContract(id, patch) {
  const { data, error } = await supabase
    .from('contracts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renewContract(unitId, newContractData) {
  const { data: unit, error: unitErr } = await supabase
    .from('units')
    .select('current_contract_id')
    .eq('id', unitId)
    .single()
  if (unitErr) throw unitErr

  const oldContractId = unit?.current_contract_id

  const newContract = await createContract({
    ...newContractData,
    unit_id: unitId,
  })

  if (oldContractId) {
    await updateContract(oldContractId, { superseded_by: newContract.id })
  }

  await updateUnit(unitId, {
    current_contract_id: newContract.id,
    status: 'ACTIVE',
  })

  return newContract
}

export async function listOwners(search) {
  let query = supabase.from('owners').select('*')
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
    )
  }
  const { data, error } = await query.order('name', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getOwner(id) {
  const { data, error } = await supabase
    .from('owners')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createOwner(payload) {
  const { data, error } = await supabase
    .from('owners')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateOwner(id, patch) {
  const { data, error } = await supabase
    .from('owners')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function logInteraction(payload) {
  const { data, error } = await supabase
    .from('unit_interactions')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listTodayFollowUps() {
  const { data, error } = await supabase.from('v_today').select('*')
  if (error) throw error
  return data || []
}

export async function listExpiring() {
  const { data, error } = await supabase.from('v_expiring').select('*')
  if (error) throw error
  return data || []
}

export async function listRates() {
  const { data, error } = await supabase
    .from('rates')
    .select('*')
    .order('building', { ascending: true })
    .order('unit_type', { ascending: true })
    .order('pax_count', { ascending: true })
  if (error) throw error
  return data || []
}

export async function listExtras() {
  const { data, error } = await supabase
    .from('extras')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function listAssociationAccounts() {
  const { data, error } = await supabase
    .from('association_accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('building', { ascending: true })
  if (error) throw error
  return data || []
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target - today) / (1000 * 60 * 60 * 24))
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
