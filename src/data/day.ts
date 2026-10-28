import { addDays, weekday } from './schedule'
import { slotsOn, timetableOn } from './timetable'
import type {
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
      const slot = slots.get(key)?.[i] ?? null
      const bell = d.bells
        .find((b) => b.academic_year_id === x.course.academic_year_id)
        ?.slots.find((b) => b.number === slot)
      return { ...x, slot, bell }
    })
    .sort(
      (a, b) =>
        (a.slot ?? 99) - (b.slot ?? 99) ||
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
