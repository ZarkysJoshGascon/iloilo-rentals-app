import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Loader2, ExternalLink } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [showWarning, setShowWarning] = useState(false)

  // If already logged in, handle user setup and redirection
  useEffect(() => {
    if (!authLoading && user) {
      const setupUser = async () => {
        const avatarUrl = user.user_metadata?.avatar_url || null
        const fullName = user.user_metadata?.full_name || ''
        const firstName = fullName.split(' ')[0] || ''
        const lastName = fullName.split(' ').slice(1).join(' ') || ''

        await supabase.from('user_profiles').upsert({
          id: user.id,
          avatar_url: avatarUrl,
        }, { onConflict: 'id' })

        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('email', user.email)
          .maybeSingle()
        if (!existingLead) {
          await supabase.from('leads').insert({
            email: user.email,
            first_name: firstName,
            last_name: lastName,
            notes: 'Auto-created from user sign-in',
            status: 'new'
          }, { onConflict: 'email' })
        }

        const { data: adminData } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle()

        // Redirect to original page if provided, else admin/home
        const redirect = searchParams.get('redirect')
        if (redirect) {
          navigate(redirect)
        } else if (adminData) {
          navigate('/admin')
        } else {
          navigate('/')
        }
      }
      setupUser()
    }
  }, [authLoading, user, navigate, searchParams])

  // Detect embedded browser
  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || window.opera
    const isEmbedded = (
      ua.includes('FBAN') || ua.includes('FBAV') ||
      ua.includes('Instagram') || ua.includes('Messenger') ||
      ua.includes('WhatsApp') || ua.includes('Twitter') ||
      ua.includes('LinkedIn')
    )
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowWarning(isEmbedded)
  }, [])

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: { prompt: 'select_account' },
          redirectTo: `${window.location.origin}/login`
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('Login error:', error)
      alert('Login failed. Please try again.')
      setIsLoading(false)
    }
  }

  const openInExternalBrowser = () => {
    const currentUrl = window.location.href
    if (navigator.share) {
      navigator.share({
        title: 'Iloilo Rentals',
        text: 'Please open this link in your external browser to sign in:',
        url: currentUrl
      }).catch(() => {
        prompt('Copy this URL and open in your browser:', currentUrl)
      })
    } 
    else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      prompt('Copy this link and open in Safari:', currentUrl)
    }
    else {
      const link = document.createElement('a')
      link.href = currentUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { duration: 0.5, type: "spring", stiffness: 200, damping: 20 }
    }
  }
  const logoVariants = {
    hidden: { scale: 0, rotate: -180 },
    visible: { 
      scale: 1, 
      rotate: 0,
      transition: { duration: 0.5, type: "spring", stiffness: 260, damping: 20 }
    }
  }
  const titleVariants = {
    hidden: { opacity: 0, y: -30 },
    visible: { opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.5 } }
  }
  const subtitleVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { delay: 0.3, duration: 0.5 } }
  }
  const dividerVariants = {
    hidden: { width: 0, opacity: 0 },
    visible: { width: "100%", opacity: 1, transition: { delay: 0.4, duration: 0.6 } }
  }
  const buttonVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.5 } },
    hover: { 
      scale: 1.02,
      borderColor: "#2d568e",
      boxShadow: "0 10px 25px -5px rgba(45,86,142,0.2)",
      transition: { duration: 0.2 }
    },
    tap: { scale: 0.98 }
  }
  const featuresVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { delay: 0.6, staggerChildren: 0.1 } }
  }
  const featureItemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 }
  }
  const footerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { delay: 0.7, duration: 0.5 } }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2d568e]/5 via-white to-[#2d568e]/10 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
          className="absolute -top-40 -right-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"
        />
        <motion.div 
          animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#2d568e]/5 rounded-full blur-3xl"
        />
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        whileHover={{ scale: 1.02 }}
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 md:p-10 transition-all duration-500"
      >
        {showWarning && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-lg"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Sign in requires external browser</p>
                <p className="text-xs text-amber-700 mt-1">
                  Google Sign-In doesn't work in Messenger, Facebook, or Instagram browsers.
                </p>
              </div>
            </div>
            <button
              onClick={openInExternalBrowser}
              className="mt-3 w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
            >
              <ExternalLink size={16} />
              Open in External Browser
            </button>
            <p className="text-xs text-amber-600 text-center mt-3">
              Your phone will ask which browser to use
            </p>
          </motion.div>
        )}
        
        <div className="flex justify-center mb-6">
          <motion.div 
            variants={logoVariants}
            className="bg-[#2d568e]/10 p-4 rounded-full transition-all duration-300 hover:bg-[#2d568e]/20 cursor-pointer"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.img 
              src="/Iloilo_rentals_img.png" 
              alt="Iloilo Rentals Logo" 
              className="w-20 h-20 object-contain"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 4, repeatDelay: 3 }}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="hidden w-20 h-20 bg-[#2d568e] rounded-full items-center justify-center">
              <span className="text-white text-2xl font-bold">IR</span>
            </div>
          </motion.div>
        </div>
        
        <motion.h1 
          variants={titleVariants}
          className="text-3xl md:text-4xl font-bold text-center bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] bg-clip-text text-transparent mb-3"
        >
          Iloilo Rentals
        </motion.h1>
        
        <motion.p 
          variants={subtitleVariants}
          className="text-center text-gray-500 mb-2"
        >
          Sign in to book your perfect stay
        </motion.p>
        
        <motion.p 
          variants={subtitleVariants}
          className="text-center text-sm text-gray-400 mb-8"
        >
          in Iloilo City
        </motion.p>
        
        <div className="relative mb-8">
          <motion.div 
            variants={dividerVariants}
            className="absolute inset-0 flex items-center"
          >
            <div className="w-full border-t border-gray-200"></div>
          </motion.div>
          <div className="relative flex justify-center text-sm">
            <motion.span 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.45 }}
              className="px-4 bg-white text-gray-400"
            >
              Continue with
            </motion.span>
          </div>
        </div>
        
        <motion.button
          variants={buttonVariants}
          initial="hidden"
          animate="visible"
          whileHover={!showWarning ? "hover" : {}}
          whileTap={!showWarning ? "tap" : {}}
          onClick={handleGoogleLogin}
          disabled={isLoading || showWarning}
          className={`group relative w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-3 overflow-hidden transition-all duration-300 ${
            showWarning 
              ? 'bg-gray-100 border-2 border-gray-200 text-gray-400 cursor-not-allowed' 
              : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-[#2d568e] hover:shadow-lg'
          }`}
        >
          <motion.span 
            className="absolute inset-0 bg-gradient-to-r from-[#2d568e]/0 via-[#2d568e]/5 to-[#2d568e]/0"
            initial={{ x: "-100%" }}
            whileHover={!showWarning ? { x: "100%" } : {}}
            transition={{ duration: 0.7 }}
          />
          
          {isLoading ? (
            <>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-5 h-5" />
              </motion.div>
              <span>Redirecting...</span>
            </>
          ) : showWarning ? (
            <>
              <svg className="w-5 h-5 opacity-50" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Sign in with Google</span>
              <span className="text-xs ml-2">(Not available here)</span>
            </>
          ) : (
            <>
              <motion.svg 
                className="w-5 h-5"
                whileHover={{ scale: 1.2, rotate: 5 }}
                viewBox="0 0 24 24"
              >
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </motion.svg>
              <span className="text-base">Sign in with Google</span>
            </>
          )}
        </motion.button>
        
        <motion.div 
          variants={featuresVariants}
          initial="hidden"
          animate="visible"
          className="mt-8 pt-6 border-t border-gray-100"
        >
          <div className="flex flex-col gap-2 text-center text-xs text-gray-400">
            <div className="flex justify-center gap-4">
              {["✓ Secure login", "✓ No password needed", "✓ Instant access"].map((feature, idx) => (
                <motion.span 
                  key={idx}
                  variants={featureItemVariants}
                  className="flex items-center gap-1"
                  whileHover={{ scale: 1.05, color: "#2d568e" }}
                >
                  {feature}
                </motion.span>
              ))}
            </div>
          </div>
        </motion.div>
        
        <motion.p 
          variants={footerVariants}
          initial="hidden"
          animate="visible"
          className="text-center text-xs text-gray-400 mt-6"
        >
          By signing in, you agree to our{' '}
          <motion.a 
            href="/terms" 
            className="text-[#2d568e] hover:underline inline-block"
            whileHover={{ scale: 1.05, x: 2 }}
            whileTap={{ scale: 0.98 }}
          >
            Terms of Service
          </motion.a>
          {' '}and{' '}
          <motion.a 
            href="/privacy" 
            className="text-[#2d568e] hover:underline inline-block"
            whileHover={{ scale: 1.05, x: 2 }}
            whileTap={{ scale: 0.98 }}
          >
            Privacy Policy
          </motion.a>
        </motion.p>
      </motion.div>
    </div>
  )
}