const weekday = new Intl.DateTimeFormat('uk-UA', { weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' })

export function formatWeekday(date: Date) {
  return weekday.format(date)
}

export function formatDayMonth(date: Date) {
  return dayMonth.format(date)
}

export function greeting(date: Date) {
  const h = date.getHours()
  if (h < 5) return 'Доброї ночі'
  if (h < 12) return 'Добрий ранок'
  if (h < 18) return 'Добрий день'
  return 'Добрий вечір'
}

export function firstName(displayName: string | null | undefined) {
  return displayName?.trim().split(/\s+/)[0] ?? ''
}
