import { describe, expect, it } from 'vitest'
import { groupLessons, hourWarnings, lessonsWord, moveLesson, moveTopic, renumber } from './ktp'
import type { Lesson, Topic } from './types'

function topic(id: string, position: number, planned_hours = 0): Topic {
  return { id, owner_id: 'u', course_id: 'c', position, title: id, planned_hours }
}

function lesson(id: string, topic_id: string, position: number, number = 0): Lesson {
  return {
    id,
    owner_id: 'u',
    course_id: 'c',
    topic_id,
    period_id: null,
    position,
    number,
    title: id,
    lesson_type: 'regular',
    homework: '',
    notes: '',
  }
}

const topics = [topic('T2', 1, 2), topic('T1', 0, 2)]
const lessons = [lesson('b', 'T1', 1, 2), lesson('a', 'T1', 0, 1), lesson('c', 'T2', 0, 3)]
const ids = (blocks: ReturnType<typeof groupLessons>) => blocks.map((b) => b.lessons.map((l) => l.id))

describe('groupLessons', () => {
  it('orders topics and their lessons by position', () => {
    const blocks = groupLessons(topics, lessons)
    expect(blocks.map((b) => b.topic.id)).toEqual(['T1', 'T2'])
    expect(ids(blocks)).toEqual([['a', 'b'], ['c']])
  })
})

describe('renumber', () => {
  it('returns nothing when numbers are already continuous', () => {
    expect(renumber(groupLessons(topics, lessons))).toEqual([])
  })

  it('closes gaps after a deletion', () => {
    const blocks = groupLessons(topics, lessons.filter((l) => l.id !== 'a'))
    expect(renumber(blocks)).toEqual([
      { id: 'b', topic_id: 'T1', position: 0, number: 1 },
      { id: 'c', topic_id: 'T2', position: 0, number: 2 },
    ])
  })
})

describe('extra lessons', () => {
  it('get no number and are not counted against planned hours', () => {
    const extra = { ...lesson('x', 'T1', 1), extra: true }
    const blocks = groupLessons(topics, [lesson('a', 'T1', 0, 1), extra, lesson('b', 'T1', 2, 3), lesson('c', 'T2', 0, 4)])
    expect(renumber(blocks)).toEqual([
      { id: 'b', topic_id: 'T1', position: 2, number: 2 },
      { id: 'c', topic_id: 'T2', position: 0, number: 3 },
    ])
    expect(hourWarnings(blocks, 3).map((w) => w.text)).toEqual(['1 урок із 2 год'])
  })
})

describe('moveLesson', () => {
  const blocks = groupLessons(topics, lessons)

  it('swaps inside a topic', () => {
    expect(ids(moveLesson(blocks, 'b', -1))).toEqual([['b', 'a'], ['c']])
  })

  it('moves across the topic boundary', () => {
    expect(ids(moveLesson(blocks, 'b', 1))).toEqual([['a'], ['b', 'c']])
    expect(ids(moveLesson(blocks, 'c', -1))).toEqual([['a', 'b', 'c'], []])
  })

  it('stays put at the very ends', () => {
    expect(ids(moveLesson(blocks, 'a', -1))).toEqual([['a', 'b'], ['c']])
    expect(ids(moveLesson(blocks, 'c', 1))).toEqual([['a', 'b'], ['c']])
  })

  it('renumbers after a move across topics', () => {
    const moved = moveLesson(blocks, 'b', 1)
    expect(renumber(moved)).toEqual([{ id: 'b', topic_id: 'T2', position: 0, number: 2 }, { id: 'c', topic_id: 'T2', position: 1, number: 3 }])
  })
})

describe('moveTopic', () => {
  it('moves a topic with its lessons and renumbers', () => {
    const moved = moveTopic(groupLessons(topics, lessons), 'T2', -1)
    expect(ids(moved)).toEqual([['c'], ['a', 'b']])
    expect(renumber(moved).map((p) => [p.id, p.number])).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ])
  })
})

describe('hourWarnings', () => {
  it('flags topics and the course whose lesson count differs from the plan', () => {
    const w = hourWarnings(groupLessons(topics, lessons), 4)
    expect(w).toEqual([
      { topicId: 'T2', text: '1 урок із 2 год' },
      { text: 'У КТП 3 уроки, а за планом 4 год' },
    ])
  })
})

describe('lessonsWord', () => {
  it('declines the noun', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 70].map(lessonsWord)).toEqual([
      'урок',
      'уроки',
      'уроків',
      'уроків',
      'уроків',
      'урок',
      'уроки',
      'уроків',
      'уроків',
    ])
  })
})
