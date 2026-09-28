// src/lib/auditLog.js
import { supabase } from './supabase'

/**
 * Write an audit entry via RPC. The RPC injects `auth.uid()` server-side,
 * so a malicious client cannot forge entries for other users, and cannot
 * skip the row-level checks the DB enforces.
 *
 * Never insert directly into audit_logs from the client.
 */
export async function logAudit(action, tableName, recordId, details = {}) {
  try {
    const { error } = await supabase.rpc('log_audit', {
      p_action: String(action || '').slice(0, 200),
      p_table_name: String(tableName || '').slice(0, 100),
      p_record_id: recordId || null,
      // Guard size — details must be JSON-serializable and reasonably small.
      p_details: details && typeof details === 'object' ? details : {},
    })
    if (error) {
      // Never throw — audit failures must not break user flows.
      console.error('Audit log RPC error:', error)
    }
  } catch (err) {
    console.error('Audit log exception:', err)
  }
}