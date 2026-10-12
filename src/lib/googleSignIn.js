// src/lib/googleSignIn.js
// Google's own "Sign in with Google" button (Google Identity Services).
// The site talks to Google directly and hands the ID token to Supabase
// (supabase.auth.signInWithIdToken), so Google's account picker names this
// site / "Iloilo Rentals" instead of the Supabase project domain.
//
// Setup: VITE_GOOGLE_CLIENT_ID is the Web client ID from Google Cloud. The same
// ID must be listed under Supabase → Authentication → Providers → Google, and
// the site's origins under the client's "Authorized JavaScript origins".

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
let scriptPromise = null

// Loads Google's script once. Rejects if it can't load (offline, blocked by
// an ad blocker), so the caller can fall back to the redirect sign-in.
export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('Google Identity Services unavailable')))
    script.onerror = () => reject(new Error('Could not load Google Identity Services'))
    document.head.appendChild(script)
  }).catch((err) => {
    scriptPromise = null
    throw err
  })
  return scriptPromise
}

// A random nonce and its SHA-256 hex digest. Google gets the digest and puts
// it in the ID token; Supabase gets the raw value and checks they match, so a
// captured token can't be replayed.
export async function createNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return { raw, hashed }
}
