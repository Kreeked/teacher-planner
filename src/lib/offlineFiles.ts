/**
 * Копії файлів Диска на пристрої (Cache Storage браузера), щоб матеріали
 * відкривалися без інтернету. Що зберігати, вирішує data/offline.ts.
 */
import { useSyncExternalStore } from 'react'
import { googleTarget, inAppViewable } from '../data/materials'
import type { LessonMaterial } from '../data/types'
import { DriveError, convertToPdf, downloadFile, savedDriveToken } from './drive'

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
  skipped: Set<string> // файли, які на цьому пристрої вирішили не тримати
  paused: boolean // після «Очистити все» нічого не докачуємо, доки не натиснуть «Зберегти зараз»
}

// Налаштування цього пристрою: інші пристрої зберігають свої копії самі.
const SKIP_KEY = 'offline-skip'
const PAUSE_KEY = 'offline-paused'

function readPrefs() {
  try {
    return {
      skipped: new Set<string>(JSON.parse(localStorage.getItem(SKIP_KEY) ?? '[]')),
      paused: localStorage.getItem(PAUSE_KEY) === '1',
    }
  } catch {
    return { skipped: new Set<string>(), paused: false }
  }
}

function savePrefs(p: { skipped?: Set<string>; paused?: boolean }) {
  try {
    if (p.skipped) localStorage.setItem(SKIP_KEY, JSON.stringify([...p.skipped]))
    if (p.paused !== undefined) localStorage.setItem(PAUSE_KEY, p.paused ? '1' : '0')
  } catch {
    // Без сховища налаштування житимуть до перезавантаження.
  }
  set(p)
}

