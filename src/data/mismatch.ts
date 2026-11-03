import { weekday } from './schedule'
import { timetableOn } from './timetable'
import type { AcademicYear, DayOff, ISODate, LessonSchedule, Period, Timetable, TimetableEntry } from './types'

export type DateRange = { start: ISODate; end: ISODate }

// ranges — семестри (або рік, якщо семестрів немає): уроків поза ними бути не може. Не задано — межі не перевіряються.
export type ScheduleData = { timetables: Timetable[]; entries: TimetableEntry[]; daysOff: DayOff[]; ranges?: DateRange[] }

/** Межі, в яких можливі уроки: семестри з обома датами, а без них — увесь рік. */
export function scheduleRanges(periods: Pick<Period, 'parent_id' | 'start_date' | 'end_date'>[], year: Pick<AcademicYear, 'start_date' | 'end_date'>): DateRange[] {
  const sems = periods.filter((p) => !p.parent_id && p.start_date && p.end_date).map((p) => ({ start: p.start_date, end: p.end_date }))
  return sems.length ? sems : [{ start: year.start_date, end: year.end_date }]
}

// no-schedule — у розкладі немає цього класу з цим КТП; weekday — у цей день тижня уроку немає; day-off — день без уроків;
// overbooked — на цю дату в КТП більше уроків класу, ніж клітинок у розкладі; out-of-range — дата поза семестрами.
export type DateProblem = 'no-schedule' | 'weekday' | 'day-off' | 'overbooked' | 'out-of-range'

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
  if (d.ranges?.length && !d.ranges.some((r) => r.start <= date && date <= r.end)) return 'out-of-range'
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
  'out-of-range': 'Дата поза семестром',
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
