// src/components/common/PageImagesProbe.tsx
// Mounted next to the routes (inside the same Suspense), so it starts once the
// page's code has loaded and the page has rendered. It then waits for the
// Supabase photo folders to be listed, and downloads every image the page
// uses, lazy ones further down included, so nothing pops in afterwards.
import { useEffect } from 'react'
import { whenSitePhotosListed } from '@/lib/api/siteImages'
import { preloadImages } from '@/lib/preloadImages'

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/g

// Every image on the page: <img> elements and inline CSS background images.
function pageImageUrls() {
  const urls = []
  for (const img of document.querySelectorAll('img')) {
    const src = img.currentSrc || img.src
    if (src && !src.startsWith('data:')) urls.push(src)
  }
  for (const el of document.querySelectorAll<HTMLElement>('[style*="url("]')) {
    for (const [, url] of el.style.backgroundImage.matchAll(CSS_URL)) {
      if (!url.startsWith('data:')) urls.push(new URL(url, window.location.href).href)
    }
  }
  return urls
}

type PageImagesProbeProps = {
  onProgress: (...args: any[]) => any
  onDone: () => void
}

/**
 * onProgress(0–1) as the images come in; onDone() when all have loaded or
 * failed. Both should be stable (state setters or memoised callbacks).
 */
export function PageImagesProbe({ onProgress, onDone }: PageImagesProbeProps) {
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await nextFrame()
      if (cancelled) return
      onProgress(0.1)
      await whenSitePhotosListed()
      // Two frames for the page to re-render with the photo URLs it now knows.
      await nextFrame()
      await nextFrame()
      if (cancelled) return
      await preloadImages(pageImageUrls(), {
        onProgress: (done, total) => !cancelled && onProgress(0.1 + 0.9 * (done / total)),
      })
      if (!cancelled) onDone()
    })()
    return () => { cancelled = true }
  }, [onProgress, onDone])

  return null
}

export default PageImagesProbe
