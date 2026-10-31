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

/** Класи, яким у семестрі з номером `index` потрібні уроки (годин більше нуля), і ті з них, що вже стоять у його розкладі. */
function semesterClasses(p: Schedule, index: number) {
  const semester = semesters(p.periods)[index]
  const tt = semester && semesterTimetable(p.timetables, semester)
  const placed = new Set((tt ? p.entries.filter((e) => e.timetable_id === tt.id) : []).map((e) => e.class_group_id))
  const need = new Set(
    p.links
      .filter((l) => {
        const course = p.courses.find((c) => c.id === l.course_id)
        return course && semesterHours(course, index) > 0
      })
      .map((l) => l.class_group_id),
  )
  const needed = p.classes.filter((c) => need.has(c.id)).sort((a, b) => a.grade - b.grade || a.letter.localeCompare(b.letter, 'uk'))
  return { needed, placed }
}

/** Класи, яких немає в розкладі семестру `index`, хоча уроки в ньому їм потрібні. */
export function unplacedClasses(p: Schedule, index: number) {
  const { needed, placed } = semesterClasses(p, index)
  return needed.filter((c) => !placed.has(c.id))
}

/** Семестри, у яких розклад порожній, хоча комусь із класів потрібні уроки. */
export function emptySemesters(p: Schedule) {
  return semesters(p.periods).filter((_, index) => {
    const { needed, placed } = semesterClasses(p, index)
    return needed.length > 0 && placed.size === 0
  })
}
