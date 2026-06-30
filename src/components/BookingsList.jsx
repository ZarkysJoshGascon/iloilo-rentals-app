import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns'
import {
  Check, X, Trash2, AlertTriangle, Edit2, CheckCircle,
  Search, ArrowUpDown, RefreshCw, Calendar,
  Building2, MapPin, Mail, Phone, Plus,
  ChevronRight, SlidersHorizontal, ShieldCheck, Ban, Clock,
  ChevronDown, ChevronLeft, User, CreditCard, Hash, Bed, Home,
  CalendarIcon, Users, DollarSign, TrendingUp
} from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { avatarColors, initials } from '../utils/avatar'

const UnitImage = ({ condo }) => {
  const [imgError, setImgError] = useState(false)
  if (!condo) return null
  const imageUrl = condo.images?.[0] || (condo.code ? `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${condo.code}_1.jpg` : null)
  if (!imageUrl || imgError) return (<div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 flex items-center justify-center flex-shrink-0"><Building2 size={20} className="text-blue-600 dark:text-blue-400" /></div>)
  return <img src={imageUrl} alt={condo.title || 'Unit'} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-sm" onError={() => setImgError(true)} />
}

function SummaryCards({ stats }) {
  const cards = [
    { label: 'To Accommodate', value: stats.pending, icon: Clock },
    { label: 'Conflicts', value: stats.conflicts, icon: AlertTriangle },
    { label: 'Active', value: stats.active, icon: TrendingUp },
    { label: 'Rejected', value: stats.rejected, icon: Ban },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} 
          className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <card.icon size={22} className="text-gray-700 dark:text-gray-300" />
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{card.label}</span>
          </div>
          <p className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">{card.value}</p>
        </motion.div>
      ))}
    </div>
  )
}

const StatusDot = ({ status, hasConflict }) => {
  if (status === 'pending' && !hasConflict) return <span className="w-3 h-3 rounded-full bg-orange-400 ring-2 ring-orange-200 dark:ring-orange-800 inline-block" title="Pending" />
  if (status === 'pending' && hasConflict) return <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse ring-2 ring-red-200 dark:ring-red-800 inline-block" title="Conflict" />
  if (status === 'confirmed') return <span className="w-3 h-3 rounded-full bg-white/60 ring-2 ring-white/30 inline-block" title="Confirmed" />
  if (status === 'rejected') return <span className="w-3 h-3 rounded-full bg-white/60 ring-2 ring-white/30 inline-block" title="Rejected" />
  return null
}

