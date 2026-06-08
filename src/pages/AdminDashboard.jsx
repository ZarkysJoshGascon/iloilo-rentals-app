import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LeadsList from '../components/LeadsList'
import LeadDetail from '../components/LeadDetail'
import BookingsList from '../components/BookingsList'
import CondoAvailability from '../components/CondoAvailability'
import AdminSidebar from '../components/AdminSidebar'

export default function AdminDashboard() {
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [activeTab, setActiveTab] = useState('leads')

  const getTabTitle = () => {
    switch(activeTab) {
      case 'leads': return 'Leads & CRM'
      case 'bookings': return 'Bookings'
      case 'availability': return 'Condo Availability'
      default: return 'Admin Dashboard'
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 flex-shrink-0">
          <h1 className="text-2xl font-bold text-[#2d568e] whitespace-nowrap">
            Admin Dashboard
            <span className="text-gray-400 mx-2">|</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={activeTab}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="inline-block"
              >
                {getTabTitle()}
              </motion.span>
            </AnimatePresence>
          </h1>
        </div>

        <div className="flex-1 overflow-hidden px-6 pb-6">
          {activeTab === 'leads' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              <div className="lg:col-span-1 bg-white rounded-xl shadow-sm p-4 overflow-auto">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Leads</h2>
                <LeadsList onSelectLead={setSelectedLeadId} selectedId={selectedLeadId} />
              </div>
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4 overflow-auto">
                {selectedLeadId ? (
                  <LeadDetail leadId={selectedLeadId} />
                ) : (
                  <div className="text-center text-gray-400 py-20">
                    Select a lead from the list to view details
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'bookings' && <BookingsList />}

          {activeTab === 'availability' && (
            <div className="bg-white rounded-xl shadow-sm p-4 h-full overflow-auto">
              <CondoAvailability />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}