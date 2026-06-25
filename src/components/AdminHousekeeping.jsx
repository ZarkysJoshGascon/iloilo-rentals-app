import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import {
  CheckCircle, Clock, AlertTriangle, Building2, User, Mail, Phone,
  RefreshCw, Search, Camera, Upload, X, History, ChevronDown, ChevronUp,
  ArrowRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { getCondoImage } from '../utils/condoImages'

/* ------------------------------------------------------------------ */
/*  Mark Ready Modal (with before/after photos)                         */
/* ------------------------------------------------------------------ */

function MarkReadyModal({ isOpen, onClose, onConfirm, condo }) {
  const [beforePhotos, setBeforePhotos] = useState([])
  const [afterPhotos, setAfterPhotos] = useState([])
  const [housekeeperName, setHousekeeperName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState('before') // 'before', 'after'

  useEffect(() => {
    if (isOpen) {
      setBeforePhotos([])
      setAfterPhotos([])
      setHousekeeperName('')
      setNotes('')
      setStep('before')
    }
  }, [isOpen])

  if (!isOpen || !condo) return null

  const handleFileSelect = (e, type) => {
    const files = Array.from(e.target.files)
    const newPhotos = files.map(file => ({
      preview: URL.createObjectURL(file),
      file: file
    }))
    
    if (type === 'before') {
      setBeforePhotos(prev => [...prev, ...newPhotos].slice(0, 3))
    } else {
      setAfterPhotos(prev => [...prev, ...newPhotos].slice(0, 3))
    }
  }

  const removePhoto = (index, type) => {
    if (type === 'before') {
      setBeforePhotos(prev => prev.filter((_, i) => i !== index))
    } else {
      setAfterPhotos(prev => prev.filter((_, i) => i !== index))
    }
  }

  const handleSubmit = async () => {
    if (!housekeeperName.trim()) {
      toast.error('Please enter housekeeper name')
      return
    }
    if (beforePhotos.length === 0) {
      toast.error('Please add at least one before photo')
      return
    }
    if (afterPhotos.length === 0) {
      toast.error('Please add at least one after photo')
      return
    }

    setSaving(true)
    try {
      // Upload photos to storage
      const uploadPhotos = async (photos, prefix) => {
        const urls = []
        for (let i = 0; i < photos.length; i++) {
          const fileName = `housekeeping/${condo.code}_${prefix}_${Date.now()}_${i + 1}.jpg`
          const { data, error } = await supabase.storage
            .from('condo-images')
            .upload(fileName, photos[i].file, {
              cacheControl: '3600',
              upsert: true
            })
          
          if (!error) {
            const { data: urlData } = supabase.storage
              .from('condo-images')
              .getPublicUrl(fileName)
            urls.push(urlData.publicUrl)
          }
        }
        return urls
      }

      const beforeUrls = await uploadPhotos(beforePhotos, 'before')
      const afterUrls = await uploadPhotos(afterPhotos, 'after')

      // Save cleaning record
      const { error: recordError } = await supabase.from('housekeeping_records').insert({
        condo_id: condo.id,
        housekeeper_name: housekeeperName,
        notes: notes,
        before_photos: beforeUrls,
        after_photos: afterUrls,
        completed_at: new Date().toISOString()
      })

      if (recordError) throw recordError

      // Update condo status
      const { error: updateError } = await supabase
        .from('condos')
        .update({ 
          housekeeping_status: 'ready',
          housekeeping_updated_at: new Date().toISOString()
        })
        .eq('id', condo.id)

      if (updateError) throw updateError

      toast.success('Unit marked as ready!')
      onConfirm()
      onClose()
    } catch (err) {
      console.error('Error:', err)
      toast.error('Failed to save cleaning record')
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
          
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-[#2d568e] dark:text-blue-400">Cleaning Report</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{condo.title} ({condo.code})</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`flex-1 h-2 rounded-full ${step === 'before' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <div className={`flex-1 h-2 rounded-full ${step === 'after' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-600'}`} />
          </div>
          <div className="flex justify-between text-xs font-medium mb-6">
            <span className={step === 'before' ? 'text-amber-600' : 'text-gray-400'}>📸 Before Photos</span>
            <span className={step === 'after' ? 'text-emerald-600' : 'text-gray-400'}>✨ After Photos</span>
          </div>

          {/* Housekeeper Name */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Housekeeper Name *</label>
            <input 
              type="text" 
              value={housekeeperName} 
              onChange={e => setHousekeeperName(e.target.value)}
              placeholder="Enter your name"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            />
          </div>

          {/* Before/After Photos */}
          {step === 'before' ? (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-3">Before Cleaning Photos *</h4>
              <div className="grid grid-cols-3 gap-3">
                {beforePhotos.map((photo, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 group">
                    <img src={photo.preview} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(i, 'before')}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {beforePhotos.length < 3 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-600 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500 transition-colors bg-amber-50 dark:bg-amber-900/20">
                    <Camera size={20} className="text-amber-500 mb-1" />
                    <span className="text-[10px] text-amber-600 font-medium">Add Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'before')} />
                  </label>
                )}
              </div>
              <button 
                onClick={() => setStep('after')}
                disabled={beforePhotos.length === 0}
                className="w-full mt-3 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Next: After Photos <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="mb-4">
              <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3">After Cleaning Photos *</h4>
              <div className="grid grid-cols-3 gap-3">
                {afterPhotos.map((photo, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 group">
                    <img src={photo.preview} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(i, 'after')}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {afterPhotos.length < 3 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-600 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors bg-emerald-50 dark:bg-emerald-900/20">
                    <Camera size={20} className="text-emerald-500 mb-1" />
                    <span className="text-[10px] text-emerald-600 font-medium">Add Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'after')} />
                  </label>
                )}
              </div>
              
              {/* Notes */}
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Notes (optional)</label>
                <textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any observations, maintenance issues, etc..."
                  rows={2}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 resize-none"
                />
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep('before')}
                  className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300">
                  Back
                </button>
                <button 
                  onClick={handleSubmit}
                  disabled={saving || afterPhotos.length === 0}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? 'Saving...' : '✓ Mark as Ready'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Cleaning History Panel                                              */
/* ------------------------------------------------------------------ */

function CleaningHistory({ condoId, isOpen, onClose }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRecord, setExpandedRecord] = useState(null)

  useEffect(() => {
    if (!isOpen || !condoId) return
    fetchRecords()
  }, [isOpen, condoId])

  const fetchRecords = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('housekeeping_records')
      .select('*')
      .eq('condo_id', condoId)
      .order('completed_at', { ascending: false })
      .limit(20)
    setRecords(data || [])
    setLoading(false)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
          
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#2d568e] dark:text-blue-400 flex items-center gap-2">
              <History size={20} /> Cleaning History
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1,2,3].map(i => (
                <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8">
              <History size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No cleaning records yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map(record => (
                <div key={record.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden">
                  <button 
                    onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {record.housekeeper_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(record.completed_at), 'MMM d, yyyy \'at\' h:mm a')}
                      </p>
                    </div>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedRecord === record.id ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {expandedRecord === record.id && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-600">
                          {record.notes && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-3 mb-3">{record.notes}</p>
                          )}
                          
                          {record.before_photos?.length > 0 && (
                            <div className="mb-3">
                              <p className="text-[10px] font-bold text-amber-600 uppercase mb-2">Before Photos</p>
                              <div className="flex gap-2">
                                {record.before_photos.map((url, i) => (
                                  <img key={i} src={url} alt={`Before ${i + 1}`} className="w-16 h-16 rounded-lg object-cover" />
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {record.after_photos?.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-emerald-600 uppercase mb-2">After Photos</p>
                              <div className="flex gap-2">
                                {record.after_photos.map((url, i) => (
                                  <img key={i} src={url} alt={`After ${i + 1}`} className="w-16 h-16 rounded-lg object-cover" />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function AdminHousekeeping() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [markReadyModal, setMarkReadyModal] = useState({ isOpen: false, condo: null })
  const [historyModal, setHistoryModal] = useState({ isOpen: false, condoId: null })

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    
    const { data: notReadyCondos, error: condosError } = await supabase
      .from('condos')
      .select('*')
      .eq('housekeeping_status', 'not_ready')
      .order('housekeeping_updated_at', { ascending: false })

    if (condosError) {
      console.error(condosError)
      setLoading(false)
      return
    }

    const condoIds = (notReadyCondos || []).map(c => c.id)
    
    let tasksData = []
    
    if (condoIds.length > 0) {
      const { data: recentBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .in('condo_id', condoIds)
        .eq('status', 'confirmed')
        .order('end_date', { ascending: false })

      if (!bookingsError) {
        const bookingsByCondo = {}
        recentBookings?.forEach(b => {
          if (!bookingsByCondo[b.condo_id]) {
            bookingsByCondo[b.condo_id] = b
          }
        })

        tasksData = (notReadyCondos || []).map(condo => ({
          ...condo,
          lastBooking: bookingsByCondo[condo.id] || null,
          timeSinceCheckout: bookingsByCondo[condo.id] 
            ? getTimeSince(new Date(bookingsByCondo[condo.id].end_date))
            : null
        }))
      }
    }

    setTasks(tasksData)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const getTimeSince = (date) => {
    const now = new Date()
    const diffMs = now - date
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins}m ago`
    }
    return `${diffMins}m ago`
  }

  const filteredTasks = tasks.filter(task => {
    if (!searchText) return true
    const s = searchText.toLowerCase()
    return (task.title || '').toLowerCase().includes(s) ||
           (task.code || '').toLowerCase().includes(s) ||
           (task.lastBooking?.guest_name || '').toLowerCase().includes(s)
  })

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        {[1,2,3].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 h-24" />
        ))}
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
            <input 
              type="text" 
              placeholder="Search unit or guest..." 
              value={searchText} 
              onChange={e => setSearchText(e.target.value)}
              className="pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 w-64 focus:outline-none focus:ring-2 focus:ring-blue-100" 
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <AlertTriangle size={16} className="text-amber-600" />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
              {tasks.length} unit{tasks.length !== 1 ? 's' : ''} need{tasks.length === 1 ? 's' : ''} cleaning
            </span>
          </div>
        </div>
        <button onClick={fetchTasks} className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">All Clear!</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">No units need cleaning right now.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredTasks.map(task => {
            const imageUrl = getCondoImage(task)
            const booking = task.lastBooking

            return (
              <motion.div 
                key={task.id} 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Unit Image */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                    {imageUrl ? (
                      <img src={imageUrl} alt={task.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 size={24} className="text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{task.title}</h3>
                      <span className="text-xs font-mono font-semibold text-[#2d568e] dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                        {task.code || '—'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                        <AlertTriangle size={10} /> Not Ready
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm mt-2">
                      {booking && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <User size={14} />
                          <span className="font-medium">{booking.guest_name || 'Unknown Guest'}</span>
                        </div>
                      )}
                      
                      {booking && (
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          <Clock size={14} />
                          <span>
                            Checked out: {format(new Date(booking.end_date), 'MMM d, yyyy')} at 11:00 AM
                          </span>
                        </div>
                      )}

                      {task.timeSinceCheckout && (
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
                          <AlertTriangle size={14} />
                          <span>Waiting: {task.timeSinceCheckout}</span>
                        </div>
                      )}
                    </div>

                    {booking && (
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {booking.guest_email && (
                          <span className="flex items-center gap-1">
                            <Mail size={12} /> {booking.guest_email}
                          </span>
                        )}
                        {booking.guest_phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={12} /> {booking.guest_phone}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex flex-col gap-2">
                    <button
                      onClick={() => setMarkReadyModal({ isOpen: true, condo: task })}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm"
                    >
                      <Camera size={16} />
                      Mark Ready
                    </button>
                    <button
                      onClick={() => setHistoryModal({ isOpen: true, condoId: task.id })}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5"
                    >
                      <History size={14} />
                      History
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Mark Ready Modal */}
      <MarkReadyModal 
        isOpen={markReadyModal.isOpen}
        onClose={() => setMarkReadyModal({ isOpen: false, condo: null })}
        onConfirm={fetchTasks}
        condo={markReadyModal.condo}
      />

      {/* Cleaning History Modal */}
      <CleaningHistory 
        isOpen={historyModal.isOpen}
        onClose={() => setHistoryModal({ isOpen: false, condoId: null })}
        condoId={historyModal.condoId}
      />
    </div>
  )
}