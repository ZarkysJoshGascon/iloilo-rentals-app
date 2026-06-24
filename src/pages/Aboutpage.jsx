import { motion } from 'framer-motion'
import { Shield, Star, MapPin, Heart, Target, Eye } from 'lucide-react'

export default function Aboutpage() {
  const fadeInUp = { hidden: { opacity: 0, y: 50 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } }
  const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-br from-[#2d568e] to-[#1e3a5f] text-white pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">About Iloilo Rentals</h1>
          <p className="text-white/70 text-sm max-w-md mx-auto">Your trusted partner for premium condo rentals in Iloilo City</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} className="grid md:grid-cols-3 gap-6 mb-8">
          <motion.div variants={fadeInUp} className="md:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-[#2d568e]/10 rounded-xl flex items-center justify-center"><Heart size={20} className="text-[#2d568e]" /></div><h2 className="text-xl font-bold text-[#2d568e]">Our Story</h2></div>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">Iloilo Rentals was founded with a simple vision: to provide travelers and business professionals with comfortable, well-maintained, and conveniently located accommodations at competitive prices.</p>
              <p className="text-gray-600 text-sm leading-relaxed mb-3">We carefully select each property in our portfolio, ensuring they meet our high standards for quality, cleanliness, and location. Our properties are situated in prime areas including Megaworld, Atria Park District, and near the famous Iloilo River Esplanade.</p>
              <p className="text-gray-600 text-sm leading-relaxed">Whether you're visiting Iloilo for business or pleasure, we have the perfect place for you to call home.</p>
            </div>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 h-full">
              <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-[#2d568e]/10 rounded-xl flex items-center justify-center"><Star size={20} className="text-[#2d568e]" /></div><h2 className="text-xl font-bold text-[#2d568e]">Why Choose Us</h2></div>
              <div className="space-y-3">
                {[
                  { icon: MapPin, text: "Prime Locations", desc: "Near business districts, malls, and esplanade" },
                  { icon: Shield, text: "Quality Assured", desc: "Every property is verified and well-maintained" },
                  { icon: Heart, text: "24/7 Support", desc: "Local team ready to assist you anytime" },
                  { icon: Star, text: "Best Price Guarantee", desc: "Competitive rates with no hidden fees" }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 bg-[#2d568e]/10 rounded-lg flex items-center justify-center flex-shrink-0"><item.icon size={16} className="text-[#2d568e]" /></div>
                    <div><h3 className="font-semibold text-gray-800 text-sm">{item.text}</h3><p className="text-gray-500 text-xs mt-0.5">{item.desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>

        <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[{ value: "50+", label: "Happy Guests", icon: Heart },{ value: "3", label: "Premium Condos", icon: Shield },{ value: "5★", label: "Guest Rating", icon: Star },{ value: "24/7", label: "Support", icon: Heart }].map((stat, idx) => (
            <motion.div key={idx} variants={fadeInUp} whileHover={{ scale: 1.03, y: -3 }} className="bg-white rounded-2xl p-4 md:p-6 text-center shadow-sm border border-gray-100">
              <div className="w-10 h-10 bg-[#2d568e]/10 rounded-xl flex items-center justify-center mx-auto mb-3"><stat.icon size={18} className="text-[#2d568e]" /></div>
              <div className="text-2xl md:text-3xl font-bold text-[#2d568e] mb-1">{stat.value}</div>
              <p className="text-gray-500 text-xs">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} className="grid md:grid-cols-2 gap-6">
          {[
            { icon: Target, title: 'Our Mission', desc: 'To provide exceptional accommodation experiences that make every guest feel at home, while supporting the growth of tourism in Iloilo City.' },
            { icon: Eye, title: 'Our Vision', desc: "To become Iloilo's most trusted and preferred short-term rental platform, known for quality, reliability, and exceptional customer service." }
          ].map((item, idx) => (
            <motion.div key={idx} variants={fadeInUp} whileHover={{ scale: 1.01 }} className="bg-gradient-to-br from-[#2d568e]/5 to-white rounded-2xl p-6 border border-[#2d568e]/20">
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 bg-[#2d568e] rounded-xl flex items-center justify-center"><item.icon size={18} className="text-white" /></div><h3 className="text-lg font-bold text-[#2d568e]">{item.title}</h3></div>
              <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  )
}