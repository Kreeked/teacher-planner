import { addDays, weekday } from './schedule'
import { shiftSlots, slotsOn, timetableOn, type Shift } from './timetable'
import type {
  AcademicYear,
  BellSchedule,
  BellSlot,
  ClassGroup,
  Course,
  ISODate,
  Lesson,
  LessonSchedule,
  Timetable,
  TimetableEntry,
} from './types'
import { pickCurrentYear } from './year'

export type DayData = {
  schedules: LessonSchedule[]
  lessons: Lesson[]
  courses: Course[]
  classes: ClassGroup[]
  timetables: Timetable[]
  entries: TimetableEntry[]
  bells: BellSchedule[]
}

export type DayLesson = {
  s: LessonSchedule
  lesson: Lesson
  course: Course
  cls: ClassGroup
  slot: number | null
  shift: Shift
  bell?: BellSlot
}

/**
 * Уроки дня в порядку розкладу. Номер уроку в дні береться з чинного тижневого шаблону;
 * здвоєний урок (два записи «клас × КТП» в один день) отримує номери по черзі.
 */
export function lessonsOfDay(day: ISODate, d: DayData): DayLesson[] {
  const items = d.schedules
    .filter((s) => s.planned_date === day)
    .flatMap((s) => {
      const lesson = d.lessons.find((l) => l.id === s.lesson_id)
      const course = d.courses.find((c) => c.id === s.course_id)
      const cls = d.classes.find((c) => c.id === s.class_group_id)
      return lesson && course && cls ? [{ s, lesson, course, cls }] : []
    })
    .sort((a, b) => a.lesson.number - b.lesson.number)

  const slots = slotsOn(d.entries, timetableOn(d.timetables, day), day)
  const taken = new Map<string, number>()
  return items
    .map((x) => {
      const key = `${x.s.class_group_id}_${x.s.course_id}`
      const i = taken.get(key) ?? 0
      taken.set(key, i + 1)
      const placed = slots.get(key)?.[i]
      const slot = placed?.slot ?? null
      const shift = placed?.shift ?? 1
      const bell = shiftSlots(
        d.bells.find((b) => b.academic_year_id === x.course.academic_year_id),
        shift,
      ).find((b) => b.number === slot)
      return { ...x, slot, shift, bell }
    })
    .sort(
      (a, b) =>
        (a.slot === null ? 1000 : a.shift * 100 + a.slot) - (b.slot === null ? 1000 : b.shift * 100 + b.slot) ||
        a.cls.grade - b.cls.grade ||
        a.cls.letter.localeCompare(b.cls.letter, 'uk') ||
        a.course.subject.localeCompare(b.course.subject, 'uk'),
    )
}

function minutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Який урок іде зараз і який наступний (за часом дзвінків). */
export function currentAndNext(list: DayLesson[], now: Date) {
  const t = now.getHours() * 60 + now.getMinutes()
  const timed = list.filter((x) => x.bell)
  const current = timed.find((x) => minutes(x.bell!.start) <= t && t < minutes(x.bell!.end))
  const next = timed.find((x) => minutes(x.bell!.start) > t)
  return { currentId: current?.s.id ?? null, nextId: next?.s.id ?? null }
}

/** Понеділок тижня, до якого належить дата. */
export function mondayOf(day: ISODate) {
  return addDays(day, 1 - weekday(day))
}

/** Розклад дзвінків для дня: року його уроків, а без уроків — року, до якого належить дата. */
export function bellsOfDay(day: ISODate, list: DayLesson[], bells: BellSchedule[], years: AcademicYear[]) {
  const yearId =
    list[0]?.course.academic_year_id ??
    (years.find((y) => y.start_date <= day && day <= y.end_date) ?? pickCurrentYear(years, day))?.id
  return bells.find((b) => b.academic_year_id === yearId) ?? null
}

/** Номер уроку, що йде в цей момент за дзвінками (під час перерви — null). */
export function slotAt(slots: BellSlot[], now: Date) {
  const t = now.getHours() * 60 + now.getMinutes()
  return slots.find((b) => minutes(b.start) <= t && t < minutes(b.end))?.number ?? null
}
