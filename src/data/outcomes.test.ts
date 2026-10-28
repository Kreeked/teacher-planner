import { describe, expect, it } from 'vitest'
import { coverage, outcomeUsage, parseOutcomeList } from './outcomes'
import type { LearningOutcome, Lesson } from './types'

describe('parseOutcomeList', () => {
  it('splits lines and strips bullets and numbering', () => {
    const text = `1. пояснює поняття алгоритму;
    – наводить приклади алгоритмів
    • створює   програму з розгалуженням,

    а) аналізує результат`
    expect(parseOutcomeList(text)).toEqual([
      'пояснює поняття алгоритму',
      'наводить приклади алгоритмів',
      'створює програму з розгалуженням',
      'аналізує результат',
    ])
  })

  it('skips duplicates, including already existing outcomes', () => {
    expect(parseOutcomeList('Пояснює поняття\nпояснює   поняття.\nНове', ['нове'])).toEqual(['Пояснює поняття'])
  })
})

const outcomes = ['a', 'b', 'c'].map((id, position) => ({ id, owner_id: 'u', course_id: 'c', text: id, position })) as LearningOutcome[]
const lesson = (number: number, outcome_ids?: string[]) => ({ id: `l${number}`, number, outcome_ids }) as Lesson

describe('coverage', () => {
  const lessons = [lesson(2, ['a', 'b']), lesson(1, ['a']), lesson(3), lesson(4, ['deleted'])]

  it('maps outcomes to lesson numbers in order', () => {
    expect(outcomeUsage(lessons).get('a')).toEqual([1, 2])
  })

  it('counts covered outcomes and lessons without any', () => {
    expect(coverage(outcomes, lessons)).toEqual({ covered: 2, total: 3, lessonsWithout: 2 })
  })
})
