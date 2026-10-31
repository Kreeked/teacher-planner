import type { WriteBatch } from 'firebase/firestore'
import { createDoc, ref, updateFields } from '../../data/db'
import type { DayOff, Period } from '../../data/types'
import { VACATIONS, planVacations, type VacationKind } from '../../data/vacations'

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
