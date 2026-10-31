import type { ISODate, Period } from './types'
import { sortPeriods } from './year'

type Range = { start_date: ISODate; end_date: ISODate }
type Named = Range & { title: string }

export type VacationKind = 'autumn' | 'winter' | 'spring'

/** Назва в `days_off` (за нею канікули впізнаються) і короткий підпис на екрані. */
export const VACATIONS: Record<VacationKind, { title: string; label: string }> = {
  autumn: { title: 'Осінні канікули', label: 'Осінні' },
  winter: { title: 'Зимові канікули', label: 'Зимові' },
  spring: { title: 'Весняні канікули', label: 'Весняні' },
}

export function vacationKind(title: string): VacationKind | undefined {
  return (Object.keys(VACATIONS) as VacationKind[]).find((k) => VACATIONS[k].title === title)
}

function overlaps(a: Range, b: Range) {
  // Ще не вказана дата ні з чим не перетинається.
  if (!a.start_date || !a.end_date || !b.start_date || !b.end_date) return false
  return a.start_date <= b.end_date && b.start_date <= a.end_date
}

export function shiftDay(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10)
}

function isWeekend(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, day)).getUTCDay()
  return w === 0 || w === 6
}

/** Найближчий робочий день від `d` (сам `d`, якщо він робочий) у бік `step` (1 вперед, -1 назад). */
function weekday(d: ISODate, step: 1 | -1): ISODate {
  let x = d
  while (isWeekend(x)) x = shiftDay(x, step)
  return x
}

/**
 * Зимові канікули: від першого робочого дня після кінця першого семестру до останнього робочого дня
 * перед початком другого. Вихідні в межі не потрапляють: кінець семестру в п'ятницю — канікули з понеділка.
 */
export function winterBreak(first: Range, second: Range): Range | null {
  if (!first.end_date || !second.start_date) return null
  const r = { start_date: weekday(shiftDay(first.end_date, 1), 1), end_date: weekday(shiftDay(second.start_date, -1), -1) }
  return r.start_date <= r.end_date ? r : null
}

/** Типові осінні й весняні канікули (тиждень наприкінці жовтня й наприкінці березня). */
export function defaultVacations(startYear: number): Record<'autumn' | 'spring', Range> {
  return {
    autumn: { start_date: `${startYear}-10-26`, end_date: `${startYear}-11-01` },
    spring: { start_date: `${startYear + 1}-03-27`, end_date: `${startYear + 1}-04-04` },
  }
}

/** Діапазон, затиснутий у межі семестру; якщо повністю поза ними, лишається один день на краю. */
function fit(r: Range, sem: Range): Range {
  const start = r.start_date < sem.start_date ? sem.start_date : r.start_date
  const end = r.end_date > sem.end_date ? sem.end_date : r.end_date
  return start > end ? { start_date: end, end_date: end } : { start_date: start, end_date: end }
}

export type VacationPlan = Record<VacationKind, Range | null>

/**
 * Якими мають бути канікули при цих семестрах: зимові рахуються з семестрів, осінні й весняні беруться
 * з наявних (або типових) і не виходять за свій семестр. Без двох семестрів канікул немає (null).
 */
export function planVacations(
  periods: Pick<Period, 'parent_id' | 'position' | 'start_date' | 'end_date'>[],
  existing: Partial<Record<'autumn' | 'spring', Range>>,
): VacationPlan | null {
  const sems = sortPeriods(periods.filter((p) => !p.parent_id) as Period[])
  if (sems.length < 2) return null
  const first = sems[0]
  const second = sems[1]
  const last = sems[sems.length - 1]
  // Доки дати семестрів не вказано, канікули планувати нема з чого.
  if (sems.some((s) => !s.start_date || !s.end_date)) return null
  const def = defaultVacations(Number(first.start_date.slice(0, 4)))
  return {
    autumn: fit(existing.autumn ?? def.autumn, first),
    winter: winterBreak(first, second),
    spring: fit(existing.spring ?? def.spring, last),
  }
}

/** Дати семестру: по порядку, у межах року, без перетину з сусідніми семестрами й так, щоб його канікули лишились усередині. */
export function validateSemester(
  r: Range,
  ctx: { year: Range; prev?: Named; next?: Named; vacation?: Named },
): string | null {
  if (!r.start_date || !r.end_date) return 'Вкажи обидві дати'
  if (r.start_date > r.end_date) return 'Початок пізніше за кінець'
  if (r.start_date < ctx.year.start_date || r.end_date > ctx.year.end_date) return 'Виходить за межі навчального року'
  const clash = [ctx.prev, ctx.next].find((s) => s && overlaps(s, r))
  if (clash) return `Дати перетинаються з: ${clash.title}`
  const v = ctx.vacation
  if (v && (v.start_date < r.start_date || v.end_date > r.end_date)) return `${v.title} виходять за ці межі`
  return null
}

/** Осінні чи весняні канікули: по порядку, в межах свого семестру, без перетину з іншими канікулами. */
export function validateVacation(r: Range, semester: Named, others: Named[]): string | null {
  if (!semester.start_date || !semester.end_date) return `Спочатку вкажи дати: ${semester.title}`
  if (!r.start_date || !r.end_date) return 'Вкажи обидві дати'
  if (r.start_date > r.end_date) return 'Початок пізніше за кінець'
  if (r.start_date < semester.start_date || r.end_date > semester.end_date) return `Виходить за межі: ${semester.title}`
  const clash = others.find((o) => overlaps(o, r))
  if (clash) return `Перетинається з: ${clash.title}`
  return null
}

type Dated = Pick<Period, 'parent_id' | 'position' | 'start_date' | 'end_date'>

/** Чи вказано обидві дати кожного семестру. */
export function semestersComplete(periods: Dated[]): boolean {
  const sems = periods.filter((p) => !p.parent_id)
  return sems.length > 0 && sems.every((s) => s.start_date && s.end_date)
}

/** Чи вказано осінні й весняні канікули (потрібні, коли семестрів два й більше). */
export function vacationsComplete(periods: Dated[], daysOff: Named[]): boolean {
  if (periods.filter((p) => !p.parent_id).length < 2) return true
  return (['autumn', 'spring'] as const).every((k) => daysOff.some((d) => d.title === VACATIONS[k].title && d.start_date && d.end_date))
}
