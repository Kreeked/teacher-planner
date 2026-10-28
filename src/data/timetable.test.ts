import { describe, expect, it } from 'vitest'
import type { Timetable, TimetableEntry } from './types'
import {
  computeBells,
  minutesBetween,
  shiftTime,
  slotsOn,
  timetableOn,
  validateBells,
  validateTimetable,
  weekdaysFor,
} from './timetable'

describe('bells', () => {
  it('computes lesson times from the start, length and breaks', () => {
    const s = computeBells('08:30', 45, [10, 20, 10])
    expect(s.map((x) => `${x.start}-${x.end}`)).toEqual(['08:30-09:15', '09:25-10:10', '10:30-11:15'])
    expect(validateBells(s)).toBeNull()
  })

  it('rejects overlapping lessons', () => {
    const s = computeBells('08:30', 45, [10, 10])
    s[1].start = '09:00'
    expect(validateBells(s)).toMatch(/Урок 2/)
    expect(shiftTime('09:15', 15)).toBe('09:30')
    expect(minutesBetween('08:30', '09:25')).toBe(55)
  })
})

const tt = (id: string, from: string, to: string) => ({ id, title: id, valid_from: from, valid_to: to }) as Timetable
const entry = (weekday: number, slot: number, cls: string, course = 'k') =>
  ({ timetable_id: 't1', weekday, slot_number: slot, class_group_id: cls, course_id: course }) as TimetableEntry

describe('timetable', () => {
  const year = { start_date: '2026-09-01', end_date: '2027-06-30' }
  const all = [tt('t1', '2026-09-01', '2026-12-31')]

  it('finds the timetable for a date and validates periods', () => {
    expect(timetableOn(all, '2026-10-05')?.id).toBe('t1')
    expect(timetableOn(all, '2027-01-15')).toBeUndefined()
    expect(validateTimetable({ id: 'n', valid_from: '2026-12-01', valid_to: '2027-05-01' }, year, all)).toMatch(
      /Перетинається/,
    )
    expect(validateTimetable({ id: 'n', valid_from: '2027-01-01', valid_to: '2027-08-01' }, year, all)).toMatch(/межах/)
    expect(validateTimetable({ id: 'n', valid_from: '2027-01-01', valid_to: '2027-06-30' }, year, all)).toBeNull()
  })

  it('maps class lessons of a day to slot numbers, including double lessons', () => {
    const entries = [entry(1, 3, '9a'), entry(1, 2, '9a'), entry(1, 5, '9b'), entry(2, 1, '9a')]
    const m = slotsOn(entries, all[0], '2026-09-07') // понеділок
    expect(m.get('9a_k')).toEqual([2, 3])
    expect(m.get('9b_k')).toEqual([5])
    expect(weekdaysFor(entries, 't1', '9a', 'k')).toEqual([1, 1, 2])
  })
})
