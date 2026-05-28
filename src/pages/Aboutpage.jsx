import { motion } from 'framer-motion'

export default function Aboutpage() {
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

  const statNumbers = {
    hidden: { opacity: 0, scale: 0.5 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5, type: "spring", stiffness: 200 } }
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
        className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-12 md:py-20"
      >
        <div className="max-w-6xl mx-auto px-4 text-center">
          <motion.h1 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl md:text-5xl lg:text-6xl font-bold mb-3 md:mb-4"
          >
            About Iloilo Rentals
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-base md:text-xl text-white/90 max-w-2xl mx-auto"
          >
            Your trusted partner for premium condo rentals in Iloilo City
          </motion.p>
        </div>
      </motion.div>

      <div className="max-w-6xl mx-auto px-4 py-8 md:py-16">
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-16"
        >
          {/* Our Story */}
          <motion.div variants={fadeInUp} className="md:col-span-2">
            <motion.div 
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="bg-white rounded-2xl shadow-lg p-6 md:p-10"
            >
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#2d568e] mb-4 md:mb-6">Our Story</h2>
              <p className="text-gray-700 text-sm md:text-lg mb-4 leading-relaxed">
                Iloilo Rentals was founded with a simple vision: to provide travelers and business professionals 
                with comfortable, well-maintained, and conveniently located accommodations at competitive prices.
              </p>
              <p className="text-gray-700 text-sm md:text-lg mb-4 leading-relaxed">
                We carefully select each property in our portfolio, ensuring they meet our high standards for 
                quality, cleanliness, and location. Our properties are situated in prime areas including Megaworld, 
                Atria Park District, and near the famous Iloilo River Esplanade.
              </p>
              <p className="text-gray-700 text-sm md:text-lg leading-relaxed">
                Whether you're visiting Iloilo for business or pleasure, we have the perfect place for you to call home.
              </p>
            </motion.div>
          </motion.div>
          
          {/* Why Choose Us */}
          <motion.div variants={fadeInUp}>
            <motion.div 
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
              className="bg-white rounded-2xl shadow-lg p-6 md:p-10"
            >
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#2d568e] mb-4 md:mb-6">Why Choose Us</h2>
              <div className="space-y-4 md:space-y-6">
                {[
                  { text: "Prime Locations", desc: "All units near business districts, malls, and esplanade" },
                  { text: "Quality Assured", desc: "Every property is verified and well-maintained" },
                  { text: "24/7 Support", desc: "Local team ready to assist you anytime" },
                  { text: "Best Price Guarantee", desc: "Competitive rates with no hidden fees" }
                ].map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ x: -20, opacity: 0 }}
                    whileInView={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    whileHover={{ x: 10 }}
                  >
                    <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                      <motion.span 
                        whileHover={{ scale: 1.2, rotate: 360 }}
                        transition={{ duration: 0.3 }}
                        className="text-2xl md:text-3xl text-[#2d568e]"
                      >
                        ✓
                      </motion.span>
                      <h3 className="text-base md:text-xl font-semibold text-gray-800">{item.text}</h3>
                    </div>
                    <p className="text-gray-600 text-sm md:text-base pl-8 md:pl-10">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Stats Section */}
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-8 md:mb-16"
        >
          {[
            { value: "50+", label: "Happy Guests" },
            { value: "3", label: "Premium Condos" },
            { value: "5★", label: "Guest Rating" },
            { value: "24/7", label: "Support" }
          ].map((stat, idx) => (
            <motion.div 
              key={idx}
              variants={statNumbers}
              whileHover={{ scale: 1.1, y: -5 }}
              className="bg-white rounded-2xl p-4 md:p-8 text-center shadow-md cursor-pointer"
            >
              <motion.div 
                className="text-3xl md:text-6xl font-bold text-[#2d568e] mb-1 md:mb-2"
                animate={{ 
                  scale: [1, 1.05, 1],
                  transition: { repeat: Infinity, duration: 2, delay: idx * 0.5 }
                }}
              >
                {stat.value}
              </motion.div>
              <p className="text-gray-600 text-xs md:text-base">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Mission & Vision */}
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-6 md:gap-8"
        >
          <motion.div 
            variants={fadeInUp}
            whileHover={{ scale: 1.02 }}
            className="bg-gradient-to-br from-[#2d568e]/10 to-transparent rounded-2xl p-6 md:p-8 border border-[#2d568e]/30"
          >
            <h3 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#2d568e] mb-3 md:mb-4">Our Mission</h3>
            <p className="text-gray-700 text-sm md:text-lg leading-relaxed">
              To provide exceptional accommodation experiences that make every guest feel at home, 
              while supporting the growth of tourism in Iloilo City.
            </p>
          </motion.div>
          
          <motion.div 
            variants={fadeInUp}
            whileHover={{ scale: 1.02 }}
            className="bg-gradient-to-br from-[#2d568e]/10 to-transparent rounded-2xl p-6 md:p-8 border border-[#2d568e]/30"
          >
            <h3 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#2d568e] mb-3 md:mb-4">Our Vision</h3>
            <p className="text-gray-700 text-sm md:text-lg leading-relaxed">
              To become Iloilo's most trusted and preferred short-term rental platform, known for quality, 
              reliability, and exceptional customer service.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}