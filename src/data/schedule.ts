import type { ISODate, Lesson } from './types'

type Range = { start_date: ISODate; end_date: ISODate }

export const WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
]

export function addDays(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10)
}

/** День тижня: 1 = пн … 7 = нд. */
export function weekday(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay() || 7
}

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Автодати для одного класу: уроки без дати (крім «*») отримують наступні дні
 * з розкладу класу, що лежать у межах семестрів, — після останньої вже поставленої дати.
 * День тижня, повторений у weekdays, означає здвоєний урок: два уроки КТП в один день.
 * Уроки, що вже мають дату, не змінюються. Повертає лише нові дати.
 */
export function fillDates(
  lessons: Lesson[], // у порядку КТП
  existing: Map<string, ISODate>, // lesson_id → дата цього класу
  // Дні тижня уроків або функція «скільки уроків у цей день» (з тижневого розкладу).
  weekdays: number[] | ((d: ISODate) => number),
  terms: Range[], // семестри; без них — увесь рік
): { lessonId: string; date: ISODate }[] {
  if ((Array.isArray(weekdays) && !weekdays.length) || !terms.length) return []
  const sorted = [...terms].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const last = sorted[sorted.length - 1].end_date
  const inTerm = (d: ISODate) => sorted.some((t) => d >= t.start_date && d <= t.end_date)
  const count = Array.isArray(weekdays) ? (d: ISODate) => weekdays.filter((w) => w === weekday(d)).length : weekdays
  const perDay = (d: ISODate) => (inTerm(d) ? count(d) : 0)

  // Останній зайнятий день і скільки уроків у ньому вже стоїть.
  let cursor = addDays(sorted[0].start_date, -1)
  let used = 0
  const out: { lessonId: string; date: ISODate }[] = []
  for (const l of lessons) {
    const own = existing.get(l.id)
    if (own) {
      if (own > cursor) [cursor, used] = [own, 1]
      else if (own === cursor) used++
      continue
    }
    if (l.extra) continue
    if (used >= perDay(cursor)) {
      let d = addDays(cursor, 1)
      while (d <= last && !perDay(d)) d = addDays(d, 1)
      if (d > last) break
      ;[cursor, used] = [d, 0]
    }
    out.push({ lessonId: l.id, date: cursor })
    used++
  }
  return out
}
