import { motion } from 'framer-motion'

// Fade in up animation
export const fadeInUp = {
  initial: { opacity: 0, y: 60 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" }
}

// Fade in animation
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.5 }
}

// Scale animation (for cards on hover)
export const scaleOnHover = {
  whileHover: { scale: 1.03 },
  transition: { duration: 0.2 }
}

// Stagger children animations
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
}

// Page transition wrapper
export const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
)

// Card animation wrapper
export const AnimatedCard = ({ children, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    whileHover={{ y: -8, transition: { duration: 0.2 } }}
  >
    {children}
  </motion.div>
)