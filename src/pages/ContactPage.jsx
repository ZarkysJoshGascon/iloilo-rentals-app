import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function Contactpage() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.from('contact_messages').insert([{ ...formData, created_at: new Date() }])
      if (error) throw error
      toast.success('Message sent! We will get back to you soon.')
      setFormData({ name: '', email: '', message: '' })
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to send message. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4">Contact Us</h1>
          <p className="text-base md:text-xl text-white/90 max-w-2xl mx-auto">
            We'd love to hear from you. Reach out with any questions or booking inquiries.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
              <h2 className="text-xl md:text-2xl font-bold text-[#2d568e] mb-4 md:mb-6">Get in Touch</h2>
              <div className="space-y-4 md:space-y-5">
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="bg-[#2d568e]/10 p-2 md:p-3 rounded-xl"><MapPin className="text-[#2d568e]" size={20} /></div>
                  <div><h3 className="font-semibold text-gray-800 text-base md:text-lg mb-1">Visit Us</h3><p className="text-gray-600 text-sm md:text-base">Megaworld Boulevard, Iloilo City, Philippines 5000</p></div>
                </div>
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="bg-[#2d568e]/10 p-2 md:p-3 rounded-xl"><Phone className="text-[#2d568e]" size={20} /></div>
                  <div><h3 className="font-semibold text-gray-800 text-base md:text-lg mb-1">Call Us</h3><p className="text-gray-600 text-sm md:text-base">+63 (33) 123-4567</p><p className="text-gray-500 text-xs md:text-sm">Mon-Fri, 9AM-6PM</p></div>
                </div>
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="bg-[#2d568e]/10 p-2 md:p-3 rounded-xl"><Mail className="text-[#2d568e]" size={20} /></div>
                  <div><h3 className="font-semibold text-gray-800 text-base md:text-lg mb-1">Email Us</h3><p className="text-gray-600 text-sm md:text-base">info@iloilorentals.com</p><p className="text-gray-500 text-xs md:text-sm">We'll respond within 24h</p></div>
                </div>
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="bg-[#2d568e]/10 p-2 md:p-3 rounded-xl"><Clock className="text-[#2d568e]" size={20} /></div>
                  <div><h3 className="font-semibold text-gray-800 text-base md:text-lg mb-1">Business Hours</h3><p className="text-gray-600 text-sm md:text-base">Mon-Fri: 9AM-6PM<br />Sat: 10AM-4PM<br />Sun: Closed</p></div>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
              <h2 className="text-lg md:text-xl font-bold text-[#2d568e] mb-3 md:mb-4">Location Map</h2>
              <div className="bg-gray-200 rounded-xl h-40 md:h-48 flex items-center justify-center">
                <MapPin className="text-gray-400" size={28} /><span className="ml-2 text-gray-500 text-sm">Iloilo City Map</span>
              </div>
              <p className="text-gray-500 text-xs md:text-sm mt-3 text-center">We are located in the heart of Iloilo Business District</p>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <h2 className="text-xl md:text-2xl font-bold text-[#2d568e] mb-4 md:mb-6">Send a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name</label>
                <input type="text" required className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base focus:ring-2 focus:ring-[#2d568e]" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                <input type="email" required className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base focus:ring-2 focus:ring-[#2d568e]" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
                <textarea rows="4" required className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base focus:ring-2 focus:ring-[#2d568e] resize-none" value={formData.message} onChange={(e) => setFormData({...formData, message: e.target.value})} />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm md:text-base">
                <Send size={18} /> {loading ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}