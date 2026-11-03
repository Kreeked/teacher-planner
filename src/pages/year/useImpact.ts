import { useCallback } from 'react'
import { useCollection } from '../../data/db'
import { datesAtRisk, type SetupChange } from '../../data/impact'
import { toISO } from '../../data/schedule'
import type { AcademicYear } from '../../data/types'
import { ask } from '../../lib/confirm'
import { useYearData } from './useYearData'

const datesWord = (n: number) => {
  const d = n % 10
  const h = n % 100
  return d === 1 && h !== 11 ? 'дата' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'дати' : 'дат'
}

/** Текст про наслідки зміни для дат КТП; порожній, якщо дати не постраждають. */
export function impactText(n: number) {
  return n
    ? `${n} ${datesWord(n)} уроків у КТП перестануть збігатися з розкладом: опиняться поза семестром, у день без уроків чи без розкладу. Самі дати не зміняться, їх можна буде виправити в КТП.`
    : ''
}

/**
 * Перевірка перед зміною налаштувань року: скільки дат КТП вона зачепить. Якщо жодної, зміна проходить мовчки,
 * інакше користувач підтверджує її у вікні з числом.
 */
export function useImpact(year: AcademicYear | undefined) {
  const { periods, daysOff, courses, entries } = useYearData(year)
  const { items: timetables } = useCollection('timetables', year ? { field: 'academic_year_id', value: year.id } : null)
  const { items: schedules } = useCollection('lesson_schedules')

  const count = useCallback(
    (change: SetupChange) =>
      year
        ? datesAtRisk(
            { year, periods, daysOff, timetables, entries },
            change,
            courses.map((c) => c.id),
            schedules,
            toISO(new Date()),
          )
        : 0,
    [year, periods, daysOff, timetables, entries, courses, schedules],
  )

  const confirm = useCallback(
    async (change: SetupChange, title: string) => {
      const n = count(change)
      return n === 0 || ask(impactText(n), { title, ok: 'Змінити', danger: false })
    },
    [count],
  )

  return { count, confirm }
}
