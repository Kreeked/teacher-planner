import { ArrowLeft } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

// Висота липкої панелі: заголовок з'являється, коли власний h1 сторінки сховався під нею.
const BAR = 48

type Props = {
  // Шлях активного розділу меню; на вкладених сторінках «Назад» без історії веде сюди.
  tab: string
  child: boolean
}

/** Липка пігулка зверху: на вкладених сторінках — «Назад», на всіх — заголовок сторінки, коли її h1 прокручено. */
export function PageBar({ tab, child }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { key } = location
  const [title, setTitle] = useState('')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => {
      const h1 = document.querySelector('.tab-pane:not([hidden]) h1')
      setTitle(h1?.textContent?.trim() ?? '')
      setScrolled(!!h1 && h1.getBoundingClientRect().bottom < BAR)
    }
    // Не частіше разу за кадр: вимірювання під час прокрутки не має гальмувати її.
    let frame = 0
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), update()))
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [key, tab])

  // Записи, створені меню, — не історія для «Назад»: вгору до розділу. Перехід усередині застосунку — крок назад.
  function back(e: MouseEvent) {
    e.preventDefault()
    const viaMenu = location.state?.via === 'tab' || (window.history.state?.idx ?? 0) === 0
    if (viaMenu) navigate(tab, { replace: true, state: { via: 'tab' } })
    else navigate(-1)
  }

  // Заголовок при прокрутці лише на вкладених сторінках; на сторінках розділів меню (Сьогодні, КТП, Налаштування) його немає.
  const showTitle = child && scrolled && !!title
  if (!child && !showTitle) return <div className="pagebar flat" />

  return (
    <div className={child ? 'pagebar' : 'pagebar flat'}>
      <div className="pagebar-pill">
        {child && (
          <Link to={tab} className="pagebar-back" onClick={back}>
            <ArrowLeft size={14} /> Назад
          </Link>
        )}
        {showTitle && <span className="pagebar-title">{title}</span>}
      </div>
    </div>
  )
}
