import { useEffect, useState, useCallback, useRef } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, eachMonthOfInterval } from 'date-fns'
import {
  Building2, MapPin, User, Calendar, Plus, Trash2, X,
  ChevronLeft, ChevronRight, ArrowRight, TrendingUp,
  PiggyBank, Receipt, Wallet, Search, Download, Camera
} from 'lucide-react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from "../../../lib/supabase";
import { getCondoImages } from "../../../utils/condoImages";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Area, AreaChart, PieChart, Pie, Cell, Tooltip } from "recharts"

const BASIC_CLEAN_PRICE = 250
const DEEP_CLEAN_PRICE = 500

const chartConfig = {
  revenue: { label: "Revenue", color: "#2d568e" },
  expenses: { label: "Expenses", color: "#ef4444" },
  netIncome: { label: "Net Income", color: "#059669" },
  bookings: { label: "Bookings", color: "#2d568e" },
}

// ============ MINI CALENDAR ============
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
    .map(b => ({ ...b, start_date: new Date(b.start_date), end_date: new Date(b.end_date), label: b.booking_code || (b.guest_name || 'Guest').split(' ')[0] }))

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setViewDate(d => subMonths(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronLeft size={14} /></button>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{format(viewDate, 'MMMM yyyy')}</span>
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
                <div key={day.toString()} className="flex-shrink-0 border border-gray-100 dark:border-gray-700 flex items-center justify-center">
                  <span className={`text-xs font-semibold ${today ? 'text-blue-600 font-extrabold' : inMonth ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>{format(day, 'd')}</span>
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
                <div key={bk.id} onMouseEnter={(e) => { setHoveredBooking(bk); setHoverPos({ x: e.clientX, y: e.clientY }) }}
                  onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })} onMouseLeave={() => setHoveredBooking(null)}
                  className="absolute flex items-center cursor-pointer"
                  style={{ backgroundColor: 'rgba(6,182,212,0.35)', height: 20, left: `${(sc / 7) * 100}%`, width: `${((ec - sc + 1) / 7) * 100}%`, top: '50%', transform: 'translateY(-50%)', borderRadius: stw && etw ? 4 : stw ? '4px 0 0 4px' : etw ? '0 4px 4px 0' : 0, border: '2px solid #06b6d4', marginLeft: stw ? 2 : 0, marginRight: etw ? 2 : 0, zIndex: 10 }}>
                  {stw && <span className="text-[9px] font-bold text-white px-1.5 truncate">{bk.label}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============ EXPENSE MODAL ============
function ExpenseModal({ isOpen, onClose, onSave, condoId, condos }) {
  const [type, setType] = useState('other')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedCondoId, setSelectedCondoId] = useState(condoId || '')
  const [photoFiles, setPhotoFiles] = useState([])
  const [photoPreviews, setPhotoPreviews] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setType('other'); setAmount(''); setDescription('')
      setExpenseDate(format(new Date(), 'yyyy-MM-dd'))
      setPhotoFiles([]); setPhotoPreviews([])
      setSelectedCondoId(condoId || '')
    }
  }, [isOpen, condoId])

  if (!isOpen) return null

  const handlePhotos = (e) => {
    const files = Array.from(e.target.files)
    setPhotoFiles(prev => [...prev, ...files].slice(0, 5))
    setPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))].slice(0, 5))
  }

  const removePhoto = (index) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!amount || isNaN(amount) || Number(amount) <= 0) { toast.error('Enter a valid amount'); return }
    if (!selectedCondoId) { toast.error('Select a condo'); return }
    setSaving(true)
    try {
      const photoUrls = []
      for (let i = 0; i < photoFiles.length; i++) {
        const fileName = `expenses/${selectedCondoId}_${Date.now()}_${i}.jpg`
        const { error: uploadError } = await supabase.storage.from('housekeeping-photos').upload(fileName, photoFiles[i], { cacheControl: '3600', upsert: true })
        if (!uploadError) {
          const { data } = supabase.storage.from('housekeeping-photos').getPublicUrl(fileName)
          photoUrls.push(data.publicUrl)
        }
      }
      await supabase.from('expenses').insert({ condo_id: selectedCondoId, type, amount: Number(amount), description, expense_date: expenseDate, photo_urls: photoUrls })
      toast.success('Expense added')
      onSave(); onClose()
    } catch { toast.error('Failed to add expense') } finally { setSaving(false) }
  }

  const inputClass = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none"

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Add Expense</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          {!condoId && condos && (
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Condo *</label>
              <select value={selectedCondoId} onChange={e => setSelectedCondoId(e.target.value)} className={inputClass}>
                <option value="">Select condo...</option>
                {condos.map(c => <option key={c.id} value={c.id}>{c.title} ({c.code})</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
                <option value="water">Water</option>
                <option value="electricity">Electricity</option>
                <option value="housekeeping">Housekeeping</option>
                <option value="maintenance">Maintenance</option>
                <option value="internet">Internet</option>
                <option value="association_dues">Association Dues</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Amount *</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="What is this expense for?" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Date</label>
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Receipt Photos ({photoPreviews.length}/5)</label>
            <div className="grid grid-cols-5 gap-2">
              {photoPreviews.map((preview, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                  <img src={preview} className="w-full h-full object-cover" />
                  <button onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><X size={10} /></button>
                </div>
              ))}
              {photoPreviews.length < 5 && (
                <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
                  <Camera size={16} className="text-gray-400" />
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotos} multiple />
                </label>
              )}
            </div>
          </div>
          <button onClick={handleSubmit} disabled={saving} className="w-full py-3 bg-[#2d568e] text-white rounded-xl text-sm font-semibold hover:bg-[#1e3a5f] disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Expense'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ============ HELPER ============
function calculateMonthOccupancy(bookings, totalUnits, monthDate) {
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).length
  const totalPossibleDays = daysInMonth * totalUnits
  
  let occupiedDays = 0
  bookings.forEach(b => {
    const bStart = new Date(b.start_date)
    const bEnd = new Date(b.end_date)
    if (bEnd < monthStart || bStart > monthEnd) return
    const overlapStart = bStart < monthStart ? monthStart : bStart
    const overlapEnd = bEnd > monthEnd ? monthEnd : bEnd
    const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24))
    if (days > 0) occupiedDays += days
  })
  
  const vacantDays = Math.max(0, totalPossibleDays - occupiedDays)
  const occupancyRate = totalPossibleDays > 0 ? Math.min(100, Math.round((occupiedDays / totalPossibleDays) * 100)) : 0
  return { occupiedDays, vacantDays, occupancyRate, totalPossibleDays }
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ============ LISTING CARD ============
function ListingCard({ condo, bookings, expenses, cleaningRecords, onClick }) {
  const condoBookings = bookings.filter(b => b.condo_id === condo.id && b.status === 'confirmed')
  const condoExpenses = expenses.filter(e => e.condo_id === condo.id)
  const condoCleanings = cleaningRecords.filter(r => r.condo_id === condo.id)
  const totalRevenue = condoBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const regularExpenses = condoExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const cleaningExpenses = condoCleanings.reduce((s, c) => s + (c.cleaning_type === 'deep_clean' ? DEEP_CLEAN_PRICE : BASIC_CLEAN_PRICE), 0)
  const totalExpenses = regularExpenses + cleaningExpenses
  const netIncome = totalRevenue - totalExpenses
  const images = condo.code ? getCondoImages(condo.code) : []
  const owner = condo.owners || {}
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  useEffect(() => {
    if (images.length <= 1) return
    const interval = setInterval(() => setCurrentImageIndex(prev => (prev + 1) % images.length), 4000)
    return () => clearInterval(interval)
  }, [images.length])

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      whileHover={{ y: -4 }} 
      onClick={() => onClick(condo)} 
      className="group h-full cursor-pointer"
    >
      <div className="h-full rounded-xl overflow-hidden shadow-[4px_6px_16px_rgba(0,0,0,0.15)] hover:shadow-[6px_8px_20px_rgba(0,0,0,0.25)] transition-all bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="relative h-40 w-full">
          {images.length > 0 ? (
            images.map((img, idx) => (
              <div key={idx} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: idx === currentImageIndex ? 1 : 0 }}>
                <img src={img} className="w-full h-full object-cover" />
              </div>
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700"><Building2 size={40} className="text-gray-400" /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h3 className="text-lg font-bold text-white truncate">{condo.title}</h3>
            <span className="text-sm text-white/80 font-mono">{condo.code}</span>
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            {owner.name ? (
              <>
                {owner.avatar_url ? <img src={owner.avatar_url} className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs font-bold">{owner.name?.charAt(0)}</div>}
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{owner.name}</span>
              </>
            ) : (
              <span className="text-sm text-gray-400 italic">No owner assigned</span>
            )}
          </div>

          <div className="space-y-2.5 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Revenue</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">₱{totalRevenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium">Expenses</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">₱{totalExpenses.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wide font-bold">Net Income</span>
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">₱{netIncome.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ============ CONDO DETAIL MODAL ============
function CondoDetailModal({ condo, bookings, expenses, cleaningRecords, onClose, onAddExpense, onDeleteExpense }) {
  const condoBookings = bookings.filter(b => b.condo_id === condo.id && b.status === 'confirmed')
  const condoExpenses = expenses.filter(e => e.condo_id === condo.id)
  const condoCleanings = cleaningRecords.filter(r => r.condo_id === condo.id)
  
  const totalRevenue = condoBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const regularExpensesTotal = condoExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const cleaningExpensesTotal = condoCleanings.reduce((s, c) => s + (c.cleaning_type === 'deep_clean' ? DEEP_CLEAN_PRICE : BASIC_CLEAN_PRICE), 0)
  const totalExpenses = regularExpensesTotal + cleaningExpensesTotal
  const netIncome = totalRevenue - totalExpenses
  
  const owner = condo.owners || {}
  const [activeTab, setActiveTab] = useState('overview')
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [occupancyMonth, setOccupancyMonth] = useState(new Date())

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const condoOccupancy = calculateMonthOccupancy(condoBookings, 1, occupancyMonth)

  const allExpenseItems = [
    ...condoExpenses.map(e => ({
      id: e.id,
      type: e.type || 'other',
      description: e.description || 'Expense',
      amount: Number(e.amount),
      date: e.expense_date || e.created_at,
      isCleaning: false,
      photos: e.photo_urls || [],
    })),
    ...condoCleanings.map(c => ({
      id: c.id,
      type: 'housekeeping',
      description: c.cleaning_code || 'Cleaning Service',
      amount: c.cleaning_type === 'deep_clean' ? DEEP_CLEAN_PRICE : BASIC_CLEAN_PRICE,
      date: c.completed_at || c.created_at,
      isCleaning: true,
      cleaningType: c.cleaning_type,
      cleaner: c.housekeepers?.name || 'Unassigned',
      photos: [],
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-[8px_12px_32px_rgba(0,0,0,0.3)] w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <ArrowRight size={20} className="rotate-180" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{condo.title}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{condo.code} · {condo.location}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          {[
            { id: 'overview', label: 'Overview', icon: TrendingUp },
            { id: 'bookings', label: 'Bookings', icon: Calendar },
            { id: 'expenses', label: 'Expenses', icon: Receipt },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-t-lg font-semibold text-sm flex items-center gap-2 transition-colors ${
                activeTab === tab.id ? 'bg-white dark:bg-gray-800 text-[#2d568e] dark:text-blue-400 border-t border-l border-r border-gray-200 dark:border-gray-700' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              <tab.icon size={16} />{tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="p-6 space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">Financial Summary</h3>
                
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Bookings ({condoBookings.length})</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {condoBookings.length === 0 ? (
                      <p className="text-xs text-gray-400">No bookings</p>
                    ) : (
                      condoBookings.map(b => (
                        <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{b.booking_code || '—'}</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{b.guest_name || 'Guest'}</span>
                          </div>
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">+₱{(b.total_amount || 0).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Expenses ({allExpenseItems.length})</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {allExpenseItems.length === 0 ? (
                      <p className="text-xs text-gray-400">No expenses</p>
                    ) : (
                      allExpenseItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className={`capitalize px-2 py-0.5 rounded-full text-xs font-bold ${item.isCleaning ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}>
                              {item.isCleaning ? 'Cleaning' : item.type}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.description}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(item.date), 'MMM d, yyyy')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.photos?.length > 0 && (
                              <div className="flex gap-1">
                                {item.photos.map((photo, i) => (
                                  <button key={i} onClick={() => setLightboxSrc(photo)} className="w-7 h-7 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 hover:opacity-80">
                                    <img src={photo} className="w-full h-full object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">-₱{item.amount.toLocaleString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Gross Revenue</span>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">₱{totalRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Expenses</span>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">-₱{totalExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-800 dark:text-gray-200 font-bold">Net Income</span>
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100">₱{netIncome.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Occupancy Rate</h3>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setOccupancyMonth(d => subMonths(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronLeft size={14} /></button>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{format(occupancyMonth, 'MMM yyyy')}</span>
                    <button onClick={() => setOccupancyMonth(d => addMonths(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronRight size={14} /></button>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-6">
                  <PieChart width={200} height={180}>
                    <Pie 
                      data={[
                        { name: 'Occupied', value: condoOccupancy.occupiedDays },
                        { name: 'Unoccupied', value: condoOccupancy.vacantDays },
                      ]} 
                      cx={100} 
                      cy={90} 
                      innerRadius={55} 
                      outerRadius={75} 
                      paddingAngle={3} 
                      dataKey="value"
                    >
                      <Cell fill="#06b6d4" />
                      <Cell fill="#9ca3af" />
                    </Pie>
                    <Tooltip />
                    <text x={100} y={85} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '24px', fontWeight: 'bold', fill: '#111827' }}>
                      {condoOccupancy.occupancyRate}%
                    </text>
                    <text x={100} y={105} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '12px', fill: '#6b7280' }}>
                      Occupied
                    </text>
                  </PieChart>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#06b6d4' }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Occupied</p>
                        <p className="text-xs text-gray-500">{condoOccupancy.occupiedDays} days</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Unoccupied</p>
                        <p className="text-xs text-gray-500">{condoOccupancy.vacantDays} days</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
                <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-3">Booking Calendar</h3>
                <MiniBarCalendar bookings={bookings} condoId={condo.id} />
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="p-6 space-y-3">
              <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">All Bookings ({condoBookings.length})</h3>
              {condoBookings.length === 0 ? (
                <p className="text-gray-400 text-sm">No bookings found</p>
              ) : (
                <div className="space-y-2">
                  {condoBookings.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-[3px_4px_12px_rgba(0,0,0,0.08)]">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{b.guest_name || 'Guest'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{b.booking_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{format(new Date(b.start_date), 'MMM d')} → {format(new Date(b.end_date), 'MMM d')}</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">₱{(b.total_amount || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">All Expenses ({allExpenseItems.length})</h3>
                <button onClick={() => onAddExpense(condo.id)} className="flex items-center gap-2 text-sm bg-[#2d568e] text-white px-3 py-1.5 rounded-lg hover:bg-[#1e3a5f]">
                  <Plus size={14} /> Add Expense
                </button>
              </div>
              {allExpenseItems.length === 0 ? (
                <p className="text-gray-400 text-sm">No expenses found</p>
              ) : (
                <div className="space-y-2">
                  {allExpenseItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-[3px_4px_12px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center gap-3">
                        <span className={`capitalize px-2 py-1 rounded-full text-xs font-bold ${item.isCleaning ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                          {item.isCleaning ? 'Cleaning' : item.type}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.description}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {item.isCleaning ? (
                              <>Cleaner: {item.cleaner} · {item.cleaningType === 'deep_clean' ? 'Deep Clean' : 'Basic Clean'}</>
                            ) : format(new Date(item.date), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.photos?.length > 0 && (
                          <div className="flex gap-1">
                            {item.photos.map((photo, i) => (
                              <button key={i} onClick={() => setLightboxSrc(photo)} className="w-8 h-8 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                                <img src={photo} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        <span className="font-bold text-gray-900 dark:text-gray-100">₱{item.amount.toLocaleString()}</span>
                        {!item.isCleaning && <button onClick={() => onDeleteExpense(item.id)}><Trash2 size={14} className="text-gray-400 hover:text-gray-600" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {lightboxSrc && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/90" onClick={() => setLightboxSrc(null)}>
          <button onClick={() => setLightboxSrc(null)} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white"><X size={22} /></button>
          <img src={lightboxSrc} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
        </div>
      )}
    </motion.div>
  )
}

// ============ MAIN COMPONENT ============
export default function AdminAccounting() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cleaningRecords, setCleaningRecords] = useState([])
  const [owners, setOwners] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCondo, setSelectedCondo] = useState(null)
  const [expenseModal, setExpenseModal] = useState({ isOpen: false, condoId: null })
  const [searchText, setSearchText] = useState('')
  const [occupancyMonth, setOccupancyMonth] = useState(new Date())

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, bRes, eRes, hrRes, oRes] = await Promise.all([
        supabase.from('condos').select('*, owners:owner_id(name, avatar_url, email, phone)').order('title'),
        supabase.from('bookings').select('*').eq('status', 'confirmed'),
        supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('housekeeping_records').select('*, housekeepers:housekeeper_id(name)').order('completed_at', { ascending: false }),
        supabase.from('owners').select('*').order('name')
      ])
      
      setCondos(cRes.data || [])
      setBookings(bRes.data || [])
      setExpenses(eRes.data || [])
      setCleaningRecords(hrRes.data || [])
      setOwners(oRes.data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load accounting data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    
    // Real-time subscriptions
    const channels = [
      supabase
        .channel('accounting-bookings')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchData())
        .subscribe(),
      supabase
        .channel('accounting-expenses')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchData())
        .subscribe(),
      supabase
        .channel('accounting-cleaning')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_records' }, () => fetchData())
        .subscribe(),
      supabase
        .channel('accounting-condos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'condos' }, () => fetchData())
        .subscribe(),
      supabase
        .channel('accounting-owners')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'owners' }, () => fetchData())
        .subscribe(),
    ]

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel))
    }
  }, [fetchData])

  const handleDeleteExpense = async (expenseId) => {
    if (!confirm('Delete this expense?')) return
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
      if (error) throw error
      toast.success('Expense deleted')
      fetchData()
    } catch {
      toast.error('Failed to delete expense')
    }
  }

  function getCondoRevenue(condoId) {
    return bookings.filter(b => b.condo_id === condoId && b.status === 'confirmed').reduce((sum, b) => sum + (b.total_amount || 0), 0)
  }

  function getCondoTotalExpenses(condoId) {
    const regularExpenses = expenses.filter(e => e.condo_id === condoId).reduce((sum, e) => sum + Number(e.amount), 0)
    const cleaningExpenses = cleaningRecords.filter(r => r.condo_id === condoId).reduce((s, c) => s + (c.cleaning_type === 'deep_clean' ? DEEP_CLEAN_PRICE : BASIC_CLEAN_PRICE), 0)
    return regularExpenses + cleaningExpenses
  }

  function getCondoNetIncome(condoId) {
    return getCondoRevenue(condoId) - getCondoTotalExpenses(condoId)
  }

  function getCondoBookingsCount(condoId) {
    return bookings.filter(b => b.condo_id === condoId && b.status === 'confirmed').length
  }

  const totalBusinessRevenue = bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
  const regularBusinessExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const cleaningBusinessExpenses = cleaningRecords.reduce((s, c) => s + (c.cleaning_type === 'deep_clean' ? DEEP_CLEAN_PRICE : BASIC_CLEAN_PRICE), 0)
  const totalBusinessExpenses = regularBusinessExpenses + cleaningBusinessExpenses
  const netIncome = totalBusinessRevenue - totalBusinessExpenses
  const totalUnits = condos.length
  const totalOwners = owners.length
  const totalBookings = bookings.length

  const currentYear = new Date().getFullYear()

  const monthlyFinancialData = eachMonthOfInterval({ start: new Date(currentYear, 0, 1), end: new Date(currentYear, 11, 31) }).map(month => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    
    const monthBookings = bookings.filter(b => {
      const start = new Date(b.start_date)
      return b.status === 'confirmed' && start >= monthStart && start <= monthEnd
    })
    const monthRevenue = monthBookings.reduce((s, b) => s + (b.total_amount || 0), 0)
    
    const monthExpenses = expenses.filter(e => {
      const date = new Date(e.expense_date || e.created_at)
      return date >= monthStart && date <= monthEnd
    }).reduce((s, e) => s + Number(e.amount), 0)
    
    const monthCleaningExpenses = cleaningRecords.filter(c => {
      const date = new Date(c.completed_at || c.created_at)
      return date >= monthStart && date <= monthEnd
    }).reduce((s, c) => s + (c.cleaning_type === 'deep_clean' ? DEEP_CLEAN_PRICE : BASIC_CLEAN_PRICE), 0)
    
    const totalMonthExpenses = monthExpenses + monthCleaningExpenses
    const monthNetIncome = monthRevenue - totalMonthExpenses
    
    return {
      month: format(month, 'MMM'),
      revenue: monthRevenue,
      expenses: totalMonthExpenses,
      netIncome: monthNetIncome,
    }
  })

  const monthlyBookingsData = eachMonthOfInterval({ start: new Date(currentYear, 0, 1), end: new Date(currentYear, 11, 31) }).map(month => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    const count = bookings.filter(b => {
      const start = new Date(b.start_date)
      return b.status === 'confirmed' && start >= monthStart && start <= monthEnd
    }).length
    return { month: format(month, 'MMM'), bookings: count }
  })

  const monthOccupancy = calculateMonthOccupancy(bookings, totalUnits, occupancyMonth)
  const occupancyDonutData = [
    { name: 'Occupied', value: monthOccupancy.occupiedDays, color: '#06b6d4' },
    { name: 'Unoccupied', value: monthOccupancy.vacantDays, color: '#9ca3af' },
  ]

  const filteredCondos = condos.filter(c => {
    if (searchText) {
      const s = searchText.toLowerCase()
      const ownerName = (c.owners?.name || '').toLowerCase()
      if (!(c.title || '').toLowerCase().includes(s) && !(c.code || '').toLowerCase().includes(s) && !ownerName.includes(s)) return false
    }
    return true
  })

  const exportFinancialReport = () => {
    const headers = ['Condo', 'Code', 'Revenue', 'Expenses', 'Net Income', 'Bookings']
    const rows = condos.map(condo => [condo.title, condo.code, getCondoRevenue(condo.id), getCondoTotalExpenses(condo.id), getCondoNetIncome(condo.id), getCondoBookingsCount(condo.id)])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    downloadCSV(csv, `financial_report_${new Date().toISOString().split('T')[0]}.csv`)
    toast.success('Report exported')
  }

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">{[1,2,3,4,5].map(i => <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-xl h-24 animate-pulse" />)}</div>
      <div className="bg-gray-200 dark:bg-gray-700 rounded-xl h-80 animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[1,2].map(i => <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-xl h-64 animate-pulse" />)}</div>
      <div className="bg-gray-200 dark:bg-gray-700 rounded-xl h-80 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-xl h-72 animate-pulse" />)}</div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Wallet size={14} /> Revenue</CardDescription></CardHeader>
          <CardContent><p className="text-xl font-bold text-gray-900 dark:text-gray-100">₱{totalBusinessRevenue.toLocaleString()}</p></CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Receipt size={14} /> Expenses</CardDescription></CardHeader>
          <CardContent><p className="text-xl font-bold text-gray-900 dark:text-gray-100">₱{totalBusinessExpenses.toLocaleString()}</p></CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><PiggyBank size={14} /> Net Income</CardDescription></CardHeader>
          <CardContent><p className="text-xl font-bold text-gray-900 dark:text-gray-100">₱{netIncome.toLocaleString()}</p></CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Building2 size={14} /> Units</CardDescription></CardHeader>
          <CardContent><p className="text-xl font-bold text-gray-900 dark:text-gray-100">{totalUnits}</p></CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><User size={14} /> Owners</CardDescription></CardHeader>
          <CardContent><p className="text-xl font-bold text-gray-900 dark:text-gray-100">{totalOwners}</p></CardContent>
        </Card>
      </div>

      {/* FINANCIAL CHART */}
      <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="dark:text-gray-100 text-sm">Financial Summary - {currentYear}</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={monthlyFinancialData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: '#6b7280' }} domain={[0, 'auto']} tickFormatter={(value) => `₱${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => `₱${Number(value).toLocaleString()}`} />} />
              <Bar dataKey="revenue" name="Revenue" fill="#2d568e" radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="netIncome" name="Net Income" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ChartContainer>
          <div className="flex items-center justify-center gap-6 mt-3 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#2d568e' }} />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Revenue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Expenses</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#059669' }} />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Net Income</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BOOKINGS + OCCUPANCY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)] h-[320px] flex flex-col">
          <CardHeader className="pb-1 pt-3 px-4 flex-shrink-0">
            <CardTitle className="dark:text-gray-100 text-sm">Bookings by Month</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-2 min-h-0">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <AreaChart data={monthlyBookingsData}>
                <defs>
                  <linearGradient id="fillBookings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2d568e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2d568e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} domain={[0, 'auto']} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value} booking${value !== 1 ? 's' : ''}`} />} />
                <Area type="monotone" dataKey="bookings" stroke="#2d568e" strokeWidth={2} fill="url(#fillBookings)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700 shadow-[4px_6px_16px_rgba(0,0,0,0.1)] h-[320px] flex flex-col">
          <CardHeader className="pb-1 pt-3 px-4 flex-shrink-0">
            <CardTitle className="dark:text-gray-100 text-sm">Occupancy</CardTitle>
            <div className="flex items-center justify-center gap-1 mt-1">
              <button onClick={() => setOccupancyMonth(d => subMonths(d, 1))} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronLeft size={12} /></button>
              <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{format(occupancyMonth, 'MMM yyyy')}</span>
              <button onClick={() => setOccupancyMonth(d => addMonths(d, 1))} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronRight size={12} /></button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-2 min-h-0">
            <div className="flex items-center justify-center h-full w-full gap-4">
              <PieChart width={200} height={180}>
                <Pie 
                  data={occupancyDonutData} 
                  cx={100} 
                  cy={90} 
                  innerRadius={55} 
                  outerRadius={75} 
                  paddingAngle={3} 
                  dataKey="value"
                >
                  {occupancyDonutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <text x={100} y={85} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '24px', fontWeight: 'bold', fill: '#111827' }}>
                  {monthOccupancy.occupancyRate}%
                </text>
                <text x={100} y={105} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '12px', fill: '#6b7280' }}>
                  Occupied
                </text>
              </PieChart>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#06b6d4' }} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Occupied</p>
                    <p className="text-xs text-gray-500">{monthOccupancy.occupiedDays} days</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#9ca3af' }} />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Unoccupied</p>
                    <p className="text-xs text-gray-500">{monthOccupancy.vacantDays} days</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BUSINESS OVERVIEW TABLE */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]">
        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-4">Business Overview - All Units</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Unit</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Owner</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Bookings</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Total Revenue</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Expenses</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Net Income</th>
              </tr>
            </thead>
            <tbody>
              {condos.map(condo => {
                const revenue = getCondoRevenue(condo.id)
                const totalExp = getCondoTotalExpenses(condo.id)
                const netInc = getCondoNetIncome(condo.id)
                const bookingCount = getCondoBookingsCount(condo.id)
                const ownerName = condo.owners?.name || 'No owner'
                return (
                  <tr key={condo.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => setSelectedCondo(condo)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{condo.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{condo.code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {condo.owners?.avatar_url ? (
                          <img src={condo.owners.avatar_url} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-200 text-xs font-bold">
                            {ownerName !== 'No owner' ? ownerName.charAt(0) : '—'}
                          </div>
                        )}
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{ownerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{bookingCount}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">₱{revenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">₱{totalExp.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">₱{netInc.toLocaleString()}</td>
                  </tr>
                )
              })}
              <tr className="bg-gray-50 dark:bg-gray-700/50 font-bold">
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100" colSpan={2}>TOTAL</td>
                <td className="px-4 py-3 text-center text-gray-900 dark:text-gray-100">{totalBookings}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">₱{totalBusinessRevenue.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">₱{totalBusinessExpenses.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">₱{netIncome.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by unit name, code, or owner..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full pl-12 pr-4 py-3 text-base border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-[#2d568e]/30 shadow-[4px_6px_16px_rgba(0,0,0,0.1)]" />
        </div>
        <button onClick={exportFinancialReport} className="px-4 py-3 bg-[#2d568e] text-white rounded-xl text-sm font-semibold hover:bg-[#1e3a5f] flex items-center gap-2 shadow-[4px_6px_16px_rgba(0,0,0,0.2)]">
          <Download size={16} /> Export Report
        </button>
      </div>

      {/* CONDO GRID */}
      <div className="flex items-center gap-2">
        <Building2 size={20} className="text-[#2d568e]" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Properties ({filteredCondos.length})</h2>
      </div>

      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCondos.map(condo => (
          <ListingCard key={condo.id} condo={condo} bookings={bookings} expenses={expenses} cleaningRecords={cleaningRecords} onClick={(c) => setSelectedCondo(c)} />
        ))}
      </motion.div>

      {filteredCondos.length === 0 && (
        <div className="text-center py-12">
          <Building2 size={48} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No properties found</p>
        </div>
      )}

      {/* MODALS */}
      {selectedCondo && (
        <CondoDetailModal 
          condo={selectedCondo}
          bookings={bookings}
          expenses={expenses}
          cleaningRecords={cleaningRecords}
          onClose={() => setSelectedCondo(null)}
          onAddExpense={(condoId) => setExpenseModal({ isOpen: true, condoId })}
          onDeleteExpense={handleDeleteExpense}
        />
      )}

      <ExpenseModal 
        isOpen={expenseModal.isOpen} 
        onClose={() => setExpenseModal({ isOpen: false, condoId: null })} 
        onSave={fetchData} 
        condoId={expenseModal.condoId}
        condos={condos}
      />
    </div>
  )
}