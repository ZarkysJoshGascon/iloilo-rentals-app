import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  isSameDay, isWithinInterval, parseISO, addMonths, subMonths,
  isToday, isSameMonth
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, Home, Calendar as CalendarIcon,
  ArrowLeft, Mail, Phone
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { avatarColors, initials } from '../utils/avatar'
import { getCondoImage } from '../utils/condoImages'

function HoverTooltip({ booking, position }) {
  if (!booking) return null
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.12 }}
      className="fixed z-[9999] bg-gray-900 text-white rounded-2xl shadow-2xl p-5 w-80 pointer-events-none"
      style={{ left: `${position.x + 16}px`, top: `${position.y - 10}px` }}>
      <div className="flex items-center gap-3 mb-4">
        {booking.avatar_url ? <img src={booking.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-700" />
          : <div style={{ background: avatarColors(booking.guest_name || '—')[0], color: avatarColors(booking.guest_name || '—')[1] }} className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold ring-2 ring-gray-700">{initials(booking.guest_name || '—')}</div>}
        <div>
          <p className="text-base font-bold">{booking.guest_name || '—'}</p>
          <p className="text-xs text-gray-400 font-mono">{booking.booking_code}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 mb-1">Check-in</p><p className="font-bold">{format(parseISO(booking.start_date), 'MMM d, yyyy')}</p></div>
        <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 mb-1">Check-out</p><p className="font-bold">{format(parseISO(booking.end_date), 'MMM d, yyyy')}</p></div>
        <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 mb-1">Guests</p><p className="font-bold">{[booking.adults > 0 && `${booking.adults}A`, booking.children > 0 && `${booking.children}C`, booking.infants > 0 && `${booking.infants}I`, booking.seniors > 0 && `${booking.seniors}S`].filter(Boolean).join(' · ') || '—'}</p></div>
        <div className="bg-gray-800 rounded-xl p-3"><p className="text-gray-400 mb-1">Status</p><p className="font-bold text-emerald-400">Booked</p></div>
      </div>
      {booking.guest_email && <div className="mt-3 flex items-center gap-2 text-xs text-gray-400"><Mail size={12} />{booking.guest_email}</div>}
      {booking.guest_phone && <div className="mt-1 flex items-center gap-2 text-xs text-gray-400"><Phone size={12} />{booking.guest_phone}</div>}
    </motion.div>
  )
}

function BookingMark({ booking, day, isStart, isEnd, onHover, onMove, onLeave, onClick }) {
  return (
    <div
      onMouseEnter={() => onHover(booking)}
      onMouseMove={(e) => onMove(e)}
      onMouseLeave={onLeave}
      onClick={(e) => onClick(booking, e)}
      className="absolute z-20 hover:brightness-110 transition-all flex items-center cursor-pointer"
      style={{
        backgroundColor: '#059669',
        height: 28,
        left: 0,
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        borderRadius: isStart && isEnd ? 5 : isStart ? '5px 0 0 5px' : isEnd ? '0 5px 5px 0' : 0,
        border: '2px solid rgba(0,0,0,0.35)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        marginLeft: isStart ? 2 : -2,
        marginRight: isEnd ? 2 : -2,
        zIndex: isStart ? 21 : 20,
      }}
    >
      {isStart && (
        <span className="text-[10px] font-bold text-white px-2 truncate leading-tight flex items-center gap-1 drop-shadow-sm">
          <CalendarIcon size={11} className="text-white/90 flex-shrink-0" />
          {booking.guest_name?.split(' ')[0] || 'Guest'}
        </span>
      )}
    </div>
  )
}

