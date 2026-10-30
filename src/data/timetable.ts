import { weekday } from './schedule'
import type { BellSchedule, BellSlot, ISODate, Timetable, TimetableEntry } from './types'

export type Shift = 1 | 2

export const SHIFTS: { value: Shift; label: string }[] = [
  { value: 1, label: 'Перша зміна' },
  { value: 2, label: 'Друга зміна' },
]

/** Типові дзвінки зміни: початок, тривалість уроку й перерви після кожного уроку (після останнього — 0). */
export const DEFAULT_BELLS: Record<Shift, { start: string; minutes: number; breaks: number[] }> = {
  1: { start: '08:30', minutes: 45, breaks: [10, 10, 20, 20, 10, 10, 0] },
  2: { start: '14:10', minutes: 45, breaks: [10, 10, 15, 10, 0] },
}

export function defaultSlots(shift: Shift) {
  const d = DEFAULT_BELLS[shift]
  return computeBells(d.start, d.minutes, d.breaks)
}

/** Дзвінки однієї зміни (порожньо, якщо їх ще не задано). */
export function shiftSlots(bells: Pick<BellSchedule, 'slots' | 'second_shift'> | undefined, shift: Shift): BellSlot[] {
  return (shift === 2 ? bells?.second_shift : bells?.slots) ?? []
}

/** Зміна запису розкладу: у старих записів поля немає — це перша. */
export function entryShift(e: Pick<TimetableEntry, 'shift'>): Shift {
  return e.shift === 2 ? 2 : 1
}

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function toTime(min: number) {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function minutesBetween(a: string, b: string) {
  return toMinutes(b) - toMinutes(a)
}

export function shiftTime(t: string, minutes: number) {
  return toTime(toMinutes(t) + minutes)
}

/** Час усіх дзвінків з початку дня, тривалості уроку й перерв після кожного уроку. */
export function computeBells(firstStart: string, lessonMinutes: number, breaks: number[]): BellSlot[] {
  let t = toMinutes(firstStart)
  return breaks.map((b, i) => {
    const slot = {
      number: i + 1,
      start: toTime(t),
      end: toTime(t + lessonMinutes),
      break_after: b,
    }
    t += lessonMinutes + b
    return slot
  })
}

/** Помилка в дзвінках (уроки мають іти по черзі й не перетинатися) або null. */
export function validateBells(slots: BellSlot[]): string | null {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]
    if (toMinutes(s.end) <= toMinutes(s.start)) return `Урок ${s.number} закінчується раніше, ніж починається`
    const next = slots[i + 1]
    if (next && toMinutes(next.start) < toMinutes(s.end)) return `Урок ${next.number} починається до кінця уроку ${s.number}`
  }
  return null
}

/** Шаблон, що діє в цей день. */
export function timetableOn(timetables: Timetable[], date: ISODate) {
  return timetables.find((t) => t.valid_from <= date && date <= t.valid_to)
}

/** Час із тексту: «8:30», «08.30», «830» → «08:30»; не час — null. */
export function parseTime(text: string) {
  const m = text.trim().match(/^(\d{1,2})(?:[:.\-\s]?(\d{2}))$/)
  if (!m) return null
  const [h, min] = [Number(m[1]), Number(m[2])]
  return h < 24 && min < 60 ? toTime(h * 60 + min) : null
}

/** Номери по черзі, а перерва після уроку — проміжок до наступного (після останнього — 0). */
function relink(slots: BellSlot[]): BellSlot[] {
  return slots.map((s, i) => ({
    ...s,
    number: i + 1,
    break_after: slots[i + 1] ? Math.max(0, toMinutes(slots[i + 1].start) - toMinutes(s.end)) : 0,
  }))
}

/** Урок i починається в start: кінець зсувається разом із початком, тривалість та інші уроки лишаються. */
export function setSlotStart(slots: BellSlot[], i: number, start: string) {
  const delta = toMinutes(start) - toMinutes(slots[i].start)
  const end = toMinutes(slots[i].end) + delta
  if (end >= 24 * 60) return null
  const next = relink(slots.map((s, j) => (j === i ? { ...s, start, end: toTime(end) } : s)))
  return validateBells(next) ? null : next
}

/** Урок i закінчується в end: змінюється тривалість. */
export function setSlotEnd(slots: BellSlot[], i: number, end: string) {
  const next = relink(slots.map((s, j) => (j === i ? { ...s, end } : s)))
  return validateBells(next) ? null : next
}

/** Перерва після уроку i стає n хвилин: усі наступні уроки зсуваються разом із нею. */
export function setSlotBreak(slots: BellSlot[], i: number, n: number) {
  if (!Number.isInteger(n) || n < 0 || n > 120 || i >= slots.length - 1) return null
  const delta = n - (toMinutes(slots[i + 1].start) - toMinutes(slots[i].end))
  const last = toMinutes(slots[slots.length - 1].end) + delta
  if (last >= 24 * 60) return null
  const next = relink(
    slots.map((s, j) =>
      j <= i
        ? s
        : {
            ...s,
            start: shiftTime(s.start, delta),
            end: shiftTime(s.end, delta),
          },
    ),
  )
  return validateBells(next) ? null : next
}

/** Новий урок у кінці: така сама тривалість, як в останнього, і перерва 10 хв; у порожній зміні — з типового початку. */
export function addSlot(slots: BellSlot[], shift: Shift) {
  const last = slots[slots.length - 1]
  const d = DEFAULT_BELLS[shift]
  const start = last ? shiftTime(last.end, 10) : d.start
  const minutes = last ? minutesBetween(last.start, last.end) : d.minutes
  if (toMinutes(start) + minutes >= 24 * 60) return null
  return relink([
    ...slots,
    {
      number: slots.length + 1,
      start,
      end: shiftTime(start, minutes),
      break_after: 0,
    },
  ])
}

/** Урок i прибрано: наступні отримують на одиницю менші номери, час уроків не змінюється. */
export function removeSlot(slots: BellSlot[], i: number) {
  return relink(slots.filter((_, j) => j !== i))
}

/**
 * Номери уроків у дні для записів «клас × КТП» цього дня: здвоєний урок дає два номери.
 * Ключ — `${class_group_id}_${course_id}`, номери по зростанню (спершу перша зміна, потім друга).
 */
export function slotsOn(entries: TimetableEntry[], timetable: Timetable | undefined, date: ISODate) {
  const map = new Map<string, { slot: number; shift: Shift }[]>()
  if (!timetable) return map
  const day = weekday(date)
  for (const e of entries) {
    if (e.timetable_id !== timetable.id || e.weekday !== day) continue
    const key = `${e.class_group_id}_${e.course_id}`
    map.set(
      key,
      [...(map.get(key) ?? []), { slot: e.slot_number, shift: entryShift(e) }].sort(
        (a, b) => a.shift - b.shift || a.slot - b.slot,
      ),
    )
  }
  return map
}
