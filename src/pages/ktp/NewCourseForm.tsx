import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { commit, createDoc, newBatch } from '../../data/db'
import type { AcademicYear, ClassGroup } from '../../data/types'

// Навчальний рік ≈ 35 тижнів.
const WEEKS = 35

export function NewCourseForm({
  year,
  classes,
  onDone,
}: {
  year: AcademicYear
  classes: ClassGroup[]
  onDone: (id?: string) => void
}) {
  const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b)
  const [subject, setSubject] = useState('Інформатика')
  const [grade, setGrade] = useState(grades[0] ?? 5)
  const [hours, setHours] = useState('1')
  const [total, setTotal] = useState(String(WEEKS))
  const [program, setProgram] = useState('')
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())

  const gradeClasses = classes.filter((c) => c.grade === grade).sort((a, b) => a.letter.localeCompare(b.letter, 'uk'))
  const chosen = gradeClasses.filter((c) => !unchecked.has(c.id))
  const hoursNum = Number(hours.replace(',', '.'))
  const totalNum = Number(total)
  const valid = subject.trim() && hoursNum > 0 && Number.isInteger(totalNum) && totalNum > 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const batch = newBatch()
    const courseId = createDoc(
      'courses',
      {
        academic_year_id: year.id,
        subject: subject.trim(),
        grade,
        hours_per_week: hoursNum,
        total_hours: totalNum,
        program_ref: program.trim(),
        status: 'draft',
      },
      batch,
    )
    chosen.forEach((c, i) =>
      createDoc('course_classes', { course_id: courseId, class_group_id: c.id, position: i }, batch),
    )
    commit(batch)
    onDone(courseId)
  }

  return (
    <Dialog
      title="Нове КТП"
      subtitle={year.title}
      onClose={() => onDone()}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => onDone()}>
            Скасувати
          </button>
          <button className="btn" form="new-course" disabled={!valid}>
            Створити КТП
          </button>
        </>
      }
    >
      <form id="new-course" className="form" onSubmit={submit}>
        <label>
          Предмет
          <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <div className="form-grid three">
          <label>
            Паралель
            <select className="field" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {(grades.length ? grades : [grade]).map((g) => (
                <option key={g} value={g}>
                  {g} клас
                </option>
              ))}
            </select>
          </label>
          <label>
            Годин на тиждень
            <input
              className="field"
              inputMode="decimal"
              value={hours}
              onChange={(e) => {
                setHours(e.target.value)
                const h = Number(e.target.value.replace(',', '.'))
                if (h > 0) setTotal(String(Math.round(h * WEEKS)))
              }}
            />
          </label>
          <label>
            Годин за рік
            <input className="field" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
          </label>
        </div>
        <label>
          Навчальна програма (необов'язково)
          <input
            className="field"
            placeholder="Напр., модельна програма «Інформатика. 5–6 класи»"
            value={program}
            onChange={(e) => setProgram(e.target.value)}
          />
        </label>
        <div>
          <span className="form-label">Класи</span>
          {gradeClasses.length === 0 ? (
            <p className="muted">У цій паралелі ще немає класів. Додай їх у «Навчальному році».</p>
          ) : (
            <div className="chips">
              {gradeClasses.map((c) => {
                const on = !unchecked.has(c.id)
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={on ? 'chip plain on' : 'chip plain'}
                    aria-pressed={on}
                    onClick={() => {
                      const next = new Set(unchecked)
                      if (on) next.add(c.id)
                      else next.delete(c.id)
                      setUnchecked(next)
                    }}
                  >
                    {c.display_name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </form>
    </Dialog>
  )
}
