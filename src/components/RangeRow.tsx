import { Trash2 } from 'lucide-react'
import { DatePicker } from './DatePicker'
import { useRangeDraft, type Options } from './useRangeDraft'

type Props = Options & {
  onDelete: () => void
  titleLabel: string
  deleteLabel: string
  nested?: boolean
}

/** Рядок семестру чи чверті: назва, початок — кінець, кошик. */
export function RangeRow({ onDelete, titleLabel, deleteLabel, nested, ...options }: Props) {
  const r = useRangeDraft(options)
  return (
    <div className={nested ? 'yp-range nested' : 'yp-range'}>
      <input
        className="field yp-range-title"
        aria-label={titleLabel}
        value={r.draft.title}
        onChange={(e) => r.setTitle(e.target.value)}
        onBlur={r.saveTitle}
      />
      <div className="yp-range-dates">
        <DatePicker numeric label="Початок" value={r.draft.start_date || null} onChange={r.setStart} />
        <span className="yp-dash">–</span>
        <DatePicker
          numeric
          label="Кінець"
          value={r.draft.end_date || null}
          min={r.draft.start_date || undefined}
          onChange={r.setEnd}
        />
      </div>
      <button type="button" className="icon-btn del" onClick={onDelete} aria-label={deleteLabel} title={deleteLabel}>
        <Trash2 size={16} />
      </button>
      {r.error && <p className="field-error">{r.error}</p>}
    </div>
  )
}
