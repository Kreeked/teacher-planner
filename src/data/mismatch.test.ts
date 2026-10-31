import { describe, expect, it } from 'vitest'
import type { LessonSchedule } from './types'
import { classWeekdays, courseIssues, dateProblem, nearestDay, planFixes, type ScheduleData } from './mismatch'

const meta = { owner_id: 'u' }
const data: ScheduleData = {
  timetables: [{ ...meta, id: 'T', academic_year_id: 'Y', title: 'Розклад', valid_from: '2025-09-01', valid_to: '2026-05-31' }],
  entries: [
    { ...meta, id: 'e1', timetable_id: 'T', weekday: 2, slot_number: 3, class_group_id: 'A', course_id: 'C' },
    { ...meta, id: 'e2', timetable_id: 'T', weekday: 5, slot_number: 1, class_group_id: 'A', course_id: 'C' },
  ],
  daysOff: [{ ...meta, id: 'd', academic_year_id: 'Y', title: 'Канікули', start_date: '2025-10-27', end_date: '2025-11-02' }],
}

describe('dateProblem', () => {
  it('accepts a day that is in the class schedule', () => {
    expect(dateProblem('2025-09-02', 'A', 'C', data)).toBeNull() // вівторок
  })
  it('flags a weekday without a lesson', () => {
    expect(dateProblem('2025-09-03', 'A', 'C', data)).toBe('weekday') // середа
  })
  it('flags days off before anything else', () => {
    expect(dateProblem('2025-10-28', 'A', 'C', data)).toBe('day-off')
  })
  it('flags a class or course missing from the schedule', () => {
    expect(dateProblem('2025-09-02', 'B', 'C', data)).toBe('no-schedule')
    expect(dateProblem('2025-09-02', 'A', null, data)).toBe('no-schedule')
  })
})

describe('classWeekdays', () => {
  it('lists the days of the class, sorted', () => {
    expect(classWeekdays(data, 'A', 'C', '2025-09-02')).toEqual([2, 5])
  })
})

const sch = (lesson: string, date: string, cls = 'A'): LessonSchedule => ({
  ...meta,
  id: `${lesson}_${cls}`,
  course_id: 'C',
  lesson_id: lesson,
  class_group_id: cls,
  planned_date: date,
  actual_date: null,
  status: 'planned',
  note: '',
})
const bounds = { start: '2025-09-01', end: '2026-05-31' }

describe('courseIssues', () => {
  it('flags only mismatching dates from the given day', () => {
    const list = [sch('1', '2025-09-02'), sch('2', '2025-09-03'), sch('3', '2025-09-10')]
    const issues = courseIssues(list, 'C', data, '2025-09-04')
    expect(issues.map((i) => [i.lessonId, i.problem])).toEqual([['3', 'weekday']])
  })
  it('flags two lessons on a day that has one cell', () => {
    const list = [sch('1', '2025-09-09'), sch('2', '2025-09-09')]
    expect(courseIssues(list, 'C', data, '2025-09-01').map((i) => i.problem)).toEqual(['overbooked', 'overbooked'])
  })
})

describe('nearestDay', () => {
  it('finds the closest scheduled weekday, preferring the later one on a tie', () => {
    // середа 03.09: вівторок 02.09 і п'ятниця 05.09 — 1 і 2 дні
    expect(nearestDay('2025-09-03', 'A', 'C', data, bounds, () => 0)).toBe('2025-09-02')
    // субота 06.09: п'ятниця 05.09 за день
    expect(nearestDay('2025-09-06', 'A', 'C', data, bounds, () => 0)).toBe('2025-09-05')
  })
  it('skips days off and busy cells', () => {
    expect(nearestDay('2025-10-30', 'A', 'C', data, bounds, () => 0)).toBe('2025-11-04')
    expect(nearestDay('2025-09-03', 'A', 'C', data, bounds, (day) => (day === '2025-09-02' ? 1 : 0))).toBe('2025-09-05')
  })
})

describe('planFixes', () => {
  it('does not put two lessons on the same free cell', () => {
    const list = [sch('1', '2025-09-03'), sch('2', '2025-09-04')]
    const issues = courseIssues(list, 'C', data, '2025-09-01')
    const fixes = planFixes(issues, list, 'C', data, bounds)
    expect(new Set([...fixes.values()]).size).toBe(2)
  })
})
