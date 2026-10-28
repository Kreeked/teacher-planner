import { ArrowUpRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection } from '../../data/db'
import { courseTitle, lessonsWord } from '../../data/ktp'
import type { ClassGroup, Course } from '../../data/types'
import { formatDate, gradeColor, pickCurrentYear } from '../../data/year'
import { NewCourseForm } from './NewCourseForm'

export function KtpPage() {
  const navigate = useNavigate()
  const { items: years, loading } = useCollection('academic_years')
  const year = pickCurrentYear(years)
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: periods } = useCollection('periods', filter)
  const { items: classes } = useCollection('class_groups', filter)
  const { items: courses } = useCollection('courses', filter)
  const [creating, setCreating] = useState(false)

  const sorted = [...courses].sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, 'uk'))

  return (
    <div className="page">
      <main className="main">
        <h1>КТП</h1>

        {!loading && (
          <Link to="/ktp/year" className="stat" style={{ background: 'var(--surface)' }}>
            <span className="lab">Навчальний рік</span>
            {year ? (
              <>
                <span className="big">{year.title}</span>
                <span className="sub">
                  {formatDate(year.start_date)} — {formatDate(year.end_date)} · періодів: {periods.length} · класів:{' '}
                  {classes.length}
                </span>
              </>
            ) : (
              <span className="sub">Ще не налаштовано. Почни з нього: семестри, чверті й класи.</span>
            )}
            <span className="arrow">
              <ArrowUpRight size={15} />
            </span>
          </Link>
        )}

        {year && (
          <>
            <div className="sec-head">
              <h2>Мої КТП</h2>
              <span className="grow" />
              {!creating && (
                <button className="chip plain on" onClick={() => setCreating(true)}>
                  <Plus size={14} /> Нове КТП
                </button>
              )}
            </div>

            {creating && (
              <NewCourseForm
                year={year}
                classes={classes}
                onDone={(id) => {
                  setCreating(false)
                  if (id) navigate(`/ktp/${id}`)
                }}
              />
            )}

            {sorted.length === 0 && !creating && (
              <section className="empty" style={{ background: 'var(--butter)' }}>
                <div>
                  <h2>Ще немає жодного КТП</h2>
                  <p>Створи КТП для паралелі, наприклад «Інформатика, 9 клас», і додай до нього теми й уроки.</p>
                </div>
              </section>
            )}

            <div className="course-grid">
              {sorted.map((c) => (
                <CourseCard key={c.id} course={c} classes={classes} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function CourseCard({ course, classes }: { course: Course; classes: ClassGroup[] }) {
  const { items: links } = useCollection('course_classes', { field: 'course_id', value: course.id })
  const { items: lessons } = useCollection('lessons', { field: 'course_id', value: course.id })
  const names = [...links]
    .sort((a, b) => a.position - b.position)
    .map((l) => classes.find((c) => c.id === l.class_group_id)?.display_name)
    .filter(Boolean)

  return (
    <Link to={`/ktp/${course.id}`} className="stat" style={{ background: gradeColor(course.grade) }}>
      <span className="lab">{courseTitle(course)}</span>
      <span className="big num">{lessons.length}</span>
      <span className="sub">
        {lessonsWord(lessons.length)} з {course.total_hours} год · {names.join(', ') || 'класи не вибрано'}
      </span>
      <span className="arrow">
        <ArrowUpRight size={15} />
      </span>
    </Link>
  )
}
