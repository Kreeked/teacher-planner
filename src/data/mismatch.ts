import { addDays, weekday } from './schedule'
import { timetableOn } from './timetable'
import type { DayOff, ISODate, LessonSchedule, Timetable, TimetableEntry } from './types'

export type ScheduleData = { timetables: Timetable[]; entries: TimetableEntry[]; daysOff: DayOff[] }

// no-schedule — у розкладі немає цього класу з цим КТП; weekday — у цей день тижня уроку немає; day-off — день без уроків;
// overbooked — на цю дату в КТП більше уроків класу, ніж клітинок у розкладі.
export type DateProblem = 'no-schedule' | 'weekday' | 'day-off' | 'overbooked'

function cells(d: ScheduleData, classId: string, courseId: string | null, date: ISODate) {
  const tt = timetableOn(d.timetables, date)
  if (!tt || !courseId) return []
  return d.entries.filter((e) => e.timetable_id === tt.id && e.class_group_id === classId && e.course_id === courseId)
}

/** Клітинки розкладу класу з цим КТП у день дати: стільки уроків у нього цього дня. */
export function cellsOn(d: ScheduleData, classId: string, courseId: string, date: ISODate) {
  return cells(d, classId, courseId, date).filter((e) => e.weekday === weekday(date))
}

/** Чим дата уроку класу не збігається з розкладом; null — усе гаразд. */
export function dateProblem(date: ISODate, classId: string, courseId: string | null, d: ScheduleData): DateProblem | null {
  if (d.daysOff.some((x) => x.start_date <= date && date <= x.end_date)) return 'day-off'
  const own = cells(d, classId, courseId, date)
  if (own.length === 0) return 'no-schedule'
  return own.some((e) => e.weekday === weekday(date)) ? null : 'weekday'
}

/** Дні тижня, в які клас має уроки цього КТП (за розкладом, чинним у дату). */
export function classWeekdays(d: ScheduleData, classId: string, courseId: string | null, date: ISODate) {
  return [...new Set(cells(d, classId, courseId, date).map((e) => e.weekday))].sort((a, b) => a - b)
}

export const PROBLEM_TEXT: Record<DateProblem, string> = {
  'no-schedule': 'Цього класу з цим КТП немає в розкладі',
  weekday: 'У цей день тижня за розкладом уроку немає',
  'day-off': 'День без уроків',
  overbooked: 'На цей день уроків у КТП більше, ніж у розкладі',
}

export type DateIssue = { id: string; lessonId: string; classId: string; date: ISODate; problem: DateProblem }

/**
 * Дати КТП, що не збігаються з розкладом. Лише від дня from: уроки, що минули, вже відбулися,
 * і пізніша зміна розкладу їх не стосується.
 */
export function courseIssues(schedules: LessonSchedule[], courseId: string, d: ScheduleData, from: ISODate): DateIssue[] {
  const dated = schedules.filter((s) => s.course_id === courseId && s.planned_date && s.status !== 'cancelled')
  const perDay = new Map<string, number>()
  for (const s of dated) {
    const k = `${s.class_group_id}|${s.planned_date}`
    perDay.set(k, (perDay.get(k) ?? 0) + 1)
  }
  const issues: DateIssue[] = []
  for (const s of dated) {
    const date = s.planned_date as ISODate
    if (date < from) continue
    let problem = dateProblem(date, s.class_group_id, courseId, d)
    if (!problem && (perDay.get(`${s.class_group_id}|${date}`) ?? 0) > cellsOn(d, s.class_group_id, courseId, date).length)
      problem = 'overbooked'
    if (problem) issues.push({ id: s.id, lessonId: s.lesson_id, classId: s.class_group_id, date, problem })
  }
  return issues
}

/** Найближчий день за розкладом класу в межах bounds, де ще є вільна клітинка; null — такого немає поруч. */
export function nearestDay(
  date: ISODate,
  classId: string,
  courseId: string,
  d: ScheduleData,
  bounds: { start: ISODate; end: ISODate },
  used: (day: ISODate) => number,
): ISODate | null {
  for (let i = 1; i <= 21; i++)
    for (const sign of [1, -1]) {
      const day = addDays(date, sign * i)
      if (day < bounds.start || day > bounds.end) continue
      if (dateProblem(day, classId, courseId, d)) continue
      if (used(day) >= cellsOn(d, classId, courseId, day).length) continue
      return day
    }
  return null
}

/** Куди перенести кожну дату з issues; null — немає куди. Зайняті клітинки враховуються, тож дві дати не лягають в одну. */
export function planFixes(
  issues: DateIssue[],
  schedules: LessonSchedule[],
  courseId: string,
  d: ScheduleData,
  bounds: { start: ISODate; end: ISODate },
): Map<string, ISODate | null> {
  const used = new Map<string, number>()
  const key = (classId: string, day: ISODate) => `${classId}|${day}`
  const moving = new Set(issues.map((i) => i.id))
  for (const s of schedules)
    if (s.course_id === courseId && s.planned_date && !moving.has(s.id))
      used.set(key(s.class_group_id, s.planned_date), (used.get(key(s.class_group_id, s.planned_date)) ?? 0) + 1)
  const fixes = new Map<string, ISODate | null>()
  for (const i of [...issues].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = nearestDay(i.date, i.classId, courseId, d, bounds, (x) => used.get(key(i.classId, x)) ?? 0)
    fixes.set(i.id, day)
    if (day) used.set(key(i.classId, day), (used.get(key(i.classId, day)) ?? 0) + 1)
  }
  return fixes
}
