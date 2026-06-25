import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Upload, X, Loader2, Plus, Building } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

export default function ListPropertyPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ title: '', location: '', bedroom_count: 1, bathroom_count: 1, max_guests: 2, square_meters: 30, price_per_night: 1000, amenities: [], description: '', images: [] })
  const [amenityInput, setAmenityInput] = useState('')

  useEffect(() => { if (!authLoading && !user) { toast.error('Please sign in'); navigate('/login') } }, [authLoading, user, navigate])

  const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })) }
  const addAmenity = () => { if (amenityInput.trim() && !formData.amenities.includes(amenityInput.trim())) { setFormData(prev => ({ ...prev, amenities: [...prev.amenities, amenityInput.trim()] })); setAmenityInput('') } }
  const removeAmenity = (a) => setFormData(prev => ({ ...prev, amenities: prev.amenities.filter(x => x !== a) }))

  const handleSubmit = async (e) => {
    e.preventDefault(); if (!user) return; setLoading(true)
    try {
      const { error: condoError } = await supabase.from('condos').insert({ ...formData, owner_id: user.id, code: crypto.randomUUID().split('-')[0].toUpperCase().slice(0, 6) }).select().single()
      if (condoError) throw condoError
      toast.success('Property listed!'); navigate('/condos')
    } catch { toast.error('Failed to list property.') }
    finally { setLoading(false) }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pt-6 md:pt-20 pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-4 md:py-8">
        <div className="mb-6"><h1 className="text-2xl font-bold text-[#2d568e] mb-1">List Your Property</h1><p className="text-gray-500 text-sm">Add your condo to Iloilo Rentals</p></div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Title *</label><input type="text" name="title" required value={formData.title} onChange={handleChange} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" placeholder="e.g., Luxury Studio at Megaworld" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Location *</label><input type="text" name="location" required value={formData.location} onChange={handleChange} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" placeholder="e.g., Megaworld, Iloilo City" /></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[{ label: 'Bedrooms', name: 'bedroom_count', min: 1 },{ label: 'Bathrooms', name: 'bathroom_count', min: 1 },{ label: 'Max Guests', name: 'max_guests', min: 1 },{ label: 'Sq Meters', name: 'square_meters', min: 10 }].map(f => (
                <div key={f.name}><label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label><input type="number" name={f.name} min={f.min} value={formData[f.name]} onChange={handleChange} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
              ))}
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Price per Night (PHP) *</label><input type="number" name="price_per_night" min="500" required value={formData.price_per_night} onChange={handleChange} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea name="description" rows="3" value={formData.description} onChange={handleChange} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent resize-none" placeholder="Describe your property..." /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Amenities</label><div className="flex gap-2"><input type="text" value={amenityInput} onChange={(e) => setAmenityInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAmenity())} placeholder="e.g., WiFi, Pool" className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /><button type="button" onClick={addAmenity} className="px-4 py-2.5 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200 transition flex items-center gap-1"><Plus size={14} />Add</button></div>{formData.amenities.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{formData.amenities.map(a => <span key={a} className="bg-gray-100 px-3 py-1 rounded-full text-xs flex items-center gap-1">{a}<button type="button" onClick={() => removeAmenity(a)} className="text-gray-400 hover:text-red-500"><X size={12} /></button></span>)}</div>}</div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Images</label><div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-[#2d568e]/30 transition-colors"><Building size={24} className="text-gray-300 mx-auto mb-2" /><p className="text-gray-500 text-sm">Upload images</p><input type="file" multiple accept="image/*" className="hidden" id="images" /><button type="button" onClick={() => document.getElementById('images').click()} className="mt-2 text-[#2d568e] text-sm font-medium hover:underline">Select Files</button></div></div>
            <button type="submit" disabled={loading} className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm">{loading ? <><Loader2 size={16} className="animate-spin" />Processing...</> : <><Upload size={16} />List Property</>}</button>
          </form>
        </div>
      </div>
    </motion.div>
  )
}