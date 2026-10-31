import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { mondayOf } from '../data/day'
import { addDays, toISO } from '../data/schedule'
import type { ISODate } from '../data/types'
import { useNarrow } from '../lib/useNarrow'

const DOW = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД']
const monthTitle = new Intl.DateTimeFormat('uk-UA', {
  month: 'long',
  year: 'numeric',
})

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
  // Якщо задано — у шапці з'являється кнопка «Сьогодні».
  onToday?: () => void
}

function monthOf(d: ISODate) {
  return d.slice(0, 7)
}

function asDate(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

// Тривалість перемикання тижня чи місяця (мс) і розгортання; з reduced-motion — без руху.
const SETTLE_MS = 420
const SNAP_MS = 300

function reduced() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type Pane = { key: string; month: string; days: Date[]; row: number }

/** Сітка 6 × 7 місяця, до якого належить `anchor`, і номер рядка з тижнем цього дня. */
function buildPane(anchor: ISODate, weekMode: boolean): Pane {
  const month = monthOf(anchor)
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  // Тиждень починається з понеділка.
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const monday = mondayOf(anchor)
  const row = Math.max(0, Math.floor(days.findIndex((d) => toISO(d) === monday) / 7))
  return { key: weekMode ? monday : month, month, days, row }
}

export function MonthCalendar({ today, selected, onSelect, marked, min, max, collapsible, onToday }: Props) {
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

  // Сусідній тиждень чи місяць відносно показаного.
  function neighbour(n: number): ISODate {
    if (weekMode) return addDays(anchor, 7 * n)
    const [y, m] = monthOf(anchor).split('-').map(Number)
    return toISO(new Date(y, m - 1 + n, 1))
  }
  // Поруч із поточною сіткою стоять сусідні, щоб листання йшло за пальцем (і мишею, і стрілками).
  const panes = [-1, 0, 1].map((n) => ({
    n,
    ...buildPane(n ? neighbour(n) : anchor, weekMode),
  }))
  // Поки сітка їде до сусідньої, назва й кнопка «Сьогодні» вже показують її, а не чекають кінця руху.
  const [leaving, setLeaving] = useState<-1 | 0 | 1>(0)
  const current = panes.find((p) => p.n === leaving)!

  // Заголовок завжди «Місяць рік» — однакової довжини, шапка не стрибає при листанні тижнів.
  const [y, m] = current.month.split('-').map(Number)
  let title = monthTitle
    .format(weekMode ? asDate(addDays(mondayOf(neighbour(leaving)), 3)) : new Date(y, m - 1, 1))
    .replace(' р.', '')
  title = title[0].toUpperCase() + title.slice(1)
  const unit = weekMode ? 'тиждень' : 'місяць'

  function shiftBy(n: number) {
    setAnchor(neighbour(n))
  }

  function goToday() {
    setAnchor(today)
    onToday?.()
  }

  const [morph, setMorph] = useState(false)
  const morphTimer = useRef(0)
  const track = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  /** Докочує доріжку до сусідньої сітки (dir ±1) чи повертає назад (0), потім змінює показаний тиждень. */
  function settle(dir: -1 | 0 | 1) {
    const el = track.current
    if (!el) return dir && shiftBy(dir)
    const ms = reduced() ? 0 : dir ? SETTLE_MS : SNAP_MS
    busy.current = true
    setLeaving(dir)
    el.style.transition = `transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)`
    el.style.transform = `translateX(${-100 / 3 - (dir * 100) / 3}%)`
    let done = false
    const finish = () => {
      if (done) return
      done = true
      flushSync(() => {
        if (dir) shiftBy(dir)
        setLeaving(0)
      })
      el.style.transition = 'none'
      el.style.transform = ''
      busy.current = false
    }
    el.addEventListener('transitionend', finish, { once: true })
    window.setTimeout(finish, ms + 80)
  }

  function go(n: -1 | 1) {
    if (busy.current) return
    settle(n)
  }

  // Горизонтальне перетягування сітки гортає тиждень або місяць за пальцем.
  const drag = useRef<{
    x: number
    y: number
    id: number
    on: boolean
    moved: boolean
    lastX: number
    lastT: number
    v: number
  } | null>(null)
  function dragStart(e: PointerEvent) {
    if (busy.current) return
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      on: false,
      moved: false,
      lastX: e.clientX,
      lastT: e.timeStamp,
      v: 0,
    }
  }
  function dragMove(e: PointerEvent) {
    const d = drag.current
    const el = track.current
    if (!d || !el) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.on) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null
        return
      }
      if (Math.abs(dx) < 8 || Math.abs(dx) < 1.5 * Math.abs(dy)) return
      d.on = d.moved = true
      e.currentTarget.setPointerCapture(e.pointerId)
      el.style.transition = 'none'
    }
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = 0.8 * d.v + 0.2 * ((e.clientX - d.lastX) / dt)
    d.lastX = e.clientX
    d.lastT = e.timeStamp
    el.style.transform = `translateX(calc(${-100 / 3}% + ${dx}px))`
  }
  function dragEnd(e: PointerEvent) {
    const d = drag.current
    if (!d?.on) return
    d.on = false
    const dx = e.clientX - d.x
    const width = e.currentTarget.clientWidth
    // Дальній свайп чи швидкий порух — на сусідню сітку, інакше повернення на місце.
    const fling = Math.abs(d.v) > 0.4 && Math.sign(d.v) === Math.sign(dx)
    settle(fling || Math.abs(dx) > width * 0.25 ? (dx < 0 ? 1 : -1) : 0)
  }
  // Після перетягування браузер ще надсилає click на день під пальцем — гасимо його.
  function dragClick(e: MouseEvent) {
    if (drag.current?.moved) {
      e.stopPropagation()
      e.preventDefault()
    }
    drag.current = null
  }
  // Згортання повертає тиждень до вибраного дня.
  function toggleOpen() {
    if (open && selected) setAnchor(selected)
    setOpen(!open)
    // Плавність висоти й рядка — лише під час згортання чи розгортання, не при листанні.
    setMorph(true)
    window.clearTimeout(morphTimer.current)
    morphTimer.current = window.setTimeout(() => setMorph(false), 600)
  }

  const expanded = !toggle || open
  return (
    <div className={`${toggle ? 'cal big' : 'cal'}${expanded ? ' open' : ''}${morph ? ' morph' : ''}`}>
      <div className="cal-head">
        <h3 key={title} className="cal-title">
          {title}
        </h3>
        {onToday &&
          !(
            selected === today &&
            (weekMode ? current.days.slice(current.row * 7, current.row * 7 + 7) : current.days).some(
              (date) => toISO(date) === today,
            )
          ) && (
            <button type="button" className="btn ghost small cal-today" onClick={goToday}>
              Сьогодні
            </button>
          )}
        <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label={`Попередній ${unit}`}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => go(1)} aria-label={`Наступний ${unit}`}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid7 dow-row">
        {DOW.map((d) => (
          <span key={d} className="dow">
            {d}
          </span>
        ))}
      </div>
      <div
        className="cal-viewport"
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onPointerUp={dragEnd}
        onPointerCancel={dragEnd}
        onClickCapture={dragClick}
      >
        <div ref={track} className="cal-track">
          {panes.map((p) => (
            <div key={p.n} className={p.n ? 'cal-pane' : 'cal-pane now'} inert={p.n !== 0}>
              <div key={p.month} className="grid7 num" style={{ '--row': p.row } as CSSProperties}>
                {p.days.map((date) => {
                  const d = toISO(date)
                  const cls = ['d']
                  if (expanded && monthOf(d) !== p.month) cls.push('out')
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
            </div>
          ))}
        </div>
      </div>
      {toggle && (
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={toggleOpen}>
          <ChevronDown size={16} className="fold-chev" />
          {open ? 'Згорнути до тижня' : 'Показати місяць'}
        </button>
      )}
    </div>
  )
}
