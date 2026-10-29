/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyTest } from '../data/legacyTests'
import type { Course, Lesson, LessonMaterial, Topic } from '../data/types'

const log: string[] = []
const created: Partial<LessonMaterial>[] = []

vi.mock('./firebase', () => ({ auth: { currentUser: { uid: 'u' } }, db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_: unknown, id: string) => id,
  onSnapshot: () => () => {},
  query: () => ({}),
  where: () => ({}),
  deleteDoc: async (id: string) => void log.push(`delete ${id}`),
}))
vi.mock('../data/db', () => ({
  createDoc: (_: string, data: Partial<LessonMaterial>) => {
    created.push(data)
    log.push(`material ${data.title}`)
    return 'm'
  },
}))
vi.mock('./drive', () => ({
  uploadFile: async (file: File, folder: string[]) => {
    if (file.name.includes('Зламаний')) throw new Error('Диск недоступний.')
    log.push(`upload ${file.name} → ${folder.at(-1)}`)
    return { id: `d-${file.name}`, name: file.name, mimeType: file.type, size: file.size }
  },
}))

const { migrateTests } = await import('./migrateTests')

const course = { id: 'C', subject: 'Інформатика', grade: 9 } as Course
const topics = [{ id: 'T', position: 0, title: 'Бази' }] as Topic[]
const lessons = [{ id: 'L', topic_id: 'T', position: 0, number: 1 }] as Lesson[]
const test = (id: string, title: string, lesson_id: string | null) =>
  ({ id, title, lesson_id, topic_id: 'T', course_id: 'C', questions: [] }) as unknown as LegacyTest

describe('migrateTests', () => {
  beforeEach(() => {
    log.length = 0
    created.length = 0
    vi.stubGlobal('fetch', async () => new Response(readFileSync('src/assets/wayground_template.xlsx')))
  })

  it('uploads each test as a «Тест» file and deletes it only after that', async () => {
    const existing = [{ lesson_id: 'L', category: 'test', position: 0 }] as LessonMaterial[]
    const n = await migrateTests(
      [test('a', 'Перший', 'L'), test('b', 'Другий', null)],
      {
        course,
        topics,
        lessons,
        materials: existing,
      },
      () => {},
    )
    expect(n).toBe(2)
    expect(log).toEqual([
      'upload Тест_Перший.xlsx → Урок 1',
      'material Тест_Перший.xlsx',
      'delete a',
      'upload Тест_Другий.xlsx → Урок 1',
      'material Тест_Другий.xlsx',
      'delete b',
    ])
    expect(created.map((m) => [m.lesson_id, m.category, m.position])).toEqual([
      ['L', 'test', 1],
      ['L', 'test', 2],
    ])
  })

  it('stops on an error and keeps the test that failed', async () => {
    await expect(
      migrateTests(
        [test('a', 'Зламаний', 'L'), test('b', 'Другий', 'L')],
        { course, topics, lessons, materials: [] },
        () => {},
      ),
    ).rejects.toThrow('Диск недоступний.')
    expect(log).toEqual([])
  })
})
