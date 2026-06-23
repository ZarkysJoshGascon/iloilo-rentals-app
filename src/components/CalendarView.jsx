import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, parseISO, getDay, addMonths } from 'date-fns'
import { ChevronDown, Home, User, Calendar, Mail, Building2, Hash, Wrench, Users, FileText, X, AlertTriangle, Check, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

const AVATAR_PALETTES = [
  ['#EAF3DE', '#3B6D11'], ['#E6F1FB', '#185FA5'], ['#FAEEDA', '#854F0B'],
  ['#EEEDFE', '#3C3489'], ['#FBEAF0', '#993556'], ['#FFF4E6', '#B45309'],
]
function avatarColors(name) {
  return AVATAR_PALETTES[(name || '?').charCodeAt(0) % AVATAR_PALETTES.length]
}
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const getCondoImage = (condo) => {
  if (!condo) return null
  if (condo.images?.[0]) return condo.images[0]
  if (condo.code) return `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_1.jpg`
  return null
}

const EVENT_TYPES = {
  maintenance: { label: 'Maintenance', icon: Wrench, color: '#374151' },
  meeting: { label: 'Meeting', icon: Users, color: '#1d4ed8' },
  contract_end: { label: 'Contract End', icon: FileText, color: '#dc2626' },
  other: { label: 'Other', icon: Calendar, color: '#6d28d9' },
}

const COLOR_PRESETS = [
  { color: '#6d28d9', name: 'Purple' }, { color: '#1d4ed8', name: 'Blue' },
  { color: '#059669', name: 'Green' }, { color: '#d97706', name: 'Amber' },
  { color: '#dc2626', name: 'Red' }, { color: '#db2777', name: 'Pink' },
  { color: '#0891b2', name: 'Cyan' }, { color: '#ea580c', name: 'Orange' },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const ILOILO_HOLIDAYS = {
  '02-02': { name: 'Jaro Fiesta (Candelaria)', scope: 'local', type: 'religious' },
  '08-25': { name: 'Iloilo City Charter Day', scope: 'local', type: 'civic' },
}

const WORLDWIDE_HOLIDAYS = {
  '02-14': { name: "Valentine's Day", scope: 'global', type: 'observance' },
  '03-08': { name: "International Women's Day", scope: 'global', type: 'observance' },
  '10-31': { name: 'Halloween', scope: 'global', type: 'observance' },
  '12-24': { name: 'Christmas Eve', scope: 'global', type: 'observance' },
  '12-31': { name: "New Year's Eve", scope: 'global', type: 'observance' },
}

function getNthSunday(year, month, n) {
  const firstDay = new Date(year, month, 1)
  const firstSunday = firstDay.getDate() + (7 - firstDay.getDay()) % 7
  const nthSunday = firstSunday + (n - 1) * 7
  return new Date(year, month, nthSunday)
}

function isLocalHoliday(date) {
  const year = date.getFullYear(), month = date.getMonth(), day = date.getDate(), dayOfWeek = date.getDay()
  if (month === 0 && dayOfWeek === 0 && isSameDay(date, getNthSunday(year, 0, 4))) return { name: 'Dinagyang Festival', scope: 'local', type: 'festival' }
  if (month === 1 && day === 2) return ILOILO_HOLIDAYS['02-02']
  if (month === 7 && day === 25) return ILOILO_HOLIDAYS['08-25']
  return null
}

function isWorldwideHoliday(date) {
  const year = date.getFullYear(), month = date.getMonth(), day = date.getDate(), dayOfWeek = date.getDay()
  const key = format(date, 'MM-dd')
  if (WORLDWIDE_HOLIDAYS[key] && !key.includes('{')) return WORLDWIDE_HOLIDAYS[key]
  if (month === 4 && dayOfWeek === 0 && isSameDay(date, getNthSunday(year, 4, 2))) return { name: "Mother's Day", scope: 'global', type: 'observance' }
  if (month === 5 && dayOfWeek === 0 && isSameDay(date, getNthSunday(year, 5, 3))) return { name: "Father's Day", scope: 'global', type: 'observance' }
  return null
}

function getHolidayColor(scope) {
  if (scope === 'national') return 'bg-red-500'
  if (scope === 'local') return 'bg-purple-500'
  if (scope === 'global') return 'bg-blue-400'
  return 'bg-gray-400'
}

function ContextMenu({ x, y, onClose, condo, onAddEvent }) {
  const menuRef = useRef(null)
  useEffect(() => {
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      ref={menuRef} className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-gray-200 dark:border-gray-600 py-2 min-w-[240px] backdrop-blur-sm"
      style={{ left: x, top: y }}>
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Add Event</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mt-0.5">{condo?.title}</p>
      </div>
      {Object.entries(EVENT_TYPES).map(([key, type]) => (
        <button key={key} onClick={() => { onAddEvent(key); onClose(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: type.color }}>
            <type.icon size={15} className="text-white" />
          </div>
          <div><p className="font-semibold text-gray-800 dark:text-gray-100">{type.label}</p><p className="text-[10px] text-gray-400 dark:text-gray-500">Add {type.label.toLowerCase()} event</p></div>
        </button>
      ))}
    </motion.div>
  )
}

function AddEventModal({ isOpen, onClose, condo, eventType, onSave, startDate: initialStart, endDate: initialEnd }) {
  const [startDate, setStartDate] = useState(initialStart || format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(initialEnd || format(new Date(), 'yyyy-MM-dd'))
  const [singleDate, setSingleDate] = useState(initialStart || format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [customColor, setCustomColor] = useState('#6d28d9')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialStart) { setStartDate(initialStart); setSingleDate(initialStart) }
    if (initialEnd) setEndDate(initialEnd)
  }, [initialStart, initialEnd])

  if (!isOpen) return null
  const typeConfig = EVENT_TYPES[eventType]
  const isSingleDate = eventType === 'contract_end' || eventType === 'meeting'
  const isOther = eventType === 'other'

  const handleSave = async () => {
    const finalStart = isSingleDate ? singleDate : startDate
    const finalEnd = isSingleDate ? singleDate : endDate
    if (!finalStart || !finalEnd) { toast.error('Please select date(s)'); return }
    if (!isSingleDate && finalEnd < finalStart) { toast.error('End date must be after start date'); return }
    setSaving(true)
    try {
      const eventData = { condo_id: condo.id, event_type: eventType, start_date: finalStart, end_date: finalEnd, notes: notes }
      if (isOther) eventData.color = customColor
      const { error } = await supabase.from('condo_events').insert(eventData)
      if (error) throw error
      toast.success(`${typeConfig.label} event saved`)
      onSave(); onClose()
    } catch (err) { toast.error('Failed to save event') }
    finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.92, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 30 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)] max-w-md w-full overflow-hidden border border-gray-100 dark:border-gray-700">
          <div className="relative overflow-hidden" style={{ backgroundColor: isOther ? customColor : typeConfig.color }}>
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/4"></div>
            <div className="relative px-6 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner"><typeConfig.icon size={24} className="text-white" /></div>
                  <div><h3 className="text-xl font-bold text-white tracking-tight">New {typeConfig.label}</h3><p className="text-white/70 text-sm mt-0.5 font-medium">{condo?.title}</p></div>
                </div>
                <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"><X size={18} className="text-white" /></button>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {isSingleDate ? (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4">
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{eventType === 'contract_end' ? 'Contract End Date' : 'Meeting Date'}</label>
                <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)}
                  className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4"><label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Start Date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" /></div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4"><label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">End Date</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" /></div>
              </div>
            )}
            {isOther && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4">
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Mark Color</label>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button key={preset.color} onClick={() => setCustomColor(preset.color)}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all hover:scale-105"
                      style={{ backgroundColor: customColor === preset.color ? preset.color + '20' : 'transparent', border: customColor === preset.color ? `2px solid ${preset.color}` : '2px solid transparent' }}>
                      <div className="w-8 h-8 rounded-full shadow-md" style={{ backgroundColor: preset.color }}></div>
                      <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-4">
              <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notes <span className="font-normal text-gray-400">(optional)</span></label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Add any details about this event..."
                className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none placeholder:text-gray-400 transition-all" />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 px-5 py-3.5 border-2 border-gray-200 dark:border-gray-600 rounded-2xl text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-5 py-3.5 rounded-2xl text-white font-bold text-sm transition-all shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: isOther ? customColor : typeConfig.color }}>
                {saving ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Check size={18} />}
                {saving ? 'Saving...' : 'Save Event'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function DatePickerNavigator({ onNavigate, currentMonth }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(currentMonth ? currentMonth.getFullYear() : new Date().getFullYear())
  const [pickerMonth, setPickerMonth] = useState(currentMonth ? currentMonth.getMonth() : new Date().getMonth())
  const handleSelect = (year, month) => { onNavigate(new Date(year, month, 1)); setIsOpen(false) }

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:border-gray-300 dark:hover:border-gray-500 transition-all shadow-sm">
        <Calendar size={15} className="text-[#2d568e] dark:text-blue-400" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{MONTHS[currentMonth ? currentMonth.getMonth() : pickerMonth]} {currentMonth ? currentMonth.getFullYear() : pickerYear}</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-gray-200 dark:border-gray-600 p-5 z-50 w-[300px]">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setPickerYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><ChevronDown size={18} className="rotate-90" /></button>
              <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{pickerYear}</span>
              <button onClick={() => setPickerYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><ChevronDown size={18} className="-rotate-90" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MONTHS.map((month, idx) => (
                <button key={month} onClick={() => { setPickerMonth(idx); handleSelect(pickerYear, idx) }}
                  className={`px-2 py-2.5 rounded-xl text-sm font-medium transition-all ${idx === pickerMonth ? 'bg-[#2d568e] text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{month.substring(0, 3)}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function CalendarView() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [events, setEvents] = useState([])
  const [holidays, setHolidays] = useState([])
  const [selectedCondo, setSelectedCondo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [hoveredItem, setHoveredItem] = useState(null)
  const [tooltipType, setTooltipType] = useState('')
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [imgErrors, setImgErrors] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [addEventModal, setAddEventModal] = useState({ isOpen: false, eventType: null, startDate: null, endDate: null })
  const [visibleMonths, setVisibleMonths] = useState([])
  const [activeMonthIndex, setActiveMonthIndex] = useState(0)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const scrollContainerRef = useRef(null)
  const monthRefs = useRef({})

  useEffect(() => { fetchData(); fetchHolidays() }, [])
  useEffect(() => {
    const months = []
    for (let i = -6; i <= 12; i++) months.push(addMonths(new Date(), i))
    setVisibleMonths(months); setActiveMonthIndex(6)
  }, [])
  useEffect(() => {
    const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const [condosRes, bookingsRes, eventsRes] = await Promise.all([
      supabase.from('condos').select('id, title, code, images, location').order('title'),
      supabase.from('bookings').select('id, condo_id, start_date, end_date, status, guest_name, guest_email, booking_code, avatar_url').in('status', ['confirmed', 'pending']),
      supabase.from('condo_events').select('*').order('start_date')
    ])
    setCondos(condosRes.data || []); setBookings(bookingsRes.data || []); setEvents(eventsRes.data || [])
    if (!selectedCondo && condosRes.data?.length > 0) setSelectedCondo(condosRes.data[0])
    setLoading(false)
  }

  const fetchHolidays = async () => {
    try {
      const currentYear = new Date().getFullYear(); const allHolidays = []
      for (const year of [currentYear - 1, currentYear, currentYear + 1]) {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`)
        if (response.ok) { const data = await response.json(); allHolidays.push(...data.map(h => ({ ...h, scope: 'national' }))) }
      }
      setHolidays(allHolidays)
    } catch (err) { console.error('Failed to fetch holidays:', err) }
  }

  const getMonthData = (monthDate) => {
    const monthStart = startOfMonth(monthDate), monthEnd = endOfMonth(monthDate)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
    return { monthStart, monthEnd, days, emptyCount: getDay(monthStart) }
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const getBookingsForDay = (condoId, day) => {
    if (!condoId || !day) return []
    return bookings.filter(b => { const start = parseISO(b.start_date), end = parseISO(b.end_date); return b.condo_id === condoId && isWithinInterval(day, { start, end }) })
  }

  const getEventsForDay = (condoId, day) => {
    if (!condoId || !day) return []
    return events.filter(e => { const start = parseISO(e.start_date), end = e.end_date ? parseISO(e.end_date) : parseISO(e.start_date); return e.condo_id === condoId && isWithinInterval(day, { start, end }) })
  }

  const hasEventConflict = (booking) => {
    const bStart = parseISO(booking.start_date), bEnd = parseISO(booking.end_date)
    return events.some(e => { const eStart = parseISO(e.start_date), eEnd = e.end_date ? parseISO(e.end_date) : parseISO(e.start_date); return e.condo_id === booking.condo_id && bStart <= eEnd && bEnd >= eStart })
  }

  const getHolidayForDay = (day) => {
    const dateStr = format(day, 'yyyy-MM-dd')
    const nationalHoliday = holidays.find(h => h.date === dateStr)
    if (nationalHoliday) return nationalHoliday
    const localHoliday = isLocalHoliday(day)
    if (localHoliday) return { ...localHoliday, date: dateStr }
    const worldwideHoliday = isWorldwideHoliday(day)
    if (worldwideHoliday) return { ...worldwideHoliday, date: dateStr }
    return null
  }

  const getEventColor = (event) => {
    if (event.event_type === 'other' && event.color) return event.color
    return EVENT_TYPES[event.event_type]?.color || '#374151'
  }

  const isBookingStart = (booking, day) => isSameDay(day, parseISO(booking.start_date))
  const isBookingEnd = (booking, day) => isSameDay(day, parseISO(booking.end_date))
  const isEventStart = (event, day) => isSameDay(day, parseISO(event.start_date))
  const isEventEnd = (event, day) => isSameDay(day, parseISO(event.end_date))

  const handleMouseEnter = (item, type) => { setHoveredItem(item); setTooltipType(type) }
  const handleMouseLeave = () => { setHoveredItem(null); setTooltipType('') }
  const handleContextMenu = (e, condo) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, condo }) }

  const handleDragStart = (day) => { setDragStart(day); setDragEnd(day); setIsDragging(true) }
  const handleDragEnter = (day) => { if (isDragging) setDragEnd(day) }
  const handleDragEnd = () => {
    if (dragStart && dragEnd && selectedCondo) {
      const start = dragStart < dragEnd ? dragStart : dragEnd, end = dragStart < dragEnd ? dragEnd : dragStart
      setAddEventModal({ isOpen: true, eventType: 'other', startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') })
    }
    setIsDragging(false); setDragStart(null); setDragEnd(null)
  }

  const isInDragRange = (day) => {
    if (!dragStart || !dragEnd || !isDragging) return false
    const start = dragStart < dragEnd ? dragStart : dragEnd, end = dragStart < dragEnd ? dragEnd : dragStart
    return isWithinInterval(day, { start, end })
  }

  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container) return
    let closestMonth = 0, closestDistance = Infinity
    Object.entries(monthRefs.current).forEach(([index, el]) => {
      if (el) { const rect = el.getBoundingClientRect(), containerRect = container.getBoundingClientRect(); const distance = Math.abs(rect.top - containerRect.top - 10); if (distance < closestDistance) { closestDistance = distance; closestMonth = parseInt(index) } }
    })
    setActiveMonthIndex(closestMonth)
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 400) {
      setVisibleMonths(prev => [...prev, ...Array.from({length: 3}, (_, i) => addMonths(prev[prev.length - 1], i + 1))])
    }
  }

  const navigateToDate = (date) => {
    const idx = visibleMonths.findIndex(m => isSameDay(startOfMonth(m), startOfMonth(date)))
    if (idx >= 0 && monthRefs.current[idx]) monthRefs.current[idx].scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const goToToday = () => navigateToDate(new Date())
  const handleEventSaved = () => { fetchData(); setAddEventModal({ isOpen: false, eventType: null, startDate: null, endDate: null }) }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="rounded-full h-10 w-10 border-[3px] border-gray-200 dark:border-gray-700 border-t-[#2d568e]" />
      </div>
    )
  }

  return (
    <div className="flex gap-5 h-full font-sans" onMouseUp={handleDragEnd}>
      {/* LEFT SIDE - Listings */}
      <div className="w-[280px] flex-shrink-0 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm flex flex-col">
        <div className="px-5 py-4 bg-[#2d568e]">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white tracking-wide">Listings</h3><span className="text-[10px] font-semibold text-white/70 bg-white/15 px-2.5 py-1 rounded-full">{condos.length} units</span></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {condos.map((condo) => {
            const imageUrl = getCondoImage(condo); const isSelected = selectedCondo?.id === condo.id
            return (
              <motion.button key={condo.id} onClick={() => setSelectedCondo(condo)} onContextMenu={(e) => handleContextMenu(e, condo)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 transition-all text-left border-b border-gray-50 dark:border-gray-700/50 ${isSelected ? 'bg-[#2d568e]/10 dark:bg-blue-900/30 border-l-[4px] border-l-[#2d568e]' : 'border-l-[4px] border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600">
                  {imageUrl && !imgErrors[condo.id] ? <img src={imageUrl} alt={condo.title} className="w-full h-full object-cover" onError={() => setImgErrors(prev => ({ ...prev, [condo.id]: true }))} /> :
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20"><Home size={20} className="text-[#2d568e] dark:text-blue-400" /></div>}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={`text-[13px] font-semibold truncate leading-tight ${isSelected ? 'text-[#2d568e] dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>{condo.title}</p>
                  {condo.code && <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono font-semibold mt-0.5 tracking-wide">{condo.code}</p>}
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* RIGHT SIDE - Calendar */}
      <div className="flex-1 min-w-0">
        {selectedCondo ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm flex flex-col h-full">
            
            {/* Calendar Header - Two rows */}
            <div className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-700/20 flex-shrink-0">
              {/* Top Row: Today | Month | DatePicker */}
              <div className="px-5 py-3 flex items-center justify-between">
                <button onClick={goToToday} className="px-4 py-2 bg-[#2d568e] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1e3a5f] transition-all shadow-sm tracking-wide">Today</button>
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{visibleMonths[activeMonthIndex] ? format(visibleMonths[activeMonthIndex], 'MMMM yyyy') : ''}</p>
                </div>
                <DatePickerNavigator onNavigate={navigateToDate} currentMonth={visibleMonths[activeMonthIndex]} />
              </div>
              {/* Bottom Row: Legend */}
              <div className="px-5 pb-2.5 flex items-center justify-center gap-4 text-[10px] font-semibold">
                <div className="flex items-center gap-1"><div className="w-3.5 h-2.5 rounded-full bg-[#0f766e]"></div><span className="text-gray-500 dark:text-gray-400">Booked</span></div>
                <div className="flex items-center gap-1"><div className="w-3.5 h-2.5 rounded-full bg-[#374151]"></div><span className="text-gray-500 dark:text-gray-400">Maintenance</span></div>
                <div className="flex items-center gap-1"><div className="w-3.5 h-2.5 rounded-full bg-[#1d4ed8]"></div><span className="text-gray-500 dark:text-gray-400">Meeting</span></div>
                <div className="flex items-center gap-1"><div className="w-3.5 h-2.5 rounded-full bg-[#dc2626]"></div><span className="text-gray-500 dark:text-gray-400">Contract End</span></div>
              </div>
            </div>

            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-5 space-y-8">
              {visibleMonths.map((monthDate, monthIdx) => {
                const { monthStart, days, emptyCount } = getMonthData(monthDate)
                const isCurrentMonth = isSameDay(monthStart, startOfMonth(new Date()))
                return (
                  <div key={monthIdx} ref={(el) => { monthRefs.current[monthIdx] = el }}>
                    <div className="mb-4 pb-2.5 border-b border-gray-100 dark:border-gray-700">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                        {format(monthDate, 'MMMM yyyy')}
                        {isCurrentMonth && <span className="ml-3 text-[10px] font-semibold text-[#2d568e] dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full tracking-wide">Current</span>}
                      </h3>
                    </div>

                    <div className="grid grid-cols-7 mb-1">
                      {weekDays.map((day) => (
                        <div key={day} className="text-center py-2 border-b border-gray-100 dark:border-gray-700">
                          <span className="text-[13px] font-bold text-gray-900 dark:text-gray-200 uppercase tracking-widest">{day}</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-px bg-gray-800 dark:bg-gray-400 rounded-xl overflow-hidden border-2 border-gray-800 dark:border-gray-400">
                      {Array.from({ length: emptyCount }, (_, i) => (
                        <div key={`empty-${monthIdx}-${i}`} className="aspect-square bg-gray-100 dark:bg-gray-700"></div>
                      ))}

                      {days.map((day) => {
                        const dayBookings = getBookingsForDay(selectedCondo.id, day)
                        const dayEvents = getEventsForDay(selectedCondo.id, day)
                        const booking = dayBookings[0] || null
                        const event = dayEvents[0] || null
                        const holiday = getHolidayForDay(day)
                        const isToday = isSameDay(day, new Date())
                        const bookingConflict = booking && hasEventConflict(booking)
                        const isBStart = booking ? isBookingStart(booking, day) : false
                        const isBEnd = booking ? isBookingEnd(booking, day) : false
                        const isEStart = event ? isEventStart(event, day) : false
                        const isEEnd = event ? isEventEnd(event, day) : false
                        const inDragRange = isInDragRange(day)

                        return (
                          <div key={day.toString()}
                            onMouseDown={() => handleDragStart(day)}
                            onMouseEnter={() => handleDragEnter(day)}
                            className={`aspect-square relative transition-all duration-150 select-none bg-white dark:bg-gray-800 ${
                              isToday ? 'ring-[3px] ring-[#2d568e] dark:ring-blue-500 ring-inset z-10 shadow-lg' : ''
                            } ${bookingConflict ? '!bg-red-50 dark:!bg-red-900/20' : ''} ${
                              inDragRange ? '!bg-blue-100 dark:!bg-blue-900/30 scale-[0.97] shadow-inner' : ''
                            } ${isDragging ? 'cursor-grabbing' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>

                            {/* BOOKING BAR */}
                            {booking && (
                              <div onMouseEnter={() => handleMouseEnter(booking, 'booking')} onMouseLeave={handleMouseLeave}
                                className={`absolute z-20 transition-all hover:brightness-110 flex items-center justify-center ${
                                  isBStart && isBEnd ? 'inset-x-0.5 rounded-full' : isBStart ? 'left-0.5 -right-px rounded-l-full' : isBEnd ? '-left-px right-0.5 rounded-r-full' : '-left-px -right-px'
                                } ${booking.status === 'confirmed' ? 'bg-[#0f766e]' : 'bg-amber-500'} ${bookingConflict ? '!bg-red-500' : ''}`}
                                style={{ top: event ? '30%' : '37.5%', height: '25%' }}>
                                {isBStart && (
                                  <div className="flex items-center gap-1.5 px-1">
                                    {booking.status === 'confirmed' ? <Check size={14} className="text-white flex-shrink-0" /> : <Clock size={14} className="text-white flex-shrink-0" />}
                                    <span className="text-[10px] font-bold text-white truncate">{booking.booking_code}</span>
                                  </div>
                                )}
                                {bookingConflict && <AlertTriangle size={12} className="text-white ml-auto mr-1 flex-shrink-0" />}
                              </div>
                            )}

                            {/* EVENT MARK */}
                            {event && (
                              <div onMouseEnter={() => handleMouseEnter(event, 'event')} onMouseLeave={handleMouseLeave}
                                className={`absolute z-20 transition-all hover:brightness-110 flex items-center justify-center ${
                                  isEStart && isEEnd ? 'inset-x-0.5 rounded-full' : isEStart ? 'left-0.5 -right-px rounded-l-full' : isEEnd ? '-left-px right-0.5 rounded-r-full' : '-left-px -right-px'
                                }`}
                                style={{ backgroundColor: getEventColor(event), top: booking ? '57.5%' : '37.5%', height: '25%' }}>
                                {isEStart && (
                                  <div className="flex items-center gap-1 px-1">
                                    {(() => { const Icon = EVENT_TYPES[event.event_type]?.icon || Calendar; return <Icon size={12} className="text-white flex-shrink-0" /> })()}
                                    <span className="text-[9px] font-bold text-white truncate">{EVENT_TYPES[event.event_type]?.label}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Holiday Dot */}
                            {holiday && (
                              <div onMouseEnter={() => handleMouseEnter(holiday, 'holiday')} onMouseLeave={handleMouseLeave}
                                className={`absolute top-1.5 right-1.5 z-30 w-2.5 h-2.5 rounded-full cursor-pointer shadow-sm ring-1 ring-white dark:ring-gray-800 ${getHolidayColor(holiday.scope)}`} />
                            )}

                            <span className={`absolute top-1.5 left-2 text-lg font-bold z-30 leading-none ${
                              isToday ? 'w-9 h-9 rounded-full bg-[#2d568e] text-white flex items-center justify-center text-base -top-1 -left-1 shadow-md' : 'text-gray-900 dark:text-gray-100'
                            }`}>{format(day, 'd')}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {!isDragging && <div className="text-center py-4"><p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">💡 Click and drag across dates to add an event</p></div>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-sm">
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#2d568e]/10 to-[#2d568e]/20 dark:from-blue-900/20 dark:to-blue-800/20 flex items-center justify-center mx-auto mb-5"><Calendar size={36} className="text-[#2d568e] dark:text-blue-400" /></div>
              <p className="text-gray-500 dark:text-gray-400 font-semibold">Select a listing to view its calendar</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Right-click or drag dates to add events</p>
            </div>
          </div>
        )}
      </div>

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} condo={contextMenu.condo} onClose={() => setContextMenu(null)} onAddEvent={(eventType) => setAddEventModal({ isOpen: true, eventType, startDate: null, endDate: null })} />}
      <AddEventModal isOpen={addEventModal.isOpen} onClose={() => setAddEventModal({ isOpen: false, eventType: null, startDate: null, endDate: null })} condo={selectedCondo || contextMenu?.condo} eventType={addEventModal.eventType || 'other'} onSave={handleEventSaved} startDate={addEventModal.startDate} endDate={addEventModal.endDate} />

      <AnimatePresence>
        {hoveredItem && tooltipType === 'booking' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 bg-gray-900/95 backdrop-blur-sm text-white rounded-2xl shadow-2xl p-4 min-w-[280px] pointer-events-none border border-gray-700/50"
            style={{ left: mousePos.x + 15, top: mousePos.y - 10 }}>
            <div className="flex items-center gap-3 pb-3 border-b border-gray-700/50">
              {hoveredItem.avatar_url ? <img src={hoveredItem.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-600" /> :
                <div style={{ background: avatarColors(hoveredItem.guest_name)[0], color: avatarColors(hoveredItem.guest_name)[1] }} className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ring-2 ring-gray-600">{initials(hoveredItem.guest_name)}</div>}
              <div><p className="text-sm font-semibold">{hoveredItem.guest_name || 'Unknown Guest'}</p><span className={`text-[10px] font-semibold uppercase tracking-wider ${hoveredItem.status === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>{hoveredItem.status}</span></div>
            </div>
            <div className="space-y-2 mt-3">
              <div className="flex items-center gap-2"><Hash size={14} className="text-gray-500" /><span className="text-sm font-mono font-semibold">{hoveredItem.booking_code}</span></div>
              {hoveredItem.guest_email && <div className="flex items-center gap-2"><Mail size={14} className="text-gray-500" /><span className="text-xs text-gray-300">{hoveredItem.guest_email}</span></div>}
              <div className="flex items-center gap-2"><Calendar size={14} className="text-gray-500" /><span className="text-xs text-gray-300">{format(parseISO(hoveredItem.start_date), 'MMM d, yyyy')} → {format(parseISO(hoveredItem.end_date), 'MMM d, yyyy')}</span></div>
              {hasEventConflict(hoveredItem) && <div className="flex items-center gap-2 text-red-400"><AlertTriangle size={14} /><span className="text-xs font-semibold">Conflict with event!</span></div>}
            </div>
          </motion.div>
        )}
        {hoveredItem && tooltipType === 'event' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 bg-gray-900/95 backdrop-blur-sm text-white rounded-2xl shadow-2xl p-4 min-w-[240px] pointer-events-none border border-gray-700/50"
            style={{ left: mousePos.x + 15, top: mousePos.y - 10 }}>
            <div className="flex items-center gap-2 pb-2 border-b border-gray-700/50">
              {(() => { const Icon = EVENT_TYPES[hoveredItem.event_type]?.icon || Calendar; return <Icon size={16} className="text-white" /> })()}
              <span className="text-sm font-semibold">{EVENT_TYPES[hoveredItem.event_type]?.label || 'Event'}</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2"><Calendar size={14} className="text-gray-500" /><span className="text-xs text-gray-300">{format(parseISO(hoveredItem.start_date), 'MMM d')} → {format(hoveredItem.end_date ? parseISO(hoveredItem.end_date) : parseISO(hoveredItem.start_date), 'MMM d, yyyy')}</span></div>
              {hoveredItem.notes && <p className="text-xs text-gray-400 mt-1 italic">"{hoveredItem.notes}"</p>}
            </div>
          </motion.div>
        )}
        {hoveredItem && tooltipType === 'holiday' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 bg-gray-900/95 backdrop-blur-sm text-white rounded-2xl shadow-2xl p-3 min-w-[200px] pointer-events-none border border-gray-700/50"
            style={{ left: mousePos.x + 15, top: mousePos.y - 10 }}>
            <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${getHolidayColor(hoveredItem.scope)}`}></span><span className="text-xs font-semibold">{hoveredItem.localName || hoveredItem.name}</span></div>
            <p className="text-[10px] text-gray-400 mt-1 capitalize">{hoveredItem.scope === 'national' ? '🇵🇭 National Holiday' : hoveredItem.scope === 'local' ? '🏙️ Iloilo Holiday' : '🌍 Worldwide'}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}