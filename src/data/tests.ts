import type { Lesson, Question, QuestionType, Test, Topic } from './types'

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'Multiple Choice', label: 'Одна відповідь' },
  { value: 'Checkbox', label: 'Кілька відповідей' },
  { value: 'Fill-in-the-Blank', label: 'Вписати відповідь' },
  { value: 'Open-Ended', label: 'Відкрита відповідь' },
  { value: 'Poll', label: 'Опитування' },
  { value: 'Draw', label: 'Малюнок' },
]

// Wayground приймає лише такі значення часу на питання.
export const QUESTION_TIMES = [5, 10, 20, 30, 45, 60, 120, 180, 300, 900]
export const MAX_OPTIONS = 5

/** Чи має тип варіанти відповіді і чи позначається в них правильна. */
export function typeInfo(type: QuestionType) {
  return {
    options: type !== 'Open-Ended' && type !== 'Draw',
    correct: type === 'Multiple Choice' || type === 'Checkbox',
  }
}

export function newQuestion(): Question {
  return {
    text: '',
    type: 'Multiple Choice',
    options: ['', '', '', ''],
    correct: [1],
    time: 30,
    image: null,
    explanation: '',
  }
}

export function nearestTime(sec: number) {
  return QUESTION_TIMES.reduce((best, t) => (Math.abs(t - sec) < Math.abs(best - sec) ? t : best), 30)
}

const norm = (s: string) => s.toLowerCase().replace(/[’ʼ]/g, "'").replace(/\s+/g, ' ').trim()

export type Issue = { question: number | null; text: string; blocking: boolean } // question — від 1

/**
 * Перевірка перед експортом. blocking — Wayground не прийме файл;
 * решта — поради з правил складання тестів (дублікати, перекоси правильних позицій тощо).
 */
export function checkTest(questions: Question[]): Issue[] {
  const issues: Issue[] = []
  const seen = new Map<string, number>()
  questions.forEach((q, i) => {
    const n = i + 1
    const add = (text: string, blocking = true) => issues.push({ question: n, text, blocking })
    if (!q.text.trim()) return add('порожній текст питання')
    const key = norm(q.text)
    if (seen.has(key)) add(`повторює питання ${seen.get(key)}`)
    else seen.set(key, n)

    const info = typeInfo(q.type)
    const opts = q.options.map((o) => o.trim()).filter(Boolean)
    if (info.options && q.type !== 'Fill-in-the-Blank' && opts.length < 2) add('потрібно щонайменше 2 варіанти')
    if (q.type === 'Fill-in-the-Blank' && !opts.length) add('потрібна хоча б одна правильна відповідь')
    if (new Set(opts.map(norm)).size < opts.length) add('є однакові варіанти')
    if (info.correct) {
      if (!q.correct.length) add('не позначено правильну відповідь')
      else if (q.correct.some((c) => !q.options[c - 1]?.trim())) add('правильна відповідь указує на порожній варіант')
      if (q.type === 'Multiple Choice' && q.correct.length > 1)
        add('для «Одна відповідь» правильною може бути лише одна')
    }
    if (!QUESTION_TIMES.includes(q.time)) add(`час ${q.time} с не підтримується`)
    if (!q.explanation.trim() && info.correct) add('немає пояснення відповіді', false)

    // Найдовший варіант, який ще й правильний, учні вгадують за формою.
    if (q.type === 'Multiple Choice' && q.correct.length === 1 && opts.length > 1) {
      const right = q.options[q.correct[0] - 1]?.trim().length ?? 0
      const others = q.options.filter((o, j) => j !== q.correct[0] - 1 && o.trim()).map((o) => o.trim().length)
      if (others.length && right >= 1.8 * Math.max(...others))
        add('правильний варіант набагато довший за інші, його легко вгадати', false)
    }
  })

  const single = questions.filter((q) => q.type === 'Multiple Choice' && q.correct.length === 1)
  if (single.length >= 8) {
    const count = new Map<number, number>()
    for (const q of single) count.set(q.correct[0], (count.get(q.correct[0]) ?? 0) + 1)
    for (const [pos, c] of [...count].sort((a, b) => a[0] - b[0]))
      if (c > 0.45 * single.length)
        issues.push({
          question: null,
          text: `варіант ${pos} правильний у ${c} з ${single.length} питань`,
          blocking: false,
        })
  }
  return issues
}

// ---------- Таблиця Wayground ----------

// Стовпці шаблону: A питання, B тип, C–G варіанти, H правильна, I час, J картинка, K пояснення.
export type Row = (string | number | null)[]

/** Рядок таблиці для питання. */
export function questionRow(q: Question): Row {
  const info = typeInfo(q.type)
  const options = info.options ? q.options.map((o) => o.trim()) : []
  return [
    q.text.trim(),
    q.type,
    ...Array.from({ length: MAX_OPTIONS }, (_, i) => options[i] || null),
    info.correct ? (q.correct.length === 1 ? q.correct[0] : [...q.correct].sort().join(',')) : null,
    q.time,
    q.image?.trim() || null,
    q.explanation.trim() || null,
  ]
}

const HEADERS = /^(question text|text of the question)/i

/** Питання з рядків таблиці (заголовки й порожні рядки пропускаються). */
export function questionsFromRows(rows: string[][]): Question[] {
  const out: Question[] = []
  for (const r of rows) {
    const cell = (i: number) => (r[i] ?? '').trim()
    const text = cell(0)
    if (!text || HEADERS.test(text)) continue
    const type = (QUESTION_TYPES.find((t) => t.value.toLowerCase() === cell(1).toLowerCase())?.value ??
      'Multiple Choice') as QuestionType
    const options = [2, 3, 4, 5, 6].map(cell)
    while (options.length > 2 && !options[options.length - 1]) options.pop()
    const correct = cell(7)
      .split(/[,;\s]+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_OPTIONS)
    const time = Number(cell(8))
    out.push({
      text,
      type,
      options,
      correct: typeInfo(type).correct ? correct : [],
      time: time > 0 ? nearestTime(time) : 30,
      image: cell(9) || null,
      explanation: cell(10),
    })
  }
  return out
}

/** Назва тесту з імені файлу: «Тест_Бази_даних_9.xlsx» → «Бази даних 9». */
export function titleFromFile(name: string) {
  return (
    name
      .replace(/\.xlsx$/i, '')
      .replace(/^тест[_\s-]*/i, '')
      .replace(/_+/g, ' ')
      .trim() || 'Тест'
  )
}

/** Тести уроку: власні, потім тести його теми. */
export function testsOf(all: Test[], lesson: { id: string; topic_id: string }) {
  return [
    ...all.filter((t) => t.lesson_id === lesson.id),
    ...all.filter((t) => !t.lesson_id && t.topic_id === lesson.topic_id),
  ]
}

export function questionsWord(n: number) {
  const d = n % 10
  const dd = n % 100
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'питання' : d === 1 && dd !== 11 ? 'питання' : 'питань'
}

export type Target = Pick<Test, 'topic_id' | 'lesson_id'>

export const lessonName = (l: Lesson) => `${l.extra ? 'Урок *' : `Урок ${l.number}`}${l.title ? `. ${l.title}` : ''}`

/** Куди прив'язано тест: урок, тема або нікуди. */
export function targetLabel(t: Target, topics: Topic[], lessons: Lesson[]) {
  const lesson = t.lesson_id && lessons.find((l) => l.id === t.lesson_id)
  if (lesson) return lessonName(lesson)
  const topic = t.topic_id && topics.find((x) => x.id === t.topic_id)
  return topic ? `Тема «${topic.title}»` : 'Без прив’язки'
}
