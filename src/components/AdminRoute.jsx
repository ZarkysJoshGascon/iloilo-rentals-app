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
      setIsAdmin(false)
      return
    }
    supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Profile error:', error)
        setIsAdmin(data?.role === 'admin')
      })
  }, [user, authLoading])

  if (authLoading || isAdmin === null)
    return <div className="min-h-screen flex items-center justify-center">Checking permissions...</div>

  return isAdmin ? children : <Navigate to="/" replace />
}