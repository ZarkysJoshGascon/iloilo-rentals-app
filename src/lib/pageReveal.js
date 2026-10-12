// src/lib/pageReveal.js
// False while the first-visit loading screen covers the page. Entrance
// animations wait for it, so they play when the page is actually seen
// instead of finishing behind the loading screen.
import { createContext, useContext } from 'react'

export const PageRevealContext = createContext(true)

export function usePageRevealed() {
  return useContext(PageRevealContext)
}
