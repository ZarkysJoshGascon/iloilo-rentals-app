import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'

type AuthContextValue = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Check the current session on mount. A saved sign-in that can't be
    // renewed (it expired, or another tab already used its renewal token)
    // comes back as an error: treat it as signed out and clear it from this
    // browser, so it isn't retried on every load. If the check fails
    // outright, the page still leaves its loading state.
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          setUser(null)
          return
        }
        setUser(session?.user ?? null)
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    // 2. Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    signOut,
  }), [user, loading, signOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}