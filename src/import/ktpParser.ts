import type { ISODate, LessonType } from '../data/types'
import type { Block, Cell } from './docx'

/**
 * Розбір КТП у форматі шкільного зразка:
 * титулка → таблиця «№ | Тема | Кількість годин» → таблиця
 * «№ | Тема уроку | Дата (клас)… | Очікувані результати навчання | Домашнє завдання».
 */

export type ParsedLesson = {
  // null — додатковий урок, позначений у зразку зірочкою (лише для частини класів).
  number: number | null
  title: string
  lesson_type: LessonType
  dates: (ISODate | null)[] // по класах, у порядку classNames
  homework: string
  semester: number | null
}

export type ParsedTopic = {
  number: number | null // null — уроки до першої теми
  title: string
  // Інша назва тієї ж теми (з таблиці годин), щоб знайти її при дописуванні другого семестру.
  altTitle: string | null
  hours: number
  lessons: ParsedLesson[]
}

export type ParsedSemester = { number: number; start: ISODate; end: ISODate }

export type ParsedKtp = {
  subject: string
  grade: number
  classNames: string[]
  programRef: string
  yearTotal: number | null
  semesterTotals: number[]
  semesters: ParsedSemester[]
  topics: ParsedTopic[]
  warnings: string[]
}

export class KtpParseError extends Error {}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const norm = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/[«»"'’,.:;()]/g, '')
    .replace(/\s+/g, ' ')

export function sameTitle(a: string, b: string) {
  return norm(a) === norm(b)
}

function firstInt(s: string) {
  const m = s.match(/\d+/)
  return m ? Number(m[0]) : null
}

const ROMAN: Record<string, number> = { І: 1, I: 1, '1': 1, ІІ: 2, II: 2, '2': 2 }

function semesterNumber(s: string) {
  const m = clean(s).match(/^(ІІ|II|І|I|1|2)(?:-?й)?\s*семестр/i)
  return m ? ROMAN[m[1].toUpperCase()] : null
}

function isoFromDotted(d: string): ISODate {
  const [day, month, year] = d.split('.')
  return `${year}-${month}-${day}`
}

/** «02.09» → дата з роком семестру (вересень–грудень — перший рік, січень–червень — другий). */
export function resolveDate(text: string, sem: ParsedSemester | null, fallbackYear: number): ISODate | null {
  const m = clean(text).match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  if (m[3]) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${month}-${day}`
  const startYear = sem ? Number(sem.start.slice(0, 4)) : fallbackYear
  let iso = `${startYear}-${month}-${day}`
  if (sem && iso < sem.start) iso = `${startYear + 1}-${month}-${day}`
  else if (!sem && Number(month) < 8) iso = `${startYear + 1}-${month}-${day}`
  return iso
}

export function guessLessonType(title: string): LessonType {
  const t = title.toLowerCase()
  if (/підсумкова робота за|контрольна робота|тематичне оцінювання/.test(t)) return 'test'
  if (/практична|лабораторна/.test(t)) return 'practical'
  if (/проєкт|проект/.test(t) && /захист|презентація/.test(t)) return 'project'
  return 'regular'
}

function rowText(row: Cell[]) {
  return row.map((c) => c.text).join(' ')
}

function findHeader(rows: Cell[][], test: (texts: string[]) => boolean) {
  return rows.findIndex((r) => test(r.map((c) => clean(c.text).toLowerCase())))
}

export function parseKtp(blocks: Block[]): ParsedKtp {
  const warnings: string[] = []
  const paragraphs = blocks.filter((b) => b.kind === 'p').map((b) => clean(b.text))
  const tables = blocks.filter((b) => b.kind === 'table').map((b) => b.rows)

  // ---------- Таблиця планування ----------
  let plan: Cell[][] | undefined
  let headerIdx = -1
  for (const rows of tables) {
    const i = findHeader(rows, (t) => t.some((x) => x.startsWith('тема уроку')) && t.some((x) => x.startsWith('дата')))
    if (i >= 0) {
      plan = rows
      headerIdx = i
      break
    }
  }
  if (!plan) throw new KtpParseError('Не знайшов таблицю планування з колонками «Тема уроку» і «Дата»')

  const header = plan[headerIdx].map((c) => c.text)
  const col = (re: RegExp) => header.findIndex((h) => re.test(clean(h).toLowerCase()))
  const titleCol = col(/^тема уроку/)
  const hwCol = col(/^домашн/)
  const dateCols = header.map((h, i) => (/^дата/i.test(clean(h)) ? i : -1)).filter((i) => i >= 0)
  const classNames = dateCols.map((i) =>
    clean(header[i].replace(/^дата/i, ''))
      .replace(/\s*-\s*/, '-')
      .toUpperCase(),
  )

  // ---------- Титулка ----------
  const ktpIdx = paragraphs.findIndex((p) => /календарно-тематичне/i.test(p))
  const rawSubject = ktpIdx > 0 ? paragraphs[ktpIdx - 1] : 'Інформатика'
  const subject = rawSubject.charAt(0).toUpperCase() + rawSubject.slice(1).toLowerCase()
  const programPara = paragraphs.find((p) => /^складено відповідно до/i.test(p)) ?? ''
  const programRef = programPara.replace(/^складено відповідно до\s*/i, '').replace(/\.$/, '')
  const gradeFromClass = classNames.map((n) => firstInt(n)).find((n) => n !== null)
  const forPara = paragraphs.find((p) => /^для\s+\d+/i.test(p))
  const grade = gradeFromClass ?? (forPara ? firstInt(forPara) : null)
  if (!grade) throw new KtpParseError('Не вдалося визначити клас (паралель)')

  // ---------- Таблиця годин ----------
  const hoursTitles = new Map<number, { title: string; hours: number }>()
  let yearTotal: number | null = null
  const semesterTotals: number[] = []
  for (const rows of tables) {
    if (rows === plan) continue
    const i = findHeader(rows, (t) => t.some((x) => x.startsWith('кількість годин')))
    if (i < 0) continue
    for (const r of rows.slice(i + 1)) {
      const first = clean(r[0]?.text ?? '')
      const last = clean(r[r.length - 1]?.text ?? '')
      if (r.length >= 3 && /^\d+$/.test(first)) {
        hoursTitles.set(Number(first), { title: clean(r[1].text), hours: firstInt(last) ?? 0 })
      } else if (/усього за рік/i.test(first)) yearTotal = firstInt(last)
      else if (semesterNumber(first) && firstInt(last) !== null) semesterTotals[semesterNumber(first)! - 1] = firstInt(last)!
    }
    break
  }
  if (yearTotal === null && semesterTotals.length === 1) yearTotal = semesterTotals[0] ?? null

  // ---------- Рядки планування ----------
  const semesters: ParsedSemester[] = []
  const topics: ParsedTopic[] = []
  let currentSem: ParsedSemester | null = null
  let current: ParsedTopic | null = null
  const fallbackYear = Number(paragraphs.join(' ').match(/(20\d\d)[-–/](20\d\d)/)?.[1] ?? new Date().getFullYear())
  let lastNumber = 0

  for (const row of plan.slice(headerIdx + 1)) {
    const text = clean(rowText(row))
    if (!text) continue
    const merged = row.length === 1 || row[0].span > 1

    if (merged) {
      const semMatch = text.match(
        /^(ІІ|II|І|I|1|2)(?:-?й)?\s*семестр\s*\((\d{1,2}\.\d{1,2}\.\d{4})\s*[–—-]\s*(\d{1,2}\.\d{1,2}\.\d{4})\)/i,
      )
      if (semMatch) {
        currentSem = {
          number: ROMAN[semMatch[1].toUpperCase()],
          start: isoFromDotted(semMatch[2].padStart(10, '0')),
          end: isoFromDotted(semMatch[3].padStart(10, '0')),
        }
        semesters.push(currentSem)
        continue
      }
      const topicMatch = text.match(/^тема\s+(\d+)\s*[.:]?\s*(.*)$/i)
      if (topicMatch) {
        const number = Number(topicMatch[1])
        let title = topicMatch[2]
        let hours: number | null = null
        const h = title.match(/\s*\(([^()]*(?:\([^()]*\))?[^()]*)\s*год\.?\)\s*$/i)
        if (h) {
          hours = firstInt(h[1])
          title = title.slice(0, h.index).trim()
        }
        const fromTable = hoursTitles.get(number)
        current = {
          number,
          title: title || fromTable?.title || `Тема ${number}`,
          altTitle: fromTable && !sameTitle(fromTable.title, title) ? fromTable.title : null,
          hours: hours ?? fromTable?.hours ?? 0,
          lessons: [],
        }
        topics.push(current)
        continue
      }
      // Блоки «Ключові компетентності / Наскрізні лінії» та інші пояснення не імпортуємо.
      continue
    }

    const first = clean(row[0].text)
    if (!/^(\d+|\*)$/.test(first) || titleCol < 0 || !row[titleCol]) continue
    const title = clean(row[titleCol].text)
    if (!title) continue
    const number = first === '*' ? null : Number(first)
    if (number !== null) {
      if (number !== lastNumber + 1) warnings.push(`Після уроку ${lastNumber} іде ${number}: номери перераховано по порядку`)
      lastNumber = number
    }
    if (!current) {
      current = { number: null, title: 'Вступ', altTitle: null, hours: 0, lessons: [] }
      topics.push(current)
    }
    const hw = hwCol >= 0 ? clean(row[hwCol]?.text ?? '') : ''
    current.lessons.push({
      number,
      title,
      lesson_type: number === null ? 'reserve' : guessLessonType(title),
      dates: dateCols.map((i) => resolveDate(row[i]?.text ?? '', currentSem, fallbackYear)),
      homework: hw === '—' || hw === '-' ? '' : hw,
      semester: currentSem?.number ?? null,
    })
  }

  const intro = topics.find((t) => t.number === null)
  if (intro) intro.hours = intro.lessons.length

  // Теми з таблиці годин, яких немає в цьому файлі (наприклад, ІІ семестр), — порожні, щоб рік мав повну структуру.
  for (const [number, { title, hours }] of [...hoursTitles].sort((a, b) => a[0] - b[0]))
    if (!topics.some((t) => t.number === number)) topics.push({ number, title, altTitle: null, hours, lessons: [] })

  if (!topics.some((t) => t.lessons.length)) throw new KtpParseError('У таблиці планування не знайшов жодного уроку')

  return { subject, grade, classNames, programRef, yearTotal, semesterTotals, semesters, topics, warnings }
}
