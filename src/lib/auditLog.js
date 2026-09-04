import { supabase } from './supabase'

export async function logAudit(action, tableName, recordId, details = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      action,
      table_name: tableName,
      record_id: recordId,
      details,
    })
    if (error) console.error('Audit log error:', error)
  } catch (error) {
    console.error('Audit log exception:', error)
  }
}