import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { BatchWriter, putDoc, updateFields, useCollection } from '../../data/db'
import { groupLessons, lessonsWord } from '../../data/ktp'
import { WEEKDAYS, fillDates } from '../../data/schedule'
import type { AcademicYear, ClassGroup, Course, CourseClass, Lesson, Topic } from '../../data/types'

type Props = { course: Course; topics: Topic[]; lessons: Lesson[]; links: CourseClass[]; classes: ClassGroup[] }

/** Дні тижня кожного класу і заповнення порожніх дат за ними. */
export function AutoDates({ course, topics, lessons, links, classes }: Props) {
  const { items: schedules } = useCollection('lesson_schedules', { field: 'course_id', value: course.id })
  const { items: periods } = useCollection('periods', { field: 'academic_year_id', value: course.academic_year_id })
  const { items: years } = useCollection('academic_years')
  const [done, setDone] = useState<Record<string, string>>({})

  const year: AcademicYear | undefined = years.find((y) => y.id === course.academic_year_id)
  const semesters = periods.filter((p) => p.kind === 'semester')
  const terms = semesters.length ? semesters : year ? [year] : []
  const ordered = groupLessons(topics, lessons).flatMap((b) => b.lessons)
  const rows = [...links]
    .sort((a, b) => a.position - b.position)
    .map((link) => ({ link, cls: classes.find((c) => c.id === link.class_group_id) }))
    .filter((r): r is { link: CourseClass; cls: ClassGroup } => !!r.cls)

  function toggleDay(link: CourseClass, day: number) {
    const weekdays = link.weekdays.includes(day)
      ? link.weekdays.filter((d) => d !== day)
      : [...link.weekdays, day].sort()
    updateFields('course_classes', link.id, { weekdays })
  }

  function fill(link: CourseClass, cls: ClassGroup) {
    const existing = new Map(
      schedules
        .filter((s) => s.class_group_id === cls.id && s.planned_date)
        .map((s) => [s.lesson_id, s.planned_date!]),
    )
    const dates = fillDates(ordered, existing, link.weekdays, terms)
    const w = new BatchWriter()
    for (const { lessonId, date } of dates) {
      const id = `${lessonId}_${cls.id}`
      if (schedules.some((s) => s.id === id)) updateFields('lesson_schedules', id, { planned_date: date }, w.batch)
      else
        putDoc(
          'lesson_schedules',
          id,
          {
            course_id: course.id,
            lesson_id: lessonId,
            class_group_id: cls.id,
            planned_date: date,
            actual_date: null,
            status: 'planned',
            note: '',
          },
          w.batch,
        )
    }
    w.commit()
    const left = ordered.filter((l) => !l.extra && !existing.has(l.id)).length - dates.length
    setDone({
      ...done,
      [cls.id]: dates.length
        ? `Поставлено ${dates.length} ${lessonsWord(dates.length)}${left > 0 ? `, не вмістилось у рік: ${left}` : ''}`
        : 'Порожніх дат немає',
    })
  }

  if (!rows.length) return null

  return (
    <div className="auto-dates">
      <span className="form-label">Дні уроків і автодати</span>
      <p className="muted small-text">
        Познач, у які дні тижня в кожного класу урок. «Заповнити» поставить дати урокам, у яких їх ще немає, після
        останньої вже поставленої дати й лише в межах семестрів. Свята поки не враховуються — їх можна виправити вручну.
      </p>
      {rows.map(({ link, cls }) => (
        <div key={link.id} className="auto-row">
          <b className="auto-class">{cls.display_name}</b>
          <div className="chips">
            {WEEKDAYS.map((d) => {
              const on = link.weekdays.includes(d.value)
              return (
                <button
                  key={d.value}
                  type="button"
                  className={on ? 'chip plain on' : 'chip plain'}
                  aria-pressed={on}
                  aria-label={`${cls.display_name}: ${d.label}`}
                  onClick={() => toggleDay(link, d.value)}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="btn ghost small"
            disabled={!link.weekdays.length}
            onClick={() => fill(link, cls)}
          >
            <CalendarPlus size={14} /> Заповнити
          </button>
          {done[cls.id] && <span className="muted small-text">{done[cls.id]}</span>}
        </div>
      ))}
    </div>
  )
}
