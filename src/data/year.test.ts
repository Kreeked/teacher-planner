import { describe, expect, it } from 'vitest'
import type { AcademicYear, Period } from './types'
import {
  defaultYear,
  defaultYearStart,
  isCurrentYear,
  parseLetters,
  pickCurrentYear,
  parseShortDate,
  shortDate,
  validateDayOff,
  validatePeriod,
  fitPeriods,
  validateYear,
} from './year'

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
const sem2 = period({
  id: 's2',
  title: 'ІІ семестр',
  start_date: '2027-01-12',
  end_date: '2027-06-30',
  position: 1,
})
const q1 = period({
  id: 'q1',
  parent_id: 's1',
  kind: 'quarter',
  title: '1 чверть',
  start_date: '2026-09-01',
  end_date: '2026-10-24',
})

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
    const q2 = {
      parent_id: 's1',
      start_date: '2026-11-02',
      end_date: '2026-12-26',
    }
    expect(validatePeriod(q2, year, all)).toBeNull()
  })

  it('rejects reversed dates', () => {
    expect(validatePeriod({ parent_id: null, start_date: '2026-12-01', end_date: '2026-11-01' }, year, all)).toMatch('пізніше')
  })

  it('rejects dates outside the year', () => {
    expect(validatePeriod({ parent_id: null, start_date: '2026-08-25', end_date: '2026-12-26' }, year, [])).toMatch(
      'навчального року',
    )
  })

  it('rejects a quarter outside its semester', () => {
    const q = {
      parent_id: 's1',
      start_date: '2026-12-01',
      end_date: '2027-01-20',
    }
    expect(validatePeriod(q, year, all)).toMatch('І семестр')
  })

  it('rejects overlapping quarters of one semester', () => {
    const q = {
      parent_id: 's1',
      start_date: '2026-10-20',
      end_date: '2026-12-20',
    }
    expect(validatePeriod(q, year, all)).toMatch('1 чверть')
  })

  it('ignores the period itself when editing', () => {
    expect(validatePeriod({ ...q1, end_date: '2026-10-30' }, year, all)).toBeNull()
  })

  it('does not let a semester shrink past its quarters', () => {
    expect(validatePeriod({ ...sem1, start_date: '2026-09-15' }, year, all)).toMatch('1 чверть')
  })
})

describe('validateYear: перетин з іншими роками', () => {
  const prev = { title: '2025/2026', start_date: '2025-09-01', end_date: '2026-06-30' }

  it('дати поруч, але не перетинаються — дозволено', () => {
    expect(validateYear({ start_date: '2026-07-01', end_date: '2027-06-30' }, [], [prev])).toBeNull()
  })

  it('перетин із іншим роком — помилка з його назвою', () => {
    expect(validateYear({ start_date: '2026-06-30', end_date: '2027-06-30' }, [], [prev])).toMatch('2025/2026')
  })

  it('початок пізніше за кінець — помилка раніше за перетин', () => {
    expect(validateYear({ start_date: '2027-06-30', end_date: '2026-09-01' }, [], [prev])).toBe('Початок пізніше за кінець')
  })

  it('порожні дати — помилка', () => {
    expect(validateYear({ start_date: '', end_date: '2027-06-30' }, [], [prev])).toBe('Вкажи обидві дати')
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

describe('parseShortDate', () => {
  const year = { start_date: '2026-09-01', end_date: '2027-06-30' }

  it('places the date into the right calendar year', () => {
    expect(parseShortDate('2.9', year)).toBe('2026-09-02')
    expect(parseShortDate('15.01', year)).toBe('2027-01-15')
    expect(parseShortDate('15.01.2027', year)).toBe('2027-01-15')
    expect(shortDate('2027-01-15')).toBe('15.01')
  })

  it('rejects impossible dates and dates outside the year', () => {
    expect(parseShortDate('', year)).toBeNull()
    expect(parseShortDate('31.02', year)).toBeUndefined()
    expect(parseShortDate('15.07', year)).toBeUndefined()
    expect(parseShortDate('abc', year)).toBeUndefined()
  })
})

describe('pickCurrentYear', () => {
  const y = (id: string, from: string, to: string) => ({ id, start_date: from, end_date: to }) as AcademicYear
  const years = [y('a', '2025-09-01', '2026-05-31'), y('b', '2026-09-01', '2027-05-31')]

  it('takes the year that contains today', () => {
    expect(pickCurrentYear(years, '2026-10-31')?.id).toBe('b')
    expect(pickCurrentYear(years, '2026-03-01')?.id).toBe('a')
    expect(isCurrentYear(years[1], '2026-10-31')).toBe(true)
    expect(isCurrentYear(years[0], '2026-10-31')).toBe(false)
  })

  it('between years takes the next one, and after the last year the last one', () => {
    expect(pickCurrentYear(years, '2026-07-15')?.id).toBe('b')
    expect(pickCurrentYear(years, '2027-07-15')?.id).toBe('b')
    expect(pickCurrentYear(years, '2025-06-01')?.id).toBe('a')
    expect(pickCurrentYear([], '2026-07-15')).toBeUndefined()
  })
})

describe('validateDayOff', () => {
  const year = { start_date: '2025-09-01', end_date: '2026-05-31' }
  it('accepts a range inside the year', () => {
    expect(validateDayOff({ start_date: '2025-10-27', end_date: '2025-11-02' }, year)).toBeNull()
  })
  it('rejects missing, reversed and out-of-year dates', () => {
    expect(validateDayOff({ start_date: '', end_date: '2025-11-02' }, year)).toBe('Вкажи обидві дати')
    expect(validateDayOff({ start_date: '2025-11-02', end_date: '2025-10-27' }, year)).toBe('Початок пізніше за кінець')
    expect(validateDayOff({ start_date: '2025-08-20', end_date: '2025-09-02' }, year)).toBe('Виходить за межі навчального року')
  })
})

describe('fitPeriods', () => {
  const mk = (id: string, start_date: string, end_date: string, position: number, parent_id: string | null = null) =>
    ({ id, owner_id: 'u', academic_year_id: 'y', parent_id, kind: parent_id ? 'quarter' : 'semester', title: id, position, start_date, end_date }) as never
  const a = mk('a', '2026-09-01', '2026-12-26', 0)
  const b = mk('b', '2027-01-12', '2027-06-30', 1)

  it('нічого не міняє, коли дати збігаються', () => {
    expect(fitPeriods([a, b], { start_date: '2026-09-01', end_date: '2027-06-30' })).toEqual([])
  })

  it('перший семестр іде за початком року, останній за кінцем', () => {
    expect(fitPeriods([a, b], { start_date: '2026-09-02', end_date: '2027-05-31' })).toEqual([
      { id: 'a', start_date: '2026-09-02', end_date: '2026-12-26' },
      { id: 'b', start_date: '2027-01-12', end_date: '2027-05-31' },
    ])
  })

  it('середні періоди не виходять за межі року', () => {
    const q = mk('q', '2026-08-20', '2026-10-30', 0, 'a')
    expect(fitPeriods([a, b, q], { start_date: '2026-09-01', end_date: '2027-06-30' })).toEqual([
      { id: 'q', start_date: '2026-09-01', end_date: '2026-10-30' },
    ])
  })
})
