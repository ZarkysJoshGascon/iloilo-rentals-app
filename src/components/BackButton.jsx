import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showBackButton, setShowBackButton] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const isHomePage = location.pathname === '/'
    setShowBackButton(!isHomePage)
  }, [location.pathname])

  useEffect(() => {
    const handleMobileMenuToggle = (event) => {
      setIsMobileMenuOpen(event.detail.isOpen)
    }
    window.addEventListener('mobileMenuToggle', handleMobileMenuToggle)
    return () => window.removeEventListener('mobileMenuToggle', handleMobileMenuToggle)
  }, [])

  useEffect(() => {
    const checkMobileMenu = () => {
      const mobileMenu = document.querySelector('.md\\:hidden.bg-\\[\\#2d568e\\]')
      if (mobileMenu) {
        const isVisible = window.getComputedStyle(mobileMenu).display !== 'none' && 
                          mobileMenu.children.length > 0
        setIsMobileMenuOpen(isVisible)
      } else {
        setIsMobileMenuOpen(false)
      }
    }

    const observer = new MutationObserver(() => checkMobileMenu())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    checkMobileMenu()
    window.addEventListener('resize', checkMobileMenu)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', checkMobileMenu)
    }
  }, [])

  if (!showBackButton || isMobileMenuOpen) return null

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