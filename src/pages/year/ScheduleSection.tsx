import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollection } from '../../data/db'
import { courseTitle } from '../../data/ktp'
import { courseIssues } from '../../data/mismatch'
import { toISO } from '../../data/schedule'
import type { Shift } from '../../data/timetable'
import type { AcademicYear, BellSchedule, ClassGroup, Course, CourseClass, DayOff, Period, Timetable, TimetableEntry } from '../../data/types'
import { ScheduleEditor } from './ScheduleEditor'

type Props = {
  year: AcademicYear
  periods: Period[]
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

/** Тижневий розклад року: свій на кожен семестр, редагується тим самим редактором, що й під час початкового налаштування. */
export function ScheduleSection({ year, periods, bells, timetables, entries, courses, classes, links, daysOff, shift, onShift }: Props) {
  const [today] = useState(() => toISO(new Date()))
  const hasSemesters = periods.some((p) => !p.parent_id)

  return (
    <section className="panel yp-block yp-sched" aria-labelledby="yp-tt">
      <div className="yp-head stack">
        <h2 id="yp-tt">
          Розклад <span className="yp-count">{entries.length}</span>
        </h2>
      </div>

      {courses.map((c) => (
        <CourseIssues key={c.id} course={c} data={{ timetables, entries, daysOff }} from={today} />
      ))}

      {!courses.length && (
        <p className="warn">Спершу додай предмети в секції «Предмети й КТП»: тоді класи можна буде ставити в розклад.</p>
      )}
      {!hasSemesters ? (
        <p className="warn">Розклад належить семестру: спершу додай семестри.</p>
      ) : (
        <ScheduleEditor
          year={year}
          periods={periods}
          bells={bells}
          timetables={timetables}
          entries={entries}
          courses={courses}
          classes={classes}
          links={links}
          shift={shift}
          onShift={onShift}
        />
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
