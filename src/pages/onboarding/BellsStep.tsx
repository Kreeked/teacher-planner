import { Minus, Plus, Trash2, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { TimePicker } from '../../components/TimePicker'
import { commit, createDoc, newBatch, ref, updateFields } from '../../data/db'
import {
  SHIFTS,
  buildBells,
  defaultSlots,
  entryShift,
  lastEnd,
  shiftParams,
  shiftSlots,
  shiftsOverlap,
  startLimits,
  type Shift,
} from '../../data/timetable'
import type { AcademicYear, BellSchedule, BellSlot, TimetableEntry } from '../../data/types'
import { ask } from '../../lib/confirm'

type Props = {
  year: AcademicYear
  bells?: BellSchedule
  // Клітинки розкладу цього року: з уроком, який видалено, вони зникають, а наступні уроки зсуваються.
  entries: TimetableEntry[]
  shift: Shift
  onShift: (s: Shift) => void
}

const MIN_LESSON = 30
const MAX_LESSON = 90
const MAX_BREAK = 60

/** «−», значення й «+» кроком 5 хвилин. */
function Stepper({ value, min, max, label, className, onChange }: {
  value: number
  min: number
  max: number
  label: string
  className: string
  onChange: (n: number) => void
}) {
  return (
    <span className={className}>
      <button type="button" className="less" aria-label={`Менше: ${label}`} disabled={value <= min} onClick={() => onChange(value - 5)}>
        <Minus size={12} strokeWidth={2.4} aria-hidden />
      </button>
      <span aria-live="polite">{value} хв</span>
      <button type="button" className="more" aria-label={`Більше: ${label}`} disabled={value >= max} onClick={() => onChange(value + 5)}>
        <Plus size={12} strokeWidth={2.4} aria-hidden />
      </button>
    </span>
  )
}

/**
 * Дзвінки зміни: користувач задає початок першого уроку, тривалість і перерви, а час кожного уроку рахується сам.
 * Друга зміна не може починатися раніше, ніж закінчиться перша.
 */
export function BellsStep({ year, bells, entries, shift, onShift }: Props) {
  const slots = shiftSlots(bells, shift)
  // Поки в зміні немає уроків, початок і тривалість зберігаються тут і потрапляють у перший доданий урок.
  const [pre, setPre] = useState<Partial<Record<Shift, { start: string; minutes: number }>>>({})
  const [error, setError] = useState('')
  const own = shiftParams(slots, shift)
  const start = slots.length ? own.start : (pre[shift]?.start ?? own.start)
  const minutes = slots.length ? own.minutes : (pre[shift]?.minutes ?? own.minutes)
  const limits = startLimits(bells, shift)

  /** Записує дзвінки зміни; відмовляє, якщо зміни перетнулися. */
  function save(next: BellSlot[] | null, target: Shift = shift, batch?: ReturnType<typeof newBatch>) {
    if (!next) {
      setError('Такий час не підходить: уроки мають закінчитися до кінця доби.')
      return false
    }
    const first = target === 1 ? next : shiftSlots(bells, 1)
    const second = target === 2 ? next : shiftSlots(bells, 2)
    if (shiftsOverlap(first, second)) {
      setError(
        target === 2
          ? `Друга зміна не може починатися раніше, ніж закінчиться перша (${lastEnd(first)}).`
          : `Перша зміна має закінчитися до початку другої (${second[0].start}).`,
      )
      return false
    }
    setError('')
    const field = target === 2 ? 'second_shift' : 'slots'
    if (bells) updateFields('bell_schedules', bells.id, { [field]: next }, batch)
    else
      createDoc(
        'bell_schedules',
        { academic_year_id: year.id, slots: target === 2 ? [] : next, ...(target === 2 ? { second_shift: next } : {}) },
        batch,
      )
    return true
  }

  function setStart(v: string) {
    if (!slots.length) {
      setPre({ ...pre, [shift]: { start: v, minutes } })
      return true
    }
    return save(buildBells(v, minutes, own.breaks))
  }

  function setMinutes(n: number) {
    if (!slots.length) setPre({ ...pre, [shift]: { start, minutes: n } })
    else save(buildBells(start, n, own.breaks))
  }

  function setBreak(i: number, n: number) {
    save(buildBells(start, minutes, own.breaks.map((b, j) => (j === i ? n : b))))
  }

  function addLesson() {
    // Перерва перед новим уроком — 10 хв, а в порожній зміні перший урок бере початок і тривалість із полів вище.
    save(buildBells(start, minutes, slots.length ? [...own.breaks.slice(0, -1), 10, 0] : [0]))
  }

  async function removeLesson(i: number) {
    const mine = entries.filter((e) => entryShift(e) === shift)
    const gone = mine.filter((e) => e.slot_number === i + 1)
    if (gone.length && !(await ask(`Разом з уроком буде видалено ${gone.length} кл. у розкладі. Наступні уроки отримають менші номери.`, { title: `Видалити урок ${i + 1}?` }))) return
    const batch = newBatch()
    for (const e of gone) batch.delete(ref('timetable_entries', e.id))
    // Уроки після видаленого отримують менші номери, а клас у розкладі йде за своїм уроком.
    for (const e of mine) if (e.slot_number > i + 1) updateFields('timetable_entries', e.id, { slot_number: e.slot_number - 1 }, batch)
    const rest = own.breaks.filter((_, j) => j !== i)
    if (save(buildBells(start, minutes, rest), shift, batch)) commit(batch)
  }

  async function typical() {
    if ((slots.length || shiftSlots(bells, shift === 1 ? 2 : 1).length) && !(await ask('Поточні дзвінки обох змін буде замінено типовими.', { title: 'Замінити дзвінки?', ok: 'Замінити' }))) return
    const [a, b] = [defaultSlots(1), defaultSlots(2)]
    setError('')
    if (bells) updateFields('bell_schedules', bells.id, { slots: a, second_shift: b })
    else createDoc('bell_schedules', { academic_year_id: year.id, slots: a, second_shift: b })
    setPre({})
  }

  return (
    <>
      <div className="ob-bell-top">
        <div className="ob-bell-shifts" role="group" aria-label="Зміна">
          {SHIFTS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={s.value === shift ? 'on' : undefined}
              aria-pressed={s.value === shift}
              onClick={() => {
                setError('')
                onShift(s.value)
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" className="ob-bell-typical" onClick={typical}>
          <WandSparkles size={14} strokeWidth={2} aria-hidden /> Типові дзвінки
        </button>
      </div>

      <div className="ob-bell-set">
        <div className="ob-bell-f">
          Початок першого уроку
          <TimePicker
            className="ob-bell-time"
            label="Початок першого уроку"
            value={start}
            min={limits.min}
            max={limits.max}
            onChange={setStart}
          />
        </div>
        <div className="ob-bell-f">
          Тривалість уроку
          <Stepper className="ob-bell-dur" value={minutes} min={MIN_LESSON} max={MAX_LESSON} label="тривалість уроку" onChange={setMinutes} />
        </div>
      </div>

      {error && <Alert kind="crit">{error}</Alert>}

      <hr className="ob-bell-hr" />

      <div className="ob-bell-list">
        {slots.length > 0 && (
          <div className="ob-bell-row head">
            <span className="time">Час уроку</span>
            <span className="brk">Перерва після</span>
            <span className="del" />
          </div>
        )}
        {slots.map((s, i) => (
          <div key={s.number} className="ob-bell-row">
            <span className="time">
              <b>{s.number}</b>
              <span className="range">
                {s.start}
                <i>–</i>
                {s.end}
              </span>
            </span>
            {i < slots.length - 1 ? (
              <Stepper
                className="ob-bell-break"
                value={s.break_after}
                min={0}
                max={MAX_BREAK}
                label={`перерва після уроку ${s.number}`}
                onChange={(n) => setBreak(i, n)}
              />
            ) : (
              <span className="brk none">—</span>
            )}
            <button type="button" className="ob-bell-del" aria-label={`Видалити урок ${s.number}`} onClick={() => removeLesson(i)}>
              <Trash2 size={15} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
        ))}
        {slots.length === 0 && <p className="ob-bell-empty">Дзвінків цієї зміни ще немає. Додай уроки або візьми типові.</p>}
      </div>

      <button type="button" className="ob-sub-add" onClick={addLesson}>
        <Plus size={16} strokeWidth={2.2} aria-hidden /> Додати урок
      </button>
    </>
  )
}
