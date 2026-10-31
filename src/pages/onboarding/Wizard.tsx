import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/context'
import { ConfirmHost } from '../../components/Confirm'
import { SavedToast } from '../../components/Saved'
import { useRangeDraft } from '../../components/useRangeDraft'
import { useCollection, updateFields } from '../../data/db'
import { STEPS, canProceed, countsOf } from '../../data/onboarding'
import { toISO } from '../../data/schedule'
import type { Shift } from '../../data/timetable'
import type { AcademicYear, Period } from '../../data/types'
import { defaultYear, defaultYearStart, pickCurrentYear, validateYear } from '../../data/year'
import { notifySaved } from '../../lib/saved'
import { clearOnboarding, getOnboardingStep, setOnboardingStep } from '../../lib/onboarding'
import { hideSplash } from '../../lib/splash'
import { BellsSection } from '../year/BellsSection'
import { ClassesSection } from '../year/ClassesSection'
import { createYear } from '../year/createYear'
import { DaysOffSection } from '../year/DaysOffSection'
import { PeriodsSection } from '../year/PeriodsSection'
import { ScheduleSection } from '../year/ScheduleSection'
import { SubjectsSection } from '../year/SubjectsSection'
import { useYearData } from '../year/useYearData'
import { YearFields, yearTitleError } from './YearFields'

type Props = {
  /** Назад з першого кроку: на вітальний екран. */
  onExit: () => void
  onDone: () => void
}

/** Існуючий рік на першому кроці: правиться на місці, зберігається, щойно значення коректні. */
function ExistingYear({ year, periods, others }: { year: AcademicYear; periods: Period[]; others: AcademicYear[] }) {
  const r = useRangeDraft({
    value: { title: year.title, start_date: year.start_date, end_date: year.end_date },
    validate: (v) => (v.title.trim() ? validateYear(v, periods, others) : yearTitleError),
    onSave: (v) => (updateFields('academic_years', year.id, v), notifySaved()),
  })
  return (
    <YearFields
      title={r.draft.title}
      start={r.draft.start_date}
      end={r.draft.end_date}
      error={r.error}
      onTitle={r.setTitle}
      onTitleBlur={r.saveTitle}
      onStart={(d) => r.setStart(d)}
      onEnd={(d) => r.setEnd(d)}
    />
  )
}

/** Початкове налаштування року: один блок сторінки року — один екран, доки не пройдено все обов'язкове. */
export function Wizard({ onExit, onDone }: Props) {
  const { user } = useAuth()
  const uid = user!.uid
  const { items: years } = useCollection('academic_years')
  const [today] = useState(() => toISO(new Date()))
  const [yearId, setYearId] = useState<string | null>(null)
  const year = years.find((y) => y.id === yearId) ?? pickCurrentYear(years, today)
  const data = useYearData(year)
  const counts = countsOf({ year, periods: data.periods, classes: data.classes, courses: data.courses, bells: data.bells[0] })

  const [initial] = useState(() => defaultYear(defaultYearStart(new Date())))
  const [draft, setDraft] = useState({ title: initial.title, start: initial.start_date, end: initial.end_date })
  const draftError = draft.title.trim() ? validateYear({ start_date: draft.start, end_date: draft.end }, [], years) : yearTitleError
  const [bellShift, setBellShift] = useState<Shift>(1)
  const [scheduleShift, setScheduleShift] = useState<Shift>(1)

  // Після перезавантаження продовжуємо з кроку, на якому зупинилися.
  const [step, setStep] = useState(() => Math.min(getOnboardingStep(uid) ?? 0, STEPS.length - 1))
  useEffect(hideSplash, [])

  const current = STEPS[step]
  const last = step === STEPS.length - 1
  const ready = year ? canProceed(current.id, counts) : !draftError

  function go(n: number) {
    setStep(n)
    setOnboardingStep(uid, n)
    window.scrollTo(0, 0)
  }

  function next() {
    if (!ready) return
    if (!year) {
      const id = createYear({ ...draft, withSemesters: true })
      setYearId(id)
      go(1)
    } else if (last) {
      clearOnboarding(uid)
      onDone()
    } else go(step + 1)
  }

  return (
    <div className="ob">
      <div className="ob-stepper">
        <ol className="ob-steps" aria-label="Кроки налаштування">
          {STEPS.map((s, i) => (
            <li key={s.id} className={i < step ? 'done' : i === step ? 'on' : undefined}>
              <button
                type="button"
                disabled={i >= step}
                aria-current={i === step ? 'step' : undefined}
                aria-label={`Крок ${i + 1}: ${s.title}`}
                onClick={() => go(i)}
              >
                <i />
                <span>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="ob-center">
        <main className="ob-main">
          <header className="ob-head">
            <p>
              Крок <span className="num">{step + 1}</span> з {STEPS.length}
            </p>
            <h1 id="ob-title">{current.heading ?? current.title}</h1>
            <p className="ob-lead">{current.lead}</p>
          </header>

          <section className={current.id === 'year' ? 'ob-block year' : 'ob-block'} aria-labelledby="ob-title">
            <div className="ob-body yp" key={current.id}>
              {current.id === 'year' &&
                (year ? (
                  <ExistingYear year={year} periods={data.periods} others={years.filter((y) => y.id !== year.id)} />
                ) : (
                  <YearFields
                    title={draft.title}
                    start={draft.start}
                    end={draft.end}
                    error={draftError}
                    onTitle={(title) => setDraft({ ...draft, title })}
                    onStart={(d) => setDraft({ ...draft, start: d ?? '' })}
                    onEnd={(d) => setDraft({ ...draft, end: d ?? '' })}
                  />
                ))}
              {year && current.id === 'periods' && <PeriodsSection year={year} periods={data.periods} />}
              {year && current.id === 'daysoff' && <DaysOffSection year={year} daysOff={data.daysOff} />}
              {year && current.id === 'classes' && <ClassesSection year={year} classes={data.classes} />}
              {year && current.id === 'subjects' && (
                <SubjectsSection year={year} courses={data.courses} classes={data.classes} links={data.links} />
              )}
              {year && current.id === 'bells' && (
                <BellsSection year={year} bells={data.bells[0]} entries={data.entries} shift={bellShift} onShift={setBellShift} />
              )}
              {year && current.id === 'schedule' && (
                <ScheduleSection
                  year={year}
                  bells={data.bells[0]}
                  timetables={data.timetables}
                  entries={data.entries}
                  courses={data.courses}
                  classes={data.classes}
                  links={data.links}
                  daysOff={data.daysOff}
                  shift={scheduleShift}
                  onShift={setScheduleShift}
                />
              )}
            </div>
          </section>

          <nav className="ob-nav" aria-label="Навігація кроками">
            <button type="button" className="ob-back" onClick={() => (step === 0 ? onExit() : go(step - 1))}>
              <ArrowLeft size={14} strokeWidth={2} /> Назад
            </button>
            <button type="button" className="ob-next" disabled={!ready} onClick={next}>
              {last ? (
                <>
                  <Check size={14} strokeWidth={2.4} /> Почати роботу
                </>
              ) : (
                <>
                  Далі <ArrowRight size={14} strokeWidth={2} />
                </>
              )}
            </button>
          </nav>
        </main>
      </div>
      <ConfirmHost />
      <SavedToast />
    </div>
  )
}
