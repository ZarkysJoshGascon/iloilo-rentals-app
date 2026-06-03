import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showBackButton, setShowBackButton] = useState(true)

  useEffect(() => {
    // Show back button on all pages EXCEPT home page
    const isHomePage = location.pathname === '/'
    setShowBackButton(!isHomePage)
  }, [location.pathname])

  // Hide back button when mobile menu is open
  useEffect(() => {
    const checkMobileMenu = () => {
      // Look for the mobile menu div (it appears when hamburger is clicked)
      const mobileMenu = document.querySelector('.md\\:hidden.bg-\\[\\#2d568e\\]')
      const backButton = document.querySelector('.fixed.top-20.left-4.z-50')
      
      if (mobileMenu && backButton) {
        // Check if mobile menu is visible (has content and is not hidden)
        const isMenuVisible = mobileMenu.children.length > 0 && window.getComputedStyle(mobileMenu).display !== 'none'
        
        if (isMenuVisible) {
          backButton.style.display = 'none'
        } else if (showBackButton && location.pathname !== '/') {
          backButton.style.display = 'flex'
        }
      }
    }

    // Check when menu might change (on click, resize, etc.)
    const handleClick = () => {
      setTimeout(checkMobileMenu, 50)
    }
    
    window.addEventListener('click', handleClick)
    window.addEventListener('resize', checkMobileMenu)
    
    // Initial check
    checkMobileMenu()
    
    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('resize', checkMobileMenu)
    }
  }, [showBackButton, location.pathname])

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