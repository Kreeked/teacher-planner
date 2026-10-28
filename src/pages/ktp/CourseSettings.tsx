import { Trash2 } from 'lucide-react'
import { createDoc, deleteRefs, ref, refsWhere, removeDoc, updateFields, useCollection } from '../../data/db'
import type { Course, CourseStatus, Lesson, Topic } from '../../data/types'
import { AutoDates } from './AutoDates'

const STATUSES: { value: CourseStatus; label: string }[] = [
  { value: 'draft', label: 'Чернетка' },
  { value: 'approved', label: 'Затверджено' },
  { value: 'archived', label: 'В архіві' },
]

type Props = { course: Course; topics: Topic[]; lessons: Lesson[]; onDeleted: () => void }

export function CourseSettings({ course, topics, lessons, onDeleted }: Props) {
  const { items: classes } = useCollection('class_groups', { field: 'academic_year_id', value: course.academic_year_id })
  const { items: links } = useCollection('course_classes', { field: 'course_id', value: course.id })

  const gradeClasses = classes
    .filter((c) => c.grade === course.grade)
    .sort((a, b) => a.letter.localeCompare(b.letter, 'uk'))

  function toggleClass(classId: string) {
    const link = links.find((l) => l.class_group_id === classId)
    if (link) removeDoc('course_classes', link.id)
    else createDoc('course_classes', { course_id: course.id, class_group_id: classId, weekdays: [], position: links.length })
  }

  function number(field: 'hours_per_week' | 'total_hours', raw: string) {
    const n = Number(raw.replace(',', '.'))
    if (n > 0 && n !== course[field]) updateFields('courses', course.id, { [field]: field === 'total_hours' ? Math.round(n) : n })
  }

  async function remove() {
    if (!confirm(`Видалити КТП «${course.subject}, ${course.grade} клас» з усіма темами й уроками (${lessons.length})?`))
      return
    deleteRefs([
      ref('courses', course.id),
      ...links.map((l) => ref('course_classes', l.id)),
      ...topics.map((t) => ref('topics', t.id)),
      ...lessons.map((l) => ref('lessons', l.id)),
      ...(await refsWhere('lesson_schedules', 'course_id', course.id)),
    ])
    onDeleted()
  }

  return (
    <section className="panel form">
      <div className="form-row">
        <label className="grow">
          Предмет
          <input
            className="field"
            defaultValue={course.subject}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== course.subject) updateFields('courses', course.id, { subject: v })
            }}
          />
        </label>
        <label>
          Годин на тиждень
          <input className="field" inputMode="decimal" defaultValue={course.hours_per_week} onBlur={(e) => number('hours_per_week', e.target.value)} />
        </label>
        <label>
          Годин за рік
          <input className="field" inputMode="numeric" defaultValue={course.total_hours} onBlur={(e) => number('total_hours', e.target.value)} />
        </label>
      </div>
      <div className="form-row">
        <label className="grow">
          Навчальна програма
          <input
            className="field"
            defaultValue={course.program_ref}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== course.program_ref) updateFields('courses', course.id, { program_ref: v })
            }}
          />
        </label>
        <label>
          Статус
          <select
            className="field"
            value={course.status}
            onChange={(e) => updateFields('courses', course.id, { status: e.target.value as CourseStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <span className="form-label">Класи, що йдуть за цим КТП</span>
        <div className="chips">
          {gradeClasses.map((c) => {
            const on = links.some((l) => l.class_group_id === c.id)
            return (
              <button key={c.id} type="button" className={on ? 'chip plain on' : 'chip plain'} aria-pressed={on} onClick={() => toggleClass(c.id)}>
                {c.display_name}
              </button>
            )
          })}
        </div>
      </div>
      <AutoDates course={course} topics={topics} lessons={lessons} links={links} classes={classes} />
      <div className="row-actions">
        <button type="button" className="btn ghost danger" onClick={remove}>
          <Trash2 size={15} /> Видалити КТП
        </button>
      </div>
    </section>
  )
}
