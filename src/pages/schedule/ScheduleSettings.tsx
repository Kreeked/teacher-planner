import { Bell, Check, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { useCollection } from '../../data/db'
import { WORKDAYS as DAYS, toISO, weekday } from '../../data/schedule'
import { timetableOn } from '../../data/timetable'
import type { AcademicYear } from '../../data/types'
import { gradeColor, shortDate } from '../../data/year'
import { BellsSection } from '../settings/BellsSection'
import { SlotLabel, TimetableSection } from './TimetableSection'

type Editing = 'bells' | 'timetable' | null

/** Навчальний рік → Розклад і дзвінки: тиждень для перегляду; редагування розкладу й дзвінків — у вікнах. */
export function ScheduleSettings({ year }: { year: AcademicYear }) {
  const filter = { field: 'academic_year_id', value: year.id }
  const { items: bells } = useCollection('bell_schedules', filter)
  const { items: timetables } = useCollection('timetables', filter)
  const { items: courses } = useCollection('courses', filter)
  const { items: classes } = useCollection('class_groups', filter)
  const { items: entries } = useCollection('timetable_entries')
  const { items: links } = useCollection('course_classes')
  const [editing, setEditing] = useState<Editing>(null)
  const [today] = useState(() => toISO(new Date()))

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
        <h3>
          Розклад і дзвінки
          {current && (
            <span className="cnt">
              {sorted.length > 1 ? `${current.title}, з` : 'з'} {shortDate(current.valid_from)}
            </span>
          )}
        </h3>
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
        <div className="schedule-body">
          <div className="tt-scroll">
            <div className="tt-grid compact">
              <span />
              {DAYS.map((d) => (
                <span key={d.value} className={d.value === weekday(today) ? 'tt-day today' : 'tt-day'}>
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

          <aside className="schedule-side">
            <div className="set-card">
              <b className="set-big num">{own.length}</b>
              <span>уроків на тиждень</span>
            </div>
            {perClass.length > 0 && (
              <div className="set-card">
                <span>Уроків за класами</span>
                <div className="chips">
                  {perClass.map(({ c, n }) => (
                    <span key={c.id} className="chip tinted" style={{ background: gradeColor(c.grade) }}>
                      {c.display_name} · {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
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
