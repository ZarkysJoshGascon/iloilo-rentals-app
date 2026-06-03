import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

export default function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showBackButton, setShowBackButton] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    // Show back button on all pages EXCEPT home page
    const isHomePage = location.pathname === '/'
    setShowBackButton(!isHomePage)
  }, [location.pathname])

  // Listen for mobile menu state from DOM changes
  useEffect(() => {
    const checkMobileMenu = () => {
      // Look for the mobile menu div
      const mobileMenu = document.querySelector('.md\\:hidden.bg-\\[\\#2d568e\\]')
      
      if (mobileMenu) {
        // Check if mobile menu is visible
        const isVisible = window.getComputedStyle(mobileMenu).display !== 'none' && 
                          mobileMenu.children.length > 0 &&
                          mobileMenu.classList.contains('block')
        
        setIsMobileMenuOpen(isVisible)
      } else {
        setIsMobileMenuOpen(false)
      }
    }

    // Create a MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      checkMobileMenu()
    })

    // Start observing the document body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    // Initial check
    checkMobileMenu()

    // Also check on click events (for hamburger button)
    const handleClick = () => {
      setTimeout(checkMobileMenu, 50)
    }
    
    window.addEventListener('click', handleClick)
    window.addEventListener('resize', checkMobileMenu)

    return () => {
      observer.disconnect()
      window.removeEventListener('click', handleClick)
      window.removeEventListener('resize', checkMobileMenu)
    }
  }, [])

  // Don't show back button when mobile menu is open OR on home page
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