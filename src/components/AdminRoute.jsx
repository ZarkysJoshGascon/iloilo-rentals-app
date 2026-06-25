import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function AdminRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAdmin(false)
      return
    }
    
    // Check admin_users table instead of user_profiles
    supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Admin check error:', error)
          setIsAdmin(false)
          return
        }
        setIsAdmin(!!data)
      })
  }, [user, authLoading])

  if (authLoading || isAdmin === null)
    return <div className="min-h-screen flex items-center justify-center">Checking permissions...</div>

  return isAdmin ? children : <Navigate to="/" replace />
}