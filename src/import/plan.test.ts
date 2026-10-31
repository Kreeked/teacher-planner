import { describe, expect, it } from 'vitest'
import type { ParsedKtp } from './ktpParser'
import { defaultDecisions, isReplaced, planImport, type ImportContext } from './plan'

const meta = { owner_id: 'u' }
const year = { ...meta, id: 'Y', title: '2025/2026', start_date: '2025-09-01', end_date: '2026-05-31' }

const ktp: ParsedKtp = {
  subject: 'Інформатика',
  grade: 9,
  classNames: ['9-А', '9-В'],
  programRef: '',
  yearTotal: null,
  semesterTotals: [],
  semesters: [{ number: 2, start: '2026-01-12', end: '2026-05-29' }],
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
  periods: [],
  links: [],
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
  const plan = planImport(ktp, year, course, ctx)

  it('finds classes that are missing in the year', () => {
    expect(plan.classes.map((c) => [c.display, c.classId])).toEqual([
      ['9-А', 'A'],
      ['9-В', null],
    ])
    expect(plan.classes[0].linked).toBe(false)
  })

  it('offers to add a semester that does not exist yet', () => {
    expect(plan.semesters).toEqual([{ number: 2, exists: false, error: null }])
  })

  it('reports dates that differ from the ones already in the system', () => {
    expect(plan.conflicts).toEqual([
      { key: 'L1_A', classIndex: 0, label: '№1 Вступ', current: '2025-09-04', incoming: '2025-09-02' },
    ])
  })

  it('counts file dates that do not match the schedule', () => {
    // 9-А має вівторок: 02.09 і 09.09 — вівторки; 9-В немає в системі.
    expect(plan.mismatches[0]).toMatchObject({ total: 2, bad: 0 })
    expect(plan.mismatches[1]).toMatchObject({ total: 1, bad: 1, problems: { 'no-schedule': 1 } })
  })

  it('keeps system dates and adds what is missing by default', () => {
    const d = defaultDecisions(plan)
    expect([...d.addClasses]).toEqual([1])
    expect([...d.addSemesters]).toEqual([2])
    expect(isReplaced(plan.conflicts[0], d)).toBe(false)
  })

  it('replaces per class or per date on request', () => {
    const d = defaultDecisions(plan)
    expect(isReplaced(plan.conflicts[0], { ...d, mode: { 0: 'replace' } })).toBe(true)
    expect(isReplaced(plan.conflicts[0], { ...d, mode: { 0: 'each' } })).toBe(false)
    expect(isReplaced(plan.conflicts[0], { ...d, mode: { 0: 'each' }, picks: new Set(['L1_A']) })).toBe(true)
  })
})
