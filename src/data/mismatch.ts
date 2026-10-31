import { weekday } from './schedule'
import { timetableOn } from './timetable'
import type { DayOff, ISODate, Timetable, TimetableEntry } from './types'

export type ScheduleData = { timetables: Timetable[]; entries: TimetableEntry[]; daysOff: DayOff[] }

// no-schedule — у розкладі немає цього класу з цим КТП; weekday — у цей день тижня уроку немає; day-off — день без уроків.
export type DateProblem = 'no-schedule' | 'weekday' | 'day-off'

function cells(d: ScheduleData, classId: string, courseId: string | null, date: ISODate) {
  const tt = timetableOn(d.timetables, date)
  if (!tt || !courseId) return []
  return d.entries.filter((e) => e.timetable_id === tt.id && e.class_group_id === classId && e.course_id === courseId)
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
