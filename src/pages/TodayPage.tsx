import { ArrowUpRight, Check, ChevronLeft, ChevronRight, CloudDownload, Upload } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { currentAndNext, lessonsOfDay, mondayOf, type DayData, type DayLesson } from '../data/day'
import { updateFields, useCollection } from '../data/db'
import { LESSON_TYPES } from '../data/ktp'
import { addDays, toISO, WEEKDAYS } from '../data/schedule'
import { materialsOf } from '../data/materials'
import type { AcademicYear, ISODate, LessonMaterial, Topic } from '../data/types'
import { LessonShelves, MaterialsDialog } from './ktp/Materials'
import { useClassifyLegacy } from '../lib/useClassifyLegacy'
import { gradeColor, shortDate } from '../data/year'
import { MonthCalendar } from '../layout/MonthCalendar'
import { driveConfigured } from '../lib/drive'
import { syncOffline } from '../lib/offlineFiles'
import { useOfflinePlan } from '../lib/useOfflinePlan'
import { useOnline } from '../lib/useOnline'
import { firstName, formatDayMonth, formatWeekday, greeting } from '../lib/dates'

type View = 'day' | 'week'

const VIEW_KEY = 'today-view'

function asDate(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function savedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'day'
  } catch {
    return 'day'
  }
}

export function TodayPage() {
  const { user } = useAuth()
  const [now, setNow] = useState(() => new Date())
  const today = toISO(now)
  const [day, setDay] = useState(today)
  const [view, setView] = useState<View>(savedView)
  const name = firstName(user?.displayName)

  // Поточний урок змінюється з часом — оновлюємо щохвилини.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const { items: schedules, loading } = useCollection('lesson_schedules')
  const { items: lessons } = useCollection('lessons')
  const { items: courses } = useCollection('courses')
  const { items: classes } = useCollection('class_groups')
  const { items: topics } = useCollection('topics')
  const { items: timetables } = useCollection('timetables')
  const { items: entries } = useCollection('timetable_entries')
  const { items: bells } = useCollection('bell_schedules')
  const { items: materials } = useCollection('lesson_materials')
  const { items: years } = useCollection('academic_years')
  useClassifyLegacy(materials)
  const data: DayData = { schedules, lessons, courses, classes, timetables, entries, bells }

  function switchView(v: View) {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Без сховища вигляд просто не запам'ятається.
    }
  }

  function openDay(d: ISODate) {
    setDay(d)
    switchView('day')
  }

  const marked = new Set(schedules.flatMap((s) => (s.planned_date ? [s.planned_date] : [])))
  const list = lessonsOfDay(day, data)
  const next = [...marked].filter((d) => d > day).sort()[0]
  const date = asDate(day)
  const weekday = formatWeekday(date)
  const monday = mondayOf(day)
  const step = view === 'week' ? 7 : 1
  const isCurrent = view === 'week' ? monday === mondayOf(today) : day === today

  let title: string
  if (view === 'week') title = `Тиждень ${asDate(monday).getDate()}–${formatDayMonth(asDate(addDays(monday, 4)))}`
  else title = day === today ? `Сьогодні, ${weekday}` : weekday[0].toUpperCase() + weekday.slice(1)

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
              {title} {view === 'day' && <span className="cnt">{formatDayMonth(date)}</span>}
            </h1>
            <span className="grow" />
            <div className="day-nav">
              <div className="seg" role="group" aria-label="Вигляд">
                <button
                  className={view === 'day' ? 'on' : ''}
                  aria-pressed={view === 'day'}
                  onClick={() => switchView('day')}
                >
                  День
                </button>
                <button
                  className={view === 'week' ? 'on' : ''}
                  aria-pressed={view === 'week'}
                  onClick={() => switchView('week')}
                >
                  Тиждень
                </button>
              </div>
              <button
                className="icon-btn"
                onClick={() => setDay(addDays(day, -step))}
                aria-label={view === 'week' ? 'Попередній тиждень' : 'Попередній день'}
              >
                <ChevronLeft size={18} />
              </button>
              {!isCurrent && (
                <button className="btn ghost small" onClick={() => setDay(today)}>
                  Сьогодні
                </button>
              )}
              <button
                className="icon-btn"
                onClick={() => setDay(addDays(day, step))}
                aria-label={view === 'week' ? 'Наступний тиждень' : 'Наступний день'}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        <OfflineNotice />

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

        {view === 'week' && courses.length > 0 && (
          <WeekView monday={monday} today={today} data={data} now={now} onOpen={openDay} />
        )}

        {view === 'day' && !loading && courses.length > 0 && !list.length && (
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

        {view === 'day' && (
          <DayView
            list={list}
            topics={topics}
            materials={materials}
            years={years}
            live={day === today ? currentAndNext(list, now) : null}
          />
        )}
      </main>

      <aside className="rail">
        <MonthCalendar today={today} selected={day} onSelect={setDay} marked={marked} />
      </aside>
    </div>
  )
}

