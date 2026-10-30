import { Route, Routes, type Location } from 'react-router-dom'
import { CoursePage } from '../pages/ktp/CoursePage'
import { KtpPage } from '../pages/ktp/KtpPage'
import { SchedulePage } from '../pages/schedule/SchedulePage'
import { SettingsPage } from '../pages/SettingsPage'
import { TodayPage } from '../pages/TodayPage'
import { YearPage } from '../pages/year/YearPage'

/** Сторінки кожного розділу меню; ключ — шлях розділу з `NAV`. */
function TabRoutes({ tab, location }: { tab: string; location: Location }) {
  return (
    <Routes location={location}>
      {tab === '/' && <Route path="/" element={<TodayPage />} />}
      {tab === '/schedule' && <Route path="/schedule" element={<SchedulePage />} />}
      {tab === '/ktp' && (
        <>
          <Route path="/ktp" element={<KtpPage />} />
          <Route path="/ktp/year" element={<YearPage />} />
          <Route path="/ktp/:courseId" element={<CoursePage />} />
        </>
      )}
      {tab === '/settings' && <Route path="/settings" element={<SettingsPage />} />}
    </Routes>
  )
}

type Props = {
  // Розділи, які вже відкривали, і де кожен зупинився.
  tabs: Record<string, Location>
  active: string
}

/** Відкриті розділи живуть одночасно, неактивні лише приховані: стан сторінок не скидається. */
export function TabPanes({ tabs, active }: Props) {
  return Object.entries(tabs).map(([tab, location]) => (
    <div key={tab} className="tab-pane" hidden={tab !== active}>
      <TabRoutes tab={tab} location={location} />
    </div>
  ))
}
