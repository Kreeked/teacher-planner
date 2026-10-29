import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { ConfirmHost } from '../components/Confirm'
import { SavedToast } from '../components/Saved'
import { useOfflineAutoSync } from '../lib/useOfflinePlan'
import { useOnline } from '../lib/useOnline'
import { NAV } from './nav'

const SETTINGS = NAV[NAV.length - 1]

export function AppLayout() {
  const { user } = useAuth()
  const online = useOnline()
  useOfflineAutoSync()

  return (
    <div className="shell">
      <nav className="side" aria-label="Розділи">
        <div className="logo" aria-hidden>
          П
        </div>
        {NAV.slice(0, -1).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="nav-btn" title={label} aria-label={label}>
            <Icon size={18} strokeWidth={1.8} />
          </NavLink>
        ))}
        <span className="spacer" />
        <NavLink to={SETTINGS.to} className="nav-btn" title={SETTINGS.label} aria-label={SETTINGS.label}>
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
        <Outlet />
      </div>
      <ConfirmHost />
      <SavedToast />

      <nav className="tabbar" aria-label="Розділи">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="tb" aria-label={label}>
            <Icon size={18} strokeWidth={1.8} />
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
