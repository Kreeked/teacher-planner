import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { DatePicker } from '../../components/DatePicker'
import { useRangeDraft } from '../../components/useRangeDraft'
import { commit, createDoc, newBatch, updateFields } from '../../data/db'
import type { AcademicYear, DayOff, ISODate, Period } from '../../data/types'
import { VACATIONS, shiftDay, validateSemester, validateVacation, winterBreak, type VacationKind } from '../../data/vacations'
import { formatDate, sortPeriods } from '../../data/year'
import { notifySaved } from '../../lib/saved'
import { syncVacations } from '../year/vacations'

/** Поле дати, яку змінити не можна: вона береться з іншого місця. */
function LockedDate({ value, label }: { value: ISODate | null; label: string }) {
  return (
    <button type="button" className="ob-sem-date locked" disabled aria-label={`${label}: ${value ? formatDate(value) : 'немає'}, змінити не можна`}>
      <span>{value ? formatDate(value) : '—'}</span>
      <Lock size={14} aria-hidden />
    </button>
  )
}

/** Початок – кінець: два поля через тире. */
function Dates({ children }: { children: [ReactNode, ReactNode] }) {
  return (
    <div className="ob-sem-dates">
      {children[0]}
      <span className="ob-sem-dash">–</span>
      {children[1]}
    </div>
  )
}

type SemesterProps = {
  n: number
  period: Period
  periods: Period[]
  daysOff: DayOff[]
  year: AcademicYear
  prev?: Period
  next?: Period
  /** Канікули цього семестру, які він не повинен випустити за свої межі. */
  vacation?: { title: string; start_date: ISODate; end_date: ISODate }
  caption?: string
  lockStart: boolean
  lockEnd: boolean
}

function SemesterCard({ n, period, periods, daysOff, year, prev, next, vacation, caption, lockStart, lockEnd }: SemesterProps) {
  const r = useRangeDraft({
    value: { title: period.title, start_date: period.start_date, end_date: period.end_date },
    validate: (v) => validateSemester(v, { year, prev, next, vacation }),
    onSave: (v) => {
      const batch = newBatch()
      updateFields('periods', period.id, v, batch)
      // Зимові канікули стоять між семестрами, тож рухаються разом із їхніми датами.
      syncVacations(year.id, periods.map((x) => (x.id === period.id ? { ...x, ...v } : x)), daysOff, batch)
      commit(batch)
      notifySaved()
    },
  })
  // Календар не дає вибрати дату, після якої семестр випустить свої канікули за межі.
  const startMax = [r.draft.end_date, vacation?.start_date].filter(Boolean).sort()[0] || undefined
  const endMin = [r.draft.start_date, vacation?.end_date].filter(Boolean).sort().reverse()[0] || undefined
  return (
    <div className="ob-sem-card">
      <div className="ob-sem-row">
        <span className="ob-sem-n">{n}</span>
        <b className="ob-sem-name">{period.title}</b>
        <Dates>
          {lockStart ? (
            <LockedDate value={r.draft.start_date} label={`Початок ${period.title}`} />
          ) : (
            <DatePicker numeric trailingIcon label={`Початок ${period.title}`} value={r.draft.start_date || null} min={prev?.end_date ? shiftDay(prev.end_date, 1) : year.start_date} max={startMax} onChange={r.setStart} />
          )}
          {lockEnd ? (
            <LockedDate value={r.draft.end_date} label={`Кінець ${period.title}`} />
          ) : (
            <DatePicker numeric trailingIcon label={`Кінець ${period.title}`} value={r.draft.end_date || null} min={endMin} max={next?.start_date ? shiftDay(next.start_date, -1) : year.end_date} onChange={r.setEnd} />
          )}
        </Dates>
      </div>
      {caption && <p className="ob-sem-caption">{caption}</p>}
    </div>
  )
}

type VacationProps = {
  kind: 'autumn' | 'spring'
  doc?: DayOff
  fallback: { start_date: ISODate; end_date: ISODate }
  year: AcademicYear
  semester: Period
  others: { title: string; start_date: ISODate; end_date: ISODate }[]
}

