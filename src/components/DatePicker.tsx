import { CalendarDays } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { placeBelowOrAbove, placeX } from '../lib/popPlace'
import { toISO } from '../data/schedule'
import type { ISODate } from '../data/types'
import { formatDate, shortDate } from '../data/year'
import { MonthCalendar } from '../layout/MonthCalendar'

const longDate = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })

function formatLong(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return longDate.format(new Date(y, m - 1, day)).replace(' р.', '')
}

type Props = {
  value: ISODate | null
  onChange: (d: ISODate | null) => void
  label: string
  min?: ISODate
  max?: ISODate
  // Коротко «дд.мм» — для клітинок таблиці.
  compact?: boolean
  // Числами «01.09.2026» і без значка календаря — для полів, що стоять поруч із текстовими.
  numeric?: boolean
  // Значок календаря після дати (разом із `numeric`).
  trailingIcon?: boolean
  placeholder?: string
  className?: string
  disabled?: boolean
}

const POP_W = 272
const POP_H = 330

/** Поле дати з календарем у стилі застосунку замість системного вікна браузера. */
export function DatePicker({ value, onChange, label, min, max, compact, numeric, trailingIcon, placeholder, className, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({})
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [today] = useState(() => toISO(new Date()))

  // Календар під полем (лівий край до лівого краю поля, а якщо не влазить — правий до правого), а якщо внизу мало місця — над ним; не виходить за край екрана й не накриває поле.
  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const y = placeBelowOrAbove(r, POP_H)
    setPos({
      ...y,
      ...(y.maxHeight !== undefined && { overflowY: 'auto' as const }),
      left: placeX(r, POP_W),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (pop.current?.contains(t) || button.current?.contains(t)) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const scroll = (e: Event) => !pop.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])

  function pick(d: ISODate | null) {
    setOpen(false)
    if (d !== value) onChange(d)
    button.current?.focus()
  }

  const text = value
    ? compact
      ? shortDate(value)
      : numeric
        ? formatDate(value)
        : formatLong(value)
    : (placeholder ?? (compact ? '—' : 'Обрати дату'))
  const todayAllowed = (!min || today >= min) && (!max || today <= max)

  return (
    <>
      <button
        ref={button}
        type="button"
        className={['date-btn', compact ? 'compact' : 'field', value ? '' : 'empty', className].filter(Boolean).join(' ')}
        aria-label={value ? `${label}: ${formatLong(value)}` : label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {!compact && !numeric && <CalendarDays size={14} />}
        <span>{text}</span>
        {trailingIcon && <CalendarDays size={16} aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="date-pop" role="dialog" aria-label={label} style={pos}>
            <MonthCalendar today={today} selected={value ?? ''} onSelect={pick} min={min} max={max} pickMonth />
            <div className="date-pop-foot">
              {todayAllowed && (
                <button type="button" className="link-btn" onClick={() => pick(today)}>
                  Сьогодні
                </button>
              )}
              <span className="grow" />
              {value && (
                <button type="button" className="link-btn" onClick={() => pick(null)}>
                  Очистити
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
