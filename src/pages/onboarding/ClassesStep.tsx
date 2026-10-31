import { Plus } from 'lucide-react'
import { useState } from 'react'
import { createDoc, deleteRefs, ref, refsWhere } from '../../data/db'
import { classesWord } from '../../data/onboarding'
import type { AcademicYear, ClassGroup } from '../../data/types'
import { classDisplayName, gradeColor, parseLetters } from '../../data/year'
import { ask } from '../../lib/confirm'

const GRADES = Array.from({ length: 11 }, (_, i) => i + 1)
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'І']

/** Додати іншу літеру: кнопка «+» стає коротким полем; Enter чи вихід з поля додає, Esc скасовує. */
function OtherLetter({ grade, onAdd }: { grade: number; onAdd: (letter: string) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  function close(save: boolean) {
    const letter = parseLetters(value)[0]
    if (save && letter) onAdd(letter)
    setValue('')
    setOpen(false)
  }

  if (!open)
    return (
      <button type="button" className="ob-cls-plus" aria-label={`Додати іншу літеру для ${grade} класу`} onClick={() => setOpen(true)}>
        <Plus size={14} strokeWidth={2.2} aria-hidden />
      </button>
    )
  return (
    <input
      className="ob-cls-other"
      autoFocus
      maxLength={3}
      value={value}
      aria-label={`Літера для ${grade} класу`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(true)
        if (e.key === 'Escape') close(false)
      }}
    />
  )
}

/** Таблиця «паралель × літера»: натиснута літера — клас додано, ще раз — прибрано. */
export function ClassesStep({ year, classes }: { year: AcademicYear; classes: ClassGroup[] }) {
  function add(grade: number, letter: string) {
    createDoc('class_groups', { academic_year_id: year.id, grade, letter, display_name: classDisplayName(grade, letter) })
  }

  async function remove(c: ClassGroup) {
    // Разом із класом зникають його прив'язки до КТП, дати уроків і клітинки розкладу.
    const links = [
      ...(await refsWhere('course_classes', 'class_group_id', c.id)),
      ...(await refsWhere('lesson_schedules', 'class_group_id', c.id)),
      ...(await refsWhere('timetable_entries', 'class_group_id', c.id)),
    ]
    if (links.length && !(await ask(`Видалити клас ${c.display_name} разом з його прив'язками до предметів і розкладу?`))) return
    deleteRefs([ref('class_groups', c.id), ...links])
  }

  return (
    <>
      {GRADES.map((grade) => {
        const own = classes.filter((c) => c.grade === grade)
        const byLetter = new Map(own.map((c) => [c.letter, c]))
        // Літери поза типовими (додані раніше чи через «+») показуємо в тому ж ряду.
        const extra = own.map((c) => c.letter).filter((l) => !LETTERS.includes(l)).sort((a, b) => a.localeCompare(b, 'uk'))
        const color = gradeColor(grade)
        return (
          <div key={grade} className="ob-cls-row">
            <span className="ob-cls-grade" style={{ background: color }}>
              {grade} клас
            </span>
            <div className="ob-cls-letters">
              {[...LETTERS, ...extra].map((letter) => {
                const c = byLetter.get(letter)
                const name = classDisplayName(grade, letter)
                return (
                  <button
                    key={letter}
                    type="button"
                    className={c ? 'ob-cls-letter on' : 'ob-cls-letter'}
                    style={c ? { background: color } : undefined}
                    aria-pressed={!!c}
                    aria-label={`${name}, ${c ? 'додано' : 'не додано'}`}
                    onClick={() => (c ? remove(c) : add(grade, letter))}
                  >
                    {letter || '—'}
                  </button>
                )
              })}
              <OtherLetter grade={grade} onAdd={(letter) => !byLetter.has(letter) && add(grade, letter)} />
            </div>
            <span className="ob-cls-count">{own.length ? classesWord(own.length) : ''}</span>
          </div>
        )
      })}
    </>
  )
}
