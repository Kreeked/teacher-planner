import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { toISO } from '../data/schedule'
import type { ISODate } from '../data/types'

const DOW = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД']
const monthTitle = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' })

type Props = {
  today: ISODate
  selected: ISODate
  onSelect: (d: ISODate) => void
  // Дні, у які є уроки, — з крапкою.
  marked?: Set<ISODate>
}

function monthOf(d: ISODate) {
  return d.slice(0, 7)
}

export function MonthCalendar({ today, selected, onSelect, marked }: Props) {
  const [shown, setShown] = useState(monthOf(selected))
  // Вибір дня в іншому місяці (стрілками над списком) перемикає й календар.
  const [lastSelected, setLastSelected] = useState(selected)
  if (selected !== lastSelected) {
    setLastSelected(selected)
    setShown(monthOf(selected))
  }

  const [y, m] = shown.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  // Тиждень починається з понеділка.
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const title = monthTitle.format(first).replace(' р.', '')

  function shift(n: number) {
    setShown(toISO(new Date(y, m - 1 + n, 1)).slice(0, 7))
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <h3>{title[0].toUpperCase() + title.slice(1)}</h3>
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Попередній місяць">
          <ChevronLeft size={16} />
        </button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Наступний місяць">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid7 num">
        {DOW.map((d) => (
          <span key={d} className="dow">
            {d}
          </span>
        ))}
        {days.map((date) => {
          const d = toISO(date)
          const cls = ['d']
          if (monthOf(d) !== shown) cls.push('out')
          else if (date.getDay() === 0 || date.getDay() === 6) cls.push('wk')
          if (d === today) cls.push('today')
          if (d === selected) cls.push('sel')
          if (marked?.has(d)) cls.push('has')
          return (
            <button key={d} className={cls.join(' ')} onClick={() => onSelect(d)} aria-label={d} aria-pressed={d === selected}>
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
