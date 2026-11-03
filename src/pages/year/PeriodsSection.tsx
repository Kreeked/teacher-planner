import { Plus } from 'lucide-react'
import { RangeRow } from '../../components/RangeRow'
import { commit, createDoc, newBatch, ref, refsWhere, updateFields } from '../../data/db'
import type { AcademicYear, Period, Timetable, TimetableEntry } from '../../data/types'
import { ROMAN, sortPeriods, validatePeriod } from '../../data/year'
import { ask } from '../../lib/confirm'
import { impactText, type useImpact } from './useImpact'
import { notifySaved } from '../../lib/saved'

/**
 * Семестри з чвертями всередині: усе редагується одразу, без окремого вікна. Розклад семестру йде за його датами,
 * а з видаленням семестру зникає і його розклад.
 */
export function PeriodsSection({
  year,
  periods,
  timetables,
  entries,
  impact,
}: {
  year: AcademicYear
  periods: Period[]
  timetables: Timetable[]
  entries: TimetableEntry[]
  impact: ReturnType<typeof useImpact>
}) {
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
    const own = timetables.filter((t) => t.period_id === p.id)
    const cells = entries.filter((e) => own.some((t) => t.id === e.timetable_id))
    const lessons = (await Promise.all([p, ...children].map((x) => refsWhere('lessons', 'period_id', x.id)))).flat()
    const gone = new Set([p, ...children].map((x) => x.id))
    const risk = impact.count({
      periods: periods.filter((x) => !gone.has(x.id)),
      timetables: timetables.filter((t) => !own.includes(t)),
      entries: entries.filter((e) => !cells.includes(e)),
    })
    const effects = [
      own.length && `розклад семестру (клітинок: ${cells.length})`,
      lessons.length && `семестр у ${lessons.length} уроках КТП (вони лишаться без семестру, дати не зміняться)`,
    ].filter(Boolean)
    const text = [effects.length && `Разом із цим зникне: ${effects.join('; ')}.`, impactText(risk)].filter(Boolean).join(' ')
    if (!(await ask(text || `Видалити ${what}?`, text ? { title: `Видалити ${what}?` } : undefined))) return
    const batch = newBatch()
    for (const x of [p, ...children]) batch.delete(ref('periods', x.id))
    for (const e of cells) batch.delete(ref('timetable_entries', e.id))
    for (const t of own) batch.delete(ref('timetables', t.id))
    for (const l of lessons) updateFields('lessons', l.id, { period_id: null }, batch)
    commit(batch)
  }

  function row(p: Period, nested: boolean) {
    return (
      <RangeRow
        key={p.id}
        nested={nested}
        titleLabel={nested ? 'Назва чверті' : 'Назва семестру'}
        deleteLabel={nested ? 'Видалити чверть' : 'Видалити семестр'}
        value={{
          title: p.title,
          start_date: p.start_date,
          end_date: p.end_date,
        }}
        confirm={(v) =>
          impact.confirm(
            { periods: periods.map((x) => (x.id === p.id ? { ...x, start_date: v.start_date, end_date: v.end_date } : x)) },
            nested ? 'Змінити дати чверті?' : 'Змінити дати семестру?',
          )
        }
        validate={(v) =>
          validatePeriod(
            {
              start_date: v.start_date,
              end_date: v.end_date,
              id: p.id,
              parent_id: p.parent_id,
            },
            year,
            periods,
          )
        }
        onSave={(v) => (updateFields('periods', p.id, v), notifySaved())}
        onDelete={() => remove(p)}
      />
    )
  }

  return (
    <>
      {semesters.length === 0 && <p className="muted">Періодів ще немає.</p>}
      <div className="yp-groups">
        {semesters.map((sem) => (
          <div key={sem.id} className="yp-group">
            {row(sem, false)}
            {sortPeriods(periods.filter((p) => p.parent_id === sem.id)).map((q) => row(q, true))}
            <div className="yp-nested-add">
              <button type="button" className="link-btn" onClick={() => addQuarter(sem)}>
                <Plus size={14} /> Чверть
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn ghost yp-add" onClick={addSemester}>
        <Plus size={16} /> Семестр
      </button>
    </>
  )
}

function nextDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, day + 1))
  return date.toISOString().slice(0, 10)
}
