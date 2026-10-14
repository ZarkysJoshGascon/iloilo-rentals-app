import { motion, useReducedMotion } from 'framer-motion'

const TEAM = [
  {
    name: 'Ismael R. Bebita',
    role: 'CEO',
    image: '/tours/design-team/ismael-bebita.webp',
    width: 421,
    height: 365,
  },
  {
    name: 'Hernando P. Parreño Jr.',
    role: 'Architect',
    image: '/tours/design-team/hernando-parreno.webp',
    width: 523,
    height: 332,
  },
]

const EASE = [0.16, 1, 0.3, 1] as const

export default function InteriorDesignCredits() {
  const reduceMotion = useReducedMotion()

  return (
    <section
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

        <div className="grid gap-8 sm:grid-cols-2 md:gap-12">
          {TEAM.map((person, index) => (
            <motion.figure
              key={person.name}
              initial={reduceMotion ? false : { opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: reduceMotion ? 0 : 0.75, delay: reduceMotion ? 0 : index * 0.12, ease: EASE }}
              className="min-w-0"
            >
              <div className="mx-auto flex aspect-[6/5] w-full max-w-[28rem] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#305c95]">
                <img
                  src={person.image}
                  alt={`${person.name}, ${person.role}`}
                  width={person.width}
                  height={person.height}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-bottom"
                />
              </div>
              <figcaption className="mt-5 border-t border-white/15 pt-4">
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
