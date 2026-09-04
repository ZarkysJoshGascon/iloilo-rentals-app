import { motion } from 'framer-motion'
import { FileText, Home, Shield, AlertCircle, Scale, Globe, Edit, Users } from 'lucide-react'

export default function TermsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pb-24 md:pb-0">
      <motion.div initial={{ scale: 1.05, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] text-white pt-16 md:pt-20 pb-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText size={28} className="text-white" />
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Terms & Conditions</h1>
          <p className="text-white/70 text-sm">Last updated: May 2025</p>
        </div>
      </motion.div>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-8">
          {[
            { icon: Home, title: 'Use of Website', content: <div className="space-y-2 text-gray-600 text-sm"><p>1.1 The Website is provided for informational and booking purposes.</p><p>1.2 You must be at least 18 years old.</p><p>1.3 No unlawful use.</p></div> },
            { icon: Home, title: 'Accommodation Booking', content: <div className="space-y-2 text-gray-600 text-sm"><p>2.1 Browse and book accommodations.</p><p>2.2 Subject to availability.</p><p>2.3 Additional terms apply.</p></div> },
            { icon: Shield, title: 'Intellectual Property', content: <div className="space-y-2 text-gray-600 text-sm"><p>3.1 All contents are property of Iloilo Rentals.</p><p>3.2 Limited license for personal use.</p></div> },
            { icon: AlertCircle, title: 'Disclaimer', content: <p className="text-gray-600 text-sm">Website provided "as is" without warranties.</p> },
            { icon: Scale, title: 'Limitation of Liability', content: <div className="space-y-2 text-gray-600 text-sm"><p>5.1 Not liable for indirect damages.</p><p>5.2 Liability limited to amount paid.</p></div> },
            { icon: Users, title: 'Indemnification', content: <p className="text-gray-600 text-sm">You agree to indemnify Iloilo Rentals.</p> },
            { icon: Edit, title: 'Modifications', content: <p className="text-gray-600 text-sm">We reserve the right to modify this Agreement.</p> },
            { icon: Globe, title: 'Governing Law', content: <p className="text-gray-600 text-sm">Governed by laws of the Philippines, Iloilo City.</p> }
          ].map((section, idx) => (
            <div key={idx} className={idx > 0 ? 'border-t pt-6' : ''}>
              <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-[#2d568e]/10 rounded-xl flex items-center justify-center"><section.icon size={18} className="text-[#2d568e]" /></div><h2 className="text-xl font-bold text-[#2d568e]">{section.title}</h2></div>
              {section.content}
            </div>
          ))}
          <div className="border-t pt-6 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl">
            <h2 className="text-xl font-bold text-[#2d568e] mb-3">Contact Us</h2>
            <p className="text-gray-600 text-sm">If you have any questions about these Terms, please contact us.</p>
            <p className="text-gray-400 text-xs mt-4">Iloilo Rentals – Connecting You to the Best Rentals in Iloilo.</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}