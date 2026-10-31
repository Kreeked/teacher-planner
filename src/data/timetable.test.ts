import { describe, expect, it } from 'vitest'
import type { Timetable, TimetableEntry } from './types'
import {
  addSlot,
  computeBells,
  buildBells,
  defaultSlots,
  shiftParams,
  shiftsOverlap,
  startLimits,
  minutesBetween,
  removeSlot,
  setSlotBreak,
  setSlotEnd,
  setSlotStart,
  shiftSlots,
  shiftTime,
  slotsOn,
  timetableOn,
  validateBells,
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

describe('bell editing', () => {
  const slots = computeBells('08:30', 45, [10, 20, 0]) // 08:30–09:15, 09:25–10:10, 10:30–11:15

  it('moves a lesson with its length and recounts the breaks around it', () => {
    const next = setSlotStart(slots, 1, '09:30')!
    expect(`${next[1].start}-${next[1].end}`).toBe('09:30-10:15')
    expect([next[0].break_after, next[1].break_after]).toEqual([15, 15])
    expect(setSlotStart(slots, 1, '09:00')).toBeNull() // наїжджає на попередній урок
  })

  it('changes the length when the end moves', () => {
    const next = setSlotEnd(slots, 0, '09:20')!
    expect(next[0].break_after).toBe(5)
    expect(setSlotEnd(slots, 0, '08:00')).toBeNull()
  })

  it('shifts the following lessons with a longer break', () => {
    const next = setSlotBreak(slots, 0, 15)!
    expect(next.map((x) => x.start)).toEqual(['08:30', '09:30', '10:35'])
    expect(next.map((x) => x.break_after)).toEqual([15, 20, 0])
    expect(setSlotBreak(slots, 2, 10)).toBeNull() // після останнього перерви немає
  })

  it('adds a lesson after the last one and removes lessons with renumbering', () => {
    const added = addSlot(slots, 1)!
    expect(added[3]).toMatchObject({ number: 4, start: '11:25', end: '12:10' })
    expect(addSlot([], 2)![0]).toMatchObject({
      number: 1,
      start: '14:15',
      end: '15:00',
    })
    const removed = removeSlot(slots, 0)
    expect(removed.map((x) => `${x.number} ${x.start}`)).toEqual(['1 09:25', '2 10:30'])
  })

  it('has default bells for both shifts', () => {
    expect(defaultSlots(1)).toHaveLength(7)
    expect(defaultSlots(2)[0].start).toBe('14:15')
    expect(defaultSlots(1)[6].end).toBe('14:10')
    expect(defaultSlots(2)[5].end).toBe('19:20')
    expect(shiftSlots({ slots: defaultSlots(1) }, 2)).toEqual([])
  })
})

const tt = (id: string, from: string, to: string) => ({ id, title: id, valid_from: from, valid_to: to }) as Timetable
const entry = (weekday: number, slot: number, cls: string, course = 'k') =>
  ({
    timetable_id: 't1',
    weekday,
    slot_number: slot,
    class_group_id: cls,
    course_id: course,
  }) as TimetableEntry

describe('timetable', () => {
  const all = [tt('t1', '2026-09-01', '2026-12-31')]

  it('finds the timetable for a date', () => {
    expect(timetableOn(all, '2026-10-05')?.id).toBe('t1')
    expect(timetableOn(all, '2027-01-15')).toBeUndefined()
  })

  it('maps class lessons of a day to slot numbers, including double lessons', () => {
    const entries = [
      entry(1, 3, '9a'),
      entry(1, 2, '9a'),
      entry(1, 5, '9b'),
      entry(2, 1, '9a'),
      { ...entry(1, 1, '9a'), shift: 2 } as TimetableEntry,
    ]
    const m = slotsOn(entries, all[0], '2026-09-07') // понеділок
    expect(m.get('9a_k')).toEqual([
      { slot: 2, shift: 1 },
      { slot: 3, shift: 1 },
      { slot: 1, shift: 2 },
    ])
    expect(m.get('9b_k')).toEqual([{ slot: 5, shift: 1 }])
  })
})

describe('зміни', () => {
  const first = defaultSlots(1)
  const second = defaultSlots(2)

  it('параметри зміни повертають початок, тривалість і перерви', () => {
    expect(shiftParams(first, 1)).toEqual({ start: '08:00', minutes: 45, breaks: [5, 10, 10, 10, 10, 10, 0] })
    expect(shiftParams([], 2)).toEqual({ start: '14:15', minutes: 45, breaks: [] })
  })

  it('buildBells: перерва після останнього уроку нульова, а доба не переповнюється', () => {
    expect(buildBells('08:00', 45, [5, 10])?.map((s) => s.break_after)).toEqual([5, 0])
    expect(buildBells('23:00', 45, [10, 10])).toBeNull()
    expect(buildBells('08:00', 45, [])).toEqual([])
  })

  it('друга зміна не починається раніше, ніж закінчиться перша', () => {
    expect(shiftsOverlap(first, second)).toBe(false)
    expect(shiftsOverlap(first, buildBells('14:05', 45, [0])!)).toBe(true)
    expect(shiftsOverlap(first, buildBells('14:10', 45, [0])!)).toBe(false)
    expect(shiftsOverlap([], second)).toBe(false)
  })

  it('межі початку: друга зміна не раніше кінця першої, перша — не пізніше, ніж вмістить друга', () => {
    expect(startLimits({ slots: first }, 2)).toEqual({ min: '14:10' })
    expect(startLimits({ slots: [] }, 2)).toEqual({})
    // перша триває 08:00–14:10 (370 хв), друга з 14:15: початок першої не пізніше за 08:05
    expect(startLimits({ slots: first, second_shift: second }, 1)).toEqual({ max: '08:05' })
    expect(startLimits({ slots: first }, 1)).toEqual({})
  })
})
