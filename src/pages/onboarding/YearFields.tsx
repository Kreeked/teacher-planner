import { DatePicker } from '../../components/DatePicker'

export const yearTitleError = 'Вкажи назву року'

type Props = {
  title: string
  start: string
  end: string
  onTitle: (v: string) => void
  onTitleBlur?: () => void
  onStart: (d: string | null) => void
  onEnd: (d: string | null) => void
}

/** Назва й межі навчального року: однакові і при створенні, і при правці вже створеного року. */
export function YearFields({ title, start, end, onTitle, onTitleBlur, onStart, onEnd }: Props) {
  return (
    <div className="ob-year-fields">
      <label className="ob-field">
        Назва
        <input className="ob-input" placeholder="Наприклад, 2026/2027" value={title} onChange={(e) => onTitle(e.target.value)} onBlur={onTitleBlur} />
      </label>
      <div className="ob-dates">
        <div className="ob-field">
          Початок
          <DatePicker numeric trailingIcon label="Початок року" value={start || null} max={end || undefined} onChange={onStart} />
        </div>
        <div className="ob-field">
          Кінець
          <DatePicker numeric trailingIcon label="Кінець року" value={end || null} min={start || undefined} onChange={onEnd} />
        </div>
      </div>
    </div>
  )
}
