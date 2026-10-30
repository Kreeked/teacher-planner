import { useLayoutEffect, useRef, useState } from 'react'
import { Navigate, NavLink, useLocation, useNavigationType, type Location } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { ConfirmHost } from '../components/Confirm'
import { SavedToast } from '../components/Saved'
import { useOfflineAutoSync } from '../lib/useOfflinePlan'
import { useOnline } from '../lib/useOnline'
import { NAV } from './nav'
import { PageBar } from './PageBar'
import { TabPanes } from './TabPanes'

const SETTINGS = NAV[NAV.length - 1]

/** Розділ меню, якому належить шлях. */
function tabOf(pathname: string) {
  return NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname === n.to || pathname.startsWith(`${n.to}/`)))?.to
}

export function AppLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const active = tabOf(location.pathname)
  // Де зупинився кожен відкритий розділ і наскільки він прокручений.
  const [tabs, setTabs] = useState<Record<string, Location>>({})
  const scrolls = useRef<Record<string, number>>({})
  const shown = useRef<string | undefined>(undefined)
  // Прокрутка запису історії: «Назад» повертає на те саме місце, а нова сторінка відкривається з початку.
  const navType = useNavigationType()
  const byKey = useRef<Record<string, number>>({})
  const key = useRef(location.key)
  const path = useRef(location.pathname)
  if (active && tabs[active] !== location) setTabs({ ...tabs, [active]: location })

  useLayoutEffect(() => {
    window.history.scrollRestoration = 'manual'
    key.current = location.key
    const saved = byKey.current[location.key]
    let frame = 0
    if (navType === 'POP' && saved !== undefined) {
      // Вміст може дорендеритися трохи згодом — добиваємо позицію кілька кадрів.
      let tries = 0
      const restore = () => {
        window.scrollTo(0, saved)
        if (Math.abs(window.scrollY - saved) > 2 && tries++ < 20) frame = requestAnimationFrame(restore)
      }
      restore()
    } else if (active && active !== shown.current) {
      // Перемикання між розділами меню повертає прокрутку розділу.
      window.scrollTo(0, scrolls.current[active] ?? 0)
    } else if (location.pathname !== path.current) {
      // Нова сторінка всередині розділу (наприклад, курс КТП) відкривається з початку.
      window.scrollTo(0, 0)
    }
    path.current = location.pathname
    shown.current = active
    return () => cancelAnimationFrame(frame)
  }, [location.key, location.pathname, active, navType])
  useLayoutEffect(() => {
    const onScroll = () => {
      byKey.current[key.current] = window.scrollY
      if (shown.current) scrolls.current[shown.current] = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Перемикання на неактивний розділ веде туди, де в ньому зупинилися; повторний дотик до активного — на його початок.
  const target = (to: string) => {
    const saved = to !== active ? tabs[to] : undefined
    return saved ? saved.pathname + saved.search : to
  }

  // Записи історії від меню позначені: «Назад» не веде в попередній розділ, а піднімається до початку цього.
  const tabProps = (to: string) => ({ to: target(to), replace: to === active, state: { via: 'tab' } })

  const online = useOnline()
  useOfflineAutoSync()

  if (!active) return <Navigate to="/" replace />

  return (
    <div className="shell">
      <nav className="side" aria-label="Розділи">
        <div className="logo" aria-hidden>
          П
        </div>
        {NAV.slice(0, -1).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} {...tabProps(to)} end={to === '/'} className="nav-btn" title={label} aria-label={label}>
            <Icon size={18} strokeWidth={1.8} />
          </NavLink>
        ))}
        <span className="spacer" />
        <NavLink {...tabProps(SETTINGS.to)} className="nav-btn" title={SETTINGS.label} aria-label={SETTINGS.label}>
          <SETTINGS.icon size={18} strokeWidth={1.8} />
        </NavLink>
      </nav>

      <div className="content">
        <header className="top">
          <span className="grow" />
          <span className={online ? 'status' : 'status off'}>
            <i />
            {online ? 'Синхронізовано' : 'Офлайн: зміни збережуться'}
          </span>
          {user?.photoURL ? (
            <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar">{user?.displayName?.[0] ?? '?'}</span>
          )}
        </header>
        <PageBar tab={active} child={location.pathname !== active} />
        <TabPanes tabs={tabs} active={active} />
      </div>
      <ConfirmHost />
      <SavedToast />

      <nav className="tabbar" aria-label="Розділи">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} {...tabProps(to)} end={to === '/'} className="tb" aria-label={label}>
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
