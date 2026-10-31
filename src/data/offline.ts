import { materialsOf } from './materials'
import { addDays } from './schedule'
import type { ISODate, Lesson, LessonMaterial, LessonSchedule } from './types'

/** Скільки днів наперед тримати файли уроків на пристрої (сьогодні включно). */
export const OFFLINE_DAYS = 7
export const OFFLINE_LIMIT = 2 * 1024 * 1024 * 1024

/** Файл, який варто мати офлайн: date — найближчий урок з ним, null — позначено «завжди офлайн». */
export type OfflineItem = { material: LessonMaterial; date: ISODate | null }

export type OfflinePlan = {
  keep: OfflineItem[] // вміщаються в ліміт
  over: OfflineItem[] // не вмістилися
  bytes: number
}

const isFile = (m: LessonMaterial) => m.kind === 'file' && !!m.drive_file_id

/**
 * Які файли зберігати на пристрої: спершу «завжди офлайн», далі файли уроків
 * на найближчі дні в порядку дат. Один файл Диска береться один раз.
 * sizes — справжні розміри вже збережених копій (для файлів Google Docs розмір наперед невідомий).
 */
export function offlinePlan(
  materials: LessonMaterial[],
  schedules: LessonSchedule[],
  lessons: Lesson[],
  today: ISODate,
  sizes: Map<string, number> = new Map(),
): OfflinePlan {
  const items: OfflineItem[] = materials
    .filter((m) => m.keep_offline && isFile(m))
    .map((m) => ({ material: m, date: null }))

  const end = addDays(today, OFFLINE_DAYS - 1)
  const upcoming = schedules
    .filter((s) => s.planned_date && s.planned_date >= today && s.planned_date <= end)
    .sort((a, b) => a.planned_date!.localeCompare(b.planned_date!))
  for (const s of upcoming) {
    const lesson = lessons.find((l) => l.id === s.lesson_id)
    if (!lesson) continue
    const { own, topic } = materialsOf(materials, lesson)
    for (const m of [...own, ...topic]) if (isFile(m)) items.push({ material: m, date: s.planned_date })
  }

  const seen = new Set<string>()
  const plan: OfflinePlan = { keep: [], over: [], bytes: 0 }
  for (const item of items) {
    const id = item.material.drive_file_id!
    if (seen.has(id)) continue
    seen.add(id)
    const size = sizes.get(id) ?? item.material.size_bytes ?? 0
    if (plan.bytes + size > OFFLINE_LIMIT) plan.over.push(item)
    else {
      plan.keep.push(item)
      plan.bytes += size
    }
  }
  return plan
}
