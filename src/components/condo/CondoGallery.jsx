import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export default function ImageGallery({ images, title }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fade, setFade] = useState(true)
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(true)

  useEffect(() => {
    let intervalId = null
    if (images.length > 1 && !isOpen && autoRotateEnabled) {
      intervalId = setInterval(() => {
        setFade(false)
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % images.length)
          setFade(true)
        }, 300)
      }, 4000)
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [images.length, isOpen, autoRotateEnabled])

  const openGallery = (index) => {
    setAutoRotateEnabled(false)
    setCurrentIndex(index)
    setIsOpen(true)
    document.body.style.overflow = 'hidden'
  }

  const closeGallery = () => {
    setIsOpen(false)
    document.body.style.overflow = 'unset'
    setAutoRotateEnabled(true)
  }

  const nextImage = () => {
    setFade(false)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length)
      setFade(true)
    }, 300)
  }

  const prevImage = () => {
    setFade(false)
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
      setFade(true)
    }, 300)
  }

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) closeGallery()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleImageError = (e) => {
    e.target.src = 'https://via.placeholder.com/800x600?text=Image+Not+Found'
  }

  if (!images || images.length === 0) return null

  return (
    <>
      <div className="relative">
        <div 
          className="relative h-[550px] md:h-[650px] lg:h-[700px] cursor-pointer group overflow-hidden"
          onClick={() => openGallery(0)}
        >
          {images.map((img, idx) => (
            <div
              key={idx}
              className="absolute top-0 left-0 w-full h-full transition-opacity duration-500 ease-in-out"
              style={{ opacity: idx === currentIndex && fade ? 1 : 0 }}
            >
              <img 
                src={img} 
                alt={title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                onError={handleImageError}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
            </div>
          ))}
          
          {images.length > 1 && (
            <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm z-10">
              {currentIndex + 1} / {images.length}
            </div>
          )}
          
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 z-10">
            <div className="bg-black/80 text-white px-4 py-2 rounded-full text-sm font-medium">
              View Gallery ({images.length} photos)
            </div>
          </div>
        </div>
        
        {images.length > 1 && (
          <div className="flex gap-2 justify-center mt-4 overflow-x-auto pb-2 px-4">
            {images.map((img, idx) => (
              <div
                key={idx}
                className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-300 hover:scale-105 ${
                  idx === currentIndex 
                    ? 'border-[#2d568e] shadow-lg' 
                    : 'border-white/50 hover:border-white/80'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  setAutoRotateEnabled(false)
                  setFade(false)
                  setTimeout(() => {
                    setCurrentIndex(idx)
                    setFade(true)
                  }, 300)
                }}
              >
                <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" onError={handleImageError} />
              </div>
            ))}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[99999]">
          <div className="absolute inset-0 bg-black" onClick={closeGallery} />
          <button 
            onClick={closeGallery}
            className="fixed top-6 right-6 z-[100000] text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-3 hover:bg-black/70"
            style={{ marginTop: 'env(safe-area-inset-top, 60px)' }}
          >
            <X size={28} />
          </button>
          {images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); prevImage(); }} className="fixed left-6 top-1/2 -translate-y-1/2 z-[100000] text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-3 hover:bg-black/70">
                <ChevronLeft size={36} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); nextImage(); }} className="fixed right-6 top-1/2 -translate-y-1/2 z-[100000] text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-3 hover:bg-black/70">
                <ChevronRight size={36} />
              </button>
            </>
          )}
          <div className="fixed top-6 left-6 z-[100000] text-white bg-black/50 px-3 py-1 rounded-full text-sm">
            {currentIndex + 1} / {images.length}
          </div>
          <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
            {images.map((img, idx) => (
              <div key={idx} className={`absolute transition-opacity duration-500 ease-in-out ${idx === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                <img src={img} alt={`${title} ${idx + 1}`} className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg pointer-events-auto" onError={handleImageError} />
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <div className="fixed bottom-4 left-0 right-0 flex justify-center gap-2 p-2 bg-black/50 overflow-x-auto z-[100000]">
              {images.map((img, idx) => (
                <button key={idx} onClick={(e) => { e.stopPropagation(); setFade(false); setTimeout(() => { setCurrentIndex(idx); setFade(true); }, 300); }} className={`flex-shrink-0 w-12 h-12 md:w-16 md:h-16 rounded-lg overflow-hidden border-2 transition-all duration-300 ${idx === currentIndex ? 'border-white shadow-lg' : 'border-white/30 hover:border-white/60'}`}>
                  <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" onError={handleImageError} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}