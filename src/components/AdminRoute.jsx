import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AdminRoute({ children }) {
  const [isAdmin, setIsAdmin] = useState(null)

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      console.log('User:', user)
      if (error) console.error('Auth error:', error)
      if (!user) {
        setIsAdmin(false)
        return
      }
      const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      console.log('Profile:', data)
      if (profileError) console.error('Profile error:', profileError)
      setIsAdmin(data?.role === 'admin')
    }
    checkAdmin()
  }, [])

  if (isAdmin === null) return <div className="min-h-screen flex items-center justify-center">Checking permissions...</div>
  return isAdmin ? children : <Navigate to="/" replace />
}