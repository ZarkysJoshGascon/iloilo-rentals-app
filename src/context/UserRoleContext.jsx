// src/context/UserRoleContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const UserRoleContext = createContext(null)

export function UserRoleProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [role, setRole] = useState(null)
  const [housekeeper, setHousekeeper] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    if (authLoading) {
      setLoading(true)
      return () => { cancelled = true }
    }

    if (!user) {
      setRole(null)
      setHousekeeper(null)
      setLoading(false)
      return () => { cancelled = true }
    }

    async function detect() {
      setLoading(true)
      try {
        // Only call the linking RPC once per browser session per user.
        // It's a write, and running it on every mount causes a write storm.
        const linkedKey = `hk-linked-${user.id}`
        let alreadyLinked = false
        try {
          alreadyLinked = sessionStorage.getItem(linkedKey) === '1'
        } catch { /* ignore */ }

        if (!alreadyLinked) {
          await supabase
            .rpc('link_housekeeper_on_login')
            .then(() => { try { sessionStorage.setItem(linkedKey, '1') } catch {} }, () => {})
        }

        if (cancelled) return

        const [adminRes, hkRes] = await Promise.all([
          supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
          supabase
            .from('housekeepers')
            .select('id, code, name, email, photo_url, status')
            .eq('user_id', user.id)
            .maybeSingle(),
        ])

        if (cancelled) return

        const isAdmin = !!adminRes.data
        const isHk = !!hkRes.data

        setRole(isAdmin && isHk ? 'both' : isAdmin ? 'admin' : isHk ? 'housekeeper' : 'none')
        setHousekeeper(hkRes.data || null)
      } catch (err) {
        console.error('Role detection failed:', err)
        if (!cancelled) {
          setRole('none')
          setHousekeeper(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    detect()
    return () => { cancelled = true }
  }, [user, authLoading])

  return (
    <UserRoleContext.Provider value={{ role, housekeeper, loading }}>
      {children}
    </UserRoleContext.Provider>
  )
}

export function useUserRole() {
  const ctx = useContext(UserRoleContext)
  if (!ctx) {
    throw new Error('useUserRole must be used inside a UserRoleProvider')
  }
  return ctx
}