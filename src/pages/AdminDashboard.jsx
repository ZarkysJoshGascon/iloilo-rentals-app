import { useState } from 'react'
import LeadsList from '../components/LeadsList'
import LeadDetail from '../components/LeadDetail'
import BookingsList from '../components/BookingsList'
import CondoAvailability from '../components/CondoAvailability'
import AdminSidebar from '../components/AdminSidebar'

export default function AdminDashboard() {
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [activeTab, setActiveTab] = useState('leads')
  const [bookingsFilter, setBookingsFilter] = useState('all')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 p-6 overflow-auto">
        {activeTab === 'leads' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Leads</h2>
              <LeadsList onSelectLead={setSelectedLeadId} selectedId={selectedLeadId} />
            </div>
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4">
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

        {activeTab === 'bookings' && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex flex-wrap gap-3 mb-4">
              <button 
                onClick={() => setBookingsFilter('all')} 
                className={`text-sm px-3 py-1 rounded ${bookingsFilter === 'all' ? 'bg-[#2d568e] text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                All Bookings
              </button>
              <button 
                onClick={() => setBookingsFilter('pending')} 
                className={`text-sm px-3 py-1 rounded ${bookingsFilter === 'pending' ? 'bg-[#2d568e] text-white' : 'bg-yellow-100 text-yellow-800'}`}
              >
                Pending Approval
              </button>
              <button 
                onClick={() => setBookingsFilter('month')} 
                className={`text-sm px-3 py-1 rounded ${bookingsFilter === 'month' ? 'bg-[#2d568e] text-white' : 'bg-green-100 text-green-800'}`}
              >
                This Month
              </button>
              <button 
                onClick={() => setBookingsFilter('week')} 
                className={`text-sm px-3 py-1 rounded ${bookingsFilter === 'week' ? 'bg-[#2d568e] text-white' : 'bg-blue-100 text-blue-800'}`}
              >
                This Week
              </button>
            </div>
            <BookingsList filter={bookingsFilter} />
          </div>
        )}

        {activeTab === 'availability' && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <CondoAvailability />
          </div>
        )}
      </div>
    </div>
  )
} 