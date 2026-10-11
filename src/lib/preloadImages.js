// src/lib/preloadImages.js
// Downloads and decodes images ahead of use, so they're already in the
// browser cache when the page shows them. Resolves once every image has loaded
// or failed (a failure counts as done), or after `timeout` ms if given.
// `onProgress(done, total)` reports along the way.
export function preloadImages(urls, { timeout, onProgress } = {}) {
  const unique = [...new Set(urls.filter(Boolean))]
  if (unique.length === 0) return Promise.resolve()

  return new Promise((resolve) => {
    let done = 0
    const timer = timeout ? setTimeout(resolve, timeout) : null
    const finish = () => {
      done += 1
      onProgress?.(done, unique.length)
      if (done === unique.length) {
        clearTimeout(timer)
        resolve()
      }
    }
    for (const url of unique) {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      img.decode().then(finish, finish)
    }
  })
}
