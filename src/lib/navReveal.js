// src/lib/navReveal.js
import { motionValue } from 'framer-motion'

// How "formed" the desktop pill navbar is: 0 = hidden, 1 = full pill.
// The homepage scrolls inside its own container (the Navbar can't see that
// scroll), so HomePage drives this value; every other page leaves it at 1.
// Starts at 0 on a direct load of "/" so the navbar never flashes in.
export const navReveal = motionValue(
  typeof window !== 'undefined' && window.location.pathname === '/' ? 0 : 1,
)
