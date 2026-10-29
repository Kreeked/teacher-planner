import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { BatchWriter, putDoc, updateFields, useCollection } from '../../data/db'
import { groupLessons, lessonsWord } from '../../data/ktp'
import { WEEKDAYS, fillDates } from '../../data/schedule'
import { lessonsPerDay } from '../../data/timetable'
import type { AcademicYear, ClassGroup, Course, CourseClass, Lesson, Topic } from '../../data/types'

type Props = { course: Course; topics: Topic[]; lessons: Lesson[]; links: CourseClass[]; classes: ClassGroup[] }

/** Дні тижня кожного класу і заповнення порожніх дат за ними. */
export function AutoDates({ course, topics, lessons, links, classes }: Props) {
  const { items: schedules } = useCollection('lesson_schedules', { field: 'course_id', value: course.id })
  const { items: periods } = useCollection('periods', { field: 'academic_year_id', value: course.academic_year_id })
  const { items: years } = useCollection('academic_years')
  const { items: timetables } = useCollection('timetables', {
    field: 'academic_year_id',
    value: course.academic_year_id,
  })
  const { items: allEntries } = useCollection('timetable_entries')
  const entries = allEntries.filter((e) => e.course_id === course.id && timetables.some((t) => t.id === e.timetable_id))
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
      schedules.filter((s) => s.class_group_id === cls.id && s.planned_date).map((s) => [s.lesson_id, s.planned_date!]),
    )
    const fromTimetable = entries.some((e) => e.class_group_id === cls.id)
    const days = fromTimetable ? lessonsPerDay(timetables, entries, cls.id, course.id) : link.weekdays
    const dates = fillDates(ordered, existing, days, terms)
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

  const inTimetable = (classId: string) => entries.some((e) => e.class_group_id === classId)
  // «Пн, Ср ×2» — дні з усіх шаблонів року.
  function dayList(classId: string) {
    const counts = new Map<number, number>()
    const latest = [...timetables].sort((a, b) => b.valid_from.localeCompare(a.valid_from))
    const t = latest.find((x) => entries.some((e) => e.timetable_id === x.id && e.class_group_id === classId))
    for (const e of entries)
      if (e.timetable_id === t?.id && e.class_group_id === classId)
        counts.set(e.weekday, (counts.get(e.weekday) ?? 0) + 1)
    return [...counts]
      .sort((a, b) => a[0] - b[0])
      .map(([d, n]) => `${WEEKDAYS.find((w) => w.value === d)?.label}${n > 1 ? ` ×${n}` : ''}`)
      .join(', ')
  }

  if (!rows.length) return null

  return (
    <div className="auto-dates">
      <p className="muted small-text">
        Дні беруться з розкладу, а якщо класу там немає, познач їх тут. «Заповнити дати» ставить дати порожнім урокам у
        межах семестрів; свята виправ вручну.
      </p>
      {rows.map(({ link, cls }) => (
        <div key={link.id} className="auto-row">
          <b className="auto-class">{cls.display_name}</b>
          {inTimetable(cls.id) ? (
            <span className="muted small-text tt-days">З розкладу: {dayList(cls.id)}</span>
          ) : (
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
          )}
          <button
            type="button"
            className="btn ghost small"
            disabled={!inTimetable(cls.id) && !link.weekdays.length}
            onClick={() => fill(link, cls)}
          >
            <CalendarPlus size={14} /> Заповнити дати
          </button>
          {done[cls.id] && <span className="muted small-text">{done[cls.id]}</span>}
        </div>
      ))}
    </div>
  )
}
