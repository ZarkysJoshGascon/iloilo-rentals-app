import { motion } from 'framer-motion'
import { FileText, Home, Shield, AlertCircle, Scale, Globe, Edit, Users} from 'lucide-react'

export default function TermsPage() {
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

  const iconVariants = {
    hidden: { scale: 0, rotate: -180 },
    visible: { scale: 1, rotate: 0, transition: { duration: 0.5, type: "spring", stiffness: 200 } }
  }

  const sectionVariants = {
    hidden: { opacity: 0, x: -30 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } }
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
        className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-16"
      >
        <div className="max-w-5xl mx-auto px-4 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
          >
            <FileText size={48} className="mx-auto mb-4 opacity-80" />
          </motion.div>
          <motion.h1 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-5xl font-bold mb-4"
          >
            Terms & Conditions
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-white/90 max-w-2xl mx-auto"
          >
            Last updated: May 2025
          </motion.p>
        </div>
      </motion.div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="bg-white rounded-2xl shadow-lg p-6 md:p-8 space-y-8"
        >
          
          <motion.div variants={sectionVariants}>
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Home size={22} />
              </motion.div>
              Use of the Website
            </motion.h2>
            <motion.div variants={fadeInUp} className="space-y-3 text-gray-600">
              <motion.p whileHover={{ x: 10 }}>1.1 The Website is provided solely for informational and booking purposes related to holiday accommodations managed by the Property Manager.</motion.p>
              <motion.p whileHover={{ x: 10 }}>1.2 You must be at least 18 years old or the legal age of majority in your jurisdiction to use this Website. By using the Website, you represent and warrant that you are of legal age.</motion.p>
              <motion.p whileHover={{ x: 10 }}>1.3 You agree not to use the Website for any unlawful or unauthorized purpose, and you will comply with all applicable laws and regulations while using the Website.</motion.p>
            </motion.div>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Home size={22} />
              </motion.div>
              Accommodation Booking
            </motion.h2>
            <motion.div variants={fadeInUp} className="space-y-3 text-gray-600">
              <motion.p whileHover={{ x: 10 }}>2.1 The Website provides a platform where guests can browse and book holiday accommodations managed by the Property Manager.</motion.p>
              <motion.p whileHover={{ x: 10 }}>2.2 All bookings made through the Website are subject to availability and acceptance by the Property Manager.</motion.p>
              <motion.p whileHover={{ x: 10 }}>2.3 By making a booking through the Website, you agree to comply with additional Rental Terms and Conditions outlined on our platform.</motion.p>
              <motion.p whileHover={{ x: 10 }}>2.4 The Website does not guarantee the accuracy of the information provided by the Property Manager, including availability, pricing, amenities, and descriptions.</motion.p>
              <motion.p whileHover={{ x: 10 }}>2.5 The Publisher acts as an intermediary for the Property Manager and does not assume any responsibility for the quality, safety, or suitability of the accommodations. Any issues or disputes related to the accommodations must be resolved directly with the Property Manager.</motion.p>
            </motion.div>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Shield size={22} />
              </motion.div>
              Intellectual Property
            </motion.h2>
            <motion.div variants={fadeInUp} className="space-y-3 text-gray-600">
              <motion.p whileHover={{ x: 10 }}>3.1 The Website and all its contents, including but not limited to text, graphics, logos, images, and software, are the property of Iloilo Rentals and are protected by intellectual property laws.</motion.p>
              <motion.p whileHover={{ x: 10 }}>3.2 You are granted a limited, non-exclusive, non-transferable license to access and use the Website for personal, non-commercial purposes.</motion.p>
              <motion.p whileHover={{ x: 10 }}>3.3 You agree not to copy, reproduce, modify, distribute, transmit, display, perform, or create derivative works of the Website or its contents without prior written consent from Iloilo Rentals.</motion.p>
            </motion.div>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <AlertCircle size={22} />
              </motion.div>
              Disclaimer of Warranties
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">The Website is provided on an "as is" and "as available" basis. Iloilo Rentals and the Property Manager make no representations or warranties of any kind, express or implied, regarding the Website's availability, functionality, accuracy, or reliability. All warranties, whether express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement, are disclaimed.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Scale size={22} />
              </motion.div>
              Limitation of Liability
            </motion.h2>
            <motion.div variants={fadeInUp} className="space-y-3 text-gray-600">
              <motion.p whileHover={{ x: 10 }}>5.1 To the maximum extent permitted by applicable law, Iloilo Rentals, the Property Manager, and their affiliates, directors, employees, agents, or licensors shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenue, arising out of or in connection with the use or inability to use the Website or the accommodations booked through it.</motion.p>
              <motion.p whileHover={{ x: 10 }}>5.2 The total liability of Iloilo Rentals, the Property Manager, and their affiliates, whether in contract, tort (including negligence), or otherwise, shall be limited to the amount paid by you, if any, for accessing and using the Website.</motion.p>
            </motion.div>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Users size={22} />
              </motion.div>
              Indemnification
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">You agree to indemnify and hold Iloilo Rentals, the Property Manager, and their affiliates, directors, employees, agents, or licensors harmless from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising out of or in connection with your use of the Website or any violation of this Agreement.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Edit size={22} />
              </motion.div>
              Modifications to the Agreement
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">Iloilo Rentals and the Property Manager reserve the right to modify this Agreement at any time. The modified Agreement will be effective upon posting on the Website. Your continued use of the Website after the posting of the modified Agreement constitutes your acceptance of the changes.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Globe size={22} />
              </motion.div>
              Governing Law and Jurisdiction
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">This Agreement shall be governed by and construed in accordance with the laws of the Republic of the Philippines. Any disputes arising out of or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts of Iloilo City, Philippines.</motion.p>
          </motion.div>

          <motion.div 
            variants={fadeInUp}
            whileHover={{ scale: 1.01 }}
            className="border-t pt-6 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl"
          >
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3">Contact Us</h2>
            <p className="text-gray-600">If you have any questions or concerns about these Terms, please contact us using the contact form on our Website.</p>
            <p className="text-gray-500 text-sm mt-4">Iloilo Rentals – Connecting You to the Best Rentals in Iloilo.</p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}