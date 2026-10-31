import { Plus } from 'lucide-react'
import { RangeRow } from '../../components/RangeRow'
import { createDoc, removeDoc, updateFields } from '../../data/db'
import type { AcademicYear, DayOff } from '../../data/types'
import { validateDayOff } from '../../data/year'
import { ask } from '../../lib/confirm'
import { notifySaved } from '../../lib/saved'

/** Канікули й свята: у ці дні уроків немає, тож дати КТП на них не ставляться. */
export function DaysOffSection({ year, daysOff }: { year: AcademicYear; daysOff: DayOff[] }) {
  const sorted = [...daysOff].sort((a, b) => a.start_date.localeCompare(b.start_date))

  function add() {
    // Новий діапазон стартує одразу після останнього, щоб не лягти поверх нього.
    const last = sorted[sorted.length - 1]
    const start = last ? nextDay(last.end_date) : year.start_date
    const date = start > year.end_date ? year.end_date : start
    createDoc('days_off', { academic_year_id: year.id, title: 'Канікули', start_date: date, end_date: date })
  }

  async function remove(d: DayOff) {
    if (await ask(`Видалити «${d.title}»?`)) removeDoc('days_off', d.id)
  }

  return (
    <>
      {sorted.length === 0 && <p className="muted">Канікули й свята, коли уроків немає. Можна додати пізніше.</p>}
      <div className="yp-groups">
        {sorted.map((d) => (
          <RangeRow
            key={d.id}
            titleLabel="Назва"
            deleteLabel="Видалити"
            value={{ title: d.title, start_date: d.start_date, end_date: d.end_date }}
            validate={(v) => validateDayOff(v, year)}
            onSave={(v) => (updateFields('days_off', d.id, v), notifySaved())}
            onDelete={() => remove(d)}
          />
        ))}
      </div>
      <button type="button" className="btn ghost yp-add" onClick={add}>
        <Plus size={16} /> Діапазон
      </button>
    </>
  )
}

function nextDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10)
}
