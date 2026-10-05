import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Send, Loader2, Check, Plus, X, Image as ImageIcon,
  ArrowLeft, MapPin, Home,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { uploadInquiryImage, submitPropertyInquiry } from '@/lib/inquiries'

const BRAND = '#2d568e'
const MAX_IMAGES = 5

const PROPERTY_TYPES = [
  'Studio',
  '1-Bedroom',
  '2-Bedroom',
  '3-Bedroom',
  'Executive Studio',
  'Penthouse',
  'Commercial',
  'Other',
]

const INQUIRY_TYPES = [
  { id: 'manage', label: 'Manage my property',    desc: 'Rent it out, we handle guests & cleaning' },
  { id: 'sell',   label: 'Help me sell it',       desc: 'Find buyers, handle the transaction' },
  { id: 'both',   label: "Not sure — let's talk", desc: 'Discuss both options with our team' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ListPropertyPage() {
  const [form, setForm] = useState({
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    property_type: '',
    building: '',
    location: '',
    bedrooms: '',
    bathrooms: '',
    square_meters: '',
    price_per_night: '',
    inquiry_type: 'manage',
    message: '',
  })

  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Honeypot only — Turnstile removed
  const [honeypot, setHoneypot] = useState('')

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleImagePick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const remaining = MAX_IMAGES - images.length
    if (files.length > remaining) {
      toast.error(`Max ${MAX_IMAGES} images. ${remaining} slot${remaining === 1 ? '' : 's'} left.`)
    }

    const toAdd = files.slice(0, remaining)
    setUploading(true)

    for (const file of toAdd) {
      try {
        const preview = URL.createObjectURL(file)
        const { url, path } = await uploadInquiryImage(file)
        setImages((prev) => [...prev, { file, preview, uploadedUrl: url, path }])
      } catch (err) {
        console.error(err)
        toast.error(err?.message || 'Upload failed')
      }
    }

    setUploading(false)
    if (e.target) e.target.value = ''
  }

  const removeImage = (idx) => {
    setImages((prev) => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[idx].preview)
      copy.splice(idx, 1)
      return copy
    })
  }

  const validate = () => {
    if (!form.owner_name.trim())  { toast.error('Your name is required'); return false }
    if (!form.owner_email.trim()) { toast.error('Email is required'); return false }
    if (!EMAIL_RE.test(form.owner_email.trim())) { toast.error('Please enter a valid email'); return false }
    if (!form.inquiry_type)       { toast.error('Please pick an option'); return false }
    if (form.message.trim().length < 10) { toast.error('Please add a short message (at least 10 characters)'); return false }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      await submitPropertyInquiry({
        ...form,
        bedrooms:       form.bedrooms ? Number(form.bedrooms) : null,
        bathrooms:      form.bathrooms ? Number(form.bathrooms) : null,
        square_meters:  form.square_meters ? Number(form.square_meters) : null,
        price_per_night: form.price_per_night ? Number(form.price_per_night) : null,
        images: images.map((i) => ({ path: i.path, url: i.uploadedUrl })),
        website_url: honeypot,
        cf_turnstile_token: '',
      })
      setSubmitted(true)
    } catch (err) {
      console.error(err)
      toast.error(err?.message || 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    images.forEach((i) => URL.revokeObjectURL(i.preview))
    setForm({
      owner_name: '', owner_email: '', owner_phone: '',
      property_type: '', building: '', location: '',
      bedrooms: '', bathrooms: '', square_meters: '', price_per_night: '',
      inquiry_type: 'manage', message: '',
    })
    setImages([])
    setSubmitted(false)
  }

  const labelClass = 'text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1.5 block'
  const inputClass = 'w-full h-10 text-sm rounded-xl border border-gray-200 bg-white px-3.5 focus:outline-none focus:ring-2 focus:ring-[#2d568e]/30 focus:border-[#2d568e] transition-all placeholder:text-gray-400'

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2d568e]/5 via-white to-[#2d568e]/10 pb-24 md:pb-12 pt-20 md:pt-28">

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut' }}
          className="absolute -top-40 -right-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 10, ease: 'easeInOut' }}
          className="absolute top-1/3 -left-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"
        />
      </div>

      <div className="relative max-w-3xl mx-auto px-4">

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3">
            List your property with us
          </h1>
          <p className="text-gray-500 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
            Own a condo in Iloilo? Tell us about it. We'll reach out within 24 hours to see if we're a fit.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {submitted ? (
            <SuccessState key="success" onReset={resetForm} />
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
            >

              <Section title="Your contact" subtitle="So we can reach you">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full name *</label>
                    <input
                      type="text"
                      value={form.owner_name}
                      onChange={(e) => setField('owner_name', e.target.value)}
                      placeholder="Juan Dela Cruz"
                      maxLength={120}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email *</label>
                    <input
                      type="email"
                      value={form.owner_email}
                      onChange={(e) => setField('owner_email', e.target.value)}
                      placeholder="you@example.com"
                      maxLength={254}
                      className={inputClass}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Phone (optional)</label>
                    <input
                      type="tel"
                      value={form.owner_phone}
                      onChange={(e) => setField('owner_phone', e.target.value)}
                      placeholder="+63 917 123 4567"
                      maxLength={40}
                      className={inputClass}
                    />
                  </div>
                </div>
              </Section>

              <Section title="What are you looking for?" subtitle="Pick the one that fits best">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {INQUIRY_TYPES.map((opt) => {
                    const active = form.inquiry_type === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setField('inquiry_type', opt.id)}
                        className={cn(
                          'text-left p-4 rounded-xl border-2 transition-all',
                          active
                            ? 'border-[#2d568e] bg-[#2d568e]/5 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className={cn(
                            'text-sm font-bold',
                            active ? 'text-[#2d568e]' : 'text-gray-800',
                          )}>
                            {opt.label}
                          </span>
                          {active && (
                            <div className="w-4 h-4 rounded-full bg-[#2d568e] flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Check size={10} className="text-white" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">{opt.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </Section>

              <Section title="About your property" subtitle="Optional — but it helps us prepare">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Property type</label>
                    <select
                      value={form.property_type}
                      onChange={(e) => setField('property_type', e.target.value)}
                      className={cn(inputClass, 'appearance-none cursor-pointer')}
                    >
                      <option value="">Select a type…</option>
                      {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Building</label>
                    <input
                      type="text"
                      value={form.building}
                      onChange={(e) => setField('building', e.target.value)}
                      placeholder="e.g. One Madison"
                      maxLength={120}
                      className={inputClass}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Location / Address</label>
                    <div className="relative">
                      <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={form.location}
                        onChange={(e) => setField('location', e.target.value)}
                        placeholder="e.g. Mandurriao, Iloilo City"
                        maxLength={200}
                        className={cn(inputClass, 'pl-10')}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:col-span-2">
                    <div>
                      <label className={labelClass}>Bedrooms</label>
                      <input
                        type="number" min={0} max={20}
                        value={form.bedrooms}
                        onChange={(e) => setField('bedrooms', e.target.value)}
                        placeholder="1"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Bathrooms</label>
                      <input
                        type="number" min={0} max={20}
                        value={form.bathrooms}
                        onChange={(e) => setField('bathrooms', e.target.value)}
                        placeholder="1"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Sqm</label>
                      <input
                        type="number" min={0} max={10000}
                        value={form.square_meters}
                        onChange={(e) => setField('square_meters', e.target.value)}
                        placeholder="30"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Nightly price (₱)</label>
                      <input
                        type="number" min={0} max={1000000}
                        value={form.price_per_night}
                        onChange={(e) => setField('price_per_night', e.target.value)}
                        placeholder="2500"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </Section>

              <Section
                title="Anything else?"
                subtitle="Tell us about your goals, timeline, or anything we should know"
              >
                <textarea
                  value={form.message}
                  onChange={(e) => setField('message', e.target.value)}
                  placeholder="e.g. I'm the owner of a 1-bedroom at Avida Towers. Looking for full management — guests, cleaning, everything. I'd like to discuss rates this week."
                  rows={5}
                  maxLength={2000}
                  className={cn(inputClass, 'h-auto resize-none py-3 leading-relaxed')}
                />
                <p className="text-[10px] text-gray-400 mt-1 text-right tabular-nums">
                  {form.message.length} / 2,000
                </p>
              </Section>

              <Section
                title="Photos (optional)"
                subtitle={`Up to ${MAX_IMAGES} images — helps us understand your space`}
                isLast
              >
                <input
                  type="file"
                  id="inquiry-images"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleImagePick}
                  disabled={uploading || images.length >= MAX_IMAGES}
                />

                {images.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-3">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 group">
                        <img src={img.preview} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {images.length < MAX_IMAGES && (
                  <label
                    htmlFor="inquiry-images"
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#2d568e]/50 hover:bg-[#2d568e]/5 transition-colors cursor-pointer',
                      (uploading || images.length >= MAX_IMAGES) && 'opacity-50 pointer-events-none',
                    )}
                  >
                    {uploading ? (
                      <Loader2 size={18} className="animate-spin text-[#2d568e]" />
                    ) : (
                      <ImageIcon size={18} className="text-gray-400" />
                    )}
                    <span className="text-xs font-semibold text-gray-600">
                      {uploading ? 'Uploading…' : 'Add photos'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {images.length}/{MAX_IMAGES} · JPEG, PNG, WebP · max 5 MB each
                    </span>
                  </label>
                )}
              </Section>

              <div
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
                aria-hidden="true"
              >
                <label htmlFor="website_url">Website URL (leave empty)</label>
                <input
                  type="text"
                  id="website_url"
                  name="website_url"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-xl bg-[#2d568e] text-white font-bold text-sm hover:bg-[#1e3a5f] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#2d568e]/20 active:scale-[0.99]"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending your inquiry…
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Send inquiry
                    </>
                  )}
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-3 leading-relaxed">
                  We'll reply within 24 hours. Your info stays private and we never share it.
                </p>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {!submitted && (
          <div className="mt-6 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#2d568e] transition-colors"
            >
              <ArrowLeft size={12} />
              Back to home
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, subtitle, children, isLast = false }) {
  return (
    <div className={cn('p-6 md:p-8', !isLast && 'border-b border-gray-100')}>
      <div className="mb-5">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function SuccessState({ onReset }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 md:p-12 text-center"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6"
      >
        <Check size={40} className="text-emerald-600" strokeWidth={3} />
      </motion.div>

      <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mb-3">
        Thank you!
      </h2>

      <p className="text-gray-500 text-sm md:text-base leading-relaxed max-w-md mx-auto mb-8">
        Your inquiry has been sent to our team. We'll review it and get back to you{' '}
        <strong className="text-gray-700">within 24 hours</strong> at the email you provided.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-11 rounded-xl bg-[#2d568e] text-white font-semibold text-sm hover:bg-[#1e3a5f] transition-all"
        >
          <Home size={14} />
          Back to home
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 h-11 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-all"
        >
          <Plus size={14} />
          Submit another
        </button>
      </div>
    </motion.div>
  )
}