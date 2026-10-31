import { TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { commit, createDoc, newBatch, removeDoc, updateFields, useCollection } from '../../data/db'
import { courseIssues } from '../../data/mismatch'
import { WORKDAYS as DAYS, toISO, weekday } from '../../data/schedule'
import { entryShift, shiftSlots, timetableOn, type Shift } from '../../data/timetable'
import type { AcademicYear, BellSchedule, ClassGroup, Course, CourseClass, DayOff, Timetable, TimetableEntry } from '../../data/types'
import { courseTitle } from '../../data/ktp'
import { gradeColor } from '../../data/year'
import { Menu } from '../../components/Menu'
import { ShiftPills } from './ShiftPills'

type Props = {
  year: AcademicYear
  bells?: BellSchedule
  timetables: Timetable[]
  entries: TimetableEntry[]
  courses: Course[]
  classes: ClassGroup[]
  links: CourseClass[]
  daysOff: DayOff[]
  shift: Shift
  onShift: (s: Shift) => void
}

/** Тижневий розклад: день × номер уроку → клас і КТП. Час уроку береться з дзвінків вибраної зміни. */
export function ScheduleSection({ year, bells, timetables, entries, courses, classes, links, daysOff, shift, onShift }: Props) {
  const [today] = useState(() => toISO(new Date()))
  const sorted = [...timetables].sort((a, b) => a.valid_from.localeCompare(b.valid_from))
  // Сторінка редагує один шаблон: чинний сьогодні, а коли такого немає — останній.
  const current = timetableOn(sorted, today) ?? sorted[sorted.length - 1]
  const own = current ? entries.filter((e) => e.timetable_id === current.id) : []
  const ofShift = own.filter((e) => entryShift(e) === shift)
  const slots = shiftSlots(bells, shift)
  const rowCount = Math.max(slots.length, ...ofShift.map((e) => e.slot_number))
  const rows = Array.from({ length: rowCount }, (_, i) => i + 1)

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

  function setCell(day: number, slot: number, value: string) {
    const existing = ofShift.find((e) => e.weekday === day && e.slot_number === slot)
    if (!value) {
      if (existing) removeDoc('timetable_entries', existing.id)
      return
    }
    const [class_group_id, course_id] = value.split('|')
    if (existing)
      return updateFields('timetable_entries', existing.id, {
        class_group_id,
        course_id,
      })
    // Перша клітинка року створює і сам шаблон розкладу.
    const batch = newBatch()
    const timetable_id =
      current?.id ??
      createDoc(
        'timetables',
        {
          academic_year_id: year.id,
          title: 'Розклад',
          valid_from: year.start_date,
          valid_to: year.end_date,
        },
        batch,
      )
    createDoc(
      'timetable_entries',
      {
        timetable_id,
        weekday: day,
        slot_number: slot,
        shift,
        class_group_id,
        course_id,
      },
      batch,
    )
    commit(batch)
  }

  return (
    <section className="panel yp-block yp-sched" aria-labelledby="yp-tt">
      <div className="yp-head stack">
        <h2 id="yp-tt">
          Розклад <span className="yp-count">{own.length}</span>
        </h2>
        <ShiftPills value={shift} onChange={onShift} />
      </div>

      {options.map((o) => (
        <CourseIssues key={o.course.id} course={o.course} data={{ timetables, entries, daysOff }} from={today} />
      ))}

      {!options.length && (
        <p className="warn">Спершу додай предмети в секції «Предмети й КТП»: тоді класи можна буде ставити в розклад.</p>
      )}

      {rows.length === 0 ? (
        <p className="yp-empty">Додай уроки в «Дзвінках» цієї зміни: тоді їх можна буде поставити в розклад.</p>
      ) : (
        <div className="yp-tt">
          <span />
          {DAYS.map((d) => (
            <span key={d.value} className={d.value === weekday(today) ? 'yp-day today' : 'yp-day'}>
              {d.label}
            </span>
          ))}
          {rows.map((n) => {
            const bell = slots.find((s) => s.number === n)
            return [
              <span key={`h${n}`} className="yp-slot">
                <span className="yp-num">{n}</span>
                {bell && (
                  <span className="yp-slot-time num">
                    <span>{bell.start}</span>
                    <span>{bell.end}</span>
                  </span>
                )}
              </span>,
              ...DAYS.map((d) => {
                const e = ofShift.find((x) => x.weekday === d.value && x.slot_number === n)
                const course = e && courses.find((c) => c.id === e.course_id)
                const value = e ? `${e.class_group_id}|${e.course_id}` : ''
                const cls = e && classes.find((c) => c.id === e.class_group_id)
                return (
                  <Menu
                    key={`${d.value}-${n}`}
                    label={`${d.label}, урок ${n}`}
                    triggerClass={e ? 'yp-cell filled' : 'yp-cell'}
                    triggerStyle={course ? { background: gradeColor(course.grade) } : undefined}
                    trigger={cls ? (manySubjects && course ? `${cls.display_name} · ${course.subject}` : cls.display_name) : ''}
                    groups={[
                      ...(e ? [[{ label: 'Вільно', icon: X, onSelect: () => setCell(d.value, n, '') }]] : []),
                      ...options.map(({ course: c, classes: cs }) =>
                        cs.map((x) => ({
                          label: manySubjects ? `${x.display_name} · ${c.subject}` : x.display_name,
                          swatch: gradeColor(c.grade),
                          checked: value === `${x.id}|${c.id}`,
                          onSelect: () => setCell(d.value, n, `${x.id}|${c.id}`),
                        })),
                      ),
                    ]}
                  />
                )
              }),
            ]
          })}
        </div>
      )}
    </section>
  )
}

/** Скільки майбутніх дат КТП не збігається з розкладом: підказка, що після зміни розкладу є що перевірити. */
function CourseIssues({ course, data, from }: { course: Course; data: Parameters<typeof courseIssues>[2]; from: string }) {
  const { items: schedules } = useCollection('lesson_schedules', { field: 'course_id', value: course.id })
  const n = courseIssues(schedules, course.id, data, from).length
  if (!n) return null
  return (
    <p className="warn yp-issue">
      <TriangleAlert size={14} />
      <span>
        {courseTitle(course)}: дат, що не збігаються з розкладом, — <b className="num">{n}</b>.{' '}
        <Link to={`/ktp/${course.id}`}>Відкрити КТП</Link>
      </span>
    </p>
  )
}
