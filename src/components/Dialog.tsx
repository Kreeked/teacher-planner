import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  // Кнопки внизу вікна; стоять праворуч, головна — остання.
  footer?: ReactNode
  className?: string
}

// Відкриті вікна: Escape закриває лише верхнє (наприклад, підтвердження поверх параметрів).
const stack: object[] = []

/** Спливне вікно поверх сторінки: не зсуває вміст, на телефоні не виходить за край екрана. */
export function Dialog({ title, subtitle, onClose, children, footer, className }: Props) {
  // Останній onClose без перезапуску ефекту: інакше вікно знову ставало б верхнім при кожному оновленні.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  // Закриття спершу програє анімацію зникнення (`.closing`), потім викликає onClose.
  const [closing, setClosing] = useState(false)
  const timer = useRef<number>(0)
  function dismiss() {
    if (timer.current) return
    setClosing(true)
    const wait = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140
    timer.current = window.setTimeout(() => {
      timer.current = 0
      setClosing(false)
      close.current()
    }, wait)
  }
  const dismissRef = useRef(dismiss)
  useEffect(() => {
    dismissRef.current = dismiss
  })
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    const me = {}
    stack.push(me)
    // Escape, який уже обробило відкрите меню, вікно не закриває.
    const key = (e: KeyboardEvent) =>
      e.key === 'Escape' && !e.defaultPrevented && stack[stack.length - 1] === me && dismissRef.current()
    document.addEventListener('keydown', key)
    // Сторінка під вікном не прокручується.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', key)
      stack.splice(stack.indexOf(me), 1)
      document.body.style.overflow = overflow
    }
  }, [])

  return createPortal(
    <div className={closing ? 'overlay closing' : 'overlay'} onPointerDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className={`dialog ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <div className="grow">
            <b>{title}</b>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" className="icon-btn" onClick={dismiss} aria-label="Закрити">
            <X size={16} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
