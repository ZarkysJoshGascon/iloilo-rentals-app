// src/lib/siteImages.ts
// Site photos managed in Supabase Storage, bucket `hero-images`:
//   home/          one file per photo spot (see HomePage.tsx)
//   home/reviews/  review screenshots; the "What They Say" section shows them all
//   interior/      one folder per finished interior project (see useInteriorProjects)
//
// Supabase serves public files with an hour of browser and CDN caching, so a
// photo replaced under the same name would keep showing the old copy. Each
// photo URL therefore carries its file's last-updated time (`v`): replace the
// file and its URL changes, so the new photo shows on the next page load.
//
// A folder is listed whenever a page using it mounts (one small request). The
// listing also says which photos exist, so a spot without an upload goes
// straight to its placeholder instead of failing first.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

const BUCKET = 'hero-images'
const HOME = 'home'
export const REVIEWS = 'home/reviews'
const IMAGE_FILE = /\.(jpe?g|png|webp)$/i
const DEPTH_FILE = /\.depth\.png$/i
// A project folder may also hold its floor plan and a tour.json:
//   { "type": "house" | "condo", "facts": "150 sqm lot · 131 sqm floor area",
//     "stops": { "<photo file>": { "x": 0-1, "y": 0-1, "note": "…" } } }
// x / y place the photo's "you are here" marker on the plan.
const PLAN_FILE = /^plan\.(png|jpe?g|webp)$/i
const TOUR_FILE = 'tour.json'
// Resized on Supabase's side. `contain` keeps the whole photo; the default
// (`cover`) keeps the original height and crops the sides.
const TRANSFORM = { width: 1200, quality: 75, resize: 'contain' }

// One store per folder. `files` is undefined while the first listing loads,
// null if listing failed, otherwise a Map of file name → { version, updated }.
type FileInfo = { version: number; updated: number }
type Files = Map<string, FileInfo> | null | undefined
type FolderStore = {
  files: Files
  loading: boolean
  listeners: Set<() => void>
  get?: () => Files
  subscribe?: (listener: () => void) => () => void
}
const stores = new Map<string, FolderStore>()

function folderStore(folder) {
  let store = stores.get(folder)
  if (store) return store
  store = { files: undefined, loading: false, listeners: new Set<() => void>() }
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

/**
 * Resolves once every photo folder that a mounted page uses has been listed
 * (or failed to list), i.e. once the page's photo URLs are known.
 */
export function whenSitePhotosListed() {
  const pending = [...stores.values()].filter((s) => s.listeners.size > 0 && (s.files === undefined || s.loading))
  const folders = new Promise<void>((resolve) => {
    const check = () => {
      if (pending.some((s) => s.files === undefined || s.loading)) return
      pending.forEach((s) => s.listeners.delete(check))
      resolve()
    }
    pending.forEach((s) => s.listeners.add(check))
    check()
  })
  return Promise.all([folders, Promise.allSettled([...otherLoads])]).then(() => {})
}

// Other photo listings in flight (e.g. interior projects), so the loading
// screen waits for them too.
const otherLoads = new Set()
function trackLoad(promise) {
  otherLoads.add(promise)
  promise.finally(() => otherLoads.delete(promise)).catch(() => {})
  return promise
}

function useFolder(folder: string): Files {
  const store = folderStore(folder)
  return useSyncExternalStore(store.subscribe, store.get)
}

function photoUrl(path, version, transform?) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, { transform })
  if (!version) return data.publicUrl
  return `${data.publicUrl}${data.publicUrl.includes('?') ? '&' : '?'}v=${version}`
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

// ─────────────────────────────────────────────────────────────
// Interior projects: `interior/` holds one folder per finished project, and
// each folder holds that project's photos in walk-through order:
//
//   interior/01 Studio makeover - Megaworld Tower/01 Living room - Stepping in from the door.jpg
//   interior/01 Studio makeover - Megaworld Tower/02 Bedroom.jpg
//
// The leading number sets the order and isn't shown. Text after " - " is the
// project's location (folders) or a short caption (photos). Use letters,
// numbers, spaces and hyphens in the names.
// ─────────────────────────────────────────────────────────────
const INTERIOR = 'interior'
const INTERIOR_PHOTO = { width: 1800, quality: 80, resize: 'contain' }
const byNumberThenName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// "02 Living room - Stepping in" → { title: 'Living room', note: 'Stepping in' }
function parseLabel(name) {
  const clean = name.replace(IMAGE_FILE, '').replace(/^\s*\d+[\s._-]*/, '').replace(/_/g, ' ').trim()
  const [title, ...rest] = clean.split(/\s+-\s+/)
  const tidy = (t) => t.replace(/\s+/g, ' ').trim()
  const first = tidy(title || clean)
  return { title: first.charAt(0).toUpperCase() + first.slice(1), note: rest.length ? tidy(rest.join(' - ')) : '' }
}

