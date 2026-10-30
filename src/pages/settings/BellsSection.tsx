import { ArrowUpRight, Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createDoc, updateFields, useCollection } from '../../data/db'
import { DEFAULT_BELLS, computeBells, minutesBetween, shiftTime, validateBells } from '../../data/timetable'
import { pickCurrentYear } from '../../data/year'
import type { AcademicYear, BellSchedule, BellSlot } from '../../data/types'

/** Дзвінки поточного навчального року для налаштувань застосунку. */
export function BellsSettings() {
  const { items: years, loading } = useCollection('academic_years')
  const year = pickCurrentYear(years)
  const { items: bells } = useCollection('bell_schedules', year ? { field: 'academic_year_id', value: year.id } : null)
  if (loading) return null
  if (!year)
    return (
      <section className="panel form">
        <h3>Розклад дзвінків</h3>
        <p className="muted">Дзвінки прив'язані до навчального року — спершу створи його.</p>
        <Link to="/ktp/year" className="btn ghost">
          <ArrowUpRight size={15} /> До навчального року
        </Link>
      </section>
    )
  return <BellsSection year={year} bells={bells[0]} />
}

/** Дзвінки: початок дня, тривалість уроку й перерв; час кожного уроку можна підправити вручну. */
function BellsSection({ year, bells }: { year: AcademicYear; bells?: BellSchedule }) {
  if (!bells)
    return (
      <section className="panel form">
        <h3>Розклад дзвінків</h3>
        <p className="muted">
          Задай початок першого уроку, тривалість уроку й перерв — час усіх уроків порахується сам.
        </p>
        <button
          className="btn"
          onClick={() =>
            createDoc('bell_schedules', {
              academic_year_id: year.id,
              first_start: DEFAULT_BELLS.first_start,
              lesson_minutes: DEFAULT_BELLS.lesson_minutes,
              slots: computeBells(DEFAULT_BELLS.first_start, DEFAULT_BELLS.lesson_minutes, DEFAULT_BELLS.breaks),
            })
          }
        >
          <Bell size={15} /> Налаштувати дзвінки
        </button>
      </section>
    )

  const b = bells
  const breaks = b.slots.map((s) => s.break_after)

  // Зміна загальних параметрів перераховує всі дзвінки.
  function recompute(patch: { first_start?: string; lesson_minutes?: number; breaks?: number[] }) {
    const first_start = patch.first_start ?? b.first_start
    const lesson_minutes = patch.lesson_minutes ?? b.lesson_minutes
    updateFields('bell_schedules', b.id, {
      first_start,
      lesson_minutes,
      slots: computeBells(first_start, lesson_minutes, patch.breaks ?? breaks),
    })
  }

  function setCount(n: number) {
    if (n < 1 || n > 12 || n === b.slots.length) return
    recompute({ breaks: Array.from({ length: n }, (_, i) => breaks[i] ?? 10) })
  }

  function editSlot(i: number, patch: Partial<BellSlot>) {
    const slots = b.slots.map((s, j) => (j === i ? { ...s, ...patch } : s))
    if (validateBells(slots)) return false
    updateFields('bell_schedules', b.id, { slots })
    return true
  }

  return (
    <section className="panel form bells">
      <h3>Розклад дзвінків</h3>
      <div className="form-row">
        <label>
          Початок першого уроку
          <input
            className="field"
            type="time"
            defaultValue={b.first_start}
            key={b.first_start}
            onBlur={(e) =>
              e.target.value && e.target.value !== b.first_start && recompute({ first_start: e.target.value })
            }
          />
        </label>
        <label>
          Урок, хв
          <input
            className="field"
            inputMode="numeric"
            defaultValue={b.lesson_minutes}
            key={b.lesson_minutes}
            onBlur={(e) => {
              const n = Math.round(Number(e.target.value))
              if (n >= 10 && n <= 120 && n !== b.lesson_minutes) recompute({ lesson_minutes: n })
              else e.target.value = String(b.lesson_minutes)
            }}
          />
        </label>
        <label>
          Уроків на день
          <input
            className="field"
            inputMode="numeric"
            defaultValue={b.slots.length}
            key={b.slots.length}
            onBlur={(e) => setCount(Math.round(Number(e.target.value)))}
          />
        </label>
      </div>
      <p className="muted small-text">
        Час уроку можна підправити вручну. Зміна початку, тривалості чи перерви перераховує всі дзвінки заново.
      </p>
      <div className="bell-list">
        {b.slots.map((s, i) => (
          <div key={s.number} className="bell-row">
            <b className="num">{s.number}</b>
            <TimeInput
              label={`Початок уроку ${s.number}`}
              value={s.start}
              onSave={(v) => editSlot(i, { start: v, end: shiftTime(s.end, minutesBetween(s.start, v)) })}
            />
            <span className="dash">—</span>
            <TimeInput label={`Кінець уроку ${s.number}`} value={s.end} onSave={(v) => editSlot(i, { end: v })} />
            {i < b.slots.length - 1 && (
              <label className="bell-break">
                перерва
                <input
                  className="field num"
                  inputMode="numeric"
                  aria-label={`Перерва після уроку ${s.number}, хв`}
                  defaultValue={s.break_after}
                  key={`${s.number}-${s.break_after}`}
                  onBlur={(e) => {
                    const n = Math.round(Number(e.target.value))
                    if (n >= 0 && n <= 120 && n !== s.break_after)
                      recompute({ breaks: breaks.map((x, j) => (j === i ? n : x)) })
                    else e.target.value = String(s.break_after)
                  }}
                />
                хв
              </label>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function TimeInput({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => boolean }) {
  return (
    <input
      className="field num"
      type="time"
      aria-label={label}
      defaultValue={value}
      key={value}
      onBlur={(e) => {
        if (e.target.value === value) return
        if (!e.target.value || !onSave(e.target.value)) e.target.value = value
      }}
    />
  )
}
