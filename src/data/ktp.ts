import type { Lesson, LessonType, Topic } from './types'

export const LESSON_TYPES: { value: LessonType; label: string }[] = [
  { value: 'regular', label: 'Урок' },
  { value: 'practical', label: 'Практична' },
  { value: 'test', label: 'Контрольна' },
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
      const number = l.extra ? 0 : ++n
      if (l.number !== number || l.position !== i || l.topic_id !== topic.id)
        patches.push({ id: l.id, topic_id: topic.id, position: i, number })
    })
  return patches
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
  // Додаткові уроки («*») не входять у години за планом.
  const counted = (ls: Lesson[]) => ls.filter((l) => !l.extra).length
  for (const { topic, lessons } of blocks) {
    const n = counted(lessons)
    // Порожня тема (наприклад, ІІ семестр ще не заповнено) — не помилка, її покриває загальне попередження.
    if (topic.planned_hours > 0 && n > 0 && n !== topic.planned_hours)
      w.push({ topicId: topic.id, text: `${n} ${lessonsWord(n)} із ${topic.planned_hours} год` })
  }
  const total = blocks.reduce((n, b) => n + counted(b.lessons), 0)
  if (totalHours > 0 && total !== totalHours) w.push({ text: `У КТП ${total} ${lessonsWord(total)}, а за планом ${totalHours} год` })
  return w
}

/** Уроки, що йдуть у години за планом (без додаткових «*»). */
export function countedLessons(lessons: Lesson[]) {
  return lessons.filter((l) => !l.extra).length
}

export function courseTitle(c: { subject: string; grade: number }) {
  return `${c.subject}, ${c.grade} клас`
}

/** Годин на тиждень для показу: «1,5» або «2 / 1», якщо в семестрах різне. */
export function weeklyHours(c: { hours_per_week: number; hours_per_week_2?: number }) {
  const fmt = (n: number) => String(n).replace('.', ',')
  const second = c.hours_per_week_2 ?? c.hours_per_week
  return second === c.hours_per_week ? fmt(c.hours_per_week) : `${fmt(c.hours_per_week)} / ${fmt(second)}`
}

/** Ставить урок у тему topicId на місце index (перетягування, зокрема між темами). */
export function placeLesson(blocks: TopicBlock[], lessonId: string, topicId: string, index: number): TopicBlock[] {
  const lesson = blocks.flatMap((b) => b.lessons).find((l) => l.id === lessonId)
  if (!lesson) return blocks
  const next = blocks.map((b) => ({ topic: b.topic, lessons: b.lessons.filter((l) => l.id !== lessonId) }))
  const target = next.find((b) => b.topic.id === topicId)
  if (!target) return blocks
  target.lessons.splice(Math.max(0, Math.min(index, target.lessons.length)), 0, lesson)
  return next
}

/** Ставить тему на місце index. */
export function placeTopic(blocks: TopicBlock[], topicId: string, index: number): TopicBlock[] {
  const from = blocks.findIndex((b) => b.topic.id === topicId)
  if (from < 0) return blocks
  const next = [...blocks]
  const [b] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(index, next.length)), 0, b)
  return next
}

/**
 * Зміна типу уроку. «Резерв» не має номера («*») і не входить у години;
 * коли тип змінюють з «Резерву» на інший, урок знову отримує номер.
 */
export function typePatch(l: Pick<Lesson, 'lesson_type' | 'extra'>, type: LessonType) {
  if (type === 'reserve') return { lesson_type: type, extra: true }
  if (l.lesson_type === 'reserve') return { lesson_type: type, extra: false }
  return { lesson_type: type }
}
