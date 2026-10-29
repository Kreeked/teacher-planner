import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { commit, createDoc, newBatch } from '../../data/db'
import type { AcademicYear, ClassGroup } from '../../data/types'

// Навчальний рік ≈ 35 тижнів: 17 у І семестрі й 18 у ІІ.
const WEEKS_1 = 17
const WEEKS_2 = 18

const parse = (v: string) => Number(v.replace(',', '.'))

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
  // null — ІІ семестр як І, доки його не змінили.
  const [hours2, setHours2] = useState<string | null>(null)
  const [total, setTotal] = useState(String(WEEKS_1 + WEEKS_2))
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())

  const gradeClasses = classes.filter((c) => c.grade === grade).sort((a, b) => a.letter.localeCompare(b.letter, 'uk'))
  const chosen = gradeClasses.filter((c) => !unchecked.has(c.id))
  const hoursNum = parse(hours)
  const hours2Num = parse(hours2 ?? hours)
  const totalNum = Number(total)
  const valid = subject.trim() && hoursNum > 0 && hours2Num > 0 && Number.isInteger(totalNum) && totalNum > 0

  function changeHours(h1: string, h2: string | null) {
    setHours(h1)
    setHours2(h2)
    const a = parse(h1)
    const b = parse(h2 ?? h1)
    if (a > 0 && b > 0) setTotal(String(Math.round(a * WEEKS_1 + b * WEEKS_2)))
  }

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
        ...(hours2Num !== hoursNum && { hours_per_week_2: hours2Num }),
        total_hours: totalNum,
        program_ref: '',
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
        <div className="form-grid two">
          <label>
            Предмет
            <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
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
        </div>
        <div>
          <span className="form-label">Годин на тиждень</span>
          <div className="form-grid three">
            <label>
              І семестр
              <input
                className="field"
                inputMode="decimal"
                value={hours}
                onChange={(e) => changeHours(e.target.value, hours2)}
              />
            </label>
            <label>
              ІІ семестр
              <input
                className="field"
                inputMode="decimal"
                value={hours2 ?? hours}
                onChange={(e) => changeHours(hours, e.target.value)}
              />
            </label>
            <label>
              Годин за рік
              <input className="field" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} />
            </label>
          </div>
        </div>
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
