import { motion } from 'framer-motion'

export default function LoadingAnimation() {
  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        className="text-center"
      >
        <motion.div
          animate={{ 
            rotate: 360,
            transition: { duration: 1, repeat: Infinity, ease: "linear" }
          }}
          className="w-16 h-16 border-4 border-[#2d568e]/20 border-t-[#2d568e] rounded-full mx-auto mb-4"
        />
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-gray-500"
        >
          Loading amazing condos...
        </motion.p>
      </motion.div>
    </div>
  )
}