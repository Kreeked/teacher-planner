import type { CollectionName } from './types'

type Doc = Record<string, unknown>
type Store = Partial<Record<CollectionName, Record<string, Doc>>>

/**
 * Чернетка початкового налаштування. Поки користувач проходить кроки, нічого не потрапляє у Firestore:
 * документи лежать тут (і в localStorage цього пристрою) і записуються в базу одним разом на «Почати роботу».
 */
const storageKey = (uid: string) => `planner.draft.${uid}`

let store: Store | null = null
let persistKey: string | null = null
let version = 0
const listeners = new Set<() => void>()

function notify() {
  version++
  listeners.forEach((f) => f())
}

function persist() {
  if (!persistKey || !store) return
  try {
    localStorage.setItem(persistKey, JSON.stringify(store))
  } catch {
    // Сховище недоступне: чернетка житиме, доки відкрита вкладка.
  }
}

/** Чи лишилась на цьому пристрої незавершена чернетка. */
export function hasDraft(uid: string): boolean {
  try {
    return localStorage.getItem(storageKey(uid)) !== null
  } catch {
    return false
  }
}

/** Вмикає режим чернетки: усі записи йдуть у неї, а читання бачить її поверх бази. */
export function startDraft(uid: string) {
  persistKey = storageKey(uid)
  try {
    const raw = localStorage.getItem(persistKey)
    store = raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    store = {}
  }
  notify()
}

/** Вимикає режим чернетки, не стираючи її. */
export function stopDraft() {
  store = null
  persistKey = null
  notify()
}

/** Стирає збережену чернетку (після запису в базу чи відмови від налаштування). */
export function discardDraft(uid: string) {
  try {
    localStorage.removeItem(storageKey(uid))
  } catch {
    // нічого
  }
}

export function isDraft() {
  return store !== null
}

export function draftDocs(name: CollectionName): ({ id: string } & Doc)[] {
  return Object.entries(store?.[name] ?? {}).map(([id, d]) => ({ ...d, id }))
}

export function putDraft(name: CollectionName, id: string, data: Doc) {
  if (!store) return
  store[name] = { ...store[name], [id]: data }
  persist()
  notify()
}

export function patchDraft(name: CollectionName, id: string, patch: Doc) {
  const cur = store?.[name]?.[id]
  if (!store || !cur) return
  store[name] = { ...store[name], [id]: { ...cur, ...patch } }
  persist()
  notify()
}

export function dropDraft(name: CollectionName, id: string) {
  if (!store?.[name]?.[id]) return
  const { [id]: _, ...rest } = store[name]!
  store[name] = rest
  persist()
  notify()
}

/** Усі документи чернетки: що саме записати в базу. */
export function draftEntries(): [CollectionName, string, Doc][] {
  return (Object.entries(store ?? {}) as [CollectionName, Record<string, Doc>][]).flatMap(([name, docs]) =>
    Object.entries(docs).map(([id, d]) => [name, id, d] as [CollectionName, string, Doc]),
  )
}

export function subscribeDraft(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function draftVersion() {
  return version
}
