import { Clock } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { placeBelowOrAbove, placeX } from '../lib/popPlace'

type Props = {
  // «08:30»
  value: string
  label: string
  // Повертає false, коли час не підходить (наприклад, ламає порядок уроків).
  onChange: (time: string) => boolean | void
  // Межі, поза якими час недоступний («HH:MM», включно).
  min?: string
  max?: string
  className?: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const POP_W = 168
const POP_H = 264

const two = (n: number) => String(n).padStart(2, '0')
const toMin = (t: string) => {
  const [hh, mm] = t.split(':').map(Number)
  return hh * 60 + mm
}

/** Поле часу з випадаючим вибором години й хвилини в стилі застосунку замість системного вікна. */
export function TimePicker({ value, label, onChange, min, max, className = 'date-btn field time-btn' }: Props) {
  const [open, setOpen] = useState(false)
  const [hour, setHour] = useState(0)
  const [pos, setPos] = useState<CSSProperties>({})
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [h, m] = value.split(':').map(Number)
  const lo = min ? toMin(min) : 0
  const hi = max ? toMin(max) : 24 * 60
  const outside = (minutes: number) => minutes < lo || minutes > hi

  // Список під полем, а якщо внизу мало місця — над ним; не виходить за край екрана й не накриває поле.
  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const { maxHeight, ...y } = placeBelowOrAbove(r, POP_H)
    setPos({
      ...y,
      ...(maxHeight !== undefined && { height: maxHeight }),
      left: placeX(r, POP_W),
    })
    // Вибрані година й хвилина одразу видно.
    pop.current?.querySelectorAll('.time-opt.sel').forEach((el) => el.scrollIntoView({ block: 'center' }))
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
      e.preventDefault()
      setOpen(false)
      button.current?.focus()
    }
    const scroll = (e: Event) => !pop.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    // Раніше за вікно, щоб Escape закривав лише список.
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])

  function pickMinute(min: number) {
    setOpen(false)
    const next = `${two(hour)}:${two(min)}`
    if (next !== value) onChange(next)
    button.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setHour(h)
          setOpen(!open)
        }}
      >
        <span>{value}</span>
        <Clock size={14} />
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="time-pop" role="dialog" aria-label={label} style={pos}>
            <div className="time-col" role="listbox" aria-label="Година">
              {HOURS.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="option"
                  aria-selected={x === hour}
                  disabled={x * 60 + 59 < lo || x * 60 > hi}
                  className={x === hour ? 'time-opt sel' : 'time-opt'}
                  onClick={() => setHour(x)}
                >
                  {two(x)}
                </button>
              ))}
            </div>
            <div className="time-col" role="listbox" aria-label="Хвилини">
              {MINUTES.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="option"
                  aria-selected={x === m && hour === h}
                  disabled={outside(hour * 60 + x)}
                  className={x === m && hour === h ? 'time-opt sel' : 'time-opt'}
                  onClick={() => pickMinute(x)}
                >
                  {two(x)}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
