import * as React from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Three rows of cards that tilt flat and slide sideways as the section
 * scrolls, under a header. Adapted from Aceternity's HeroParallax.
 *
 * products  — [{ title, link, thumbnail }], 5 per row
 * rows      — how many rows to show (default 3); rows alternate direction
 * children  — header content; falls back to <Header /> when omitted
 * container — ref to the scrolling element when the page scrolls inside a
 *             div instead of the window
 */
export function HeroParallax({ products, rows = 3, children, container, className }) {
  const rowItems = Array.from({ length: rows }, (_, r) => products.slice(r * 5, r * 5 + 5))
  const ref = React.useRef(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    container,
    offset: ['start start', 'end start'],
  })

  const springConfig = { stiffness: 300, damping: 30, bounce: 100 }
  // With reduced motion every value holds still at its resting state.
  const range = (from, to, rest) => (reduce ? [rest, rest] : [from, to])

  const translateX = useSpring(useTransform(scrollYProgress, [0, 1], range(0, 1000, 0)), springConfig)
  const translateXReverse = useSpring(useTransform(scrollYProgress, [0, 1], range(0, -1000, 0)), springConfig)
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.2], range(15, 0, 0)), springConfig)
  const opacity = useSpring(useTransform(scrollYProgress, [0, 0.2], range(0.2, 1, 1)), springConfig)
  const rotateZ = useSpring(useTransform(scrollYProgress, [0, 0.2], range(20, 0, 0)), springConfig)
  const translateY = useSpring(useTransform(scrollYProgress, [0, 0.2], range(-700, 500, 0)), springConfig)

  return (
    <div
      ref={ref}
      className={cn(
        'h-[300vh] py-40 overflow-hidden antialiased relative flex flex-col self-auto [perspective:1000px]',
        className,
      )}
    >
      {/* Flat stacking (no preserve-3d on the root) so the header stays above
          the tilted rows and its buttons remain clickable while they overlap. */}
      <div className="relative z-10">{children ?? <Header />}</div>
      <motion.div style={{ rotateX, rotateZ, translateY, opacity }}>
        {rowItems.map((row, r) => (
          <div
            key={r}
            className={cn(
              'flex gap-8 md:gap-20',
              r % 2 === 0 ? 'flex-row-reverse' : 'flex-row',
              r < rows - 1 && 'mb-8 md:mb-20',
            )}
          >
            {row.map((product, i) => (
              <ProductCard
                product={product}
                translate={r % 2 === 0 ? translateX : translateXReverse}
                key={`${product.title}-${i}`}
              />
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export function Header() {
  return (
    <div className="max-w-7xl relative mx-auto py-20 md:py-40 px-4 w-full left-0 top-0">
      <h1 className="text-2xl md:text-7xl font-bold dark:text-white">
        The Ultimate <br /> development studio
      </h1>
      <p className="max-w-2xl text-base md:text-xl mt-8 dark:text-neutral-200">
        We build beautiful products with the latest technologies and frameworks.
      </p>
    </div>
  )
}

export function ProductCard({ product, translate }) {
  const internal = product.link?.startsWith('/')
  const image = (
    <img
      src={product.thumbnail}
      height="600"
      width="600"
      loading="lazy"
      decoding="async"
      className="object-cover object-left-top absolute h-full w-full inset-0"
      alt={product.title}
    />
  )

  return (
    <motion.div
      style={{ x: translate }}
      whileHover={{ y: -20 }}
      className="group/product h-56 w-[20rem] md:h-96 md:w-[30rem] relative flex-shrink-0 rounded-2xl overflow-hidden shadow-xl"
    >
      {internal ? (
        <Link to={product.link} className="block group-hover/product:shadow-2xl">{image}</Link>
      ) : (
        <a href={product.link} className="block group-hover/product:shadow-2xl">{image}</a>
      )}
      <div className="absolute inset-0 h-full w-full opacity-0 group-hover/product:opacity-80 bg-black pointer-events-none transition-opacity duration-300" />
      <h2 className="absolute bottom-4 left-4 opacity-0 group-hover/product:opacity-100 text-white font-semibold pointer-events-none transition-opacity duration-300">
        {product.title}
      </h2>
    </motion.div>
  )
}

export default HeroParallax
