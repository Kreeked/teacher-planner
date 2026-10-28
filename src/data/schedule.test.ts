import { describe, expect, it } from 'vitest'
import type { Lesson } from './types'
import { addDays, fillDates, weekday } from './schedule'

const lesson = (id: string, extra = false) => ({ id, extra }) as Lesson
const terms = [
  { start_date: '2026-09-01', end_date: '2026-12-18' },
  { start_date: '2027-01-12', end_date: '2027-05-30' },
]

describe('date helpers', () => {
  it('walks over month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(weekday('2026-09-01')).toBe(2) // вівторок
    expect(weekday('2026-09-06')).toBe(7) // неділя
  })
})

describe('fillDates', () => {
  it('fills empty lessons on the class weekdays', () => {
    const r = fillDates([lesson('a'), lesson('b'), lesson('c')], new Map(), [1, 4], terms)
    expect(r.map((x) => x.date)).toEqual(['2026-09-03', '2026-09-07', '2026-09-10'])
  })

  it('continues after the last set date and keeps existing ones', () => {
    const existing = new Map([['b', '2026-12-17']])
    const r = fillDates([lesson('a'), lesson('b'), lesson('c'), lesson('d')], existing, [1, 4], terms)
    // «a» до «b» не має дати: ставимо з початку, «c» і «d» — після 17.12, через канікули.
    expect(r).toEqual([
      { lessonId: 'a', date: '2026-09-03' },
      { lessonId: 'c', date: '2027-01-14' },
      { lessonId: 'd', date: '2027-01-18' },
    ])
  })

  it('skips extra lessons and stops at the end of the year', () => {
    const short = [{ start_date: '2026-09-01', end_date: '2026-09-08' }]
    const r = fillDates([lesson('a'), lesson('x', true), lesson('b'), lesson('c')], new Map(), [2], short)
    expect(r).toEqual([
      { lessonId: 'a', date: '2026-09-01' },
      { lessonId: 'b', date: '2026-09-08' },
    ])
  })

  it('does nothing without weekdays', () => {
    expect(fillDates([lesson('a')], new Map(), [], terms)).toEqual([])
  })
})
