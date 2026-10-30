import { ask } from '../../lib/confirm'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RangeRow } from '../../components/RangeRow'
import { notifySaved } from '../../lib/saved'
import { commit, deleteRefs, newBatch, ref, refsWhere, updateFields, useCollection } from '../../data/db'
import type { AcademicYear } from '../../data/types'
import { pickCurrentYear, validateYear } from '../../data/year'
import { ClassesSection } from './ClassesSection'
import { NewYearForm } from './NewYearForm'
import { PeriodsSection } from './PeriodsSection'

export function YearPage() {
  const { items: years, loading } = useCollection('academic_years')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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
    setSelectedId(null)
  }

  const sortedYears = [...years].sort((a, b) => b.start_date.localeCompare(a.start_date))

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

            <section className="panel">
              <h3>Рік</h3>
              <RangeRow
                titleLabel="Назва року"
                value={year}
                validate={(v) => validateYear(v, periods)}
                onSave={(v) => (updateFields('academic_years', year.id, v), notifySaved())}
              />
              <div className="row-actions">
                {!year.is_current && (
                  <button className="btn ghost" onClick={() => makeCurrent(year)}>
                    Зробити поточним
                  </button>
                )}
                <button className="btn ghost danger" onClick={() => removeYear(year)}>
                  <Trash2 size={15} /> Видалити рік
                </button>
              </div>
            </section>

            <PeriodsSection year={year} periods={periods} />
            <ClassesSection year={year} classes={classes} />
          </>
        )}
      </main>
    </div>
  )
}
