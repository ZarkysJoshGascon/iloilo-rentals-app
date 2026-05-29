import { motion } from 'framer-motion'
import { Shield, Eye, Database, Share2, Globe, UserCheck, Clock, Lock, ExternalLink, Users, Edit, AlertCircle } from 'lucide-react'

export default function PrivacyPolicyPage() {
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
            <Shield size={48} className="mx-auto mb-4 opacity-80" />
          </motion.div>
          <motion.h1 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-5xl font-bold mb-4"
          >
            Privacy Policy
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
                <Eye size={22} />
              </motion.div>
              Information We Collect
            </motion.h2>
            <motion.div variants={fadeInUp} className="space-y-4 text-gray-600">
              <motion.div whileHover={{ x: 10 }} className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">1.1 Personal Information</h3>
                <p>We may collect personal information such as your name, email address, telephone number, and billing information when you make a booking or communicate with us through the Website.</p>
              </motion.div>
              <motion.div whileHover={{ x: 10 }} className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">1.2 Booking Information</h3>
                <p>We collect information related to your booking, including accommodation details, check-in and check-out dates, and any special requests or preferences you provide.</p>
              </motion.div>
              <motion.div whileHover={{ x: 10 }} className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">1.3 Usage Information</h3>
                <p>We also collect information automatically when you interact with the Website. This may include your IP address, browser type, device information, pages visited, and other usage data.</p>
              </motion.div>
              <motion.div whileHover={{ x: 10 }} className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">1.4 Cookies and Similar Technologies</h3>
                <p>We may use cookies and similar technologies to collect information about your interactions with the Website. This helps us provide you with a more personalized and user-friendly experience.</p>
              </motion.div>
            </motion.div>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Database size={22} />
              </motion.div>
              Legal Basis for Processing
            </motion.h2>
            <motion.div variants={fadeInUp} className="space-y-3 text-gray-600">
              <motion.p whileHover={{ x: 10 }}><strong>Performance of a Contract:</strong> Processing your personal information is necessary for the performance of the contract between you and the Property Manager for booking accommodations.</motion.p>
              <motion.p whileHover={{ x: 10 }}><strong>Legitimate Interests:</strong> We may process personal information for our legitimate interests, such as improving our services, preventing fraud, and enhancing the user experience.</motion.p>
              <motion.p whileHover={{ x: 10 }}><strong>Consent:</strong> In certain cases, we may obtain your explicit consent to process your personal information. You have the right to withdraw your consent at any time.</motion.p>
            </motion.div>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Share2 size={22} />
              </motion.div>
              Use of Information
            </motion.h2>
            <motion.div variants={fadeInUp} className="grid md:grid-cols-2 gap-3 text-gray-600">
              {[
                "✓ Facilitate bookings and provide requested services",
                "✓ Communicate regarding your bookings and inquiries",
                "✓ Improve and optimize Website functionality",
                "✓ Personalize and tailor our services to your preferences",
                "✓ Understand and analyze user trends and patterns",
                "✓ Ensure security and integrity of our services",
                "✓ Comply with legal obligations"
              ].map((item, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  className="bg-gray-50 p-3 rounded-lg"
                >
                  {item}
                </motion.div>
              ))}
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
              Sharing of Information
            </motion.h2>
            <motion.div variants={fadeInUp} className="space-y-3 text-gray-600">
              <motion.p whileHover={{ x: 10 }}><strong>Property Manager:</strong> We may share your information with the Property Manager of the accommodations you book through the Website to facilitate your stay.</motion.p>
              <motion.p whileHover={{ x: 10 }}><strong>Service Providers:</strong> We may engage third-party service providers to assist us in providing and improving our services.</motion.p>
              <motion.p whileHover={{ x: 10 }}><strong>Legal Compliance:</strong> We may disclose your information to comply with applicable laws, regulations, or legal processes.</motion.p>
              <motion.p whileHover={{ x: 10 }}><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity.</motion.p>
            </motion.div>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Globe size={22} />
              </motion.div>
              International Data Transfers
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">Some of our service providers and partners may be located outside the European Economic Area (EEA). In such cases, we will ensure that appropriate safeguards are in place to protect your personal information, such as Standard Contractual Clauses approved by the European Commission.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <UserCheck size={22} />
              </motion.div>
              Your Rights
            </motion.h2>
            <motion.div variants={fadeInUp} className="grid md:grid-cols-2 gap-3 text-gray-600">
              {[
                "✓ Right to access your data",
                "✓ Right to rectify inaccurate data",
                "✓ Right to erasure (right to be forgotten)",
                "✓ Right to restrict processing",
                "✓ Right to data portability",
                "✓ Right to object to processing"
              ].map((item, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  className="bg-gray-50 p-3 rounded-lg"
                >
                  {item}
                </motion.div>
              ))}
            </motion.div>
            <motion.p variants={fadeInUp} className="text-gray-600 mt-3 text-sm">To exercise these rights, please contact us using the contact form on our Website.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Clock size={22} />
              </motion.div>
              Data Retention & Security
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600 mb-3">We will retain your personal information for as long as necessary to fulfill the purposes outlined in this Policy unless a longer retention period is required by law.</motion.p>
            <motion.p variants={fadeInUp} className="text-gray-600">We implement appropriate technical and organizational measures to protect your personal information from unauthorized access, use, disclosure, alteration, or destruction.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <ExternalLink size={22} />
              </motion.div>
              Third-Party Links
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">The Website may contain links to third-party websites or services that are not owned or controlled by us. This Policy does not apply to those third-party websites or services. We encourage you to review the privacy policies of such third parties before providing any personal information.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <AlertCircle size={22} />
              </motion.div>
              Children's Privacy
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">The Website is not intended for individuals under the age of 16. We do not knowingly collect personal information from children. If you believe we may have collected information from a child, please contact us immediately, and we will take appropriate measures to delete such information.</motion.p>
          </motion.div>

          <motion.div variants={sectionVariants} className="border-t pt-6">
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2"
            >
              <motion.div variants={iconVariants}>
                <Edit size={22} />
              </motion.div>
              Changes to This Policy
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-600">We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated Policy on the Website or through other reasonable means. Your continued use of the Website after the effective date of the updated Policy constitutes your acceptance of the revised Policy.</motion.p>
          </motion.div>

          <motion.div 
            variants={fadeInUp}
            whileHover={{ scale: 1.01 }}
            className="border-t pt-6 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl"
          >
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3">Contact Us</h2>
            <p className="text-gray-600">If you have any questions, concerns, or requests regarding this Privacy Policy, or if you wish to exercise your rights, please contact us using the contact form on this Website.</p>
            <p className="text-gray-500 text-sm mt-4">Iloilo Rentals – Connecting You to the Best Rentals in Iloilo.</p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}