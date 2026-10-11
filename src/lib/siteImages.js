// src/lib/siteImages.js
// Site photos managed in Supabase Storage, bucket `hero-images`:
//   home/          one file per photo spot (see HomePage.jsx)
//   home/reviews/  review screenshots; the "What They Say" section shows them all
//
// Supabase serves public files with an hour of browser and CDN caching, so a
// photo replaced under the same name would keep showing the old copy. Each
// photo URL therefore carries its file's last-updated time (`v`): replace the
// file and its URL changes, so the new photo shows on the next page load.
//
// A folder is listed whenever a page using it mounts (one small request). The
// listing also says which photos exist, so a spot without an upload goes
// straight to its placeholder instead of failing first.
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

const BUCKET = 'hero-images'
const HOME = 'home'
export const REVIEWS = 'home/reviews'
const IMAGE_FILE = /\.(jpe?g|png|webp)$/i
// Resized on Supabase's side. `contain` keeps the whole photo; the default
// (`cover`) keeps the original height and crops the sides.
const TRANSFORM = { width: 1200, quality: 75, resize: 'contain' }

// One store per folder. `files` is undefined while the first listing loads,
// null if listing failed, otherwise a Map of file name → { version, updated }.
const stores = new Map()

function folderStore(folder) {
  let store = stores.get(folder)
  if (store) return store
  store = { files: undefined, loading: false, listeners: new Set() }
  store.get = () => store.files
  store.subscribe = (listener) => {
    // Re-list each time a page using the folder mounts, so a photo replaced
    // since the last visit shows up without a full reload.
    if (store.listeners.size === 0) refresh(folder, store)
    store.listeners.add(listener)
    return () => store.listeners.delete(listener)
  }
  stores.set(folder, store)
  return store
}

function refresh(folder, store) {
  if (store.loading) return
  store.loading = true
  supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 1000 })
    .then(({ data, error }) => {
      if (error) throw error
      store.files = new Map(
        data
          .filter((f) => f.id && IMAGE_FILE.test(f.name))
          .map((f) => [f.name, { version: Date.parse(f.updated_at) || 0, updated: Date.parse(f.created_at) || 0 }]),
      )
    })
    .catch((err) => {
      console.warn(`[siteImages] could not list ${folder}/; using unversioned URLs`, err)
      if (store.files === undefined) store.files = null
    })
    .finally(() => {
      store.loading = false
      store.listeners.forEach((l) => l())
    })
}

function useFolder(folder) {
  const store = folderStore(folder)
  return useSyncExternalStore(store.subscribe, store.get)
}

function photoUrl(path, version, transform) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, { transform })
  return version ? `${data.publicUrl}&v=${version}` : data.publicUrl
}

/**
 * A photo spot: its file name in `home/` (without .jpg), what to show until
 * it's uploaded, and the width to resize it to (smaller for small photos).
 */
export const spot = (name, placeholder, width = TRANSFORM.width) => ({ name, placeholder, width })

// Spot name → its newest file in the folder, whatever the extension
// (`card-buy.png` counts for the `card-buy` spot).
function newestByName(files) {
  const byName = new Map()
  for (const [file, info] of files) {
    const name = file.replace(IMAGE_FILE, '')
    const current = byName.get(name)
    if (!current || info.version > current.info.version) byName.set(name, { file, info })
  }
  return byName
}

/**
 * Returns `photo(spot)` → `{ src, fallback }` for <Photo>. While the folder is
 * still being listed `src` is undefined, so nothing loads yet. A spot's file
 * can be JPG, PNG or WebP; if there are several, the newest upload wins.
 * A spot's placeholder can be another spot: that uploaded photo stands in
 * until this spot gets its own file.
 */
export function useSitePhotos() {
  const files = useFolder(HOME)
  const byName = useMemo(() => (files ? newestByName(files) : null), [files])
  return useCallback(
    function resolve({ name, placeholder, width }) {
      const transform = { ...TRANSFORM, width }
      const standIn = placeholder && typeof placeholder === 'object' ? resolve(placeholder).src : placeholder
      if (files === undefined) return { src: undefined, fallback: standIn }
      // Listing failed: try the .jpg anyway; <Photo> falls back if it's missing.
      if (files === null) return { src: photoUrl(`${HOME}/${name}.jpg`, null, transform), fallback: standIn }
      const match = byName.get(name)
      return match
        ? { src: photoUrl(`${HOME}/${match.file}`, match.info.version, transform), fallback: standIn }
        : { src: standIn }
    },
    [files, byName],
  )
}

/**
 * Every image in a folder, newest upload first, as `{ key, thumb, full }`:
 * `thumb` resized to `thumbHeight` tall, `full` to `fullWidth` wide.
 * `undefined` while the folder is being listed; empty if it can't be.
 */
export function useSiteGallery(folder, { thumbHeight = 720, fullWidth = 1600 } = {}) {
  const files = useFolder(folder)
  return useMemo(() => {
    if (files === undefined) return undefined
    if (files === null) return []
    return [...files.entries()]
      .sort(([, a], [, b]) => b.updated - a.updated)
      .map(([name, { version }]) => ({
        key: name,
        thumb: photoUrl(`${folder}/${name}`, version, { height: thumbHeight, quality: 80, resize: 'contain' }),
        full: photoUrl(`${folder}/${name}`, version, { width: fullWidth, quality: 85, resize: 'contain' }),
      }))
  }, [files, folder, thumbHeight, fullWidth])
}
