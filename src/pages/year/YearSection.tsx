import { Check } from 'lucide-react'
import { DatePicker } from '../../components/DatePicker'
import { useRangeDraft } from '../../components/useRangeDraft'
import { updateFields } from '../../data/db'
import type { AcademicYear, Period } from '../../data/types'
import { validateYear } from '../../data/year'
import { notifySaved } from '../../lib/saved'

/** Назва й межі року: правиться на місці, зберігається, щойно значення коректні. */
export function YearSection({ year, periods, current }: { year: AcademicYear; periods: Period[]; current: boolean }) {
  const r = useRangeDraft({
    value: {
      title: year.title,
      start_date: year.start_date,
      end_date: year.end_date,
    },
    validate: (v) => validateYear(v, periods),
    onSave: (v) => (updateFields('academic_years', year.id, v), notifySaved()),
  })

  return (
    <section className="panel yp-block" aria-labelledby="yp-year">
      <div className="yp-head">
        <h2 id="yp-year">Рік</h2>
        {current && (
          <span className="yp-flag">
            <Check size={12} strokeWidth={2.4} />
            Поточний за датами
          </span>
        )}
      </div>
      <div className="yp-year-fields">
        <label className="yp-name">
          Назва
          <input className="field" value={r.draft.title} onChange={(e) => r.setTitle(e.target.value)} onBlur={r.saveTitle} />
        </label>
        <div className="yp-date">
          Початок
          <DatePicker numeric label="Початок року" value={r.draft.start_date || null} onChange={r.setStart} />
        </div>
        <div className="yp-date">
          Кінець
          <DatePicker
            numeric
            label="Кінець року"
            value={r.draft.end_date || null}
            min={r.draft.start_date || undefined}
            onChange={r.setEnd}
          />
        </div>
      </div>
      {r.error && <p className="field-error">{r.error}</p>}
    </section>
  )
}
