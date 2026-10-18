// src/features/admin/team/CrmAccessPanel.tsx
// People → Team → CRM access: who can open the CRM, managed here instead of
// in Supabase. An admin adds someone by email; if they have signed in before
// they get access at once, otherwise the first time they sign in with Google
// (crm_access_add / link_staff_on_login). Everyone on the list can also view
// the backup Google Sheet: that access follows this list automatically, and
// is applied right after each change (backup-to-sheets, mode "share").
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Panel, PanelHeader, InitialsAvatar } from '@/components/crm/Panel'

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Bring the backup sheet's viewers in line with the list. Quiet on success.
async function syncSheetAccess() {
  const { data, error } = await supabase.functions.invoke('backup-to-sheets', { body: { mode: 'share' } })
  if (error || data?.sharing?.failed?.length) {
    toast.error('Saved. The backup sheet will catch up within the hour.')
  }
}

type CrmAccessPanelProps = {
  onCount: (...args: any[]) => any
}

export default function CrmAccessPanel({ onCount }: CrmAccessPanelProps) {
  const [people, setPeople] = useState(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(null) // 'add', or the email being removed

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('crm_access_list')
    if (error) {
      toast.error('Could not load CRM access')
      setPeople([])
      return
    }
    // Active first, then invites; each by name or email.
    const sorted = [...(data || [])].sort((a, b) =>
      a.status === b.status
        ? (a.name || a.email).localeCompare(b.name || b.email)
        : a.status === 'active' ? -1 : 1)
    setPeople(sorted)
    onCount?.(sorted.length)
  }, [onCount])

  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e.preventDefault()
    const value = email.trim().toLowerCase()
    if (!value || busy) return
    setBusy('add')
    try {
      const { data, error } = await supabase.rpc('crm_access_add', { p_email: value })
      if (error) throw error
      setEmail('')
      if (data === 'already') toast(`${value} already has CRM access`)
      else if (data === 'added') toast.success(`${value} can now open the CRM`)
      else toast.success(`${value} will get access the first time they sign in with Google`)
      await load()
      if (data !== 'already') await syncSheetAccess()
    } catch (err) {
      toast.error(err?.message || 'Could not give access')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (person) => {
    const who = person.name ? `${person.name} (${person.email})` : person.email
    const what = person.status === 'invited' ? 'Cancel the invite for' : 'Remove CRM access for'
    if (!window.confirm(`${what} ${who}?\n\nThey will also lose access to the backup sheet.`)) return
    setBusy(person.email)
    try {
      const { error } = await supabase.rpc('crm_access_remove', { p_email: person.email })
      if (error) throw error
      toast.success(person.status === 'invited' ? 'Invite cancelled' : 'Access removed')
      await load()
      await syncSheetAccess()
    } catch (err) {
      toast.error(err?.message || 'Could not remove access')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <Panel>
        <PanelHeader
          icon={ShieldCheck}
          title="CRM access"
          subtitle="Everyone here can open the CRM and view the backup sheet"
          count={people?.length}
        />

        <form onSubmit={add} className="px-5 py-4 border-b border-border flex flex-col sm:flex-row gap-2">
          <label htmlFor="crm-access-email" className="sr-only">Email address</label>
          <input
            id="crm-access-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Their Google account, e.g. name@gmail.com"
            className="flex-1 h-9 px-3 rounded-md border border-border bg-card text-[13px] text-foreground placeholder:text-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            type="submit"
            disabled={busy === 'add' || !email.trim()}
            className="h-9 px-4 rounded-md text-[12px] font-semibold text-white bg-brand-solid hover:bg-brand-solid/90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Give access
          </button>
        </form>

        {people === null ? (
          <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-foreground" /></div>
        ) : people.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-foreground">Nobody yet.</p>
        ) : (
          <ul>
            {people.map((p) => (
              <li key={p.email} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0">
                <InitialsAvatar name={p.name || p.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {p.name || p.email}
                    {p.is_you && <span className="ml-1.5 text-[11.5px] font-medium">(you)</span>}
                  </p>
                  {p.name && <p className="text-[11.5px] text-foreground truncate">{p.email}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {p.status === 'active' ? (
                    <>
                      <p className="text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">Active</p>
                      {p.last_sign_in_at && <p className="text-[11px] text-foreground">Last signed in {formatDate(p.last_sign_in_at)}</p>}
                    </>
                  ) : (
                    <>
                      <p className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">Invited</p>
                      <p className="text-[11px] text-foreground">Gets access at first sign-in</p>
                    </>
                  )}
                </div>
                {!p.is_you && (
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    disabled={!!busy}
                    title={p.status === 'invited' ? 'Cancel invite' : 'Remove access'}
                    aria-label={p.status === 'invited' ? `Cancel invite for ${p.email}` : `Remove access for ${p.email}`}
                    className="p-2 rounded-md text-foreground hover:text-red-600 hover:bg-muted/60 disabled:opacity-40 flex-shrink-0"
                  >
                    {busy === p.email ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="px-5 py-3 text-[11.5px] text-foreground border-t border-border leading-relaxed">
          Use the Google account they sign in with. They can view the backup sheet as soon as they're added,
          and lose that access if they're removed. Shares you make yourself in Google Sheets aren't affected.
        </p>
      </Panel>
    </div>
  )
}
