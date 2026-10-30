import type { AcademicYear, ISODate, Period } from './types'

/** Навчальний рік, у якому ми зараз (з липня вже рахуємо наступний). */
export function defaultYearStart(today: Date) {
  return today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1
}

export function defaultYear(startYear: number) {
  return {
    title: `${startYear}/${startYear + 1}`,
    start_date: `${startYear}-09-01`,
    end_date: `${startYear + 1}-06-30`,
    semesters: [
      {
        title: 'І семестр',
        start_date: `${startYear}-09-01`,
        end_date: `${startYear}-12-26`,
      },
      {
        title: 'ІІ семестр',
        start_date: `${startYear + 1}-01-12`,
        end_date: `${startYear + 1}-06-30`,
      },
    ],
  }
}

export const ROMAN = ['І', 'ІІ', 'ІІІ', 'ІV', 'V', 'VI']

type Range = { start_date: ISODate; end_date: ISODate }

function overlaps(a: Range, b: Range) {
  return a.start_date <= b.end_date && b.start_date <= a.end_date
}

const fmt = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatDate(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return fmt.format(new Date(y, m - 1, day))
}

/** Коротка дата для таблиці КТП: «02.09». */
export function shortDate(d: ISODate) {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}`
}

/**
 * Дата, введена в таблиці КТП («2.9», «02.09», «02.09.2026»), у межах навчального року.
 * Порожньо — null, нерозпізнано або поза роком — undefined.
 */
export function parseShortDate(text: string, year: Range): ISODate | null | undefined {
  const t = text.trim()
  if (!t) return null
  const m = t.match(/^(\d{1,2})[./,-](\d{1,2})(?:[./,-](\d{2}|\d{4}))?$/)
  if (!m) return undefined
  const [day, month] = [Number(m[1]), Number(m[2])]
  const startYear = Number(year.start_date.slice(0, 4))
  let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : startYear
  const iso = (yy: number) => `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (!m[3] && iso(y) < year.start_date) y++
  const d = new Date(y, month - 1, day)
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return undefined
  const result = iso(y)
  return result >= year.start_date && result <= year.end_date ? result : undefined
}

/**
 * Жорсткі правила для періоду: дати існують і йдуть по порядку, лежать у межах
 * навчального року та батьківського періоду, не перетинаються з сусідами.
 * Повертає текст помилки або null.
 */
export function validatePeriod(p: Range & { id?: string; parent_id: string | null }, year: Range, all: Period[]): string | null {
  if (!p.start_date || !p.end_date) return 'Вкажи обидві дати'
  if (p.start_date > p.end_date) return 'Початок пізніше за кінець'
  if (p.start_date < year.start_date || p.end_date > year.end_date) return 'Виходить за межі навчального року'
  const parent = p.parent_id ? all.find((x) => x.id === p.parent_id) : undefined
  if (parent && (p.start_date < parent.start_date || p.end_date > parent.end_date)) return `Виходить за межі: ${parent.title}`
  const clash = all.find((x) => x.id !== p.id && x.parent_id === p.parent_id && overlaps(x, p))
  if (clash) return `Перетинається з: ${clash.title}`
  // Семестр не можна звузити так, щоб його чверть опинилась поза ним.
  const child = all.find((x) => x.parent_id === p.id && (x.start_date < p.start_date || x.end_date > p.end_date))
  if (p.id && child) return `${child.title} виходить за ці межі`
  return null
}

export function validateYear(y: Range, periods: Period[]): string | null {
  if (!y.start_date || !y.end_date) return 'Вкажи обидві дати'
  if (y.start_date > y.end_date) return 'Початок пізніше за кінець'
  const out = periods.find((p) => p.start_date < y.start_date || p.end_date > y.end_date)
  if (out) return `${out.title} виходить за ці межі`
  return null
}

export function sortPeriods(periods: Period[]) {
  return [...periods].sort((a, b) => a.position - b.position || a.start_date.localeCompare(b.start_date))
}

/**
 * Поточний рік визначається лише датами: той, у чиїх межах сьогодні.
 * Між роками (наприклад, влітку) — найближчий наступний, а коли наступних немає — останній з минулих.
 */
export function pickCurrentYear(years: AcademicYear[], today: ISODate) {
  const sorted = [...years].sort((a, b) => a.start_date.localeCompare(b.start_date))
  return (
    sorted.find((y) => y.start_date <= today && today <= y.end_date) ??
    sorted.find((y) => y.start_date > today) ??
    sorted[sorted.length - 1]
  )
}

/** Чи охоплює рік цю дату. */
export function isCurrentYear(y: Pick<AcademicYear, 'start_date' | 'end_date'>, today: ISODate) {
  return y.start_date <= today && today <= y.end_date
}

export function classDisplayName(grade: number, letter: string) {
  return letter ? `${grade}-${letter}` : String(grade)
}

/** «А Б, В» → ['А', 'Б', 'В']; латинські схожі літери переводимо в кирилицю. */
export function parseLetters(input: string) {
  const latin: Record<string, string> = {
    A: 'А',
    B: 'В',
    C: 'С',
    E: 'Е',
    H: 'Н',
    K: 'К',
    M: 'М',
    O: 'О',
    P: 'Р',
    T: 'Т',
    X: 'Х',
  }
  const parts = input
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((s) => (s.length === 1 && latin[s] ? latin[s] : s))
  return [...new Set(parts)]
}

// Колір картки = паралель (як у дизайні).
const GRADE_COLORS = ['mint', 'pink', 'butter', 'lilac', 'peri', 'peach']

export function gradeColor(grade: number) {
  return `var(--${GRADE_COLORS[grade % GRADE_COLORS.length]})`
}
