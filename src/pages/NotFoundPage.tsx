// src/pages/NotFoundPage.tsx
// Any address the site doesn't have: says so plainly and offers the way back,
// instead of an empty page.
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = 'Page not found · Iloilo Rentals'
  }, [])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pb-24 md:pb-0">
      <div className="bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] text-white pt-16 md:pt-20 pb-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <Compass size={40} strokeWidth={1.4} className="text-white mx-auto mb-4" aria-hidden />
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Page not found</h1>
          <p className="text-white/80 text-sm break-all">There's nothing at {pathname}.</p>
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-700">The link may be old or mistyped. These will get you back on track:</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="inline-flex items-center h-11 px-5 rounded-xl bg-[#2d568e] text-white text-sm font-semibold hover:bg-[#244876] transition-colors">
            Go to the homepage
          </Link>
          <Link to="/contact" className="inline-flex items-center h-11 px-5 rounded-xl border border-gray-300 bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 transition-colors">
            Contact us
          </Link>
        </div>
      </div>
    </motion.div>
  )
}
