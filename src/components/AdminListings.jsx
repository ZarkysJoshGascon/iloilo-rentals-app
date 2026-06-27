import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  Plus, Edit2, Trash2, Building2, MapPin,
  Search, RefreshCw, Upload, X, User, Camera, Bed, Bath, Users as UsersIcon, Calendar
} from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { getCondoImage } from '../utils/condoImages'
import { getCondoImages } from '../utils/condoImages'

function ListingCard({ condo, status, onEdit, onCalendar }) {
  const { formatPrice } = useCurrency()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)
  const intervalRef = useRef(null)

  const condoImages = condo?.code ? getCondoImages(condo.code) : []
  const allImages = condoImages.length > 0
    ? condoImages
    : [condo.images?.[0] || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop']

  useEffect(() => {
    if (allImages.length <= 1) return
    intervalRef.current = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrentImageIndex((prev) => (prev + 1) % allImages.length)
        setFade(true)
      }, 300)
    }, 4000)
    return () => clearInterval(intervalRef.current)
  }, [allImages.length])

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} whileHover={{ y: -6 }} className="group h-full">
      <div className="relative h-full rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300">
        <div className="relative h-64 sm:h-72 w-full">
          {allImages.map((img, idx) => (
            <div key={idx} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: idx === currentImageIndex && fade ? 1 : 0 }}>
              <img src={img} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
          {allImages.length > 1 && (
            <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full z-10">
              {currentImageIndex + 1}/{allImages.length}
            </div>
          )}
          <div className="absolute top-3 left-3 z-10">
            <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full backdrop-blur-md text-white" style={{ backgroundColor: status.color + 'DD' }}>
              {status.label}
            </span>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 px-4 pt-8 pb-3">
            <h3 className="text-base font-semibold text-white truncate leading-tight">
              {condo.title} ({condo.code || '---'})
            </h3>
            <div className="flex items-center gap-1 mt-0.5 text-white/80 text-xs"><MapPin size={11} className="shrink-0" /><span className="truncate">{condo.location}</span></div>
            <div className="mt-2 flex items-center gap-3 text-xs text-white/90">
              <span className="flex items-center gap-1"><Bed size={14} className="text-white/80" />{condo.bedroom_count} {condo.bedroom_count === 1 ? 'bed' : 'beds'}</span>
              <span className="flex items-center gap-1"><Bath size={14} className="text-white/80" />{condo.bathroom_count} {condo.bathroom_count === 1 ? 'bath' : 'baths'}</span>
              <span className="flex items-center gap-1"><UsersIcon size={14} className="text-white/80" />{condo.max_guests} {condo.max_guests === 1 ? 'guest' : 'guests'}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <div className="flex items-baseline gap-1"><span className="text-xl font-bold text-white">{formatPrice(condo.price_per_night)}</span><span className="text-xs text-white/70">/ night</span></div>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); onCalendar(condo) }} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold hover:bg-white/30 transition-all"><Calendar size={14} /> Calendar</button>
                <button onClick={(e) => { e.stopPropagation(); onEdit(condo) }} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold hover:bg-white/30 transition-all"><Edit2 size={14} /> Edit</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ListingFormModal({ isOpen, onClose, onSave, listing, onDelete }) {
  const [formData, setFormData] = useState({ title: '', code: '', location: '', description: '', bedroom_count: 1, bathroom_count: 1, max_guests: 2, square_meters: 30, price_per_night: 1000, status: 'available', amenities: [], owner_name: '', owner_avatar: null, owner_email: '', owner_phone: '', images: [] })
  const [amenityInput, setAmenityInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [imagePreviews, setImagePreviews] = useState([])
  const [ownerAvatarPreview, setOwnerAvatarPreview] = useState(null)
  const [ownerAvatarFile, setOwnerAvatarFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showOwnerFields, setShowOwnerFields] = useState(false)

  useEffect(() => {
    if (listing) {
      setFormData({
        title: listing.title || '', code: listing.code || '', location: listing.location || '', description: listing.description || '',
        bedroom_count: listing.bedroom_count || 1, bathroom_count: listing.bathroom_count || 1, max_guests: listing.max_guests || 2,
        square_meters: listing.square_meters || 30, price_per_night: listing.price_per_night || 1000, status: listing.status || 'available',
        amenities: listing.amenities || [],
        owner_name: listing.owners?.name || '', owner_avatar: listing.owners?.avatar_url || null,
        owner_email: listing.owners?.email || '', owner_phone: listing.owners?.phone || '',
        images: listing.images || []
      })
      if (listing.images?.length > 0) setImagePreviews(listing.images.map(url => ({ preview: url, file: null })))
      if (listing.owners?.avatar_url) setOwnerAvatarPreview(listing.owners.avatar_url)
      if (listing.owners?.name || listing.owners?.email || listing.owners?.phone) setShowOwnerFields(true)
    } else {
      setFormData({ title: '', code: '', location: '', description: '', bedroom_count: 1, bathroom_count: 1, max_guests: 2, square_meters: 30, price_per_night: 1000, status: 'available', amenities: [], owner_name: '', owner_avatar: null, owner_email: '', owner_phone: '', images: [] })
      setImagePreviews([]); setOwnerAvatarPreview(null); setOwnerAvatarFile(null); setShowOwnerFields(false)
    }
  }, [listing, isOpen])

  if (!isOpen) return null

  const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })) }
  const addAmenity = () => { if (amenityInput.trim() && !formData.amenities.includes(amenityInput.trim())) { setFormData(prev => ({ ...prev, amenities: [...prev.amenities, amenityInput.trim()] })); setAmenityInput('') } }
  const removeAmenity = (a) => setFormData(prev => ({ ...prev, amenities: prev.amenities.filter(x => x !== a) }))
  const handleImageUpload = (e) => { const files = Array.from(e.target.files); if (files.length + imagePreviews.length > 5) { toast.error('Max 5 images'); return }; setImagePreviews(prev => [...prev, ...files.map(file => ({ preview: URL.createObjectURL(file), file }))].slice(0, 5)) }
  const removeImage = (i) => setImagePreviews(prev => prev.filter((_, idx) => idx !== i))
  const handleOwnerAvatarUpload = (e) => { const file = e.target.files[0]; if (!file) return; setOwnerAvatarPreview(URL.createObjectURL(file)); setOwnerAvatarFile(file) }

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.location.trim()) { toast.error('Name and location required'); return }
    setSaving(true); setUploading(true); setUploadProgress(0)
    try {
      const code = formData.code || crypto.randomUUID().split('-')[0].toUpperCase().slice(0, 6)
      const totalUploads = imagePreviews.length + (ownerAvatarFile ? 1 : 0)
      let completed = 0; const uploadedUrls = []
      for (let i = 0; i < imagePreviews.length; i++) {
        const img = imagePreviews[i]
        if (img.file) {
          const { error: ue } = await supabase.storage.from('condo-images').upload(`${code}_${i + 1}.jpg`, img.file, { cacheControl: '3600', upsert: true })
          if (!ue) { const { data: ud } = supabase.storage.from('condo-images').getPublicUrl(`${code}_${i + 1}.jpg`); uploadedUrls.push(ud.publicUrl) }
        } else if (img.preview && !img.preview.startsWith('blob:')) uploadedUrls.push(img.preview)
        completed++; setUploadProgress(Math.round((completed / totalUploads) * 100))
      }
      let ownerId = listing?.owner_id || null
      if (formData.owner_name && formData.owner_name.trim()) {
        let ownerAvatarUrl = formData.owner_avatar && !formData.owner_avatar.startsWith('blob:') ? formData.owner_avatar : null
        if (ownerAvatarFile) {
          const ownerFileName = `${code}_owner_${Date.now()}.jpg`
          const { error: oe } = await supabase.storage.from('condo-images').upload(ownerFileName, ownerAvatarFile, { cacheControl: '3600', upsert: true })
          if (!oe) { const { data: od } = supabase.storage.from('condo-images').getPublicUrl(ownerFileName); ownerAvatarUrl = od.publicUrl }
          completed++; setUploadProgress(Math.round((completed / totalUploads) * 100))
        }
        if (ownerId) {
          await supabase.from('owners').update({ name: formData.owner_name, email: formData.owner_email || null, phone: formData.owner_phone || null, avatar_url: ownerAvatarUrl }).eq('id', ownerId)
        } else {
          if (formData.owner_email) {
            const { data: existing } = await supabase.from('owners').select('id').eq('email', formData.owner_email).maybeSingle()
            if (existing) { ownerId = existing.id; await supabase.from('owners').update({ name: formData.owner_name, phone: formData.owner_phone || null, avatar_url: ownerAvatarUrl }).eq('id', ownerId) }
          }
          if (!ownerId) {
            const { data: newOwner } = await supabase.from('owners').insert({ name: formData.owner_name, email: formData.owner_email || null, phone: formData.owner_phone || null, avatar_url: ownerAvatarUrl }).select('id').single()
            if (newOwner) ownerId = newOwner.id
          }
        }
      }
      const data = { title: formData.title, code, location: formData.location, description: formData.description, bedroom_count: formData.bedroom_count, bathroom_count: formData.bathroom_count, max_guests: formData.max_guests, square_meters: formData.square_meters, price_per_night: formData.price_per_night, status: formData.status, amenities: formData.amenities, images: uploadedUrls, owner_id: ownerId }
      if (listing?.id) { const { error } = await supabase.from('condos').update(data).eq('id', listing.id); if (error) throw error; toast.success('Listing updated') }
      else { const { error } = await supabase.from('condos').insert(data); if (error) throw error; toast.success('Listing created') }
      onSave(); onClose()
    } catch (err) { console.error(err); toast.error('Failed to save') }
    finally { setSaving(false); setUploading(false); setUploadProgress(0) }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{listing ? 'Edit Listing' : 'New Listing'}</h2>
              {listing && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{listing.title} ({listing.code})</p>}
            </div>
            <div className="flex items-center gap-2">
              {listing && onDelete && (
                <button onClick={() => { if (confirm(`Delete "${listing.title}"?`)) { onDelete(listing); onClose() } }} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete"><Trash2 size={18} /></button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={20} className="text-gray-500" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2"><Camera size={16} /> Photos (Max 5)</h4>
              {uploading && (<div className="mb-3"><div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-500">Uploading...</span><span className="text-xs font-bold text-[#2d568e]">{uploadProgress}%</span></div><div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><motion.div className="h-full bg-[#2d568e] rounded-full" initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} /></div></div>)}
              <div className="grid grid-cols-5 gap-3">
                {imagePreviews.map((img, i) => (<div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 group"><img src={img.preview || img} alt="" className="w-full h-full object-cover" /><button onClick={() => removeImage(i)} className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button></div>))}
                {imagePreviews.length < 5 && (<label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-[#2d568e] dark:hover:border-blue-400 transition-colors bg-gray-50 dark:bg-gray-700/50"><Upload size={20} className="text-gray-400 mb-1" /><span className="text-[10px] text-gray-400">Add Photo</span><input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} /></label>)}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2"><Building2 size={16} /> Details</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Listing Name *</label><input type="text" name="title" value={formData.title} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Listing Code</label><input type="text" name="code" value={formData.code} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 font-mono uppercase focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
              </div>
              <div className="mt-3"><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Location *</label><input type="text" name="location" value={formData.location} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
              <div className="mt-3"><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Description</label><textarea name="description" rows={3} value={formData.description} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 resize-none focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Specifications</h4>
              <div className="grid grid-cols-4 gap-3">
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Bedrooms</label><input type="number" name="bedroom_count" min={1} value={formData.bedroom_count} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Bathrooms</label><input type="number" name="bathroom_count" min={1} value={formData.bathroom_count} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Max Guests</label><input type="number" name="max_guests" min={1} value={formData.max_guests} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Sq Meters</label><input type="number" name="square_meters" min={10} value={formData.square_meters} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Price per Night</label><input type="number" name="price_per_night" min={500} value={formData.price_per_night} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
                <div><label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Status</label><select name="status" value={formData.status} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"><option value="available">Available</option><option value="unavailable">Unavailable</option></select></div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Amenities</h4>
              <div className="flex gap-2"><input type="text" value={amenityInput} onChange={e => setAmenityInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAmenity())} className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /><button type="button" onClick={addAmenity} className="px-4 py-2.5 bg-[#2d568e] text-white rounded-lg text-sm font-medium hover:bg-[#1e3a5f] flex items-center gap-1"><Plus size={14} /> Add</button></div>
              {formData.amenities.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{formData.amenities.map(a => <span key={a} className="bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5">{a}<button onClick={() => removeAmenity(a)} className="text-gray-400 hover:text-red-500"><X size={12} /></button></span>)}</div>}
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setShowOwnerFields(!showOwnerFields)} className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-center gap-2"><User size={16} className="text-gray-500" /><span className="text-sm font-bold text-gray-700 dark:text-gray-200">Owner Details</span><span className="text-[10px] text-gray-400 font-normal">(optional)</span></div>
                <span className="text-xs text-gray-400">{showOwnerFields ? 'Hide' : 'Show'}</span>
              </button>
              {showOwnerFields && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-600 space-y-3 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {ownerAvatarPreview ? <img src={ownerAvatarPreview} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-600" /> : <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center ring-2 ring-gray-200 dark:ring-gray-600"><User size={24} className="text-gray-400" /></div>}
                      <label className="absolute bottom-0 right-0 w-5 h-5 bg-[#2d568e] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-[#1e3a5f] shadow-md"><Camera size={10} /><input type="file" accept="image/*" className="hidden" onChange={handleOwnerAvatarUpload} /></label>
                    </div>
                    <div className="flex-1"><input type="text" name="owner_name" value={formData.owner_name} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="email" name="owner_email" value={formData.owner_email} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" />
                    <input type="tel" name="owner_phone" value={formData.owner_phone} onChange={handleChange} className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent" />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
            <button onClick={onClose} className="flex-1 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-[#2d568e] text-white rounded-xl text-sm font-semibold hover:bg-[#1e3a5f] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">{saving ? 'Saving...' : <><Upload size={16} /> {listing ? 'Save Changes' : 'Create Listing'}</>}</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default function AdminListings() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [formModal, setFormModal] = useState({ isOpen: false, listing: null })
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [condosRes, bookingsRes] = await Promise.all([
      supabase.from('condos').select('*, owners:owner_id(name, avatar_url)').order('title'),
      supabase.from('bookings').select('id, condo_id, start_date, end_date, total_amount, status, guest_name, created_at').eq('status', 'confirmed')
    ])
    setCondos(condosRes.data || [])
    setBookings(bookingsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const highlightId = sessionStorage.getItem('highlightCondo')
    if (highlightId && condos.length > 0) {
      setTimeout(() => { const el = document.getElementById(`listing-${highlightId}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 300)
      sessionStorage.removeItem('highlightCondo')
    }
  }, [condos])

  const getCondoStatus = (condo) => {
    const now = new Date()
    const activeBooking = bookings.find(b => {
      if (b.condo_id !== condo.id) return false
      return now >= new Date(b.start_date) && now <= new Date(b.end_date)
    })
    if (condo.status === 'unavailable') return { label: 'Unavailable', color: '#6b7280' }
    if (activeBooking) return { label: 'Occupied', color: '#ef4444' }
    return { label: 'Vacant', color: '#059669' }
  }

  const navigateToCalendar = (condo) => {
    window.dispatchEvent(new CustomEvent('navigateToCalendar', { detail: { condoId: condo.id } }))
  }

  const handleDelete = async (condo) => {
    try { const { error } = await supabase.from('condos').delete().eq('id', condo.id); if (error) throw error; toast.success('Listing deleted'); fetchData() }
    catch { toast.error('Failed to delete listing') }
  }

  const filteredCondos = condos.filter(c => {
    if (statusFilter !== 'all') { const s = getCondoStatus(c).label.toLowerCase(); if (statusFilter !== s) return false }
    if (searchText) { const t = searchText.toLowerCase(); return (c.title || '').toLowerCase().includes(t) || (c.code || '').toLowerCase().includes(t) || (c.location || '').toLowerCase().includes(t) }
    return true
  })

  if (loading) return (<div className="space-y-4 animate-pulse"><div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" /><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 h-48" />)}</div></div>)

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search listings..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 w-64 focus:outline-none focus:ring-2 focus:ring-blue-100" /></div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 cursor-pointer">
            <option value="all">All Status</option>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors" title="Refresh"><RefreshCw size={16} /></button>
          <button onClick={() => setFormModal({ isOpen: true, listing: null })} className="px-4 py-2.5 bg-[#2d568e] text-white rounded-xl text-sm font-semibold hover:bg-[#1e3a5f] transition-colors flex items-center gap-2"><Plus size={16} /> New Listing</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCondos.map(condo => {
          const status = getCondoStatus(condo)
          return (
            <div key={condo.id} id={`listing-${condo.id}`}>
              <ListingCard condo={condo} status={status} onEdit={(c) => setFormModal({ isOpen: true, listing: c })} onCalendar={navigateToCalendar} />
            </div>
          )
        })}
      </div>

      {filteredCondos.length === 0 && <div className="text-center py-16"><Building2 size={40} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" /><p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No listings found</p></div>}

      <ListingFormModal isOpen={formModal.isOpen} onClose={() => setFormModal({ isOpen: false, listing: null })} onSave={fetchData} listing={formModal.listing} onDelete={handleDelete} />
    </div>
  )
}