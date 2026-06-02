import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showBackButton, setShowBackButton] = useState(false)

  useEffect(() => {
    // Show back button on all pages EXCEPT home page
    const isHomePage = location.pathname === '/'
    setShowBackButton(!isHomePage)
  }, [location.pathname])

  if (!showBackButton) return null

  return (
    <button
      onClick={() => navigate(-1)}
      className="fixed top-20 left-4 z-50 bg-[#2d568e] text-white p-3 rounded-full shadow-lg hover:bg-[#1e3a5f] transition-all flex items-center justify-center lg:hidden"
      aria-label="Go back"
    >
      <ArrowLeft size={24} />
    </button>
  )
}