let state: OfflineState = {
  saved: new Map(),
  ready: false,
  running: false,
  done: 0,
  total: 0,
  error: '',
  ...readPrefs(),
}
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
export async function syncOffline(all: LessonMaterial[], interactive: boolean) {
  if (!supported || state.running || !state.ready) return
  if (interactive && state.paused) savePrefs({ paused: false })
  const wanted = all.filter((m) => !state.skipped.has(m.drive_file_id!))
  await clearStale(wanted)
  const saved = new Map(state.saved)
  const missing = wanted.filter((m) => !saved.has(m.drive_file_id!))
  if (!missing.length || !navigator.onLine) return
  if (!interactive && (state.paused || !savedDriveToken())) return
  const cache = await caches.open(CACHE)

  // Просимо браузер не стирати копії, коли місця мало.
  navigator.storage?.persist?.().catch(() => {})
  set({ running: true, done: 0, total: missing.length, error: '' })
  let failed = 0
  let error = ''
  for (const m of missing) {
    const id = m.drive_file_id!
    try {
      saved.set(id, await putCopy(cache, m, await fetchCopy(m)))
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

/**
 * Що зберігати на пристрої: файли, які відкриваються у вбудованому перегляді, — у вигляді PDF
 * (офісні конвертує Диск), решту — як є. Якщо конвертація не вдалася, лишається оригінал.
 */
async function fetchCopy(m: LessonMaterial) {
  const id = m.drive_file_id!
  const target = inAppViewable(m) ? googleTarget(m) : null
  if (!target) return downloadFile(id, m.mime_type)
  try {
    return await convertToPdf(id, target)
  } catch (e) {
    if (!navigator.onLine) throw e
    console.error(e)
    return downloadFile(id, m.mime_type)
  }
}

async function putCopy(cache: Cache, m: LessonMaterial, blob: Blob): Promise<SavedFile> {
  const id = m.drive_file_id!
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
  return { id, name: m.title, type, size: blob.size }
}

const PDF = 'application/pdf'

/**
 * PDF матеріалу для вбудованого перегляду. Збережена на пристрої копія береться одразу (вона й без інтернету);
 * fresh — завантажити з Диска наново (файл могли змінити). Нова копія зберігається, якщо на пристрої це не вимкнено.
 */
export async function loadPdf(m: LessonMaterial, fresh = false): Promise<Blob> {
  const id = m.drive_file_id!
  if (supported && !fresh) {
    const r = await (await caches.open(CACHE)).match(key(id))
    if (r && r.headers.get('Content-Type') === PDF) return r.blob()
  }
  if (!(await reachable()))
    throw new DriveError(
      fresh
        ? 'Немає інтернету — показано збережену копію.'
        : 'Немає інтернету, а цього файлу ще немає на пристрої. Файли до уроків найближчого тижня зберігаються самі; інші можна позначити шпилькою в матеріалах.',
    )
  const target = googleTarget(m)
  const blob = target ? await convertToPdf(id, target) : await downloadFile(id, m.mime_type)
  if (supported && !state.skipped.has(id) && !state.paused) {
    const file = await putCopy(await caches.open(CACHE), m, blob)
    set({ saved: new Map(state.saved).set(id, file) })
  }
  return blob
}

/** Видаляє копії файлів, яких уже немає в списку потрібних (минулі уроки, прибрані матеріали). */
export async function clearStale(wanted: LessonMaterial[]) {
  if (!supported) return
  const ids = new Set(wanted.map((m) => m.drive_file_id!))
  const stale = [...state.saved.keys()].filter((id) => !ids.has(id))
  if (!stale.length) return
  const cache = await caches.open(CACHE)
  for (const id of stale) await cache.delete(key(id))
  const saved = new Map(state.saved)
  for (const id of stale) saved.delete(id)
  set({ saved })
}

/** Прибирає копію одного файлу й більше не зберігає його на цьому пристрої. */
export async function removeSaved(id: string) {
  if (!supported || state.running) return
  await (await caches.open(CACHE)).delete(key(id))
  const saved = new Map(state.saved)
  saved.delete(id)
  set({ saved })
  savePrefs({ skipped: new Set([...state.skipped, id]) })
}

/** Знову зберігати файл, від якого раніше відмовились. */
export function unskip(id: string) {
  const skipped = new Set(state.skipped)
  skipped.delete(id)
  savePrefs({ skipped })
}

/** Видаляє всі копії; нові не зберігаються, доки не натиснуть «Зберегти зараз». */
export async function clearAll() {
  if (!supported || state.running) return
  await caches.delete(CACHE)
  set({ saved: new Map(), error: '' })
  savePrefs({ paused: true, skipped: new Set() })
}

// Ці типи браузер показує сам; решту віддаємо як файл, щоб відкрився відповідним застосунком.
const VIEWABLE = /^(application\/pdf|image\/|video\/|audio\/|text\/plain)/

/**
 * Чи є зв'язок з інтернетом саме зараз. navigator.onLine на ПК часто каже «так»
 * і з вимкненим Wi-Fi (через інші мережеві адаптери), тому питаємо Google напряму.
 */
async function reachable() {
  if (!navigator.onLine) return false
  try {
    await fetch(`https://www.gstatic.com/generate_204?t=${Date.now()}`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })
    return true
  } catch {
    return false
  }
}

async function savedUrl(f: SavedFile) {
  const r = await (await caches.open(CACHE)).match(key(f.id))
  if (!r) return null
  const url = URL.createObjectURL(await r.blob())
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  return url
}

function download(url: string, f: SavedFile) {
  const a = document.createElement('a')
  a.href = url
  a.download = f.type === 'application/pdf' && !/\.pdf$/i.test(f.name) ? `${f.name}.pdf` : f.name
  a.click()
}

/**
 * Відкриває файл матеріалу: з інтернетом — на Google Диску, без нього — збережену копію.
 * Викликати прямо з натискання: вкладку відкриваємо одразу, щоб браузер її не заблокував.
 */
export function openMaterial(driveUrl: string, saved: SavedFile | undefined) {
  const tab = window.open('', '_blank')
  if (tab) tab.document.title = 'Відкриваю…'
  reachable()
    .then(async (online) => {
      if (online || !saved) {
        if (!online) {
          tab?.close()
          alert(
            'Немає інтернету, а цього файлу ще немає на пристрої. ' +
              'Файли до уроків найближчого тижня зберігаються самі; інші можна позначити шпилькою в матеріалах.',
          )
          return
        }
        if (tab) tab.location.href = driveUrl
        else window.open(driveUrl, '_blank')
        return
      }
      const url = await savedUrl(saved)
      if (!url) {
        tab?.close()
        return
      }
      if (tab && VIEWABLE.test(saved.type)) {
        tab.location.href = url
        return
      }
      tab?.close()
      download(url, saved)
    })
    .catch((e) => {
      console.error(e)
      tab?.close()
    })
}
