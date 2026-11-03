import { describe, expect, it } from 'vitest'
import type { ParsedKtp } from './ktpParser'
import { planImport, type ImportContext } from './plan'

const meta = { owner_id: 'u' }
const ktp: ParsedKtp = {
  subject: 'Інформатика',
  grade: 9,
  classNames: ['9-А', '9-В'],
  programRef: '',
  yearTotal: null,
  semesterTotals: [],
  semesters: [
    { number: 1, start: '2025-09-01', end: '2025-12-18' },
    { number: 2, start: '2026-01-12', end: '2026-05-29' },
  ],
  topics: [
    {
      number: 1,
      title: 'Тема 1',
      altTitle: null,
      hours: 2,
      lessons: [
        { number: 1, title: 'Вступ', lesson_type: 'regular', dates: ['2025-09-02', '2025-09-03'], homework: '', semester: 1 },
        { number: 2, title: 'Нове', lesson_type: 'regular', dates: ['2025-09-09', null], homework: '', semester: 1 },
      ],
    },
  ],
  warnings: [],
}

const ctx: ImportContext = {
  classes: [{ ...meta, id: 'A', academic_year_id: 'Y', grade: 9, letter: 'А', display_name: '9-А' }],
  periods: [{ ...meta, id: 'P1', academic_year_id: 'Y', parent_id: null, kind: 'semester' as const, title: 'І семестр', start_date: '2025-09-01', end_date: '2025-12-19', position: 0 }],
  links: [{ ...meta, id: 'K', course_id: 'C', class_group_id: 'A', position: 0 }],
  topics: [{ ...meta, id: 'T', course_id: 'C', position: 0, title: 'Тема 1', planned_hours: 2 }],
  lessons: [
    { ...meta, id: 'L1', course_id: 'C', topic_id: 'T', period_id: null, position: 0, number: 1, title: 'Вступ', lesson_type: 'regular', homework: '', notes: '' },
  ],
  schedules: [
    { ...meta, id: 'L1_A', course_id: 'C', lesson_id: 'L1', class_group_id: 'A', planned_date: '2025-09-04', actual_date: null, status: 'planned', note: '' },
  ],
  timetables: [{ ...meta, id: 'TT', academic_year_id: 'Y', title: 'Розклад', valid_from: '2025-09-01', valid_to: '2026-05-31' }],
  entries: [{ ...meta, id: 'E', timetable_id: 'TT', weekday: 2, slot_number: 1, class_group_id: 'A', course_id: 'C' }],
  daysOff: [],
}
const course = { ...meta, id: 'C', academic_year_id: 'Y', subject: 'Інформатика', grade: 9, hours_per_week: 1, total_hours: 35, program_ref: '', status: 'draft' as const }

describe('planImport', () => {
  const plan = planImport(ktp, course, ctx)

  it('takes only the classes linked to this course and reports the rest', () => {
    expect(plan.classes.map((c) => [c.display, c.classId, c.linked])).toEqual([
      ['9-А', 'A', true],
      ['9-В', null, false],
    ])
  })

  it('compares file semesters with the ones in the year without adding any', () => {
    expect(plan.semesters).toEqual([
      { number: 1, exists: true, differs: true },
      { number: 2, exists: false, differs: false },
    ])
  })

  it('counts file dates that do not match the schedule only for imported classes', () => {
    // 9-А має вівторок: 02.09 і 09.09 — вівторки; 9-В не імпортується.
    expect(plan.mismatches[0]).toMatchObject({ total: 2, bad: 0 })
    expect(plan.mismatches[1]).toMatchObject({ total: 0, bad: 0 })
  })

  it('refuses a file for another grade', () => {
    expect(plan.error).toBeNull()
    expect(planImport({ ...ktp, grade: 8 }, course, ctx).error).not.toBeNull()
  })
})
