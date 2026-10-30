import { useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { commit, createDoc, newBatch, ref, updateFields } from '../../data/db'
import {
  addSlot,
  defaultSlots,
  entryShift,
  minutesBetween,
  removeSlot,
  setSlotBreak,
  setSlotEnd,
  setSlotStart,
  shiftSlots,
  type Shift,
} from '../../data/timetable'
import type { AcademicYear, BellSchedule, BellSlot, TimetableEntry } from '../../data/types'
import { ask } from '../../lib/confirm'
import { useNarrow } from '../../lib/useNarrow'
import { TimePicker } from '../../components/TimePicker'
import { ShiftPills } from './ShiftPills'

type Props = {
  year: AcademicYear
  bells?: BellSchedule
  // Клітинки розкладу цього року: з уроком, який видалено, вони зникають, а наступні уроки зсуваються.
  entries: TimetableEntry[]
  shift: Shift
  onShift: (s: Shift) => void
}

function Num({ n }: { n: number }) {
  return <span className="yp-num">{n}</span>
}

/** Перерва після уроку: «−», число й «+» кроком 5 хв. */
function BreakStepper({
  minutes,
  label,
  suffix,
  onChange,
}: {
  minutes: number
  label: string
  suffix: string
  onChange: (n: number) => boolean
}) {
  return (
    <span className={minutes > 10 ? 'yp-break long' : 'yp-break'}>
      <button type="button" aria-label="Менше" onClick={() => onChange(Math.max(0, minutes - 5))} disabled={minutes <= 0}>
        <Minus size={12} strokeWidth={2.2} />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        autoComplete="off"
        defaultValue={suffix ? `${minutes} ${suffix}` : minutes}
        key={minutes}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          const n = Math.round(Number(e.target.value.replace(/\D/g, '')))
          if (e.target.value.trim() === '' || n === minutes || !onChange(n))
            e.target.value = suffix ? `${minutes} ${suffix}` : String(minutes)
        }}
      />
      {!suffix && <span className="yp-break-unit">хв</span>}
      <button type="button" aria-label="Більше" onClick={() => onChange(Math.min(120, minutes + 5))} disabled={minutes >= 120}>
        <Plus size={12} strokeWidth={2.2} />
      </button>
    </span>
  )
}

