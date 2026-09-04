import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

export default function AdminRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkAdmin = async () => {
      if (authLoading) return
      
      if (!user) {
        setIsAdmin(false)
        setChecking(false)
        return
      }
      
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle()
        
        if (error) throw error
        
        setIsAdmin(!!data)
      } catch (error) {
        console.error('Admin check error:', error)
        setIsAdmin(false)
      } finally {
        setChecking(false)
      }
    }
    
    checkAdmin()
  }, [user, authLoading])

  if (authLoading || checking)
    return <div className="min-h-screen flex items-center justify-center">Checking permissions...</div>

  return isAdmin ? children : <Navigate to="/" replace />
}