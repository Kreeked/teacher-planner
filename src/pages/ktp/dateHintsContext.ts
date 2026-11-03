import { createContext } from 'react'
import { PROBLEM_TEXT, type DateIssue } from '../../data/mismatch'
import { WEEKDAYS } from '../../data/schedule'
import type { ISODate } from '../../data/types'

export type DateHints = {
  issues: Map<string, DateIssue> // за id дати уроку
  weekdays: (classId: string, date: ISODate) => number[] // дні розкладу класу
}

export const DateHintsContext = createContext<DateHints>({
  issues: new Map(),
  weekdays: () => [],
})

/** Чому дата не збігається з розкладом — одним реченням. */
export function issueText(issue: DateIssue, weekdays: number[]) {
  if (issue.problem === 'weekday' && weekdays.length)
    return `${PROBLEM_TEXT.weekday}: у розкладі ${weekdays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).join(', ')}`
  return PROBLEM_TEXT[issue.problem]
}

