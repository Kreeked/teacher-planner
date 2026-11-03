import { courseIssues, scheduleRanges } from './mismatch'
import { followSemesters } from './timetable'
import type { AcademicYear, DayOff, ISODate, LessonSchedule, Period, Timetable, TimetableEntry } from './types'

/** Налаштування року, від яких залежать дати КТП. */
export type YearSetup = {
  year: Pick<AcademicYear, 'start_date' | 'end_date'>
  periods: Period[]
  daysOff: DayOff[]
  timetables: Timetable[] // як у базі: дати семестрових розкладів ще не підтягнуто
  entries: TimetableEntry[]
}

/** Що змінюється: підміна списків (видалене просто не входить у новий список). */
export type SetupChange = Partial<Pick<YearSetup, 'periods' | 'daysOff' | 'timetables' | 'entries'>>

function issueIds(setup: YearSetup, courseIds: string[], schedules: LessonSchedule[], from: ISODate) {
  const timetables = followSemesters(setup.timetables, setup.periods)
  const data = {
    timetables,
    entries: setup.entries.filter((e) => timetables.some((t) => t.id === e.timetable_id)),
    daysOff: setup.daysOff,
    ranges: scheduleRanges(setup.periods, setup.year),
  }
  return new Set(courseIds.flatMap((id) => courseIssues(schedules, id, data, from).map((i) => i.id)))
}

/**
 * Скільки майбутніх дат уроків перестане збігатися з розкладом через зміну: поза семестром, у день без уроків,
 * без розкладу. Дати, що були неправильними й раніше, не рахуються. Самі дати зміна не чіпає.
 */
export function datesAtRisk(setup: YearSetup, change: SetupChange, courseIds: string[], schedules: LessonSchedule[], from: ISODate) {
  const before = issueIds(setup, courseIds, schedules, from)
  const after = issueIds({ ...setup, ...change }, courseIds, schedules, from)
  return [...after].filter((id) => !before.has(id)).length
}