export default function CalendarView() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewDate, setViewDate] = useState(new Date())
  const [hoverBooking, setHoverBooking] = useState(null)
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 })
  const [selectedCondo, setSelectedCondo] = useState(null)
  const [detailDate, setDetailDate] = useState(new Date())

  const scrollRef = useRef(null)
  const listingScrollRef = useRef(null)
  const headerScrollRef = useRef(null)

  const displayStart = startOfMonth(subMonths(viewDate, 1))
  const displayEnd = endOfMonth(addMonths(viewDate, 1))
  const displayDays = eachDayOfInterval({ start: displayStart, end: displayEnd })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [c, b] = await Promise.all([
      supabase.from('condos').select('id,title,code,images,location').order('title'),
      supabase.from('bookings').select('*').in('status', ['confirmed']).order('start_date')
    ])
    setCondos(c.data || [])
    setBookings(b.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const filterId = sessionStorage.getItem('filterCondoInCalendar')
    if (filterId && condos.length > 0) {
      const condo = condos.find(c => c.id === filterId)
      if (condo) setSelectedCondo(condo)
      sessionStorage.removeItem('filterCondoInCalendar')
    }
  }, [condos])

  const cell = 64
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6

  const goToMonth = (date) => {
    setViewDate(date)
    setTimeout(() => {
      const el = scrollRef.current?.querySelector(`[data-date="${format(startOfMonth(date), 'yyyy-MM-dd')}"]`)
      if (el) {
        const left = el.offsetLeft - 80
        scrollRef.current.scrollTo({ left, behavior: 'smooth' })
        if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left
      }
    }, 50)
  }

  useEffect(() => {
    if (loading) return
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const el = scrollRef.current?.querySelector(`[data-date="${todayStr}"]`)
    if (el) {
      const left = el.offsetLeft - 300
      setTimeout(() => {
        scrollRef.current.scrollTo({ left, behavior: 'instant' })
        if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left
      }, 100)
    }
  }, [loading])

  const getBookingsForCondo = (id) => bookings.filter(b => b.condo_id === id)

  const handleBookingMouseEnter = (booking) => setHoverBooking(booking)
  const handleBookingMouseMove = (e) => setHoverPosition({ x: e.clientX, y: e.clientY })
  const handleBookingMouseLeave = () => setHoverBooking(null)
  const handleBookingClick = (booking, e) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('navigateToBooking', { detail: { bookingId: booking.id } }))
  }

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const years = Array.from({length: 5}, (_, i) => new Date().getFullYear() - 2 + i)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="rounded-full h-12 w-12 border-[3px] border-gray-200 dark:border-gray-700 border-t-[#2d568e]" />
      </div>
    )
  }

  if (selectedCondo) {
    const condoBookings = getBookingsForCondo(selectedCondo.id)
    const monthStart = startOfMonth(detailDate)
    const monthEnd = endOfMonth(detailDate)
    const calStart = startOfWeek(monthStart)
    const calEnd = endOfWeek(monthEnd)
    const calDays = eachDayOfInterval({ start: calStart, end: calEnd })
    const imageUrl = getCondoImage(selectedCondo)

    return (
      <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-300 dark:border-gray-600 overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
        <div className="flex-shrink-0 border-b-2 border-gray-300 dark:border-gray-600 px-5 py-4 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setSelectedCondo(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
              </button>
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-600 shadow-sm border border-gray-300 dark:border-gray-500">
                {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Home size={20} className="text-gray-500" /></div>}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedCondo.title}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{selectedCondo.code || '—'} · {selectedCondo.location}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setDetailDate(d => subMonths(d, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeft size={20} className="text-gray-800 dark:text-gray-200" /></button>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100 min-w-[160px] text-center">{format(detailDate, 'MMMM yyyy')}</span>
              <button onClick={() => setDetailDate(d => addMonths(d, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRight size={20} className="text-gray-800 dark:text-gray-200" /></button>
              <button onClick={() => setDetailDate(new Date())} className="ml-2 px-4 py-2 text-sm font-bold bg-[#2d568e] text-white rounded-xl hover:bg-[#1e3a5f]">Today</button>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 px-5 py-2 bg-gray-50 dark:bg-gray-700/30 border-b border-gray-200 dark:border-gray-600 flex items-center gap-5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm bg-emerald-600 border border-black/30 shadow-sm"></span> Booked</span>
          <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-sm bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-500"></span> Available</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-400">{condoBookings.length} booking{condoBookings.length !== 1 ? 's' : ''} this month</span>
        </div>

        <div className="flex-shrink-0 grid grid-cols-7 px-5 pt-3 pb-2 bg-white dark:bg-gray-800">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="text-center py-2.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 first:rounded-l-lg last:rounded-r-lg">
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{d}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <div className="grid grid-cols-7 border-2 border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden">
            {calDays.map(day => {
              const today = isToday(day)
              const weekend = isWeekend(day)
              const inMonth = isSameMonth(day, detailDate)
              const dayBookings = condoBookings.filter(b => isWithinInterval(day, { start: parseISO(b.start_date), end: parseISO(b.end_date) }))
              const booking = dayBookings[0]
              const isStart = booking ? isSameDay(day, parseISO(booking.start_date)) : false
              const isEnd = booking ? isSameDay(day, parseISO(booking.end_date)) : false

              return (
                <div key={day.toString()}
                  className={`aspect-square relative border border-gray-200 dark:border-gray-600 flex flex-col items-center p-1 ${
                    today ? 'bg-[#2d568e]/10 ring-2 ring-[#2d568e] ring-inset z-10' : 
                    weekend ? 'bg-gray-50 dark:bg-gray-700/20' : 'bg-white dark:bg-gray-800'
                  } ${!inMonth ? 'opacity-40' : ''}`}>
                  <span className={`text-sm font-bold mb-0.5 ${today ? 'text-[#2d568e]' : inMonth ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400'}`}>
                    {format(day, 'd')}
                  </span>
                  {booking && (
                    <BookingMark
                      booking={booking}
                      day={day}
                      isStart={isStart}
                      isEnd={isEnd}
                      onHover={handleBookingMouseEnter}
                      onMove={handleBookingMouseMove}
                      onLeave={handleBookingMouseLeave}
                      onClick={handleBookingClick}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-300 dark:border-gray-600 overflow-hidden" style={{ height: '100%' }}>
      <div className="flex-shrink-0 border-b-2 border-gray-300 dark:border-gray-600 px-5 py-3 bg-white dark:bg-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => goToMonth(subMonths(viewDate, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeft size={20} className="text-gray-800 dark:text-gray-200" /></button>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1.5">
            <select value={viewDate.getMonth()} onChange={(e) => goToMonth(new Date(viewDate.getFullYear(), parseInt(e.target.value), 1))} className="px-2 py-1 text-base font-bold bg-transparent text-gray-900 dark:text-gray-100 cursor-pointer outline-none">
              {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={viewDate.getFullYear()} onChange={(e) => goToMonth(new Date(parseInt(e.target.value), viewDate.getMonth(), 1))} className="px-2 py-1 text-base font-bold bg-transparent text-gray-900 dark:text-gray-100 cursor-pointer outline-none">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={() => goToMonth(addMonths(viewDate, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRight size={20} className="text-gray-800 dark:text-gray-200" /></button>
        </div>
        <button onClick={() => goToMonth(new Date())} className="px-4 py-2 text-sm font-bold bg-[#2d568e] text-white rounded-lg hover:bg-[#1e3a5f]">Today</button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-[220px] flex-shrink-0 border-r-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex flex-col">
          <div className="h-[52px] border-b-2 border-gray-300 dark:border-gray-600 flex items-center px-4 bg-gray-100 dark:bg-gray-700 flex-shrink-0">
            <span className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Listings</span>
          </div>
          <div ref={listingScrollRef} className="flex-1 overflow-y-auto">
            {condos.map(co => {
              const img = getCondoImage(co)
              return (
                <div key={co.id} onClick={() => setSelectedCondo(co)}
                  className="flex items-center bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-600 px-4 gap-3 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-750"
                  style={{ height: cell }}>
                  <div className="w-[42px] h-[42px] rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-600 shadow-sm">
                    {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Home size={16} className="text-gray-500" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{co.title}</p>
                    <p className="text-[10px] font-mono font-bold text-[#1e3a5f] dark:text-blue-400 mt-0.5 uppercase">{co.code || '—'}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div ref={headerScrollRef} className="flex-shrink-0 overflow-hidden" style={{ height: 52 }}>
            <div className="flex bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-300 dark:border-gray-500" style={{ minWidth: displayDays.length * cell, height: 52 }}>
              {displayDays.map(day => (
                <div key={day.toString()} data-date={format(day, 'yyyy-MM-dd')}
                  className={`flex-shrink-0 border-r border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center ${isToday(day) ? 'bg-[#2d568e]' : ''} ${!isSameMonth(day, viewDate) ? 'opacity-50' : ''}`}
                  style={{ width: cell, height: 52 }}>
                  <span className={`text-[10px] font-bold uppercase leading-tight ${isToday(day) ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{format(day, 'MMM')}</span>
                  <span className={`text-[11px] font-bold uppercase leading-tight ${isToday(day) ? 'text-white' : 'text-gray-800 dark:text-gray-200'}`}>{format(day, 'EEE')}</span>
                  <span className={`text-base font-bold leading-tight ${isToday(day) ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>{format(day, 'd')}</span>
                </div>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={() => {
            if (headerScrollRef.current) headerScrollRef.current.scrollLeft = scrollRef.current.scrollLeft
            if (listingScrollRef.current) listingScrollRef.current.scrollTop = scrollRef.current.scrollTop
          }}>
            <div style={{ minWidth: displayDays.length * cell }}>
              {condos.map(co => (
                <div key={co.id} className="flex border-b border-gray-200 dark:border-gray-600 relative" style={{ height: cell }}>
                  {displayDays.map(day => (
                    <div key={day.toString()} className="flex-shrink-0 border-r border-gray-200 dark:border-gray-600" style={{ width: cell, height: cell }} />
                  ))}
                  {getBookingsForCondo(co.id).map(bk => {
                    const s = parseISO(bk.start_date), e = parseISO(bk.end_date)
                    const si = displayDays.findIndex(d => isSameDay(d, s)), ei = displayDays.findIndex(d => isSameDay(d, e))
                    if (si < 0 || ei < 0) return null
                    return (
                      <div key={bk.id}
                        onMouseEnter={() => handleBookingMouseEnter(bk)}
                        onMouseMove={(ev) => handleBookingMouseMove(ev)}
                        onMouseLeave={handleBookingMouseLeave}
                        onClick={(ev) => handleBookingClick(bk, ev)}
                        className="absolute z-20 hover:brightness-110 transition-all flex items-center cursor-pointer"
                        style={{ backgroundColor: '#059669', height: 28, left: si * cell + 4, width: (ei - si + 1) * cell - 8, top: '50%', transform: 'translateY(-50%)', borderRadius: 5, border: '2px solid rgba(0,0,0,0.35)', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                        <span className="text-[10px] font-bold text-white px-2 truncate flex items-center gap-1.5 drop-shadow-sm"><CalendarIcon size={12} className="text-white/90 flex-shrink-0" />{bk.guest_name?.split(' ')[0] || 'Guest'}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {hoverBooking && <HoverTooltip booking={hoverBooking} position={hoverPosition} />}
      </AnimatePresence>
    </div>
  )
}