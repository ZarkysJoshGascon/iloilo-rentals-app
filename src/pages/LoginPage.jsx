import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  // Check if already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate('/')
      }
    }
    checkSession()
  }, [navigate])

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            prompt: 'select_account',
          },
          redirectTo: `${window.location.origin}`
        }
      })
      
      if (error) throw error
      
    } catch (error) {
      console.error('Login error:', error)
      alert('Login failed. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2d568e]/5 via-white to-[#2d568e]/10">
      
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#2d568e]/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 md:p-10 transform transition-all duration-500 hover:scale-[1.02]">
        
        {/* Logo Section */}
        <div className="flex justify-center mb-6">
          <div className="bg-[#2d568e]/10 p-4 rounded-full transition-all duration-300 hover:scale-110 hover:bg-[#2d568e]/20">
            <img 
              src="/Iloilo_rentals_img.png" 
              alt="Iloilo Rentals Logo" 
              className="w-20 h-20 object-contain"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'flex'
              }}
            />
            <div className="hidden w-20 h-20 bg-[#2d568e] rounded-full items-center justify-center">
              <span className="text-white text-2xl font-bold">IR</span>
            </div>
          </div>
        </div>
        
        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-center bg-gradient-to-r from-[#2d568e] to-[#1e3a5f] bg-clip-text text-transparent mb-3">
          Iloilo Rentals
        </h1>
        <p className="text-center text-gray-500 mb-2">
          Sign in to book your perfect stay
        </p>
        <p className="text-center text-sm text-gray-400 mb-8">
          in Iloilo City
        </p>
        
        {/* Divider */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-400">Continue with</span>
          </div>
        </div>
        
        {/* Google Sign In Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="group relative w-full bg-white border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl font-semibold hover:border-[#2d568e] hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden"
        >
          {/* Animated background on hover */}
          <span className="absolute inset-0 bg-gradient-to-r from-[#2d568e]/0 via-[#2d568e]/5 to-[#2d568e]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></span>
          
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Redirecting...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="text-base">Sign in with Google</span>
            </>
          )}
        </button>
        
        {/* Features list */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex flex-col gap-2 text-center text-xs text-gray-400">
            <div className="flex justify-center gap-4">
              <span className="flex items-center gap-1">✓ Secure login</span>
              <span className="flex items-center gap-1">✓ No password needed</span>
              <span className="flex items-center gap-1">✓ Instant access</span>
            </div>
          </div>
        </div>
        
        {/* Footer with Terms and Privacy links */}
        <p className="text-center text-xs text-gray-400 mt-6">
          By signing in, you agree to our{' '}
          <a href="/terms" className="text-[#2d568e] hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" className="text-[#2d568e] hover:underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}