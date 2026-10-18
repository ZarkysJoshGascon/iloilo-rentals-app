import { useRef } from 'react'
import { motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion } from 'framer-motion'

const TEAM = [
  {
    name: 'Ismael R. Bebita',
    role: 'CEO',
    image: '/tours/design-team/ismael-bebita-enhanced.webp',
    width: 842,
    height: 730,
  },
  {
    name: 'Hernando P. Parreño Jr.',
    role: 'Architect',
    image: '/tours/design-team/hernando-parreno-enhanced.webp',
    width: 1046,
    height: 664,
  },
]

const EASE = [0.16, 1, 0.3, 1] as const

function PortraitFrame({ person, index, reduceMotion }: {
  person: (typeof TEAM)[number]
  index: number
  reduceMotion: boolean | null
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const inView = useInView(frameRef, { amount: 0.2 })
  const rotation = useMotionValue(0)

  useAnimationFrame((_, delta) => {
    if (inView && !reduceMotion) {
      rotation.set((rotation.get() + Math.min(delta, 100) * 0.012) % 360)
    }
  })

  return (
    <motion.div
      ref={frameRef}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.015 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
      className="relative mx-auto aspect-square w-full max-w-[20rem] rounded-full p-3 shadow-[0_18px_55px_rgba(0,0,0,0.25)] sm:p-3.5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full border border-white/15"
      />
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { opacity: 0, rotate: -35, scale: 0.95 }}
        whileInView={{ opacity: 1, rotate: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: reduceMotion ? 0 : 1.2, delay: reduceMotion ? 0 : 0.15 + index * 0.18, ease: EASE }}
        className="pointer-events-none absolute inset-0"
      >
        <motion.div
          style={{ rotate: reduceMotion ? 0 : rotation }}
          className="absolute inset-0 rounded-full border-2 border-x-transparent border-b-[#d5c5ab]/25 border-t-[#d5c5ab]/75"
        />
      </motion.div>
      <div className="h-full w-full overflow-hidden rounded-full border border-white/15 bg-[#305c95]">
        <img
          src={person.image}
          alt={`${person.name}, ${person.role}`}
          width={person.width}
          height={person.height}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-center"
        />
      </div>
    </motion.div>
  )
}

export default function InteriorDesignCredits() {
  const reduceMotion = useReducedMotion()

  return (
    <section
      id="design-team"
      aria-labelledby="design-team-title"
      className="relative flex min-h-svh flex-col justify-center overflow-hidden bg-[#0b0f17] px-6 py-20 text-white md:px-12 md:py-24"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_80%,rgba(45,86,142,0.2),transparent_65%)]"
      />
      <div className="relative mx-auto w-full max-w-5xl">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: reduceMotion ? 0 : 0.65, ease: EASE }}
          className="mb-10 max-w-2xl md:mb-14"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#d5c5ab] md:text-xs">
            Design credits
          </p>
          <h2
            id="design-team-title"
            className="mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl"
          >
            The people behind<br className="hidden sm:block" /> the spaces.
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/65 md:text-base">
            Meet the team behind our interior design work.
          </p>
        </motion.div>

        <div className="grid gap-12 sm:grid-cols-2 md:gap-16">
          {TEAM.map((person, index) => (
            <motion.figure
              key={person.name}
              initial={reduceMotion ? false : { opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: reduceMotion ? 0 : 0.8, delay: reduceMotion ? 0 : index * 0.18, ease: EASE }}
              className="min-w-0"
            >
              <PortraitFrame person={person} index={index} reduceMotion={reduceMotion} />
              <figcaption className="mx-auto mt-6 w-full max-w-[20rem] border-t border-white/15 pt-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d5c5ab]">
                  {person.role}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
                  {person.name}
                </h3>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
