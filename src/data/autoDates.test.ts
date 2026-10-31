import { describe, expect, it } from 'vitest'
import { fillDates, type FillInput } from './autoDates'
import type { ScheduleData } from './mismatch'
import type { Lesson } from './types'

const meta = { owner_id: 'u' }
const sched: ScheduleData = {
  timetables: [{ ...meta, id: 'T', academic_year_id: 'Y', title: 'Розклад', valid_from: '2025-09-01', valid_to: '2026-05-31' }],
  entries: [
    { ...meta, id: 'e1', timetable_id: 'T', weekday: 2, slot_number: 3, class_group_id: 'A', course_id: 'C' },
    { ...meta, id: 'e2', timetable_id: 'T', weekday: 5, slot_number: 1, class_group_id: 'A', course_id: 'C' },
  ],
  daysOff: [],
}
const lesson = (id: string, extra: Partial<Lesson> = {}): Lesson => ({
  ...meta,
  id,
  course_id: 'C',
  topic_id: 'T',
  period_id: null,
  position: 0,
  number: 0,
  title: id,
  lesson_type: 'regular',
  homework: '',
  notes: '',
  ...extra,
})
const input = (lessons: Lesson[], rest: Partial<FillInput> = {}): FillInput => ({
  lessons,
  existing: new Map(),
  classId: 'A',
  courseId: 'C',
  sched,
  from: '2025-09-01',
  end: '2026-05-31',
  ranges: new Map(),
  ...rest,
})
const dates = (r: ReturnType<typeof fillDates>) => r.placements.map((p) => p.date)

describe('fillDates', () => {
  it('puts lessons on the class schedule days in order', () => {
    const r = fillDates(input([lesson('1'), lesson('2'), lesson('3'), lesson('4')]))
    expect(dates(r)).toEqual(['2025-09-02', '2025-09-05', '2025-09-09', '2025-09-12'])
  })

  it('keeps existing dates and continues after them', () => {
    const r = fillDates(input([lesson('1'), lesson('2'), lesson('3')], { existing: new Map([['2', '2025-09-05']]) }))
    expect(r.placements).toEqual([
      { lessonId: '1', date: '2025-09-02' },
      { lessonId: '3', date: '2025-09-09' },
    ])
  })

  it('skips days off', () => {
    const withBreak = { ...sched, daysOff: [{ ...meta, id: 'd', academic_year_id: 'Y', title: 'Канікули', start_date: '2025-09-02', end_date: '2025-09-08' }] }
    expect(dates(fillDates(input([lesson('1'), lesson('2')], { sched: withBreak })))).toEqual(['2025-09-09', '2025-09-12'])
  })

  it('starts from the given day', () => {
    expect(dates(fillDates(input([lesson('1')], { from: '2025-09-03' })))).toEqual(['2025-09-05'])
  })

  it('reports lessons that do not fit before the end', () => {
    const r = fillDates(input([lesson('1'), lesson('2'), lesson('3')], { end: '2025-09-06' }))
    expect(dates(r)).toEqual(['2025-09-02', '2025-09-05'])
    expect(r.unplaced).toEqual(['3'])
  })

  it('does not date "*" lessons and keeps lessons inside their period', () => {
    const ranges = new Map([['S2', { start: '2026-01-12', end: '2026-01-19' }]])
    const r = fillDates(input([lesson('1', { extra: true }), lesson('2', { period_id: 'S2' }), lesson('3', { period_id: 'S2' }), lesson('4', { period_id: 'S2' })], { ranges }))
    expect(r.skippedExtra).toBe(1)
    expect(dates(r)).toEqual(['2026-01-13', '2026-01-16'])
    expect(r.unplaced).toEqual(['4'])
  })

  it('puts two lessons on one day only if the schedule has two cells', () => {
    const double = { ...sched, entries: [...sched.entries, { ...meta, id: 'e3', timetable_id: 'T', weekday: 2, slot_number: 4, class_group_id: 'A', course_id: 'C' }] }
    expect(dates(fillDates(input([lesson('1'), lesson('2'), lesson('3')], { sched: double })))).toEqual(['2025-09-02', '2025-09-02', '2025-09-05'])
  })
})
