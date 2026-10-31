import type { ClassGroup, Course, CourseClass, Period, Timetable, TimetableEntry } from './types'
import { sortPeriods } from './year'

/** Семестри року по порядку: у кожного свій тижневий розклад. */
export function semesters(periods: Period[]) {
  return sortPeriods(periods.filter((p) => !p.parent_id))
}

/** Розклад семестру: шаблон, дати якого збігаються з датами семестру. */
export function semesterTimetable(timetables: Timetable[], sem: Pick<Period, 'start_date' | 'end_date'>) {
  return timetables.find((t) => t.valid_from === sem.start_date && t.valid_to === sem.end_date)
}

/** Годин на тиждень у семестрі: у першому — `hours_per_week`, у всіх наступних — `hours_per_week_2` (немає — як у першому). */
export function semesterHours(course: Pick<Course, 'hours_per_week' | 'hours_per_week_2'>, index: number) {
  return index === 0 ? course.hours_per_week : (course.hours_per_week_2 ?? course.hours_per_week)
}

/** Скільки разів на тиждень клас з цим КТП уже стоїть у розкладі (обох змін); `except` — клітинка, яку зараз міняють. */
export function placedCount(entries: TimetableEntry[], classId: string, courseId: string, except?: string) {
  return entries.filter((e) => e.id !== except && e.class_group_id === classId && e.course_id === courseId).length
}

/** Семестри, де розклад не порожній, але в ньому немає частини класів, яким у цьому семестрі потрібні уроки. */
export function unscheduledBySemester(p: {
  periods: Period[]
  timetables: Timetable[]
  entries: TimetableEntry[]
  courses: Course[]
  classes: ClassGroup[]
  links: CourseClass[]
}) {
  const result: { semester: Period; classes: ClassGroup[] }[] = []
  semesters(p.periods).forEach((semester, index) => {
    const tt = semesterTimetable(p.timetables, semester)
    const own = tt ? p.entries.filter((e) => e.timetable_id === tt.id) : []
    // Порожній розклад семестру — свідомий вибір: його ще може не бути.
    if (!own.length) return
    const placed = new Set(own.map((e) => e.class_group_id))
    const need = new Set(
      p.links
        .filter((l) => {
          const course = p.courses.find((c) => c.id === l.course_id)
          return course && semesterHours(course, index) > 0
        })
        .map((l) => l.class_group_id),
    )
    const missing = p.classes
      .filter((c) => need.has(c.id) && !placed.has(c.id))
      .sort((a, b) => a.grade - b.grade || a.letter.localeCompare(b.letter, 'uk'))
    if (missing.length) result.push({ semester, classes: missing })
  })
  return result
}
