import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1]

/**
 * Full-screen loading screen: the logo and a progress bar (0–1). Covers the
 * whole page, navbar included, while `show` is true, then fades out.
 * Rendered into <body> so nothing on the page can sit above it.
 */
export function Preloader({ show, progress = 0, logo, brandColor = '#2d568e' }) {
  const reduce = useReducedMotion()
  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          key="preloader"
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-8 bg-white"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          {logo && (
            <motion.img
              src={logo}
              alt=""
              className="w-28 h-28 md:w-36 md:h-36 object-contain"
              animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <div className="w-48 md:w-64 h-1 rounded-full bg-gray-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full origin-left"
              style={{ backgroundColor: brandColor, scaleX: 0.04 }}
              animate={{ scaleX: Math.max(0.04, progress) }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <span className="sr-only">Loading, {Math.round(progress * 100)}%</span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export default Preloader
