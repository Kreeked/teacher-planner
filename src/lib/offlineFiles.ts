/**
 * Копії файлів Диска на пристрої (Cache Storage браузера), щоб матеріали
 * відкривалися без інтернету. Що зберігати, вирішує data/offline.ts.
 */
import { useSyncExternalStore } from 'react'
import type { LessonMaterial } from '../data/types'
import { DriveError, downloadFile, savedDriveToken } from './drive'

const CACHE = 'planner-files'
const PREFIX = '/__offline/'

export type SavedFile = { id: string; name: string; type: string; size: number }

export type OfflineState = {
  saved: Map<string, SavedFile> // за drive_file_id
  ready: boolean // список збережених уже прочитано
  running: boolean
  done: number
  total: number
  error: string
}

let state: OfflineState = { saved: new Map(), ready: false, running: false, done: 0, total: 0, error: '' }
const listeners = new Set<() => void>()

function set(patch: Partial<OfflineState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const supported = typeof caches !== 'undefined'

function key(id: string) {
  return new URL(PREFIX + encodeURIComponent(id), location.origin).href
}

async function load() {
  if (!supported) return set({ ready: true })
  try {
    const cache = await caches.open(CACHE)
    const saved = new Map<string, SavedFile>()
    for (const req of await cache.keys()) {
      const r = await cache.match(req)
      if (!r) continue
      const id = decodeURIComponent(new URL(req.url).pathname.slice(PREFIX.length))
      saved.set(id, {
        id,
        name: decodeURIComponent(r.headers.get('X-Name') ?? ''),
        type: r.headers.get('Content-Type') ?? '',
        size: Number(r.headers.get('Content-Length') ?? 0),
      })
    }
    set({ saved, ready: true })
  } catch (e) {
    console.error(e)
    set({ ready: true })
  }
}

function subscribe(l: () => void) {
  if (!listeners.size && !state.ready) load()
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useOfflineFiles() {
  return useSyncExternalStore(subscribe, () => state)
}

/** Розміри збережених копій — для точного підрахунку ліміту. */
export function savedSizes(s: OfflineState) {
  return new Map([...s.saved.values()].map((f) => [f.id, f.size]))
}

/**
 * Приводить збережене до списку wanted: докачує нові файли, видаляє непотрібні.
 * interactive — запущено натисканням (можна показати вікно дозволу Google);
 * інакше працює лише з уже виданим доступом і тихо нічого не робить без нього.
 */
export async function syncOffline(wanted: LessonMaterial[], interactive: boolean) {
  if (!supported || state.running || !state.ready) return
  const ids = new Set(wanted.map((m) => m.drive_file_id!))
  const cache = await caches.open(CACHE)
  const saved = new Map(state.saved)
  for (const id of saved.keys()) {
    if (ids.has(id)) continue
    await cache.delete(key(id))
    saved.delete(id)
  }
  const missing = wanted.filter((m) => !saved.has(m.drive_file_id!))
  set({ saved })
  if (!missing.length || !navigator.onLine || (!interactive && !savedDriveToken())) return

  // Просимо браузер не стирати копії, коли місця мало.
  navigator.storage?.persist?.().catch(() => {})
  set({ running: true, done: 0, total: missing.length, error: '' })
  let failed = 0
  let error = ''
  for (const m of missing) {
    const id = m.drive_file_id!
    try {
      const blob = await downloadFile(id, m.mime_type)
      const type = blob.type || m.mime_type || 'application/octet-stream'
      await cache.put(
        key(id),
        new Response(blob, {
          headers: {
            'Content-Type': type,
            'Content-Length': String(blob.size),
            'X-Name': encodeURIComponent(m.title),
          },
        }),
      )
      saved.set(id, { id, name: m.title, type, size: blob.size })
    } catch (e) {
      console.error(e)
      failed++
      error = e instanceof DriveError ? e.message : 'Не вдалося зберегти файл.'
      if (!navigator.onLine) break
    }
    set({ saved: new Map(saved), done: state.done + 1 })
  }
  set({
    running: false,
    error: failed ? `Не збережено файлів: ${failed}. ${error}` : '',
  })
}

// Ці типи браузер показує сам; решту віддаємо як файл, щоб відкрився відповідним застосунком.
const VIEWABLE = /^(application\/pdf|image\/|video\/|audio\/|text\/plain)/

/** Відкриває збережену копію. Викликати прямо з натискання: вкладку відкриваємо одразу, до читання файлу. */
export function openSaved(f: SavedFile) {
  const tab = VIEWABLE.test(f.type) ? window.open('', '_blank') : null
  caches
    .open(CACHE)
    .then((c) => c.match(key(f.id)))
    .then((r) => r?.blob())
    .then((blob) => {
      if (!blob) {
        tab?.close()
        return
      }
      const url = URL.createObjectURL(blob)
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
      if (tab) {
        tab.location.href = url
        return
      }
      const a = document.createElement('a')
      a.href = url
      a.download = f.type === 'application/pdf' && !/\.pdf$/i.test(f.name) ? `${f.name}.pdf` : f.name
      a.click()
    })
    .catch((e) => {
      console.error(e)
      tab?.close()
    })
}
