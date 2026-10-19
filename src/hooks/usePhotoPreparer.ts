// Photos are shrunk the moment they're picked, one at a time, so a form only
// ever holds small copies: a dozen full-size iPhone photos can make Safari
// reload the page and lose everything typed.
//
//   const { prepare, busyText } = usePhotoPreparer(cleaning.id)
//   prepare(files, (photos) => add(photos))
//
// Batches wait their turn. `busyText` ("Preparing photo 2 of 5…") is set while
// any are in progress. `key` is what the form is for (the cleaning): photos
// still being prepared when the key changes are dropped, not added to the
// next one. Photos that can't be used are reported in a toast.
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { preparePhotos, PHOTO, type PhotoOptions } from '@/lib/images'

export function usePhotoPreparer(key: string, options: PhotoOptions = PHOTO) {
  const queue = useRef(Promise.resolve())
  const currentKey = useRef(key)
  const settings = useRef(options)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  useEffect(() => { currentKey.current = key }, [key])
  useEffect(() => { settings.current = options }, [options])

  const prepare = useCallback((files: Blob[], use: (photos: Blob[]) => void) => {
    if (files.length === 0) return
    const forKey = currentKey.current
    setProgress((p) => ({ ...p, total: p.total + files.length }))
    queue.current = queue.current.then(async () => {
      const { photos, errors } = await preparePhotos(files, settings.current, () => setProgress((p) => ({ ...p, done: p.done + 1 })))
      if (errors.length) toast.error(errors.length === 1 ? errors[0] : `${errors.length} photos couldn't be added. ${errors[0]}`)
      if (photos.length && currentKey.current === forKey) use(photos)
      setProgress((p) => (p.done >= p.total ? { done: 0, total: 0 } : p))
    })
  }, [])

  const busyText = progress.total > 0
    ? `Preparing photo ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
    : undefined
  return { prepare, busyText }
}
