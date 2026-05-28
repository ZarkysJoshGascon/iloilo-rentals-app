import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'
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

  const fadeInUp = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  }

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-50"
    >
      {/* Hero Section */}
      <motion.div 
        initial={{ scale: 1.1, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-12 md:py-16"
      >
        <div className="max-w-6xl mx-auto px-4 text-center">
          <motion.h1 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4"
          >
            Contact Us
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-base md:text-xl text-white/90 max-w-2xl mx-auto"
          >
            We'd love to hear from you. Reach out with any questions or booking inquiries.
          </motion.p>
        </div>
      </motion.div>

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-6 md:gap-8"
        >
          {/* Contact Info */}
          <motion.div variants={fadeInUp} className="space-y-6">
            <motion.div 
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="bg-white rounded-2xl shadow-lg p-6 md:p-8"
            >
              <h2 className="text-xl md:text-2xl font-bold text-[#2d568e] mb-4 md:mb-6">Get in Touch</h2>
              <div className="space-y-4 md:space-y-5">
                {[
                  { icon: MapPin, title: "Visit Us", detail: "Megaworld Boulevard, Iloilo City, Philippines 5000" },
                  { icon: Phone, title: "Call Us", detail: "+63 (33) 123-4567", sub: "Mon-Fri, 9AM-6PM" },
                  { icon: Mail, title: "Email Us", detail: "info@iloilorentals.com", sub: "We'll respond within 24h" },
                  { icon: Clock, title: "Business Hours", detail: "Mon-Fri: 9AM-6PM\nSat: 10AM-4PM\nSun: Closed" }
                ].map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ x: -20, opacity: 0 }}
                    whileInView={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    whileHover={{ x: 10 }}
                    className="flex items-start gap-3 md:gap-4"
                  >
                    <motion.div 
                      whileHover={{ scale: 1.1, rotate: 360 }}
                      transition={{ duration: 0.3 }}
                      className="bg-[#2d568e]/10 p-2 md:p-3 rounded-xl"
                    >
                      <item.icon className="text-[#2d568e]" size={20} />
                    </motion.div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-base md:text-lg mb-1">{item.title}</h3>
                      <p className="text-gray-600 text-sm md:text-base">{item.detail}</p>
                      {item.sub && <p className="text-gray-500 text-xs md:text-sm">{item.sub}</p>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            {/* Map */}
            <motion.div 
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="bg-white rounded-2xl shadow-lg p-6 md:p-8"
            >
              <h2 className="text-lg md:text-xl font-bold text-[#2d568e] mb-3 md:mb-4">Location Map</h2>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className="bg-gray-200 rounded-xl h-40 md:h-48 flex items-center justify-center"
              >
                <MapPin className="text-gray-400" size={28} />
                <span className="ml-2 text-gray-500 text-sm">Iloilo City Map</span>
              </motion.div>
              <p className="text-gray-500 text-xs md:text-sm mt-3 text-center">We are located in the heart of Iloilo Business District</p>
            </motion.div>
          </motion.div>
          
          {/* Contact Form */}
          <motion.div 
            variants={fadeInUp}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className="bg-white rounded-2xl shadow-lg p-6 md:p-8"
          >
            <h2 className="text-xl md:text-2xl font-bold text-[#2d568e] mb-4 md:mb-6">Send a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                viewport={{ once: true }}
              >
                <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name</label>
                <input 
                  type="text" 
                  required 
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base focus:ring-2 focus:ring-[#2d568e] focus:border-transparent transition-all" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                />
              </motion.div>
              
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                viewport={{ once: true }}
              >
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                <input 
                  type="email" 
                  required 
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base focus:ring-2 focus:ring-[#2d568e] focus:border-transparent transition-all" 
                  value={formData.email} 
                  onChange={(e) => setFormData({...formData, email: e.target.value})} 
                />
              </motion.div>
              
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                viewport={{ once: true }}
              >
                <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
                <textarea 
                  rows="4" 
                  required 
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm md:text-base focus:ring-2 focus:ring-[#2d568e] focus:border-transparent transition-all resize-none" 
                  value={formData.message} 
                  onChange={(e) => setFormData({...formData, message: e.target.value})} 
                />
              </motion.div>
              
              <motion.button 
                type="submit" 
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm md:text-base"
              >
                <Send size={18} /> 
                {loading ? (
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                ) : 'Send Message'}
              </motion.button>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}