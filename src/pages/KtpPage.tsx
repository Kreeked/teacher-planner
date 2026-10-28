import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCollection } from '../data/db'
import { formatDate, pickCurrentYear } from '../data/year'

export function KtpPage() {
  const { items: years, loading } = useCollection('academic_years')
  const year = pickCurrentYear(years)
  const filter = year ? { field: 'academic_year_id', value: year.id } : null
  const { items: periods } = useCollection('periods', filter)
  const { items: classes } = useCollection('class_groups', filter)

  return (
    <div className="page">
      <main className="main">
        <h1>КТП</h1>

        {!loading && (
          <Link to="/ktp/year" className="stat" style={{ background: 'var(--lilac)' }}>
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

        <section className="empty" style={{ background: 'var(--butter)' }}>
          <div>
            <h2>Курси КТП</h2>
            <p>Таблиця планування (теми, уроки, ДЗ) з'явиться на наступному кроці.</p>
          </div>
        </section>
      </main>
    </div>
  )
}
