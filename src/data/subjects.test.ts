import { describe, expect, it } from 'vitest'
import type { ClassGroup } from './types'
import { hoursMismatch, parseHours, semesterWeeks, subjectIssue, teachingWeeks, unassignedClasses } from './subjects'

const ok = { subject: 'Інформатика', grade: 5, h1: '1', h2: '1', year: '35', classIds: ['a'] }

describe('teachingWeeks', () => {
  it('рахує тижні пн–пт', () => {
    // 1–12 вересня 2026: вівторок… п'ятниця наступного тижня = 2 тижні
    expect(teachingWeeks({ start_date: '2026-09-01', end_date: '2026-09-11' }, [])).toBe(2)
  })

  it('тиждень цілком у канікулах не рахується', () => {
    const off = [{ start_date: '2026-09-07', end_date: '2026-09-13' }]
    expect(teachingWeeks({ start_date: '2026-09-01', end_date: '2026-09-18' }, off)).toBe(2)
  })

  it('тиждень з частиною канікул рахується', () => {
    const off = [{ start_date: '2026-09-09', end_date: '2026-09-13' }]
    expect(teachingWeeks({ start_date: '2026-09-07', end_date: '2026-09-13' }, off)).toBe(1)
  })
})

describe('semesterWeeks', () => {
  it('ІІ семестр — усі наступні', () => {
    const p = (position: number, start_date: string, end_date: string) => ({ parent_id: null, position, start_date, end_date })
    const w = semesterWeeks([p(0, '2026-09-01', '2026-09-04'), p(1, '2026-09-07', '2026-09-11'), p(2, '2026-09-14', '2026-09-18')], [])
    expect(w).toEqual({ w1: 1, w2: 2 })
  })

  it('без семестрів — нулі', () => {
    expect(semesterWeeks([], [])).toEqual({ w1: 0, w2: 0 })
  })
})

describe('parseHours', () => {
  it('лише цілі невід’ємні', () => {
    expect(parseHours('0')).toBe(0)
    expect(parseHours('12')).toBe(12)
    expect(parseHours('')).toBeNull()
    expect(parseHours('1.5')).toBeNull()
    expect(parseHours('-1')).toBeNull()
  })
})

describe('subjectIssue', () => {
  it('повна картка готова', () => {
    expect(subjectIssue(ok)).toBeNull()
  })

  it('порожні поля, клас чи літери — недописано', () => {
    expect(subjectIssue({ ...ok, subject: ' ' })).toBe('incomplete')
    expect(subjectIssue({ ...ok, grade: null })).toBe('incomplete')
    expect(subjectIssue({ ...ok, h1: '' })).toBe('incomplete')
    expect(subjectIssue({ ...ok, h2: '' })).toBe('incomplete')
    expect(subjectIssue({ ...ok, year: '' })).toBe('incomplete')
    expect(subjectIssue({ ...ok, classIds: [] })).toBe('incomplete')
  })

  it('нуль годин у семестрі дозволений, нуль за рік — ні', () => {
    expect(subjectIssue({ ...ok, h2: '0' })).toBeNull()
    expect(subjectIssue({ ...ok, year: '0' })).toBe('zero')
  })

})

describe('hoursMismatch', () => {
  const weeks = { w1: 17, w2: 18 }

  it('збігається — без помилки', () => {
    expect(hoursMismatch(ok, weeks)).toBeNull()
  })

  it('не збігається — текст з розрахунком, не блокує', () => {
    expect(hoursMismatch({ ...ok, year: '40' }, weeks)).toBe(
      'Загальна кількість годин не збігається з розрахованою за вашими датами семестрів і канікул: за календарем виходить 35 год, а вказано 40. Зберегти можна й так.',
    )
  })

  it('порожні поля не перевіряються', () => {
    expect(hoursMismatch({ ...ok, year: '' }, weeks)).toBeNull()
  })
})

describe('unassignedClasses', () => {
  const c = (id: string, grade: number, letter: string) => ({ id, grade, letter }) as ClassGroup

  it('повертає класи без КТП по порядку', () => {
    const classes = [c('9б', 9, 'Б'), c('5а', 5, 'А'), c('5б', 5, 'Б'), c('9а', 9, 'А')]
    expect(unassignedClasses(classes, [{ class_group_id: '5а' }, { class_group_id: '9а' }]).map((x) => x.id)).toEqual(['5б', '9б'])
  })

  it('усі розподілені — порожньо', () => {
    expect(unassignedClasses([c('5а', 5, 'А')], [{ class_group_id: '5а' }])).toEqual([])
  })
})
