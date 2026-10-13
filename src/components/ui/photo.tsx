import { useReducer } from 'react'
import type { CSSProperties } from 'react'

// Image URLs that failed to load this session, so a photo that remounts goes
// straight to its fallback instead of failing again.
const failed = new Set()

type PhotoProps = {
  src: any
  fallback?: any
  alt?: any
  style?: CSSProperties
  [key: string]: any
}

/**
 * An <img> that switches to `fallback` when `src` fails to load — e.g. a
 * Supabase Storage file that hasn't been uploaded yet. If the fallback fails
 * too, or there's no `src` yet (still being looked up), the image is hidden
 * rather than showing a broken-image icon.
 */
export function Photo({ src, fallback, alt = '', style, ...rest }: PhotoProps) {
  const [, rerender] = useReducer((n) => n + 1, 0)
  const current = fallback && failed.has(src) ? fallback : src
  const broken = !current || failed.has(current)
  return (
    <img
      src={current}
      alt={alt}
      onError={broken ? undefined : () => { failed.add(current); rerender() }}
      style={broken ? { ...style, visibility: 'hidden' } : style}
      {...rest}
    />
  )
}

export default Photo
