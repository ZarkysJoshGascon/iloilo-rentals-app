import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { Shield, Loader2 } from 'lucide-react'
import { useUserRole } from '@/hooks/useUserRole'
import { useAuth } from '@/context/AuthContext'

export default function PostLoginPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { role, loading: roleLoading } = useUserRole()

  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true })
  }, [authLoading, user, navigate])

  useEffect(() => {
    if (authLoading || roleLoading) return
    // Admins go straight to the CRM. Everyone else lands on the website; the
    // navbar's access menu opens their unit portal or housekeeping tasks.
    if (role === 'admin') navigate('/admin', { replace: true })
    else navigate('/', { replace: true })
  }, [role, roleLoading, authLoading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#2d568e] mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading your account…</p>
      </div>
    </div>
  )
}