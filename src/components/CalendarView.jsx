import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isWithinInterval, parseISO, addMonths, subMonths,
  isToday
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, Home, Calendar as CalendarIcon,
  Users, ExternalLink
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { avatarColors, initials } from '../utils/avatar'
import { getCondoImage } from '../utils/condoImages'

/* ------------------------------------------------------------------ */
/*  Hover Tooltip (follows mouse)                                       */
/* ------------------------------------------------------------------ */

function HoverTooltip({ booking, position }) {
  if (!booking) return null

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[9999] bg-gray-900 text-white rounded-xl shadow-2xl p-4 w-72 pointer-events-none"
      style={{ 
        left: `${position.x + 16}px`, 
        top: `${position.y - 10}px`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        {booking.avatar_url ? (
          <img src={booking.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-700" />
        ) : (
          <div 
            style={{ background: avatarColors(booking.guest_name || '—')[0], color: avatarColors(booking.guest_name || '—')[1] }} 
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ring-2 ring-gray-700"
          >
            {initials(booking.guest_name || '—')}
          </div>
        )}
        <div>
          <p className="text-sm font-bold">{booking.guest_name || '—'}</p>
          <p className="text-xs text-gray-400">{booking.booking_code}</p>
        </div>
      </div>

      <div className="space-y-2 text-xs text-gray-300">
        <div className="flex items-center gap-2">
          <CalendarIcon size={12} className="text-gray-500" />
          <span>{format(parseISO(booking.start_date), 'MMM d')} → {format(parseISO(booking.end_date), 'MMM d, yyyy')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Users size={12} className="text-gray-500" />
          <span>
            {[booking.adults > 0 && `${booking.adults}A`, booking.children > 0 && `${booking.children}C`, booking.infants > 0 && `${booking.infants}I`, booking.seniors > 0 && `${booking.seniors}S`].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mt-2 text-center flex items-center justify-center gap-1">
        <ExternalLink size={10} /> Click to view in bookings
      </p>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Calendar Component                                             */
/* ------------------------------------------------------------------ */

export default function CalendarView() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [displayMonth, setDisplayMonth] = useState(format(new Date(), 'MMMM yyyy'))
  const [hoverBooking, setHoverBooking] = useState(null)
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 })

  const containerRef = useRef(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const bufferDays = 10
  const displayStart = new Date(monthStart)
  displayStart.setDate(displayStart.getDate() - bufferDays)
  const displayEnd = new Date(monthEnd)
  displayEnd.setDate(displayEnd.getDate() + bufferDays)
  const displayDays = eachDayOfInterval({ start: displayStart, end: displayEnd })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [condosRes, bookingsRes] = await Promise.all([
      supabase.from('condos').select('id, title, code, images, location').order('title'),
      supabase.from('bookings').select('*').in('status', ['confirmed', 'pending']).order('start_date')
    ])
    setCondos(condosRes.data || [])
    setBookings(bookingsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Update header month on scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleScroll = () => {
      const dateCells = container.querySelectorAll('[data-month]')
      const containerRect = container.getBoundingClientRect()
      let visibleMonth = format(currentMonth, 'MMMM yyyy')
      dateCells.forEach(cell => {
        const rect = cell.getBoundingClientRect()
        if (rect.left >= containerRect.left && rect.left <= containerRect.left + containerRect.width) {
          visibleMonth = cell.getAttribute('data-month')
        }
      })
      setDisplayMonth(visibleMonth)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [currentMonth])

  // Scroll to first day of month when it changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const firstDayStr = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const firstDayElement = container.querySelector(`[data-date="${firstDayStr}"]`)
    if (firstDayElement) {
      setTimeout(() => {
        firstDayElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
      }, 100)
    }
  }, [currentMonth])

  const getBookingsForCondo = (condoId) => bookings.filter(b => b.condo_id === condoId)

  const handleBookingMouseEnter = (booking) => setHoverBooking(booking)
  const handleBookingMouseMove = (e) => setHoverPosition({ x: e.clientX, y: e.clientY })
  const handleBookingMouseLeave = () => setHoverBooking(null)

  const handleBookingClick = (booking, e) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('navigateToBooking', { 
      detail: { bookingId: booking.id } 
    }))
  }

  const isWeekend = (day) => day.getDay() === 0 || day.getDay() === 6

  // Navigate to first day of previous month
  const goToPreviousMonth = () => {
    const prevMonth = subMonths(currentMonth, 1)
    setCurrentMonth(startOfMonth(prevMonth))
  }

  // Navigate to first day of next month
  const goToNextMonth = () => {
    const nextMonth = addMonths(currentMonth, 1)
    setCurrentMonth(startOfMonth(nextMonth))
  }

  const goToToday = () => setCurrentMonth(new Date())

  const cellWidth = 50
  const rowHeight = 56

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="rounded-full h-10 w-10 border-[3px] border-gray-200 dark:border-gray-700 border-t-[#2d568e]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-300 dark:border-gray-600 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b-2 border-gray-300 dark:border-gray-600 px-5 py-3 flex items-center justify-between bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 min-w-[160px]">
            {displayMonth}
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={goToPreviousMonth} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Previous month">
              <ChevronLeft size={18} className="text-gray-700 dark:text-gray-200" />
            </button>
            <button onClick={goToToday} className="px-3 py-1.5 text-xs font-semibold bg-[#2d568e] text-white rounded-lg hover:bg-[#1e3a5f] transition-colors">
              Today
            </button>
            <button onClick={goToNextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Next month">
              <ChevronRight size={18} className="text-gray-700 dark:text-gray-200" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        <div className="flex" style={{ minWidth: displayDays.length * cellWidth + 200 }}>
          
          {/* Fixed column for condo names */}
          <div className="flex-shrink-0 w-[200px] border-r-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 sticky left-0 z-40 shadow-[2px_0_8px_rgba(0,0,0,0.08)]">
            <div className="h-[42px] border-b-2 border-gray-300 dark:border-gray-600 flex items-center px-3 bg-gray-100 dark:bg-gray-700">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">Listings</span>
            </div>
            {condos.map(condo => {
              const imageUrl = getCondoImage(condo)
              return (
                <div 
                  key={condo.id} 
                  className="flex items-center bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-600"
                  style={{ height: `${rowHeight}px` }}
                >
                  <div className="w-[66px] h-full flex-shrink-0 bg-gray-200 dark:bg-gray-600 border-r border-gray-300 dark:border-gray-500 overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={condo.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Home size={20} className="text-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 px-3">
                    <p className="text-xs font-mono font-bold text-[#1e3a5f] dark:text-blue-400 tracking-wider uppercase">
                      {condo.code || '—'}
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-300 truncate mt-0.5 leading-tight font-medium">
                      {condo.title}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Scrollable dates area */}
          <div className="flex-1 relative">
            {/* Date headers */}
            <div className="flex bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-300 dark:border-gray-600 sticky top-0 z-30" style={{ height: '42px' }}>
              {displayDays.map(day => (
                <div 
                  key={day.toString()} 
                  data-month={format(day, 'MMMM yyyy')}
                  data-date={format(day, 'yyyy-MM-dd')}
                  className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-300 dark:border-gray-600 ${
                    isToday(day) ? 'bg-[#2d568e]/15 dark:bg-blue-900/40' : ''
                  }`}
                  style={{ width: `${cellWidth}px` }}
                >
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    isToday(day) ? 'text-[#2d568e] dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
                  }`}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={`text-sm font-bold mt-0.5 ${
                    isToday(day) ? 'text-[#2d568e] dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {format(day, 'd')}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid lines layer */}
            <div className="absolute inset-0 top-[42px] pointer-events-none">
              {condos.map((condo) => (
                <div 
                  key={condo.id} 
                  className="flex border-b border-gray-200 dark:border-gray-600"
                  style={{ height: `${rowHeight}px` }}
                >
                  {displayDays.map(day => (
                    <div 
                      key={day.toString()} 
                      className={`flex-shrink-0 border-r border-gray-200 dark:border-gray-600 ${
                        isWeekend(day) ? 'bg-gray-100 dark:bg-gray-700/30' : ''
                      } ${isToday(day) ? 'bg-[#2d568e]/5' : ''}`}
                      style={{ width: `${cellWidth}px` }}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Booking marks layer */}
            <div className="absolute inset-0 top-[42px] pointer-events-none">
              {condos.map((condo) => {
                const condoBookings = getBookingsForCondo(condo.id)
                
                const bookingBlocks = []
                condoBookings.forEach(booking => {
                  const start = parseISO(booking.start_date)
                  const end = parseISO(booking.end_date)
                  const startIndex = displayDays.findIndex(d => isSameDay(d, start))
                  const endIndex = displayDays.findIndex(d => isSameDay(d, end))
                  
                  if (startIndex >= 0 && endIndex >= 0) {
                    bookingBlocks.push({
                      booking,
                      left: startIndex * cellWidth,
                      width: (endIndex - startIndex + 1) * cellWidth,
                    })
                  }
                })

                return (
                  <div 
                    key={condo.id} 
                    className="relative"
                    style={{ height: `${rowHeight}px` }}
                  >
                    {bookingBlocks.map(({ booking, left, width }) => (
                      <div
                        key={booking.id}
                        onMouseEnter={() => handleBookingMouseEnter(booking)}
                        onMouseMove={(e) => handleBookingMouseMove(e)}
                        onMouseLeave={handleBookingMouseLeave}
                        onClick={(e) => handleBookingClick(booking, e)}
                        className="absolute z-20 hover:brightness-110 transition-all flex items-center cursor-pointer pointer-events-auto"
                        style={{
                          backgroundColor: booking.status === 'confirmed' ? '#047857' : '#b45309',
                          height: '18px',
                          left: `${left + 1}px`,
                          width: `${width - 2}px`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          borderRadius: '4px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
                          outline: '1.5px solid rgba(255,255,255,0.5)',
                          outlineOffset: '-0.5px',
                        }}
                      >
                        <span className="text-[9px] font-bold text-white px-2 truncate leading-tight flex items-center gap-1">
                          <CalendarIcon size={10} className="text-white/80 flex-shrink-0" />
                          {booking.guest_name?.split(' ')[0] || 'Guest'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Hover Tooltip */}
      <AnimatePresence>
        {hoverBooking && (
          <HoverTooltip booking={hoverBooking} position={hoverPosition} />
        )}
      </AnimatePresence>
    </div>
  )
}