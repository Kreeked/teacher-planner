const DOW = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД']
const monthTitle = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' })

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function MonthCalendar({ today }: { today: Date }) {
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  // Тиждень починається з понеділка.
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const title = monthTitle.format(today).replace(' р.', '')

  return (
    <div className="cal">
      <h3>{title[0].toUpperCase() + title.slice(1)}</h3>
      <div className="grid7 num">
        {DOW.map((d) => (
          <span key={d} className="dow">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const cls = ['d']
          if (d.getMonth() !== today.getMonth()) cls.push('out')
          else if (d.getDay() === 0 || d.getDay() === 6) cls.push('wk')
          if (sameDay(d, today)) cls.push('sel')
          return (
            <span key={d.toISOString()} className={cls.join(' ')}>
              {d.getDate()}
            </span>
          )
        })}
      </div>
    </div>
  )
}
