import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCollection } from '../../data/db'
import { pickCurrentYear } from '../../data/year'
import { TimetableSection } from './TimetableSection'

export function SchedulePage() {
  const { items: years, loading } = useCollection('academic_years')
  const year = pickCurrentYear(years)
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: bells } = useCollection('bell_schedules', filter)
  const { items: timetables } = useCollection('timetables', filter)
  const { items: courses } = useCollection('courses', filter)
  const { items: classes } = useCollection('class_groups', filter)
  const { items: entries } = useCollection('timetable_entries')
  const { items: links } = useCollection('course_classes')

  if (loading) return null

  return (
    <div className="page">
      <main className="main">
        <h1>Розклад {year && <span className="cnt">{year.title}</span>}</h1>
        {!year ? (
          <section className="empty" style={{ background: 'var(--peri)' }}>
            <div>
              <h2>Спершу навчальний рік</h2>
              <p>Розклад прив'язаний до навчального року, його класів і КТП.</p>
            </div>
            <Link to="/ktp/year" className="arrow" aria-label="Перейти до навчального року">
              <ArrowUpRight size={15} />
            </Link>
          </section>
        ) : (
          <>
            <TimetableSection
              year={year}
              bells={bells[0]}
              timetables={timetables}
              entries={entries}
              courses={courses}
              classes={classes}
              links={links.filter((l) => courses.some((c) => c.id === l.course_id))}
            />
          </>
        )}
      </main>
    </div>
  )
}
