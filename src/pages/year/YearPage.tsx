import { ask } from '../../lib/confirm'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Dialog } from '../../components/Dialog'
import { RangeRow } from '../../components/RangeRow'
import { notifySaved } from '../../lib/saved'
import { commit, deleteRefs, newBatch, ref, refsWhere, updateFields, useCollection } from '../../data/db'
import type { AcademicYear } from '../../data/types'
import { formatDate, gradeColor, pickCurrentYear, shortDate, sortPeriods, validateYear } from '../../data/year'
import { ScheduleSettings } from '../schedule/ScheduleSettings'
import { ClassesSection } from './ClassesSection'
import { NewYearForm } from './NewYearForm'
import { PeriodsSection } from './PeriodsSection'

type Editing = 'year' | 'periods' | 'classes' | null

const SEMESTER_TONES = ['var(--mint)', 'var(--butter)', 'var(--lilac)', 'var(--peri)']

/** Рядок налаштувань: підпис, значення й кнопка, що відкриває вікно редагування. */
function SetRow({ label, onEdit, editLabel, children }: { label: string; onEdit: () => void; editLabel: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-label">{label}</span>
      <div className="set-body">{children}</div>
      <button className="btn ghost small set-edit" onClick={onEdit}>
        {editLabel}
      </button>
    </div>
  )
}

export function YearPage() {
  const { items: years, loading } = useCollection('academic_years')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)

  const year = years.find((y) => y.id === selectedId) ?? pickCurrentYear(years)
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: periods } = useCollection('periods', filter)
  const { items: classes } = useCollection('class_groups', filter)

  function makeCurrent(y: AcademicYear) {
    const batch = newBatch()
    for (const other of years)
      if (other.is_current !== (other.id === y.id))
        updateFields('academic_years', other.id, { is_current: other.id === y.id }, batch)
    commit(batch)
  }

  async function removeYear(y: AcademicYear) {
    if (!(await ask(`Видалити навчальний рік ${y.title} разом із семестрами, класами і всіма КТП цього року?`))) return
    const refs = [
      ref('academic_years', y.id),
      ...periods.map((p) => ref('periods', p.id)),
      ...classes.map((c) => ref('class_groups', c.id)),
    ]
    for (const course of await refsWhere('courses', 'academic_year_id', y.id)) {
      refs.push(course)
      for (const name of [
        'course_classes',
        'topics',
        'lessons',
        'lesson_schedules',
        'lesson_materials',
      ] as const)
        refs.push(...(await refsWhere(name, 'course_id', course.id)))
    }
    deleteRefs(refs)
    setEditing(null)
    setSelectedId(null)
  }

  const sortedYears = [...years].sort((a, b) => b.start_date.localeCompare(a.start_date))
  const semesters = sortPeriods(periods.filter((p) => !p.parent_id))
  const sortedClasses = [...classes].sort((a, b) => a.grade - b.grade || a.letter.localeCompare(b.letter, 'uk'))

  return (
    <div className="page">
      <main className="main">
        <div className="sec-head page-head">
          <h1>Навчальний рік</h1>
          <span className="grow" />
          {year && (
            <div className="actions">
              <button className="btn ghost" onClick={() => setCreating(true)}>
                <Plus size={15} /> Новий рік
              </button>
            </div>
          )}
        </div>

        {creating && (
          <NewYearForm
            makeCurrent={years.length === 0}
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setSelectedId(id)
              setCreating(false)
            }}
          />
        )}

        {!loading && years.length === 0 && (
          <section className="empty" style={{ background: 'var(--butter)' }}>
            <div>
              <h2>Ще немає навчального року</h2>
              <p>Створи рік, і до нього одразу додадуться два семестри. Потім додай класи.</p>
            </div>
            <button className="btn" onClick={() => setCreating(true)}>
              <Plus size={15} /> Створити рік
            </button>
          </section>
        )}

        {year && (
          <>
            {sortedYears.length > 1 && (
              <div className="chips">
                {sortedYears.map((y) => (
                  <button
                    key={y.id}
                    className={y.id === year.id ? 'chip plain on' : 'chip plain'}
                    onClick={() => setSelectedId(y.id)}
                  >
                    {y.title}
                    {y.is_current && ' · поточний'}
                  </button>
                ))}
              </div>
            )}

            <section className="panel set">
              <SetRow label="Рік" onEdit={() => setEditing('year')} editLabel={<><Pencil size={14} /> Змінити</>}>
                <span className="set-big">{year.title}</span>
                <span className="pill">
                  {formatDate(year.start_date)} — {formatDate(year.end_date)}
                </span>
                {year.is_current && <span className="pill">Поточний</span>}
              </SetRow>

              <SetRow label="Семестри" onEdit={() => setEditing('periods')} editLabel={<><Pencil size={14} /> Змінити</>}>
                {semesters.length === 0 && <span className="muted">Періодів ще немає.</span>}
                {semesters.map((sem, i) => {
                  const quarters = sortPeriods(periods.filter((p) => p.parent_id === sem.id))
                  return (
                    <div key={sem.id} className="sem" style={{ background: SEMESTER_TONES[i % SEMESTER_TONES.length] }}>
                      <b>{sem.title}</b>
                      <span className="num">
                        {shortDate(sem.start_date)} — {shortDate(sem.end_date)}
                      </span>
                      {quarters.map((q) => (
                        <span key={q.id} className="pill num">
                          {q.title} · {shortDate(q.start_date)} — {shortDate(q.end_date)}
                        </span>
                      ))}
                    </div>
                  )
                })}
              </SetRow>

              <SetRow label="Класи" onEdit={() => setEditing('classes')} editLabel={<><Plus size={14} /> Додати клас</>}>
                {sortedClasses.length === 0 && <span className="muted">Додай класи, у яких викладаєш цього року.</span>}
                {sortedClasses.map((c) => (
                  <span key={c.id} className="chip">
                    <span className="sw" style={{ background: gradeColor(c.grade) }} />
                    {c.display_name}
                  </span>
                ))}
              </SetRow>
            </section>

            <ScheduleSettings year={year} />

            {editing === 'year' && (
              <Dialog
                title="Навчальний рік"
                onClose={() => setEditing(null)}
                footer={
                  <>
                    <button className="btn ghost danger left" onClick={() => removeYear(year)}>
                      <Trash2 size={15} /> Видалити рік
                    </button>
                    {!year.is_current && (
                      <button className="btn ghost" onClick={() => makeCurrent(year)}>
                        Зробити поточним
                      </button>
                    )}
                    <button className="btn" onClick={() => setEditing(null)}>
                      Готово
                    </button>
                  </>
                }
              >
                <RangeRow
                  titleLabel="Назва року"
                  value={year}
                  validate={(v) => validateYear(v, periods)}
                  onSave={(v) => (updateFields('academic_years', year.id, v), notifySaved())}
                />
              </Dialog>
            )}
            {editing === 'periods' && (
              <Dialog title="Семестри й чверті" onClose={() => setEditing(null)}>
                <PeriodsSection year={year} periods={periods} />
              </Dialog>
            )}
            {editing === 'classes' && (
              <Dialog title="Класи" onClose={() => setEditing(null)}>
                <ClassesSection year={year} classes={classes} />
              </Dialog>
            )}
          </>
        )}
      </main>
    </div>
  )
}
