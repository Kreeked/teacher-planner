import { weekday } from './schedule'
import type { BellSlot, ISODate, Timetable, TimetableEntry } from './types'

export const DEFAULT_BELLS = {
  first_start: '08:30',
  lesson_minutes: 45,
  count: 7,
  breaks: [10, 10, 20, 20, 10, 10, 10],
}

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function toTime(min: number) {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function minutesBetween(a: string, b: string) {
  return toMinutes(b) - toMinutes(a)
}

export function shiftTime(t: string, minutes: number) {
  return toTime(toMinutes(t) + minutes)
}

/** Час усіх дзвінків з початку дня, тривалості уроку й перерв після кожного уроку. */
export function computeBells(firstStart: string, lessonMinutes: number, breaks: number[]): BellSlot[] {
  let t = toMinutes(firstStart)
  return breaks.map((b, i) => {
    const slot = { number: i + 1, start: toTime(t), end: toTime(t + lessonMinutes), break_after: b }
    t += lessonMinutes + b
    return slot
  })
}

/** Помилка в дзвінках (уроки мають іти по черзі й не перетинатися) або null. */
export function validateBells(slots: BellSlot[]): string | null {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    if (toMinutes(s.end) <= toMinutes(s.start)) return `Урок ${s.number} закінчується раніше, ніж починається`
    const next = slots[i + 1]
    if (next && toMinutes(next.start) < toMinutes(s.end))
      return `Урок ${next.number} починається до кінця уроку ${s.number}`
  }
  return null
}

/** Шаблон, що діє в цей день. */
export function timetableOn(timetables: Timetable[], date: ISODate) {
  return timetables.find((t) => t.valid_from <= date && date <= t.valid_to)
}

/** Помилка періоду дії шаблону: у межах року і без перетину з іншими шаблонами. */
export function validateTimetable(t: Pick<Timetable, 'id' | 'valid_from' | 'valid_to'>, year: Range, all: Timetable[]) {
  if (!t.valid_from || !t.valid_to || t.valid_from > t.valid_to) return 'Початок має бути раніше за кінець'
  if (t.valid_from < year.start_date || t.valid_to > year.end_date) return 'Розклад має діяти в межах навчального року'
  const other = all.find((x) => x.id !== t.id && x.valid_from <= t.valid_to && t.valid_from <= x.valid_to)
  return other ? `Перетинається з «${other.title}»` : null
}

type Range = { start_date: ISODate; end_date: ISODate }

/**
 * Номери уроків у дні для записів «клас × КТП» цього дня: здвоєний урок дає два номери.
 * Ключ — `${class_group_id}_${course_id}`, номери по зростанню.
 */
export function slotsOn(entries: TimetableEntry[], timetable: Timetable | undefined, date: ISODate) {
  const map = new Map<string, number[]>()
  if (!timetable) return map
  const day = weekday(date)
  for (const e of entries) {
    if (e.timetable_id !== timetable.id || e.weekday !== day) continue
    const key = `${e.class_group_id}_${e.course_id}`
    map.set(
      key,
      [...(map.get(key) ?? []), e.slot_number].sort((a, b) => a - b),
    )
  }
  return map
}

/** Дні тижня уроків класу за КТП з шаблону, з повтором для здвоєних уроків: [1, 3, 3]. */
export function weekdaysFor(entries: TimetableEntry[], timetableId: string, classId: string, courseId: string) {
  return entries
    .filter((e) => e.timetable_id === timetableId && e.class_group_id === classId && e.course_id === courseId)
    .map((e) => e.weekday)
    .sort((a, b) => a - b)
}

/** Скільки уроків класу за КТП у цей день за чинним шаблоном (для автодат). */
export function lessonsPerDay(timetables: Timetable[], entries: TimetableEntry[], classId: string, courseId: string) {
  return (date: ISODate) => {
    const t = timetableOn(timetables, date)
    return t ? weekdaysFor(entries, t.id, classId, courseId).filter((w) => w === weekday(date)).length : 0
  }
}
