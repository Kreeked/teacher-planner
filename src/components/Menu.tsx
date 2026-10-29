import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem = {
  label: string
  icon: LucideIcon
  onSelect: () => void
  // Дрібний текст праворуч, наприклад кількість файлів.
  hint?: string
  danger?: boolean
}

// Групи пунктів розділяються лінією. trigger — власний вміст кнопки (наприклад, «Додати») замість «⋯».
type Props = { label: string; groups: MenuItem[][]; trigger?: ReactNode; triggerClass?: string }

const WIDTH = 220

/** Кнопка «⋯» з випадаючим меню дій у стилі застосунку. */
export function Menu({ label, groups, trigger, triggerClass = 'icon-btn menu-btn' }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const visible = groups.filter((g) => g.length)

  // Меню під кнопкою, праворуч вирівняне по ній; якщо внизу мало місця — над нею. Не виходить за край екрана.
  useLayoutEffect(() => {
    if (!open || !button.current || !pop.current) return
    const r = button.current.getBoundingClientRect()
    const h = pop.current.offsetHeight
    const below = r.bottom + 4 + h <= window.innerHeight - 8
    setPos({
      top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h),
      left: Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8)),
    })
    pop.current.querySelector('button')?.focus()
  }, [open])

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
      const items = [...(pop.current?.querySelectorAll('button') ?? [])]
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
          <div ref={pop} className="menu-pop" role="menu" aria-label={label} style={{ ...pos, width: WIDTH }}>
            {visible.map((group, gi) => (
              <Fragment key={gi}>
                {gi > 0 && <hr className="menu-sep" />}
                {group.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={item.danger ? 'menu-item danger' : 'menu-item'}
                    onClick={() => pick(item)}
                  >
                    <item.icon size={16} />
                    <span className="grow">{item.label}</span>
                    {item.hint && <small>{item.hint}</small>}
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
