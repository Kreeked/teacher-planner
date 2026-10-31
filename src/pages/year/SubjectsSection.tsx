import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { commit, createDoc, deleteRefs, newBatch, ref, refsWhere, removeDoc, updateFields } from '../../data/db'
import { courseTitle, yearHours } from '../../data/ktp'
import type { ClassGroup, Course, CourseClass } from '../../data/types'
import type { AcademicYear } from '../../data/types'
import { gradeColor } from '../../data/year'
import { ask } from '../../lib/confirm'
import { notifySaved } from '../../lib/saved'

const parse = (v: string) => Number(v.replace(',', '.'))

type Props = { year: AcademicYear; courses: Course[]; classes: ClassGroup[]; links: CourseClass[] }

/**
 * Предмети року: що викладаю, в яких паралелях і класах, скільки годин. Кожен предмет — це КТП,
 * спершу порожнє: теми й уроки додаються на сторінці КТП (вручну чи імпортом з Word).
 */
export function SubjectsSection({ year, courses, classes, links }: Props) {
  const grades = [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b)
  const [subject, setSubject] = useState('Інформатика')
  const [grade, setGrade] = useState<number | null>(null)
  const [hours, setHours] = useState('1')

  const chosenGrade = grade ?? grades[0]
  const hoursNum = parse(hours)
  const taken = courses.some(
    (c) => c.grade === chosenGrade && c.subject.trim().toLowerCase() === subject.trim().toLowerCase(),
  )
  const valid = !!subject.trim() && chosenGrade !== undefined && hoursNum > 0 && !taken

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const batch = newBatch()
    const id = createDoc(
      'courses',
      {
        academic_year_id: year.id,
        subject: subject.trim(),
        grade: chosenGrade,
        hours_per_week: hoursNum,
        total_hours: yearHours(hoursNum, hoursNum),
        program_ref: '',
        status: 'draft',
      },
      batch,
    )
    // Нове КТП одразу бере всі класи паралелі; зайві знімаються галочками в рядку предмета.
    classes
      .filter((c) => c.grade === chosenGrade)
      .sort((a, b) => a.letter.localeCompare(b.letter, 'uk'))
      .forEach((c, i) => createDoc('course_classes', { course_id: id, class_group_id: c.id, position: i }, batch))
    commit(batch)
  }

  const sorted = [...courses].sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, 'uk'))

  return (
    <>
      {classes.length === 0 && <p className="warn">Спершу додай класи: предмет створюється для паралелі.</p>}
      {sorted.length === 0 && classes.length > 0 && (
        <p className="muted">Додай предмети, які викладаєш цього року: для кожного одразу з’явиться порожнє КТП.</p>
      )}
      <div className="yp-subjects">
        {sorted.map((c) => (
          <SubjectRow key={c.id} course={c} classes={classes} links={links.filter((l) => l.course_id === c.id)} />
        ))}
      </div>
      {classes.length > 0 && (
        <form className="yp-add-class" onSubmit={add}>
          <input
            className="field"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Предмет"
            placeholder="Предмет"
          />
          <select
            className="field"
            value={chosenGrade}
            onChange={(e) => setGrade(Number(e.target.value))}
            aria-label="Паралель"
          >
            {grades.map((g) => (
              <option key={g} value={g}>
                {g} клас
              </option>
            ))}
          </select>
          <input
            className="field yp-hours"
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-label="Годин на тиждень"
            title="Годин на тиждень"
          />
          <button className="btn ghost" disabled={!valid}>
            <Plus size={16} /> Додати
          </button>
          {taken && <p className="field-error">Такий предмет для цієї паралелі вже є.</p>}
        </form>
      )}
    </>
  )
}

function SubjectRow({ course, classes, links }: { course: Course; classes: ClassGroup[]; links: CourseClass[] }) {
  const gradeClasses = classes
    .filter((c) => c.grade === course.grade)
    .sort((a, b) => a.letter.localeCompare(b.letter, 'uk'))
  const second = course.hours_per_week_2 ?? course.hours_per_week

  function save(patch: Partial<Course>) {
    updateFields('courses', course.id, patch)
    notifySaved()
  }

  function hoursField(field: 'hours_per_week' | 'hours_per_week_2' | 'total_hours', raw: string) {
    const n = parse(raw)
    const current = field === 'hours_per_week_2' ? second : course[field]
    if (!(n > 0) || n === current) return
    if (field === 'total_hours') return save({ total_hours: Math.round(n) })
    // Змінилися години на тиждень — годин за рік перераховуємо.
    const h1 = field === 'hours_per_week' ? n : course.hours_per_week
    const h2 = field === 'hours_per_week_2' ? n : second
    save({ [field]: n, total_hours: yearHours(h1, h2) })
  }

  function toggleClass(classId: string) {
    const link = links.find((l) => l.class_group_id === classId)
    if (link) removeDoc('course_classes', link.id)
    else createDoc('course_classes', { course_id: course.id, class_group_id: classId, position: links.length })
  }

  async function remove() {
    if (
      !(await ask(
        `Видалити предмет «${courseTitle(course)}» разом із КТП: темами, уроками, датами, матеріалами і клітинками розкладу? Це незворотно.`,
        { word: 'видалити' },
      ))
    )
      return
    const refs = [ref('courses', course.id)]
    for (const name of ['course_classes', 'topics', 'lessons', 'lesson_schedules', 'lesson_materials', 'timetable_entries'] as const)
      refs.push(...(await refsWhere(name, 'course_id', course.id)))
    deleteRefs(refs)
  }

  return (
    <div className="yp-subject">
      <div className="yp-subject-head">
        <span className="sw" style={{ background: gradeColor(course.grade) }} />
        <input
          className="field yp-subject-name"
          aria-label="Предмет"
          defaultValue={course.subject}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== course.subject) save({ subject: v })
            else e.target.value = course.subject
          }}
        />
        <span className="yp-subject-grade">{course.grade} клас</span>
        <button type="button" className="icon-btn del" onClick={remove} aria-label="Видалити предмет" title="Видалити предмет">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="yp-subject-hours">
        <label>
          І семестр
          <input
            className="field"
            inputMode="decimal"
            defaultValue={course.hours_per_week}
            onBlur={(e) => hoursField('hours_per_week', e.target.value)}
          />
        </label>
        <label>
          ІІ семестр
          <input
            key={second}
            className="field"
            inputMode="decimal"
            defaultValue={second}
            onBlur={(e) => hoursField('hours_per_week_2', e.target.value)}
          />
        </label>
        <label>
          Годин за рік
          <input
            key={course.total_hours}
            className="field"
            inputMode="numeric"
            defaultValue={course.total_hours}
            onBlur={(e) => hoursField('total_hours', e.target.value)}
          />
        </label>
      </div>
      <div className="chips" role="group" aria-label="Класи">
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
    </div>
  )
}
