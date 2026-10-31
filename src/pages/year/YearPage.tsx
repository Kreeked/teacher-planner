import { Check, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { deleteRefs, ref, refsWhere, useCollection } from '../../data/db'
import { toISO } from '../../data/schedule'
import type { Shift } from '../../data/timetable'
import type { AcademicYear } from '../../data/types'
import { isCurrentYear, pickCurrentYear } from '../../data/year'
import { ask } from '../../lib/confirm'
import { BellsSection } from './BellsSection'
import { ClassesSection } from './ClassesSection'
import { DaysOffSection } from './DaysOffSection'
import { NewYearForm } from './NewYearForm'
import { PeriodsSection } from './PeriodsSection'
import { ScheduleSection } from './ScheduleSection'
import { SubjectsSection } from './SubjectsSection'
import { YearSection } from './YearSection'

/** Підпис під вибором року: чи поточний він і що від цього залежить. */
function caption(year: AcademicYear, current: AcademicYear | undefined, today: string) {
  if (isCurrentYear(year, today))
    return `${year.title} — поточний: сьогодні входить у його дати. За ним працюють «Сьогодні» й КТП. Усе нижче стосується саме цього року.`
  if (current && isCurrentYear(current, today))
    return `${year.title} — не поточний: сьогодні входить у дати ${current.title}. «Сьогодні» й КТП працюють за ним. Усе нижче стосується саме ${year.title}.`
  return `Сьогодні поза датами будь-якого року, тому «Сьогодні» й КТП беруть ${current?.title ?? 'найближчий рік'}. Усе нижче стосується саме ${year.title}.`
}

export function YearPage() {
  const { items: years, loading } = useCollection('academic_years')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [bellShift, setBellShift] = useState<Shift>(1)
  const [scheduleShift, setScheduleShift] = useState<Shift>(1)
  const [today] = useState(() => toISO(new Date()))

  const current = pickCurrentYear(years, today)
  const year = years.find((y) => y.id === selectedId) ?? current
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: periods } = useCollection('periods', filter)
  const { items: classes } = useCollection('class_groups', filter)
  const { items: daysOff } = useCollection('days_off', filter)
  const { items: bells } = useCollection('bell_schedules', filter)
  const { items: timetables } = useCollection('timetables', filter)
  const { items: courses } = useCollection('courses', filter)
  const { items: allEntries } = useCollection('timetable_entries')
  const { items: links } = useCollection('course_classes')

  const yearLinks = links.filter((l) => courses.some((c) => c.id === l.course_id))
  const entries = allEntries.filter((e) => timetables.some((t) => t.id === e.timetable_id))

  async function removeYear(y: AcademicYear) {
    if (
      !(await ask(
        `Видалити навчальний рік ${y.title} разом із семестрами, класами, розкладом, дзвінками і всіма КТП цього року? Це незворотно.`,
        { word: 'видалити' },
      ))
    )
      return
    const refs = [
      ref('academic_years', y.id),
      ...periods.map((p) => ref('periods', p.id)),
      ...classes.map((c) => ref('class_groups', c.id)),
      ...daysOff.map((d) => ref('days_off', d.id)),
      ...bells.map((b) => ref('bell_schedules', b.id)),
      ...timetables.map((t) => ref('timetables', t.id)),
      ...entries.map((e) => ref('timetable_entries', e.id)),
    ]
    for (const course of await refsWhere('courses', 'academic_year_id', y.id)) {
      refs.push(course)
      for (const name of ['course_classes', 'topics', 'lessons', 'lesson_schedules', 'lesson_materials'] as const)
        refs.push(...(await refsWhere(name, 'course_id', course.id)))
    }
    deleteRefs(refs)
    setSelectedId(null)
  }

  const sortedYears = [...years].sort((a, b) => a.start_date.localeCompare(b.start_date))

  return (
    <div className="page yp">
      <main className="main">
        <h1>Налаштування навчального року</h1>

        {creating && (
          <NewYearForm
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setSelectedId(id)
              setCreating(false)
            }}
          />
        )}

        {!loading && years.length === 0 && (
          <section className="empty" style={{ background: 'var(--butter)' }}>
            <div>
              <h2>Ще немає навчального року</h2>
              <p>Створи рік, і до нього одразу додадуться два семестри. Далі тут же: класи, предмети, дзвінки й розклад.</p>
            </div>
            <button className="btn" onClick={() => setCreating(true)}>
              <Plus size={16} /> Створити рік
            </button>
          </section>
        )}

        {year && (
          <>
            <section className="panel yp-block yp-sel" aria-labelledby="yp-sel">
              <h2 id="yp-sel" className="yp-sel-title">
                Обраний рік
              </h2>
              <div className="yp-years" role="group" aria-label="Навчальний рік">
                {sortedYears.map((y) => (
                  <button
                    key={y.id}
                    type="button"
                    className={y.id === year.id ? 'yp-year on' : 'yp-year'}
                    aria-pressed={y.id === year.id}
                    onClick={() => setSelectedId(y.id)}
                  >
                    {isCurrentYear(y, today) && <i aria-label="Поточний" />}
                    {y.title}
                  </button>
                ))}
              </div>
              <button type="button" className="btn ghost yp-new" onClick={() => setCreating(true)}>
                <Plus size={16} /> Новий рік
              </button>
              <p className="yp-caption">
                {isCurrentYear(year, today) && <i />}
                {caption(year, current, today)}
              </p>
            </section>

            <SetupSteps
              steps={[
                { id: 'yp-per', label: 'Семестри', done: periods.some((p) => !p.parent_id) },
                { id: 'yp-cls', label: 'Класи', done: classes.length > 0 },
                { id: 'yp-sub', label: 'Предмети', done: courses.length > 0 },
                { id: 'yp-bells', label: 'Дзвінки', done: (bells[0]?.slots.length ?? 0) > 0 },
                { id: 'yp-tt', label: 'Розклад', done: entries.length > 0 },
              ]}
            />

            <YearSection key={year.id} year={year} periods={periods} current={isCurrentYear(year, today)} />

            <section className="panel yp-block" aria-labelledby="yp-per">
              <h2 id="yp-per">Семестри й чверті</h2>
              <PeriodsSection year={year} periods={periods} />
            </section>

            <section className="panel yp-block" aria-labelledby="yp-off">
              <h2 id="yp-off">Дні без уроків</h2>
              <DaysOffSection year={year} daysOff={daysOff} />
            </section>

            <section className="panel yp-block" aria-labelledby="yp-cls">
              <h2 id="yp-cls">Класи</h2>
              <ClassesSection year={year} classes={classes} />
            </section>

            <section className="panel yp-block" aria-labelledby="yp-sub">
              <h2 id="yp-sub">Предмети й КТП</h2>
              <SubjectsSection year={year} courses={courses} classes={classes} links={yearLinks} />
            </section>

            <BellsSection year={year} bells={bells[0]} entries={entries} shift={bellShift} onShift={setBellShift} />

            <ScheduleSection
              year={year}
              bells={bells[0]}
              timetables={timetables}
              entries={entries}
              courses={courses}
              classes={classes}
              links={yearLinks}
              daysOff={daysOff}
              shift={scheduleShift}
              onShift={setScheduleShift}
            />

            <section className="panel yp-block yp-danger" aria-labelledby="yp-del">
              <div>
                <h2 id="yp-del">Видалити рік</h2>
                <p>Разом із семестрами, класами, розкладом і прив’язками до КТП. Скасувати не можна.</p>
              </div>
              <button type="button" className="btn ghost danger" onClick={() => removeYear(year)}>
                <Trash2 size={16} /> Видалити {year.title}
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

/** Що в році вже налаштовано: щоб бачити, чого бракує, і переходити до потрібної секції. */
function SetupSteps({ steps }: { steps: { id: string; label: string; done: boolean }[] }) {
  const done = steps.filter((s) => s.done).length
  return (
    <nav className="panel yp-block yp-steps" aria-label="Що налаштовано">
      <p className="yp-steps-title">
        Налаштовано <b className="num">{done}</b> з {steps.length}
      </p>
      <ul>
        {steps.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className={s.done ? 'on' : undefined} onClick={(e) => jump(e, s.id)}>
              <i>{s.done && <Check size={11} strokeWidth={3} />}</i>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// Адреса сторінки — хеш-роутер, тож замість якоря прокручуємо до секції самі.
function jump(e: React.MouseEvent, id: string) {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
