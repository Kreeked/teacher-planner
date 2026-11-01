import type { DayOff, Period } from '../../data/types'
import { enteredAfter } from '../../data/vacations'
import { ask } from '../../lib/confirm'
import { resetText } from '../year/vacations'

/**
 * Користувач змінює дати кроку, після якого дати вже вказано: питаємо, чи видалити їх.
 * `false` — він передумав, і зміни немає.
 */
export async function confirmReset(step: 'year' | 'semesters', periods: Period[], daysOff: DayOff[]): Promise<boolean> {
  const entered = enteredAfter(step, periods, daysOff)
  if (!entered.semesters && !entered.vacations) return true
  return ask(resetText(entered), { title: step === 'year' ? 'Змінити дати року?' : 'Змінити дати семестру?', ok: 'Змінити' })
}
