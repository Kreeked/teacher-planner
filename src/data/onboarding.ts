import type { BellSchedule } from './types'
import { shiftSlots } from './timetable'

export type StepId = 'year' | 'periods' | 'classes' | 'subjects' | 'bells' | 'schedule'

export type Step = {
  id: StepId
  /** Підпис у степері. */
  title: string
  /** Заголовок екрана, коли він відрізняється від підпису. */
  heading?: string
  lead: string
  /** Що потрібно зробити, щоб піти далі; порожньо, якщо крок можна пропустити. */
  need: string
}

/** Екрани початкового налаштування: по одному на блок сторінки «Налаштування навчального року». */
export const STEPS: Step[] = [
  { id: 'year', title: 'Рік', heading: 'Навчальний рік', lead: 'Назва й межі навчального року. Усе інше налаштовується всередині цих дат.', need: 'Вкажи коректні дати року' },
  { id: 'periods', title: 'Семестри', heading: 'Семестри й канікули', lead: 'Початок року й кінець останнього семестру беруться з попереднього кроку. У канікули уроків не буде.', need: 'Потрібен хоча б один семестр' },
  { id: 'classes', title: 'Класи', lead: 'Класи, у яких ти ведеш уроки цього року.', need: 'Додай хоча б один клас' },
  { id: 'subjects', title: 'Предмети', lead: 'Кожен предмет — це КТП: спершу порожнє, теми й уроки додаш пізніше чи імпортуєш із Word.', need: 'Додай хоча б один предмет' },
  { id: 'bells', title: 'Дзвінки', lead: 'Час уроків і перерв кожної зміни.', need: 'Додай уроки хоча б однієї зміни' },
  { id: 'schedule', title: 'Розклад', lead: 'Постав класи в тижневий розклад. Без КТП теж можна, а пізніше розклад можна змінити.', need: '' },
]

export type Counts = {
  year: boolean
  semesters: number
  classes: number
  courses: number
  slots: number
}

export function countsOf(p: {
  year: unknown
  periods: { parent_id: string | null }[]
  classes: unknown[]
  courses: unknown[]
  bells?: Pick<BellSchedule, 'slots' | 'second_shift'>
}): Counts {
  return {
    year: !!p.year,
    semesters: p.periods.filter((x) => !x.parent_id).length,
    classes: p.classes.length,
    courses: p.courses.length,
    slots: shiftSlots(p.bells, 1).length + shiftSlots(p.bells, 2).length,
  }
}

/** Чи можна з цього кроку йти далі. */
export function canProceed(id: StepId, c: Counts): boolean {
  switch (id) {
    case 'year':
      return c.year
    case 'periods':
      return c.semesters > 0
    case 'classes':
      return c.classes > 0
    case 'subjects':
      return c.courses > 0
    case 'bells':
      return c.slots > 0
    default:
      return true
  }
}
