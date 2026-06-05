import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Search, Mail, Phone } from 'lucide-react'

const statusColors = {
  new: 'bg-yellow-100 text-yellow-800',
  contacted: 'bg-blue-100 text-blue-800',
  negotiating: 'bg-purple-100 text-purple-800',
  converted: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800'
}

export default function LeadsList({ onSelectLead, selectedId }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchLeads()
  }, [search, statusFilter])

  const fetchLeads = async () => {
    setLoading(true)
    let query = supabase.from('leads').select('*').order('created_at', { ascending: false })
    if (search) query = query.ilike('email', `%${search}%`)
    if (statusFilter) query = query.eq('status', statusFilter)
    const { data } = await query
    setLeads(data || [])
    setLoading(false)
  }

  const updateStatus = async (id, newStatus) => {
    await supabase.from('leads').update({ status: newStatus }).eq('id', id)
    fetchLeads()
  }

  if (loading) return <div className="text-center py-8">Loading leads...</div>

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search by email..."
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <select 
        className="w-full border rounded-lg p-2 text-sm"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="negotiating">Negotiating</option>
        <option value="converted">Converted</option>
        <option value="lost">Lost</option>
      </select>

      <div className="space-y-2 max-h-[70vh] overflow-y-auto">
        {leads.map(lead => (
          <div
            key={lead.id}
            className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
              selectedId === lead.id ? 'border-[#2d568e] bg-blue-50' : 'border-gray-200'
            }`}
            onClick={() => onSelectLead(lead.id)}
          >
            <div className="flex justify-between items-start">
              <div className="font-medium truncate">{lead.first_name || lead.email.split('@')[0]}</div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                {lead.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
              <Mail size={12} /> {lead.email}
            </div>
            {lead.phone && (
              <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                <Phone size={12} /> {lead.phone}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-2">
              {format(new Date(lead.created_at), 'MMM dd, yyyy')}
            </div>
            <select
              className="mt-2 w-full text-xs border rounded p-1"
              value={lead.status}
              onChange={(e) => updateStatus(lead.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="negotiating">Negotiating</option>
              <option value="converted">Converted</option>
              <option value="lost">Lost</option>
            </select>
          </div>
        ))}
        {leads.length === 0 && <div className="text-center text-gray-400 py-8">No leads found</div>}
      </div>
    </div>
  )
}