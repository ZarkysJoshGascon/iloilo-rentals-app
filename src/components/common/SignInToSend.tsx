// src/components/common/SignInToSend.tsx
// Shown in place of the List Property and Interior Design forms until the
// visitor signs in with Google. The forms reply to the account's verified
// email, and each account can only send a few a day, which keeps spam out.
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Loader2, LogIn, ShieldCheck } from 'lucide-react'

type SignInToSendProps = {
  /** Where to come back to after signing in, e.g. "/list-property". */
  returnTo: string
  /** Still finding out whether the visitor is signed in. */
  checking?: boolean
}

export default function SignInToSend({ returnTo, checking = false }: SignInToSendProps) {
  if (checking) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-12 flex justify-center">
        <Loader2 size={20} className="animate-spin text-[#2d568e]" aria-label="Checking your sign-in" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 md:p-12 text-center"
    >
      <ShieldCheck size={32} className="text-foreground mx-auto mb-4" aria-hidden />
      <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight mb-2">
        Sign in to send your inquiry
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-md mx-auto mb-6">
        We'll reply to the email on your Google account. Signing in takes a few
        seconds and keeps this form safe from spam.
      </p>
      <Link
        to={`/login?redirect=${encodeURIComponent(returnTo)}`}
        className="inline-flex items-center justify-center gap-2 px-6 h-11 rounded-xl bg-[#2d568e] text-white font-semibold text-sm hover:bg-[#1e3a5f] transition-all"
      >
        <LogIn size={14} />
        Sign in with Google
      </Link>
    </motion.div>
  )
}
