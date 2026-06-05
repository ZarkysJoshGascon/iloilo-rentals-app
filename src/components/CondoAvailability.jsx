import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns'

export default function CondoAvailability() {
  const [condos, setCondos] = useState([])
  const [bookings, setBookings] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [selectedDate])

  const fetchData = async () => {
    setLoading(true)
    const [condosRes, bookingsRes] = await Promise.all([
      supabase.from('condos').select('id, title, code'),
      supabase.from('bookings').select('condo_id, start_date, end_date, status').eq('status', 'confirmed')
    ])
    setCondos(condosRes.data || [])
    setBookings(bookingsRes.data || [])
    setLoading(false)
  }

  const isCondoBookedOnDate = (condoId, date) => {
    return bookings.some(booking => 
      booking.condo_id === condoId && 
      new Date(booking.start_date) <= date && 
      new Date(booking.end_date) >= date
    )
  }

  const monthDays = eachDayOfInterval({
    start: startOfMonth(selectedDate),
    end: endOfMonth(selectedDate)
  })

  if (loading) return <div className="text-center py-8">Loading availability...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Condo Availability</h3>
        <input 
          type="month" 
          value={format(selectedDate, 'yyyy-MM')}
          onChange={(e) => setSelectedDate(new Date(e.target.value))}
          className="border rounded p-1 text-sm"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Condo</th>
              {monthDays.slice(0, 10).map(day => (
                <th key={day.toString()} className="p-2 text-center font-normal text-xs">
                  {format(day, 'dd')}
                </th>
              ))}
              {monthDays.length > 10 && <th className="p-2 text-center">...</th>}
            </tr>
          </thead>
          <tbody>
            {condos.map(condo => (
              <tr key={condo.id} className="border-t">
                <td className="p-2 font-medium">{condo.title} {condo.code && `(${condo.code})`}</td>
                {monthDays.slice(0, 10).map(day => {
                  const isBooked = isCondoBookedOnDate(condo.id, day)
                  return (
                    <td key={day.toString()} className="p-2 text-center">
                      <div className={`w-5 h-5 rounded-full mx-auto ${isBooked ? 'bg-red-500' : 'bg-green-500'}`} title={format(day, 'MMM dd')}></div>
                    </td>
                  )
                })}
                {monthDays.length > 10 && <td className="p-2 text-center text-gray-400">...</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> Available</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> Booked</div>
      </div>
    </div>
  )
}