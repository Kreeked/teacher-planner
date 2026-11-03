/** Форма слова за числом: 1 урок, 2 уроки, 5 уроків. */
export function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return one
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}

/** «3 теми», «5 уроків»: число й слово разом. */
export const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`
