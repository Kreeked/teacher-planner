import { TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Menu } from '../../components/Menu'
import { commit, createDoc, newBatch, removeDoc, updateFields } from '../../data/db'
import { WORKDAYS as DAYS } from '../../data/schedule'
import { placedCount, semesterHours, semesterTimetable, semesters, unplacedClasses } from '../../data/semesterSchedule'
import { SHIFTS, entryShift, shiftSlots, type Shift } from '../../data/timetable'
import type { AcademicYear, BellSchedule, ClassGroup, Course, CourseClass, Period, Timetable, TimetableEntry } from '../../data/types'
import { classesWord } from '../../data/onboarding'
import { gradeColor } from '../../data/year'

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
 * Тижневий розклад: день × номер уроку → клас і КТП. Розклад у кожного семестру свій (його може ще не бути),
 * а клас можна поставити стільки разів на тиждень, скільки в нього годин у цьому семестрі.
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
      <div className="ob-sch-top">
        {sems.length > 1 && (
          <Pills label="Семестр" items={sems.map((s, i) => ({ value: i, label: s.title }))} value={index} onChange={setSemIndex} />
        )}
        <Pills label="Зміна" items={SHIFTS} value={shift} onChange={onShift} />
      </div>

      {unplaced.length > 0 && (
        <p className="ob-sub-warn">
          <TriangleAlert size={16} strokeWidth={2} aria-hidden />
          Не розставлено {classesWord(unplaced.length)}: {unplaced.map((c) => c.display_name).join(', ')}
        </p>
      )}

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

    </>
  )
}
