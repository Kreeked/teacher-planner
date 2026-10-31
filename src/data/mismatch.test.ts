import { describe, expect, it } from 'vitest'
import { classWeekdays, dateProblem, type ScheduleData } from './mismatch'

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
