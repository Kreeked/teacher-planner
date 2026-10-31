import { addDays, weekday } from './schedule'
import type { ISODate, Period } from './types'
import { sortPeriods } from './year'

type Range = { start_date: ISODate; end_date: ISODate }

/** Навчальних тижнів у семестрі: тижні пн–пт, у яких є хоча б один день поза канікулами. */
export function teachingWeeks(sem: Range, daysOff: Range[]): number {
  const weeks = new Set<ISODate>()
  for (let d = sem.start_date; d <= sem.end_date; d = addDays(d, 1)) {
    const w = weekday(d)
    if (w > 5 || daysOff.some((o) => o.start_date <= d && d <= o.end_date)) continue
    weeks.add(addDays(d, 1 - w))
  }
  return weeks.size
}

/** Тижні І семестру й решти семестрів (годин «ІІ семестру» стосуються всіх наступних). */
export function semesterWeeks(periods: Pick<Period, 'parent_id' | 'position' | 'start_date' | 'end_date'>[], daysOff: Range[]) {
  const sems = sortPeriods(periods.filter((p) => !p.parent_id) as Period[]).map((s) => teachingWeeks(s, daysOff))
  return { w1: sems[0] ?? 0, w2: sems.slice(1).reduce((a, b) => a + b, 0) }
}

/** Година в полі: лише цифри, порожньо — ще не вказано. */
export function parseHours(v: string): number | null {
  return /^\d+$/.test(v) ? Number(v) : null
}

export type SubjectDraft = {
  subject: string
  grade: number | null
  h1: string
  h2: string
  year: string
  classIds: string[]
}

/** Чому картку ще не можна зберегти; `null` — з нею все гаразд. */
export function subjectIssue(c: SubjectDraft, others: SubjectDraft[]): 'incomplete' | 'taken' | 'zero' | null {
  const [h1, h2, year] = [c.h1, c.h2, c.year].map(parseHours)
  if (!c.subject.trim() || c.grade === null || h1 === null || h2 === null || year === null || !c.classIds.length) return 'incomplete'
  const name = c.subject.trim().toLowerCase()
  if (others.some((o) => o.grade === c.grade && o.subject.trim().toLowerCase() === name)) return 'taken'
  return year === 0 ? 'zero' : null
}

/** Розбіжність годин з календарем: текст помилки або `null`. Лише попередження, зберегти можна й так. */
export function hoursMismatch(c: Pick<SubjectDraft, 'h1' | 'h2' | 'year'>, weeks: { w1: number; w2: number }): string | null {
  const [h1, h2, year] = [c.h1, c.h2, c.year].map(parseHours)
  if (h1 === null || h2 === null || year === null) return null
  const expected = h1 * weeks.w1 + h2 * weeks.w2
  if (expected === year) return null
  return `Не збігається з календарем: ${h1} × ${weeks.w1} + ${h2} × ${weeks.w2} = ${expected} год, а вказано ${year}`
}
