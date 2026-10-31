import { ArrowLeft, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/context'
import { ConfirmHost } from '../../components/Confirm'
import { DatePicker } from '../../components/DatePicker'
import { Logo } from '../../components/Logo'
import { SavedToast } from '../../components/Saved'
import { useCollection } from '../../data/db'
import { STEPS, canProceed, countsOf } from '../../data/onboarding'
import { toISO } from '../../data/schedule'
import type { Shift } from '../../data/timetable'
import { defaultYear, defaultYearStart, isCurrentYear, pickCurrentYear, validateYear } from '../../data/year'
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
import { YearSection } from '../year/YearSection'

type Props = {
  /** Назад з першого кроку, поки року ще немає. */
  onExit: () => void
  onDone: () => void
}

/** Початкове налаштування року: один блок сторінки року — один екран, доки не пройдено все обов'язкове. */
export function Wizard({ onExit, onDone }: Props) {
  const { user, signOut } = useAuth()
  const uid = user!.uid
  const { items: years } = useCollection('academic_years')
  const [today] = useState(() => toISO(new Date()))
  const [yearId, setYearId] = useState<string | null>(null)
  const year = years.find((y) => y.id === yearId) ?? pickCurrentYear(years, today)
  const data = useYearData(year)
  const counts = countsOf({ year, periods: data.periods, classes: data.classes, courses: data.courses, bells: data.bells[0] })

  const [initial] = useState(() => defaultYear(defaultYearStart(new Date())))
  const [draft, setDraft] = useState({ title: initial.title, start: initial.start_date, end: initial.end_date })
  const draftError = validateYear({ start_date: draft.start, end_date: draft.end }, [])
  const [bellShift, setBellShift] = useState<Shift>(1)
  const [scheduleShift, setScheduleShift] = useState<Shift>(1)

  // Після перезавантаження продовжуємо з кроку, на якому зупинилися.
  const [step, setStep] = useState(() => Math.min(getOnboardingStep(uid) ?? 0, STEPS.length - 1))
  useEffect(hideSplash, [])

  const current = STEPS[step]
  const last = step === STEPS.length - 1
  const ready = year ? canProceed(current.id, counts) : !draftError && !!draft.title.trim()

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
      <header className="ob-top">
        <span className="ob-brand">
          <span className="logo" aria-hidden>
            <Logo />
          </span>
          Налаштування навчального року
        </span>
        <button type="button" className="btn ghost small" onClick={() => signOut()}>
          Вийти
        </button>
      </header>

      <main className="ob-main">
        <section className="ob-card yp" aria-labelledby="ob-title">
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

          <p className="ob-kicker">
            Крок <span className="num">{step + 1}</span> з {STEPS.length}
          </p>
          <h1 id="ob-title" className="ob-title">
            {current.title}
          </h1>
          <p className="ob-lead">{current.lead}</p>

          <div className="ob-body" key={current.id}>
            {current.id === 'year' &&
              (year ? (
                <YearSection year={year} periods={data.periods} current={isCurrentYear(year, today)} />
              ) : (
                <form
                  className="yp-year-fields"
                  onSubmit={(e) => {
                    e.preventDefault()
                    next()
                  }}
                >
                  <label className="yp-name">
                    Назва
                    <input className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  </label>
                  <div className="yp-date">
                    Початок
                    <DatePicker numeric label="Початок року" value={draft.start || null} onChange={(d) => setDraft({ ...draft, start: d ?? '' })} />
                  </div>
                  <div className="yp-date">
                    Кінець
                    <DatePicker
                      numeric
                      label="Кінець року"
                      value={draft.end || null}
                      min={draft.start || undefined}
                      onChange={(d) => setDraft({ ...draft, end: d ?? '' })}
                    />
                  </div>
                  {draftError && <p className="field-error">{draftError}</p>}
                </form>
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
      </main>

      <footer className="ob-foot">
        <div className="ob-foot-in">
          {year ? (
            <button type="button" className="btn ghost" onClick={() => go(step - 1)} disabled={step === 0}>
              <ArrowLeft size={16} /> Назад
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={onExit}>
              <ArrowLeft size={16} /> Назад
            </button>
          )}
          <span className="ob-hint" aria-live="polite">
            {ready ? 'Зміни зберігаються автоматично' : year ? current.need : 'Вкажи назву й коректні дати'}
          </span>
          <button type="button" className="btn" disabled={!ready} onClick={next}>
            {last ? (
              <>
                <Check size={16} /> Почати роботу
              </>
            ) : (
              'Далі'
            )}
          </button>
        </div>
      </footer>
      <ConfirmHost />
      <SavedToast />
    </div>
  )
}
