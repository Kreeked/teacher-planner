import { Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Menu } from '../../components/Menu'
import { commit, createDoc, newBatch, ref, removeDoc, updateFields } from '../../data/db'
import { WORKDAYS as DAYS } from '../../data/schedule'
import { placedCount, semesterHours, semesterTimetable, semesters, unplacedClasses } from '../../data/semesterSchedule'
import { SHIFTS, entryShift, shiftSlots, type Shift } from '../../data/timetable'
import type { AcademicYear, BellSchedule, ClassGroup, Course, CourseClass, Period, Timetable, TimetableEntry } from '../../data/types'
import { classesWord } from '../../data/onboarding'
import { gradeColor, shortDate } from '../../data/year'
import { ask } from '../../lib/confirm'

type Props = {
  year: AcademicYear
  periods: Period[]
  bells?: BellSchedule
  timetables: Timetable[]
  entries: TimetableEntry[]
  courses: Course[]
  classes: ClassGroup[]
  links: CourseClass[]
  shift: Shift
  onShift: (s: Shift) => void
}

/** Одна група пігулок «активна / решта» (семестри чи зміни). */
function Pills<T extends string | number>({ label, items, value, onChange }: {
  label: string
  items: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="ob-bell-shifts" role="group" aria-label={label}>
      {items.map((x) => (
        <button key={x.value} type="button" className={x.value === value ? 'on' : undefined} aria-pressed={x.value === value} onClick={() => onChange(x.value)}>
          {x.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Тижневий розклад: день × номер уроку → клас і КТП. Розклад у кожного семестру свій: І є завжди, а наступні
 * додаються кнопкою й можуть бути видалені. Клас можна поставити стільки разів на тиждень, скільки в нього годин у цьому семестрі.
 */
export function ScheduleStep({ year, periods, bells, timetables, entries, courses, classes, links, shift, onShift }: Props) {
  const sems = semesters(periods)
  const [semIndex, setSemIndex] = useState(0)
  const sem = sems[Math.min(semIndex, sems.length - 1)]
  const index = sems.indexOf(sem)
  const tt = sem ? semesterTimetable(timetables, sem) : undefined
  const own = tt ? entries.filter((e) => e.timetable_id === tt.id) : []
  const ofShift = own.filter((e) => entryShift(e) === shift)
  const slots = shiftSlots(bells, shift)
  const rows = Array.from({ length: Math.max(slots.length, ...ofShift.map((e) => e.slot_number)) }, (_, i) => i + 1)
  const unplaced = sem ? unplacedClasses({ periods, timetables, entries, courses, classes, links }, index) : []
  // Наступний семестр без розкладу: замість сітки заглушка, і правила розстановки на нього не діють.
  const missing = index > 0 && !tt
  const manySubjects = new Set(courses.map((c) => c.subject.toLowerCase())).size > 1

  const options = [...courses]
    .sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, 'uk'))
    .map((course) => ({
      course,
      classes: links
        .filter((l) => l.course_id === course.id)
        .map((l) => classes.find((x) => x.id === l.class_group_id))
        .filter((x): x is ClassGroup => !!x)
        .sort((a, b) => a.letter.localeCompare(b.letter, 'uk')),
    }))
    .filter((o) => o.classes.length)

  /** «ІІ семестр» → «ІІ семестру»: назва семестру в родовому відмінку. */
  const genitive = (t: string) => (t.endsWith('семестр') ? `${t}у` : t)

  function addTimetable() {
    createDoc('timetables', { academic_year_id: year.id, title: `Розклад, ${sem.title}`, valid_from: sem.start_date, valid_to: sem.end_date })
  }

  async function removeTimetable() {
    if (!tt) return
    const text = `Видалити розклад для ${genitive(sem.title)}? Усі його клітинки (${own.length}) зникнуть.`
    if (own.length && !(await ask(text, { title: 'Видалити розклад семестру', ok: 'Видалити' }))) return
    const batch = newBatch()
    for (const e of own) batch.delete(ref('timetable_entries', e.id))
    batch.delete(ref('timetables', tt.id))
    commit(batch)
  }

  function setCell(day: number, slot: number, value: string) {
    const existing = ofShift.find((e) => e.weekday === day && e.slot_number === slot)
    if (!value) {
      if (existing) removeDoc('timetable_entries', existing.id)
      return
    }
    const [class_group_id, course_id] = value.split('|')
    if (existing) return updateFields('timetable_entries', existing.id, { class_group_id, course_id })
    // Перша клітинка семестру створює і сам його розклад.
    const batch = newBatch()
    const timetable_id =
      tt?.id ??
      createDoc(
        'timetables',
        { academic_year_id: year.id, title: `Розклад, ${sem.title}`, valid_from: sem.start_date, valid_to: sem.end_date },
        batch,
      )
    createDoc('timetable_entries', { timetable_id, weekday: day, slot_number: slot, shift, class_group_id, course_id }, batch)
    commit(batch)
  }

  return (
    <>
      {sems.length > 1 && (
        <div className="ob-sch-tabs" role="group" aria-label="Семестр">
          {sems.map((x, i) => (
            <button key={x.id} type="button" className={i === index ? 'on' : undefined} aria-pressed={i === index} onClick={() => setSemIndex(i)}>
              <b>{x.title}</b>
              <span>{i > 0 && !semesterTimetable(timetables, x) ? 'Розкладу ще немає' : `${shortDate(x.start_date)} – ${shortDate(x.end_date)}`}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ob-sch-panel">
      {!missing && (
        <div className="ob-sch-top">
          <Pills label="Зміна" items={SHIFTS} value={shift} onChange={onShift} />
          {index > 0 && tt && (
            <button type="button" className="ob-sch-del" onClick={removeTimetable}>
              <Trash2 size={14} strokeWidth={1.8} aria-hidden /> Видалити розклад
            </button>
          )}
        </div>
      )}

      {missing ? (
        <div className="ob-sch-empty" style={{ minHeight: Math.max(rows.length, 3) * 46 + 22 }}>
          <p>Розкладу для {genitive(sem.title)} ще немає</p>
          <button type="button" className="ob-sub-add" onClick={addTimetable}>
            <Plus size={16} strokeWidth={2.2} aria-hidden /> Додати розклад для {genitive(sem.title)}
          </button>
        </div>
      ) : (
        <>
          {rows.length === 0 ? (
            <p className="ob-bell-empty">Додай уроки в «Дзвінках» цієї зміни: тоді їх можна буде поставити в розклад.</p>
          ) : (
            <div className="ob-sch-grid">
              <span />
              {DAYS.map((d) => (
                <span key={d.value} className="day">
                  {d.label}
                </span>
              ))}
              {rows.map((n) => {
                const bell = slots.find((s) => s.number === n)
                return [
                  <span key={`h${n}`} className="slot">
                    <b>{n}</b>
                    {bell && (
                      <span>
                        <span>{bell.start}</span>
                        <span>{bell.end}</span>
                      </span>
                    )}
                  </span>,
                  ...DAYS.map((d) => {
                    const e = ofShift.find((x) => x.weekday === d.value && x.slot_number === n)
                    const course = e && courses.find((c) => c.id === e.course_id)
                    const cls = e && classes.find((c) => c.id === e.class_group_id)
                    const value = e ? `${e.class_group_id}|${e.course_id}` : ''
                    return (
                      <Menu
                        key={`${d.value}-${n}`}
                        label={`${d.label}, урок ${n}`}
                        triggerClass={e ? 'ob-sch-cell filled' : 'ob-sch-cell'}
                        triggerStyle={course ? { background: gradeColor(course.grade) } : undefined}
                        trigger={cls ? (manySubjects && course ? `${cls.display_name} · ${course.subject}` : cls.display_name) : ''}
                        groups={[
                          ...(e ? [[{ label: 'Вільно', icon: X, onSelect: () => setCell(d.value, n, '') }]] : []),
                          ...options.map(({ course: c, classes: cs }) =>
                            cs.map((x) => {
                              const hours = semesterHours(c, index)
                              const checked = value === `${x.id}|${c.id}`
                              // Скільки разів клас уже стоїть на тижні (без цієї клітинки) і скільки годин йому дано.
                              const others = placedCount(own, x.id, c.id, e?.id)
                              return {
                                label: manySubjects ? `${x.display_name} · ${c.subject}` : x.display_name,
                                swatch: gradeColor(c.grade),
                                checked,
                                hint: `${others + (checked ? 1 : 0)} з ${hours} год`,
                                disabled: !checked && others >= hours,
                                onSelect: () => setCell(d.value, n, `${x.id}|${c.id}`),
                              }
                            }),
                          ),
                        ]}
                      />
                    )
                  }),
                ]
              })}
            </div>
          )}

          {unplaced.length > 0 && (
            <p className="ob-sub-warn">
              <TriangleAlert size={16} strokeWidth={2} aria-hidden />
              Не розставлено {classesWord(unplaced.length)}: {unplaced.map((c) => c.display_name).join(', ')}
            </p>
          )}
        </>
      )}
      </div>
    </>
  )
}
