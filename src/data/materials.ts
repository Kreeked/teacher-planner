import { courseTitle } from './ktp'
import type { AcademicYear, Course, Lesson, LessonMaterial, Topic } from './types'

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
