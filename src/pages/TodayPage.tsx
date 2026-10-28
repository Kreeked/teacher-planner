import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { MonthCalendar } from '../layout/MonthCalendar'
import { firstName, formatDayMonth, formatWeekday, greeting } from '../lib/dates'

export function TodayPage() {
  const { user } = useAuth()
  const [now] = useState(() => new Date())
  const name = firstName(user?.displayName)

  return (
    <div className="page with-rail">
      <main className="main">
        <div>
          <p className="hello">
            {greeting(now)}
            {name && `, ${name}`}
          </p>
          <h1>
            Сьогодні, {formatWeekday(now)} <span className="cnt">{formatDayMonth(now)}</span>
          </h1>
        </div>

        <section className="empty" style={{ background: 'var(--mint)' }}>
          <div>
            <h2>Уроків поки немає</h2>
            <p>
              Тут з'являться уроки на день, щойно ти заповниш КТП і розклад. Почнемо з календарно-тематичного
              планування.
            </p>
          </div>
          <Link to="/ktp" className="arrow" aria-label="Перейти до КТП">
            <ArrowUpRight size={15} />
          </Link>
        </section>
      </main>

      <aside className="rail">
        <MonthCalendar today={now} />
      </aside>
    </div>
  )
}
