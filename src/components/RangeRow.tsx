import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ISODate } from '../data/types'

export type RangeValue = { title: string; start_date: ISODate; end_date: ISODate }

type Props = {
  value: RangeValue
  validate: (v: RangeValue) => string | null
  onSave: (v: RangeValue) => void
  onDelete?: () => void
  titleLabel: string
  className?: string
}

/**
 * Рядок «назва + дата початку + дата кінця». Зберігає лише коректні значення:
 * поки є помилка, показує її і не записує (жорсткі правила з розділу 4).
 */
export function RangeRow({ value, validate, onSave, onDelete, titleLabel, className }: Props) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  // Зміни, що прийшли ззовні (з іншого пристрою), підтягуємо в чернетку.
  if (seen.title !== value.title || seen.start_date !== value.start_date || seen.end_date !== value.end_date) {
    setSeen(value)
    setDraft(value)
  }

  const error = validate(draft)

  function change(patch: Partial<RangeValue>, save: boolean) {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (save && !validate(next) && next.title.trim()) onSave({ ...next, title: next.title.trim() })
  }

  return (
    <div className={`range-row ${className ?? ''}`}>
      <input
        className="field title"
        aria-label={titleLabel}
        value={draft.title}
        onChange={(e) => change({ title: e.target.value }, false)}
        onBlur={() => change({}, draft.title !== value.title)}
      />
      <input
        className="field"
        type="date"
        aria-label="Початок"
        value={draft.start_date}
        onChange={(e) => change({ start_date: e.target.value }, true)}
      />
      <span className="dash">—</span>
      <input
        className="field"
        type="date"
        aria-label="Кінець"
        value={draft.end_date}
        onChange={(e) => change({ end_date: e.target.value }, true)}
      />
      {onDelete && (
        <button className="icon-btn del" onClick={onDelete} aria-label="Видалити" title="Видалити">
          <Trash2 size={15} />
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
