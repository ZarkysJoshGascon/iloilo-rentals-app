import { motion } from 'framer-motion'
import { Shield, Eye, Database, Share2, Users, UserCheck } from 'lucide-react'

export default function PrivacyPolicyPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50">
      <motion.div initial={{ scale: 1.05, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] text-white pt-20 pb-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }} className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-white" />
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Privacy Policy</h1>
          <p className="text-white/70 text-sm">Last updated: May 2025</p>
        </div>
      </motion.div>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 space-y-8">
          {[
            { icon: Eye, title: 'Information We Collect', content: <div className="space-y-3">{['Personal Information','Booking Information','Usage Information','Cookies'].map((item,i)=>(<div key={i} className="bg-gray-50 p-4 rounded-xl"><h3 className="font-semibold text-gray-800 text-sm mb-1">1.{i+1} {item}</h3><p className="text-gray-600 text-sm">We collect relevant data to provide and improve our services.</p></div>))}</div> },
            { icon: Database, title: 'Legal Basis', content: <div className="space-y-2 text-gray-600 text-sm"><p><strong>Contract:</strong> Processing is necessary for booking.</p><p><strong>Legitimate Interests:</strong> Improving services, preventing fraud.</p><p><strong>Consent:</strong> You may withdraw consent at any time.</p></div> },
            { icon: Share2, title: 'Use of Information', content: <div className="grid md:grid-cols-2 gap-2 text-sm text-gray-600">{["Facilitate bookings","Communicate with you","Improve Website","Personalize services","Analyze trends","Ensure security","Legal compliance"].map((item,i)=>(<div key={i} className="bg-gray-50 p-3 rounded-lg">✓ {item}</div>))}</div> },
            { icon: Users, title: 'Sharing of Information', content: <div className="space-y-2 text-gray-600 text-sm"><p><strong>Property Manager:</strong> Information shared to facilitate your stay.</p><p><strong>Service Providers:</strong> Third parties assist in providing services.</p><p><strong>Legal Compliance:</strong> Disclosure required by law.</p></div> },
            { icon: UserCheck, title: 'Your Rights', content: <div className="grid md:grid-cols-2 gap-2 text-sm text-gray-600">{["Access","Rectify","Erasure","Restrict processing","Data portability","Object"].map((item,i)=>(<div key={i} className="bg-gray-50 p-3 rounded-lg">✓ {item}</div>))}</div> }
          ].map((section, idx) => (
            <div key={idx} className={idx > 0 ? 'border-t pt-6' : ''}>
              <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-[#2d568e]/10 rounded-xl flex items-center justify-center"><section.icon size={18} className="text-[#2d568e]" /></div><h2 className="text-xl font-bold text-[#2d568e]">{section.title}</h2></div>
              {section.content}
            </div>
          ))}
          <div className="border-t pt-6 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl">
            <h2 className="text-xl font-bold text-[#2d568e] mb-3">Contact Us</h2>
            <p className="text-gray-600 text-sm">If you have any questions about this Privacy Policy, please contact us.</p>
            <p className="text-gray-400 text-xs mt-4">Iloilo Rentals – Connecting You to the Best Rentals in Iloilo.</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}