/** Дзвінки року: дві зміни, час кожного уроку редагується прямо в таблиці (на телефоні — карткою). */
export function BellsSection({ year, bells, entries, shift, onShift }: Props) {
  const narrow = useNarrow()
  const slots = shiftSlots(bells, shift)
  const [error, setError] = useState('')

  function save(next: BellSlot[] | null) {
    if (!next) {
      setError('Такий час не підходить: уроки мають іти по черзі й не перетинатися.')
      return false
    }
    setError('')
    const field = shift === 2 ? 'second_shift' : 'slots'
    if (bells) updateFields('bell_schedules', bells.id, { [field]: next })
    else
      createDoc('bell_schedules', {
        academic_year_id: year.id,
        slots: shift === 2 ? [] : next,
        ...(shift === 2 ? { second_shift: next } : {}),
      })
    return true
  }

  async function remove(i: number) {
    const own = entries.filter((e) => entryShift(e) === shift)
    const gone = own.filter((e) => e.slot_number === i + 1)
    if (gone.length && !(await ask(`На цьому уроці в розкладі ${gone.length} кл. Видалити урок ${i + 1} разом із ними?`))) return
    const batch = newBatch()
    for (const e of gone) batch.delete(ref('timetable_entries', e.id))
    // Уроки після видаленого отримують менші номери, а клас у розкладі йде за своїм уроком.
    for (const e of own)
      if (e.slot_number > i + 1) updateFields('timetable_entries', e.id, { slot_number: e.slot_number - 1 }, batch)
    const field = shift === 2 ? 'second_shift' : 'slots'
    if (bells) updateFields('bell_schedules', bells.id, { [field]: removeSlot(slots, i) }, batch)
    commit(batch)
  }

  const timeFields = (s: BellSlot, i: number) => [
    <TimePicker key="s" label={`Початок уроку ${s.number}`} value={s.start} onChange={(v) => save(setSlotStart(slots, i, v))} />,
    <TimePicker key="e" label={`Кінець уроку ${s.number}`} value={s.end} onChange={(v) => save(setSlotEnd(slots, i, v))} />,
  ]

  return (
    <section className="panel yp-block" aria-labelledby="yp-bells">
      <div className="yp-head stack">
        <h2 id="yp-bells">Дзвінки</h2>
        <ShiftPills
          value={shift}
          onChange={(s) => {
            setError('')
            onShift(s)
          }}
        />
      </div>
      {error && <p className="field-error yp-bell-error">{error}</p>}

      {narrow ? (
        <div className="yp-bell-cards">
          {slots.map((s, i) => (
            <div key={s.number} className="yp-bell-card">
              <div className="yp-bell-card-head">
                <span className="yp-bell-title">
                  <Num n={s.number} />
                  урок
                  <span className="yp-bell-dur">{minutesBetween(s.start, s.end)} хв</span>
                </span>
                <button type="button" className="icon-btn del" aria-label={`Видалити урок ${s.number}`} onClick={() => remove(i)}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="yp-bell-times">
                <label>
                  Початок
                  {timeFields(s, i)[0]}
                </label>
                <label>
                  Кінець
                  {timeFields(s, i)[1]}
                </label>
              </div>
              {i < slots.length - 1 && (
                <div className="yp-bell-brk">
                  <span>Перерва після</span>
                  <BreakStepper
                    minutes={s.break_after}
                    suffix="хв"
                    label={`Перерва після уроку ${s.number}, хв`}
                    onChange={(n) => save(setSlotBreak(slots, i, n))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="yp-bell-table">
          <div className="yp-bell-row head">
            <span>Урок</span>
            <span>Початок</span>
            <span>Кінець</span>
            <span>Тривалість</span>
            <span>Перерва після</span>
            <span />
          </div>
          {slots.map((s, i) => (
            <div key={s.number} className="yp-bell-row">
              <span>
                <Num n={s.number} />
              </span>
              <span>{timeFields(s, i)[0]}</span>
              <span>{timeFields(s, i)[1]}</span>
              <span>
                <span className="yp-dur">{minutesBetween(s.start, s.end)} хв</span>
              </span>
              <span className={i === slots.length - 1 ? 'yp-hidden' : undefined}>
                <BreakStepper
                  minutes={s.break_after}
                  suffix=""
                  label={`Перерва після уроку ${s.number}, хв`}
                  onChange={(n) => save(setSlotBreak(slots, i, n))}
                />
              </span>
              <button type="button" className="icon-btn del" aria-label={`Видалити урок ${s.number}`} onClick={() => remove(i)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {slots.length === 0 && <p className="yp-empty">Дзвінків цієї зміни ще немає.</p>}
          <div className="yp-bell-foot">
            <button type="button" className="btn ghost" onClick={() => save(addSlot(slots, shift))}>
              <Plus size={16} /> Додати
            </button>
            {slots.length === 0 && (
              <button type="button" className="btn ghost" onClick={() => save(defaultSlots(shift))}>
                Типові дзвінки
              </button>
            )}
          </div>
        </div>
      )}

      {narrow && (
        <div className="yp-bell-foot cards">
          {slots.length === 0 && <p className="yp-empty">Дзвінків цієї зміни ще немає.</p>}
          <button type="button" className="btn ghost" onClick={() => save(addSlot(slots, shift))}>
            <Plus size={16} /> Додати
          </button>
          {slots.length === 0 && (
            <button type="button" className="btn ghost" onClick={() => save(defaultSlots(shift))}>
              Типові дзвінки
            </button>
          )}
        </div>
      )}
    </section>
  )
}
