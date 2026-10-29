import { ask } from '../../lib/confirm'
import { Trash2 } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { notifySaved } from '../../lib/saved'
import { createDoc, deleteRefs, ref, refsWhere, removeDoc, updateFields, useCollection } from '../../data/db'
import { courseTitle } from '../../data/ktp'
import type { Course, CourseStatus, Lesson, Topic } from '../../data/types'
import { AutoDates } from './AutoDates'

const STATUSES: { value: CourseStatus; label: string }[] = [
  { value: 'draft', label: 'Чернетка' },
  { value: 'approved', label: 'Затверджено' },
  { value: 'archived', label: 'В архіві' },
]

type Props = { course: Course; topics: Topic[]; lessons: Lesson[]; onDeleted: () => void; onClose: () => void }

export function CourseSettings({ course, topics, lessons, onDeleted, onClose }: Props) {
  const { items: classes } = useCollection('class_groups', {
    field: 'academic_year_id',
    value: course.academic_year_id,
  })
  const { items: links } = useCollection('course_classes', { field: 'course_id', value: course.id })

  const gradeClasses = classes
    .filter((c) => c.grade === course.grade)
    .sort((a, b) => a.letter.localeCompare(b.letter, 'uk'))

  function save(patch: Partial<Course>) {
    updateFields('courses', course.id, patch)
    notifySaved()
  }

  function toggleClass(classId: string) {
    const link = links.find((l) => l.class_group_id === classId)
    if (link) removeDoc('course_classes', link.id)
    else
      createDoc('course_classes', {
        course_id: course.id,
        class_group_id: classId,
        weekdays: [],
        position: links.length,
      })
  }

  function number(field: 'hours_per_week' | 'total_hours', raw: string) {
    const n = Number(raw.replace(',', '.'))
    if (n > 0 && n !== course[field]) save({ [field]: field === 'total_hours' ? Math.round(n) : n })
  }

  async function remove() {
    if (
      !(await ask(
        `Видалити КТП «${course.subject}, ${course.grade} клас» з усіма темами, уроками (${lessons.length}) і матеріалами?`,
      ))
    )
      return
    deleteRefs([
      ref('courses', course.id),
      ...links.map((l) => ref('course_classes', l.id)),
      ...topics.map((t) => ref('topics', t.id)),
      ...lessons.map((l) => ref('lessons', l.id)),
      ...(await refsWhere('lesson_schedules', 'course_id', course.id)),
      ...(await refsWhere('lesson_materials', 'course_id', course.id)),
    ])
    onDeleted()
  }

  return (
    <Dialog title="Параметри КТП" subtitle={courseTitle(course)} onClose={onClose} className="settings-dialog">
      <section className="form dialog-sec">
        <span className="sec-label">Основне</span>
        <div className="form-grid two">
          <label>
            Предмет
            <input
              className="field"
              defaultValue={course.subject}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== course.subject) save({ subject: v })
              }}
            />
          </label>
          <label>
            Статус
            <select
              className="field"
              value={course.status}
              onChange={(e) => save({ status: e.target.value as CourseStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Годин на тиждень
            <input
              className="field"
              inputMode="decimal"
              defaultValue={course.hours_per_week}
              onBlur={(e) => number('hours_per_week', e.target.value)}
            />
          </label>
          <label>
            Годин за рік
            <input
              className="field"
              inputMode="numeric"
              defaultValue={course.total_hours}
              onBlur={(e) => number('total_hours', e.target.value)}
            />
          </label>
        </div>
        <label>
          Навчальна програма
          <input
            className="field"
            defaultValue={course.program_ref}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== course.program_ref) save({ program_ref: v })
            }}
          />
        </label>
      </section>

      <section className="form dialog-sec">
        <span className="sec-label">Класи і дні уроків</span>
        <div className="chips">
          {gradeClasses.map((c) => {
            const on = links.some((l) => l.class_group_id === c.id)
            return (
              <button
                key={c.id}
                type="button"
                className={on ? 'chip plain on' : 'chip plain'}
                aria-pressed={on}
                onClick={() => toggleClass(c.id)}
              >
                {c.display_name}
              </button>
            )
          })}
        </div>
        <AutoDates course={course} topics={topics} lessons={lessons} links={links} classes={classes} />
      </section>

      <section className="dialog-sec danger-zone">
        <button type="button" className="btn ghost danger" onClick={remove}>
          <Trash2 size={15} /> Видалити КТП
        </button>
      </section>
    </Dialog>
  )
}
