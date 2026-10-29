import { ArrowUpRight, FileUp, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCollection } from '../../data/db'
import { countedLessons, courseTitle, lessonsWord } from '../../data/ktp'
import type { ClassGroup, Course } from '../../data/types'
import { formatDate, gradeColor, pickCurrentYear } from '../../data/year'
import { ImportDialog } from './ImportDialog'
import { NewCourseForm } from './NewCourseForm'

export function KtpPage() {
  const navigate = useNavigate()
  const { items: years, loading } = useCollection('academic_years')
  const year = pickCurrentYear(years)
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: classes } = useCollection('class_groups', filter)
  const { items: courses } = useCollection('courses', filter)
  const [creating, setCreating] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const sorted = [...courses].sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, 'uk'))

  return (
    <div className="page">
      <main className="main">
        <div className="sec-head page-head">
          <h1>КТП</h1>
          {year && (
            <Link
              to="/ktp/year"
              className="btn ghost small year-link"
              title={`${formatDate(year.start_date)} — ${formatDate(year.end_date)} · класів: ${classes.length}`}
            >
              {year.title} <ArrowUpRight size={14} />
            </Link>
          )}
          <span className="grow" />
          {year && (
            <div className="actions">
              <button className="btn ghost" onClick={() => fileInput.current?.click()}>
                <FileUp size={15} /> Імпорт з Word
              </button>
              <button className="btn" onClick={() => setCreating(true)}>
                <Plus size={15} /> Нове КТП
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hidden
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
            </div>
          )}
        </div>

        {!loading && !year && (
          <Link to="/ktp/year" className="stat" style={{ background: 'var(--surface)' }}>
            <span className="lab">Навчальний рік</span>
            <span className="sub">Ще не налаштовано. Почни з нього: семестри, чверті й класи.</span>
            <span className="arrow">
              <ArrowUpRight size={15} />
            </span>
          </Link>
        )}

        {year && (
          <>
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

            {sorted.length === 0 && (
              <section className="empty" style={{ background: 'var(--butter)' }}>
                <div>
                  <h2>Ще немає жодного КТП</h2>
                  <p>Створи КТП для паралелі, наприклад «Інформатика, 9 клас», і додай до нього теми й уроки.</p>
                </div>
              </section>
            )}

            {importFile && (
              <ImportDialog
                file={importFile}
                year={year}
                courses={courses}
                classes={classes}
                onClose={() => setImportFile(null)}
                onDone={(id) => {
                  setImportFile(null)
                  navigate(`/ktp/${id}`)
                }}
              />
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
  const count = countedLessons(lessons)
  const names = [...links]
    .sort((a, b) => a.position - b.position)
    .map((l) => classes.find((c) => c.id === l.class_group_id)?.display_name)
    .filter(Boolean)

  return (
    <Link to={`/ktp/${course.id}`} className="stat course-card" style={{ background: gradeColor(course.grade) }}>
      <span className="lab">{courseTitle(course)}</span>
      <span className="big num">
        {count} <small>/ {course.total_hours} год</small>
      </span>
      <span className="meter" aria-label={`${count} ${lessonsWord(count)} з ${course.total_hours} год`}>
        <i style={{ width: `${Math.min(100, (count / (course.total_hours || 1)) * 100)}%` }} />
      </span>
      <span className="card-classes">
        {names.length ? (
          names.map((n) => (
            <span key={n} className="badge">
              {n}
            </span>
          ))
        ) : (
          <span className="sub">класи не вибрано</span>
        )}
      </span>
      <span className="arrow">
        <ArrowUpRight size={15} />
      </span>
    </Link>
  )
}
