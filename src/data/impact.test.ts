import { describe, expect, it } from 'vitest'
import { datesAtRisk, type YearSetup } from './impact'
import type { DayOff, LessonSchedule, Period, Timetable, TimetableEntry } from './types'

const sem = { id: 's1', parent_id: null, start_date: '2026-09-01', end_date: '2026-12-19' } as Period
const tt = { id: 'T', period_id: 's1', valid_from: '2026-09-01', valid_to: '2026-12-19' } as Timetable
// вівторок
const cell = { id: 'E', timetable_id: 'T', weekday: 2, slot_number: 1, class_group_id: 'A', course_id: 'C' } as TimetableEntry
const setup: YearSetup = {
  year: { start_date: '2026-09-01', end_date: '2027-06-30' },
  periods: [sem],
  daysOff: [],
  timetables: [tt],
  entries: [cell],
}
const lesson = (id: string, planned_date: string) => ({ id: `${id}_A`, course_id: 'C', lesson_id: id, class_group_id: 'A', planned_date, status: 'planned' }) as LessonSchedule
// вівторки: 08.09 і 15.12
const dates = [lesson('1', '2026-09-08'), lesson('2', '2026-12-15')]

describe('datesAtRisk', () => {
  it('нічого не змінилося — ризику немає', () => {
    expect(datesAtRisk(setup, {}, ['C'], dates, '2026-09-01')).toBe(0)
  })

  it('семестр коротшає: дата за новим кінцем опиняється поза семестром', () => {
    const shorter = [{ ...sem, end_date: '2026-12-01' }]
    expect(datesAtRisk(setup, { periods: shorter }, ['C'], dates, '2026-09-01')).toBe(1)
  })

  it('новий день без уроків накриває дату', () => {
    const off = [{ id: 'D', start_date: '2026-12-14', end_date: '2026-12-16' } as DayOff]
    expect(datesAtRisk(setup, { daysOff: off }, ['C'], dates, '2026-09-01')).toBe(1)
  })

  it('видалення семестру разом з розкладом: усі майбутні дати без розкладу', () => {
    expect(datesAtRisk(setup, { timetables: [], entries: [] }, ['C'], dates, '2026-09-01')).toBe(2)
  })

  it('минулі дати не рахуються, раніше неправильні теж', () => {
    expect(datesAtRisk(setup, { timetables: [], entries: [] }, ['C'], dates, '2026-10-01')).toBe(1)
    const bad = [lesson('3', '2026-09-09')] // середа: уже не збігається
    expect(datesAtRisk(setup, { timetables: [], entries: [] }, ['C'], bad, '2026-09-01')).toBe(0)
  })
})
