import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { mondayOf } from '../data/day'
import { addDays, toISO } from '../data/schedule'
import type { ISODate } from '../data/types'
import { formatDayMonth } from '../lib/dates'
import { useNarrow } from '../lib/useNarrow'

const DOW = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД']
const monthTitle = new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric' })

type Props = {
  today: ISODate
  selected: ISODate
  onSelect: (d: ISODate) => void
  // Дні, у які є уроки, — з крапкою.
  marked?: Set<ISODate>
  // Межі вибору (наприклад, навчальний рік); дні поза ними неактивні.
  min?: ISODate
  max?: ISODate
  // На телефоні показує лише тиждень вибраного дня, а місяць розгортається кнопкою.
  collapsible?: boolean
}

function monthOf(d: ISODate) {
  return d.slice(0, 7)
}

function asDate(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function MonthCalendar({ today, selected, onSelect, marked, min, max, collapsible }: Props) {
  // День, чий місяць (або тиждень) зараз показано.
  const [anchor, setAnchor] = useState<ISODate>(selected || today)
  // Вибір дня в іншому місяці (стрілками над списком) перемикає й календар.
  const [lastSelected, setLastSelected] = useState(selected)
  if (selected !== lastSelected) {
    setLastSelected(selected)
    if (selected) setAnchor(selected)
  }
  const [open, setOpen] = useState(false)
  const narrow = useNarrow()
  const toggle = !!collapsible && narrow
  const weekMode = toggle && !open

  const shown = monthOf(anchor)
  const [y, m] = shown.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  // Тиждень починається з понеділка.
  const start = weekMode ? asDate(mondayOf(anchor)) : new Date(first)
  if (!weekMode) start.setDate(1 - ((first.getDay() + 6) % 7))
  const days = Array.from({ length: weekMode ? 7 : 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  let title: string
  if (weekMode) {
    const end = days[6]
    title =
      start.getMonth() === end.getMonth()
        ? `${start.getDate()} – ${formatDayMonth(end)}`
        : `${formatDayMonth(start)} – ${formatDayMonth(end)}`
  } else {
    title = monthTitle.format(first).replace(' р.', '')
    title = title[0].toUpperCase() + title.slice(1)
  }

  function shift(n: number) {
    setAnchor(weekMode ? addDays(anchor, 7 * n) : toISO(new Date(y, m - 1 + n, 1)))
  }
  const unit = weekMode ? 'тиждень' : 'місяць'

  return (
    <div className={toggle ? 'cal big' : 'cal'}>
      <div className="cal-head">
        <h3>{title}</h3>
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={`Попередній ${unit}`}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={`Наступний ${unit}`}>
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
          if (!weekMode && monthOf(d) !== shown) cls.push('out')
          else if (date.getDay() === 0 || date.getDay() === 6) cls.push('wk')
          if (d === today) cls.push('today')
          if (d === selected) cls.push('sel')
          if (marked?.has(d)) cls.push('has')
          const off = (min && d < min) || (max && d > max)
          return (
            <button
              key={d}
              type="button"
              className={cls.join(' ')}
              disabled={!!off}
              onClick={() => onSelect(d)}
              aria-label={d}
              aria-pressed={d === selected}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
      {toggle && (
        <button type="button" className="cal-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {open ? 'Згорнути до тижня' : 'Показати місяць'}
        </button>
      )}
    </div>
  )
}
