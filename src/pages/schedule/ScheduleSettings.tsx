import { Bell, Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { useCollection } from '../../data/db'
import { WORKDAYS as DAYS, toISO } from '../../data/schedule'
import { timetableOn } from '../../data/timetable'
import { gradeColor, pickCurrentYear, shortDate } from '../../data/year'
import { BellsSection } from '../settings/BellsSection'
import { SlotLabel, TimetableSection } from './TimetableSection'

type Editing = 'bells' | 'timetable' | null

/** Налаштування → Розклад і дзвінки: тижневий розклад для перегляду; редагування — у вікнах. */
export function ScheduleSettings() {
  const { items: years, loading } = useCollection('academic_years')
  const year = pickCurrentYear(years)
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: bells } = useCollection('bell_schedules', filter)
  const { items: timetables } = useCollection('timetables', filter)
  const { items: courses } = useCollection('courses', filter)
  const { items: classes } = useCollection('class_groups', filter)
  const { items: entries } = useCollection('timetable_entries')
  const { items: links } = useCollection('course_classes')
  const [editing, setEditing] = useState<Editing>(null)
  const [today] = useState(() => toISO(new Date()))

  if (loading) return null
  if (!year)
    return (
      <section className="panel">
        <h3>Розклад і дзвінки</h3>
        <p className="muted">Розклад і дзвінки прив'язані до навчального року — спершу створи його.</p>
      </section>
    )

  const bell = bells[0]
  const sorted = [...timetables].sort((a, b) => a.valid_from.localeCompare(b.valid_from))
  const current = timetableOn(sorted, today) ?? sorted[sorted.length - 1]
  const own = current ? entries.filter((e) => e.timetable_id === current.id) : []
  const slotCount = Math.max(bell?.slots.length ?? 7, ...own.map((e) => e.slot_number))
  const perClass = classes
    .map((c) => ({ c, n: own.filter((e) => e.class_group_id === c.id).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.c.grade - b.c.grade || a.c.letter.localeCompare(b.c.letter, 'uk'))

  return (
    <section className="panel schedule">
      <div className="sec-head">
        <h3>Розклад і дзвінки</h3>
        <span className="grow" />
        <div className="actions">
          <button className="btn ghost" onClick={() => setEditing('bells')}>
            <Bell size={15} /> Дзвінки
          </button>
          <button className="btn" onClick={() => setEditing('timetable')}>
            <Pencil size={15} /> Змінити розклад
          </button>
        </div>
      </div>

      {!current ? (
        <p className="muted">Розкладу ще немає. Створи його — і клас можна буде поставити в кожну клітинку.</p>
      ) : (
        <>
          <p className="muted small-text">
            {sorted.length > 1 ? `${current.title}, діє` : 'Діє'} з {shortDate(current.valid_from)}
          </p>
          <div className="tt-scroll">
            <div className="tt-grid">
              <span />
              {DAYS.map((d) => (
                <span key={d.value} className="tt-day">
                  {d.label}
                </span>
              ))}
              {Array.from({ length: slotCount }, (_, i) => i + 1).map((n) => [
                <SlotLabel key={`h${n}`} n={n} bell={bell?.slots.find((s) => s.number === n)} />,
                ...DAYS.map((d) => {
                  const e = own.find((x) => x.weekday === d.value && x.slot_number === n)
                  const cls = e && classes.find((c) => c.id === e.class_group_id)
                  return (
                    <span
                      key={`${d.value}-${n}`}
                      className={cls ? 'tt-cell view on' : 'tt-cell view'}
                      style={cls ? { background: gradeColor(cls.grade) } : undefined}
                    >
                      {cls?.display_name}
                    </span>
                  )
                }),
              ])}
            </div>
          </div>
          <div className="chips">
            <span className="pill">
              <b>{own.length}</b>&nbsp;уроків на тиждень
            </span>
            {perClass.map(({ c, n }) => (
              <span key={c.id} className="chip">
                <span className="sw" style={{ background: gradeColor(c.grade) }} />
                {c.display_name} · {n}
              </span>
            ))}
          </div>
        </>
      )}

      {editing && (
        <Dialog
          title={editing === 'bells' ? 'Дзвінки' : 'Розклад'}
          className={editing === 'timetable' ? 'wide' : undefined}
          onClose={() => setEditing(null)}
          footer={
            <button className="btn" onClick={() => setEditing(null)}>
              <Check size={15} /> Готово
            </button>
          }
        >
          {editing === 'bells' ? (
            <BellsSection year={year} bells={bell} />
          ) : (
            <TimetableSection
              year={year}
              bells={bell}
              timetables={timetables}
              entries={entries}
              courses={courses}
              classes={classes}
              links={links.filter((l) => courses.some((c) => c.id === l.course_id))}
            />
          )}
        </Dialog>
      )}
    </section>
  )
}
