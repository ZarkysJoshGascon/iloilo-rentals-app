import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Database, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_BACKUP_SHEET_ID || ''}`

function timeAgo(iso) {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function BackupStatusStrip() {
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const fetchLatest = useCallback(async () => {
    const { data } = await supabase
      .from('backup_runs')
      .select('id, started_at, status, row_counts, duration_ms, trigger_source')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLatest(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLatest()
    const t = setInterval(fetchLatest, 60_000)
    return () => clearInterval(t)
  }, [fetchLatest])

  const runNow = async () => {
    if (running) return
    setRunning(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-to-sheets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: '{}',
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      toast.success(`Backup complete · ${body.duration_ms}ms`)
      await fetchLatest()
    } catch (err) {
      toast.error(err?.message || 'Backup failed')
    } finally {
      setRunning(false)
    }
  }

  const totalRows = latest?.row_counts
    ? Object.values(latest.row_counts).reduce((s, v) => s + (Number(v) || 0), 0)
    : 0

  const statusColor =
    latest?.status === 'success' ? 'text-emerald-600 dark:text-emerald-400'
    : latest?.status === 'partial' ? 'text-amber-600 dark:text-amber-400'
    : latest?.status === 'failed' ? 'text-red-600 dark:text-red-400'
    : 'text-muted-foreground'

  return (
    <div className="rounded-md bg-card border border-border shadow-sm p-4 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn('w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0',
          latest?.status === 'success' ? 'bg-emerald-500/10'
          : latest?.status === 'failed' ? 'bg-red-500/10'
          : 'bg-muted')}>
          {latest?.status === 'success'
            ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            : latest?.status === 'failed'
              ? <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
              : <Database size={16} className="text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground truncate">
            Google Sheets Backup
            <span className={cn('ml-2 font-normal', statusColor)}>· {latest?.status || 'unknown'}</span>
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {loading ? 'Loading…'
              : latest?.started_at
                ? `Last run: ${timeAgo(latest.started_at)} · ${totalRows.toLocaleString()} rows`
                : 'No runs yet'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {!SHEET_URL.includes('undefined') && (
          <a href={SHEET_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-[11px] font-semibold text-foreground hover:bg-muted/40 transition-colors">
            <ExternalLink size={11} /> Open sheet
          </a>
        )}
        <button type="button" onClick={runNow} disabled={running}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11px] font-semibold text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#2d568e' }}>
          {running ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>
    </div>
  )
}