import { useState } from 'react'
import LeadsList from '../components/LeadsList'
import LeadDetail from '../components/LeadDetail'
import BookingsList from '../components/BookingsList'
import CondoAvailability from '../components/CondoAvailability'
import AdminSidebar from '../components/AdminSidebar'

export default function AdminDashboard() {
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [activeTab, setActiveTab] = useState('bookings')
  const [searchTerm, setSearchTerm] = useState('')

  const getTabTitle = () => {
    switch(activeTab) {
      case 'leads': return 'Leads'
      case 'bookings': return 'Bookings'
      case 'availability': return 'Availability'
      default: return 'Dashboard'
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#d4deec] overflow-hidden">
      {/* Compact title bar */}
      <div className="flex-shrink-0 ml-[3mm] py-2">
        <h1 className="text-xl font-bold text-[#2d568e]">Iloilo Rentals CRM</h1>
        <p className="text-xs text-gray-500">Manage your leads, bookings, and property availability</p>
      </div>

      {/* Card container */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-shrink-0 z-0 ml-[3mm]">
          <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        <div className="flex-1 -ml-8 z-10 flex flex-col min-w-0">
          <div className="bg-white rounded-tl-xl shadow-2xl overflow-hidden flex flex-col flex-1">
            {/* Only the title remains in the header – buttons moved to BookingsList */}
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-xl font-semibold text-gray-800">{getTabTitle()}</h2>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {activeTab === 'leads' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Leads</h3>
                    <LeadsList onSelectLead={setSelectedLeadId} selectedId={selectedLeadId} searchTerm={searchTerm} />
                  </div>
                  <div className="lg:col-span-2">
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

              {activeTab === 'bookings' && <BookingsList searchTerm={searchTerm} />}

              {activeTab === 'availability' && <CondoAvailability />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}