import { describe, expect, it } from 'vitest'
import { bellsOfDay, currentAndNext, lessonsOfDay, mondayOf, slotAt, type DayData } from './day'
import { computeBells } from './timetable'
import type { AcademicYear, ClassGroup, Course, Lesson, LessonSchedule, Timetable, TimetableEntry } from './types'

const course = { id: 'k', academic_year_id: 'y', subject: 'Інформатика', grade: 9 } as Course
const cls = (id: string, letter: string) => ({ id, grade: 9, letter, display_name: `9-${letter}` }) as ClassGroup
const lesson = (id: string, number: number) => ({ id, number, course_id: 'k' }) as Lesson
const sched = (lessonId: string, classId: string, date: string) =>
  ({
    id: `${lessonId}_${classId}`,
    lesson_id: lessonId,
    class_group_id: classId,
    course_id: 'k',
    planned_date: date,
    status: 'planned',
  }) as LessonSchedule
const entry = (weekday: number, slot: number, classId: string) =>
  ({ timetable_id: 't', weekday, slot_number: slot, class_group_id: classId, course_id: 'k' }) as TimetableEntry

const data: DayData = {
  courses: [course],
  classes: [cls('a', 'А'), cls('b', 'Б')],
  lessons: [lesson('l1', 1), lesson('l2', 2)],
  // Понеділок 07.09: 9-Б на 1 уроці, 9-А — здвоєний 2–3; 9-А без розкладу у вівторок.
  schedules: [sched('l1', 'a', '2026-09-07'), sched('l2', 'a', '2026-09-07'), sched('l1', 'b', '2026-09-07')],
  timetables: [{ id: 't', valid_from: '2026-09-01', valid_to: '2026-12-31' } as Timetable],
  entries: [entry(1, 1, 'b'), entry(1, 3, 'a'), entry(1, 2, 'a')],
  bells: [{ academic_year_id: 'y', slots: computeBells('08:30', 45, [10, 10, 10]) } as never],
}

describe('lessonsOfDay', () => {
  it('orders lessons by slot and splits a double lesson', () => {
    const list = lessonsOfDay('2026-09-07', data)
    expect(list.map((x) => `${x.slot} ${x.cls.display_name} ${x.lesson.number} ${x.bell?.start}`)).toEqual([
      '1 9-Б 1 08:30',
      '2 9-А 1 09:25',
      '3 9-А 2 10:20',
    ])
  })

  it('finds the current and next lesson', () => {
    const list = lessonsOfDay('2026-09-07', data)
    expect(currentAndNext(list, new Date(2026, 8, 7, 9, 30))).toEqual({ currentId: 'l1_a', nextId: 'l2_a' })
    expect(currentAndNext(list, new Date(2026, 8, 7, 9, 20))).toEqual({ currentId: null, nextId: 'l1_a' })
    expect(currentAndNext(list, new Date(2026, 8, 7, 12, 0))).toEqual({ currentId: null, nextId: null })
  })

  it('finds the monday of a week', () => {
    expect(mondayOf('2026-09-10')).toBe('2026-09-07')
    expect(mondayOf('2026-09-13')).toBe('2026-09-07')
  })
})

describe('slotAt', () => {
  const slots = computeBells('08:30', 45, [10, 10, 10])
  it('finds the lesson in progress and ignores breaks', () => {
    expect(slotAt(slots, new Date(2026, 8, 7, 9, 0))).toBe(1)
    expect(slotAt(slots, new Date(2026, 8, 7, 9, 20))).toBeNull()
    expect(slotAt(slots, new Date(2026, 8, 7, 9, 25))).toBe(2)
  })
})

describe('bellsOfDay', () => {
  const years = [
    { id: 'y', start_date: '2026-09-01', end_date: '2027-05-31', is_current: true } as AcademicYear,
    { id: 'z', start_date: '2025-09-01', end_date: '2026-05-31', is_current: false } as AcademicYear,
  ]
  const bells = [
    { academic_year_id: 'z', slots: [] },
    { academic_year_id: 'y', slots: [] },
  ] as never[]
  it('takes the year of the lessons, or of the date when there are none', () => {
    const list = lessonsOfDay('2026-09-07', data)
    expect(bellsOfDay('2026-09-07', list, bells, years)?.academic_year_id).toBe('y')
    expect(bellsOfDay('2026-01-12', [], bells, years)?.academic_year_id).toBe('z')
  })
})
