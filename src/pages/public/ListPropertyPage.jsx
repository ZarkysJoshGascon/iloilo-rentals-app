import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Upload, X, Loader2, Plus, Camera } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

const MAX_IMAGES = 5

export default function ListPropertyPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
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
  })
  const [imageFiles, setImageFiles] = useState([])
  const [amenityInput, setAmenityInput] = useState('')

  useEffect(() => {
    if (!authLoading && !user) {
      toast.error('Please sign in to list a property')
      navigate('/login?redirect=/list-property')
    }
  }, [authLoading, user, navigate])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const addAmenity = () => {
    const trimmed = amenityInput.trim()
    if (trimmed && !formData.amenities.includes(trimmed)) {
      setFormData(prev => ({ ...prev, amenities: [...prev.amenities, trimmed] }))
      setAmenityInput('')
    }
  }

  const removeAmenity = (a) => {
    setFormData(prev => ({ ...prev, amenities: prev.amenities.filter(x => x !== a) }))
  }

  const handleImages = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const remaining = MAX_IMAGES - imageFiles.length
    if (files.length > remaining) {
      toast.error(`Max ${MAX_IMAGES} images. ${remaining} slot${remaining === 1 ? '' : 's'} left.`)
    }
    const next = files.slice(0, remaining).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setImageFiles(prev => [...prev, ...next])
    e.target.value = ''
  }

  const removeImage = (index) => {
    setImageFiles(prev => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[index].preview)
      copy.splice(index, 1)
      return copy
    })
  }

  const uploadImages = async (code) => {
    if (imageFiles.length === 0) return []
    const urls = []
    for (let i = 0; i < imageFiles.length; i++) {
      const { file } = imageFiles[i]
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${code}_${i + 1}.${ext}`
      const { error } = await supabase.storage
        .from('condo-images')
        .upload(path, file, { cacheControl: '3600', upsert: true })
      if (error) {
        console.error('Upload error:', error)
        continue
      }
      const { data } = supabase.storage.from('condo-images').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    return urls
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) return
    if (imageFiles.length === 0) {
      toast.error('Please add at least one image')
      return
    }

    setLoading(true)
    setUploading(true)
    try {
      const code = crypto.randomUUID().split('-')[0].toUpperCase().slice(0, 6)
      const imageUrls = await uploadImages(code)
      setUploading(false)

      if (imageUrls.length === 0) {
        throw new Error('All image uploads failed. Please try again.')
      }

      const { error: condoError } = await supabase.from('condos').insert({
        title: formData.title,
        location: formData.location,
        bedroom_count: Number(formData.bedroom_count),
        bathroom_count: Number(formData.bathroom_count),
        max_guests: Number(formData.max_guests),
        square_meters: Number(formData.square_meters),
        price_per_night: Number(formData.price_per_night),
        amenities: formData.amenities,
        description: formData.description,
        images: imageUrls,
        code,
        owner_id: user.id,
        status: 'unavailable',
      }).select().single()

      if (condoError) throw condoError

      toast.success('Property submitted! An admin will review it shortly.')
      navigate('/condos')
    } catch (err) {
      console.error('List property error:', err)
      toast.error(err.message || 'Failed to list property.')
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pt-6 md:pt-20 pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-4 md:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#2d568e] mb-1">List Your Property</h1>
          <p className="text-gray-500 text-sm">Add your condo to Iloilo Rentals</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  name="title"
                  required
                  value={formData.title}
                  onChange={handleChange}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
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
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
                  placeholder="e.g., Megaworld, Iloilo City"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Bedrooms', name: 'bedroom_count', min: 1 },
                { label: 'Bathrooms', name: 'bathroom_count', min: 1 },
                { label: 'Max Guests', name: 'max_guests', min: 1 },
                { label: 'Sq Meters', name: 'square_meters', min: 10 },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input
                    type="number"
                    name={f.name}
                    min={f.min}
                    value={formData[f.name]}
                    onChange={handleChange}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price per Night (PHP) *</label>
              <input
                type="number"
                name="price_per_night"
                min="500"
                required
                value={formData.price_per_night}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                name="description"
                rows="3"
                value={formData.description}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent resize-none"
                placeholder="Describe your property..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amenities</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={amenityInput}
                  onChange={(e) => setAmenityInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAmenity())}
                  placeholder="e.g., WiFi, Pool"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#2d568e] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={addAmenity}
                  className="px-4 py-2.5 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200 transition flex items-center gap-1"
                >
                  <Plus size={14} />Add
                </button>
              </div>
              {formData.amenities.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.amenities.map(a => (
                    <span key={a} className="bg-gray-100 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                      {a}
                      <button type="button" onClick={() => removeAmenity(a)} className="text-gray-400 hover:text-red-500">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Images * ({imageFiles.length}/{MAX_IMAGES})
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {imageFiles.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
                    <img src={img.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {imageFiles.length < MAX_IMAGES && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-[#2d568e]/40 flex flex-col items-center justify-center cursor-pointer transition-colors bg-gray-50">
                    <Camera size={20} className="text-gray-400 mb-1" />
                    <span className="text-[10px] text-gray-400">Add</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
                  </label>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2d568e] text-white py-3 rounded-xl font-semibold hover:bg-[#1e3a5f] transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {uploading ? (
                <><Loader2 size={16} className="animate-spin" />Uploading images...</>
              ) : loading ? (
                <><Loader2 size={16} className="animate-spin" />Processing...</>
              ) : (
                <><Upload size={16} />Submit Property</>
              )}
            </button>
          </form>
        </div>
      </div>
    </motion.div>
  )
}