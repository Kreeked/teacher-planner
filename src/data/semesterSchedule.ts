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

type Schedule = {
  periods: Period[]
  timetables: Timetable[]
  entries: TimetableEntry[]
  courses: Course[]
  classes: ClassGroup[]
  links: CourseClass[]
}

/** Записи розкладу семестру з номером `index`. */
function semesterEntries(p: Schedule, index: number) {
  const semester = semesters(p.periods)[index]
  const tt = semester && semesterTimetable(p.timetables, semester)
  return tt ? p.entries.filter((e) => e.timetable_id === tt.id) : []
}

/** Класи, яким у семестрі `index` не вистачає уроків у розкладі: поставлено менше, ніж годин на тиждень у їхньому КТП. */
export function unplacedClasses(p: Schedule, index: number) {
  const own = semesterEntries(p, index)
  const short = new Set<string>()
  for (const l of p.links) {
    const course = p.courses.find((c) => c.id === l.course_id)
    if (course && placedCount(own, l.class_group_id, l.course_id) < semesterHours(course, index)) short.add(l.class_group_id)
  }
  return p.classes.filter((c) => short.has(c.id)).sort((a, b) => a.grade - b.grade || a.letter.localeCompare(b.letter, 'uk'))
}

/**
 * Розклад можна завершувати, коли в І семестрі розставлено всі класи. Наступні семестри можна не додавати,
 * але додані мають бути розставлені так само повно.
 */
export function scheduleComplete(p: Schedule) {
  return semesters(p.periods).every((sem, i) => (i > 0 && !semesterTimetable(p.timetables, sem)) || unplacedClasses(p, i).length === 0)
}
