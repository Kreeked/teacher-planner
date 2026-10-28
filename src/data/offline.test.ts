import { describe, expect, it } from 'vitest'
import { OFFLINE_LIMIT, offlinePlan } from './offline'
import type { Lesson, LessonMaterial, LessonSchedule } from './types'

const MB = 1024 * 1024

const file = (id: string, target: Partial<LessonMaterial>, size: number | null = MB) =>
  ({
    id,
    kind: 'file',
    drive_file_id: `d-${id}`,
    lesson_id: null,
    topic_id: null,
    position: 0,
    keep_offline: false,
    size_bytes: size,
    ...target,
  }) as LessonMaterial

const lessons = [
  { id: 'L1', topic_id: 'T' },
  { id: 'L2', topic_id: 'T' },
  { id: 'L3', topic_id: 'U' },
] as Lesson[]

const sched = (lesson_id: string, planned_date: string) => ({ lesson_id, planned_date }) as LessonSchedule

describe('offlinePlan', () => {
  it('takes pinned files and files of lessons in the next 7 days', () => {
    const materials = [
      file('a', { lesson_id: 'L1' }),
      file('b', { lesson_id: 'L2' }),
      file('t', { topic_id: 'T' }),
      file('p', { lesson_id: 'L3', keep_offline: true }),
      { ...file('link', { lesson_id: 'L1' }), kind: 'link', drive_file_id: null } as LessonMaterial,
    ]
    const schedules = [sched('L2', '2026-11-04'), sched('L1', '2026-10-28'), sched('L3', '2026-11-05')]
    const plan = offlinePlan(materials, schedules, lessons, '2026-10-28')
    // L3 і L2 поза тижнем (до 03.11 включно), але p позначено «завжди».
    expect(plan.keep.map((x) => [x.material.id, x.date])).toEqual([
      ['p', null],
      ['a', '2026-10-28'],
      ['t', '2026-10-28'],
    ])
    expect(plan.bytes).toBe(3 * MB)
  })

  it('counts a Drive file once and skips past lessons', () => {
    const materials = [file('a', { lesson_id: 'L1' }), { ...file('a2', { lesson_id: 'L2' }), drive_file_id: 'd-a' }]
    const schedules = [sched('L1', '2026-10-27'), sched('L1', '2026-10-30'), sched('L2', '2026-10-29')]
    const plan = offlinePlan(materials, schedules, lessons, '2026-10-28')
    expect(plan.keep.map((x) => [x.material.id, x.date])).toEqual([['a2', '2026-10-29']])
  })

  it('stops at the size limit, preferring earlier lessons', () => {
    const materials = [file('big', { lesson_id: 'L1' }, OFFLINE_LIMIT - MB), file('b', { lesson_id: 'L2' }, 2 * MB)]
    const schedules = [sched('L1', '2026-10-28'), sched('L2', '2026-10-29')]
    const plan = offlinePlan(materials, schedules, lessons, '2026-10-28')
    expect(plan.keep.map((x) => x.material.id)).toEqual(['big'])
    expect(plan.over.map((x) => x.material.id)).toEqual(['b'])
    // Справжній розмір збереженої копії важливіший за записаний.
    const exact = offlinePlan(materials, schedules, lessons, '2026-10-28', new Map([['d-b', MB / 2]]))
    expect(exact.over).toEqual([])
  })
})
