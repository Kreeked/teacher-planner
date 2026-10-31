import { ArrowUpRight, CloudDownload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { bellsOfDay, currentAndNext, lessonsOfDay, type DayData, type DayLesson } from '../data/day'
import { useCollection } from '../data/db'
import { LESSON_TYPES } from '../data/ktp'
import { toISO } from '../data/schedule'
import { materialsOf } from '../data/materials'
import type { AcademicYear, ISODate, LessonMaterial, Topic } from '../data/types'
import { LessonShelves, MaterialsDialog } from './ktp/Materials'
import { hideSplash } from '../lib/splash'
import { useClassifyLegacy } from '../lib/useClassifyLegacy'
import { gradeColor, shortDate } from '../data/year'
import { BellList } from '../layout/BellList'
import { MonthCalendar } from '../layout/MonthCalendar'
import { driveConfigured } from '../lib/drive'
import { syncOffline } from '../lib/offlineFiles'
import { useOfflinePlan } from '../lib/useOfflinePlan'
import { useOnline } from '../lib/useOnline'
import { formatDayMonth, formatWeekday } from '../lib/dates'

function asDate(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function TodayPage() {
  const [now, setNow] = useState(() => new Date())
  const today = toISO(now)
  // Вибраний день живе в адресі (?d=), тож «Назад» з КТП повертає на той самий день.
  const [params, setParams] = useSearchParams()
  const param = params.get('d')
  const day = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : today
  const setDay = (d: ISODate) => setParams(d === today ? {} : { d }, { replace: true })

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
  useEffect(() => {
    if (!loading) hideSplash()
  }, [loading])
  const data: DayData = { schedules, lessons, courses, classes, timetables, entries, bells }

  const marked = new Set(schedules.flatMap((s) => (s.planned_date ? [s.planned_date] : [])))
  const list = lessonsOfDay(day, data)
  const next = [...marked].filter((d) => d > day).sort()[0]
  const date = asDate(day)
  const weekday = formatWeekday(date)
  const bell = bellsOfDay(day, list, bells, years)

  return (
    <div className="page home">
      <div className="home-head">
        <div className="day-head">
          <h1>
            {day === today ? `Сьогодні, ${weekday}` : weekday[0].toUpperCase() + weekday.slice(1)}{' '}
            <span className="cnt">{formatDayMonth(date)}</span>
          </h1>
        </div>
      </div>

      <aside className="rail">
        <MonthCalendar
          today={today}
          selected={day}
          onSelect={setDay}
          marked={marked}
          onToday={() => setDay(today)}
          collapsible
        />
        {bell && <BellList bell={bell} list={list} now={day === today ? now : null} />}
      </aside>

      <main className="main home-list">
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

        {!loading && courses.length > 0 && !list.length && (
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

        <DayView
          list={list}
          topics={topics}
          materials={materials}
          years={years}
          live={day === today ? currentAndNext(list, now) : null}
        />
      </main>
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
        const ktpLink = `/ktp/${course.id}?lesson=${l.id}`
        const isNow = live?.currentId === s.id
        const badge = isNow ? 'Зараз' : live?.nextId === s.id ? 'Далі' : null
        return (
          <article
            key={s.id}
            className={isNow ? 'day-card now' : 'day-card'}
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
              <Link to={ktpLink} className="arrow" aria-label="Відкрити КТП">
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <h2 className="day-title">
              <Link to={ktpLink}>{l.title || 'Без теми'}</Link>
            </h2>
            {topic && <p className="day-topic">{topic.title}</p>}
            <LessonMaterials list={materials} lesson={l} onOpen={() => setOpen(x)} />
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
