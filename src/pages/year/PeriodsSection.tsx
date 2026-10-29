import { ask } from '../../lib/confirm'
import { Plus } from 'lucide-react'
import { RangeRow } from '../../components/RangeRow'
import { notifySaved } from '../../lib/saved'
import { commit, createDoc, newBatch, ref, updateFields } from '../../data/db'
import type { AcademicYear, Period } from '../../data/types'
import { ROMAN, sortPeriods, validatePeriod } from '../../data/year'

export function PeriodsSection({ year, periods }: { year: AcademicYear; periods: Period[] }) {
  const semesters = sortPeriods(periods.filter((p) => !p.parent_id))
  const quarterCount = periods.filter((p) => p.kind === 'quarter').length

  function addSemester() {
    const last = semesters[semesters.length - 1]
    createDoc('periods', {
      academic_year_id: year.id,
      parent_id: null,
      kind: 'semester',
      title: `${ROMAN[semesters.length] ?? semesters.length + 1} семестр`,
      // Новий семестр не має перетинатися з попереднім, тож стартуємо одразу після нього.
      start_date: last ? nextDay(last.end_date) : year.start_date,
      end_date: year.end_date,
      position: semesters.length,
    })
  }

  function addQuarter(sem: Period) {
    const quarters = sortPeriods(periods.filter((p) => p.parent_id === sem.id))
    const last = quarters[quarters.length - 1]
    createDoc('periods', {
      academic_year_id: year.id,
      parent_id: sem.id,
      kind: 'quarter',
      title: `${quarterCount + 1} чверть`,
      start_date: last ? nextDay(last.end_date) : sem.start_date,
      end_date: sem.end_date,
      position: quarters.length,
    })
  }

  async function remove(p: Period) {
    const children = periods.filter((x) => x.parent_id === p.id)
    const what = children.length ? `${p.title} разом із чвертями (${children.length})` : p.title
    if (!(await ask(`Видалити ${what}?`))) return
    const batch = newBatch()
    for (const x of [p, ...children]) batch.delete(ref('periods', x.id))
    commit(batch)
  }

  function row(p: Period, cls?: string) {
    return (
      <RangeRow
        key={p.id}
        className={cls}
        titleLabel="Назва періоду"
        value={p}
        validate={(v) => validatePeriod({ ...v, id: p.id, parent_id: p.parent_id }, year, periods)}
        onSave={(v) => (updateFields('periods', p.id, v), notifySaved())}
        onDelete={() => remove(p)}
      />
    )
  }

  return (
    <section className="panel">
      <h3>Семестри й чверті</h3>
      {semesters.length === 0 && <p className="muted">Періодів ще немає.</p>}
      {semesters.map((sem) => (
        <div key={sem.id} className="period-group">
          {row(sem)}
          {sortPeriods(periods.filter((p) => p.parent_id === sem.id)).map((q) => row(q, 'nested'))}
          <button className="link-btn nested" onClick={() => addQuarter(sem)}>
            <Plus size={14} /> Чверть
          </button>
        </div>
      ))}
      <button className="btn ghost" onClick={addSemester}>
        <Plus size={16} /> Семестр
      </button>
    </section>
  )
}

function nextDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, day + 1))
  return date.toISOString().slice(0, 10)
}
