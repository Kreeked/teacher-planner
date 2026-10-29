/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { questionRow, testFileName, testTarget, testsWord, testXlsx, type LegacyTest } from './legacyTests'
import type { Lesson, Topic } from './types'

const q = (patch: Partial<LegacyTest['questions'][number]>) => ({
  text: 'Драйвер — це:',
  type: 'Multiple Choice',
  options: ['Програма', 'Пристрій', 'Утиліта', 'Файл'],
  correct: [1],
  time: 30,
  image: null,
  explanation: 'Пояснення',
  ...patch,
})

/** Текст клітинок аркуша по рядках (inline-рядки й спільні рядки шаблону). */
function rows(sheet: string, sharedXml: string) {
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''),
  )
  return [...sheet.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)].map((r) => ({
    n: Number(r[1]),
    cells: [...(r[2] ?? '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
      const body = c[3] ?? ''
      if (/t="s"/.test(c[2])) return shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])]
      return /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''
    }),
  }))
}

describe('legacy tests', () => {
  it('writes a question row in template column order', () => {
    expect(questionRow(q({ correct: [2], time: 45 }))).toEqual([
      'Драйвер — це:',
      'Multiple Choice',
      'Програма',
      'Пристрій',
      'Утиліта',
      'Файл',
      null,
      2,
      45,
      null,
      'Пояснення',
    ])
    expect(questionRow(q({ type: 'Checkbox', correct: [3, 1] }))[7]).toBe('1,3')
    expect(questionRow(q({ type: 'Open-Ended' })).slice(2, 8)).toEqual([null, null, null, null, null, null])
  })

  it('builds a Wayground .xlsx from an old test', () => {
    const template = new Uint8Array(readFileSync('src/assets/wayground_template.xlsx'))
    const out = unzipSync(
      testXlsx(template, { questions: [q({ text: 'A & <B>', correct: [4] }), q({ text: 'Друге' })] }),
    )
    const sheet = strFromU8(out['xl/worksheets/sheet1.xml'])
    const all = rows(sheet, strFromU8(out['xl/sharedStrings.xml']))
    // Заголовки шаблону на місці, далі наші питання, приклади стерто.
    expect(all[0].cells[0]).toBe('Question Text')
    const data = all.filter((r) => r.n >= 3 && r.cells.some(Boolean))
    expect(data.map((r) => [r.n, r.cells[0], r.cells[7]])).toEqual([
      [3, 'A &amp; &lt;B&gt;', '4'],
      [4, 'Друге', '1'],
    ])
    expect(sheet).toContain('<dataValidations')
    expect(sheet.match(/<row r="8"/g)).toHaveLength(1)
  })

  it('names files and counts', () => {
    expect(testFileName({ title: 'Бази даних: 9/А' })).toBe('Тест_Бази даних  9 А.xlsx')
    expect(testFileName({ title: '' })).toBe('Тест_Wayground.xlsx')
    expect([1, 2, 5, 11, 21, 23].map((n) => testsWord(n))).toEqual([
      'старий тест',
      'старі тести',
      'старих тестів',
      'старих тестів',
      'старий тест',
      'старі тести',
    ])
  })

  it('picks where an old test goes', () => {
    const topics = [
      { id: 'T2', position: 1 },
      { id: 'T1', position: 0 },
      { id: 'T3', position: 2 },
    ] as Topic[]
    const lessons = [
      { id: 'L2', topic_id: 'T1', position: 1 },
      { id: 'L1', topic_id: 'T1', position: 0 },
      { id: 'L3', topic_id: 'T2', position: 0 },
    ] as Lesson[]
    const at = (lesson_id: string | null, topic_id: string | null) => {
      const r = testTarget({ lesson_id, topic_id }, topics, lessons)
      return r?.lesson?.id ?? r?.topic?.id
    }
    expect(at('L2', 'T1')).toBe('L2') // тест уроку
    expect(at(null, 'T2')).toBe('L3') // тест теми — перший урок теми
    expect(at(null, 'T3')).toBe('T3') // тема без уроків — матеріал теми
    expect(at(null, null)).toBe('L1') // без прив'язки — перша тема курсу
    expect(at('gone', 'gone')).toBe('L1') // урок і тема видалені
    expect(testTarget({ lesson_id: null, topic_id: null }, [], [])).toBeNull()
  })
})
