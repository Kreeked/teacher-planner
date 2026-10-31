import { describe, expect, it } from 'vitest'
import { placedCount, semesterHours, semesterTimetable, semesters, unscheduledBySemester } from './semesterSchedule'
import type { ClassGroup, Course, CourseClass, Period, Timetable, TimetableEntry } from './types'

const period = (id: string, position: number, start_date: string, end_date: string, parent_id: string | null = null) =>
  ({ id, position, start_date, end_date, parent_id, title: id }) as Period
const s1 = period('s1', 0, '2026-09-01', '2026-12-26')
const s2 = period('s2', 1, '2027-01-12', '2027-06-30')
const tt = (id: string, p: Period) => ({ id, valid_from: p.start_date, valid_to: p.end_date }) as Timetable
const entry = (id: string, timetable_id: string, class_group_id: string, course_id = 'k') =>
  ({ id, timetable_id, class_group_id, course_id }) as TimetableEntry
const cls = (id: string, grade: number, letter: string) => ({ id, grade, letter }) as ClassGroup
const course = (h1: number, h2?: number) => ({ id: 'k', hours_per_week: h1, hours_per_week_2: h2 }) as Course

describe('semesters', () => {
  it('лише семестри по порядку', () => {
    expect(semesters([s2, period('q', 0, '2026-09-01', '2026-10-01', 's1'), s1]).map((p) => p.id)).toEqual(['s1', 's2'])
  })

  it('розклад семестру знаходиться за датами', () => {
    expect(semesterTimetable([tt('a', s1), tt('b', s2)], s2)?.id).toBe('b')
    expect(semesterTimetable([tt('a', s1)], s2)).toBeUndefined()
  })
})

describe('semesterHours', () => {
  it('перший семестр і наступні', () => {
    expect(semesterHours(course(2, 1), 0)).toBe(2)
    expect(semesterHours(course(2, 1), 1)).toBe(1)
    expect(semesterHours(course(2, 1), 2)).toBe(1)
    expect(semesterHours(course(2), 1)).toBe(2)
  })
})

describe('placedCount', () => {
  it('рахує клас з КТП, окрім клітинки, яку міняють', () => {
    const e = [entry('1', 't', 'a'), entry('2', 't', 'a'), entry('3', 't', 'b')]
    expect(placedCount(e, 'a', 'k')).toBe(2)
    expect(placedCount(e, 'a', 'k', '1')).toBe(1)
  })
})

describe('unscheduledBySemester', () => {
  const base = {
    periods: [s1, s2],
    timetables: [tt('t1', s1), tt('t2', s2)],
    courses: [course(2, 1)],
    classes: [cls('a', 5, 'А'), cls('b', 5, 'Б')],
    links: [
      { course_id: 'k', class_group_id: 'a' },
      { course_id: 'k', class_group_id: 'b' },
    ] as CourseClass[],
  }

  it('порожній розклад семестру не рахується', () => {
    expect(unscheduledBySemester({ ...base, entries: [] })).toEqual([])
  })

  it('називає класи, яких немає в непорожньому розкладі', () => {
    const r = unscheduledBySemester({ ...base, entries: [entry('1', 't1', 'a')] })
    expect(r).toHaveLength(1)
    expect(r[0].semester.id).toBe('s1')
    expect(r[0].classes.map((c) => c.id)).toEqual(['b'])
  })

  it('усі розставлені — порожньо', () => {
    expect(unscheduledBySemester({ ...base, entries: [entry('1', 't1', 'a'), entry('2', 't1', 'b')] })).toEqual([])
  })

  it('клас без годин у семестрі не потрібен у розкладі', () => {
    const r = unscheduledBySemester({ ...base, courses: [course(1, 0)], entries: [entry('1', 't2', 'a')] })
    expect(r).toEqual([])
  })
})
