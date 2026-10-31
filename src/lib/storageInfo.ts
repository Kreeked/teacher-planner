/**
 * Усе, що застосунок тримає на пристрої: кеші браузера (файли уроків, оболонка застосунку, шрифти),
 * локальна база Firestore й дані входу (IndexedDB), налаштування (localStorage), service worker.
 */
import { signOut } from 'firebase/auth'
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore'
import { auth, db } from './firebase'
import { FILES_CACHE, clearAll } from './offlineFiles'

export type StorageItem = {
  id: string
  label: string
  hint: string
  /** null — браузер не каже, скільки це займає. */
  bytes: number | null
  /** Без дії — окремо цей пункт не очищується (див. «Очистити все»). */
  clear?: () => Promise<void>
  /** Що написати у підтвердженні перед очищенням. */
  warn?: string
}

export type StorageReport = { usage: number | null; quota: number | null; items: StorageItem[] }

/** Зрозуміла назва кешу браузера за його іменем. */
export function cacheLabel(name: string): { label: string; hint: string } {
  if (name === FILES_CACHE)
    return { label: 'Файли до уроків', hint: 'Презентації, документи й таблиці, збережені для роботи без інтернету.' }
  if (/precache/i.test(name))
    return { label: 'Оболонка застосунку', hint: 'Сам застосунок для запуску без інтернету. Після очищення завантажиться знову.' }
  if (/font/i.test(name)) return { label: 'Шрифти', hint: 'Шрифт Onest, щоб і без інтернету виглядало так само.' }
  return { label: `Кеш «${name}»`, hint: 'Службовий кеш браузера.' }
}

async function cacheBytes(name: string) {
  const cache = await caches.open(name)
  let sum = 0
  for (const req of await cache.keys()) {
    const r = await cache.match(req)
    if (!r) continue
    // Для файлів уроків розмір записано в заголовку; решту рахуємо за вмістом.
    const len = name === FILES_CACHE ? Number(r.headers.get('Content-Length')) : 0
    sum += len > 0 ? len : (await r.blob()).size
  }
  return sum
}

function localBytes() {
  let sum = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      sum += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2
    }
  } catch {
    return null
  }
  return sum
}

async function unregisterWorkers() {
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
  await Promise.all(regs.map((r) => r.unregister()))
}

async function deleteCache(name: string) {
  if (name === FILES_CACHE) return clearAll()
  await caches.delete(name)
}

/** Читає, що зараз збережено. */
export async function readStorage(): Promise<StorageReport> {
  const est = (await navigator.storage?.estimate?.().catch(() => null)) as
    | (StorageEstimate & { usageDetails?: { indexedDB?: number } })
    | null
  const items: StorageItem[] = []

  if (typeof caches !== 'undefined') {
    for (const name of await caches.keys()) {
      const { label, hint } = cacheLabel(name)
      const shell = /precache/i.test(name)
      items.push({
        id: `cache:${name}`,
        label,
        hint,
        bytes: await cacheBytes(name).catch(() => null),
        warn: shell ? 'Застосунок перезавантажиться й завантажиться знову — для цього потрібен інтернет.' : undefined,
        clear: shell
          ? async () => {
              await unregisterWorkers()
              await caches.delete(name)
              location.reload()
            }
          : () => deleteCache(name),
      })
    }
  }

  const dbs = (await indexedDB.databases?.().catch(() => [])) ?? []
  if (dbs.length)
    items.push({
      id: 'idb',
      label: 'Локальна база даних',
      hint: `Копія всіх записів планера й дані входу для роботи без інтернету (баз: ${dbs.length}). Очищується лише разом з усім.`,
      bytes: est?.usageDetails?.indexedDB ?? null,
    })

  const local = localBytes()
  if (local !== null)
    items.push({
      id: 'local',
      label: 'Налаштування пристрою',
      hint: 'Доступ до Google Диска, які файли не зберігати на цьому пристрої. Після очищення Google попросить дозвіл знову.',
      bytes: local,
      warn: 'Застосунок перезавантажиться.',
      clear: async () => {
        localStorage.clear()
        location.reload()
      },
    })

  const workers = (await navigator.serviceWorker?.getRegistrations?.().catch(() => [])) ?? []
  if (workers.length)
    items.push({
      id: 'sw',
      label: 'Службовий процес (service worker)',
      hint: 'Він віддає застосунок із кешу без інтернету. Після відключення завантажиться наново.',
      bytes: null,
      warn: 'Застосунок перезавантажиться; для цього потрібен інтернет.',
      clear: async () => {
        await unregisterWorkers()
        location.reload()
      },
    })

  const known = items.reduce((s, i) => s + (i.bytes ?? 0), 0)
  const rest = (est?.usage ?? 0) - known
  if (rest > 100 * 1024)
    items.push({ id: 'rest', label: 'Решта', hint: 'Службові дані браузера, які не віднесено до пунктів вище.', bytes: rest })

  return { usage: est?.usage ?? null, quota: est?.quota ?? null, items }
}

/**
 * Стирає все на цьому пристрої: вихід з акаунта, локальну базу, кеші, service worker, налаштування.
 * Дані в хмарі не зачіпаються; зміни, які ще не синхронізувались, буде втрачено.
 */
export async function wipeEverything() {
  await signOut(auth).catch(() => {})
  try {
    await terminate(db)
    await clearIndexedDbPersistence(db)
  } catch (e) {
    console.error(e)
  }
  for (const d of (await indexedDB.databases?.().catch(() => [])) ?? []) {
    if (!d.name) continue
    await new Promise((resolve) => {
      const q = indexedDB.deleteDatabase(d.name!)
      q.onsuccess = q.onerror = q.onblocked = () => resolve(null)
    })
  }
  if (typeof caches !== 'undefined') for (const name of await caches.keys()) await caches.delete(name)
  await unregisterWorkers()
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    // Сховище недоступне — нічого стирати.
  }
  location.reload()
}
