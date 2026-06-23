import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Mail, Phone, Calendar, Plus, Send } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LeadDetail({ leadId }) {
  const [lead, setLead] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [newInteraction, setNewInteraction] = useState({ type: 'note', content: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (leadId) {
      fetchLead()
      fetchInteractions()
    }
  }, [leadId])

  const fetchLead = async () => {
    const { data } = await supabase.from('leads').select('*').eq('id', leadId).single()
    setLead(data)
  }

  const fetchInteractions = async () => {
    const { data } = await supabase
      .from('interactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
    setInteractions(data || [])
    setLoading(false)
  }

  const addInteraction = async () => {
    if (!newInteraction.content.trim()) {
      toast.error('Please enter content')
      return
    }
    const { error } = await supabase.from('interactions').insert({
      lead_id: leadId,
      type: newInteraction.type,
      content: newInteraction.content
    })
    if (error) {
      toast.error('Failed to add interaction')
    } else {
      toast.success('Interaction added')
      setNewInteraction({ type: 'note', content: '' })
      fetchInteractions()
    }
  }

  const sendEmail = () => {
    window.location.href = `mailto:${lead.email}?subject=Regarding your inquiry&body=Hello ${lead.first_name || ''},`
  }

  if (loading) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading...</div>
  if (!lead) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">Lead not found</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{lead.first_name} {lead.last_name}</h2>
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-1"><Mail size={14} /> {lead.email}</div>
          {lead.phone && <div className="flex items-center gap-1"><Phone size={14} /> {lead.phone}</div>}
          <div className="flex items-center gap-1"><Calendar size={14} /> Lead since {format(new Date(lead.created_at), 'MMM dd, yyyy')}</div>
        </div>
        {lead.notes && <p className="mt-3 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-sm">{lead.notes}</p>}
      </div>

      <div className="flex gap-3">
        <button onClick={sendEmail} className="flex items-center gap-2 bg-[#2d568e] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#1e3a5f] transition">
          <Mail size={16} /> Send Email
        </button>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2"><Plus size={16} /> Add Interaction</h3>
        <div className="flex gap-3">
          <select
            className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            value={newInteraction.type}
            onChange={(e) => setNewInteraction({ ...newInteraction, type: e.target.value })}
          >
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
          <input
            type="text"
            placeholder="e.g., Called customer, left voicemail..."
            className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            value={newInteraction.content}
            onChange={(e) => setNewInteraction({ ...newInteraction, content: e.target.value })}
            onKeyPress={(e) => e.key === 'Enter' && addInteraction()}
          />
          <button onClick={addInteraction} className="bg-[#2d568e] text-white px-4 rounded-lg hover:bg-[#1e3a5f] transition">
            <Send size={16} />
          </button>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Interaction History</h3>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {interactions.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 py-6">No interactions yet</div>
          ) : (
            interactions.map(interaction => (
              <div key={interaction.id} className="border-l-4 border-[#2d568e] pl-3 py-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="capitalize font-semibold">{interaction.type}</span>
                  <span>•</span>
                  <span>{format(new Date(interaction.created_at), 'MMM dd, h:mm a')}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{interaction.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}