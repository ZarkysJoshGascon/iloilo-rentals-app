import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { motion } from 'framer-motion'
import { Upload, X, Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ListPropertyPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    bedroom_count: 1,
    bathroom_count: 1,
    max_guests: 2,
    square_meters: 30,
    price_per_night: 1000,
    amenities: [],
    description: '',
    images: []
  })
  const [amenityInput, setAmenityInput] = useState('')

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      toast.error('Please sign in to list a property')
      navigate('/login')
      return
    }
    setUser(user)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const addAmenity = () => {
    if (amenityInput.trim() && !formData.amenities.includes(amenityInput.trim())) {
      setFormData(prev => ({
        ...prev,
        amenities: [...prev.amenities, amenityInput.trim()]
      }))
      setAmenityInput('')
    }
  }

  const removeAmenity = (amenity) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.filter(a => a !== amenity)
    }))
  }

  const uploadImages = async (files) => {
    if (!files || files.length === 0) return []
    setUploading(true)
    const uploadedUrls = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${i}.${fileExt}`
      const filePath = `list-property/${user.id}/${fileName}`
      const { error: uploadError } = await supabase.storage
        .from('condo-images')
        .upload(filePath, file)
      if (uploadError) {
        console.error(uploadError)
        toast.error(`Failed to upload ${file.name}`)
        continue
      }
      const { data: { publicUrl } } = supabase.storage
        .from('condo-images')
        .getPublicUrl(filePath)
      uploadedUrls.push(publicUrl)
    }
    setUploading(false)
    return uploadedUrls
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    try {
      // First, create a new condo record without images
      const { data: condo, error: condoError } = await supabase
        .from('condos')
        .insert({
          title: formData.title,
          location: formData.location,
          bedroom_count: formData.bedroom_count,
          bathroom_count: formData.bathroom_count,
          max_guests: formData.max_guests,
          square_meters: formData.square_meters,
          price_per_night: formData.price_per_night,
          amenities: formData.amenities,
          description: formData.description,
          owner_id: user.id,
          // generate a random code for the condo (optional)
          code: Math.random().toString(36).substring(2, 8).toUpperCase()
        })
        .select()
        .single()

      if (condoError) throw condoError

      // Upload images (if any)
      const imageFiles = document.getElementById('image-input').files
      const imageUrls = await uploadImages(imageFiles)
      if (imageUrls.length > 0) {
        // Update the condo with image URLs
        await supabase
          .from('condos')
          .update({ images: imageUrls })
          .eq('id', condo.id)
      }

      toast.success('Property listed successfully! It will appear in the condos list soon.')
      navigate('/condos')
    } catch (error) {
      console.error(error)
      toast.error('Failed to list property. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg overflow-hidden"
        >
          <div className="bg-[#2d568e] text-white px-6 py-4">
            <h1 className="text-2xl font-bold">List Your Property</h1>
            <p className="text-white/80 text-sm">Add your condo to Iloilo Rentals</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Title *</label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
                  placeholder="e.g., Luxury Studio at Megaworld"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <input
                  type="text"
                  name="location"
                  required
                  value={formData.location}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
                  placeholder="e.g., Megaworld, Iloilo City"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                <input type="number" name="bedroom_count" min="1" value={formData.bedroom_count} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                <input type="number" name="bathroom_count" min="1" value={formData.bathroom_count} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
                <input type="number" name="max_guests" min="1" value={formData.max_guests} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sq Meters</label>
                <input type="number" name="square_meters" min="10" value={formData.square_meters} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price per Night (PHP) *</label>
              <input type="number" name="price_per_night" min="500" required value={formData.price_per_night} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea name="description" rows="4" value={formData.description} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Describe your property, amenities, nearby attractions..." />
            </div>

            {/* Amenities */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amenities</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={amenityInput}
                  onChange={(e) => setAmenityInput(e.target.value)}
                  placeholder="e.g., WiFi, Parking, Pool"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2"
                />
                <button type="button" onClick={addAmenity} className="bg-gray-200 hover:bg-gray-300 px-4 rounded-lg transition">Add</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.amenities.map(amenity => (
                  <span key={amenity} className="bg-gray-100 px-2 py-1 rounded-full text-sm flex items-center gap-1">
                    {amenity}
                    <button type="button" onClick={() => removeAmenity(amenity)} className="text-gray-500 hover:text-red-500"><X size={14} /></button>
                  </span>
                ))}
              </div>
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Images</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <input type="file" id="image-input" multiple accept="image/*" className="hidden" />
                <button
                  type="button"
                  onClick={() => document.getElementById('image-input').click()}
                  className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg inline-flex items-center gap-2"
                >
                  <Upload size={18} /> Select Images
                </button>
                {uploading && <p className="text-sm text-gray-500 mt-2">Uploading...</p>}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || uploading}
              className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : 'List Property'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  )
}