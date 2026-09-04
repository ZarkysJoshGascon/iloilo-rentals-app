import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { format } from 'date-fns'
import {
  Plus, Edit2, Building2, MapPin, Search, RefreshCw, X, User, Camera,
  Mail, Phone, Eye, Award, IdCard, ChevronRight, CheckCircle2, ArrowRight,
  FileText, AlertTriangle, ChevronLeft, ChevronDown, Clock,
  History, Users, Sparkles, Trash2, Copy, ClipboardList, Wand2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { getCondoImage } from '../../../utils/condoImages'
import { getCondoImages } from '../../../utils/condoImages'

const STORAGE_BUCKET = 'housekeeping-photos'

const generateCode = async (type) => {
  try {
    const { data, error } = await supabase.rpc(type === 'housekeeper' ? 'generate_housekeeper_code' : 'generate_cleaning_code')
    if (error) throw error; if (data) return data
  } catch (err) { console.warn('RPC fallback:', err) }
  return (type === 'housekeeper' ? 'HK-' : 'CLN-') + crypto.randomUUID().split('-')[0].toUpperCase().slice(0, 6)
}

function PhotoLightbox({ photos, initialIndex = 0, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') setCurrentIndex(p => (p - 1 + photos.length) % photos.length); if (e.key === 'ArrowRight') setCurrentIndex(p => (p + 1) % photos.length) }
    window.addEventListener('keydown', h); document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [photos.length, onClose])
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/95" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-white/10 rounded-full text-white"><X size={22} /></button>
      <span className="absolute top-4 left-4 z-10 text-white bg-black/50 px-3 py-1.5 rounded-full text-sm">{currentIndex + 1} / {photos.length}</span>
      {photos.length > 1 && (<><button onClick={(e) => { e.stopPropagation(); setCurrentIndex(p => (p - 1 + photos.length) % photos.length) }} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 rounded-full text-white"><ChevronLeft size={24} /></button><button onClick={(e) => { e.stopPropagation(); setCurrentIndex(p => (p + 1) % photos.length) }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 rounded-full text-white"><ChevronRight size={24} /></button></>)}
      <img src={photos[currentIndex]} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

function SummaryCards({ stats }) {
  const cards = [
    { label: 'Needs Basic', value: stats.basicClean, icon: ClipboardList },
    { label: 'Needs Deep', value: stats.deepClean, icon: Wand2 },
    { label: 'Clean', value: stats.ready, icon: CheckCircle2 },
    { label: 'Occupied', value: stats.occupied, icon: User },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          className="flex items-center gap-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm h-24">
          <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
            <card.icon size={22} className="text-gray-700 dark:text-gray-300" />
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{card.label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{card.value}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function ListingCard({ condo, status, onAddCleaning, onMarkClean, onEditCleaning, onViewHistory }) {
  const { key, color, label, cleaningId, linkedBookingCode, cleaningType } = status
  const [currentImageIndex, setCurrentImageIndex] = useState(0); const [fade, setFade] = useState(true)
  const intervalRef = useRef(null)
  const condoImages = condo?.code ? getCondoImages(condo.code) : []
  const allImages = condoImages.length > 0 ? condoImages : [condo.images?.[0] || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop']
  useEffect(() => { if (allImages.length <= 1) return; intervalRef.current = setInterval(() => { setFade(false); setTimeout(() => { setCurrentImageIndex(p => (p + 1) % allImages.length); setFade(true) }, 300) }, 4000); return () => clearInterval(intervalRef.current) }, [allImages.length])
  const hasCleaning = key === 'not_ready'
  const isDeep = cleaningType === 'deep_clean'

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} className="group h-full">
      <div className="h-full rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex">
        <div className="w-1/2 relative flex-shrink-0">
          {allImages.map((img, idx) => (
            <div key={idx} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: idx === currentImageIndex && fade ? 1 : 0 }}>
              <img src={img} className="w-full h-full object-cover" />
            </div>
          ))}
          {allImages.length > 1 && <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full z-10">{currentImageIndex + 1}/{allImages.length}</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />
          <div className="absolute top-3 left-3 z-10">
            <span className="text-sm font-bold uppercase tracking-wide px-3 py-1.5 rounded-full backdrop-blur-md text-white inline-flex items-center gap-1.5" style={{ backgroundColor: color + 'E0' }}>
              <span className="w-2 h-2 rounded-full bg-white/90" />{label}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <h3 className="text-lg font-bold text-white truncate">{condo.title}</h3>
            <p className="text-base text-white/80 font-mono">{condo.code}</p>
            <p className="text-sm text-white/60 flex items-center gap-1 mt-1"><MapPin size={13} />{condo.location}</p>
          </div>
        </div>
        <div className="w-1/2 flex flex-col p-4 bg-white dark:bg-gray-800">
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold tracking-wide mb-1">Cleaning Status</p>
              <p className={`text-lg font-bold ${isDeep ? 'text-red-700' : hasCleaning ? 'text-orange-700' : 'text-emerald-700'}`}>{label}</p>
            </div>
            {hasCleaning ? (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                <div><p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold">Cleaning ID</p><p className="text-base font-mono font-bold text-gray-900 dark:text-gray-100">{cleaningId}</p></div>
                <div><p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold">Booking ID</p><p className="text-base font-mono font-bold text-gray-900 dark:text-gray-100">{linkedBookingCode || 'No booking linked'}</p></div>
                <div><p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold">Cleaning Type</p><p className={`text-base font-bold ${isDeep ? 'text-red-700' : 'text-orange-700'}`}>{isDeep ? 'Deep Clean' : 'Basic Clean'}</p></div>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">No active cleaning task</p>
              </div>
            )}
          </div>
          <div className="space-y-2 mt-4">
            <button onClick={(e) => { e.stopPropagation(); if (!hasCleaning) onAddCleaning(condo) }} disabled={hasCleaning}
              className={`w-full py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 transition-all ${hasCleaning ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200'}`}>
              <Plus size={18} />Add Cleaning
            </button>
            <button onClick={(e) => { e.stopPropagation(); if (hasCleaning) onMarkClean(condo) }} disabled={!hasCleaning}
              className={`w-full py-3 rounded-lg text-base font-semibold flex items-center justify-center gap-2 transition-all ${hasCleaning ? 'bg-[#2d568e] text-white hover:bg-[#1e3a5f]' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
              <CheckCircle2 size={18} />Mark Clean
            </button>
            <div className="flex gap-2">
              {hasCleaning && (
                <button onClick={(e) => { e.stopPropagation(); onEditCleaning(condo) }} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-1">
                  <Edit2 size={16} />Edit
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onViewHistory(condo) }} className={`${hasCleaning ? 'flex-1' : 'w-full'} py-2.5 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-1`}>
                <Eye size={16} />History
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function HistoryRow({ record, housekeepers, bookings, onEditRecord, onPhotoClick, onDelete, showEdit = true, teamView = false }) {
  const [expanded, setExpanded] = useState(false)
  const hk = housekeepers.find(h => h.id === record.housekeeper_id)
  const linkedBooking = bookings.find(b => b.id === record.booking_id)
  const condoInfo = record.condos

  return (
    <div className={`rounded-lg border overflow-hidden transition-all duration-200 ${expanded ? 'border-[#2d568e] dark:border-blue-400 shadow-md bg-blue-50/30 dark:bg-blue-900/10' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md'}`}>
      <div onClick={() => setExpanded(!expanded)} className={`flex items-center px-6 py-6 cursor-pointer transition-colors gap-4 ${expanded ? 'bg-blue-50/50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-750'}`}>
        <span className={`flex-1 text-lg font-semibold text-center ${record.cleaning_type === 'deep_clean' ? 'text-red-700 dark:text-red-400' : 'text-orange-700 dark:text-orange-400'}`}>{record.cleaning_type === 'deep_clean' ? 'Deep Clean' : 'Basic Clean'}</span>
        <span className="flex-1 text-lg font-mono font-semibold text-gray-900 dark:text-gray-100 text-center truncate">{record.cleaning_code}</span>
        {teamView ? (
          <span className="flex-1 text-lg font-semibold text-gray-900 dark:text-gray-100 text-center truncate">{condoInfo?.title || '—'}</span>
        ) : (
          <span className="flex-1 text-lg font-mono text-gray-700 dark:text-gray-300 text-center truncate">{linkedBooking?.booking_code || '—'}</span>
        )}
        <span className="flex-1 text-lg text-gray-700 dark:text-gray-300 text-center truncate">{format(new Date(record.completed_at), 'MMM d, yyyy')}</span>
        {!teamView && <span className="flex-1 text-lg text-gray-700 dark:text-gray-300 text-center truncate">{hk?.name || 'Unassigned'}</span>}
        <ChevronDown size={24} className={`w-8 text-gray-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-[#2d568e]/20 dark:border-blue-400/20">
            <div className="px-6 py-5 bg-white dark:bg-gray-800 space-y-4">
              <div className="flex justify-end gap-2">
                {showEdit && <button onClick={() => onEditRecord(record)} className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1"><Edit2 size={18} /> Edit</button>}
                {onDelete && <button onClick={() => onDelete(record)} className="px-4 py-2 border border-red-200 dark:border-red-700 rounded-lg text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1"><Trash2 size={18} /> Delete</button>}
              </div>
              {record.time_started && record.time_finished && (
                <div className="flex items-center gap-4 text-base text-gray-700 dark:text-gray-300">
                  <span className="flex items-center gap-1"><Clock size={16} /> Started: {record.time_started}</span>
                  <span className="flex items-center gap-1"><Clock size={16} /> Finished: {record.time_finished}</span>
                </div>
              )}
              {record.report && <div><p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Cleaning Report</p><div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-600 text-lg text-gray-800 dark:text-gray-200">{record.report}</div></div>}
              {record.notes && <div><p className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">Notes</p><div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-600 text-lg text-gray-800 dark:text-gray-200">{record.notes}</div></div>}
              {(record.before_photos?.length > 0 || record.after_photos?.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {record.before_photos?.length > 0 && <div><p className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Before ({record.before_photos.length})</p><div className="grid grid-cols-5 gap-2">{record.before_photos.map((url, i) => <button key={i} onClick={() => onPhotoClick(record.before_photos, i)} className="aspect-square rounded-lg overflow-hidden bg-gray-200"><img src={url} className="w-full h-full object-cover" /></button>)}</div></div>}
                  {record.after_photos?.length > 0 && <div><p className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">After ({record.after_photos.length})</p><div className="grid grid-cols-5 gap-2">{record.after_photos.map((url, i) => <button key={i} onClick={() => onPhotoClick(record.after_photos, i)} className="aspect-square rounded-lg overflow-hidden bg-gray-200"><img src={url} className="w-full h-full object-cover" /></button>)}</div></div>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EditRecordModal({ isOpen, onClose, onConfirm, record, housekeepers, bookings }) {
  const [housekeeperId, setHousekeeperId] = useState('')
  const [cleaningType, setCleaningType] = useState('basic')
  const [report, setReport] = useState('')
  const [notes, setNotes] = useState('')
  const [bookingIdInput, setBookingIdInput] = useState('')
  const [timeStarted, setTimeStarted] = useState('')
  const [timeFinished, setTimeFinished] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [beforePhotos, setBeforePhotos] = useState([])
  const [afterPhotos, setAfterPhotos] = useState([])
  const [saving, setSaving] = useState(false)

  const condoBookings = bookings.filter(b => b.condo_id === record?.condo_id)
  const suggestions = condoBookings.filter(b => b.booking_code?.toLowerCase().includes(bookingIdInput.toLowerCase()) || b.guest_name?.toLowerCase().includes(bookingIdInput.toLowerCase()))

  useEffect(() => {
    if (isOpen && record) {
      setHousekeeperId(record.housekeeper_id || '')
      setCleaningType(record.cleaning_type || 'basic')
      setReport(record.report || '')
      setNotes(record.notes || '')
      setTimeStarted(record.time_started || '')
      setTimeFinished(record.time_finished || '')
      const linkedBooking = record.booking_id ? bookings.find(b => b.id === record.booking_id) : null
      setBookingIdInput(linkedBooking?.booking_code || '')
      setBeforePhotos(record.before_photos || [])
      setAfterPhotos(record.after_photos || [])
    }
  }, [isOpen, record])

  const hfs = (e, t) => {
    const fls = Array.from(e.target.files).map(f => ({ preview: URL.createObjectURL(f), file: f }))
    if (t === 'before') setBeforePhotos(p => [...p, ...fls].slice(0, 10))
    else setAfterPhotos(p => [...p, ...fls].slice(0, 10))
  }

  const handleSave = async () => {
    if (!record) return
    setSaving(true)
    try {
      const sel = housekeepers.find(h => h.id === housekeeperId)
      const rb = bookingIdInput ? condoBookings.find(b => b.booking_code === bookingIdInput) : null

      const uploadPhotos = async (photos, prefix) => {
        const urls = []
        for (let i = 0; i < photos.length; i++) {
          if (photos[i].file) {
            const fn = `${record.condos?.code || 'unit'}/${prefix}/${record.cleaning_code}_${Date.now()}_${i}.jpg`
            const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(fn, photos[i].file, { cacheControl: '3600', upsert: true })
            if (!error) {
              const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fn)
              urls.push(data.publicUrl)
            } else {
              urls.push(photos[i].preview || photos[i])
            }
          } else {
            urls.push(photos[i])
          }
        }
        return urls
      }

      const bu = await uploadPhotos(beforePhotos, 'before')
      const au = await uploadPhotos(afterPhotos, 'after')

      await supabase.from('housekeeping_records').update({
        housekeeper_id: housekeeperId || null,
        housekeeper_code: sel?.code || null,
        cleaning_type: cleaningType,
        report,
        notes,
        booking_id: rb?.id || null,
        time_started: timeStarted || null,
        time_finished: timeFinished || null,
        before_photos: bu,
        after_photos: au,
        updated_at: new Date().toISOString()
      }).eq('id', record.id)

      toast.success('Record updated')
      onConfirm()
      onClose()
    } catch { toast.error('Failed to update') } finally { setSaving(false) }
  }

  if (!isOpen || !record) return null
  const ic = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-3 text-lg bg-white dark:bg-gray-700 dark:text-gray-100 outline-none"

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-gray-800 px-6 py-4 border-b flex items-center justify-between z-10">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Cleaning Record</h3>
              <p className="text-sm text-gray-500 font-mono mt-1">{record.cleaning_code}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Housekeeper</label>
                <select value={housekeeperId} onChange={e => setHousekeeperId(e.target.value)} className={ic}>
                  <option value="">Unassigned</option>
                  {housekeepers.map(hk => <option key={hk.id} value={hk.id}>{hk.name} ({hk.code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Cleaning Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setCleaningType('basic')} className={`py-3 rounded-lg text-base font-semibold ${cleaningType === 'basic' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Basic</button>
                  <button onClick={() => setCleaningType('deep_clean')} className={`py-3 rounded-lg text-base font-semibold ${cleaningType === 'deep_clean' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Deep</button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Time Started</label>
                <input type="time" value={timeStarted} onChange={e => setTimeStarted(e.target.value)} className={ic} />
              </div>
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Time Finished</label>
                <input type="time" value={timeFinished} onChange={e => setTimeFinished(e.target.value)} className={ic} />
              </div>
              <div className="relative">
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Booking ID (Optional)</label>
                <input type="text" value={bookingIdInput} onChange={(e) => { setBookingIdInput(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} placeholder="Type booking ID..." className={ic} />
                {showSuggestions && bookingIdInput && suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {suggestions.map(b => <button key={b.id} onMouseDown={() => { setBookingIdInput(b.booking_code); setShowSuggestions(false) }} className="w-full text-left px-3 py-3 text-base hover:bg-gray-50"><span className="font-mono font-bold">{b.booking_code}</span><span className="text-gray-600 ml-2">{b.guest_name}</span></button>)}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Report</label>
                <textarea value={report} onChange={e => setReport(e.target.value)} rows={4} className={ic} placeholder="Cleaning report..." />
              </div>
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className={ic} placeholder="Notes..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Before Photos ({beforePhotos.length}/10)</label>
                <div className="grid grid-cols-3 gap-2">
                  {beforePhotos.map((p, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                      <img src={p.preview || p} className="w-full h-full object-cover" />
                      <button onClick={() => setBeforePhotos(prev => prev.filter((_, x) => x !== i))} className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-all">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {beforePhotos.length < 10 && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                      <Camera size={24} className="text-gray-500 mb-1" />
                      <span className="text-xs text-gray-500">Add</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => hfs(e, 'before')} multiple />
                    </label>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">After Photos ({afterPhotos.length}/10)</label>
                <div className="grid grid-cols-3 gap-2">
                  {afterPhotos.map((p, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                      <img src={p.preview || p} className="w-full h-full object-cover" />
                      <button onClick={() => setAfterPhotos(prev => prev.filter((_, x) => x !== i))} className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-all">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {afterPhotos.length < 10 && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                      <Camera size={24} className="text-gray-500 mb-1" />
                      <span className="text-xs text-gray-500">Add</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => hfs(e, 'after')} multiple />
                    </label>
                  )}
                </div>
              </div>
            </div>
            <button onClick={handleSave} disabled={saving} className="w-full py-3.5 bg-[#2d568e] text-white rounded-xl text-base font-bold hover:bg-[#1e3a5f] disabled:opacity-40">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function AddCleaningModal({ isOpen, onClose, onConfirm, condo, bookings, cleaningTasks }) {
  const [cleaningType, setCleaningType] = useState('basic')
  const [bookingIdInput, setBookingIdInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [saving, setSaving] = useState(false)
  const existingTask = cleaningTasks.find(t => t.condo_id === condo?.id && t.status === 'pending')
  const condoBookings = bookings.filter(b => b.condo_id === condo?.id).sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
  const suggestions = condoBookings.filter(b => b.booking_code?.toLowerCase().includes(bookingIdInput.toLowerCase()) || b.guest_name?.toLowerCase().includes(bookingIdInput.toLowerCase()))

  useEffect(() => {
    if (isOpen && condoBookings.length > 0) setBookingIdInput(condoBookings[0].booking_code || '')
  }, [isOpen])

  const submit = async () => {
    if (existingTask) { toast.error('Cleaning already exists'); return }
    setSaving(true)
    try {
      const matchedBooking = condoBookings.find(b => b.booking_code === bookingIdInput)
      const { error } = await supabase.from('cleaning_tasks').insert({ condo_id: condo.id, booking_id: matchedBooking?.id || null, cleaning_type: cleaningType, status: 'pending', notes: cleaningType === 'deep_clean' ? 'Deep clean' : 'Basic clean' })
      if (error) throw error
      await supabase.from('condos').update({ housekeeping_status: cleaningType === 'deep_clean' ? 'needs_deep_clean' : 'needs_cleaning', housekeeping_updated_at: new Date().toISOString() }).eq('id', condo.id)
      toast.success('Cleaning created'); onConfirm(); onClose()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }

  if (!isOpen || !condo) return null
  const ic = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-3 text-lg bg-white dark:bg-gray-700 dark:text-gray-100 outline-none"

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <div className="flex items-center justify-between mb-5">
            <div><h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Add Cleaning</h3><p className="text-base text-gray-700 dark:text-gray-300">{condo.title}</p></div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
          </div>
          {existingTask && <div className="mb-4 p-3 bg-amber-50 border rounded-lg text-base text-amber-700">Cleaning already exists</div>}
          <div className="space-y-4">
            <div>
              <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setCleaningType('basic')} className={`py-3 rounded-lg text-base font-semibold ${cleaningType === 'basic' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Basic</button>
                <button onClick={() => setCleaningType('deep_clean')} className={`py-3 rounded-lg text-base font-semibold ${cleaningType === 'deep_clean' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Deep</button>
              </div>
            </div>
            <div className="relative">
              <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Booking ID (Optional)</label>
              <input type="text" value={bookingIdInput} onChange={(e) => { setBookingIdInput(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} placeholder="Type booking ID..." className={ic} />
              {showSuggestions && bookingIdInput && suggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {suggestions.map(b => <button key={b.id} onMouseDown={() => { setBookingIdInput(b.booking_code); setShowSuggestions(false) }} className="w-full text-left px-3 py-3 text-base hover:bg-gray-50"><span className="font-mono font-bold text-gray-900">{b.booking_code}</span><span className="text-gray-600 ml-2">{b.guest_name}</span></button>)}
                </div>
              )}
            </div>
            <button onClick={submit} disabled={saving || !!existingTask} className={`w-full py-3.5 rounded-xl text-base font-bold ${existingTask ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
              {saving ? 'Creating...' : existingTask ? 'Already Exists' : 'Create Cleaning'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function EditCleaningModal({ isOpen, onClose, onConfirm, condo, cleaningTasks, bookings }) {
  const [cleaningType, setCleaningType] = useState('basic')
  const [bookingIdInput, setBookingIdInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const existingTask = cleaningTasks.find(t => t.condo_id === condo?.id && t.status === 'pending')
  const condoBookings = bookings.filter(b => b.condo_id === condo?.id).sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
  const suggestions = condoBookings.filter(b => b.booking_code?.toLowerCase().includes(bookingIdInput.toLowerCase()) || b.guest_name?.toLowerCase().includes(bookingIdInput.toLowerCase()))

  useEffect(() => {
    if (isOpen && existingTask) {
      setCleaningType(existingTask.cleaning_type || 'basic')
      const linkedBooking = existingTask.booking_id ? bookings.find(b => b.id === existingTask.booking_id) : null
      setBookingIdInput(linkedBooking?.booking_code || '')
    }
  }, [isOpen])

  const handleUpdate = async () => {
    if (!existingTask) { toast.error('No cleaning task found'); return }
    setSaving(true)
    try {
      const matchedBooking = condoBookings.find(b => b.booking_code === bookingIdInput)
      const { error } = await supabase.from('cleaning_tasks').update({ cleaning_type: cleaningType, booking_id: matchedBooking?.id || null }).eq('id', existingTask.id)
      if (error) throw error
      await supabase.from('condos').update({ housekeeping_status: cleaningType === 'deep_clean' ? 'needs_deep_clean' : 'needs_cleaning', housekeeping_updated_at: new Date().toISOString() }).eq('id', condo.id)
      toast.success('Cleaning updated'); onConfirm(); onClose()
    } catch { toast.error('Failed to update') } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!existingTask) return
    if (!confirm('Delete this cleaning task?')) return
    setDeleting(true)
    try {
      await supabase.from('cleaning_tasks').delete().eq('id', existingTask.id)
      await supabase.from('condos').update({ housekeeping_status: 'clean', housekeeping_updated_at: new Date().toISOString() }).eq('id', condo.id)
      toast.success('Cleaning deleted'); onConfirm(); onClose()
    } catch { toast.error('Failed to delete') } finally { setDeleting(false) }
  }

  if (!isOpen || !condo || !existingTask) return null
  const ic = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-3 text-lg bg-white dark:bg-gray-700 dark:text-gray-100 outline-none"

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Cleaning</h3>
              <p className="text-base text-gray-700 dark:text-gray-300">{condo.title}</p>
              <p className="text-sm text-gray-500 font-mono mt-1">Task ID: {existingTask.id?.slice(0, 8).toUpperCase()}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setCleaningType('basic')} className={`py-3 rounded-lg text-base font-semibold ${cleaningType === 'basic' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700'}`}>Basic</button>
                <button onClick={() => setCleaningType('deep_clean')} className={`py-3 rounded-lg text-base font-semibold ${cleaningType === 'deep_clean' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Deep</button>
              </div>
            </div>
            <div className="relative">
              <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">Booking ID (Optional)</label>
              <input type="text" value={bookingIdInput} onChange={(e) => { setBookingIdInput(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} placeholder="Type booking ID..." className={ic} />
              {showSuggestions && bookingIdInput && suggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {suggestions.map(b => <button key={b.id} onMouseDown={() => { setBookingIdInput(b.booking_code); setShowSuggestions(false) }} className="w-full text-left px-3 py-3 text-base hover:bg-gray-50"><span className="font-mono font-bold text-gray-900">{b.booking_code}</span><span className="text-gray-600 ml-2">{b.guest_name}</span></button>)}
                </div>
              )}
            </div>
            <button onClick={handleUpdate} disabled={saving} className="w-full py-3.5 rounded-xl text-base font-bold bg-[#2d568e] text-white hover:bg-[#1e3a5f] disabled:opacity-40">
              {saving ? 'Updating...' : 'Update Cleaning'}
            </button>
            <button onClick={handleDelete} disabled={deleting} className="w-full py-3.5 rounded-xl text-base font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-40">
              {deleting ? 'Deleting...' : 'Delete Cleaning'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function CleaningReportModal({ isOpen, onClose, onConfirm, condo, housekeepers, bookings, isDeepClean, linkedBooking }) {
  const [bp, setBp] = useState([]); const [ap, setAp] = useState([]); const [hk, setHk] = useState(''); const [n, setN] = useState(''); const [r, setR] = useState(''); const [sv, setSv] = useState(false); const [st, setSt] = useState('report')
  const [timeStarted, setTimeStarted] = useState('')
  const [timeFinished, setTimeFinished] = useState('')
  const [bookingIdInput, setBookingIdInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [cleaningId, setCleaningId] = useState('')

  useEffect(() => { if (isOpen) { setBp([]); setAp([]); setHk(''); setN(''); setR(''); setSt('report'); setTimeStarted(''); setTimeFinished(''); setBookingIdInput(linkedBooking?.booking_code || ''); generateCode('cleaning').then(code => setCleaningId(code)) } }, [isOpen])
  if (!isOpen || !condo) return null

  const hfs = (e, t) => { const fls = Array.from(e.target.files).map(f => ({ preview: URL.createObjectURL(f), file: f })); if (t === 'before') setBp(p => [...p, ...fls].slice(0, 10)); else setAp(p => [...p, ...fls].slice(0, 10)) }
  const submit = async () => { if (!hk || !r.trim() || bp.length === 0 || ap.length === 0) { toast.error('Fill all fields'); return }; setSv(true); try { const hkObj = housekeepers.find(h => h.id === hk); const condoBookings = bookings.filter(b => b.condo_id === condo.id); const rb = bookingIdInput ? condoBookings.find(b => b.booking_code === bookingIdInput) : null; const up = async (p, prefix) => { const urls = []; for (let i = 0; i < p.length; i++) { const fn = `${condo.code}/${prefix}/${cleaningId}_${i + 1}.jpg`; const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(fn, p[i].file, { cacheControl: '3600', upsert: true }); if (!error) { const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fn); urls.push(data.publicUrl) } } return urls }; const bu = await up(bp, 'before'); const au = await up(ap, 'after'); await supabase.from('housekeeping_records').insert({ cleaning_code: cleaningId, condo_id: condo.id, housekeeper_id: hk, housekeeper_code: hkObj?.code || '', booking_id: rb?.id || null, cleaning_type: isDeepClean ? 'deep_clean' : 'basic', notes: n, report: r, time_started: timeStarted || null, time_finished: timeFinished || null, before_photos: bu, after_photos: au, completed_at: new Date().toISOString(), created_at: new Date().toISOString() }); await supabase.from('cleaning_tasks').update({ status: 'completed', completed_at: new Date().toISOString(), housekeeper_id: hk, booking_id: rb?.id || null }).eq('condo_id', condo.id).eq('status', 'pending'); await supabase.from('condos').update({ housekeeping_status: 'clean', housekeeping_updated_at: new Date().toISOString() }).eq('id', condo.id); toast.success('Marked as clean'); onConfirm(); onClose() } catch { toast.error('Failed') } finally { setSv(false) } }

  const ahk = housekeepers?.filter(h => h.status === 'active') || []
  const ic = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-3 text-lg bg-white dark:bg-gray-700 dark:text-gray-100 outline-none resize-none"
  const condoBookings = bookings.filter(b => b.condo_id === condo.id)
  const suggestions = condoBookings.filter(b => b.booking_code?.toLowerCase().includes(bookingIdInput.toLowerCase()) || b.guest_name?.toLowerCase().includes(bookingIdInput.toLowerCase()))

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-gray-800 px-6 py-4 border-b flex items-center justify-between z-10">
            <div>
              <span className={`px-3 py-1 rounded-full text-base font-bold ${isDeepClean ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>{isDeepClean ? 'DEEP CLEAN' : 'BASIC CLEAN'}</span>
              <p className="text-base text-gray-700 dark:text-gray-300 mt-1">{condo.title}</p>
              <div className="text-base text-gray-700 dark:text-gray-300 mt-1 flex items-center gap-1"><span className="font-semibold">Cleaning ID:</span><span className="font-mono font-bold text-gray-900 dark:text-gray-100">{cleaningId}</span></div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex rounded-lg p-1 bg-gray-50 dark:bg-gray-700/50 gap-1 border border-gray-100 dark:border-gray-600">
              {[{ k: 'report', l: 'Report', i: FileText },{ k: 'before', l: 'Before', i: Camera },{ k: 'after', l: 'After', i: CheckCircle2 }].map(s => (
                <button key={s.k} onClick={() => setSt(s.k)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-md text-base font-medium ${st === s.k ? 'bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-600 text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}><s.i size={18} />{s.l}</button>
              ))}
            </div>
            {st === 'report' && (
              <div className="space-y-4">
                <select value={hk} onChange={e => setHk(e.target.value)} className={ic}><option value="">Select housekeeper...</option>{ahk.map(h => <option key={h.id} value={h.id}>{h.name} ({h.code})</option>)}</select>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Time Started</label>
                    <input type="time" value={timeStarted} onChange={e => setTimeStarted(e.target.value)} className={ic} />
                  </div>
                  <div>
                    <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Time Finished</label>
                    <input type="time" value={timeFinished} onChange={e => setTimeFinished(e.target.value)} className={ic} />
                  </div>
                </div>
                <div className="relative">
                  <label className="block text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Booking ID (Optional)</label>
                  <input type="text" value={bookingIdInput} onChange={(e) => { setBookingIdInput(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} placeholder="Type booking ID..." className={ic} />
                  {showSuggestions && bookingIdInput && suggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {suggestions.map(b => <button key={b.id} onMouseDown={() => { setBookingIdInput(b.booking_code); setShowSuggestions(false) }} className="w-full text-left px-3 py-3 text-base hover:bg-gray-50"><span className="font-mono font-bold">{b.booking_code}</span><span className="text-gray-600 ml-2">{b.guest_name}</span></button>)}
                    </div>
                  )}
                </div>
                <textarea value={r} onChange={e => setR(e.target.value)} rows={4} className={ic} placeholder="Cleaning report..." />
                <textarea value={n} onChange={e => setN(e.target.value)} rows={2} className={ic} placeholder="Notes..." />
                <button onClick={() => setSt('before')} disabled={!hk || !r.trim()} className="w-full py-3.5 bg-[#2d568e] text-white rounded-xl text-base font-bold hover:bg-[#1e3a5f] disabled:opacity-40">Continue</button>
              </div>
            )}
            {st === 'before' && (
              <div>
                <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Before Photos ({bp.length}/10)</p>
                <div className="grid grid-cols-3 gap-2">
                  {bp.map((p, i) => <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"><img src={p.preview} className="w-full h-full object-cover" /><button onClick={() => setBp(p => p.filter((_, x) => x !== i))} className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-all"><X size={14} /></button></div>)}
                  {bp.length < 10 && <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"><Camera size={22} className="text-gray-500 mb-1" /><span className="text-xs text-gray-500">Add</span><input type="file" accept="image/*" className="hidden" onChange={e => hfs(e, 'before')} multiple /></label>}
                </div>
                <div className="flex gap-3 mt-4"><button onClick={() => setSt('report')} className="flex-1 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-700 dark:text-gray-300">Back</button><button onClick={() => setSt('after')} disabled={bp.length === 0} className="flex-1 py-3 bg-[#2d568e] text-white rounded-xl text-base font-bold hover:bg-[#1e3a5f] disabled:opacity-40">Next</button></div>
              </div>
            )}
            {st === 'after' && (
              <div>
                <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">After Photos ({ap.length}/10)</p>
                <div className="grid grid-cols-3 gap-2">
                  {ap.map((p, i) => <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"><img src={p.preview} className="w-full h-full object-cover" /><button onClick={() => setAp(p => p.filter((_, x) => x !== i))} className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-all"><X size={14} /></button></div>)}
                  {ap.length < 10 && <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"><Camera size={22} className="text-gray-500 mb-1" /><span className="text-xs text-gray-500">Add</span><input type="file" accept="image/*" className="hidden" onChange={e => hfs(e, 'after')} multiple /></label>}
                </div>
                <div className="flex gap-3 mt-4"><button onClick={() => setSt('before')} className="flex-1 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-base text-gray-700 dark:text-gray-300">Back</button><button onClick={submit} disabled={sv || ap.length === 0} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-base font-bold disabled:opacity-40">{sv ? 'Saving...' : 'Mark Clean'}</button></div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function HousekeeperModal({ isOpen, onClose, onSave, housekeeper }) {
  const [f, setF] = useState({ name: '', email: '', phone: '' }); const [pf, setPf] = useState(null); const [pp, setPp] = useState(null); const [idf, setIdf] = useState(null); const [idp, setIdp] = useState(null); const [s, setS] = useState(false)
  useEffect(() => { if (isOpen) { if (housekeeper) { setF({ name: housekeeper.name || '', email: housekeeper.email || '', phone: housekeeper.phone || '' }); setPp(housekeeper.profile_photo || null); setIdp(housekeeper.id_photo || null); setPf(null); setIdf(null) } else { setF({ name: '', email: '', phone: '' }); setPf(null); setPp(null); setIdf(null); setIdp(null) } } }, [isOpen, housekeeper])
  if (!isOpen) return null
  const up = async (file, folder, code) => { const e = file.name.split('.').pop(); const fn = `${folder}/${code}_${Date.now()}.${e}`; const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(fn, file, { cacheControl: '3600', upsert: true }); if (error) throw error; const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fn); return data.publicUrl }
  const submit = async () => { if (!f.name.trim() || !f.email.trim() || !f.phone.trim()) { toast.error('Fill all fields'); return }; setS(true); try { let ppu = housekeeper?.profile_photo || null, ipu = housekeeper?.id_photo || null; let code = housekeeper?.code; if (!code) code = await generateCode('housekeeper'); if (pf) ppu = await up(pf, 'housekeeper-profiles', code); if (idf) ipu = await up(idf, 'housekeeper-ids', code); const d = { code, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), profile_photo: ppu, id_photo: ipu, status: 'active', updated_at: new Date().toISOString() }; if (housekeeper?.id) { await supabase.from('housekeepers').update(d).eq('id', housekeeper.id); toast.success('Updated') } else { await supabase.from('housekeepers').insert({ ...d, created_at: new Date().toISOString() }); toast.success('Registered') }; onSave(); onClose() } catch { toast.error('Failed') } finally { setS(false) } }
  const ic = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-3 text-lg bg-white dark:bg-gray-700 dark:text-gray-100 outline-none"
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 bg-white dark:bg-gray-800 px-6 py-4 border-b flex items-center justify-between z-10">
            <div><h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{housekeeper ? 'Edit' : 'Register'} Housekeeper</h3>{housekeeper && <p className="text-base text-gray-600 dark:text-gray-400 font-mono">{housekeeper.code}</p>}</div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                {pp ? <img src={pp} className="w-16 h-16 rounded-full object-cover" /> : <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center"><User size={24} className="text-gray-600" /></div>}
                <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#2d568e] text-white rounded-full flex items-center justify-center cursor-pointer"><Camera size={12} /><input type="file" accept="image/*" className="hidden" onChange={(e) => { const fl = e.target.files[0]; if (fl) { setPf(fl); setPp(URL.createObjectURL(fl)) } }} /></label>
              </div>
              <div><p className="text-base font-medium text-gray-800 dark:text-gray-200">Profile Photo</p></div>
            </div>
            <input type="text" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" className={ic} />
            <input type="email" value={f.email} onChange={e => setF(p => ({ ...p, email: e.target.value }))} placeholder="Email" className={ic} />
            <input type="tel" value={f.phone} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" className={ic} />
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-base font-medium text-gray-700 dark:text-gray-300">Cancel</button>
              <button onClick={submit} disabled={s} className="flex-1 py-3 bg-[#2d568e] text-white rounded-xl text-base font-bold hover:bg-[#1e3a5f] disabled:opacity-40">{s ? 'Saving...' : housekeeper ? 'Update' : 'Register'}</button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default function HousekeepingManagement() {
  const [condos, setCondos] = useState([]); const [bookings, setBookings] = useState([]); const [allRecords, setAllRecords] = useState([]); const [housekeepers, setHousekeepers] = useState([]); const [cleaningTasks, setCleaningTasks] = useState([])
  const [loading, setLoading] = useState(true); const [searchText, setSearchText] = useState(''); const [statusFilter, setStatusFilter] = useState('all'); const [teamFilter, setTeamFilter] = useState('most'); const [activeTab, setActiveTab] = useState('units')
  const [selectedUnit, setSelectedUnit] = useState(null)
  const [selectedCleaner, setSelectedCleaner] = useState(null)
  const navRef = useRef(null); const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const [addCleaningModal, setAddCleaningModal] = useState({ isOpen: false, condo: null })
  const [editCleaningModal, setEditCleaningModal] = useState({ isOpen: false, condo: null })
  const [editRecordModal, setEditRecordModal] = useState({ isOpen: false, record: null })
  const [markReadyModal, setMarkReadyModal] = useState({ isOpen: false, condo: null, isDeepClean: false, linkedBooking: null })
  const [housekeeperModal, setHousekeeperModal] = useState({ isOpen: false, housekeeper: null })
  const [lightbox, setLightbox] = useState({ isOpen: false, photos: [], index: 0 })

  const fetchData = useCallback(async () => { setLoading(true); const [cr, br, rr, hr, ctr] = await Promise.all([supabase.from('condos').select('*').order('title'), supabase.from('bookings').select('id, condo_id, start_date, end_date, guest_name, status, booking_code').eq('status', 'confirmed'), supabase.from('housekeeping_records').select('*, condos:condo_id(title, code)').order('completed_at', { ascending: false }).limit(500), supabase.from('housekeepers').select('*').order('name'), supabase.from('cleaning_tasks').select('*').order('created_at', { ascending: false })]); setCondos(cr.data || []); setBookings(br.data || []); setAllRecords(rr.data || []); setHousekeepers(hr.data || []); setCleaningTasks(ctr.data || []); setLoading(false) }, [])
  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    if (!navRef.current) return
    const ab = navRef.current.querySelector('[data-active="true"]')
    if (ab) {
      const nr = navRef.current.getBoundingClientRect()
      const br = ab.getBoundingClientRect()
      setIndicatorStyle({ left: br.left - nr.left, width: br.width })
    }
  }, [activeTab, loading])

  const getUnitStatus = (condo) => {
    const now = new Date()
    if (condo.status === 'unavailable') return { key: 'unavailable', color: '#6b7280', label: 'Unavailable', cleaningId: null, linkedBookingCode: null, cleaningType: null }
    const activeBooking = bookings.find(b => b.condo_id === condo.id && now >= new Date(b.start_date) && now <= new Date(b.end_date))
    if (activeBooking) return { key: 'occupied', color: '#ef4444', label: 'Occupied', cleaningId: null, linkedBookingCode: null, cleaningType: null }
    const deepCleanTask = cleaningTasks.find(t => t.condo_id === condo.id && t.status === 'pending' && t.cleaning_type === 'deep_clean')
    if (deepCleanTask) { const rb = deepCleanTask.booking_id ? bookings.find(b => b.id === deepCleanTask.booking_id) : null; return { key: 'not_ready', color: '#dc2626', label: 'Needs Deep Clean', cleaningId: deepCleanTask.id?.slice(0, 8).toUpperCase(), linkedBookingCode: rb?.booking_code || null, cleaningType: 'deep_clean' } }
    const basicCleanTask = cleaningTasks.find(t => t.condo_id === condo.id && t.status === 'pending' && t.cleaning_type === 'basic')
    if (basicCleanTask) { const rb = basicCleanTask.booking_id ? bookings.find(b => b.id === basicCleanTask.booking_id) : null; return { key: 'not_ready', color: '#f97316', label: 'Needs Basic Clean', cleaningId: basicCleanTask.id?.slice(0, 8).toUpperCase(), linkedBookingCode: rb?.booking_code || null, cleaningType: 'basic' } }
    return { key: 'ready', color: '#059669', label: 'Clean', cleaningId: null, linkedBookingCode: null, cleaningType: null }
  }

  const filteredCondos = condos.filter(c => { const { key } = getUnitStatus(c); if (statusFilter !== 'all' && key !== statusFilter) return false; if (!searchText) return true; const s = searchText.toLowerCase(); return (c.title || '').toLowerCase().includes(s) || (c.code || '').toLowerCase().includes(s) || (c.location || '').toLowerCase().includes(s) })
  const sortedHousekeepers = [...housekeepers].sort((a, b) => {
    const aCount = allRecords.filter(r => r.housekeeper_id === a.id).length
    const bCount = allRecords.filter(r => r.housekeeper_id === b.id).length
    return teamFilter === 'most' ? bCount - aCount : aCount - bCount
  })
  const stats = { basicClean: condos.filter(c => getUnitStatus(c).label === 'Needs Basic Clean').length, deepClean: condos.filter(c => getUnitStatus(c).label === 'Needs Deep Clean').length, ready: condos.filter(c => getUnitStatus(c).key === 'ready').length, occupied: condos.filter(c => getUnitStatus(c).key === 'occupied').length }
  const tabs = [{ id: 'units', label: 'Units', icon: Building2 },{ id: 'history', label: 'History', icon: History },{ id: 'team', label: 'Team', icon: Users }]

  const handleDeleteRecord = async (record) => {
    if (!confirm(`Delete cleaning record ${record.cleaning_code}?`)) return
    try {
      await supabase.from('housekeeping_records').delete().eq('id', record.id)
      await supabase.from('condos').update({ housekeeping_status: 'clean', housekeeping_updated_at: new Date().toISOString() }).eq('id', record.condo_id)
      toast.success('Record deleted'); fetchData()
    } catch { toast.error('Failed') }
  }

  const handleEditRecord = (record) => setEditRecordModal({ isOpen: true, record })
  const handleAddCleaning = (condo) => setAddCleaningModal({ isOpen: true, condo })
  const handleEditCleaning = (condo) => setEditCleaningModal({ isOpen: true, condo })
  const handleMarkClean = (condo) => {
    const pendingTask = cleaningTasks.find(t => t.condo_id === condo.id && t.status === 'pending')
    const isDeep = pendingTask?.cleaning_type === 'deep_clean'
    const linkedBooking = pendingTask?.booking_id ? bookings.find(b => b.id === pendingTask.booking_id) : null
    setMarkReadyModal({ isOpen: true, condo, isDeepClean: isDeep, linkedBooking })
  }
  const handleViewHistory = (condo) => { setSelectedUnit(condo); setActiveTab('history') }

  if (loading) return (<div className="space-y-4 animate-pulse"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl h-24 border" />)}</div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl h-72 border" />)}</div></div>)

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      <SummaryCards stats={stats} />

      <div className="flex items-center gap-3 flex-shrink-0">
        <div ref={navRef} className="relative flex bg-gray-100 dark:bg-gray-700 rounded-full p-1 gap-1 flex-shrink-0">
          <motion.div className="absolute top-1 h-[calc(100%-8px)] bg-white dark:bg-gray-600 rounded-full shadow-sm z-0" animate={{ left: indicatorStyle.left, width: indicatorStyle.width }} transition={{ type: 'spring', stiffness: 350, damping: 28 }} />
          {tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-active={activeTab === tab.id} className={`relative z-10 flex items-center gap-2 px-6 py-3 rounded-full text-base font-medium ${activeTab === tab.id ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}><tab.icon size={18} />{tab.label}</button>)}
        </div>
        <div className="w-40 flex-shrink-0">
          {activeTab === 'units' && (
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full px-3 py-3 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 cursor-pointer outline-none">
              <option value="all">All</option>
              <option value="ready">Clean</option>
              <option value="not_ready">Needs Cleaning</option>
              <option value="occupied">Occupied</option>
            </select>
          )}
          {activeTab === 'team' && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="w-full px-3 py-3 text-base border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 cursor-pointer outline-none">
              <option value="most">Most Cleans</option>
              <option value="least">Least Cleans</option>
            </select>
          )}
        </div>
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder="Search..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full pl-12 pr-4 py-3 text-base border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-300 shadow-sm placeholder-gray-500" />
          </div>
        </div>
        <button onClick={fetchData} className="p-3 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-600 hover:text-gray-800 hover:bg-gray-50 transition-all flex-shrink-0"><RefreshCw size={18} /></button>
      </div>

      {activeTab === 'units' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCondos.map(condo => <ListingCard key={condo.id} condo={condo} status={getUnitStatus(condo)} onAddCleaning={handleAddCleaning} onMarkClean={handleMarkClean} onEditCleaning={handleEditCleaning} onViewHistory={handleViewHistory} />)}
          {filteredCondos.length === 0 && <div className="col-span-full text-center py-12 text-gray-600"><Building2 size={36} className="mx-auto mb-2" /><p className="text-base">No units found</p></div>}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="flex gap-4 h-[550px]">
          <div className="w-1/3 flex-shrink-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-base font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide flex-shrink-0">Units</div>
            <div className="flex-1 overflow-y-auto">
              {condos.map(condo => {
                const img = getCondoImage(condo)
                return (
                  <button key={condo.id} onClick={() => setSelectedUnit(condo)} className={`w-full text-left p-4 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors flex items-center gap-4 ${selectedUnit?.id === condo.id ? 'bg-gray-100 dark:bg-gray-700 border-l-4 border-l-[#2d568e]' : ''}`}>
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      {img ? <img src={img} className="w-full h-full object-cover" /> : <Building2 size={24} className="text-gray-500 m-auto mt-5" />}
                    </div>
                    <div><p className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{condo.title}</p><p className="text-lg text-gray-600 dark:text-gray-400 font-mono">{condo.code}</p></div>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="w-2/3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            {selectedUnit ? (
              <>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedUnit.title}</h3>
                  <p className="text-base text-gray-600 dark:text-gray-400">{allRecords.filter(r => r.condo_id === selectedUnit.id).length} records</p>
                </div>
                <div className="flex items-center px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 text-base font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 flex-shrink-0">
                  <span className="flex-1 text-center">Type</span>
                  <span className="flex-1 text-center">Cleaning ID</span>
                  <span className="flex-1 text-center">Booking</span>
                  <span className="flex-1 text-center">Date</span>
                  <span className="flex-1 text-center">Cleaner</span>
                  <span className="w-8"></span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {allRecords.filter(r => r.condo_id === selectedUnit.id).length === 0 ? <p className="text-base text-gray-600 p-6">No cleaning history</p> : allRecords.filter(r => r.condo_id === selectedUnit.id).map(record => <HistoryRow key={record.id} record={record} housekeepers={housekeepers} bookings={bookings} onEditRecord={handleEditRecord} onPhotoClick={(p, i) => setLightbox({ isOpen: true, photos: p, index: i })} onDelete={handleDeleteRecord} teamView={false} />)}
                </div>
              </>
            ) : <p className="text-base text-gray-600 p-6">Select a unit to view history</p>}
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="flex gap-4 h-[550px]">
          <div className="w-1/3 flex-shrink-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
              <span className="text-base font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Cleaners</span>
              <button onClick={() => setHousekeeperModal({ isOpen: true, housekeeper: null })} className="p-1.5 bg-[#2d568e] text-white rounded-lg"><Plus size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sortedHousekeepers.map(hk => {
                const cleanCount = allRecords.filter(r => r.housekeeper_id === hk.id).length
                return (
                  <button key={hk.id} onClick={() => setSelectedCleaner(hk)} className={`w-full text-left p-4 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors flex items-center gap-4 ${selectedCleaner?.id === hk.id ? 'bg-gray-100 dark:bg-gray-700 border-l-4 border-l-[#2d568e]' : ''}`}>
                    <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
                      {hk.profile_photo ? <img src={hk.profile_photo} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl font-bold text-gray-600">{hk.name?.charAt(0)}</div>}
                    </div>
                    <div className="flex-1"><p className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{hk.name}</p><p className="text-lg text-gray-600 dark:text-gray-400 font-mono">{hk.code}</p></div>
                    <span className="text-base font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full">{cleanCount}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="w-2/3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            {selectedCleaner ? (
              <>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedCleaner.name}</h3>
                  <p className="text-base text-gray-600 dark:text-gray-400">{allRecords.filter(r => r.housekeeper_id === selectedCleaner.id).length} cleans</p>
                </div>
                <div className="flex items-center px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 text-base font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 flex-shrink-0">
                  <span className="flex-1 text-center">Type</span>
                  <span className="flex-1 text-center">Cleaning ID</span>
                  <span className="flex-1 text-center">Unit</span>
                  <span className="flex-1 text-center">Date</span>
                  <span className="w-8"></span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {allRecords.filter(r => r.housekeeper_id === selectedCleaner.id).length === 0 ? <p className="text-base text-gray-600 p-6">No cleaning history</p> : allRecords.filter(r => r.housekeeper_id === selectedCleaner.id).map(record => <HistoryRow key={record.id} record={record} housekeepers={housekeepers} bookings={bookings} onEditRecord={handleEditRecord} onPhotoClick={(p, i) => setLightbox({ isOpen: true, photos: p, index: i })} showEdit={false} teamView={true} />)}
                </div>
              </>
            ) : <p className="text-base text-gray-600 p-6">Select a cleaner to view history</p>}
          </div>
        </div>
      )}

      <AddCleaningModal isOpen={addCleaningModal.isOpen} onClose={() => setAddCleaningModal({ isOpen: false, condo: null })} onConfirm={fetchData} condo={addCleaningModal.condo} bookings={bookings} cleaningTasks={cleaningTasks} />
      <EditCleaningModal isOpen={editCleaningModal.isOpen} onClose={() => setEditCleaningModal({ isOpen: false, condo: null })} onConfirm={fetchData} condo={editCleaningModal.condo} cleaningTasks={cleaningTasks} bookings={bookings} />
      <EditRecordModal isOpen={editRecordModal.isOpen} onClose={() => setEditRecordModal({ isOpen: false, record: null })} onConfirm={fetchData} record={editRecordModal.record} housekeepers={housekeepers} bookings={bookings} />
      <CleaningReportModal isOpen={markReadyModal.isOpen} onClose={() => setMarkReadyModal({ isOpen: false, condo: null, isDeepClean: false, linkedBooking: null })} onConfirm={fetchData} condo={markReadyModal.condo} housekeepers={housekeepers} bookings={bookings} isDeepClean={markReadyModal.isDeepClean} linkedBooking={markReadyModal.linkedBooking} />
      <HousekeeperModal isOpen={housekeeperModal.isOpen} onClose={() => setHousekeeperModal({ isOpen: false, housekeeper: null })} onSave={fetchData} housekeeper={housekeeperModal.housekeeper} />
      {lightbox.isOpen && <PhotoLightbox photos={lightbox.photos} initialIndex={lightbox.index} onClose={() => setLightbox({ isOpen: false, photos: [], index: 0 })} />}
    </div>
  )
}