function VacationCard({ kind, doc, fallback, year, semester, others }: VacationProps) {
  const { title, label } = VACATIONS[kind]
  const r = useRangeDraft({
    value: { title, start_date: doc?.start_date ?? fallback.start_date, end_date: doc?.end_date ?? fallback.end_date },
    validate: (v) => validateVacation(v, semester, others),
    onSave: (v) => {
      if (doc) updateFields('days_off', doc.id, { start_date: v.start_date, end_date: v.end_date })
      else createDoc('days_off', { academic_year_id: year.id, title, start_date: v.start_date, end_date: v.end_date })
      notifySaved()
    },
  })
  // Доки не вказано дати семестру, канікули в ньому вибрати нема з чим порівняти.
  const ready = !!semester.start_date && !!semester.end_date
  return (
    <div className="ob-sem-card slim">
      <div className="ob-sem-row">
        <b className="ob-sem-vac">{label}</b>
        <Dates>
          <DatePicker numeric trailingIcon disabled={!ready} label={`Початок: ${label}`} value={r.draft.start_date || null} min={semester.start_date || undefined} max={r.draft.end_date && r.draft.end_date < semester.end_date ? r.draft.end_date : semester.end_date || undefined} onChange={r.setStart} />
          <DatePicker numeric trailingIcon disabled={!ready} label={`Кінець: ${label}`} value={r.draft.end_date || null} min={r.draft.start_date && r.draft.start_date > semester.start_date ? r.draft.start_date : semester.start_date || undefined} max={semester.end_date || undefined} onChange={r.setEnd} />
        </Dates>
      </div>
    </div>
  )
}

const EMPTY = { start_date: '', end_date: '' }

/** Крок «Семестри й канікули»: межі семестрів, осінні та весняні канікули; зимові виходять із дат семестрів. */
export function SemestersStep({ year, periods, daysOff }: { year: AcademicYear; periods: Period[]; daysOff: DayOff[] }) {
  const sems = sortPeriods(periods.filter((p) => !p.parent_id))
  const first = sems[0]
  const second = sems[1]
  const last = sems[sems.length - 1]
  const doc = (k: VacationKind) => daysOff.find((d) => d.title === VACATIONS[k].title)
  const named = (k: VacationKind) => {
    const d = doc(k)
    return d ? { title: d.title, start_date: d.start_date, end_date: d.end_date } : undefined
  }
  const winter = first && second ? winterBreak(first, second) : null
  const winterNamed = winter ? { title: VACATIONS.winter.title, ...winter } : undefined

  return (
    <>
      <h2 className="ob-sem-h">Семестри</h2>
      {sems.map((p, i) => (
        <SemesterCard
          key={p.id}
          n={i + 1}
          period={p}
          periods={periods}
          daysOff={daysOff}
          year={year}
          prev={sems[i - 1]}
          next={sems[i + 1]}
          vacation={i === 0 ? named('autumn') : i === sems.length - 1 ? named('spring') : undefined}
          caption={
            i === 0
              ? 'Початок збігається з початком навчального року'
              : i === sems.length - 1
                ? 'Кінець збігається з кінцем навчального року'
                : undefined
          }
          lockStart={i === 0}
          lockEnd={i === sems.length - 1}
        />
      ))}

      {first && second && (
        <>
          <h2 className="ob-sem-h gap">Канікули</h2>
          <VacationCard
            kind="autumn"
            doc={doc('autumn')}
            fallback={EMPTY}
            year={year}
            semester={first}
            others={[named('spring'), winterNamed].filter((x) => !!x)}
          />
          <div className="ob-sem-card">
            <div className="ob-sem-row">
              <b className="ob-sem-vac">{VACATIONS.winter.label}</b>
              <Dates>
                <LockedDate value={winter?.start_date ?? null} label={`Початок: ${VACATIONS.winter.label}`} />
                <LockedDate value={winter?.end_date ?? null} label={`Кінець: ${VACATIONS.winter.label}`} />
              </Dates>
            </div>
            <p className="ob-sem-caption flush">Визначаються автоматично: від кінця І семестру до початку ІІ семестру</p>
          </div>
          <VacationCard
            kind="spring"
            doc={doc('spring')}
            fallback={EMPTY}
            year={year}
            semester={last}
            others={[named('autumn'), winterNamed].filter((x) => !!x)}
          />
        </>
      )}
    </>
  )
}
