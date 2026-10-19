// src/components/common/WelcomeModal.tsx
// A short welcome when someone opens one of the workspaces (the CRM, the
// housekeeping page or the owner portal): today's date, a greeting and a line
// of encouragement. It shows once a day per workspace for each person on each
// device; Esc, the button or a click outside closes it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1] as const
const TZ = 'Asia/Manila'

export type Workspace = 'crm' | 'housekeeping' | 'owner'

const COPY: Record<Workspace, { place: string; button: string; lines: string[] }> = {
  crm: {
    place: 'Welcome to the Iloilo Rentals CRM',
    button: "Let's get to work",
    lines: [
      "Every booking you handle is someone's trip to Iloilo. Thank you for making it a good one.",
      'Owners trust us with their homes, and guests trust us with their stay. Your care today keeps that trust.',
      'A quick reply, a clean handover, a booking done right: small things done well are what guests remember.',
      'Great stays are made by a great team. Thank you for being part of Iloilo Rentals.',
      "Start with today's arrivals and departures. The rest will follow, one step at a time.",
      'What you do here keeps every unit full and every guest happy. Have a great day at work.',
      'Thank you for showing up for the team. Iloilo Rentals grows because of people like you.',
    ],
  },
  housekeeping: {
    place: 'Welcome to your housekeeping page',
    button: "Let's get started",
    lines: [
      'A spotless unit is the first thing a guest notices. Your work makes their stay.',
      'Thank you for the care you put into every room. Guests feel it the moment they walk in.',
      'Fresh sheets, clean floors, happy guests. You make Iloilo Rentals shine.',
      'Take photos as you go: great work deserves to be seen.',
      'Every clean you finish gets a home ready for the next guest. Thank you for all you do.',
      'Iloilo Rentals runs on teamwork, and you are a big part of it. Have a great day.',
    ],
  },
  owner: {
    place: 'Welcome to your owner portal',
    button: 'See my units',
    lines: [
      'Thank you for trusting Iloilo Rentals with your property. We are taking good care of it.',
      'Your home is in good hands. Here is how it is doing.',
      'Partners like you make Iloilo Rentals possible. Thank you for growing with us.',
      'Every stay at your unit is a guest welcomed to Iloilo. Thank you for being part of it.',
      'We look after your unit like it is our own. Here is everything in one place.',
    ],
  },
}

function manilaDay() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

function greetingNow() {
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

// Seen today? Storage can be blocked (private windows); then it just shows each visit.
function seenOn(key: string, day: string) {
  try {
    return localStorage.getItem(key) === day
  } catch {
    return false
  }
}

function markSeen(key: string, day: string) {
  try {
    localStorage.setItem(key, day)
  } catch {
    // Nothing to keep it in.
  }
}

type WelcomeModalProps = {
  workspace: Workspace
  userId?: string | null
  name?: string
  /** Wait until the page knows who this is (e.g. the owner's units have loaded). */
  ready?: boolean
}

export function WelcomeModal({ workspace, userId, name, ready = true }: WelcomeModalProps) {
  const [day] = useState(manilaDay)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const reduce = useReducedMotion()
  const key = `welcome:${workspace}:${userId}`
  const copy = COPY[workspace]
  // A different line each day, the same one all day.
  const line = copy.lines[Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 86_400_000) % copy.lines.length]
  const firstName = String(name || '').trim().split(/\s+/)[0]

  useEffect(() => {
    if (ready && userId && !seenOn(key, day)) setOpen(true)
  }, [ready, userId, key, day])

  const close = useCallback(() => {
    markSeen(key, day)
    setOpen(false)
  }, [key, day])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => buttonRef.current?.focus(), 80)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open, close])

  if (typeof document === 'undefined') return null

  // The card rises in, then its lines follow one after another.
  const card = {
    hidden: { opacity: 0, scale: reduce ? 1 : 0.96, y: reduce ? 0 : 16 },
    show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: EASE, staggerChildren: 0.07, delayChildren: 0.1 } },
    exit: { opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.2 } },
  }
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10050] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            aria-describedby="welcome-line"
            className="relative w-full max-w-sm rounded-xl border border-border bg-card text-card-foreground shadow-2xl px-6 pt-7 pb-6 text-center"
            variants={card}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <motion.img variants={item} src="/logo-448.webp" alt="Iloilo Rentals" className="w-16 h-16 mx-auto object-contain" />
            <motion.p variants={item} className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-foreground">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })}
            </motion.p>
            <motion.h2 variants={item} id="welcome-title" className="mt-1.5 text-[22px] font-semibold tracking-tight text-foreground leading-tight">
              {greetingNow()}{firstName ? `, ${firstName}` : ''}
            </motion.h2>
            <motion.p variants={item} className="mt-1 text-[12.5px] text-foreground/75">
              {copy.place}
            </motion.p>
            <motion.p variants={item} id="welcome-line" className="mt-4 text-[14px] leading-relaxed text-foreground">
              {line}
            </motion.p>
            <motion.div variants={item}>
              <button
                ref={buttonRef}
                type="button"
                onClick={close}
                className="mt-6 w-full h-10 rounded-md bg-brand-solid text-white text-[13px] font-semibold hover:bg-brand-solid/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-solid focus-visible:ring-offset-card"
              >
                {copy.button}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
