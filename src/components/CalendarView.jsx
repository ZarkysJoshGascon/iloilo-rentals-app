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
    
    const tooltipHeight = 320
    const flip = position.y > window.innerHeight - tooltipHeight
    
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.12 }}
        className="fixed z-[9999] bg-gray-900 text-white rounded-2xl shadow-2xl p-5 w-80 pointer-events-none"
        style={{ 
          left: `${Math.min(position.x + 16, window.innerWidth - 340)}px`, 
          top: flip ? `${position.y - tooltipHeight - 10}px` : `${position.y + 16}px`
        }}>
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
    const leftPanelScrollRef = useRef(null)

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

      const weeks = []
      for (let i = 0; i < calDays.length; i += 7) {
        weeks.push(calDays.slice(i, i + 7))
      }

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

          <div className="flex-1 flex min-h-0">
            <div className="w-[300px] flex-shrink-0 border-r-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 flex flex-col">
              <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bookings</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {condoBookings.length} {condoBookings.length === 1 ? 'booking' : 'bookings'}
                  </span>
                </div>
              </div>
              <div ref={leftPanelScrollRef} className="flex-1 overflow-y-auto">
                {condoBookings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs p-4">
                    <CalendarIcon size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
                    <p>No bookings this month</p>
                  </div>
                ) : (
                  condoBookings.map((bk) => (
                    <div key={bk.id}
                      onClick={(e) => handleBookingClick(bk, e)}
                      className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 cursor-pointer transition-colors">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="relative flex-shrink-0">
                          {bk.avatar_url ? <img src={bk.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white dark:ring-gray-700 shadow-sm" />
                            : <div style={{ background: avatarColors(bk.guest_name || '—')[0], color: avatarColors(bk.guest_name || '—')[1] }} className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white dark:ring-gray-700 shadow-sm">{initials(bk.guest_name || '—')}</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{bk.guest_name || 'Guest'}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{bk.booking_code}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] bg-white dark:bg-gray-700/50 rounded-lg p-2">
                        <div>
                          <span className="text-gray-400 text-[10px]">Check-in</span>
                          <p className="font-semibold text-gray-700 dark:text-gray-300">{format(parseISO(bk.start_date), 'MMM d')}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-[10px]">Check-out</span>
                          <p className="font-semibold text-gray-700 dark:text-gray-300">{format(parseISO(bk.end_date), 'MMM d')}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-[10px]">Guests</span>
                          <p className="font-semibold text-gray-700 dark:text-gray-300 text-[11px]">{[bk.adults > 0 && `${bk.adults}A`, bk.children > 0 && `${bk.children}C`, bk.infants > 0 && `${bk.infants}I`, bk.seniors > 0 && `${bk.seniors}S`].filter(Boolean).join('·') || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-400 text-[10px]">Nights</span>
                          <p className="font-semibold text-gray-700 dark:text-gray-300">{Math.ceil((new Date(bk.end_date) - new Date(bk.start_date)) / (1000 * 60 * 60 * 24))}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-gray-800">
              <div className="flex-shrink-0 grid grid-cols-7 px-5 pt-3 pb-2 bg-white dark:bg-gray-800">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="text-center py-2.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 first:rounded-l-lg last:rounded-r-lg">
                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{d}</span>
                  </div>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <div className="relative">
                  {weeks.map((week, weekIdx) => (
                    <div key={weekIdx} className="grid grid-cols-7 border-l-2 border-r-2 border-gray-300 dark:border-gray-600 first:border-t-2 last:border-b-2 last:rounded-b-xl first:rounded-t-xl overflow-visible" style={{ position: 'relative' }}>
                      {week.map(day => {
                        const today = isToday(day)
                        const weekend = isWeekend(day)
                        const inMonth = isSameMonth(day, detailDate)
                        return (
                          <div key={day.toString()}
                            className={`aspect-square relative border border-gray-200 dark:border-gray-600 flex flex-col items-center justify-start p-1 ${
                              today ? 'bg-[#2d568e]/10 ring-2 ring-[#2d568e] ring-inset z-10' : 
                              weekend ? 'bg-gray-50 dark:bg-gray-700/20' : 'bg-white dark:bg-gray-800'
                            } ${!inMonth ? 'opacity-40' : ''}`}>
                            <span className={`text-sm font-bold mb-0.5 ${today ? 'text-[#2d568e]' : inMonth ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400'}`}>
                              {format(day, 'd')}
                            </span>
                          </div>
                        )
                      })}
                      {condoBookings.map(bk => {
                        const s = parseISO(bk.start_date)
                        const e = parseISO(bk.end_date)
                        const weekStart = week[0]
                        const weekEnd = week[6]
                        if (e < weekStart || s > weekEnd) return null
                        
                        const startIdx = week.findIndex(d => isSameDay(d, s))
                        const endIdx = week.findIndex(d => isSameDay(d, e))
                        const effectiveStart = startIdx >= 0 ? startIdx : 0
                        const effectiveEnd = endIdx >= 0 ? endIdx : 6
                        const isStart = startIdx >= 0
                        const isEnd = endIdx >= 0
                        
                        return (
                          <div key={bk.id}
                            onMouseEnter={() => handleBookingMouseEnter(bk)}
                            onMouseMove={(ev) => handleBookingMouseMove(ev)}
                            onMouseLeave={handleBookingMouseLeave}
                            onClick={(ev) => handleBookingClick(bk, ev)}
                            className="absolute z-20 hover:brightness-110 transition-all flex items-center cursor-pointer"
                            style={{
                              backgroundColor: '#059669',
                              height: 28,
                              left: `${(effectiveStart / 7) * 100}%`,
                              width: `${((effectiveEnd - effectiveStart + 1) / 7) * 100}%`,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              borderRadius: isStart && isEnd ? 5 : isStart ? '5px 0 0 5px' : isEnd ? '0 5px 5px 0' : 0,
                              border: '2px solid rgba(0,0,0,0.35)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                              marginLeft: isStart ? 2 : 0,
                              marginRight: isEnd ? 2 : 0,
                              zIndex: isStart ? 21 : 20,
                            }}>
                            {isStart && (
                              <span className="text-[10px] font-bold text-white px-2 truncate leading-tight flex items-center gap-1 drop-shadow-sm">
                                <CalendarIcon size={11} className="text-white/90 flex-shrink-0" />
                                {bk.guest_name?.split(' ')[0] || 'Guest'}
                              </span>
                            )}
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