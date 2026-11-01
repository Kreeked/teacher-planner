import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/context'
import { ConfirmHost } from '../../components/Confirm'
import { SavedToast } from '../../components/Saved'
import { useRangeDraft } from '../../components/useRangeDraft'
import { commit, flushDraft, newBatch, updateFields, useCollection } from '../../data/db'
import { discardDraft, hasDraft, stopDraft } from '../../data/draft'
import { STEPS, canProceed, classesGenitive, countsOf } from '../../data/onboarding'
import { toISO } from '../../data/schedule'
import { scheduleComplete } from '../../data/semesterSchedule'
import { unassignedClasses } from '../../data/subjects'
import type { Shift } from '../../data/timetable'
import type { AcademicYear, DayOff, Period } from '../../data/types'
import { fitPeriods, pickCurrentYear, validateYear } from '../../data/year'
import { ask } from '../../lib/confirm'
import { notifySaved } from '../../lib/saved'
import { clearOnboarding, getOnboardingStep, setOnboardingStep } from '../../lib/onboarding'
import { hideSplash } from '../../lib/splash'
import { createYear } from '../year/createYear'
import { useYearData } from '../year/useYearData'
import { syncVacations, resetEntered } from '../year/vacations'
import { confirmReset } from './confirmReset'
import { semestersComplete, vacationsComplete } from '../../data/vacations'
import { BellsStep } from './BellsStep'
import { ClassesStep } from './ClassesStep'
import { ScheduleStep } from './ScheduleStep'
import { SemestersStep, VacationsStep } from './SemestersStep'
import { SubjectsStep } from './SubjectsStep'
import { YearFields, yearTitleError } from './YearFields'

type Props = {
  /** Назад з першого кроку: на вітальний екран. */
  onExit: () => void
  onDone: () => void
}

