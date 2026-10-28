// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readDocumentXml, type Block, type Cell } from './docx'
import { guessLessonType, parseKtp, resolveDate } from './ktpParser'

const c = (text: string, span = 1): Cell => ({ text, span })
const row = (...texts: string[]) => texts.map((t) => c(t))
const merged = (text: string, span = 7) => [c(text, span)]

// Синтетичний документ за шкільним зразком (структура як у реальних КТП, зміст умовний).
const blocks: Block[] = [
  { kind: 'p', text: 'Ліцей № 1' },
  { kind: 'p', text: 'ІНФОРМАТИКА' },
  { kind: 'p', text: 'КАЛЕНДАРНО-ТЕМАТИЧНЕ ПЛАНУВАННЯ' },
  { kind: 'p', text: 'для 9-А, 9-Б класів' },
  { kind: 'p', text: 'І семестру 2026-2027 навчального року' },
  { kind: 'p', text: 'Складено відповідно до модельної навчальної програми «Інформатика. 7–9 класи»' },
  {
    kind: 'table',
    rows: [
      row('№', 'Тема', 'Кількість годин'),
      [c('1-й семестр', 2), c('3 (*4)')],
      row('1', 'Програмне забезпечення', '2'),
      row('', 'Резерв часу (інструктаж)', '1'),
      [c('2-й семестр', 2), c('2')],
      row('2', 'Бази даних', '2'),
      [c('Усього за рік', 2), c('5 (*6)')],
    ],
  },
  {
    kind: 'table',
    rows: [
      row('№', 'Тема уроку', 'Дата\n9-А', 'Дата\n9-Б', 'Очікувані результати навчання', 'Домашнє завдання'),
      merged('І СЕМЕСТР (01.09.2026 – 26.12.2026)'),
      row('1', 'Інструктаж з БЖД', '02.09', '03.09', 'Дотримується правил безпеки [9 ІФО 4.1.2-3]', '—'),
      merged('Тема 1. Програмне забезпечення (2 год)'),
      merged('Ключові компетентності:\nВільне володіння державною мовою…'),
      row('2', 'Операційні системи', '07.09', '08.09', 'Пояснює А [9 ІФО 1.1]; обирає Б [9 ІФО 2.2]', '§ 1'),
      row('*', 'Узагальнення', '—', '10.09', 'Оцінює власні результати', 'Повторити'),
      row('3', 'Практична робота «Встановлення програм»', '14.09', '15.09', '', ''),
    ],
  },
]

describe('parseKtp', () => {
  const k = parseKtp(blocks)

  it('reads the title page', () => {
    expect(k.subject).toBe('Інформатика')
    expect(k.grade).toBe(9)
    expect(k.classNames).toEqual(['9-А', '9-Б'])
    expect(k.programRef).toBe('модельної навчальної програми «Інформатика. 7–9 класи»')
    expect(k.yearTotal).toBe(5)
    expect(k.semesters).toEqual([{ number: 1, start: '2026-09-01', end: '2026-12-26' }])
  })

  it('groups lessons by topic and keeps lessons before the first topic', () => {
    expect(k.topics.map((t) => [t.title, t.hours, t.lessons.length])).toEqual([
      ['Вступ', 1, 1],
      ['Програмне забезпечення', 2, 3],
      ['Бази даних', 2, 0], // з таблиці годин, у файлі ще без уроків
    ])
  })

  it('reads lessons with dates per class, homework and the extra lesson', () => {
    const [, os] = k.topics
    expect(os.lessons[0]).toEqual({
      number: 2,
      title: 'Операційні системи',
      lesson_type: 'regular',
      dates: ['2026-09-07', '2026-09-08'],
      homework: '§ 1',
      semester: 1,
    })
    expect(os.lessons[1]).toMatchObject({ number: null, lesson_type: 'reserve', dates: [null, '2026-09-10'] })
    expect(os.lessons[2].lesson_type).toBe('practical')
    expect(k.topics[0].lessons[0].homework).toBe('')
  })
})

describe('helpers', () => {
  it('puts January dates into the next calendar year', () => {
    const sem = { number: 2, start: '2027-01-12', end: '2027-06-30' }
    expect(resolveDate('15.01', sem, 2026)).toBe('2027-01-15')
    expect(resolveDate('15.01', null, 2026)).toBe('2027-01-15')
    expect(resolveDate('03.09', null, 2026)).toBe('2026-09-03')
    expect(resolveDate('—', null, 2026)).toBeNull()
  })

  it('guesses lesson types', () => {
    expect(guessLessonType('Підсумкова робота за І семестр')).toBe('test')
    expect(guessLessonType('Практична підсумкова робота з теми «Х»')).toBe('practical')
    expect(guessLessonType('Аналіз помилок')).toBe('regular')
  })
})

describe('readDocumentXml', () => {
  it('reads paragraphs, tables, merged cells and line breaks', () => {
    const xml = `<?xml version="1.0"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:r><w:t>КАЛЕНДАРНО-</w:t></w:r><w:r><w:t>ТЕМАТИЧНЕ</w:t></w:r></w:p>
        <w:p/>
        <w:tbl><w:tr>
          <w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Дата</w:t></w:r></w:p><w:p><w:r><w:t>9-А</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r></w:p></w:tc>
        </w:tr></w:tbl>
      </w:body></w:document>`
    expect(readDocumentXml(xml)).toEqual([
      { kind: 'p', text: 'КАЛЕНДАРНО-ТЕМАТИЧНЕ' },
      { kind: 'table', rows: [[{ text: 'Дата\n9-А', span: 2 }, { text: 'a b', span: 1 }]] },
    ])
  })
})
