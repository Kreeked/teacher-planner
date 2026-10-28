import type { LearningOutcome, Lesson } from './types'

/**
 * Текст, скопійований з навчальної програми → окремі ОРН.
 * Кожен рядок — один результат; маркери списку й нумерацію прибираємо.
 */
export function parseOutcomeList(text: string, existing: string[] = []) {
  const seen = new Set(existing.map(normalize))
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line
      .replace(/^\s*(?:[-–—•*·▪●]|\d+[.)]|[а-яa-z][.)])\s*/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[;,]$/, '')
      .trim()
    if (!t || seen.has(normalize(t))) continue
    seen.add(normalize(t))
    out.push(t)
  }
  return out
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s.;,]+/g, ' ').trim()
}

export function sortOutcomes(outcomes: LearningOutcome[]) {
  return [...outcomes].sort((a, b) => a.position - b.position)
}

/** Для кожного ОРН — номери уроків, де його вибрано. */
export function outcomeUsage(lessons: Lesson[]) {
  const usage = new Map<string, number[]>()
  for (const l of [...lessons].sort((a, b) => a.number - b.number))
    for (const id of l.outcome_ids ?? []) usage.set(id, [...(usage.get(id) ?? []), l.number])
  return usage
}

export function coverage(outcomes: LearningOutcome[], lessons: Lesson[]) {
  const usage = outcomeUsage(lessons)
  const ids = new Set(outcomes.map((o) => o.id))
  return {
    covered: outcomes.filter((o) => usage.has(o.id)).length,
    total: outcomes.length,
    // Посилання на видалені ОРН не рахуємо.
    lessonsWithout: lessons.filter((l) => !(l.outcome_ids ?? []).some((id) => ids.has(id))).length,
  }
}
