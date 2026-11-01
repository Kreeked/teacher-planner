import { useState } from 'react'
import type { ISODate } from '../data/types'

export type RangeValue = { title: string; start_date: ISODate; end_date: ISODate }

export type Options = {
  value: RangeValue
  validate: (v: RangeValue) => string | null
  onSave: (v: RangeValue) => void
  /** Очищену дату теж зберігаємо (замість мовчки лишати стару): поле порожнє, а помилку показує `validate`. */
  allowEmpty?: boolean
  /** Перед збереженням змінених дат: `false` скасовує зміну (користувач відмовився у вікні підтвердження). */
  confirm?: (v: RangeValue) => Promise<boolean>
}

/**
 * Чернетка «назва + початок + кінець». Зберігає лише коректні значення:
 * поки є помилка, показує її і не записує (жорсткі правила з розділу 4).
 */
export function useRangeDraft({ value, validate, onSave, allowEmpty, confirm }: Options) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  const [touched, setTouched] = useState(false)
  // Зміни, що прийшли ззовні (з іншого пристрою), підтягуємо в чернетку.
  if (seen.title !== value.title || seen.start_date !== value.start_date || seen.end_date !== value.end_date) {
    setSeen(value)
    setDraft(value)
  }

  async function change(patch: Partial<RangeValue>, save: boolean) {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (Object.keys(patch).length) setTouched(true)
    const cleared = !!allowEmpty && (!next.start_date || !next.end_date || !next.title.trim())
    if (!save || !(cleared || (!validate(next) && next.title.trim()))) return
    const moved = next.start_date !== value.start_date || next.end_date !== value.end_date
    if (moved && confirm && !(await confirm(next))) return setDraft(value)
    onSave({ ...next, title: next.title.trim() })
  }

  return {
    draft,
    // Порожні поля, яких ще не торкалися, помилкою не позначаємо.
    error: !touched && (!draft.start_date || !draft.end_date) ? null : validate(draft),
    setTitle: (title: string) => change({ title }, false),
    saveTitle: () => change({}, draft.title !== value.title),
    setStart: (d: ISODate | null) => change({ start_date: d ?? '' }, true),
    setEnd: (d: ISODate | null) => change({ end_date: d ?? '' }, true),
  }
}

