import { ask } from '../../lib/confirm'
import { CopyPlus } from 'lucide-react'
import { useState } from 'react'
import { DatePicker } from '../../components/DatePicker'
import { RangeRow } from '../../components/RangeRow'
import { commit, createDoc, deleteRefs, newBatch, ref, refsWhere, removeDoc, updateFields } from '../../data/db'
import { WORKDAYS as DAYS, addDays } from '../../data/schedule'
import { validateTimetable } from '../../data/timetable'
import type {
  AcademicYear,
  BellSchedule,
  BellSlot,
  ClassGroup,
  Course,
  CourseClass,
  Timetable,
  TimetableEntry,
} from '../../data/types'
import { gradeColor, shortDate } from '../../data/year'

type Props = {
  year: AcademicYear
  bells?: BellSchedule
  timetables: Timetable[]
  entries: TimetableEntry[]
  courses: Course[]
  classes: ClassGroup[]
  links: CourseClass[]
}

/** Номер уроку з часом початку й кінця за дзвінками. */
export function SlotLabel({ n, bell }: { n: number; bell?: BellSlot }) {
  return (
    <span className="tt-slot">
      <b>{n}</b>
      {bell && (
        <small className="num">
          {bell.start}–{bell.end}
        </small>
      )}
    </span>
  )
}

/** Тижневий шаблон: день × номер уроку → клас і КТП. */
export function TimetableSection({ year, bells, timetables, entries, courses, classes, links }: Props) {
  const sorted = [...timetables].sort((a, b) => a.valid_from.localeCompare(b.valid_from))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copyFrom, setCopyFrom] = useState('')
  const current = sorted.find((t) => t.id === selectedId) ?? sorted[sorted.length - 1]

  if (!current)
    return (
      <div className="form">
        <p className="muted">
          Розклад однаковий щотижня. У кожну клітинку «день × урок» постав клас, у якого в тебе урок.
        </p>
        <button
          className="btn"
          onClick={() =>
            createDoc('timetables', {
              academic_year_id: year.id,
              title: 'Розклад',
              valid_from: year.start_date,
              valid_to: year.end_date,
            })
          }
        >
          Створити розклад
        </button>
      </div>
    )

  const own = entries.filter((e) => e.timetable_id === current.id)
  const slotCount = Math.max(bells?.slots.length ?? 7, ...own.map((e) => e.slot_number))
  const slots = Array.from({ length: slotCount }, (_, i) => i + 1)
  const options = [...courses]
    .sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, 'uk'))
    .map((c) => ({
      course: c,
      classes: links
        .filter((l) => l.course_id === c.id)
        .map((l) => classes.find((x) => x.id === l.class_group_id))
        .filter((x): x is ClassGroup => !!x)
        .sort((a, b) => a.letter.localeCompare(b.letter, 'uk')),
    }))
    .filter((o) => o.classes.length)
  const manySubjects = new Set(courses.map((c) => c.subject.toLowerCase())).size > 1

  function setCell(weekday: number, slot: number, value: string) {
    const existing = own.find((e) => e.weekday === weekday && e.slot_number === slot)
    if (!value) {
      if (existing) removeDoc('timetable_entries', existing.id)
      return
    }
    const [class_group_id, course_id] = value.split('|')
    if (existing) updateFields('timetable_entries', existing.id, { class_group_id, course_id })
    else
      createDoc('timetable_entries', {
        timetable_id: current.id,
        weekday,
        slot_number: slot,
        class_group_id,
        course_id,
      })
  }

  // Новий розклад з дати: копія поточного, а попередній закінчується напередодні.
  function copyFromDate() {
    if (!copyFrom || copyFrom <= current.valid_from || copyFrom > current.valid_to) return
    const batch = newBatch()
    updateFields('timetables', current.id, { valid_to: addDays(copyFrom, -1) }, batch)
    const id = createDoc(
      'timetables',
      {
        academic_year_id: year.id,
        title: `Розклад з ${shortDate(copyFrom)}`,
        valid_from: copyFrom,
        valid_to: current.valid_to,
      },
      batch,
    )
    for (const e of own)
      createDoc(
        'timetable_entries',
        {
          timetable_id: id,
          weekday: e.weekday,
          slot_number: e.slot_number,
          class_group_id: e.class_group_id,
          course_id: e.course_id,
        },
        batch,
      )
    commit(batch)
    setSelectedId(id)
    setCopyFrom('')
  }

  async function remove(t: Timetable) {
    if (!(await ask(`Видалити «${t.title}» з усіма клітинками?`))) return
    deleteRefs([ref('timetables', t.id), ...(await refsWhere('timetable_entries', 'timetable_id', t.id))])
    setSelectedId(null)
  }

  return (
    <div className="form timetable">
      {sorted.length > 1 && (
        <div className="chips">
          {sorted.map((t) => (
            <button
              key={t.id}
              className={t.id === current.id ? 'chip plain on' : 'chip plain'}
              aria-pressed={t.id === current.id}
              onClick={() => setSelectedId(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
      <RangeRow
        titleLabel="Назва розкладу"
        value={{ title: current.title, start_date: current.valid_from, end_date: current.valid_to }}
        validate={(v) =>
          validateTimetable({ id: current.id, valid_from: v.start_date, valid_to: v.end_date }, year, timetables)
        }
        onSave={(v) =>
          updateFields('timetables', current.id, { title: v.title, valid_from: v.start_date, valid_to: v.end_date })
        }
        onDelete={sorted.length > 1 ? () => remove(current) : undefined}
      />

      {!options.length && (
        <p className="warn">Спершу створи КТП і прив'яжи до нього класи — тоді їх можна буде ставити в розклад.</p>
      )}

      <div className="tt-scroll">
        <div className="tt-grid">
          <span />
          {DAYS.map((d) => (
            <span key={d.value} className="tt-day">
              {d.label}
            </span>
          ))}
          {slots.map((n) => {
            const bell = bells?.slots.find((s) => s.number === n)
            return [
              <SlotLabel key={`h${n}`} n={n} bell={bell} />,
              ...DAYS.map((d) => {
                const e = own.find((x) => x.weekday === d.value && x.slot_number === n)
                const course = e && courses.find((c) => c.id === e.course_id)
                return (
                  <select
                    key={`${d.value}-${n}`}
                    className={e ? 'tt-cell on' : 'tt-cell'}
                    style={course ? { background: gradeColor(course.grade) } : undefined}
                    aria-label={`${d.label}, урок ${n}`}
                    value={e ? `${e.class_group_id}|${e.course_id}` : ''}
                    onChange={(ev) => setCell(d.value, n, ev.target.value)}
                  >
                    <option value="">—</option>
                    {options.map(({ course: c, classes: cs }) => (
                      <optgroup key={c.id} label={`${c.subject}, ${c.grade} клас`}>
                        {cs.map((x) => (
                          <option key={x.id} value={`${x.id}|${c.id}`}>
                            {manySubjects ? `${x.display_name} · ${c.subject}` : x.display_name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )
              }),
            ]
          })}
        </div>
      </div>

      <div className="tt-copy">
        <span className="form-label">Розклад змінився серед року?</span>
        <div className="row-actions">
          <DatePicker
            label="Дата нового розкладу"
            min={addDays(current.valid_from, 1)}
            max={current.valid_to}
            value={copyFrom || null}
            onChange={(d) => setCopyFrom(d ?? '')}
          />
          <button className="btn ghost" disabled={!copyFrom} onClick={copyFromDate}>
            <CopyPlus size={14} /> Новий розклад з цієї дати
          </button>
        </div>
      </div>
    </div>
  )
}
