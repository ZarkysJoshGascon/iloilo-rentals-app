import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  Plus, Edit2, Trash2, Building2, MapPin,
  Search, TrendingUp, Calendar, CheckCircle, XCircle,
  RefreshCw, Upload, X, User, Camera
} from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { getCondoImage } from '../utils/condoImages'

/* ------------------------------------------------------------------ */
/*  Listing Form Modal (Full Featured with Storage Upload)              */
/* ------------------------------------------------------------------ */

function ListingFormModal({ isOpen, onClose, onSave, listing }) {
  const [formData, setFormData] = useState({
    title: '', code: '', location: '', description: '',
    bedroom_count: 1, bathroom_count: 1, max_guests: 2,
    square_meters: 30, price_per_night: 1000, status: 'available',
    amenities: [],
    owner_name: '', owner_avatar: null, owner_email: '', owner_phone: '',
    images: []
  })
  const [amenityInput, setAmenityInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [imagePreviews, setImagePreviews] = useState([])
  const [ownerAvatarPreview, setOwnerAvatarPreview] = useState(null)
  const [ownerAvatarFile, setOwnerAvatarFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  useEffect(() => {
    if (listing) {
      setFormData({
        title: listing.title || '',
        code: listing.code || '',
        location: listing.location || '',
        description: listing.description || '',
        bedroom_count: listing.bedroom_count || 1,
        bathroom_count: listing.bathroom_count || 1,
        max_guests: listing.max_guests || 2,
        square_meters: listing.square_meters || 30,
        price_per_night: listing.price_per_night || 1000,
        status: listing.status || 'available',
        amenities: listing.amenities || [],
        owner_name: listing.owner_name || '',
        owner_avatar: listing.owner_avatar || null,
        owner_email: listing.owner_email || '',
        owner_phone: listing.owner_phone || '',
        images: listing.images || []
      })
      if (listing.images?.length > 0) {
        setImagePreviews(listing.images.map(url => ({ preview: url, file: null })))
      }
      if (listing.owner_avatar) {
        setOwnerAvatarPreview(listing.owner_avatar)
      }
    } else {
      setFormData({
        title: '', code: '', location: '', description: '',
        bedroom_count: 1, bathroom_count: 1, max_guests: 2,
        square_meters: 30, price_per_night: 1000, status: 'available',
        amenities: [],
        owner_name: '', owner_avatar: null, owner_email: '', owner_phone: '',
        images: []
      })
      setImagePreviews([])
      setOwnerAvatarPreview(null)
      setOwnerAvatarFile(null)
    }
  }, [listing, isOpen])

  if (!isOpen) return null

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const addAmenity = () => {
    if (amenityInput.trim() && !formData.amenities.includes(amenityInput.trim())) {
      setFormData(prev => ({ ...prev, amenities: [...prev.amenities, amenityInput.trim()] }))
      setAmenityInput('')
    }
  }

  const removeAmenity = (a) => {
    setFormData(prev => ({ ...prev, amenities: prev.amenities.filter(x => x !== a) }))
  }

  // Handle unit image upload (local preview)
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files)
    if (files.length + imagePreviews.length > 5) {
      toast.error('Maximum 5 images allowed')
      return
    }
    
    const newPreviews = files.map(file => ({
      preview: URL.createObjectURL(file),
      file: file
    }))
    
    setImagePreviews(prev => [...prev, ...newPreviews].slice(0, 5))
  }

  const removeImage = (index) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  // Handle owner avatar upload
  const handleOwnerAvatarUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setOwnerAvatarPreview(preview)
    setOwnerAvatarFile(file)
  }

  // Submit with Supabase Storage upload
  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.location.trim()) {
      toast.error('Title and location are required')
      return
    }
    if (!formData.owner_name.trim()) {
      toast.error('Owner name is required')
      return
    }
    
    setSaving(true)
    setUploading(true)
    setUploadProgress(0)
    
    try {
      // Generate or use existing condo code
      const code = formData.code || crypto.randomUUID().split('-')[0].toUpperCase().slice(0, 6)
      const totalUploads = imagePreviews.length + (ownerAvatarFile ? 1 : 0)
      let completedUploads = 0
      
      // Upload unit images to Supabase Storage
      const uploadedImageUrls = []
      
      for (let i = 0; i < imagePreviews.length; i++) {
        const img = imagePreviews[i]
        const imageNumber = i + 1
        const fileName = `${code}_${imageNumber}.jpg`
        
        if (img.file) {
          // New file to upload
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('condo-images')
            .upload(fileName, img.file, {
              cacheControl: '3600',
              upsert: true
            })
          
          if (uploadError) {
            console.error('Upload error:', uploadError)
            toast.error(`Failed to upload image ${imageNumber}`)
          } else {
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('condo-images')
              .getPublicUrl(fileName)
            
            uploadedImageUrls.push(urlData.publicUrl)
          }
        } else if (img.preview && !img.preview.startsWith('blob:')) {
          // Existing URL - keep it
          uploadedImageUrls.push(img.preview)
        }
        
        completedUploads++
        setUploadProgress(Math.round((completedUploads / totalUploads) * 100))
      }
      
      // Upload owner avatar if new
      let ownerAvatarUrl = formData.owner_avatar
      if (ownerAvatarFile) {
        const ownerFileName = `${code}_owner.jpg`
        const { data: ownerUploadData, error: ownerUploadError } = await supabase.storage
          .from('condo-images')
          .upload(ownerFileName, ownerAvatarFile, {
            cacheControl: '3600',
            upsert: true
          })
        
        if (!ownerUploadError) {
          const { data: urlData } = supabase.storage
            .from('condo-images')
            .getPublicUrl(ownerFileName)
          ownerAvatarUrl = urlData.publicUrl
        }
        
        completedUploads++
        setUploadProgress(Math.round((completedUploads / totalUploads) * 100))
      } else if (formData.owner_avatar && !formData.owner_avatar.startsWith('blob:')) {
        // Keep existing owner avatar URL
        ownerAvatarUrl = formData.owner_avatar
      }
      
      const dataToSave = {
        title: formData.title,
        code: code,
        location: formData.location,
        description: formData.description,
        bedroom_count: formData.bedroom_count,
        bathroom_count: formData.bathroom_count,
        max_guests: formData.max_guests,
        square_meters: formData.square_meters,
        price_per_night: formData.price_per_night,
        status: formData.status,
        amenities: formData.amenities,
        images: uploadedImageUrls,
        owner_name: formData.owner_name,
        owner_avatar: ownerAvatarUrl,
        owner_email: formData.owner_email,
        owner_phone: formData.owner_phone,
      }
      
      if (listing?.id) {
        const { error } = await supabase.from('condos').update(dataToSave).eq('id', listing.id)
        if (error) throw error
        toast.success('Listing updated')
      } else {
        const { error } = await supabase.from('condos').insert(dataToSave)
        if (error) throw error
        toast.success('Listing created')
      }
      
      onSave()
      onClose()
    } catch (err) {
      console.error('Save error:', err)
      toast.error('Failed to save listing')
    }
    finally { 
      setSaving(false)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
          
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-[#2d568e] dark:text-blue-400">
              {listing ? 'Edit Listing' : 'New Listing'}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
          
          <div className="space-y-6">
            {/* ========== UNIT IMAGES ========== */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Camera size={16} /> Unit Photos (Max 5)
              </h4>
              
              {/* Upload Progress Bar */}
              {uploading && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Uploading images...</span>
                    <span className="text-xs font-bold text-[#2d568e]">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-[#2d568e] rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-5 gap-3">
                {imagePreviews.map((img, index) => (
                  <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 group">
                    <img 
                      src={img.preview || img} 
                      alt={`Unit ${index + 1}`} 
                      className="w-full h-full object-cover" 
                    />
                    <button 
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                    <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded">
                      {index + 1}
                    </span>
                  </div>
                ))}
                {imagePreviews.length < 5 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-[#2d568e] dark:hover:border-blue-400 transition-colors bg-gray-50 dark:bg-gray-700/50">
                    <Upload size={20} className="text-gray-400 mb-1" />
                    <span className="text-[10px] text-gray-400">Add Photo</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                  </label>
                )}
              </div>
              
              <p className="text-[10px] text-gray-400 mt-2">
                Images will be stored as: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded font-mono">{formData.code || 'CODE'}_1.jpg</code> to <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded font-mono">{formData.code || 'CODE'}_5.jpg</code>
              </p>
            </div>

            {/* ========== UNIT DETAILS ========== */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Building2 size={16} /> Unit Details
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Unit Name *</label>
                  <input type="text" name="title" value={formData.title} onChange={handleChange}
                    placeholder="e.g., Luxury Studio at Megaworld"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Unit Code</label>
                  <input type="text" name="code" value={formData.code} onChange={handleChange}
                    placeholder="e.g., LPS30"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 font-mono uppercase" />
                </div>
              </div>
              
              <div className="mt-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Location *</label>
                <input type="text" name="location" value={formData.location} onChange={handleChange}
                  placeholder="e.g., Megaworld Boulevard, Mandurriao, Iloilo City"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
              </div>

              <div className="mt-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Description</label>
                <textarea name="description" rows={3} value={formData.description} onChange={handleChange}
                  placeholder="Describe the unit, its features, and what makes it special..."
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 resize-none" />
              </div>
            </div>

            {/* ========== PROPERTY SPECS ========== */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Property Specifications</h4>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Bedrooms</label>
                  <input type="number" name="bedroom_count" min={1} value={formData.bedroom_count} onChange={handleChange}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Bathrooms</label>
                  <input type="number" name="bathroom_count" min={1} value={formData.bathroom_count} onChange={handleChange}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Max Guests</label>
                  <input type="number" name="max_guests" min={1} value={formData.max_guests} onChange={handleChange}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Sq Meters</label>
                  <input type="number" name="square_meters" min={10} value={formData.square_meters} onChange={handleChange}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Price per Night (₱)</label>
                  <input type="number" name="price_per_night" min={500} value={formData.price_per_night} onChange={handleChange}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Status</label>
                  <select name="status" value={formData.status} onChange={handleChange}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100">
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ========== AMENITIES ========== */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Amenities</h4>
              <div className="flex gap-2">
                <input type="text" value={amenityInput} onChange={e => setAmenityInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAmenity())}
                  placeholder="e.g., WiFi, Pool, Parking"
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                <button type="button" onClick={addAmenity} className="px-4 py-2.5 bg-[#2d568e] text-white rounded-lg text-sm font-medium hover:bg-[#1e3a5f] transition-colors flex items-center gap-1">
                  <Plus size={14} /> Add
                </button>
              </div>
              {formData.amenities.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {formData.amenities.map(a => (
                    <span key={a} className="bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5">
                      {a}
                      <button onClick={() => removeAmenity(a)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ========== OWNER DETAILS ========== */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <User size={16} /> Owner Details
              </h4>
              
              {/* Owner Avatar */}
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  {ownerAvatarPreview ? (
                    <img src={ownerAvatarPreview} alt="Owner" className="w-16 h-16 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-600" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center ring-2 ring-gray-200 dark:ring-gray-600">
                      <User size={28} className="text-gray-400" />
                    </div>
                  )}
                  <label className="absolute bottom-0 right-0 w-6 h-6 bg-[#2d568e] text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-[#1e3a5f] transition-colors shadow-md">
                    <Camera size={12} />
                    <input type="file" accept="image/*" className="hidden" onChange={handleOwnerAvatarUpload} />
                  </label>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <p>Upload owner photo</p>
                  <p>JPG, PNG (max 2MB)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Owner Name *</label>
                  <input type="text" name="owner_name" value={formData.owner_name} onChange={handleChange}
                    placeholder="e.g., Juan Dela Cruz"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Owner Email</label>
                  <input type="email" name="owner_email" value={formData.owner_email} onChange={handleChange}
                    placeholder="owner@email.com"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Owner Phone</label>
                <input type="tel" name="owner_phone" value={formData.owner_phone} onChange={handleChange}
                  placeholder="e.g., 09123456789"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100" />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8 pt-4 border-t border-gray-200 dark:border-gray-600">
            <button onClick={onClose} className="flex-1 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 py-3 bg-[#2d568e] text-white rounded-xl text-sm font-semibold hover:bg-[#1e3a5f] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? (
                <>Saving...</>
              ) : (
                <><Upload size={16} /> {listing ? 'Update Listing' : 'Create Listing'}</>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Revenue Report Modal                                                */
/* ------------------------------------------------------------------ */

function RevenueModal({ isOpen, onClose, condo, bookings, formatPrice }) {
  if (!isOpen || !condo) return null

  const condoBookings = bookings.filter(b => b.condo_id === condo.id && b.status === 'confirmed')
  const totalRevenue = condoBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const totalNights = condoBookings.reduce((sum, b) => {
    const nights = Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / (1000 * 60 * 60 * 24))
    return sum + nights
  }, 0)
  const avgPerNight = totalNights > 0 ? totalRevenue / totalNights : 0

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#2d568e] dark:text-blue-400">Revenue Report</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><X size={20} /></button>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{condo.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{condo.code} · {condo.location}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatPrice(totalRevenue)}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Total Revenue</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{condoBookings.length}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Bookings</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{totalNights}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Total Nights</p>
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Average: <span className="font-bold text-gray-700 dark:text-gray-200">{formatPrice(avgPerNight)}</span> per night
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Booking History</p>
            {condoBookings.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No confirmed bookings yet</p>
            ) : (
              condoBookings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(b => {
                const nights = Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / (1000 * 60 * 60 * 24))
                return (
                  <div key={b.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{b.guest_name || 'Guest'}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {format(new Date(b.start_date), 'MMM d')} → {format(new Date(b.end_date), 'MMM d')} · {nights}n
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#2d568e] dark:text-blue-400">{formatPrice(b.total_amount)}</span>
                  </div>
                )
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function AdminListings() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [formModal, setFormModal] = useState({ isOpen: false, listing: null })
  const [revenueModal, setRevenueModal] = useState({ isOpen: false, condo: null })
  const [statusFilter, setStatusFilter] = useState('all')
  const { formatPrice } = useCurrency()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [condosRes, bookingsRes] = await Promise.all([
      supabase.from('condos').select('*').order('title'),
      supabase.from('bookings').select('id, condo_id, start_date, end_date, total_amount, status, guest_name, created_at').eq('status', 'confirmed')
    ])
    setCondos(condosRes.data || [])
    setBookings(bookingsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getCondoStatus = (condo) => {
    const activeBooking = bookings.find(b => {
      if (b.condo_id !== condo.id) return false
      const now = new Date()
      const start = new Date(b.start_date)
      const end = new Date(b.end_date)
      return now >= start && now <= end
    })
    
    if (condo.status === 'unavailable') return { label: 'Unavailable', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400', icon: XCircle }
    if (activeBooking) return { label: 'Booked', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: Calendar }
    return { label: 'Ready', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: CheckCircle }
  }

  const getCondoRevenue = (condoId) => {
    return bookings.filter(b => b.condo_id === condoId).reduce((sum, b) => sum + (b.total_amount || 0), 0)
  }

  const getCondoBookingCount = (condoId) => {
    return bookings.filter(b => b.condo_id === condoId).length
  }

  const handleDelete = async (condo) => {
    if (!confirm(`Delete "${condo.title}"? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('condos').delete().eq('id', condo.id)
      if (error) throw error
      toast.success('Listing deleted')
      fetchData()
    } catch { toast.error('Failed to delete listing') }
  }

  const filteredCondos = condos.filter(c => {
    if (statusFilter !== 'all') {
      const status = getCondoStatus(c).label.toLowerCase()
      if (statusFilter !== status) return false
    }
    if (searchText) {
      const s = searchText.toLowerCase()
      return (c.title || '').toLowerCase().includes(s) || (c.code || '').toLowerCase().includes(s) || (c.location || '').toLowerCase().includes(s)
    }
    return true
  })

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 h-48" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search listings..." value={searchText} onChange={e => setSearchText(e.target.value)}
              className="pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 w-64 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 cursor-pointer">
            <option value="all">All Status</option>
            <option value="ready">Ready</option>
            <option value="booked">Booked</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setFormModal({ isOpen: true, listing: null })}
            className="px-4 py-2.5 bg-[#2d568e] text-white rounded-xl text-sm font-semibold hover:bg-[#1e3a5f] transition-colors flex items-center gap-2">
            <Plus size={16} /> New Listing
          </button>
        </div>
      </div>

      {/* Listings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCondos.map(condo => {
          const status = getCondoStatus(condo)
          const StatusIcon = status.icon
          const revenue = getCondoRevenue(condo.id)
          const bookingCount = getCondoBookingCount(condo.id)
          const imageUrl = getCondoImage(condo)

          return (
            <motion.div key={condo.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
              <div className="h-40 bg-gray-100 dark:bg-gray-700 relative overflow-hidden">
                {imageUrl ? (
                  <img src={imageUrl} alt={condo.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 size={40} className="text-gray-300 dark:text-gray-600" />
                  </div>
                )}
                <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${status.color}`}>
                  <StatusIcon size={12} /> {status.label}
                </span>
              </div>
              
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{condo.title}</h3>
                    <p className="text-xs font-mono text-[#2d568e] dark:text-blue-400 mt-0.5">{condo.code || '—'}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <MapPin size={10} />
                  <span className="truncate">{condo.location}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{condo.bedroom_count}</p>
                    <p className="text-[10px] text-gray-400">Beds</p>
                  </div>
                  <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{condo.bathroom_count}</p>
                    <p className="text-[10px] text-gray-400">Baths</p>
                  </div>
                  <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{condo.max_guests}</p>
                    <p className="text-[10px] text-gray-400">Guests</p>
                  </div>
                  <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{condo.square_meters}</p>
                    <p className="text-[10px] text-gray-400">sqm</p>
                  </div>
                </div>

                {/* Owner info */}
                {condo.owner_name && (
                  <div className="flex items-center gap-2 mb-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-2 py-1.5">
                    {condo.owner_avatar ? (
                      <img src={condo.owner_avatar} alt={condo.owner_name} className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#2d568e]/10 flex items-center justify-center">
                        <User size={10} className="text-[#2d568e]" />
                      </div>
                    )}
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{condo.owner_name}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-extrabold text-[#2d568e] dark:text-blue-400">{formatPrice(condo.price_per_night)}<span className="text-xs text-gray-400 font-normal">/night</span></p>
                    <p className="text-[10px] text-gray-400">{bookingCount} booking{bookingCount !== 1 ? 's' : ''} · {formatPrice(revenue)} revenue</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRevenueModal({ isOpen: true, condo })}
                      className="p-2 rounded-lg text-gray-400 hover:text-[#2d568e] hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Revenue Report">
                      <TrendingUp size={16} />
                    </button>
                    <button onClick={() => setFormModal({ isOpen: true, listing: condo })}
                      className="p-2 rounded-lg text-gray-400 hover:text-[#2d568e] hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(condo)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {filteredCondos.length === 0 && (
        <div className="text-center py-16">
          <Building2 size={40} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No listings found</p>
        </div>
      )}

      {/* Modals */}
      <ListingFormModal isOpen={formModal.isOpen} onClose={() => setFormModal({ isOpen: false, listing: null })} onSave={fetchData} listing={formModal.listing} />
      <RevenueModal isOpen={revenueModal.isOpen} onClose={() => setRevenueModal({ isOpen: false, condo: null })} condo={revenueModal.condo} bookings={bookings} formatPrice={formatPrice} />
    </div>
  )
}