import { Check, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeBelowOrAbove, placeX } from '../lib/popPlace'

export type MenuItem = {
  label: string
  // Іконка або кольоровий кружечок (swatch) ліворуч від назви.
  icon?: LucideIcon
  swatch?: string
  // Вибір одного з варіантів: позначений пункт отримує галочку.
  checked?: boolean
  onSelect: () => void
  // Дрібний текст праворуч, наприклад кількість файлів.
  hint?: string
  danger?: boolean
  // Пункт видно, але вибрати його не можна.
  disabled?: boolean
}

// Групи пунктів розділяються лінією. trigger — власний вміст кнопки (наприклад, «Додати») замість «⋯».
type Props = {
  label: string
  groups: MenuItem[][]
  trigger?: ReactNode
  triggerClass?: string
  triggerStyle?: CSSProperties
  // З якого краю кнопки відкривається меню: «start» — від лівого, «end» — від правого (для «⋯» біля краю).
  align?: 'start' | 'end'
}

/** Кнопка «⋯» з випадаючим меню дій у стилі застосунку. */
export function Menu({ label, groups, trigger, triggerClass = 'icon-btn menu-btn', triggerStyle, align = 'end' }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const visible = groups.filter((g) => g.length)

  // Меню під кнопкою, вирівняне по її краю (align); якщо внизу мало місця — над нею. Не виходить за край екрана.
  useLayoutEffect(() => {
    if (!open || !button.current || !pop.current) return
    const r = button.current.getBoundingClientRect()
    const h = pop.current.offsetHeight
    const w = pop.current.offsetWidth
    setPos({ ...placeBelowOrAbove(r, h), left: placeX(r, w, align) })
    pop.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as Node
      if (pop.current?.contains(t) || button.current?.contains(t)) return
      setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        button.current?.focus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const items = [...(pop.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? i + 1 : i - 1
      items[(next + items.length) % items.length]?.focus()
    }
    const scroll = (e: Event) => !pop.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    // Перехоплюємо раніше за вікно, щоб Escape закривав лише меню.
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

  function pick(item: MenuItem) {
    setOpen(false)
    item.onSelect()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={open ? `${triggerClass} on` : triggerClass}
        style={triggerStyle}
        aria-label={label}
        title={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setPos({ visibility: 'hidden' })
          setOpen(!open)
        }}
      >
        {trigger ?? <MoreHorizontal size={18} />}
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="menu-pop" role="menu" aria-label={label} style={pos}>
            {visible.map((group, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <hr className="menu-sep" />}
                {group.map((item, ii) => (
                  <button
                    key={`${ii}-${item.label}`}
                    type="button"
                    role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                    aria-checked={item.checked}
                    className={['menu-item', item.danger && 'danger', item.checked && 'sel'].filter(Boolean).join(' ')}
                    disabled={item.disabled}
                    onClick={() => pick(item)}
                  >
                    {item.swatch ? (
                      <span className="menu-dot" style={{ background: item.swatch }} />
                    ) : (
                      item.icon && <item.icon size={16} />
                    )}
                    <span className="grow">{item.label}</span>
                    {item.hint && <small>{item.hint}</small>}
                    {item.checked && <Check size={16} />}
                  </button>
                ))}
              </Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
