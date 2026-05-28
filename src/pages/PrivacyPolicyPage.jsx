import { Shield, Eye, Database, Share2, Globe, UserCheck, Clock, Lock, ExternalLink, Users, Edit, AlertCircle } from 'lucide-react'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] text-white py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <Shield size={48} className="mx-auto mb-4 opacity-80" />
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            Last updated: May 2025
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 space-y-8">
          
          <div>
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <Eye size={22} /> Information We Collect
            </h2>
            <div className="space-y-4 text-gray-600">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">1.1 Personal Information</h3>
                <p>We may collect personal information such as your name, email address, telephone number, and billing information when you make a booking or communicate with us through the Website.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">1.2 Booking Information</h3>
                <p>We collect information related to your booking, including accommodation details, check-in and check-out dates, and any special requests or preferences you provide.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">1.3 Usage Information</h3>
                <p>We also collect information automatically when you interact with the Website. This may include your IP address, browser type, device information, pages visited, and other usage data.</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">1.4 Cookies and Similar Technologies</h3>
                <p>We may use cookies and similar technologies to collect information about your interactions with the Website. This helps us provide you with a more personalized and user-friendly experience.</p>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <Database size={22} /> Legal Basis for Processing
            </h2>
            <div className="space-y-3 text-gray-600">
              <p><strong>Performance of a Contract:</strong> Processing your personal information is necessary for the performance of the contract between you and the Property Manager for booking accommodations.</p>
              <p><strong>Legitimate Interests:</strong> We may process personal information for our legitimate interests, such as improving our services, preventing fraud, and enhancing the user experience.</p>
              <p><strong>Consent:</strong> In certain cases, we may obtain your explicit consent to process your personal information. You have the right to withdraw your consent at any time.</p>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <Share2 size={22} /> Use of Information
            </h2>
            <div className="grid md:grid-cols-2 gap-3 text-gray-600">
              <div className="bg-gray-50 p-3 rounded-lg">✓ Facilitate bookings and provide requested services</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Communicate regarding your bookings and inquiries</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Improve and optimize Website functionality</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Personalize and tailor our services to your preferences</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Understand and analyze user trends and patterns</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Ensure security and integrity of our services</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Comply with legal obligations</div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <Users size={22} /> Sharing of Information
            </h2>
            <div className="space-y-3 text-gray-600">
              <p><strong>Property Manager:</strong> We may share your information with the Property Manager of the accommodations you book through the Website to facilitate your stay.</p>
              <p><strong>Service Providers:</strong> We may engage third-party service providers to assist us in providing and improving our services.</p>
              <p><strong>Legal Compliance:</strong> We may disclose your information to comply with applicable laws, regulations, or legal processes.</p>
              <p><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity.</p>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <Globe size={22} /> International Data Transfers
            </h2>
            <p className="text-gray-600">Some of our service providers and partners may be located outside the European Economic Area (EEA). In such cases, we will ensure that appropriate safeguards are in place to protect your personal information, such as Standard Contractual Clauses approved by the European Commission.</p>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <UserCheck size={22} /> Your Rights
            </h2>
            <div className="grid md:grid-cols-2 gap-3 text-gray-600">
              <div className="bg-gray-50 p-3 rounded-lg">✓ Right to access your data</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Right to rectify inaccurate data</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Right to erasure (right to be forgotten)</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Right to restrict processing</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Right to data portability</div>
              <div className="bg-gray-50 p-3 rounded-lg">✓ Right to object to processing</div>
            </div>
            <p className="text-gray-600 mt-3 text-sm">To exercise these rights, please contact us using the contact form on our Website.</p>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <Clock size={22} /> Data Retention & Security
            </h2>
            <p className="text-gray-600 mb-3">We will retain your personal information for as long as necessary to fulfill the purposes outlined in this Policy unless a longer retention period is required by law.</p>
            <p className="text-gray-600">We implement appropriate technical and organizational measures to protect your personal information from unauthorized access, use, disclosure, alteration, or destruction.</p>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <ExternalLink size={22} /> Third-Party Links
            </h2>
            <p className="text-gray-600">The Website may contain links to third-party websites or services that are not owned or controlled by us. This Policy does not apply to those third-party websites or services. We encourage you to review the privacy policies of such third parties before providing any personal information.</p>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <AlertCircle size={22} /> Children's Privacy
            </h2>
            <p className="text-gray-600">The Website is not intended for individuals under the age of 16. We do not knowingly collect personal information from children. If you believe we may have collected information from a child, please contact us immediately, and we will take appropriate measures to delete such information.</p>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3 flex items-center gap-2">
              <Edit size={22} /> Changes to This Policy
            </h2>
            <p className="text-gray-600">We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated Policy on the Website or through other reasonable means. Your continued use of the Website after the effective date of the updated Policy constitutes your acceptance of the revised Policy.</p>
          </div>

          <div className="border-t pt-6 bg-gray-50 -mx-6 -mb-6 p-6 rounded-b-2xl">
            <h2 className="text-2xl font-bold text-[#2d568e] mb-3">Contact Us</h2>
            <p className="text-gray-600">If you have any questions, concerns, or requests regarding this Privacy Policy, or if you wish to exercise your rights, please contact us using the contact form on this Website.</p>
            <p className="text-gray-500 text-sm mt-4">Iloilo Rentals – Connecting You to the Best Rentals in Iloilo.</p>
          </div>
        </div>
      </div>
    </div>
  )
}