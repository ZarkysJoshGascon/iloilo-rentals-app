// src/features/housekeeper/HousekeeperRoute.tsx
// The housekeeping task page is for signed-in housekeepers. Signed-out
// visitors log in and come back here; other accounts go to the home page.
import { Navigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useUserRole } from '@/hooks/useUserRole'
import type { ReactNode } from 'react'

export default function HousekeeperRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { role, loading: roleLoading } = useUserRole()

  if (!authLoading && !user) return <Navigate to="/login?redirect=/housekeeping" replace />
  if (authLoading || roleLoading) {
    return (
      <div role="status" className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#2d568e]" aria-hidden />
        <span className="sr-only">Checking your account</span>
      </div>
    )
  }
  if (role !== 'housekeeper' && role !== 'both') return <Navigate to="/" replace />
  return children
}
