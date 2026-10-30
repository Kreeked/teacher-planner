import { ask } from '../../lib/confirm'
import { Trash2 } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { notifySaved } from '../../lib/saved'
import { createDoc, deleteRefs, ref, refsWhere, removeDoc, updateFields, useCollection } from '../../data/db'
import { courseTitle } from '../../data/ktp'
import type { Course, Lesson, Topic } from '../../data/types'

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
  const second = course.hours_per_week_2 ?? course.hours_per_week

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
        position: links.length,
      })
  }

  function number(field: 'hours_per_week' | 'hours_per_week_2' | 'total_hours', raw: string) {
    const n = Number(raw.replace(',', '.'))
    const current = field === 'hours_per_week_2' ? second : course[field]
    if (n > 0 && n !== current) save({ [field]: field === 'total_hours' ? Math.round(n) : n })
  }

  async function remove() {
    if (
      !(await ask(
        `Видалити КТП «${course.subject}, ${course.grade} клас» з усіма темами, уроками (${lessons.length}) і матеріалами? Це незворотно.`,
        { word: 'видалити' },
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
      </section>

      <section className="form dialog-sec">
        <span className="sec-label">Годин на тиждень</span>
        <div className="form-grid three">
          <label>
            І семестр
            <input
              className="field"
              inputMode="decimal"
              defaultValue={course.hours_per_week}
              onBlur={(e) => number('hours_per_week', e.target.value)}
            />
          </label>
          <label>
            ІІ семестр
            <input
              key={second}
              className="field"
              inputMode="decimal"
              defaultValue={second}
              onBlur={(e) => number('hours_per_week_2', e.target.value)}
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
      </section>

      <section className="form dialog-sec">
        <span className="sec-label">Класи</span>
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
      </section>

      <section className="dialog-sec danger-zone">
        <button type="button" className="btn ghost danger" onClick={remove}>
          <Trash2 size={16} /> Видалити КТП
        </button>
      </section>
    </Dialog>
  )
}
