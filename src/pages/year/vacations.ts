import type { WriteBatch } from 'firebase/firestore'
import { createDoc, ref, updateFields } from '../../data/db'
import type { DayOff, Period } from '../../data/types'
import { VACATIONS, clearedSemesterDates, planVacations, vacationKind, type VacationKind } from '../../data/vacations'

/**
 * Дати, що залежать від попереднього кроку, скидаються: так користувач не лишає старі дати, що не пасують до нових.
 * Початок першого й кінець останнього семестру не скидаються (їх виставляє рік), зимові канікули перераховуються самі.
 * Повертає семестри й канікули вже без цих дат.
 */
export function resetEntered<P extends Pick<Period, 'id' | 'parent_id' | 'position' | 'start_date' | 'end_date'>>(
  step: 'year' | 'semesters',
  periods: P[],
  daysOff: DayOff[],
  batch: WriteBatch,
): { periods: P[]; daysOff: DayOff[] } {
  let nextPeriods = periods
  if (step === 'year') {
    const kept = clearedSemesterDates(periods)
    nextPeriods = periods.map((p) => {
      const k = kept.find((x) => x.id === p.id)
      if (!k || (k.start_date === p.start_date && k.end_date === p.end_date)) return p
      updateFields('periods', p.id, { start_date: k.start_date, end_date: k.end_date }, batch)
      return { ...p, start_date: k.start_date, end_date: k.end_date }
    })
  }
  const nextDaysOff = daysOff.map((d) => {
    if (!vacationKind(d.title) || vacationKind(d.title) === 'winter' || (!d.start_date && !d.end_date)) return d
    updateFields('days_off', d.id, { start_date: '', end_date: '' }, batch)
    return { ...d, start_date: '', end_date: '' }
  })
  return { periods: nextPeriods, daysOff: nextDaysOff }
}

/** Текст вікна: що буде видалено на наступних кроках і що перерахується саме. */
export function resetText(step: 'year' | 'semesters', entered: { semesters: boolean; vacations: boolean }): string {
  const lost = [entered.semesters && 'на кроці «Семестри»', entered.vacations && 'на кроці «Канікули»'].filter(Boolean).join(' і ')
  const auto = step === 'year' ? 'Початок першого й кінець останнього семестру, а також зимові канікули перерахуються автоматично.' : 'Зимові канікули перерахуються автоматично.'
  return `Дати ${lost}, які ти вже вказав, буде видалено, і їх треба буде вказати знову. ${auto}`
}

const KINDS: VacationKind[] = ['autumn', 'winter', 'spring']

/**
 * Приводить осінні, зимові й весняні канікули у відповідність до семестрів: недостаючі створює,
 * зимові перераховує, осінні й весняні не випускає за межі свого семестру.
 */
export function syncVacations(
  yearId: string,
  periods: Pick<Period, 'parent_id' | 'position' | 'start_date' | 'end_date'>[],
  daysOff: DayOff[],
  batch: WriteBatch,
  /** Чи створювати відсутні осінні й весняні канікули типовими датами (в онбордингу їх вказує користувач). */
  defaults = true,
) {
  const find = (k: VacationKind) => daysOff.find((d) => d.title === VACATIONS[k].title)
  const plan = planVacations(periods, { autumn: find('autumn'), spring: find('spring') })
  if (!plan) return
  for (const k of KINDS) {
    const doc = find(k)
    const want = plan[k]
    if (want && doc) {
      if (doc.start_date !== want.start_date || doc.end_date !== want.end_date) updateFields('days_off', doc.id, want, batch)
    } else if (want && (defaults || k === 'winter')) {
      createDoc('days_off', { academic_year_id: yearId, title: VACATIONS[k].title, ...want }, batch)
    } else if (doc) {
      batch.delete(ref('days_off', doc.id))
    }
  }
}
