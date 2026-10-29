import { courseTitle } from './ktp'
import type { AcademicYear, Course, Lesson, LessonMaterial, MaterialCategory, Topic } from './types'

/** Папка на Диску: Планер / 2026–2027 / Інформатика, 9 клас / Урок 5 (або Тема …). */
export function driveFolder(
  year: AcademicYear | undefined,
  course: Course,
  target: { lesson?: Lesson; topic?: Topic },
) {
  const clean = (s: string) => s.replace(/[/\\]/g, '–').trim()
  const last = target.lesson
    ? target.lesson.extra
      ? `Урок * ${target.lesson.title}`.slice(0, 60)
      : `Урок ${target.lesson.number}`
    : `Тема. ${target.topic?.title ?? ''}`.slice(0, 80)
  return ['Планер', clean(year?.title ?? 'Без року'), clean(courseTitle(course)), clean(last)]
}

/** Матеріали уроку: спершу власні, потім спільні для всієї теми. */
export function materialsOf(all: LessonMaterial[], lesson: Lesson) {
  const sort = (xs: LessonMaterial[]) => [...xs].sort((a, b) => a.position - b.position)
  return {
    own: sort(all.filter((m) => m.lesson_id === lesson.id)),
    topic: sort(all.filter((m) => m.topic_id === lesson.topic_id && !m.lesson_id)),
  }
}

// ---------- Типи файлів уроку («полички») ----------

export const CATEGORIES: { value: MaterialCategory; label: string; short: string }[] = [
  { value: 'slides', label: 'Презентація до уроку', short: 'Презентація' },
  { value: 'card', label: 'Інструкційна картка', short: 'Картка' },
  { value: 'shelter', label: 'Завдання для укриття', short: 'Укриття' },
  { value: 'remote', label: 'Дистанційне завдання', short: 'Дистанційно' },
  { value: 'test', label: 'Тест', short: 'Тест' },
]

/** Ключ розділу: категорія або «none» — «Без типу». */
export type Shelf = MaterialCategory | 'none'

export const SHELVES: Shelf[] = [...CATEGORIES.map((c) => c.value), 'none']

export type Shelves = Record<Shelf, LessonMaterial[]>

export const shelfOf = (m: Pick<LessonMaterial, 'category'>): Shelf => m.category ?? 'none'

/** Власні матеріали уроку, розкладені по категоріях; у кожній — за position. */
export function groupByCategory(own: LessonMaterial[]): Shelves {
  const groups = Object.fromEntries(SHELVES.map((k) => [k, []])) as unknown as Shelves
  for (const m of own) (groups[shelfOf(m)] ?? groups.none).push(m)
  for (const list of Object.values(groups)) list.sort((a, b) => a.position - b.position)
  return groups
}

/** Заповнені полички уроку в порядку типів; «Без типу» — наприкінці. Порожні не показуються. */
export function filledShelves(own: LessonMaterial[]) {
  const groups = groupByCategory(own)
  return SHELVES.filter((s) => groups[s].length).map((s) => ({ shelf: s, files: groups[s] }))
}

/**
 * Одноразова класифікація старих файлів уроків (без поля category):
 * презентації → «slides», решта → null («Без типу», розкласти вручну).
 * Позиція ставиться в кінець розділу, щоб не змішатися з уже розкладеними.
 */
export function classifyLegacy(
  all: LessonMaterial[],
): { id: string; category: MaterialCategory | null; position: number }[] {
  const next = new Map<string, number>()
  const key = (lessonId: string, shelf: Shelf) => `${lessonId}|${shelf}`
  for (const m of all)
    if (m.lesson_id && m.category !== undefined) {
      const k = key(m.lesson_id, shelfOf(m))
      next.set(k, Math.max(next.get(k) ?? 0, m.position + 1))
    }
  const out: { id: string; category: MaterialCategory | null; position: number }[] = []
  const legacy = all.filter((m) => m.lesson_id && m.category === undefined).sort((a, b) => a.position - b.position)
  for (const m of legacy) {
    const category = materialType(m) === 'slides' ? 'slides' : null
    const k = key(m.lesson_id!, category ?? 'none')
    const position = next.get(k) ?? 0
    next.set(k, position + 1)
    out.push({ id: m.id, category, position })
  }
  return out
}

/** Ставить матеріал у розділ to на місце index (з будь-якого розділу, зокрема того самого). */
export function placeMaterial(groups: Shelves, id: string, to: Shelf, index: number): Shelves {
  const from = (Object.keys(groups) as Shelf[]).find((k) => groups[k].some((m) => m.id === id))
  if (!from) return groups
  const moved = groups[from].find((m) => m.id === id)!
  const next = { ...groups, [from]: groups[from].filter((m) => m.id !== id) }
  const target = [...next[to]]
  target.splice(Math.max(0, Math.min(index, target.length)), 0, moved)
  next[to] = target
  return next
}

/** Що записати після перетягування: нові category/position лише для тих, у кого вони змінилися. */
export function shelfPatches(groups: Shelves) {
  const out: { id: string; category: MaterialCategory | null; position: number }[] = []
  for (const shelf of Object.keys(groups) as Shelf[])
    groups[shelf].forEach((m, i) => {
      if (m.position !== i || shelfOf(m) !== shelf || m.category === undefined)
        out.push({ id: m.id, category: shelf === 'none' ? null : shelf, position: i })
    })
  return out
}

/** Посилання з тексту: додає https://, якщо його немає; null — не схоже на адресу. */
export function normalizeUrl(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(url)
    return u.hostname.includes('.') && /^https?:$/.test(u.protocol) ? u.href : null
  } catch {
    return null
  }
}

/** Назва посилання за замовчуванням: домен без www. */
export function linkTitle(url: string) {
  return new URL(url).hostname.replace(/^www\./, '')
}

export type MaterialType = 'slides' | 'doc' | 'sheet' | 'pdf' | 'image' | 'video' | 'link' | 'file'

export function materialType(m: Pick<LessonMaterial, 'kind' | 'mime_type' | 'title'>): MaterialType {
  if (m.kind === 'link') return 'link'
  const t = (m.mime_type ?? '').toLowerCase()
  const name = m.title.toLowerCase()
  if (t.includes('presentation') || /\.(pptx?|odp|key)$/.test(name)) return 'slides'
  if (t.includes('spreadsheet') || /\.(xlsx?|ods|csv)$/.test(name)) return 'sheet'
  if (t === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  if (t.includes('document') || t.includes('msword') || /\.(docx?|odt|rtf|txt)$/.test(name)) return 'doc'
  return 'file'
}

export function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} МБ`
  return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`
}

/** Посилання для перегляду файлу (на телефоні відкриває застосунок Диска). */
export function driveViewUrl(id: string) {
  return `https://drive.google.com/file/d/${id}/view`
}

/** Куди веде матеріал: посилання або перегляд файлу на Диску. */
export function materialUrl(m: LessonMaterial) {
  return m.kind === 'link' ? (m.url ?? '') : (m.url ?? driveViewUrl(m.drive_file_id ?? ''))
}
