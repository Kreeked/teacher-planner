import { describe, expect, it } from 'vitest'
import type { Period } from './types'
import { defaultYear, defaultYearStart, parseLetters, validatePeriod, validateYear } from './year'

const year = { start_date: '2026-09-01', end_date: '2027-06-30' }

function period(p: Partial<Period>): Period {
  return {
    id: 'x',
    owner_id: 'u',
    academic_year_id: 'y',
    parent_id: null,
    kind: 'semester',
    title: 'І семестр',
    start_date: '2026-09-01',
    end_date: '2026-12-26',
    position: 0,
    ...p,
  }
}

const sem1 = period({ id: 's1' })
const sem2 = period({ id: 's2', title: 'ІІ семестр', start_date: '2027-01-12', end_date: '2027-06-30', position: 1 })
const q1 = period({ id: 'q1', parent_id: 's1', kind: 'quarter', title: '1 чверть', start_date: '2026-09-01', end_date: '2026-10-24' })

describe('defaultYearStart', () => {
  it('counts the new school year from July', () => {
    expect(defaultYearStart(new Date(2026, 9, 28))).toBe(2026)
    expect(defaultYearStart(new Date(2027, 2, 1))).toBe(2026)
    expect(defaultYearStart(new Date(2027, 6, 1))).toBe(2027)
  })

  it('builds a valid default year', () => {
    const y = defaultYear(2026)
    expect(y.title).toBe('2026/2027')
    for (const s of y.semesters) expect(validatePeriod({ ...s, parent_id: null }, y, [])).toBeNull()
  })
})

describe('validatePeriod', () => {
  const all = [sem1, sem2, q1]

  it('accepts a quarter inside its semester', () => {
    const q2 = { parent_id: 's1', start_date: '2026-11-02', end_date: '2026-12-26' }
    expect(validatePeriod(q2, year, all)).toBeNull()
  })

  it('rejects reversed dates', () => {
    expect(validatePeriod({ parent_id: null, start_date: '2026-12-01', end_date: '2026-11-01' }, year, all)).toMatch(
      'пізніше',
    )
  })

  it('rejects dates outside the year', () => {
    expect(validatePeriod({ parent_id: null, start_date: '2026-08-25', end_date: '2026-12-26' }, year, [])).toMatch(
      'навчального року',
    )
  })

  it('rejects a quarter outside its semester', () => {
    const q = { parent_id: 's1', start_date: '2026-12-01', end_date: '2027-01-20' }
    expect(validatePeriod(q, year, all)).toMatch('І семестр')
  })

  it('rejects overlapping quarters of one semester', () => {
    const q = { parent_id: 's1', start_date: '2026-10-20', end_date: '2026-12-20' }
    expect(validatePeriod(q, year, all)).toMatch('1 чверть')
  })

  it('ignores the period itself when editing', () => {
    expect(validatePeriod({ ...q1, end_date: '2026-10-30' }, year, all)).toBeNull()
  })

  it('does not let a semester shrink past its quarters', () => {
    expect(validatePeriod({ ...sem1, start_date: '2026-09-15' }, year, all)).toMatch('1 чверть')
  })
})

describe('validateYear', () => {
  it('does not let the year shrink past its periods', () => {
    expect(validateYear({ start_date: '2026-09-01', end_date: '2027-05-31' }, [sem1, sem2])).toMatch('ІІ семестр')
  })
})

describe('parseLetters', () => {
  it('splits, uppercases, dedupes and converts latin look-alikes', () => {
    expect(parseLetters('а, б  B a')).toEqual(['А', 'Б', 'В'])
  })
})
