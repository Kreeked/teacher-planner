import { addDays } from './schedule'
import { cellsOn, dateProblem, type ScheduleData } from './mismatch'
import type { ISODate, Lesson } from './types'

export type FillInput = {
  lessons: Lesson[] // уроки КТП у порядку проведення
  existing: Map<string, ISODate> // дати класу, що вже є: урок → дата
  classId: string
  courseId: string
  sched: ScheduleData
  from: ISODate
  end: ISODate
  // Межі періоду (семестр, чверть) за id: урок із period_id не виходить за них.
  ranges: Map<string, { start: ISODate; end: ISODate }>
}

export type FillResult = {
  placements: { lessonId: string; date: ISODate }[]
  unplaced: string[] // уроки, для яких не вистачило днів у розкладі
  skippedExtra: number // уроки «*» (лише для частини класів): дат не ставимо
}

/**
 * Розставляє дати лише порожнім урокам класу за днями розкладу: уроки йдуть по черзі, кожен не раніше за попередній,
 * без днів без уроків, а в одну клітинку розкладу — один урок. Уже поставлені дати не змінюються
 * й задають, звідки продовжувати.
 */
export function fillDates(i: FillInput): FillResult {
  // Дні, коли клас має урок цього КТП, і скільки уроків у такий день.
  const days: ISODate[] = []
  const capacity = new Map<ISODate, number>()
  for (let d = i.from; d <= i.end; d = addDays(d, 1)) {
    if (dateProblem(d, i.classId, i.courseId, i.sched)) continue
    days.push(d)
    capacity.set(d, cellsOn(i.sched, i.classId, i.courseId, d).length)
  }
  const used = new Map<ISODate, number>()
  for (const d of i.existing.values()) used.set(d, (used.get(d) ?? 0) + 1)

  const result: FillResult = { placements: [], unplaced: [], skippedExtra: 0 }
  let floor = i.from
  let at = 0
  for (const lesson of i.lessons) {
    const own = i.existing.get(lesson.id)
    if (own) {
      if (own > floor) floor = own
      continue
    }
    if (lesson.extra) {
      result.skippedExtra++
      continue
    }
    const range = lesson.period_id ? i.ranges.get(lesson.period_id) : undefined
    const start = range && range.start > floor ? range.start : floor
    while (at < days.length && days[at] < start) at++
    let j = at
    while (j < days.length && (used.get(days[j]) ?? 0) >= (capacity.get(days[j]) ?? 0)) j++
    if (j >= days.length || (range && days[j] > range.end)) {
      result.unplaced.push(lesson.id)
      continue
    }
    const date = days[j]
    used.set(date, (used.get(date) ?? 0) + 1)
    result.placements.push({ lessonId: lesson.id, date })
    floor = date
    at = j
  }
  return result
}
