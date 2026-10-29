/**
 * Старі тести (колекція `tests`): лише для перенесення у файли .xlsx уроків.
 * Окремого розділу тестів більше немає; цей модуль можна прибрати, коли старих тестів не лишиться.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Lesson, Meta, Topic } from './types'

type Question = {
  text: string
  type: string // тип питання Wayground: Multiple Choice, Checkbox, …
  options: string[]
  correct: number[] // від 1
  time: number
  image: string | null
  explanation: string
}

export type LegacyTest = Meta & {
  course_id: string
  topic_id: string | null
  lesson_id: string | null
  title: string
  questions: Question[]
}

const MAX_OPTIONS = 5

// Стовпці шаблону Wayground: A питання, B тип, C–G варіанти, H правильна, I час, J картинка, K пояснення.
type Row = (string | number | null)[]

export function questionRow(q: Question): Row {
  const options = q.type === 'Open-Ended' || q.type === 'Draw' ? [] : q.options.map((o) => o.trim())
  const withCorrect = q.type === 'Multiple Choice' || q.type === 'Checkbox'
  return [
    q.text.trim(),
    q.type,
    ...Array.from({ length: MAX_OPTIONS }, (_, i) => options[i] || null),
    withCorrect && q.correct.length ? (q.correct.length === 1 ? q.correct[0] : [...q.correct].sort().join(',')) : null,
    q.time,
    q.image?.trim() || null,
    q.explanation.trim() || null,
  ]
}

const escape = (s: string) =>
  s
    // Керівні символи XML не допускає.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function firstSheetPath(files: Record<string, Uint8Array>) {
  const rels = files['xl/_rels/workbook.xml.rels'] && strFromU8(files['xl/_rels/workbook.xml.rels'])
  const wb = files['xl/workbook.xml'] && strFromU8(files['xl/workbook.xml'])
  const rid = wb && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1]
  const target =
    rid && rels && new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)
  const path = target ? (target[1] ?? target[2]).replace(/^\/?(xl\/)?/, 'xl/') : 'xl/worksheets/sheet1.xml'
  return files[path] ? path : 'xl/worksheets/sheet1.xml'
}

const COLS = 'ABCDEFGHIJK'

/**
 * Вписує рядки в аркуш шаблону з firstRow (вище — заголовки). Стилі беруться з першого рядка даних;
 * приклади шаблону до clearTo стираються.
 */
export function fillSheet(sheetXml: string, rows: Row[], firstRow = 3, clearTo = 8) {
  const sample = new RegExp(`<row r="${firstRow}"[^>]*>([\\s\\S]*?)</row>`).exec(sheetXml)?.[1] ?? ''
  const style = new Map([...sample.matchAll(/<c r="([A-Z]+)\d+" s="(\d+)"/g)].map((m) => [m[1], m[2]]))
  const last = Math.max(clearTo, firstRow + rows.length - 1)

  const rowXml = (n: number) => {
    const values = rows[n - firstRow]
    if (!values) return `<row r="${n}" spans="1:11"/>`
    const cells = values.map((v, i) => {
      const col = COLS[i]
      const s = style.has(col) ? ` s="${style.get(col)}"` : ''
      if (v === null || v === '') return `<c r="${col}${n}"${s}/>`
      if (typeof v === 'number') return `<c r="${col}${n}"${s}><v>${v}</v></c>`
      return `<c r="${col}${n}"${s} t="inlineStr"><is><t xml:space="preserve">${escape(v)}</t></is></c>`
    })
    return `<row r="${n}" spans="1:11">${cells.join('')}</row>`
  }

  const done = new Set<number>()
  let xml = sheetXml.replace(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g, (m, r) => {
    const n = Number(r)
    if (n < firstRow || n > last) return m
    done.add(n)
    return rowXml(n)
  })
  // Рядків, яких не було в шаблоні, вставляємо по порядку номерів.
  const extra: string[] = []
  for (let n = firstRow; n <= last; n++) if (!done.has(n)) extra.push(rowXml(n))
  if (extra.length)
    xml = xml.replace(/<sheetData>([\s\S]*?)<\/sheetData>/, (_, body: string) => {
      const all = [...body.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => ({
        n: Number(m[1]),
        xml: m[0],
      }))
      for (const e of extra) all.push({ n: Number(/r="(\d+)"/.exec(e)![1]), xml: e })
      all.sort((a, b) => a.n - b.n)
      return `<sheetData>${all.map((x) => x.xml).join('')}</sheetData>`
    })
  return xml
}

/** Файл .xlsx для імпорту в Wayground: шаблон із питаннями тесту. */
export function testXlsx(template: Uint8Array, test: Pick<LegacyTest, 'questions'>) {
  const files = unzipSync(template)
  const path = firstSheetPath(files)
  files[path] = strToU8(fillSheet(strFromU8(files[path]), test.questions.map(questionRow)))
  return zipSync(files)
}

export function testFileName(test: Pick<LegacyTest, 'title'>) {
  return `Тест_${test.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Wayground'}.xlsx`
}

/**
 * Куди покласти файл тесту: тест уроку — у цей урок; тест теми — у перший урок теми
 * (або матеріалом теми, якщо уроків немає); без прив'язки чи з видаленою — у першу тему курсу.
 */
export function testTarget(
  test: Pick<LegacyTest, 'lesson_id' | 'topic_id'>,
  topics: Topic[],
  lessons: Lesson[],
): { lesson?: Lesson; topic?: Topic } | null {
  const lesson = test.lesson_id ? lessons.find((l) => l.id === test.lesson_id) : undefined
  if (lesson) return { lesson }
  const sorted = [...topics].sort((a, b) => a.position - b.position)
  const topic = topics.find((t) => t.id === test.topic_id) ?? sorted[0]
  if (!topic) return null
  const first = lessons.filter((l) => l.topic_id === topic.id).sort((a, b) => a.position - b.position)[0]
  return first ? { lesson: first } : { topic }
}

export function testsWord(n: number) {
  const d = n % 10
  const dd = n % 100
  if (dd >= 11 && dd <= 14) return 'старих тестів'
  if (d === 1) return 'старий тест'
  if (d >= 2 && d <= 4) return 'старі тести'
  return 'старих тестів'
}
