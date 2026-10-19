// src/lib/api/publicUploads.ts
// Visitors can't write to the storage buckets themselves. For each photo on
// the List Property or Interior Design form, the inquiry-upload-url function
// hands out a one-time upload link (it picks the file name and limits how
// many an IP and an account get); the photo goes up with that link.
// Both forms need a Google sign-in, so every call sends the visitor's token.
import { supabase } from '@/lib/supabase'

type PublicForm = 'property' | 'interior'

const BUCKETS: Record<PublicForm, string> = {
  property: 'property-inquiry-images',
  interior: 'interior-design-images',
}

/** Headers for the form functions: JSON plus the signed-in visitor's token. */
export async function signedInFormHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Please sign in with Google first.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/** Uploads an already-checked, resized JPEG for a public form. Returns { path, url }. */
export async function uploadPublicFormPhoto(form: PublicForm, jpeg: Blob) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inquiry-upload-url`, {
    method: 'POST',
    headers: await signedInFormHeaders(),
    body: JSON.stringify({ form }),
  })
  const link = await res.json().catch(() => ({}))
  if (!res.ok || !link?.path || !link?.token) throw new Error(link?.error || 'Could not prepare the upload')

  const bucket = BUCKETS[form]
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(link.path, link.token, jpeg, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(link.path)
  return { path: link.path as string, url: data.publicUrl }
}
