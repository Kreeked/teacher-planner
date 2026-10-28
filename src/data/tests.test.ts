/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildXlsx, sheetRows } from '../import/xlsx'
import { checkTest, newQuestion, questionRow, questionsFromRows, testsOf, titleFromFile } from './tests'
import type { Question, Test } from './types'

const q = (patch: Partial<Question>): Question => ({
  ...newQuestion(),
  text: 'Драйвер — це:',
  options: ['Програма', 'Пристрій', 'Утиліта', 'Файл'],
  explanation: 'Пояснення',
  ...patch,
})

describe('tests', () => {
  it('turns template rows into questions', () => {
    const rows = [
      ['Question Text', 'Question Type', 'Option 1'],
      ['Text of the question\n\n(required)'],
      ['Що таке ОС?', 'Multiple Choice', 'Програма', 'Пристрій', 'Файл', '', '', '1', '20', '', 'Бо так'],
      ['Оберіть планети', 'Checkbox', 'Марс', 'Місяць', 'Венера', '', '', '1,3', '45'],
      ['', '', ''],
      ['Назвіть супутник', 'Fill-in-the-Blank', 'Фобос', 'Деймос', '', '', '', '', '25'],
    ]
    const qs = questionsFromRows(rows)
    expect(qs.map((x) => [x.text, x.type, x.options, x.correct, x.time])).toEqual([
      ['Що таке ОС?', 'Multiple Choice', ['Програма', 'Пристрій', 'Файл'], [1], 20],
      ['Оберіть планети', 'Checkbox', ['Марс', 'Місяць', 'Венера'], [1, 3], 45],
      ['Назвіть супутник', 'Fill-in-the-Blank', ['Фобос', 'Деймос'], [], 30],
    ])
    expect(qs[0].explanation).toBe('Бо так')
  })

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

  it('checks a test before export', () => {
    const issues = checkTest([
      q({}),
      q({ options: ['a', 'b', '', ''], correct: [3] }),
      q({ text: 'Інше', correct: [] }),
      q({ text: 'Довге', options: ['Дуже довгий правильний варіант відповіді', 'Ні', 'Так', 'Мабуть'] }),
    ])
    expect(issues.map((i) => [i.question, i.blocking, i.text])).toEqual([
      [2, true, 'повторює питання 1'],
      [2, true, 'правильна відповідь указує на порожній варіант'],
      [3, true, 'не позначено правильну відповідь'],
      [4, false, 'правильний варіант набагато довший за інші, його легко вгадати'],
    ])
  })

  it('round-trips questions through the Wayground template', () => {
    const template = new Uint8Array(readFileSync('src/assets/wayground_template.xlsx'))
    const qs = [q({ text: 'A & <B> "лапки"', correct: [4] }), q({ text: 'Друге', type: 'Poll', correct: [] })]
    const out = unzipSync(buildXlsx(template, qs.map(questionRow)))
    const sheet = strFromU8(out['xl/worksheets/sheet1.xml'])
    const rows = sheetRows(sheet, strFromU8(out['xl/sharedStrings.xml']))
    // Заголовки шаблону на місці, приклади стерто.
    expect(rows[0][0]).toBe('Question Text')
    expect(questionsFromRows(rows).map((x) => [x.text, x.type, x.correct])).toEqual([
      ['A & <B> "лапки"', 'Multiple Choice', [4]],
      ['Друге', 'Poll', []],
    ])
    expect(sheet).toContain('<dataValidations')
    expect(sheet.match(/<row r="9"/g)).toHaveLength(1)
  })

  it('names tests and finds them for a lesson', () => {
    expect(titleFromFile('Тест_Бази_даних_9.xlsx')).toBe('Бази даних 9')
    const t = (id: string, lesson_id: string | null, topic_id: string | null) => ({ id, lesson_id, topic_id }) as Test
    const all = [t('a', 'L', null), t('b', null, 'T'), t('c', null, 'X'), t('d', 'M', null)]
    expect(testsOf(all, { id: 'L', topic_id: 'T' }).map((x) => x.id)).toEqual(['a', 'b'])
  })
})
