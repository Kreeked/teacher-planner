import { describe, expect, it } from 'vitest'
import {
  classifyLegacy,
  driveFolder,
  formatSize,
  groupByCategory,
  linkTitle,
  materialType,
  materialsOf,
  normalizeUrl,
  placeMaterial,
  shelfPatches,
} from './materials'
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

  const f = (
    id: string,
    category: LessonMaterial['category'],
    position: number,
    title = `${id}.pdf`,
    lesson_id = 'L',
  ) => ({ id, lesson_id, topic_id: null, kind: 'file', mime_type: null, title, category, position }) as LessonMaterial

  it('groups lesson files by category, sorted by position', () => {
    const g = groupByCategory([
      f('c2', 'card', 1),
      f('s1', 'slides', 0),
      f('c1', 'card', 0),
      f('x', null, 0),
      f('old', undefined, 3),
      f('odd', 'unknown' as never, 1),
    ])
    expect(Object.keys(g)).toEqual(['slides', 'card', 'shelter', 'remote', 'test', 'none'])
    expect(g.card.map((m) => m.id)).toEqual(['c1', 'c2'])
    expect(g.slides.map((m) => m.id)).toEqual(['s1'])
    expect(g.shelter).toEqual([])
    // Без типу, старі без поля й невідомі — у «Без типу».
    expect(g.none.map((m) => m.id)).toEqual(['x', 'odd', 'old'])
  })

  it('classifies old lesson files once: presentations to slides, the rest without type', () => {
    const all = [
      f('s', 'slides', 0),
      f('p1', undefined, 0, 'Урок 5.pptx'),
      f('d', undefined, 1, 'Картка.docx'),
      f('p2', undefined, 2, 'Слайди.odp'),
      f('k', undefined, 3, 'Keynote.key'),
      f('t', undefined, 0, 'Тема.pptx', null as never),
      f('done', null, 4, 'Нове.pptx'),
    ]
    expect(classifyLegacy(all)).toEqual([
      { id: 'p1', category: 'slides', position: 1 },
      { id: 'd', category: null, position: 5 },
      { id: 'p2', category: 'slides', position: 2 },
      { id: 'k', category: 'slides', position: 3 },
    ])
    const gslides = { ...f('g', undefined, 0, 'Презентація'), mime_type: 'application/vnd.google-apps.presentation' }
    expect(classifyLegacy([gslides])).toEqual([{ id: 'g', category: 'slides', position: 0 }])
    expect(classifyLegacy([f('a', 'card', 0), f('b', null, 0)])).toEqual([])
  })

  it('moves files between sections and within one', () => {
    const g = groupByCategory([f('a', 'card', 0), f('b', 'card', 1), f('c', null, 0), f('s', 'slides', 0)])
    // Із «Без типу» в картку, на перше місце.
    const moved = placeMaterial(g, 'c', 'card', 0)
    expect(moved.card.map((m) => m.id)).toEqual(['c', 'a', 'b'])
    expect(moved.none).toEqual([])
    expect(shelfPatches(moved)).toEqual([
      { id: 'c', category: 'card', position: 0 },
      { id: 'a', category: 'card', position: 1 },
      { id: 'b', category: 'card', position: 2 },
    ])
    // Перестановка в тому самому розділі.
    const swapped = placeMaterial(g, 'a', 'card', 1)
    expect(swapped.card.map((m) => m.id)).toEqual(['b', 'a'])
    expect(shelfPatches(swapped)).toEqual([
      { id: 'b', category: 'card', position: 0 },
      { id: 'a', category: 'card', position: 1 },
    ])
    // Нічого не змінилося — нічого не пишемо.
    expect(shelfPatches(g)).toEqual([])
  })
})
