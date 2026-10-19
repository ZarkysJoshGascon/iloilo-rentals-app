// supabase/functions/_shared/visitor.ts
// The List Property and Interior Design forms need a Google sign-in. This
// reads the visitor's session token from the Authorization header and asks
// Supabase Auth whose it is. The anon key isn't an account, and only a
// Google sign-in counts, so the email saved on an inquiry is one Google has
// verified and can't be someone else's.

import type { SupabaseClient, User } from 'https://esm.sh/@supabase/supabase-js@2'

export async function signedInGoogleUser(req: Request, supabase: SupabaseClient): Promise<User | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)
  const user = data?.user
  if (error || !user || user.is_anonymous || !user.email || !user.email_confirmed_at) return null

  const providers: string[] = user.app_metadata?.providers || [user.app_metadata?.provider].filter(Boolean)
  const google = providers.includes('google') || (user.identities || []).some((i) => i.provider === 'google')
  return google ? user : null
}
