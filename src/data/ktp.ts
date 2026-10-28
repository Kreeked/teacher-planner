import type { Lesson, LessonType, Topic } from './types'

export const LESSON_TYPES: { value: LessonType; label: string }[] = [
  { value: 'regular', label: 'Урок' },
  { value: 'practical', label: 'Практична' },
  { value: 'test', label: 'Контрольна' },
  { value: 'project', label: 'Проєкт' },
  { value: 'reserve', label: 'Резерв' },
]

export function sortTopics(topics: Topic[]) {
  return [...topics].sort((a, b) => a.position - b.position)
}

export type TopicBlock = { topic: Topic; lessons: Lesson[] }

/** Теми по порядку, у кожній — її уроки по порядку (правило 2: уроки теми N після уроків теми N−1). */
export function groupLessons(topics: Topic[], lessons: Lesson[]): TopicBlock[] {
  return sortTopics(topics).map((topic) => ({
    topic,
    lessons: lessons.filter((l) => l.topic_id === topic.id).sort((a, b) => a.position - b.position || a.number - b.number),
  }))
}

export type LessonPatch = { id: string; topic_id: string; position: number; number: number }

/**
 * Правило 1: номери 1, 2, 3… без пропусків у порядку тем і уроків.
 * Повертає лише ті уроки, у яких щось змінилося.
 */
export function renumber(blocks: TopicBlock[]): LessonPatch[] {
  const patches: LessonPatch[] = []
  let n = 0
  for (const { topic, lessons } of blocks)
    lessons.forEach((l, i) => {
      n++
      if (l.number !== n || l.position !== i || l.topic_id !== topic.id)
        patches.push({ id: l.id, topic_id: topic.id, position: i, number: n })
    })
  return patches
}

/**
 * Переміщує урок на одну позицію вгору/вниз. На межі теми урок переходить
 * у сусідню тему (в кінець попередньої або на початок наступної).
 */
export function moveLesson(blocks: TopicBlock[], lessonId: string, dir: -1 | 1): TopicBlock[] {
  const next = blocks.map((b) => ({ topic: b.topic, lessons: [...b.lessons] }))
  const bi = next.findIndex((b) => b.lessons.some((l) => l.id === lessonId))
  if (bi < 0) return blocks
  const list = next[bi].lessons
  const li = list.findIndex((l) => l.id === lessonId)
  const target = li + dir
  if (target >= 0 && target < list.length) {
    ;[list[li], list[target]] = [list[target], list[li]]
    return next
  }
  const nbi = bi + dir
  if (nbi < 0 || nbi >= next.length) return blocks
  const [lesson] = list.splice(li, 1)
  if (dir < 0) next[nbi].lessons.push(lesson)
  else next[nbi].lessons.unshift(lesson)
  return next
}

export function moveTopic(blocks: TopicBlock[], topicId: string, dir: -1 | 1): TopicBlock[] {
  const i = blocks.findIndex((b) => b.topic.id === topicId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= blocks.length) return blocks
  const next = [...blocks]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** 1 урок, 2 уроки, 5 уроків. */
export function lessonsWord(n: number) {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return 'урок'
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'уроки'
  return 'уроків'
}

export type Warning = { topicId?: string; text: string }

/** М'які перевірки: кількість уроків теми й курсу проти запланованих годин. */
export function hourWarnings(blocks: TopicBlock[], totalHours: number): Warning[] {
  const w: Warning[] = []
  for (const { topic, lessons } of blocks)
    if (topic.planned_hours > 0 && lessons.length !== topic.planned_hours)
      w.push({ topicId: topic.id, text: `${lessons.length} ${lessonsWord(lessons.length)} із ${topic.planned_hours} год` })
  const total = blocks.reduce((n, b) => n + b.lessons.length, 0)
  if (totalHours > 0 && total !== totalHours) w.push({ text: `У КТП ${total} ${lessonsWord(total)}, а за планом ${totalHours} год` })
  return w
}

export function courseTitle(c: { subject: string; grade: number }) {
  return `${c.subject}, ${c.grade} клас`
}
