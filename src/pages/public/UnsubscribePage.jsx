// src/pages/public/UnsubscribePage.jsx
// (only the changed parts shown — everything else stays the same)

import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Check, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
// ⬇️ removed `import { supabase } from '@/lib/supabase'` — no longer needed

const BRAND = '#2d568e'

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams()
  const email = (searchParams.get('email') || '').trim().toLowerCase()
  const token = searchParams.get('token') || ''

  const [state, setState] = useState('loading')  // loading | ready | submitting | done | error
  const [errorMsg, setErrorMsg] = useState('')

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const validToken = /^[a-z0-9]{16,64}$/i.test(token)

  useEffect(() => {
    if (!email || !token) {
      setState('error')
      setErrorMsg('This unsubscribe link is missing information. It may have been copied incorrectly.')
      return
    }
    if (!validEmail) {
      setState('error')
      setErrorMsg('This unsubscribe link contains an invalid email address.')
      return
    }
    if (!validToken) {
      setState('error')
      setErrorMsg('This unsubscribe link is invalid or has expired.')
      return
    }
    setState('ready')
  }, [email, token, validEmail, validToken])

  const handleUnsubscribe = async () => {
    setState('submitting')
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token }),
        },
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      setState('done')
      toast.success('You have been unsubscribed.')
    } catch (err) {
      console.error('Unsubscribe failed:', err)
      setState('error')
      setErrorMsg(err?.message || 'Something went wrong. Please try again.')
    }
  }

  // ─────── rest of the component is unchanged ───────
  // (the JSX below was identical before — just pasting it back
  //  so you can drop this whole file in place)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2d568e]/5 via-white to-[#2d568e]/10 px-4 py-12">

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut' }}
          className="absolute -top-40 -right-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 10, ease: 'easeInOut' }}
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative bg-card rounded-2xl shadow-2xl max-w-md w-full border border-border overflow-hidden"
      >
        <div
          className="px-6 py-8 text-center"
          style={{
            background: BRAND,
            backgroundImage: `linear-gradient(135deg, ${BRAND} 0%, #1e3a5f 100%)`,
          }}
        >
          <Link to="/" className="inline-block">
            <img
              src="/Iloilo_rentals_img.png"
              alt="Iloilo Rentals"
              className="w-16 h-16 object-contain mx-auto drop-shadow-lg"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          </Link>
        </div>

        <div className="px-6 py-8">

          {state === 'loading' && (
            <div className="text-center py-6">
              <Loader2 className="w-6 h-6 text-muted-foreground mx-auto animate-spin" />
            </div>
          )}

          {state === 'error' && (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h1 className="text-lg font-bold text-foreground mb-2">Something went wrong</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">{errorMsg}</p>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 mt-6 text-xs font-semibold text-[#2d568e] hover:underline"
              >
                <ArrowLeft size={12} />
                Back to Iloilo Rentals
              </Link>
            </div>
          )}

          {state === 'ready' && (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#2d568e]/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-[#2d568e]" />
              </div>
              <h1 className="text-lg font-bold text-foreground mb-3">
                Unsubscribe from marketing emails?
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                We'll stop sending you promotional emails at:
              </p>
              <p className="text-sm font-mono font-semibold text-foreground bg-muted rounded-md px-3 py-2 mb-6 break-all">
                {email}
              </p>

              <div className="rounded-md bg-muted/40 border border-border p-3 text-left mb-6">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Note:</strong> You'll still receive
                  important booking-related emails (confirmations, check-in details) if you
                  book with us again. This only affects marketing and promo emails.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  className="w-full h-10 rounded-lg bg-[#2d568e] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  Yes, unsubscribe me
                </button>
                <Link
                  to="/"
                  className="w-full h-10 rounded-lg border border-border text-foreground text-sm font-semibold hover:bg-muted active:scale-[0.98] transition-all inline-flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft size={13} />
                  No thanks, take me back
                </Link>
              </div>
            </div>
          )}

          {state === 'submitting' && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 text-[#2d568e] mx-auto animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Processing your request…</p>
            </div>
          )}

          {state === 'done' && (
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4"
              >
                <Check className="w-7 h-7 text-emerald-600" strokeWidth={3} />
              </motion.div>
              <h1 className="text-lg font-bold text-foreground mb-2">You're unsubscribed</h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                We won't send you any more promotional emails. If you change your mind,
                just reply to any of our previous emails and we'll add you back.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2d568e] hover:underline"
              >
                <ArrowLeft size={12} />
                Back to Iloilo Rentals
              </Link>
            </div>
          )}

        </div>

        <div className="px-6 pb-6 pt-2 text-center border-t border-border">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Iloilo Rentals · Connecting You to the Best Rentals in Iloilo
          </p>
        </div>
      </motion.div>
    </div>
  )
}