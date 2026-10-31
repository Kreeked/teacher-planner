import { CalendarPlus, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DatePicker } from '../../components/DatePicker'
import { Dialog } from '../../components/Dialog'
import { fillDates } from '../../data/autoDates'
import { commit, newBatch, putDoc } from '../../data/db'
import { courseTitle, lessonsWord } from '../../data/ktp'
import type { ScheduleData } from '../../data/mismatch'
import type { AcademicYear, ClassGroup, Course, Lesson, LessonSchedule, Period } from '../../data/types'
import { shortDate } from '../../data/year'

type Props = {
  course: Course
  year: AcademicYear
  classes: ClassGroup[]
  lessons: Lesson[] // у порядку проведення
  schedules: LessonSchedule[]
  periods: Period[]
  sched: ScheduleData
  today: string
  onClose: () => void
}

/** «Розставити дати за розкладом»: лише порожнім урокам, наявні дати не чіпаємо. Показує, що вийде, до запису. */
export function FillDatesDialog({ course, year, classes, lessons, schedules, periods, sched, today, onClose }: Props) {
  const [from, setFrom] = useState(today < year.start_date ? year.start_date : today > year.end_date ? year.end_date : today)
  const ranges = useMemo(() => new Map(periods.map((p) => [p.id, { start: p.start_date, end: p.end_date }])), [periods])

  const rows = classes.map((cls) => {
    const existing = new Map(
      schedules
        .filter((s) => s.class_group_id === cls.id && s.planned_date)
        .map((s) => [s.lesson_id, s.planned_date as string]),
    )
    const inSchedule = hasCells(sched, cls.id, course.id)
    const result = fillDates({ lessons, existing, classId: cls.id, courseId: course.id, sched, from, end: year.end_date, ranges })
    return { cls, inSchedule, result, empty: lessons.length - existing.size }
  })
  const [off, setOff] = useState<Set<string>>(new Set())
  const active = rows.filter((r) => r.inSchedule && !off.has(r.cls.id))
  const total = active.reduce((n, r) => n + r.result.placements.length, 0)

  function apply() {
    const batch = newBatch()
    for (const r of active)
      for (const p of r.result.placements)
        putDoc(
          'lesson_schedules',
          `${p.lessonId}_${r.cls.id}`,
          {
            course_id: course.id,
            lesson_id: p.lessonId,
            class_group_id: r.cls.id,
            planned_date: p.date,
            actual_date: null,
            status: 'planned',
            note: '',
          },
          batch,
        )
    commit(batch)
    onClose()
  }

  return (
    <Dialog
      title="Розставити дати за розкладом"
      subtitle={courseTitle(course)}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn" onClick={apply} disabled={total === 0}>
            <CalendarPlus size={16} /> {total ? `Поставити ${total} ${datesWord(total)}` : 'Нічого ставити'}
          </button>
        </>
      }
    >
      <div className="form-label">
        З якого дня
        <DatePicker
          label="З якого дня"
          value={from}
          min={year.start_date}
          max={year.end_date}
          onChange={(d) => d && setFrom(d)}
        />
      </div>
      <p className="muted small-text">
        Дати ставляться лише уроками без дати, за днями розкладу класу, без днів без уроків. Наявні дати не змінюються.
        Уроки «*» (лише для частини класів) пропускаються.
      </p>

      {rows.map(({ cls, inSchedule, result, empty }) => {
        const dates = result.placements.map((p) => p.date).sort()
        return (
          <section key={cls.id} className="import-conflict">
            <label className="check">
              <input
                type="checkbox"
                checked={inSchedule && !off.has(cls.id)}
                disabled={!inSchedule}
                onChange={() =>
                  setOff((s) => {
                    const next = new Set(s)
                    if (!next.delete(cls.id)) next.add(cls.id)
                    return next
                  })
                }
              />
              <b>{cls.display_name}</b>
            </label>
            {!inSchedule ? (
              <p className="warn">
                <TriangleAlert size={14} /> Цього класу з цим КТП немає в розкладі: спершу постав його на сторінці року.
              </p>
            ) : empty <= 0 ? (
              <p className="muted small-text">Усі уроки вже мають дати.</p>
            ) : (
              <>
                <p className="muted small-text">
                  {result.placements.length
                    ? `${result.placements.length} ${lessonsWord(result.placements.length)}: ${shortDate(dates[0])} — ${shortDate(dates[dates.length - 1])}`
                    : 'Немає куди поставити.'}
                </p>
                {result.unplaced.length > 0 && (
                  <p className="warn">
                    <TriangleAlert size={14} /> Не вистачає днів у розкладі до кінця року: {result.unplaced.length}{' '}
                    {lessonsWord(result.unplaced.length)} лишаться без дати.
                  </p>
                )}
              </>
            )}
          </section>
        )
      })}
    </Dialog>
  )
}

function hasCells(d: ScheduleData, classId: string, courseId: string) {
  return d.entries.some((e) => e.class_group_id === classId && e.course_id === courseId)
}

const datesWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'дату' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дати' : 'дат')
