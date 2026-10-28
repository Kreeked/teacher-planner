import { describe, expect, it } from 'vitest'
import { driveFolder, formatSize, linkTitle, materialType, materialsOf, normalizeUrl } from './materials'
import type { AcademicYear, Course, Lesson, LessonMaterial, Topic } from './types'

const year = { title: '2026/2027' } as AcademicYear
const course = { subject: 'Інформатика', grade: 9 } as Course

describe('materials', () => {
  it('builds the Drive folder path', () => {
    expect(driveFolder(year, course, { lesson: { number: 5 } as Lesson })).toEqual([
      'Планер',
      '2026–2027',
      'Інформатика, 9 клас',
      'Урок 5',
    ])
    expect(driveFolder(year, course, { topic: { title: 'Бази даних' } as Topic })[3]).toBe('Тема. Бази даних')
  })

  it('lists own lesson materials before topic ones', () => {
    const m = (id: string, lesson_id: string | null, topic_id: string | null, position: number) =>
      ({ id, lesson_id, topic_id, position }) as LessonMaterial
    const all = [m('t1', null, 'T', 0), m('l2', 'L', null, 1), m('l1', 'L', null, 0), m('x', 'other', null, 0)]
    const r = materialsOf(all, { id: 'L', topic_id: 'T' } as Lesson)
    expect(r.own.map((x) => x.id)).toEqual(['l1', 'l2'])
    expect(r.topic.map((x) => x.id)).toEqual(['t1'])
  })

  it('normalizes links', () => {
    expect(normalizeUrl('wayground.com/join')).toBe('https://wayground.com/join')
    expect(normalizeUrl('https://youtu.be/x')).toBe('https://youtu.be/x')
    expect(normalizeUrl('просто текст')).toBeNull()
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(linkTitle('https://www.youtube.com/watch?v=1')).toBe('youtube.com')
  })

  it('recognises file types and sizes', () => {
    expect(
      materialType({
        kind: 'file',
        mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        title: 'a',
      }),
    ).toBe('slides')
    expect(materialType({ kind: 'file', mime_type: '', title: 'Картка.pdf' })).toBe('pdf')
    expect(materialType({ kind: 'link', mime_type: null, title: 'x' })).toBe('link')
    expect(formatSize(200 * 1024)).toBe('200 КБ')
    expect(formatSize(5.5 * 1024 * 1024)).toBe('5.5 МБ')
  })
})
