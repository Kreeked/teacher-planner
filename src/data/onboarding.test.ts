import { describe, expect, it } from 'vitest'
import { canProceed, classesWord, countsOf, type Counts } from './onboarding'

const empty: Counts = { year: false, semesters: 0, classes: 0, courses: 0, slots: 0, placed: 0 }

describe('canProceed', () => {
  it('без року не можна піти далі', () => {
    expect(canProceed('year', empty)).toBe(false)
    expect(canProceed('year', { ...empty, year: true })).toBe(true)
  })

  it('розклад не може бути порожнім', () => {
    expect(canProceed('schedule', empty)).toBe(false)
    expect(canProceed('schedule', { ...empty, placed: 1 })).toBe(true)
  })

  it('класи, предмети й дзвінки обовʼязкові', () => {
    expect(canProceed('classes', empty)).toBe(false)
    expect(canProceed('subjects', empty)).toBe(false)
    expect(canProceed('bells', empty)).toBe(false)
    expect(canProceed('bells', { ...empty, slots: 3 })).toBe(true)
  })
})

describe('classesWord', () => {
  it('відмінює слово «клас»', () => {
    expect([1, 2, 4, 5, 11, 12, 21].map(classesWord)).toEqual(['1 клас', '2 класи', '4 класи', '5 класів', '11 класів', '12 класів', '21 клас'])
  })
})

describe('countsOf', () => {
  it('рахує лише семестри без чвертей і уроки обох змін', () => {
    const slot = { number: 1, start: '08:30', end: '09:15', break_after: 10 }
    const c = countsOf({
      year: {},
      periods: [{ parent_id: null }, { parent_id: 'a' }],
      classes: [1],
      courses: [],
      bells: { slots: [slot], second_shift: [slot, slot] },
      entries: [1, 2],
    })
    expect(c).toEqual({ year: true, semesters: 1, classes: 1, courses: 0, slots: 3, placed: 2 })
  })
})
