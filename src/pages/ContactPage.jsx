import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function Contactpage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      // Save to Supabase
      const { error } = await supabase
        .from('contact_messages')
        .insert([
          {
            name: formData.name,
            email: formData.email,
            message: formData.message,
            created_at: new Date()
          }
        ])
      
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
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            We'd love to hear from you. Reach out with any questions or booking inquiries.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Contact Information */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-[#2d568e] mb-6">Get in Touch</h2>
              
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="bg-[#2d568e]/10 p-3 rounded-xl">
                    <MapPin className="text-[#2d568e]" size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg mb-1">Visit Us</h3>
                    <p className="text-gray-600">Megaworld Boulevard, Iloilo City, Philippines 5000</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="bg-[#2d568e]/10 p-3 rounded-xl">
                    <Phone className="text-[#2d568e]" size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg mb-1">Call Us</h3>
                    <p className="text-gray-600">+63 (33) 123-4567</p>
                    <p className="text-gray-500 text-sm">Monday - Friday, 9:00 AM - 6:00 PM</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="bg-[#2d568e]/10 p-3 rounded-xl">
                    <Mail className="text-[#2d568e]" size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg mb-1">Email Us</h3>
                    <p className="text-gray-600">info@iloilorentals.com</p>
                    <p className="text-gray-500 text-sm">We'll respond within 24 hours</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="bg-[#2d568e]/10 p-3 rounded-xl">
                    <Clock className="text-[#2d568e]" size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg mb-1">Business Hours</h3>
                    <p className="text-gray-600">Monday - Friday: 9:00 AM - 6:00 PM</p>
                    <p className="text-gray-600">Saturday: 10:00 AM - 4:00 PM</p>
                    <p className="text-gray-600">Sunday: Closed</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Map Placeholder */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-bold text-[#2d568e] mb-4">Location Map</h2>
              <div className="bg-gray-200 rounded-xl h-48 flex items-center justify-center">
                <MapPin className="text-gray-400" size={32} />
                <span className="ml-2 text-gray-500">Iloilo City Map</span>
              </div>
              <p className="text-gray-500 text-sm mt-3 text-center">
                We are located in the heart of Iloilo Business District
              </p>
            </div>
          </div>
          
          {/* Contact Form */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-6">Send a Message</h2>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2d568e] focus:border-transparent text-gray-800"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2d568e] focus:border-transparent text-gray-800"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
                <textarea
                  rows="5"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#2d568e] focus:border-transparent resize-none text-gray-800"
                  value={formData.message}
                  onChange={(e) => setFormData({...formData, message: e.target.value})}
                ></textarea>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send size={18} />
                {loading ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}