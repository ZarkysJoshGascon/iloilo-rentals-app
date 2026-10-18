import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

export default function Contactpage() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  // Hidden from people; bots fill it in and their message is dropped.
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [loading, setLoading] = useState(false)

  // Sent to the submit-contact-message function, which checks every field,
  // limits how often one visitor can write, and saves it.
  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-contact-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, website_url: websiteUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to send message.')
      toast.success('Message sent!'); setFormData({ name: '', email: '', message: '' })
    } catch (err) { toast.error(err?.message || 'Failed to send message.') }
    finally { setLoading(false) }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pb-24 md:pb-0">
      <motion.div initial={{ scale: 1.05, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] text-white pt-16 md:pt-20 pb-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4"><Phone size={28} className="text-white" /></motion.div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Contact Us</h1>
          <p className="text-white/70 text-sm max-w-md mx-auto">We'd love to hear from you. Reach out with any questions or booking inquiries.</p>
        </div>
      </motion.div>
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-[#2d568e] mb-4">Get in Touch</h2>
              <div className="space-y-4">
                {[
                  { icon: MapPin, title: "Visit Us", detail: "Megaworld Boulevard, Iloilo City, Philippines 5000" },
                  { icon: Phone, title: "Call Us", detail: "+63 (33) 123-4567", sub: "Mon-Fri, 9AM-6PM" },
                  // iloilorentals.com belongs to another company, so its address can't be shown
                  // here; until iloilorental.com has a mailbox, visitors use the form.
                  { icon: Mail, title: "Message Us", detail: "Use the form on this page", sub: "We'll respond within 24h" },
                  { icon: Clock, title: "Business Hours", detail: "Mon-Fri: 9AM-6PM • Sat: 10AM-4PM • Sun: Closed" }
                ].map((item, idx) => (
                  <motion.div key={idx} whileHover={{ x: 5 }} className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-[#2d568e]/10 rounded-lg flex items-center justify-center flex-shrink-0"><item.icon size={16} className="text-[#2d568e]" /></div>
                    <div><h3 className="font-semibold text-gray-800 text-sm">{item.title}</h3><p className="text-gray-600 text-xs">{item.detail}</p>{item.sub && <p className="text-gray-400 text-xs mt-0.5">{item.sub}</p>}</div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"><h2 className="text-lg font-bold text-[#2d568e] mb-3">Location</h2><div className="bg-gray-100 rounded-xl h-40 flex items-center justify-center"><MapPin size={24} className="text-gray-400" /><span className="ml-2 text-gray-500 text-sm">Iloilo City Map</span></div></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-[#2d568e] mb-4">Send a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Honeypot: off screen and skipped by keyboards and screen readers. */}
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label>Website<input type="text" name="website_url" tabIndex={-1} autoComplete="off" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} /></label>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label><input type="text" required maxLength={120} autoComplete="name" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label><input type="email" required maxLength={254} autoComplete="email" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Message</label><textarea rows={4} required maxLength={5000} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent resize-none" value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} /></div>
              <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"><Send size={16} />{loading ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : 'Send Message'}</motion.button>
            </form>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}