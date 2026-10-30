import { SHIFTS, type Shift } from '../../data/timetable'

/** Перемикач зміни: «Перша зміна» / «Друга зміна». */
export function ShiftPills({ value, onChange }: { value: Shift; onChange: (s: Shift) => void }) {
  return (
    <div className="chips" role="group" aria-label="Зміна">
      {SHIFTS.map((s) => (
        <button
          key={s.value}
          type="button"
          className={s.value === value ? 'chip plain on' : 'chip plain'}
          aria-pressed={s.value === value}
          onClick={() => onChange(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
