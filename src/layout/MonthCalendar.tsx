import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
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
const MORPH_MS = 480
const MORPH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

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

  /** Показує тиждень чи місяць дня: сусідній — тим самим рухом, що й листання, далекий — одразу. */
  function moveTo(date: ISODate) {
    const key = buildPane(date, weekMode).key
    if (key === current.key) return
    const dir = ([-1, 1] as const).find((n) => panes.find((p) => p.n === n)!.key === key)
    if (dir && !busy.current) settle(dir)
    else if (!busy.current) setAnchor(date)
  }

  function goToday() {
    moveTo(today)
    onToday?.()
  }

  // Вибір дня в іншому тижні чи місяці (стрілками над списком, днем сусіднього місяця) пересуває й календар.
  const synced = useRef(selected)
  useLayoutEffect(() => {
    if (selected === synced.current) return
    synced.current = selected
    if (selected) moveTo(selected)
  })

  const [morph, setMorph] = useState(false)
  const morphTimer = useRef(0)
  const track = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  /** Докочує доріжку до сусідньої сітки (dir ±1) чи повертає назад (0), потім змінює показаний тиждень. */
  function settle(dir: -1 | 0 | 1) {
    const el = track.current
    if (!el) return dir && shiftBy(dir)
    const ms = reduced() ? 0 : dir ? SETTLE_MS : SNAP_MS
    busy.current = true
    setLeaving(dir)
    // Web Animations замість CSS-переходу: однаково запускається в усіх браузерах, стартує з місця, де відпустили палець.
    // Лише пікселі: перехід між px і % у різних браузерах інтерполюється по-різному.
    const pane = el.offsetWidth / 3
    const from = new DOMMatrix(getComputedStyle(el).transform).m41
    const to = -pane * (1 + dir)
    el.style.transform = `translateX(${to}px)`
    const anim = el.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], {
      duration: ms,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
    let done = false
    const finish = () => {
      if (done) return
      done = true
      // Нова сітка стає поточною й одразу ж доріжка повертається до середини: між цими кроками кадру немає.
      flushSync(() => {
        if (dir) shiftBy(dir)
        setLeaving(0)
      })
      el.style.transform = ''
      anim.cancel()
      busy.current = false
    }
    anim.onfinish = finish
    // Запасний вихід, якщо вкладку приховано й подія не прийшла.
    window.setTimeout(finish, ms + 120)
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
    }
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = 0.8 * d.v + 0.2 * ((e.clientX - d.lastX) / dt)
    d.lastX = e.clientX
    d.lastT = e.timeStamp
    const w = el.offsetWidth / 3
    el.style.transform = `translateX(${-w + Math.max(-w, Math.min(w, dx))}px)`
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
  // Розгортання й згортання без перерахунку розкладки на кожному кадрі (FLIP): висота змінюється один раз,
  // а рух малюють transform (рядки, нижній вміст) і clip-path (картка та вікно сітки). Сторінка нижче —
  // окремі шари, тож не перемальовується.
  const flip = useRef<{ h: number; mt: number } | null>(null)
  const endMorph = useRef<(() => void) | null>(null)
  function toggleOpen() {
    endMorph.current?.()
    const vp = viewport.current
    const grid = vp?.querySelector<HTMLElement>('.cal-pane.now .grid7')
    if (vp && grid && !reduced()) {
      flip.current = { h: vp.getBoundingClientRect().height, mt: parseFloat(getComputedStyle(grid).marginTop) || 0 }
      setMorph(true)
    }
    if (open && selected) setAnchor(selected)
    setOpen(!open)
  }

  useLayoutEffect(() => {
    const f = flip.current
    const vp = viewport.current
    const card = vp?.closest<HTMLElement>('.cal')
    const grid = vp?.querySelector<HTMLElement>('.cal-pane.now .grid7')
    flip.current = null
    if (!f || !vp || !card || !grid) return
    const expand = open
    const h1 = vp.getBoundingClientRect().height
    const mt1 = parseFloat(getComputedStyle(grid).marginTop) || 0
    const dh = h1 - f.h
    if (Math.abs(dh) < 1) {
      setMorph(false)
      return
    }
    const radius = getComputedStyle(card).borderTopLeftRadius
    const opts: KeyframeAnimationOptions = { duration: MORPH_MS, easing: MORPH_EASE, fill: 'forwards' }
    const anims: Animation[] = []
    const inset = (bottom: number) => `inset(0 0 ${bottom}px 0 round ${radius})`
    const inner = (bottom: number) => `inset(0 0 ${bottom}px 0)`
    // Усе, що йде далі за календарем (кнопка в картці, дзвінки, уроки).
    const after: HTMLElement[] = []
    for (let node: HTMLElement | null = vp, depth = 0; node && depth < 6 && !node.matches('.tab-pane'); depth++) {
      for (let n = node.nextElementSibling; n; n = n.nextElementSibling) if (n instanceof HTMLElement) after.push(n)
      node = node.parentElement
    }
    after.forEach((n) => (n.style.willChange = 'transform'))
    if (expand) {
      // Розкладка вже кінцева: нижній вміст і рядки стартують зі старих місць.
      anims.push(card.animate([{ clipPath: inset(dh) }, { clipPath: inset(0) }], opts))
      anims.push(vp.animate([{ clipPath: inner(dh) }, { clipPath: inner(0) }], opts))
      anims.push(grid.animate([{ transform: `translateY(${f.mt - mt1}px)` }, { transform: 'none' }], opts))
      after.forEach((n) => anims.push(n.animate([{ transform: `translateY(${-dh}px)` }, { transform: 'none' }], opts)))
    } else {
      // Розкладка тримається старою до кінця руху, потім стає кінцевою в тому самому кадрі.
      vp.style.height = `${f.h}px`
      anims.push(card.animate([{ clipPath: inset(0) }, { clipPath: inset(-dh) }], opts))
      anims.push(vp.animate([{ clipPath: inner(0) }, { clipPath: inner(-dh) }], opts))
      anims.push(grid.animate([{ transform: `translateY(${f.mt - mt1}px)` }, { transform: 'none' }], opts))
      after.forEach((n) => anims.push(n.animate([{ transform: 'none' }, { transform: `translateY(${dh}px)` }], opts)))
    }
    let done = false
    const end = () => {
      if (done) return
      done = true
      vp.style.height = ''
      after.forEach((n) => (n.style.willChange = ''))
      anims.forEach((a) => a.cancel())
      setMorph(false)
      endMorph.current = null
    }
    endMorph.current = end
    anims[0].onfinish = end
    window.clearTimeout(morphTimer.current)
    morphTimer.current = window.setTimeout(end, MORPH_MS + 120)
  }, [open])

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
        ref={viewport}
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