/** Існуючий рік на першому кроці: правиться на місці, зберігається, щойно значення коректні. */
function ExistingYear({ year, periods, daysOff, others }: { year: AcademicYear; periods: Period[]; daysOff: DayOff[]; others: AcademicYear[] }) {
  const r = useRangeDraft({
    value: { title: year.title, start_date: year.start_date, end_date: year.end_date },
    // Семестри перевіряються на своєму кроці й залежать від дат року, тож тут їх не чіпаємо, а підганяємо.
    validate: (v) => (v.title.trim() ? validateYear(v, [], others) : yearTitleError),
    allowEmpty: true,
    confirm: () => confirmReset('year', periods, daysOff),
    onSave: (v) => {
      const batch = newBatch()
      updateFields('academic_years', year.id, v, batch)
      // Змінились дати року: введені далі дати скидаються, а ті, що з року, перераховуються.
      const moved = v.start_date !== year.start_date || v.end_date !== year.end_date
      const base = moved ? resetEntered('year', periods, daysOff, batch) : { periods, daysOff }
      const fitted = fitPeriods(base.periods, v)
      for (const { id, ...patch } of fitted) updateFields('periods', id, patch, batch)
      // Канікули йдуть за семестрами: осінні й весняні не лишаються поза ними, зимові перераховуються.
      syncVacations(year.id, base.periods.map((p) => ({ ...p, ...fitted.find((f) => f.id === p.id) })), base.daysOff, batch, false)
      commit(batch)
      notifySaved()
    },
  })
  return (
    <YearFields
      title={r.draft.title}
      start={r.draft.start_date}
      end={r.draft.end_date}
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

  // Нова чернетка року порожня: усе вказує користувач.
  const [draft, setDraft] = useState({ title: '', start: '', end: '' })
  const draftError = draft.title.trim() ? validateYear({ start_date: draft.start, end_date: draft.end }, [], years) : yearTitleError
  // Картки предметів можуть бути недописані: тоді «Далі» неактивна.
  const [subjectsValid, setSubjectsValid] = useState(true)
  const [bellShift, setBellShift] = useState<Shift>(1)
  const [scheduleShift, setScheduleShift] = useState<Shift>(1)

  // Після перезавантаження продовжуємо з кроку, на якому зупинилися.
  const [step, setStep] = useState(() => (hasDraft(uid) ? Math.min(getOnboardingStep(uid) ?? 0, STEPS.length - 1) : 0))
  useEffect(hideSplash, [])

  const current = STEPS[step]
  const last = step === STEPS.length - 1
  const ready = year ? canProceed(current.id, counts) && (current.id !== 'subjects' || subjectsValid) && (current.id !== 'year' || (!!year.title.trim() && !!year.start_date && !!year.end_date)) && (current.id !== 'semesters' || semestersComplete(data.periods)) && (current.id !== 'vacations' || vacationsComplete(data.periods, data.daysOff)) && (current.id !== 'schedule' || scheduleComplete(data)) : !draftError

  function go(n: number) {
    setSubjectsValid(true)
    setStep(n)
    setOnboardingStep(uid, n)
    window.scrollTo(0, 0)
  }

  async function next() {
    if (!ready) return
    if (current.id === 'subjects') {
      const free = unassignedClasses(data.classes, data.links)
      const names = free.map((c) => c.display_name)
      const list = names.length > 8 ? `${names.slice(0, 8).join(', ')} та ще ${names.length - 8}` : names.join(', ')
      if (
        free.length &&
        !(await ask(`${free.length === 1 ? 'Клас' : 'Класи'} ${list} не розподілено між предметами, для ${free.length === 1 ? 'нього' : 'них'} не буде створено КТП.`, {
          title: `Продовжити без ${classesGenitive(free.length)}?`,
          ok: 'Продовжити',
          danger: false,
        }))
      )
        return
    }
    if (!year) {
      const id = createYear({ ...draft, withSemesters: true, blank: true })
      setYearId(id)
      go(1)
    } else if (current.id === 'vacations') {
      // Рік міг бути створений раніше без канікул: доводимо їх до ладу перед наступним кроком.
      const batch = newBatch()
      syncVacations(year.id, data.periods, data.daysOff, batch, false)
      commit(batch)
      go(step + 1)
    } else if (last) {
      // Лише тепер рік потрапляє в базу.
      flushDraft()
      stopDraft()
      discardDraft(uid)
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
        <main className={current.id === 'schedule' ? 'ob-main wide' : 'ob-main'}>
          <header className="ob-head">
            <p>
              Крок <span className="num">{step + 1}</span> з {STEPS.length}
            </p>
            <h1 id="ob-title">{current.heading ?? current.title}</h1>
            <p className="ob-lead">{current.lead}</p>
          </header>

          <section className={current.id === 'year' ? 'ob-block year' : current.id === 'classes' ? 'ob-block cls' : current.id === 'subjects' ? 'ob-block subj' : current.id === 'bells' ? 'ob-block bells' : current.id === 'schedule' ? 'ob-block sch' : 'ob-block'} aria-labelledby="ob-title">
            <div className={current.id === 'semesters' || current.id === 'vacations' ? 'ob-body ob-sem' : current.id === 'classes' ? 'ob-body ob-cls' : current.id === 'subjects' ? 'ob-body ob-subj' : current.id === 'bells' ? 'ob-body ob-bell' : current.id === 'schedule' ? 'ob-body ob-sch' : 'ob-body yp'} key={current.id}>
              {current.id === 'year' &&
                (year ? (
                  <ExistingYear year={year} periods={data.periods} daysOff={data.daysOff} others={years.filter((y) => y.id !== year.id)} />
                ) : (
                  <YearFields
                    title={draft.title}
                    start={draft.start}
                    end={draft.end}
                    onTitle={(title) => setDraft({ ...draft, title })}
                    onStart={(d) => setDraft({ ...draft, start: d ?? '' })}
                    onEnd={(d) => setDraft({ ...draft, end: d ?? '' })}
                  />
                ))}
              {year && current.id === 'semesters' && <SemestersStep year={year} periods={data.periods} daysOff={data.daysOff} />}
              {year && current.id === 'vacations' && <VacationsStep year={year} periods={data.periods} daysOff={data.daysOff} />}
              {year && current.id === 'classes' && <ClassesStep year={year} classes={data.classes} />}
              {year && current.id === 'subjects' && (
                <SubjectsStep
                  year={year}
                  courses={data.courses}
                  classes={data.classes}
                  links={data.links}
                  periods={data.periods}
                  daysOff={data.daysOff}
                  onValid={setSubjectsValid}
                />
              )}
              {year && current.id === 'bells' && (
                <BellsStep year={year} bells={data.bells[0]} entries={data.entries} shift={bellShift} onShift={setBellShift} />
              )}
              {year && current.id === 'schedule' && (
                <ScheduleStep
                  year={year}
                  periods={data.periods}
                  bells={data.bells[0]}
                  timetables={data.timetables}
                  entries={data.entries}
                  courses={data.courses}
                  classes={data.classes}
                  links={data.links}
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
