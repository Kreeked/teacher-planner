import { describe, expect, it } from 'vitest'
import type { Period } from './types'
import { defaultVacations, planVacations, validateSemester, validateVacation, vacationKind, vacationsComplete, semestersComplete, winterBreak } from './vacations'

const year = { start_date: '2026-09-01', end_date: '2027-06-30' }
const sem1 = { title: 'І семестр', start_date: '2026-09-01', end_date: '2026-12-26' }
const sem2 = { title: 'ІІ семестр', start_date: '2027-01-12', end_date: '2027-06-30' }

function p(title: string, start_date: string, end_date: string, position: number) {
  return { id: title, parent_id: null, position, start_date, end_date } as Pick<Period, 'parent_id' | 'position' | 'start_date' | 'end_date'>
}

describe('winterBreak', () => {
  it('вихідні не враховуються: кінець у суботу, початок ІІ у вівторок', () => {
    expect(winterBreak(sem1, sem2)).toEqual({ start_date: '2026-12-28', end_date: '2027-01-11' })
  })

  it('кінець І семестру в п\'ятницю: канікули з понеділка', () => {
    expect(winterBreak({ ...sem1, end_date: '2026-12-25' }, sem2)?.start_date).toBe('2026-12-28')
  })

  it('ІІ семестр з понеділка: канікули до п\'ятниці', () => {
    expect(winterBreak(sem1, { ...sem2, start_date: '2027-01-11' })?.end_date).toBe('2027-01-08')
  })

  it('між семестрами лише вихідні: канікул немає', () => {
    expect(winterBreak(sem1, { ...sem2, start_date: '2026-12-28' })).toBeNull()
  })
})

describe('validateSemester', () => {
  const ctx = { year, next: sem2 }

  it('вимагає дати й порядок', () => {
    expect(validateSemester({ start_date: '2026-09-01', end_date: '' }, ctx)).toBe('Вкажи обидві дати')
    expect(validateSemester({ start_date: '2026-12-26', end_date: '2026-09-01' }, ctx)).toBe('Початок пізніше за кінець')
  })

  it('кінець І семестру не заходить на ІІ', () => {
    expect(validateSemester({ start_date: '2026-09-01', end_date: '2027-01-12' }, ctx)).toBe('Дати перетинаються з: ІІ семестр')
    expect(validateSemester({ start_date: '2026-09-01', end_date: '2027-01-11' }, ctx)).toBeNull()
  })

  it('початок ІІ семестру не заходить на І', () => {
    expect(validateSemester({ start_date: '2026-12-26', end_date: '2027-06-30' }, { year, prev: sem1 })).toBe(
      'Дати перетинаються з: І семестр',
    )
  })

  it('не вилазить за рік', () => {
    expect(validateSemester({ start_date: '2026-09-01', end_date: '2027-07-05' }, { year })).toBe('Виходить за межі навчального року')
  })

  it('не залишає канікули поза семестром', () => {
    const autumn = { title: 'Осінні канікули', start_date: '2026-10-26', end_date: '2026-11-01' }
    expect(validateSemester({ start_date: '2026-09-01', end_date: '2026-10-30' }, { year, vacation: autumn })).toBe(
      'Осінні канікули виходять за ці межі',
    )
  })
})

describe('validateVacation', () => {
  const winter = { title: 'Зимові канікули', start_date: '2026-12-28', end_date: '2027-01-11' }

  it('вимагає дати й порядок', () => {
    expect(validateVacation({ start_date: '', end_date: '2026-11-01' }, sem1, [])).toBe('Вкажи обидві дати')
    expect(validateVacation({ start_date: '2026-11-01', end_date: '2026-10-26' }, sem1, [])).toBe('Початок пізніше за кінець')
  })

  it('лишається у своєму семестрі', () => {
    expect(validateVacation({ start_date: '2026-10-26', end_date: '2026-11-01' }, sem1, [])).toBeNull()
    expect(validateVacation({ start_date: '2026-12-20', end_date: '2026-12-30' }, sem1, [])).toBe('Виходить за межі: І семестр')
    expect(validateVacation({ start_date: '2027-03-22', end_date: '2027-03-28' }, sem1, [])).toBe('Виходить за межі: І семестр')
  })

  it('не перетинається з іншими канікулами', () => {
    const spring = { title: 'Весняні канікули', start_date: '2027-03-22', end_date: '2027-03-28' }
    expect(validateVacation({ start_date: '2027-03-25', end_date: '2027-04-02' }, sem2, [winter, spring])).toBe(
      'Перетинається з: Весняні канікули',
    )
  })
})

describe('planVacations', () => {
  const periods = [p('a', sem1.start_date, sem1.end_date, 0), p('b', sem2.start_date, sem2.end_date, 1)]

  it('без канікул беруться типові, зимові вираховуються', () => {
    expect(planVacations(periods, {})).toEqual({
      autumn: defaultVacations(2026).autumn,
      winter: { start_date: '2026-12-28', end_date: '2027-01-11' },
      spring: defaultVacations(2026).spring,
    })
  })

  it('наявні канікули лишаються, якщо вміщуються', () => {
    const autumn = { start_date: '2026-10-19', end_date: '2026-10-25' }
    expect(planVacations(periods, { autumn })?.autumn).toEqual(autumn)
  })

  it('канікули підганяються під скорочений семестр', () => {
    const short = [p('a', '2026-09-01', '2026-10-28', 0), p('b', sem2.start_date, sem2.end_date, 1)]
    expect(planVacations(short, {})?.autumn).toEqual({ start_date: '2026-10-26', end_date: '2026-10-28' })
  })

  it('без двох семестрів канікул немає', () => {
    expect(planVacations([periods[0]], {})).toBeNull()
  })
})

describe('vacationKind', () => {
  it('впізнає за назвою', () => {
    expect(vacationKind('Зимові канікули')).toBe('winter')
    expect(vacationKind('Свято')).toBeUndefined()
  })
})

describe('порожні дати семестрів', () => {
  const blank = [
    { parent_id: null, position: 0, start_date: '2026-09-01', end_date: '' },
    { parent_id: null, position: 1, start_date: '', end_date: '2027-06-30' },
  ]
  it('не дають плану канікул і зимових канікул', () => {
    expect(planVacations(blank, {})).toBeNull()
    expect(winterBreak(blank[0], blank[1])).toBeNull()
  })
  it('semestersComplete і vacationsComplete вимагають усі дати', () => {
    const full = [
      { parent_id: null, position: 0, start_date: '2026-09-01', end_date: '2026-12-26' },
      { parent_id: null, position: 1, start_date: '2027-01-12', end_date: '2027-06-30' },
    ]
    const off = (title: string) => ({ title, start_date: '2026-10-26', end_date: '2026-11-01' })
    expect(semestersComplete(blank)).toBe(false)
    expect(semestersComplete(full)).toBe(true)
    expect(vacationsComplete(full, [])).toBe(false)
    expect(vacationsComplete(full, [off('Осінні канікули')])).toBe(false)
    expect(vacationsComplete(full, [off('Осінні канікули'), off('Весняні канікули')])).toBe(true)
  })
})

it('семестр не перетинається із сусіднім, у якого дат ще немає', () => {
  const next = { title: 'ІІ семестр', start_date: '', end_date: '2027-06-30' }
  expect(validateSemester({ start_date: '2026-09-01', end_date: '2026-12-20' }, { year, next })).toBeNull()
})