/** Нагадування, що частина файлів до уроків тижня ще не збережена на пристрої. */
function OfflineNotice() {
  const { plan, files, missing, loading } = useOfflinePlan()
  const online = useOnline()
  if (files.running)
    return (
      <p className="offline-note">
        <CloudDownload size={14} /> Зберігаю файли до уроків на пристрій: {files.done} з {files.total}…
      </p>
    )
  if (loading || !online || !driveConfigured || !missing.length || files.paused) return null
  return (
    <p className="offline-note">
      <CloudDownload size={14} />
      <span className="grow">
        Файлів до уроків тижня, яких ще немає на пристрої: {missing.length}. <Link to="/settings">Докладніше</Link>
      </span>
      <button
        className="btn ghost small"
        onClick={() =>
          syncOffline(
            plan.keep.map((x) => x.material),
            true,
          )
        }
      >
        Зберегти
      </button>
    </p>
  )
}

type Live = { currentId: string | null; nextId: string | null } | null

type DayViewProps = {
  list: DayLesson[]
  topics: Topic[]
  materials: LessonMaterial[]
  years: AcademicYear[]
  live: Live
}

function DayView({ list, topics, materials, years, live }: DayViewProps) {
  const [open, setOpen] = useState<DayLesson | null>(null)
  return (
    <div className="day-list">
      {open && (
        <MaterialsDialog
          course={open.course}
          year={years.find((y) => y.id === open.course.academic_year_id)}
          lesson={open.lesson}
          materials={materials.filter((m) => m.course_id === open.course.id)}
          onClose={() => setOpen(null)}
        />
      )}
      {list.map((x) => {
        const { s, lesson: l, course, cls, slot, bell } = x
        const topic = topics.find((t) => t.id === l.topic_id)
        const type = LESSON_TYPES.find((t) => t.value === l.lesson_type)
        const done = s.status === 'done'
        const isNow = live?.currentId === s.id
        const badge = isNow ? 'Зараз' : live?.nextId === s.id ? 'Далі' : null
        return (
          <article
            key={s.id}
            className={['day-card', done && 'done', isNow && 'now'].filter(Boolean).join(' ')}
            style={{ background: gradeColor(cls.grade) }}
          >
            <div className="day-card-head">
              {(slot || badge) && (
                <span className="day-time">
                  {badge && <span className={isNow ? 'live now' : 'live'}>{badge}</span>}
                  {slot && <b>{slot} урок</b>}
                  {bell && ` ${bell.start}–${bell.end}`}
                </span>
              )}
              <span className="class-badge">{cls.display_name}</span>
              <span className="day-subject">{course.subject}</span>
              <span className="day-no">
                {l.extra ? 'Додатковий урок' : `Урок ${l.number}`}
                {type && l.lesson_type !== 'regular' && ` · ${type.label}`}
              </span>
              <span className="grow" />
              <Link to={`/ktp/${course.id}`} className="arrow" aria-label="Відкрити КТП">
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
            <LessonMaterials list={materials} lesson={l} onOpen={() => setOpen(x)} />
            <div className="day-actions">
              <button
                className={done ? 'chip plain on' : 'chip plain'}
                aria-pressed={done}
                onClick={() => updateFields('lesson_schedules', s.id, { status: done ? 'planned' : 'done' })}
              >
                <Check size={14} /> {done ? 'Проведено' : 'Позначити проведеним'}
              </button>
              <button className="btn ghost small" onClick={() => setOpen(x)}>
                <Upload size={14} /> Матеріали
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

/** Полички уроку і під ними — спільні файли теми. */
function LessonMaterials({
  list,
  lesson,
  onOpen,
}: {
  list: LessonMaterial[]
  lesson: DayLesson['lesson']
  onOpen: () => void
}) {
  const { own } = materialsOf(list, lesson)
  return <LessonShelves own={own} onOpen={onOpen} />
}

type WeekProps = { monday: ISODate; today: ISODate; data: DayData; now: Date; onOpen: (d: ISODate) => void }

/** Тиждень: колонка на кожен день, уроки в порядку розкладу. Дотик відкриває день. */
function WeekView({ monday, today, data, now, onOpen }: WeekProps) {
  const days = WEEKDAYS.map((w, i) => ({
    ...w,
    date: addDays(monday, i),
    list: lessonsOfDay(addDays(monday, i), data),
  }))
  // Субота — лише якщо в неї є уроки.
  const shown = days.filter((d) => d.value < 6 || d.list.length)

  return (
    <div className="week" style={{ '--days': shown.length } as CSSProperties}>
      {shown.map((d) => {
        const live = d.date === today ? currentAndNext(d.list, now) : null
        return (
          <section key={d.date} className={d.date === today ? 'week-day today' : 'week-day'}>
            <button className="week-day-head" onClick={() => onOpen(d.date)}>
              <b>{d.label}</b> {shortDate(d.date)}
            </button>
            {!d.list.length && <p className="week-empty">—</p>}
            {d.list.map(({ s, lesson: l, cls, slot, bell }) => (
              <button
                key={s.id}
                className={['week-item', s.status === 'done' && 'done', live?.currentId === s.id && 'now']
                  .filter(Boolean)
                  .join(' ')}
                style={{ background: gradeColor(cls.grade) }}
                onClick={() => onOpen(d.date)}
              >
                <span className="week-item-head">
                  {slot && <b>{slot}</b>}
                  <span className="class-badge">{cls.display_name}</span>
                  {bell && <small>{bell.start}</small>}
                  {s.status === 'done' && <Check size={13} aria-label="Проведено" />}
                </span>
                <span className="week-item-title">
                  {l.extra ? '* ' : `${l.number}. `}
                  {l.title || 'Без теми'}
                </span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}