let interiorProjects // undefined until loaded once this session
let interiorRequest = null

function loadInteriorProjects() {
  if (interiorRequest) return interiorRequest
  const bucket = supabase.storage.from(BUCKET)
  interiorRequest = trackLoad(
    bucket.list(INTERIOR, { limit: 100 })
      .then(async ({ data, error }) => {
        if (error) throw error
        // Folders come back without an id.
        const folders = data.filter((entry) => !entry.id).map((entry) => entry.name).sort(byNumberThenName)
        const projects = await Promise.all(folders.map(async (folder) => {
          const { data: files, error: filesError } = await bucket.list(`${INTERIOR}/${folder}`, { limit: 100 })
          if (filesError) throw filesError
          const { title, note } = parseLabel(folder)
          const fileUrl = (file) => photoUrl(`${INTERIOR}/${folder}/${file.name}`, Date.parse(file.updated_at) || 0)
          const planFile = files.find((file) => file.id && PLAN_FILE.test(file.name))
          const tourFile = files.find((file) => file.id && file.name === TOUR_FILE)
          let tour: { stops?: Record<string, { note?: string; x?: number; y?: number }>; facts?: string; type?: string } = {}
          if (tourFile) {
            try {
              tour = await fetch(fileUrl(tourFile)).then((res) => (res.ok ? res.json() : {}))
            } catch (err) {
              console.warn('[siteImages] could not read tour.json for', folder, err)
            }
          }
          // "<photo>.depth.png" beside a photo is its depth map, for the 3D walk.
          const depthOf = new Map(
            files
              .filter((file) => file.id && DEPTH_FILE.test(file.name))
              .map((file) => [file.name.replace(DEPTH_FILE, ''), file]),
          )
          const shots = files
            .filter((file) => file.id && IMAGE_FILE.test(file.name) && !DEPTH_FILE.test(file.name) && !PLAN_FILE.test(file.name))
            .sort((a, b) => byNumberThenName(a.name, b.name))
            .map((file) => {
              const label = parseLabel(file.name)
              const depth = depthOf.get(file.name.replace(IMAGE_FILE, ''))
              const stop = tour.stops?.[file.name] || {}
              return {
                key: file.name,
                src: photoUrl(`${INTERIOR}/${folder}/${file.name}`, Date.parse(file.updated_at) || 0, INTERIOR_PHOTO),
                // Served as is: resizing would blur or recompress the depth values.
                depth: depth ? fileUrl(depth) : null,
                room: label.title,
                note: stop.note || label.note,
                marker: Number.isFinite(stop.x) && Number.isFinite(stop.y) ? { x: stop.x, y: stop.y } : null,
              }
            })
          return {
            key: folder,
            title,
            location: tour.facts || note,
            type: tour.type || null,
            plan: planFile ? fileUrl(planFile) : null,
            shots,
          }
        }))
        return projects.filter((project) => project.shots.length > 0)
      })
      .catch((err) => {
        console.warn('[siteImages] could not list interior projects', err)
        return []
      })
      .then((projects) => {
        interiorProjects = projects
        return projects
      }),
  )
  return interiorRequest
}

/**
 * Finished interior projects from Supabase Storage, as
 * `[{ key, title, location, shots: [{ key, src, room, note }] }]`.
 * `undefined` while loading; an empty array when there are none yet.
 */
export function useInteriorProjects() {
  const [projects, setProjects] = useState(interiorProjects)
  useEffect(() => {
    if (projects !== undefined) return
    let cancelled = false
    loadInteriorProjects().then((result) => { if (!cancelled) setProjects(result) })
    return () => { cancelled = true }
  }, [projects])
  return projects
}