const ActionDropdown = ({ booking, onConfirm, onReject, onDelete, onEdit, actionLoading, overlap }) => {
  const [open, setOpen] = useState(false); const dropdownRef = useRef(null)
  useEffect(() => { if (!open) return; const h = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [open])
  const isPending = booking.status === 'pending'
  const isColored = booking.status === 'confirmed' || booking.status === 'rejected'
  return (<div className="relative" ref={dropdownRef}><button onClick={(e) => { e.stopPropagation(); setOpen(!open) }} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 ${isColored ? 'border-white/30 text-white/90 hover:bg-white/10' : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>Manage <ChevronDown size={12} /></button><AnimatePresence>{open && (<><div className="fixed inset-0 z-40" onClick={() => setOpen(false)} /><motion.div initial={{ opacity: 0, scale: 0.95, y: -5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -5 }} className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 py-1 z-50"><button onClick={(e) => { e.stopPropagation(); onEdit(booking); setOpen(false) }} className="w-full text-left px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"><Edit2 size={14} /> Modify</button>{isPending && <><button onClick={(e) => { e.stopPropagation(); onConfirm(booking); setOpen(false) }} disabled={actionLoading === booking.id || overlap} className={`w-full text-left px-3 py-2 text-sm font-medium flex items-center gap-2 ${overlap ? 'text-gray-400 cursor-not-allowed' : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'}`}><Check size={14} /> Confirm</button><button onClick={(e) => { e.stopPropagation(); onReject(booking); setOpen(false) }} disabled={actionLoading === booking.id} className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"><X size={14} /> Reject</button></>}<div className="border-t border-gray-100 dark:border-gray-700 my-1" /><button onClick={(e) => { e.stopPropagation(); onDelete(booking); setOpen(false) }} className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"><Trash2 size={14} /> Delete</button></motion.div></>)}</AnimatePresence></div>)
}

function useTooltipPos(pos) { const w = 300, h = 220, p = 12; return { left: Math.min(pos.x + p, window.innerWidth - w - p), top: pos.y + h + p > window.innerHeight ? pos.y - h - p : pos.y + p } }

function BookingTooltip({ booking, position }) {
  if (!booking) return null
  const pos = useTooltipPos(position)
  const isConfirmed = booking.status === 'confirmed'
  const isPending = booking.status === 'pending'
  const statusBg = isConfirmed ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : isPending ? 'bg-orange-500/20 text-orange-300 border-orange-400/30' : 'bg-gray-500/20 text-gray-300 border-gray-400/30'
  const statusLabel = isConfirmed ? 'Confirmed' : isPending ? 'Pending' : 'Rejected'
  
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} 
      className="fixed z-[9999] bg-gray-900 text-white rounded-xl shadow-2xl p-4 w-72 pointer-events-none border border-white/10" style={pos}>
      <div className="flex items-center gap-3 mb-3">
        {booking.avatar_url ? <img src={booking.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white/20" /> : 
          <div style={{ background: avatarColors(booking.guest_name || '—')[0], color: avatarColors(booking.guest_name || '—')[1] }} className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ring-2 ring-white/20">{initials(booking.guest_name || '—')}</div>}
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{booking.guest_name || '—'}</p>
          <p className="text-xs text-gray-400 font-mono">{booking.booking_code}</p>
        </div>
      </div>
      <span className={`inline-block mb-3 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBg}`}>{statusLabel}</span>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/10 rounded-lg p-2"><p className="text-gray-400 mb-0.5">Check-in</p><p className="font-semibold">{format(new Date(booking.start_date), 'MMM d, yyyy')}</p></div>
        <div className="bg-white/10 rounded-lg p-2"><p className="text-gray-400 mb-0.5">Check-out</p><p className="font-semibold">{format(new Date(booking.end_date), 'MMM d, yyyy')}</p></div>
        <div className="bg-white/10 rounded-lg p-2"><p className="text-gray-400 mb-0.5">Nights</p><p className="font-semibold">{Math.ceil((new Date(booking.end_date) - new Date(booking.start_date)) / 86400000)}</p></div>
        <div className="bg-white/10 rounded-lg p-2"><p className="text-gray-400 mb-0.5">Guests</p><p className="font-semibold">{[booking.adults > 0 && `${booking.adults}A`, booking.children > 0 && `${booking.children}C`, booking.infants > 0 && `${booking.infants}I`, booking.seniors > 0 && `${booking.seniors}S`].filter(Boolean).join('·') || '—'}</p></div>
      </div>
    </motion.div>
  )
}

function ConflictTooltip({ bookings, position }) {
  if (!bookings?.length) return null
  const pos = useTooltipPos(position)
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} 
      className="fixed z-[9999] bg-gray-900 text-white rounded-xl shadow-2xl p-4 w-80 pointer-events-none border border-white/10" style={pos}>
      <div className="flex items-center gap-2 mb-3"><AlertTriangle size={16} className="text-red-400" /><p className="text-sm font-bold text-red-400">Date Conflict</p></div>
      <div className="space-y-2 max-h-52 overflow-y-auto">
        {bookings.map(bk => (
          <div key={bk.id} className="rounded-lg p-2.5 bg-white/10">
            <div className="flex items-center gap-2 mb-1.5">
              {bk.avatar_url ? <img src={bk.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div style={{ background: avatarColors(bk.guest_name || '—')[0], color: avatarColors(bk.guest_name || '—')[1] }} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold">{initials(bk.guest_name || '—')}</div>}
              <div className="min-w-0 flex-1"><p className="text-xs font-semibold truncate">{bk.guest_name || 'Guest'}</p><p className="text-[10px] text-gray-400 font-mono">{bk.booking_code}</p></div>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${bk.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-orange-500/20 text-orange-300'}`}>{bk.status}</span>
            </div>
            <div className="flex gap-3 text-[10px] text-gray-400"><span>In: {format(new Date(bk.start_date), 'MMM d')}</span><span>Out: {format(new Date(bk.end_date), 'MMM d')}</span></div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/* ================================================================== */
/*  MiniBarCalendar                                                     */
/* ================================================================== */

function MiniBarCalendar({ bookings = [], condoId, highlightBooking, selectedStart, selectedEnd, onDateClick, onConflictClick, mode = 'interactive', showOnlyConfirmed = false, clickableOverPending = true }) {
  const [miniMonth, setMiniMonth] = useState(() => new Date())
  const [hoveredBooking, setHoveredBooking] = useState(null)
  const [hoveredConflict, setHoveredConflict] = useState(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })

  const condoBookings = bookings.filter(b => {
    if (condoId && String(b.condo_id) !== String(condoId)) return false
    if (showOnlyConfirmed) return b.status === 'confirmed'
    return b.status === 'confirmed' || b.status === 'pending'
  })

  const confirmedBars = condoBookings.filter(b => b.status === 'confirmed').map(b => ({ ...b, label: b.booking_code || (b.guest_name || 'Guest').split(' ')[0] }))
  const pendingBars = condoBookings.filter(b => b.status === 'pending').map(b => ({ ...b, label: b.booking_code || (b.guest_name || 'Guest').split(' ')[0] }))
  const selectedBars = []
  const originalBars = []
  
  if (highlightBooking && (!condoId || String(highlightBooking.condo_id) === String(condoId))) {
    const alreadyInConfirmed = confirmedBars.some(b => b.id === highlightBooking.id)
    const alreadyInPending = pendingBars.some(b => b.id === highlightBooking.id)
    if (!alreadyInConfirmed && !alreadyInPending) {
      if (highlightBooking.status === 'confirmed') {
        confirmedBars.push({ ...highlightBooking, label: highlightBooking.booking_code || (highlightBooking.guest_name || 'Guest').split(' ')[0], isHighlighted: true })
      } else {
        originalBars.push({ ...highlightBooking, label: highlightBooking.booking_code || (highlightBooking.guest_name || 'Guest').split(' ')[0], type: 'original' })
      }
    }
  }

  if (selectedStart && selectedEnd) {
    selectedBars.push({ id: highlightBooking ? '__newdates__' : '__selected__', start_date: selectedStart, end_date: selectedEnd, label: 'New', type: 'selected', status: 'selected', guest_name: 'New Dates', avatar_url: null, booking_code: '', adults: 0, children: 0, infants: 0, seniors: 0 })
  }

  const conflictBars = []
  const allNonConfirmed = [...pendingBars, ...selectedBars]
  for (const sel of allNonConfirmed) {
    const selStart = new Date(sel.start_date), selEnd = new Date(sel.end_date)
    for (const conf of confirmedBars) {
      if (sel.id === conf.id) continue
      const confStart = new Date(conf.start_date), confEnd = new Date(conf.end_date)
      const overlapStart = new Date(Math.max(selStart, confStart)), overlapEnd = new Date(Math.min(selEnd, confEnd))
      if (overlapStart <= overlapEnd) conflictBars.push({ id: `conflict-${sel.id || 'sel'}-${conf.id}`, start_date: overlapStart.toISOString(), end_date: overlapEnd.toISOString(), bookings: [conf, sel] })
    }
  }
  for (let i = 0; i < pendingBars.length; i++) {
    for (let j = i + 1; j < pendingBars.length; j++) {
      const aStart = new Date(pendingBars[i].start_date), aEnd = new Date(pendingBars[i].end_date), bStart = new Date(pendingBars[j].start_date), bEnd = new Date(pendingBars[j].end_date)
      const overlapStart = new Date(Math.max(aStart, bStart)), overlapEnd = new Date(Math.min(aEnd, bEnd))
      if (overlapStart <= overlapEnd) conflictBars.push({ id: `conflict-p-${pendingBars[i].id}-${pendingBars[j].id}`, start_date: overlapStart.toISOString(), end_date: overlapEnd.toISOString(), bookings: [pendingBars[i], pendingBars[j]] })
    }
  }

  const monthStart = startOfMonth(miniMonth), monthEnd = endOfMonth(miniMonth), calStart = startOfWeek(monthStart), calEnd = endOfWeek(monthEnd)
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const weeks = []; for (let i = 0; i < calDays.length; i += 7) weeks.push(calDays.slice(i, i + 7))

  const isConfirmedDay = (day) => confirmedBars.some(bk => { const bS = new Date(bk.start_date), bE = new Date(bk.end_date); return day >= bS && day <= bE })

  const renderBarsForWeek = (bars, color, zIdx, week, weekIdx, isDashed = false) => {
    const ws = week[0], we = week[6]
    return bars.map((bk, barIdx) => {
      const bS = new Date(bk.start_date), bE = new Date(bk.end_date)
      if (bE < ws || bS > we) return null
      let sc = 0, ec = 6, stw = false, etw = false
      const sIdx = week.findIndex(d => isSameDay(d, bS)), eIdx = week.findIndex(d => isSameDay(d, bE))
      if (sIdx >= 0) { sc = sIdx; stw = true } else if (bS < ws) { sc = 0; stw = false }
      if (eIdx >= 0) { ec = eIdx; etw = true } else if (bE > we) { ec = 6; etw = false }
      const isRealBooking = bk.id !== '__selected__' && bk.id !== '__newdates__' && bk.status !== 'selected' && bk.type !== 'original'
      return (
        <div key={`${bk.id || 'bar'}-w${weekIdx}-b${barIdx}`}
          onMouseEnter={(e) => { if (isRealBooking) { setHoveredBooking(bk); setHoveredConflict(null); setHoverPos({ x: e.clientX, y: e.clientY }) } }}
          onMouseMove={(e) => { if (isRealBooking) setHoverPos({ x: e.clientX, y: e.clientY }) }}
          onMouseLeave={() => { setHoveredBooking(null); setHoveredConflict(null) }}
          className="absolute flex items-center pointer-events-auto"
          style={{ backgroundColor: isDashed ? 'transparent' : color.bg, height: 20, left: `${(sc / 7) * 100}%`, width: `${((ec - sc + 1) / 7) * 100}%`, top: '50%', transform: 'translateY(-50%)', borderRadius: stw && etw ? 4 : stw ? '4px 0 0 4px' : etw ? '0 4px 4px 0' : 0, border: isDashed ? '2px dashed #f97316' : bk.isHighlighted ? '2.5px solid #fff' : `2px solid ${color.border}`, boxShadow: bk.isHighlighted ? '0 0 6px rgba(5,150,105,0.5)' : 'none', marginLeft: stw ? 2 : 0, marginRight: etw ? 2 : 0, zIndex: isDashed ? 5 : zIdx, cursor: isRealBooking ? 'pointer' : 'default' }}>
          {stw && <span className={`text-[9px] font-bold px-1.5 truncate leading-tight ${isDashed ? 'text-orange-600' : 'text-white drop-shadow-sm'}`}>{bk.label}</span>}
        </div>
      )
    })
  }

  const renderConflictsForWeek = (week, weekIdx) => {
    const ws = week[0], we = week[6]
    return conflictBars.map((c, cIdx) => {
      const cS = new Date(c.start_date), cE = new Date(c.end_date)
      if (cE < ws || cS > we) return null
      let sc = 0, ec = 6, stw = false, etw = false
      const sIdx = week.findIndex(d => isSameDay(d, cS)), eIdx = week.findIndex(d => isSameDay(d, cE))
      if (sIdx >= 0) { sc = sIdx; stw = true } else if (cS < ws) { sc = 0; stw = false }
      if (eIdx >= 0) { ec = eIdx; etw = true } else if (cE > we) { ec = 6; etw = false }
      return (
        <div key={`${c.id}-w${weekIdx}-c${cIdx}`}
          onMouseEnter={(e) => { if (c.bookings?.length) { setHoveredConflict(c.bookings); setHoveredBooking(null); setHoverPos({ x: e.clientX, y: e.clientY }) } }}
          onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
          onMouseLeave={() => { setHoveredConflict(null); setHoveredBooking(null) }}
          onClick={onConflictClick ? (e) => { e.stopPropagation(); onConflictClick(c.bookings) } : undefined}
          className="absolute flex items-center pointer-events-auto"
          style={{ backgroundColor: 'rgba(239,68,68,0.40)', height: 14, left: `${(sc / 7) * 100}%`, width: `${((ec - sc + 1) / 7) * 100}%`, top: '50%', transform: 'translateY(-50%)', borderRadius: stw && etw ? 3 : stw ? '3px 0 0 3px' : etw ? '0 3px 3px 0' : 0, border: '2px solid #ef4444', marginLeft: stw ? 2 : 0, marginRight: etw ? 2 : 0, zIndex: 35, cursor: onConflictClick ? 'pointer' : 'default' }}>
        </div>
      )
    })
  }

  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMiniMonth(d => subMonths(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronLeft size={14} /></button>
        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{format(miniMonth, 'MMMM yyyy')}</span>
        <button onClick={() => setMiniMonth(d => addMonths(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center text-xs font-bold text-gray-600 dark:text-gray-400 py-0.5">{d}</div>)}</div>
      <div className="relative">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 relative" style={{ height: 34 }}>
            {week.map(day => {
              const inMonth = isSameMonth(day, miniMonth), isTodayDate = isSameDay(day, today), confirmed = isConfirmedDay(day), canClick = onDateClick && (!confirmed || clickableOverPending)
              return (
                <div key={day.toString()} onClick={canClick ? (e) => { e.stopPropagation(); onDateClick(day) } : undefined} className={`flex-shrink-0 border border-gray-100 dark:border-gray-600 flex items-center justify-center relative ${canClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''} ${confirmed ? 'cursor-not-allowed' : ''}`}>
                  <span className={`text-xs font-semibold relative z-10 ${isTodayDate ? 'text-blue-600 dark:text-blue-400 font-extrabold' : inMonth ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>{format(day, 'd')}</span>
                </div>
              )
            })}
            {renderBarsForWeek(originalBars, { bg: 'transparent', border: '#f97316' }, 5, week, wi, true)}
            {renderBarsForWeek(confirmedBars, { bg: 'rgba(5,150,105,0.35)', border: '#059669' }, 10, week, wi)}
            {renderBarsForWeek(pendingBars, { bg: 'rgba(249,115,22,0.30)', border: '#f97316' }, 20, week, wi)}
            {renderBarsForWeek(selectedBars, { bg: 'rgba(59,130,246,0.35)', border: '#3b82f6' }, 25, week, wi)}
            {renderConflictsForWeek(week, wi)}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-500/35 border-2 border-emerald-600"></span> Confirmed</span>
        {!showOnlyConfirmed && <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-orange-500/30 border-2 border-orange-600"></span> Pending</span>}
        {originalBars.length > 0 && <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm border-2 border-dashed border-orange-500"></span> Original</span>}
        {selectedBars.length > 0 && <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-blue-500/35 border-2 border-blue-600"></span> New</span>}
        {conflictBars.length > 0 && <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-500/40 border-2 border-red-500"></span> Conflict</span>}
      </div>
      <AnimatePresence>
        {hoveredBooking && <BookingTooltip booking={hoveredBooking} position={hoverPos} />}
        {hoveredConflict && <ConflictTooltip bookings={hoveredConflict} position={hoverPos} />}
      </AnimatePresence>
    </div>
  )
}

function ConfirmationModal({ isOpen, onClose, onConfirm, booking, formatPrice }) {
  if (!isOpen) return null
  return (<AnimatePresence><div className="fixed inset-0 z-[99999] flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} /><motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"><div className="bg-gradient-to-br from-gray-700 to-gray-600 p-6 text-center"><Trash2 size={32} className="text-white mx-auto mb-3" /><h3 className="text-xl font-bold text-white">Delete Booking</h3></div><div className="p-6 space-y-4"><div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2"><div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">ID</span><span className="font-mono font-bold text-gray-900 dark:text-gray-100">{booking?.booking_code}</span></div><div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Guest</span><span className="font-bold text-gray-900 dark:text-gray-100">{booking?.guest_name}</span></div><div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Unit</span><span className="font-bold text-gray-900 dark:text-gray-100">{booking?.condos?.code || '—'}</span></div><div className="flex justify-between pt-2 border-t text-sm"><span className="text-gray-600 dark:text-gray-400">Amount</span><span className="text-lg font-extrabold text-gray-900 dark:text-gray-100">{formatPrice(booking?.total_amount || 0)}</span></div></div><div className="flex gap-3"><button onClick={onClose} className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl font-bold text-gray-700 dark:text-gray-300">Cancel</button><button onClick={() => { onConfirm(); onClose() }} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold">Delete</button></div></div></motion.div></div></AnimatePresence>)
}

function BookingFormModal({ isOpen, onClose, onSave, condos, formatPrice, confirmedBookings, editBooking }) {
  const isEdit = !!editBooking
  const [formData, setFormData] = useState({ condo_id: '', guest_name: '', guest_email: '', guest_phone: '', start_date: '', end_date: '', adults: 2, children: 0, infants: 0, seniors: 0, total_amount: 0 })
  const [saving, setSaving] = useState(false)
  const [dateConflict, setDateConflict] = useState(false)
  const [conflictingBookings, setConflictingBookings] = useState([])
  const [showConflictPanel, setShowConflictPanel] = useState(false)
  const [selectingDate, setSelectingDate] = useState('start')

  useEffect(() => {
    if (isOpen) {
      if (editBooking) setFormData({ condo_id: '', guest_name: editBooking.guest_name || '', guest_email: editBooking.guest_email || '', guest_phone: editBooking.guest_phone || '', start_date: '', end_date: '', adults: editBooking.adults || 2, children: editBooking.children || 0, infants: editBooking.infants || 0, seniors: editBooking.seniors || 0, total_amount: 0 })
      else setFormData({ condo_id: '', guest_name: '', guest_email: '', guest_phone: '', start_date: '', end_date: '', adults: 2, children: 0, infants: 0, seniors: 0, total_amount: 0 })
      setSelectingDate('start'); setDateConflict(false); setConflictingBookings([]); setShowConflictPanel(false)
    }
  }, [isOpen, editBooking])

  const effectiveCondoId = formData.condo_id || (isEdit ? editBooking?.condo_id : '')
  const selectedCondo = condos.find(c => c.id === effectiveCondoId)
  const originalCondo = isEdit ? condos.find(c => c.id === editBooking?.condo_id) : null
  const nights = formData.start_date && formData.end_date ? differenceInDays(new Date(formData.end_date), new Date(formData.start_date)) : 0
  const hasDateFilter = formData.start_date && formData.end_date

  const calendarBookings = isEdit && editBooking ? confirmedBookings.filter(b => b.id !== editBooking.id) : confirmedBookings
  const originalPrice = isEdit ? editBooking?.total_amount || 0 : 0

  useEffect(() => {
    if (!effectiveCondoId || !formData.start_date || !formData.end_date || nights <= 0) { setDateConflict(false); setConflictingBookings([]); return }
    const s = new Date(formData.start_date), e = new Date(formData.end_date)
    const conflicts = confirmedBookings.filter(cb => cb.id !== editBooking?.id && String(cb.condo_id) === String(effectiveCondoId) && cb.status === 'confirmed' && s <= new Date(cb.end_date) && e >= new Date(cb.start_date))
    setDateConflict(conflicts.length > 0); setConflictingBookings(conflicts)
  }, [effectiveCondoId, formData.start_date, formData.end_date, confirmedBookings, nights, editBooking])

  useEffect(() => {
    if (selectedCondo && nights > 0) {
      const bp = selectedCondo.price_per_night || 0
      setFormData(prev => ({ ...prev, total_amount: Math.round(nights * (formData.adults * bp + formData.children * bp * 0.9 + formData.infants * bp * 0.8 + formData.seniors * bp * 0.8) * 1.05) }))
    } else { setFormData(prev => ({ ...prev, total_amount: 0 })) }
  }, [selectedCondo, nights, formData.adults, formData.children, formData.infants, formData.seniors])

  const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })) }
  const handleCondoClick = (condoId) => setFormData(prev => ({ ...prev, condo_id: prev.condo_id === condoId ? '' : condoId }))
  const handleDateClick = (day) => { const ds = format(day, 'yyyy-MM-dd'); if (selectingDate === 'start') { setFormData(prev => ({ ...prev, start_date: ds, end_date: '' })); setSelectingDate('end') } else { if (ds < formData.start_date) { setFormData(prev => ({ ...prev, start_date: ds, end_date: '' })) } else { setFormData(prev => ({ ...prev, end_date: ds })); setSelectingDate('start') } } }
  const clearDates = () => { setFormData(prev => ({ ...prev, start_date: '', end_date: '' })); setSelectingDate('start') }

  const isCondoAvailable = (condo) => {
    if (!formData.start_date || !formData.end_date) return true
    const s = new Date(formData.start_date), e = new Date(formData.end_date)
    return !confirmedBookings.some(cb => cb.id !== editBooking?.id && String(cb.condo_id) === String(condo.id) && cb.status === 'confirmed' && s <= new Date(cb.end_date) && e >= new Date(cb.start_date))
  }

  const handleSubmit = async () => {
    const finalCondoId = formData.condo_id || (isEdit ? editBooking?.condo_id : '')
    const finalStart = formData.start_date || (isEdit ? editBooking?.start_date : '')
    const finalEnd = formData.end_date || (isEdit ? editBooking?.end_date : '')
    const finalNights = finalStart && finalEnd ? differenceInDays(new Date(finalEnd), new Date(finalStart)) : 0
    if (!finalCondoId || !formData.guest_name || !finalStart || !finalEnd) { toast.error('Fill all required fields'); return }
    if (finalNights <= 0) { toast.error('Check-out after check-in'); return }
    if (!isEdit && dateConflict) { toast.error('Date conflict with existing booking'); return }
    setSaving(true)
    try {
      const finalSelectedCondo = condos.find(c => c.id === finalCondoId)
      const finalTotal = formData.total_amount > 0 ? formData.total_amount : (finalSelectedCondo && finalNights > 0 ? Math.round(finalNights * finalSelectedCondo.price_per_night * 1.05) : editBooking?.total_amount || 0)
      const bd = { condo_id: finalCondoId, guest_name: formData.guest_name, guest_email: formData.guest_email || null, guest_phone: formData.guest_phone || null, start_date: finalStart, end_date: finalEnd, adults: formData.adults, children: formData.children, infants: formData.infants, seniors: formData.seniors, total_amount: finalTotal, subtotal: Math.round(finalTotal * 0.95), service_fee: Math.round(finalTotal * 0.05) }
      if (editBooking) { const { error } = await supabase.from('bookings').update(bd).eq('id', editBooking.id); if (error) throw error; toast.success('Updated!') }
      else { const bc = `BK-${Date.now().toString(36).toUpperCase()}`; const { error } = await supabase.from('bookings').insert({ ...bd, status: 'pending', booking_code: bc }); if (error) throw error; toast.success('Created!') }
      onSave(); onClose()
    } catch { toast.error('Failed') } finally { setSaving(false) }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
          
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Modify Booking' : 'New Booking'}</h2>
              {isEdit && <p className="text-sm text-gray-700 dark:text-gray-300">{editBooking?.booking_code} — Click dates or listing to modify</p>}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={20} className="text-gray-600 dark:text-gray-400" /></button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            
            <div className="w-full lg:w-[380px] flex-shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
              
              {isEdit && editBooking && (
                <div className="flex-shrink-0 px-4 py-3 bg-orange-50 dark:bg-orange-900/10 border-b-2 border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600 flex-shrink-0 ring-2 ring-orange-300">
                      {originalCondo?.images?.[0] ? <img src={originalCondo.images[0]} alt="" className="w-full h-full object-cover" /> : originalCondo?.code ? <img src={`https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${originalCondo.code}_1.jpg`} alt="" className="w-full h-full object-cover" /> : <Home size={18} className="text-gray-400 m-auto mt-2" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><p className="text-sm font-bold text-orange-800 dark:text-orange-300 truncate">{originalCondo?.title || 'Original'}</p><span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-300">CURRENT</span></div>
                      <p className="text-xs text-orange-600 dark:text-orange-400 font-mono">{originalCondo?.code || ''}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-shrink-0 px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                <label className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2 block">{isEdit ? 'Change Listing (optional)' : 'Select Listing'} *</label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {condos.map(c => {
                    const available = isCondoAvailable(c)
                    const isOriginal = isEdit && c.id === editBooking?.condo_id
                    const img = c.images?.[0] || (c.code ? `https://mlksustamjaxfpolazgw.supabase.co/storage/v1/object/public/condo-images/${c.code}_1.jpg` : null)
                    return (
                      <button key={c.id} onClick={() => handleCondoClick(c.id)} className={`flex-shrink-0 w-[130px] p-2.5 rounded-xl border-2 text-left transition-all ${formData.condo_id === c.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300' : isOriginal && !formData.condo_id ? 'border-orange-300 bg-orange-50/30 dark:bg-orange-900/5' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-gray-300'}`}>
                        <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-600 mb-2">{img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Home size={18} className="text-gray-400 m-auto mt-4" />}</div>
                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{c.title}</p>
                        <p className="text-[10px] text-gray-600 dark:text-gray-400 font-mono">{c.code}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <div><label className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 block">Guest Name *</label><input type="text" name="guest_name" value={formData.guest_name} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-[#2d568e]" /></div>
                <div className="grid grid-cols-2 gap-3"><div><label className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 block">Email</label><input type="email" name="guest_email" value={formData.guest_email} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-[#2d568e]" /></div><div><label className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 block">Phone</label><input type="tel" name="guest_phone" value={formData.guest_phone} onChange={handleChange} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#2d568e] focus:border-[#2d568e]" /></div></div>
                <div><label className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 block">Guests</label><div className="grid grid-cols-4 gap-2">{[{ label: 'Adults', name: 'adults', value: formData.adults, min: 1 },{ label: 'Children', name: 'children', value: formData.children, min: 0 },{ label: 'Infants', name: 'infants', value: formData.infants, min: 0 },{ label: 'Seniors', name: 'seniors', value: formData.seniors, min: 0 }].map(g => (<div key={g.name} className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{g.label}</p><div className="flex items-center justify-center gap-2"><button type="button" onClick={() => setFormData(prev => ({ ...prev, [g.name]: Math.max(g.min, prev[g.name] - 1) }))} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 border border-gray-300 dark:border-gray-600">−</button><span className="w-5 text-center font-semibold text-gray-900 dark:text-gray-100">{g.value}</span><button type="button" onClick={() => setFormData(prev => ({ ...prev, [g.name]: prev[g.name] + 1 }))} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 border border-gray-300 dark:border-gray-600">+</button></div></div>))}</div></div>
                {!isEdit && dateConflict && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg"><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" /><p className="text-sm font-bold text-red-700 dark:text-red-300">Date conflict with existing booking</p></div></div>}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 bg-gray-50/20 dark:bg-gray-800/30">
              <div className="flex-shrink-0 px-5 pt-4 pb-2">
                {isEdit ? (
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Dates</p>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-lg p-2.5 border-2 border-orange-200 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/5">
                        <p className="text-xs font-bold text-orange-600 uppercase mb-0.5">Orig. In</p>
                        <p className="text-sm font-bold text-orange-800 dark:text-orange-300">{format(new Date(editBooking.start_date), 'MMM d')}</p>
                      </div>
                      <div className="rounded-lg p-2.5 border-2 border-orange-200 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/5">
                        <p className="text-xs font-bold text-orange-600 uppercase mb-0.5">Orig. Out</p>
                        <p className="text-sm font-bold text-orange-800 dark:text-orange-300">{format(new Date(editBooking.end_date), 'MMM d')}</p>
                      </div>
                      <div className={`rounded-lg p-2.5 border-2 ${formData.start_date ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/30'}`}>
                        <p className="text-xs font-bold text-blue-600 uppercase mb-0.5">New In</p>
                        <p className={`text-sm font-bold ${formData.start_date ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'}`}>{formData.start_date ? format(new Date(formData.start_date), 'MMM d') : '—'}</p>
                      </div>
                      <div className={`rounded-lg p-2.5 border-2 ${formData.end_date ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/30'}`}>
                        <p className="text-xs font-bold text-blue-600 uppercase mb-0.5">New Out</p>
                        <p className={`text-sm font-bold ${formData.end_date ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'}`}>{formData.end_date ? format(new Date(formData.end_date), 'MMM d') : '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between"><p className="text-sm text-gray-600 dark:text-gray-400">{selectingDate === 'start' ? 'Click calendar for new check-in' : 'Click calendar for new check-out'}</p>{formData.start_date && <button onClick={clearDates} className="text-sm text-red-500 hover:underline font-medium">Reset</button>}</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Select Dates</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`rounded-lg p-3 border-2 ${formData.start_date ? 'border-[#2d568e] bg-[#2d568e]/5' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/30'}`}>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">Check-in</p>
                        <p className={`text-sm font-bold ${formData.start_date ? 'text-[#2d568e]' : 'text-gray-500'}`}>{formData.start_date ? format(new Date(formData.start_date), 'MMM d, yyyy') : 'Select'}</p>
                      </div>
                      <div className={`rounded-lg p-3 border-2 ${formData.end_date ? 'border-[#2d568e] bg-[#2d568e]/5' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700/30'}`}>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1">Check-out</p>
                        <p className={`text-sm font-bold ${formData.end_date ? 'text-[#2d568e]' : 'text-gray-500'}`}>{formData.end_date ? format(new Date(formData.end_date), 'MMM d, yyyy') : 'Select'}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between"><p className="text-sm text-gray-600 dark:text-gray-400">{selectingDate === 'start' ? 'Click calendar for check-in' : 'Click calendar for check-out'}</p>{(formData.start_date || formData.end_date) && <button onClick={clearDates} className="text-sm text-red-500 hover:underline font-medium">Reset</button>}</div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-2">
                {effectiveCondoId ? (
                  <MiniBarCalendar bookings={calendarBookings} condoId={effectiveCondoId} highlightBooking={isEdit ? editBooking : null} selectedStart={formData.start_date || null} selectedEnd={formData.end_date || null} onDateClick={handleDateClick} onConflictClick={(b) => { setConflictingBookings(b); setShowConflictPanel(true) }} mode="interactive" showOnlyConfirmed={!isEdit} clickableOverPending={true} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm gap-2"><CalendarIcon size={32} className="text-gray-400" /><p>Select a listing to view availability</p></div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {isEdit && <div><p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Previous</p><p className="text-sm font-bold text-gray-700 dark:text-gray-300">{formatPrice(originalPrice)}</p></div>}
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{isEdit ? 'New Price' : 'Total'}</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-extrabold ${formData.total_amount > 0 ? 'text-[#2d568e] dark:text-blue-400' : 'text-gray-400'}`}>{formData.total_amount > 0 ? formatPrice(formData.total_amount) : '—'}</span>
                  {nights > 0 && selectedCondo && <span className="text-sm text-gray-600 dark:text-gray-400">{nights}n</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={saving || (!isEdit && dateConflict) || (!formData.start_date && !isEdit) || !formData.guest_name || !effectiveCondoId} className="px-5 py-2.5 bg-[#2d568e] text-white rounded-xl font-semibold hover:bg-[#1e3a5f] disabled:opacity-50 transition-colors flex items-center gap-2">{saving ? 'Saving...' : isEdit ? <><Edit2 size={16} /> Update</> : <><Plus size={16} /> Create</>}</button>
            </div>
          </div>
        </motion.div>
      </div>
      {isEdit && <AnimatePresence>{showConflictPanel && (<div className="fixed inset-0 z-[100000] flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/50" onClick={() => setShowConflictPanel(false)} /><motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[75vh] overflow-y-auto"><div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-red-600">Conflicting Bookings</h3><button onClick={() => setShowConflictPanel(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><X size={20} /></button></div><div className="space-y-3">{conflictingBookings.map(cb => (<div key={cb.id} className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700"><div className="flex items-center gap-3 mb-3">{cb.avatar_url ? <img src={cb.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div style={{ background: avatarColors(cb.guest_name || '—')[0], color: avatarColors(cb.guest_name || '—')[1] }} className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold">{initials(cb.guest_name || '—')}</div>}<div><p className="text-sm font-bold text-gray-900 dark:text-gray-100">{cb.guest_name || 'Guest'}</p><p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{cb.booking_code}</p></div><span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">Confirmed</span></div><div className="grid grid-cols-2 gap-2 text-sm"><div><span className="text-gray-600 dark:text-gray-400">Check-in:</span> {format(new Date(cb.start_date), 'MMM d, yyyy')}</div><div><span className="text-gray-600 dark:text-gray-400">Check-out:</span> {format(new Date(cb.end_date), 'MMM d, yyyy')}</div></div></div>))}</div></motion.div></div>)}</AnimatePresence>}
    </AnimatePresence>
  )
}

export default function BookingsList({ searchTerm: externalSearchTerm = '' }) {
  const [bookings, setBookings] = useState([])
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [condos, setCondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [activeGroup, setActiveGroup] = useState('pending')
  const [sortBy, setSortBy] = useState('latest')
  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [modalConfig, setModalConfig] = useState({ isOpen: false, booking: null })
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [bookingFormOpen, setBookingFormOpen] = useState(false)
  const [editBooking, setEditBooking] = useState(null)
  const { formatPrice } = useCurrency()
  const effectiveSearch = externalSearchTerm || searchText

  const fetchCondos = useCallback(async () => { const { data } = await supabase.from('condos').select('id,title,code,price_per_night,images').order('title'); if (data) setCondos(data) }, [])
  const fetchConfirmedBookings = useCallback(async () => { const { data } = await supabase.from('bookings').select('id, condo_id, start_date, end_date, status, guest_name, guest_email, guest_phone, adults, children, infants, seniors, booking_code, avatar_url').in('status', ['confirmed', 'pending', 'rejected']); if (data) setConfirmedBookings(data) }, [])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase.from('bookings').select('*, condos:condo_id(code, title, location, images, status)')
      if (sortBy === 'latest') q = q.order('created_at', { ascending: false })
      else if (sortBy === 'oldest') q = q.order('created_at', { ascending: true })
      else if (sortBy === 'price_high') q = q.order('total_amount', { ascending: false })
      else if (sortBy === 'price_low') q = q.order('total_amount', { ascending: true })
      const { data } = await q; setBookings(data || []); await fetchConfirmedBookings()
    } catch (err) { toast.error('Failed to load bookings') } finally { setLoading(false) }
  }, [sortBy, fetchConfirmedBookings])

  useEffect(() => { fetchBookings(); fetchCondos(); const sub = supabase.channel('bookings-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchBookings).subscribe(); return () => sub.unsubscribe() }, [fetchBookings, fetchCondos])
  useEffect(() => { const hid = sessionStorage.getItem('highlightBooking'); if (hid && bookings.length > 0) { const b = bookings.find(x => x.id === hid); if (b) { setSelectedBooking(b); setActiveGroup('all'); setTimeout(() => { const el = document.getElementById(`booking-row-${hid}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 300) }; sessionStorage.removeItem('highlightBooking') } }, [bookings])

  const handleQuickAction = async (booking, action) => {
    if (action === 'confirm' && hasOverlap(booking)) { toast.error('Cannot confirm: Date conflict detected'); return }
    setActionLoading(booking.id)
    try { if (action === 'delete') { await supabase.from('bookings').delete().eq('id', booking.id); toast.success('Booking deleted') } else { await supabase.from('bookings').update({ status: action === 'confirm' ? 'confirmed' : 'rejected' }).eq('id', booking.id); toast.success(`Booking ${action === 'confirm' ? 'confirmed' : 'rejected'}`) }; setSelectedBooking(null); fetchBookings() } catch { toast.error('Failed') } finally { setActionLoading(null) }
  }
  const handleEdit = (booking) => { setEditBooking(booking); setBookingFormOpen(true) }
  const openDeleteModal = (booking) => setModalConfig({ isOpen: true, booking })
  const closeModal = () => setModalConfig({ isOpen: false, booking: null })

  const hasOverlap = (booking) => {
    if (booking.status !== 'pending') return false
    const s = new Date(booking.start_date), e = new Date(booking.end_date)
    return confirmedBookings.some(cb => String(cb.condo_id) === String(booking.condo_id) && cb.id !== booking.id && cb.status === 'confirmed' && s <= new Date(cb.end_date) && e >= new Date(cb.start_date))
  }
  const getConflictingBookings = (booking) => {
    if (!hasOverlap(booking)) return []
    const s = new Date(booking.start_date), e = new Date(booking.end_date)
    return confirmedBookings.filter(cb => String(cb.condo_id) === String(booking.condo_id) && cb.id !== booking.id && cb.status === 'confirmed' && s <= new Date(cb.end_date) && e >= new Date(cb.start_date))
  }
  const getAllOverlappingBookings = (condoId) => {
    const condoBookings = bookings.filter(b => String(b.condo_id) === String(condoId) && (b.status === 'confirmed' || b.status === 'pending'))
    const overlapping = []; const used = new Set()
    for (const b1 of condoBookings) { if (used.has(b1.id)) continue; for (const b2 of condoBookings) { if (b2.id === b1.id || used.has(b2.id)) continue; if (new Date(b1.start_date) <= new Date(b2.end_date) && new Date(b1.end_date) >= new Date(b2.start_date)) { if (!used.has(b1.id)) { overlapping.push(b1); used.add(b1.id) } if (!used.has(b2.id)) { overlapping.push(b2); used.add(b2.id) } } } }
    return overlapping
  }

  const getNightsCount = (b) => Math.ceil((new Date(b.end_date) - new Date(b.start_date)) / 86400000)
  const getGuestSummary = (b) => { const p = []; if (b.adults > 0) p.push(`${b.adults}A`); if (b.children > 0) p.push(`${b.children}C`); if (b.infants > 0) p.push(`${b.infants}I`); if (b.seniors > 0) p.push(`${b.seniors}S`); return p.join('·') || '—' }

  // ROW COLOR LOGIC:
  // Confirmed → entire row green, white text
  // Rejected → entire row red, white text
  // Pending + conflict → red strip on left
  // Pending + no conflict → green strip on left (good to confirm)
  const getRowStyle = (b, sel) => {
    if (b.status === 'confirmed') return { 
      bg: sel ? 'bg-emerald-600' : 'bg-emerald-500', 
      text: 'text-white', subtext: 'text-white/90', muted: 'text-white/80', 
      border: 'border-b border-emerald-400/50', strip: '' 
    }
    if (b.status === 'rejected') return { 
      bg: sel ? 'bg-red-600' : 'bg-red-500', 
      text: 'text-white', subtext: 'text-white/90', muted: 'text-white/80', 
      border: 'border-b border-red-400/50', strip: '' 
    }
    if (b.status === 'pending' && hasOverlap(b)) return { 
      bg: sel ? 'bg-red-50 dark:bg-red-900/10' : 'bg-white dark:bg-gray-800', 
      text: 'text-gray-900 dark:text-gray-100', subtext: 'text-gray-700 dark:text-gray-300', muted: 'text-gray-600 dark:text-gray-400', 
      border: 'border-b border-gray-100 dark:border-gray-700', strip: 'border-l-[5px] border-l-red-500' 
    }
    if (b.status === 'pending' && !hasOverlap(b)) return { 
      bg: sel ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-white dark:bg-gray-800', 
      text: 'text-gray-900 dark:text-gray-100', subtext: 'text-gray-700 dark:text-gray-300', muted: 'text-gray-600 dark:text-gray-400', 
      border: 'border-b border-gray-100 dark:border-gray-700', strip: 'border-l-[5px] border-l-emerald-500' 
    }
    return { 
      bg: sel ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-white dark:bg-gray-800', 
      text: 'text-gray-900 dark:text-gray-100', subtext: 'text-gray-700 dark:text-gray-300', muted: 'text-gray-600 dark:text-gray-400', 
      border: 'border-b border-gray-100 dark:border-gray-700', strip: '' 
    }
  }

  const groupConflicts = (cbs) => { const g = [], u = new Set(); for (const b of cbs) { if (u.has(b.id)) continue; const grp = [b]; u.add(b.id); for (const o of cbs) { if (u.has(o.id)) continue; if (String(o.condo_id) === String(b.condo_id) && new Date(b.start_date) <= new Date(o.end_date) && new Date(b.end_date) >= new Date(o.start_date)) { grp.push(o); u.add(o.id) } } g.push(grp) } return g }

  const getFilteredBookings = () => {
    let f = [...bookings]
    if (effectiveSearch) { const s = effectiveSearch.toLowerCase(); f = f.filter(b => (b.guest_name || '').toLowerCase().includes(s) || (b.booking_code || '').toLowerCase().includes(s) || (b.condos?.code || '').toLowerCase().includes(s) || (b.condos?.title || '').toLowerCase().includes(s) || (b.guest_email || '').toLowerCase().includes(s)) }
    if (activeGroup !== 'all') f = activeGroup === 'conflicts' ? f.filter(b => b.status === 'pending' && hasOverlap(b)) : f.filter(b => b.status === activeGroup)
    if (dateFrom) { const df = new Date(dateFrom); df.setHours(0,0,0,0); f = f.filter(b => new Date(b.created_at) >= df) }
    if (dateTo) { const dt = new Date(dateTo); dt.setHours(23,59,59,999); f = f.filter(b => new Date(b.created_at) <= dt) }
    f.sort((a, b) => { const ac = a.status === 'pending' && hasOverlap(a), bc = b.status === 'pending' && hasOverlap(b); if (ac && !bc) return -1; if (!ac && bc) return 1; if (a.status === 'pending' && b.status !== 'pending') return -1; if (a.status !== 'pending' && b.status === 'pending') return 1; return new Date(b.created_at) - new Date(a.created_at) })
    return f
  }

  const pc = bookings.filter(b => b.status === 'pending').length, cc = bookings.filter(b => b.status === 'confirmed').length, rc = bookings.filter(b => b.status === 'rejected').length, coc = bookings.filter(b => b.status === 'pending' && hasOverlap(b)).length
  const stats = { total: bookings.length, pending: pc, confirmed: cc, rejected: rc, conflicts: coc, active: cc + pc }
  const statusOptions = [{ id: 'pending', label: 'To Accommodate', count: pc, dot: 'bg-orange-500' },{ id: 'all', label: 'All Bookings', count: bookings.length, dot: 'bg-gray-500' },{ id: 'conflicts', label: 'Conflicts', count: coc, dot: 'bg-red-500' },{ id: 'confirmed', label: 'Confirmed', count: cc, dot: 'bg-emerald-500' },{ id: 'rejected', label: 'Rejected', count: rc, dot: 'bg-gray-500' }]
  const filteredBookings = getFilteredBookings(); const showConflictGroups = activeGroup === 'conflicts'
  const conflictGroups = showConflictGroups ? groupConflicts(filteredBookings) : []; const activeOption = statusOptions.find(o => o.id === activeGroup)

  if (loading) return (<div className="space-y-4 animate-pulse"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700"><div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-12 mb-2" /><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" /></div>)}</div><div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 h-64" /></div>)

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-4">
      <SummaryCards stats={stats} />
      <div className="flex items-center gap-3"><div className="relative flex-1"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search guest, booking ID, unit or email..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" /></div><button onClick={() => { setEditBooking(null); setBookingFormOpen(true) }} className="px-5 py-3 bg-[#2d568e] text-white rounded-xl font-semibold hover:bg-[#1e3a5f] transition-colors flex items-center gap-2"><Plus size={18} /> Add Booking</button></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><button onClick={() => setStatusDropdownOpen(!statusDropdownOpen)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">{activeOption?.label || 'To Accommodate'}<span className="text-gray-500">({activeOption?.count})</span><ChevronDown size={16} className={`transition ${statusDropdownOpen ? 'rotate-180' : ''}`} /></button><AnimatePresence>{statusDropdownOpen && (<><div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} /><motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 py-1 z-20">{statusOptions.map(opt => (<button key={opt.id} onClick={() => { setActiveGroup(opt.id); setStatusDropdownOpen(false) }} className={`w-full text-left px-4 py-2.5 font-medium flex items-center justify-between transition-colors ${activeGroup === opt.id ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}><span className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${opt.dot}`}></span>{opt.label}</span><span className="font-bold text-gray-500">{opt.count}</span></button>))}</motion.div></>)}</AnimatePresence></div>
        <button onClick={() => setShowFilters(!showFilters)} className={`px-4 py-2.5 border rounded-lg flex items-center gap-2 font-medium transition-all ${showFilters || dateFrom || dateTo ? 'border-[#2d568e] bg-[#2d568e]/5 text-[#2d568e]' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800'}`}><SlidersHorizontal size={16} /> Date Filter</button>
        <div className="relative"><ArrowUpDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><select value={sortBy} onChange={e => setSortBy(e.target.value)} className="pl-9 pr-8 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none appearance-none cursor-pointer font-medium"><option value="latest">Latest first</option><option value="oldest">Oldest first</option><option value="price_high">Price ↓</option><option value="price_low">Price ↑</option></select></div>
        <button onClick={fetchBookings} className="p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all bg-white dark:bg-gray-800" title="Refresh"><RefreshCw size={16} /></button>
        <div className="hidden sm:flex items-center gap-4 ml-auto font-medium text-gray-700 dark:text-gray-300">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Confirmed</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-400"></span> Pending</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500"></span> Conflict</span>
        </div>
      </div>
      <AnimatePresence>{showFilters && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600"><label className="font-medium text-gray-700 dark:text-gray-300">Booked from:</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer" /><label className="font-medium text-gray-700 dark:text-gray-300">to:</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer" />{(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-[#2d568e] font-medium hover:underline">Clear</button>}</div></motion.div>)}</AnimatePresence>
      
      {/* Table header */}
      <div className="hidden md:flex items-center px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-t-xl border border-gray-200 dark:border-gray-600 font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
        <div className="flex-[2] px-2">Unit / Location</div>
        <div className="flex-1 px-2">Booking ID</div>
        <div className="flex-[1.5] px-2">Dates / Nights</div>
        <div className="flex-[0.7] text-center px-2">Guests</div>
        <div className="flex-1 text-right px-2">Price</div>
        <div className="flex-[0.8] text-center px-2">Status</div>
        <div className="flex-[0.8] text-center px-2">Actions</div>
        <div className="w-6"></div>
      </div>
      
      {/* Table body */}
      <div className="bg-white dark:bg-gray-800 rounded-b-xl border border-t-0 border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm flex flex-col flex-1 min-h-0 -mt-2 md:mt-0">
        <div className="flex-1 overflow-y-auto">
          {filteredBookings.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <div className="text-center py-12"><Calendar size={36} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-700 dark:text-gray-300 font-semibold">No bookings found</p></div>
            </div>
          ) : showConflictGroups ? (
            <div>{conflictGroups.map((group, gi) => (<div key={gi}><div className="px-4 py-2.5 bg-red-50 dark:bg-red-900/10 border-b border-red-200 dark:border-red-800"><p className="font-bold text-red-700 dark:text-red-300 flex items-center gap-2"><AlertTriangle size={16} /> Conflict Group {gi + 1} — {group[0]?.condos?.code || 'Unit'} ({group.length} booking{group.length !== 1 ? 's' : ''})</p></div>{group.map(booking => <BookingRow key={booking.id} {...{ booking, selectedBooking, hasOverlap, getNightsCount, getGuestSummary, getRowStyle, setSelectedBooking, handleQuickAction, openDeleteModal, handleEdit, actionLoading, formatPrice, confirmedBookings, getConflictingBookings, bookings, getAllOverlappingBookings }} />)}</div>))}</div>
          ) : (
            <div>{filteredBookings.map(booking => <BookingRow key={booking.id} {...{ booking, selectedBooking, hasOverlap, getNightsCount, getGuestSummary, getRowStyle, setSelectedBooking, handleQuickAction, openDeleteModal, handleEdit, actionLoading, formatPrice, confirmedBookings, getConflictingBookings, bookings, getAllOverlappingBookings }} />)}</div>
          )}
        </div>
        <div className="flex-shrink-0 px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
          <p className="font-medium text-gray-700 dark:text-gray-300">Showing {filteredBookings.length} of {bookings.length} bookings</p>
        </div>
      </div>
      <ConfirmationModal isOpen={modalConfig.isOpen} onClose={closeModal} onConfirm={() => handleQuickAction(modalConfig.booking, 'delete')} booking={modalConfig.booking} formatPrice={formatPrice} />
      <BookingFormModal isOpen={bookingFormOpen} onClose={() => { setBookingFormOpen(false); setEditBooking(null) }} onSave={fetchBookings} condos={condos} formatPrice={formatPrice} confirmedBookings={confirmedBookings} editBooking={editBooking} />
    </div>
  )
}

function BookingRow({ booking, selectedBooking, hasOverlap, getNightsCount, getGuestSummary, getRowStyle, setSelectedBooking, handleQuickAction, openDeleteModal, handleEdit, actionLoading, formatPrice, confirmedBookings, getConflictingBookings, bookings, getAllOverlappingBookings }) {
  const isSelected = selectedBooking?.id === booking.id
  const overlap = hasOverlap(booking)
  const nights = getNightsCount(booking)
  const style = getRowStyle(booking, isSelected)
  const conflicts = getConflictingBookings ? getConflictingBookings(booking) : []
  const [showConflictModal, setShowConflictModal] = useState(false)
  const detailRef = useRef(null)
  const isColoredRow = booking.status === 'confirmed' || booking.status === 'rejected'
  useEffect(() => { if (isSelected && detailRef.current) window.scrollTo({ top: detailRef.current.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' }) }, [isSelected])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} id={`booking-row-${booking.id}`}>
      <div onClick={() => setSelectedBooking(isSelected ? null : booking)} className={`flex items-center px-4 py-4 cursor-pointer transition-all duration-200 ${style.bg} ${style.border} ${style.strip} ${!isColoredRow ? 'hover:bg-gray-50 dark:hover:bg-gray-750' : 'hover:brightness-110'}`}>
        <div className="flex items-center gap-3 flex-[2] min-w-0 px-2"><UnitImage condo={booking.condos} /><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><p className={`font-bold truncate max-w-[160px] ${style.text}`}>{booking.condos?.title || '—'}</p><span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${isColoredRow ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-900/30 text-[#2d568e] dark:text-blue-400'}`}>{booking.condos?.code || '—'}</span></div><div className={`flex items-center gap-1 mt-1 text-xs ${style.muted}`}><MapPin size={12} /><span className="truncate">{booking.condos?.location || '—'}</span></div></div></div>
        <div className="flex-1 min-w-0 px-2"><span className={`font-bold ${style.subtext}`}>{booking.booking_code}</span></div>
        <div className="flex-[1.5] min-w-0 px-2"><div className="flex items-center gap-2 flex-wrap"><span className={`font-semibold whitespace-nowrap ${style.text}`}>{format(new Date(booking.start_date), 'MMM d')}</span><span className={style.muted}>→</span><span className={`font-semibold whitespace-nowrap ${style.text}`}>{format(new Date(booking.end_date), 'MMM d')}</span><span className={`px-2 py-0.5 rounded text-xs font-bold ${isColoredRow ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{nights}n</span></div></div>
        <div className="flex-[0.7] text-center px-2"><span className={`font-semibold ${style.text}`}>{getGuestSummary(booking)}</span></div>
        <div className="flex-1 text-right px-2"><span className={`font-extrabold whitespace-nowrap ${isColoredRow ? 'text-white' : 'text-[#2d568e] dark:text-blue-400'}`}>{formatPrice(booking.total_amount)}</span></div>
        <div className="flex-[0.8] flex items-center justify-center gap-2 px-2"><StatusDot status={booking.status} hasConflict={overlap} /><span className={`text-xs font-semibold ${style.muted}`}>{booking.status === 'pending' && !overlap ? 'Pending' : booking.status === 'pending' && overlap ? 'Conflict' : booking.status === 'confirmed' ? 'Confirmed' : booking.status === 'rejected' ? 'Rejected' : ''}</span></div>
        <div className="flex-[0.8] flex justify-center px-2"><ActionDropdown booking={booking} onConfirm={(b) => handleQuickAction(b, 'confirm')} onReject={(b) => handleQuickAction(b, 'reject')} onDelete={(b) => openDeleteModal(b)} onEdit={(b) => handleEdit(b)} actionLoading={actionLoading} overlap={overlap} /></div>
        <div className="w-6 flex justify-center flex-shrink-0"><ChevronRight size={18} className={`transition-transform ${isSelected ? 'rotate-90' : ''} ${style.muted}`} /></div>
      </div>
      <AnimatePresence>
        {isSelected && (
          <motion.div ref={detailRef} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden bg-gray-50 dark:bg-gray-700/20 border-b border-gray-200 dark:border-gray-700">
            <div className="px-6 py-6">
              <div className="flex flex-wrap items-start gap-5 mb-6 pb-5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-4 min-w-[220px]">
                  {booking.avatar_url ? <img src={booking.avatar_url} alt="" className="w-14 h-14 rounded-xl object-cover ring-2 ring-white dark:ring-gray-700 shadow-sm" /> : <div style={{ background: avatarColors(booking.guest_name || '—')[0], color: avatarColors(booking.guest_name || '—')[1] }} className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold ring-2 ring-white dark:ring-gray-700 shadow-sm">{initials(booking.guest_name || '—')}</div>}
                  <div><p className="text-lg font-bold text-gray-900 dark:text-gray-100">{booking.guest_name || '—'}</p><p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{booking.booking_code}</p></div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-semibold text-gray-800 dark:text-gray-200"><Hash size={12} /> {booking.booking_code}</div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2d568e]/10 dark:bg-blue-900/20 border border-[#2d568e]/20 dark:border-blue-800 font-bold text-[#2d568e] dark:text-blue-400"><DollarSign size={12} /> {formatPrice(booking.total_amount)}</div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-semibold text-gray-800 dark:text-gray-200"><Users size={12} /> {getGuestSummary(booking)}</div>
                </div>
              </div>
              <div className="mb-6">
                {!overlap ? (
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                    <div className="lg:col-span-3"><div className="flex items-center gap-2 mb-3"><CheckCircle size={18} className="text-emerald-500" /><p className="font-bold text-emerald-700 dark:text-emerald-300">No conflicts</p></div><MiniBarCalendar bookings={confirmedBookings} condoId={booking.condo_id} highlightBooking={booking} mode="interactive" /></div>
                    <div className="lg:col-span-2"><div className="bg-white dark:bg-gray-700/30 rounded-xl p-6 h-full flex flex-col justify-center items-center text-center border border-gray-200 dark:border-gray-600"><CheckCircle size={36} className="text-emerald-400 mb-3" /><p className="font-semibold text-gray-700 dark:text-gray-300">All Clear</p></div></div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-3"><AlertTriangle size={18} className="text-red-500" /><p className="font-bold text-red-700 dark:text-red-300">Date Conflict</p></div>
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                      <div className="lg:col-span-3"><MiniBarCalendar bookings={confirmedBookings} condoId={booking.condo_id} highlightBooking={booking} onConflictClick={() => setShowConflictModal(true)} mode="interactive" /></div>
                      <div className="lg:col-span-2 space-y-3">
                        <div className="flex items-center justify-between"><p className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Conflicting</p><button onClick={() => { handleEdit(booking); setSelectedBooking(null) }} className="px-3 py-2 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center gap-1"><Edit2 size={14} /> Change Dates</button></div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          {conflicts.map(cb => (
                            <div key={cb.id} className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3 border border-red-100 dark:border-red-800/30">
                              <div className="flex items-center gap-3 mb-2">
                                {cb.avatar_url ? <img src={cb.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-white" /> : <div style={{ background: avatarColors(cb.guest_name || '—')[0], color: avatarColors(cb.guest_name || '—')[1] }} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold">{initials(cb.guest_name || '—')}</div>}
                                <div className="min-w-0 flex-1"><p className="font-bold text-gray-800 dark:text-gray-200 truncate">{cb.guest_name || 'Guest'}</p><p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{cb.booking_code}</p></div>
                                <span className="text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">Confirmed</span>
                              </div>
                              <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400"><span>In: {format(new Date(cb.start_date), 'MMM d')}</span><span>Out: {format(new Date(cb.end_date), 'MMM d')}</span><span>{Math.ceil((new Date(cb.end_date) - new Date(cb.start_date)) / 86400000)}n</span></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-5 border-t border-gray-200 dark:border-gray-700">
                {[
                  { icon: Mail, label: 'Email', value: booking.guest_email || '—' },
                  { icon: Phone, label: 'Phone', value: booking.guest_phone || '—' },
                  { icon: CalendarIcon, label: 'Check-in', value: format(new Date(booking.start_date), 'MMM d, yyyy') },
                  { icon: CalendarIcon, label: 'Check-out', value: format(new Date(booking.end_date), 'MMM d, yyyy') },
                  { icon: Clock, label: 'Booked', value: format(new Date(booking.created_at), 'MMM d') },
                  { icon: MapPin, label: 'Location', value: booking.condos?.location || '—' },
                ].map((item, idx) => (
                  <div key={idx} className="bg-white dark:bg-gray-700/30 rounded-xl p-3 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center gap-1.5 mb-1.5"><item.icon size={12} className="text-gray-500" /><p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">{item.label}</p></div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showConflictModal && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowConflictModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-red-600">Conflicting Bookings</h3><button onClick={() => setShowConflictModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"><X size={20} /></button></div>
              <div className="space-y-3">
                {getAllOverlappingBookings(booking.condo_id).map(cb => (
                  <div key={cb.id} className={`rounded-xl p-4 ${cb.status === 'confirmed' ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700' : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      {cb.avatar_url ? <img src={cb.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" /> : <div style={{ background: avatarColors(cb.guest_name || '—')[0], color: avatarColors(cb.guest_name || '—')[1] }} className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold">{initials(cb.guest_name || '—')}</div>}
                      <div><p className="font-bold text-gray-900 dark:text-gray-100">{cb.guest_name || 'Guest'}</p><p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{cb.booking_code}</p></div>
                      <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${cb.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-orange-500/20 text-orange-700 dark:text-orange-300'}`}>{cb.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm"><div><span className="text-gray-600 dark:text-gray-400">Check-in:</span> {format(new Date(cb.start_date), 'MMM d, yyyy')}</div><div><span className="text-gray-600 dark:text-gray-400">Check-out:</span> {format(new Date(cb.end_date), 'MMM d, yyyy')}</div></div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}