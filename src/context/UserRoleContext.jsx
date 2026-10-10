// src/context/UserRoleContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const UserRoleContext = createContext(null)

export function UserRoleProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [role, setRole] = useState(null)
  const [housekeeper, setHousekeeper] = useState(null)
  const [staffRoles, setStaffRoles] = useState({
    specialist: null,
    affiliate: null,
    housekeeper: null,
    propertyManager: null,
  })
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
      setStaffRoles({ specialist: null, affiliate: null, housekeeper: null, propertyManager: null })
      setLoading(false)
      return () => { cancelled = true }
    }

    async function detect() {
      setLoading(true)
      try {
        // Run the linking RPC once per browser session per user.
        // It links the current user_id into any staff row matching their email.
        const linkedKey = `staff-linked-${user.id}`
        let alreadyLinked = false
        try {
          alreadyLinked = sessionStorage.getItem(linkedKey) === '1'
        } catch { /* ignore */ }

        if (!alreadyLinked) {
          await supabase
            .rpc('link_staff_on_login')
            .then(() => {
              try { sessionStorage.setItem(linkedKey, '1') } catch { /* ignore */ }
            }, () => { /* swallow — not fatal */ })
        }

        if (cancelled) return

        // Fetch admin row + all four staff rows in parallel
        const [adminRes, specRes, affRes, hkRes, pmRes] = await Promise.all([
          supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
          supabase.from('specialists').select('id, code, name, email, photo_url').eq('user_id', user.id).maybeSingle(),
          supabase.from('affiliates').select('id, code, name, email, photo_url').eq('user_id', user.id).maybeSingle(),
          supabase
            .from('housekeepers')
            .select('id, code, name, email, photo_url, status')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase.from('property_managers').select('id, code, name, email, photo_url').eq('user_id', user.id).maybeSingle(),
        ])

        if (cancelled) return

        const isAdmin = !!adminRes.data
        const isHk = !!hkRes.data

        setStaffRoles({
          specialist: specRes.data || null,
          affiliate: affRes.data || null,
          housekeeper: hkRes.data || null,
          propertyManager: pmRes.data || null,
        })

        setHousekeeper(hkRes.data || null)

        // Primary role (used by App.jsx to route into admin/housekeeper/landing).
        // Admin wins, then housekeeper, then any other staff role = housekeeper tier.
        // If user is only a specialist/affiliate/PM, they land on the public site
        // but their identity is now linked (staffRoles carries the data).
        let primary = 'none'
        if (isAdmin && isHk) primary = 'both'
        else if (isAdmin) primary = 'admin'
        else if (isHk) primary = 'housekeeper'

        setRole(primary)
      } catch (err) {
        console.error('Role detection failed:', err)
        if (!cancelled) {
          setRole('none')
          setHousekeeper(null)
          setStaffRoles({ specialist: null, affiliate: null, housekeeper: null, propertyManager: null })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    detect()
    return () => { cancelled = true }
  }, [user, authLoading])

  return (
    <UserRoleContext.Provider value={{ role, housekeeper, staffRoles, loading }}>
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