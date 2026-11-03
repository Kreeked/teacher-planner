import { count } from '../../lib/plural'

/** Перелік того, що зникне разом з видаленим: лише ненульові частини; порожньо, якщо нічого. */
export function lostList(parts: { n: number; one: string; few: string; many: string }[]) {
  return parts
    .filter((p) => p.n > 0)
    .map((p) => count(p.n, p.one, p.few, p.many))
    .join(', ')
}

export const THEMES = ['тема', 'теми', 'тем'] as const
export const LESSONS = ['урок', 'уроки', 'уроків'] as const
export const DATES = ['дата уроку', 'дати уроків', 'дат уроків'] as const
export const FILES = ['матеріал', 'матеріали', 'матеріалів'] as const
export const CELLS = ['клітинка розкладу', 'клітинки розкладу', 'клітинок розкладу'] as const
export const COURSES = ['КТП', 'КТП', 'КТП'] as const

export const part = (n: number, w: readonly [string, string, string]) => ({ n, one: w[0], few: w[1], many: w[2] })
