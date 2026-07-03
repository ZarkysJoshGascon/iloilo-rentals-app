import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, eachMonthOfInterval } from 'date-fns'
import {
  Building2, MapPin, User, Calendar,
  FileText, Plus, Trash2, X, Camera, Eye, ChevronLeft, ChevronRight,
  ArrowRight, TrendingUp, TrendingDown,
  PiggyBank, Receipt, Wallet, BarChart3, Search
} from 'lucide-react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { getCondoImages } from '../utils/condoImages'
import { useCurrency } from '../context/CurrencyContext'

/* ------------------------------------------------------------------ */
/*  Animated Counter                                                    */
/* ------------------------------------------------------------------ */
function AnimatedCounter({ value, duration = 1000, className = '' }) {
  const [count, setCount] = useState(0)
  const frameRef = useRef(null)

  useEffect(() => {
    let startTime
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      setCount(Math.floor(progress * value))
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, duration])

  return <span className={className}>₱{count.toLocaleString()}</span>
}

/* ------------------------------------------------------------------ */
/*  Booking Tooltip (for MiniBarCalendar)                               */
/* ------------------------------------------------------------------ */
function BookingTooltip({ booking, position }) {
  if (!booking) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed z-[9999] bg-gray-900 text-white rounded-xl shadow-2xl p-3 w-56 pointer-events-none border border-white/10"
      style={{ left: Math.min(position.x + 12, window.innerWidth - 240), top: position.y + 12 }}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Booking</span><span className="text-xs font-mono font-semibold">{booking.booking_code || '—'}</span></div>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Guest</span><span className="text-xs font-semibold">{booking.guest_name || '—'}</span></div>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Check-in</span><span className="text-xs font-semibold">{format(new Date(booking.start_date), 'MMM d, yyyy')}</span></div>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Check-out</span><span className="text-xs font-semibold">{format(new Date(booking.end_date), 'MMM d, yyyy')}</span></div>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-400">Amount</span><span className="text-xs font-semibold">₱{(booking.total_amount || 0).toLocaleString()}</span></div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mini‑bar Calendar (confirmed bookings only, with hover tooltip)     */
/* ------------------------------------------------------------------ */
function MiniBarCalendar({ bookings, condoId }) {
  const [viewDate, setViewDate] = useState(new Date())
  const [hoveredBooking, setHoveredBooking] = useState(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  const weeks = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  const condoBookings = bookings
    .filter(b => b.condo_id === condoId && b.status === 'confirmed')
    .map(b => ({
      ...b,
      start_date: new Date(b.start_date),
      end_date: new Date(b.end_date),
      label: b.booking_code || (b.guest_name || 'Guest').split(' ')[0]
    }))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewDate(d => subMonths(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronLeft size={14} /></button>
        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{format(viewDate, 'MMMM yyyy')}</span>
        <button onClick={() => setViewDate(d => addMonths(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center text-xs font-bold text-gray-600 dark:text-gray-400 py-0.5">{d}</div>)}
      </div>
      <div className="relative">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 relative" style={{ height: 34 }}>
            {week.map(day => {
              const inMonth = isSameMonth(day, viewDate)
              const today = isSameDay(day, new Date())
              return (
                <div key={day.toString()} className="flex-shrink-0 border border-gray-100 dark:border-gray-600 flex items-center justify-center">
                  <span className={`text-xs font-semibold ${today ? 'text-blue-600 dark:text-blue-400 font-extrabold' : inMonth ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>{format(day, 'd')}</span>
                </div>
              )
            })}
            {condoBookings.map(bk => {
              const bS = new Date(bk.start_date), bE = new Date(bk.end_date)
              const ws = week[0], we = week[6]
              if (bE < ws || bS > we) return null
              let sc = 0, ec = 6
              const sIdx = week.findIndex(d => isSameDay(d, bS))
              const eIdx = week.findIndex(d => isSameDay(d, bE))
              if (sIdx >= 0) sc = sIdx
              if (eIdx >= 0) ec = eIdx
              const stw = sIdx >= 0, etw = eIdx >= 0
              return (
                <div key={bk.id}
                  onMouseEnter={(e) => { setHoveredBooking(bk); setHoverPos({ x: e.clientX, y: e.clientY }) }}
                  onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredBooking(null)}
                  className="absolute flex items-center cursor-pointer"
                  style={{
                    backgroundColor: 'rgba(5,150,105,0.35)',
                    height: 20,
                    left: `${(sc / 7) * 100}%`,
                    width: `${((ec - sc + 1) / 7) * 100}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    borderRadius: stw && etw ? 4 : stw ? '4px 0 0 4px' : etw ? '0 4px 4px 0' : 0,
                    border: '2px solid #059669',
                    marginLeft: stw ? 2 : 0,
                    marginRight: etw ? 2 : 0,
                    zIndex: 10
                  }}>
                  {stw && <span className="text-[9px] font-bold text-white px-1.5 truncate drop-shadow-sm">{bk.label}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <AnimatePresence>
        {hoveredBooking && <BookingTooltip booking={hoveredBooking} position={hoverPos} />}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Bookings‑per‑month chart (with minimum height for visibility)       */
/* ------------------------------------------------------------------ */
function MonthlyBookingsChart({ bookings, condoId, title }) {
  const currentYear = new Date().getFullYear()
  const months = eachMonthOfInterval({ start: new Date(currentYear, 0, 1), end: new Date(currentYear, 11, 31) })
  const data = months.map(month => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    const filtered = condoId
      ? bookings.filter(b => b.condo_id === condoId && b.status === 'confirmed')
      : bookings.filter(b => b.status === 'confirmed')
    const count = filtered.filter(b => {
      const start = new Date(b.start_date)
      return start >= monthStart && start <= monthEnd
    }).length
    return { month: format(month, 'MMM'), count }
  })
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const totalBookings = data.reduce((s, d) => s + d.count, 0)

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm">
      <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
        <BarChart3 size={18} className="text-[#2d568e]" />
        {title || 'Bookings per Month'} ({currentYear})
      </h3>

      {totalBookings === 0 ? (
        <p className="text-xs text-gray-400">No bookings data available</p>
      ) : (
        <>
          <div className="h-36 flex items-end gap-2">
            {data.map((d, i) => {
              const heightPercent = Math.max((d.count / maxCount) * 100, 4)
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${heightPercent}%` }}
                    transition={{ duration: 0.5, delay: i * 0.02 }}
                    className="w-3/4 bg-[#2d568e] rounded-t-md min-h-[4px]"
                    title={`${d.count} booking${d.count !== 1 ? 's' : ''}`}
                  />
                  <span className="text-[10px] text-gray-500 mt-1">{d.month}</span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">Total: {totalBookings} bookings</p>
        </>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Simple Image Lightbox (for expense receipts)                        */
/* ------------------------------------------------------------------ */
function ImageLightbox({ src, onClose }) {
  if (!src) return null
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"><X size={22} /></button>
      <img src={src} alt="Receipt" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Expense Modal (unchanged)                                          */
/* ------------------------------------------------------------------ */
function ExpenseModal({ isOpen, onClose, onSave, condoId }) {
  const [type, setType] = useState('other')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setType('other'); setAmount(''); setDescription('')
      setExpenseDate(format(new Date(), 'yyyy-MM-dd'))
      setPhotoFile(null); setPhotoPreview(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)) }
  }

  const handleSubmit = async () => {
    if (!amount || isNaN(amount) || Number(amount) <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      let photoUrl = null
      if (photoFile) {
        const fileName = `expenses/${condoId}_${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage.from('housekeeping-photos').upload(fileName, photoFile, { cacheControl: '3600', upsert: true })
        if (!uploadError) {
          const { data } = supabase.storage.from('housekeeping-photos').getPublicUrl(fileName)
          photoUrl = data.publicUrl
        }
      }
      await supabase.from('expenses').insert({ condo_id: condoId, type, amount: Number(amount), description, expense_date: expenseDate, photo_url: photoUrl })
      toast.success('Expense added')
      onSave(); onClose()
    } catch { toast.error('Failed to add expense') }
    finally { setSaving(false) }
  }

  const inputClass = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20"

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Add Expense</h3><button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={18} /></button></div>
        <div className="space-y-4">
          <div><label className="text-xs font-medium text-gray-600 mb-1 block">Type</label><select value={type} onChange={e => setType(e.target.value)} className={inputClass}><option value="water">Water</option><option value="electricity">Electricity</option><option value="housekeeping">Housekeeping</option><option value="maintenance">Maintenance</option><option value="other">Other</option></select></div>
          <div><label className="text-xs font-medium text-gray-600 mb-1 block">Amount</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-600 mb-1 block">Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} /></div>
          <div><label className="text-xs font-medium text-gray-600 mb-1 block">Date</label><input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className={inputClass} /></div>
          <div><label className="text-xs font-medium text-gray-600 mb-1 block">Receipt Photo</label>
            {photoPreview ? (
              <div className="relative inline-block"><img src={photoPreview} alt="" className="max-h-32 rounded-lg" /><button onClick={() => { setPhotoPreview(null); setPhotoFile(null) }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X size={12} /></button></div>
            ) : (
              <label className="flex flex-col items-center border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-4 cursor-pointer hover:border-blue-400"><Camera size={20} className="text-gray-400 mb-1" /><span className="text-xs text-gray-400">Upload photo</span><input type="file" accept="image/*" className="hidden" onChange={handlePhoto} /></label>
            )}
          </div>
          <button onClick={handleSubmit} disabled={saving} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Add Expense'}</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Listing Detail Panel (scrolls to top, owner placeholder, lightbox)  */
/* ------------------------------------------------------------------ */
function ListingDetailPanel({ condo, bookings, expenses, onClose, onAddExpense, onDeleteExpense }) {
  const { formatPrice } = useCurrency()
  const condoBookings = bookings.filter(b => b.condo_id === condo.id && b.status === 'confirmed')
  const condoExpenses = expenses.filter(e => e.condo_id === condo.id)
  const totalRevenue = condoBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const totalExpenses = condoExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const net = totalRevenue - totalExpenses
  const images = condo.code ? getCondoImages(condo.code) : []
  const owner = condo.owners || {}

  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [lightboxSrc, setLightboxSrc] = useState(null)

  // Scroll to top when detail panel opens
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (images.length <= 1) return
    const interval = setInterval(() => setCurrentImageIndex(prev => (prev + 1) % images.length), 4000)
    return () => clearInterval(interval)
  }, [images.length])

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="space-y-4">
      <motion.button whileHover={{ x: -4 }} onClick={onClose} className="flex items-center gap-2 text-sm font-medium text-[#2d568e] hover:text-[#1e3a5f]">
        <ArrowRight size={16} className="rotate-180" /> Back to all listings
      </motion.button>

      {/* Top row: 4 equal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Unit info – image with overlay + owner (or placeholder) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm">
          <div className="relative h-40 bg-gray-100 dark:bg-gray-700">
            {images.length > 0 ? (
              images.map((img, idx) => (
                <div key={idx} className={`absolute inset-0 transition-opacity duration-500 ${idx === currentImageIndex ? 'opacity-100' : 'opacity-0'}`}>
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full"><Building2 size={32} className="text-gray-400" /></div>
            )}
            {images.length > 1 && (
              <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full z-10">
                {currentImageIndex + 1}/{images.length}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <h3 className="font-bold text-sm text-white truncate">{condo.title}</h3>
              <p className="text-xs text-white/70 font-mono">{condo.code}</p>
              <p className="text-xs text-white/80 mt-0.5">{formatPrice(condo.price_per_night)}/night</p>
            </div>
          </div>
          {/* Owner section (or placeholder) */}
          <div className="p-3 bg-white dark:bg-gray-800 flex items-center gap-2">
            {owner.name ? (
              <>
                {owner.avatar_url ? <img src={owner.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-gray-100" /> : <div className="w-7 h-7 rounded-full bg-[#2d568e] flex items-center justify-center text-white text-xs font-semibold">{owner.name?.charAt(0)}</div>}
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{owner.name}</span>
              </>
            ) : (
              <>
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center"><User size={14} className="text-gray-400" /></div>
                <span className="text-xs text-gray-400 italic">No owner assigned</span>
              </>
            )}
          </div>
        </motion.div>

        {/* Card 2: Revenue */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm flex flex-col justify-center items-center">
          <TrendingUp size={24} className="text-gray-400 mb-2" />
          <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue</p>
          <p className="text-xl font-bold text-blue-600 mt-1">₱{totalRevenue.toLocaleString()}</p>
        </motion.div>

        {/* Card 3: Expenses */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm flex flex-col justify-center items-center">
          <TrendingDown size={24} className="text-gray-400 mb-2" />
          <p className="text-xs text-gray-500 uppercase tracking-wider">Expenses</p>
          <p className="text-xl font-bold text-red-500 mt-1">₱{totalExpenses.toLocaleString()}</p>
        </motion.div>

        {/* Card 4: Net */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm flex flex-col justify-center items-center">
          <PiggyBank size={24} className="text-gray-400 mb-2" />
          <p className="text-xs text-gray-500 uppercase tracking-wider">Net</p>
          <p className={`text-xl font-bold mt-1 ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>₱{net.toLocaleString()}</p>
        </motion.div>
      </div>

      {/* Calendar + Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MiniBarCalendar bookings={bookings} condoId={condo.id} />
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-4 shadow-sm">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Calendar size={16} className="text-[#2d568e]" />Bookings</h3>
          {condoBookings.length === 0 ? <p className="text-xs text-gray-400">No bookings</p> : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {condoBookings.map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs border-b border-gray-100 dark:border-gray-700 pb-2">
                  <div><span className="font-semibold">{b.guest_name || 'Guest'}</span><span className="text-gray-500 ml-2 font-mono">{b.booking_code}</span></div>
                  <div className="text-right"><p>{format(new Date(b.start_date), 'MMM d')} → {format(new Date(b.end_date), 'MMM d')}</p><p className="font-semibold text-emerald-600">₱{(b.total_amount || 0).toLocaleString()}</p></div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Property bookings chart */}
      <MonthlyBookingsChart bookings={bookings} condoId={condo.id} title="Property Bookings" />

      {/* Expenses with lightbox */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm flex items-center gap-2"><Receipt size={16} className="text-[#2d568e]" />Expenses</h3>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => onAddExpense(condo.id)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1"><Plus size={12} /> Add</motion.button>
        </div>
        {condoExpenses.length === 0 ? <p className="text-xs text-gray-400">No expenses</p> : (
          <div className="space-y-2">
            {condoExpenses.map(e => (
              <div key={e.id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-700/30 p-2.5 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">{e.type}</span>
                  <span className="text-gray-600 dark:text-gray-400">{e.description?.slice(0, 30)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-red-500">₱{Number(e.amount).toLocaleString()}</span>
                  {e.photo_url && (
                    <button onClick={() => setLightboxSrc(e.photo_url)} className="text-blue-500 hover:text-blue-700">
                      <Eye size={14} />
                    </button>
                  )}
                  <button onClick={() => onDeleteExpense(e.id)}><Trash2 size={14} className="text-red-400 hover:text-red-600" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Lightbox for expense image */}
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Listing Card (AdminListings style + owner placeholder)              */
/* ------------------------------------------------------------------ */
function ListingCard({ condo, bookings, expenses, onClick }) {
  const { formatPrice } = useCurrency()
  const totalRevenue = bookings.filter(b => b.condo_id === condo.id && b.status === 'confirmed').reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const totalExpenses = expenses.filter(e => e.condo_id === condo.id).reduce((sum, e) => sum + Number(e.amount), 0)
  const images = condo.code ? getCondoImages(condo.code) : []
  const owner = condo.owners || {}

  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [fade, setFade] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (images.length <= 1) return
    intervalRef.current = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setCurrentImageIndex(prev => (prev + 1) % images.length)
        setFade(true)
      }, 300)
    }, 4000)
    return () => clearInterval(intervalRef.current)
  }, [images.length])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      onClick={onClick}
      className="group h-full cursor-pointer"
    >
      <div className="relative h-full rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 bg-white dark:bg-gray-800">
        {/* Image carousel */}
        <div className="relative h-56 sm:h-64 w-full">
          {images.length > 0 ? (
            images.map((img, idx) => (
              <div key={idx} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: idx === currentImageIndex && fade ? 1 : 0 }}>
                <img src={img} alt="" className="w-full h-full object-cover" />
              </div>
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
              <Building2 size={48} className="text-gray-400" />
            </div>
          )}
          {images.length > 1 && (
            <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full z-10">
              {currentImageIndex + 1}/{images.length}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 px-4 pt-8 pb-3">
            <h3 className="text-base font-semibold text-white truncate leading-tight">
              {condo.title} ({condo.code || '---'})
            </h3>
            <div className="flex items-center gap-1 mt-0.5 text-white/80 text-xs">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{condo.location}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-xl font-bold text-white">{formatPrice(condo.price_per_night)}</span>
              <span className="text-xs text-white/70">/ night</span>
            </div>
          </div>
        </div>

        {/* Owner section (or placeholder) with financials */}
        <div className="p-3 bg-white dark:bg-gray-800 rounded-b-lg -mt-1 relative z-10">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
            {owner.name ? (
              <>
                {owner.avatar_url ? <img src={owner.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover ring-1 ring-gray-200" /> : <div className="w-5 h-5 rounded-full bg-[#2d568e] flex items-center justify-center text-white text-[10px] font-bold">{owner.name?.charAt(0)}</div>}
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{owner.name}</span>
              </>
            ) : (
              <>
                <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center"><User size={12} className="text-gray-400" /></div>
                <span className="text-xs text-gray-400 italic">No owner</span>
              </>
            )}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-blue-600 font-semibold">₱{totalRevenue.toLocaleString()}</span>
            <span className="text-red-500 font-semibold">₱{totalExpenses.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Accounting Component                                          */
/* ------------------------------------------------------------------ */
export default function AdminAccounting() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCondo, setSelectedCondo] = useState(null)
  const [expenseModal, setExpenseModal] = useState({ isOpen: false, condoId: null })
  const [searchText, setSearchText] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [owners, setOwners] = useState([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [cRes, bRes, eRes, oRes] = await Promise.all([
      supabase.from('condos').select('*, owners:owner_id(name, avatar_url, email)').order('title'),
      supabase.from('bookings').select('*').eq('status', 'confirmed'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('owners').select('*').order('name')
    ])
    setCondos(cRes.data || [])
    setBookings(bRes.data || [])
    setExpenses(eRes.data || [])
    setOwners(oRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDeleteExpense = async (expenseId) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', expenseId)
    toast.success('Expense deleted')
    fetchData()
  }

  const totalBusinessRevenue = bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const totalBusinessExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const netProfit = totalBusinessRevenue - totalBusinessExpenses

  // Filter condos
  const filteredCondos = condos.filter(c => {
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!(c.title || '').toLowerCase().includes(s) && !(c.code || '').toLowerCase().includes(s)) return false
    }
    if (ownerFilter !== 'all' && c.owner_id !== ownerFilter) return false
    return true
  })

  if (loading) return (
    <div className="p-8 space-y-4 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl h-24 border" />)}
      </div>
      <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-xl h-64 border" />)}
      </div>
    </div>
  )

  if (selectedCondo) {
    return (
      <div className="space-y-4">
        <ListingDetailPanel
          condo={selectedCondo}
          bookings={bookings}
          expenses={expenses}
          onClose={() => setSelectedCondo(null)}
          onAddExpense={(condoId) => setExpenseModal({ isOpen: true, condoId })}
          onDeleteExpense={handleDeleteExpense}
        />
        <ExpenseModal isOpen={expenseModal.isOpen} onClose={() => setExpenseModal({ isOpen: false, condoId: null })} onSave={fetchData} condoId={expenseModal.condoId} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Business overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Total Revenue</p>
            <Wallet size={22} className="text-gray-400" />
          </div>
          <p className="text-3xl font-extrabold text-blue-600"><AnimatedCounter value={totalBusinessRevenue} /></p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Total Expenses</p>
            <Receipt size={22} className="text-gray-400" />
          </div>
          <p className="text-3xl font-extrabold text-red-500"><AnimatedCounter value={totalBusinessExpenses} /></p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Net Profit</p>
            <BarChart3 size={22} className="text-gray-400" />
          </div>
          <p className={`text-3xl font-extrabold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            <AnimatedCounter value={netProfit} />
          </p>
        </motion.div>
      </div>

      {/* Total bookings graph */}
      <MonthlyBookingsChart bookings={bookings} title="Total Bookings" />

      {/* Search and filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search properties..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 w-full focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={ownerFilter}
          onChange={e => setOwnerFilter(e.target.value)}
          className="px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 dark:text-gray-100 cursor-pointer"
        >
          <option value="all">All Owners</option>
          {owners.map(o => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Building2 size={20} className="text-[#2d568e]" />
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Properties ({filteredCondos.length})</h2>
      </div>

      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        initial="hidden" animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}>
        {filteredCondos.map(condo => (
          <motion.div key={condo.id} variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
            <ListingCard condo={condo} bookings={bookings} expenses={expenses} onClick={() => setSelectedCondo(condo)} />
          </motion.div>
        ))}
      </motion.div>

      <ExpenseModal isOpen={expenseModal.isOpen} onClose={() => setExpenseModal({ isOpen: false, condoId: null })} onSave={fetchData} condoId={expenseModal.condoId} />
    </div>
  )
}