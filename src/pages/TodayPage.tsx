import { ArrowUpRight, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { updateFields, useCollection } from '../data/db'
import { LESSON_TYPES } from '../data/ktp'
import { addDays, toISO } from '../data/schedule'
import { slotsOn, timetableOn } from '../data/timetable'
import type { ISODate } from '../data/types'
import { gradeColor, shortDate } from '../data/year'
import { MonthCalendar } from '../layout/MonthCalendar'
import { firstName, formatDayMonth, formatWeekday, greeting } from '../lib/dates'

function asDate(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function TodayPage() {
  const { user } = useAuth()
  const [now] = useState(() => new Date())
  const today = toISO(now)
  const [day, setDay] = useState(today)
  const name = firstName(user?.displayName)

  const { items: schedules, loading } = useCollection('lesson_schedules')
  const { items: lessons } = useCollection('lessons')
  const { items: courses } = useCollection('courses')
  const { items: classes } = useCollection('class_groups')
  const { items: topics } = useCollection('topics')
  const { items: timetables } = useCollection('timetables')
  const { items: entries } = useCollection('timetable_entries')
  const { items: bells } = useCollection('bell_schedules')

  const marked = new Set(schedules.flatMap((s) => (s.planned_date ? [s.planned_date] : [])))
  const items = schedules
    .filter((s) => s.planned_date === day)
    .map((s) => ({
      s,
      lesson: lessons.find((l) => l.id === s.lesson_id),
      course: courses.find((c) => c.id === s.course_id),
      cls: classes.find((c) => c.id === s.class_group_id),
    }))
    .filter((x) => x.lesson && x.course && x.cls)
    .sort((a, b) => a.lesson!.number - b.lesson!.number)

  // Номер уроку в дні — з тижневого розкладу; здвоєний урок отримує номери по черзі.
  const slots = slotsOn(entries, timetableOn(timetables, day), day)
  const taken = new Map<string, number>()
  const timed = items
    .map((x) => {
      const key = `${x.s.class_group_id}_${x.s.course_id}`
      const i = taken.get(key) ?? 0
      taken.set(key, i + 1)
      const slot = slots.get(key)?.[i] ?? null
      const bell = bells
        .find((b) => b.academic_year_id === x.course!.academic_year_id)
        ?.slots.find((b) => b.number === slot)
      return { ...x, slot, bell }
    })
    .sort(
      (a, b) =>
        (a.slot ?? 99) - (b.slot ?? 99) ||
        a.cls!.grade - b.cls!.grade ||
        a.cls!.letter.localeCompare(b.cls!.letter, 'uk') ||
        a.course!.subject.localeCompare(b.course!.subject, 'uk'),
    )
  const next = [...marked].filter((d) => d > day).sort()[0]
  const date = asDate(day)
  const weekday = formatWeekday(date)

  return (
    <div className="page with-rail">
      <main className="main">
        <div>
          <p className="hello">
            {greeting(now)}
            {name && `, ${name}`}
          </p>
          <div className="day-head">
            <h1>
              {day === today ? `Сьогодні, ${weekday}` : weekday[0].toUpperCase() + weekday.slice(1)}{' '}
              <span className="cnt">{formatDayMonth(date)}</span>
            </h1>
            <span className="grow" />
            <div className="day-nav">
              <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Попередній день">
                <ChevronLeft size={18} />
              </button>
              {day !== today && (
                <button className="chip plain" onClick={() => setDay(today)}>
                  Сьогодні
                </button>
              )}
              <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} aria-label="Наступний день">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {!loading && !courses.length && (
          <section className="empty" style={{ background: 'var(--mint)' }}>
            <div>
              <h2>Уроків поки немає</h2>
              <p>Тут з'являться уроки на день, щойно ти заповниш КТП і дати уроків для класів.</p>
            </div>
            <Link to="/ktp" className="arrow" aria-label="Перейти до КТП">
              <ArrowUpRight size={15} />
            </Link>
          </section>
        )}

        {!loading && courses.length > 0 && !timed.length && (
          <section className="empty" style={{ background: 'var(--surface)' }}>
            <div>
              <h2>Цього дня уроків немає</h2>
              {next && (
                <p>
                  Найближчі уроки —{' '}
                  <button className="link-btn inline" onClick={() => setDay(next)}>
                    {formatWeekday(asDate(next))}, {shortDate(next)}
                  </button>
                </p>
              )}
            </div>
          </section>
        )}

        <div className="day-list">
          {timed.map(({ s, lesson, course, cls, slot, bell }) => {
            const l = lesson!
            const topic = topics.find((t) => t.id === l.topic_id)
            const type = LESSON_TYPES.find((t) => t.value === l.lesson_type)
            const done = s.status === 'done'
            return (
              <article
                key={s.id}
                className={done ? 'day-card done' : 'day-card'}
                style={{ background: gradeColor(cls!.grade) }}
              >
                <div className="day-card-head">
                  {slot && (
                    <span className="day-time">
                      <b>{slot} урок</b>
                      {bell && ` ${bell.start}–${bell.end}`}
                    </span>
                  )}
                  <span className="class-badge">{cls!.display_name}</span>
                  <span className="day-subject">{course!.subject}</span>
                  <span className="day-no">
                    {l.extra ? 'Додатковий урок' : `Урок ${l.number}`}
                    {type && l.lesson_type !== 'regular' && ` · ${type.label}`}
                  </span>
                  <span className="grow" />
                  <Link to={`/ktp/${course!.id}`} className="arrow" aria-label="Відкрити КТП">
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
                <h2 className="day-title">{l.title || 'Без теми'}</h2>
                {topic && <p className="day-topic">{topic.title}</p>}
                {l.homework && (
                  <p className="day-hw">
                    <b>ДЗ:</b> {l.homework}
                  </p>
                )}
                <button
                  className={done ? 'chip plain on' : 'chip plain'}
                  aria-pressed={done}
                  onClick={() =>
                    updateFields('lesson_schedules', s.id, {
                      status: done ? 'planned' : 'done',
                    })
                  }
                >
                  <Check size={14} /> {done ? 'Проведено' : 'Позначити проведеним'}
                </button>
              </article>
            )
          })}
        </div>
      </main>

      <aside className="rail">
        <MonthCalendar today={today} selected={day} onSelect={setDay} marked={marked} />
      </aside>
    </div>
  )
}
