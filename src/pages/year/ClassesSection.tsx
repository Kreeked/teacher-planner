import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { createDoc, deleteRefs, ref, refsWhere } from '../../data/db'
import type { AcademicYear, ClassGroup } from '../../data/types'
import { classDisplayName, gradeColor, parseLetters } from '../../data/year'

const GRADES = Array.from({ length: 11 }, (_, i) => i + 1)

export function ClassesSection({ year, classes }: { year: AcademicYear; classes: ClassGroup[] }) {
  const [grade, setGrade] = useState(5)
  const [letters, setLetters] = useState('')

  const existing = new Set(classes.map((c) => c.display_name))
  const parsed = parseLetters(letters)
  const toAdd = (parsed.length ? parsed : ['']).filter((l) => !existing.has(classDisplayName(grade, l)))

  function add(e: React.FormEvent) {
    e.preventDefault()
    for (const letter of toAdd)
      createDoc('class_groups', {
        academic_year_id: year.id,
        grade,
        letter,
        display_name: classDisplayName(grade, letter),
      })
    setLetters('')
  }

  async function remove(c: ClassGroup) {
    if (!confirm(`Видалити клас ${c.display_name}?`)) return
    // Разом із класом зникає і його прив'язка до КТП.
    deleteRefs([ref('class_groups', c.id), ...(await refsWhere('course_classes', 'class_group_id', c.id))])
  }

  const byGrade = new Map<number, ClassGroup[]>()
  for (const c of [...classes].sort((a, b) => a.grade - b.grade || a.letter.localeCompare(b.letter, 'uk')))
    byGrade.set(c.grade, [...(byGrade.get(c.grade) ?? []), c])

  return (
    <section className="panel">
      <h3>Класи</h3>
      {classes.length === 0 && <p className="muted">Додай класи, у яких викладаєш цього року.</p>}
      <div className="grades">
        {[...byGrade].map(([g, list]) => (
          <div key={g} className="grade-row">
            <span className="grade-label">{g} кл.</span>
            <div className="chips">
              {list.map((c) => (
                <span key={c.id} className="chip">
                  <span className="sw" style={{ background: gradeColor(c.grade) }} />
                  {c.display_name}
                  <button className="chip-x" onClick={() => remove(c)} aria-label={`Видалити ${c.display_name}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form className="add-class" onSubmit={add}>
        <select className="field" value={grade} onChange={(e) => setGrade(Number(e.target.value))} aria-label="Паралель">
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g} клас
            </option>
          ))}
        </select>
        <input
          className="field"
          placeholder="Літери: А Б В"
          value={letters}
          onChange={(e) => setLetters(e.target.value)}
          aria-label="Літери класів"
        />
        <button className="btn" disabled={toAdd.length === 0}>
          <Plus size={16} /> Додати
        </button>
      </form>
    </section>
  )
}
