import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/context'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { SoonPage } from './pages/SoonPage'
import { TodayPage } from './pages/TodayPage'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div className="splash" aria-busy="true" />
  if (!user) return <LoginPage />

  return (
    // HashRouter: адреси виду …/#/ktp працюють на будь-якому статичному хостингу без налаштувань.
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<TodayPage />} />
          <Route
            path="ktp"
            element={<SoonPage title="КТП" color="lilac" text="Наступний крок: навчальний рік, класи й таблиця календарно-тематичного планування." />}
          />
          <Route
            path="schedule"
            element={<SoonPage title="Розклад" color="peri" text="Дзвінки й тижневий розклад з'являться після модуля КТП." />}
          />
          <Route
            path="calendar"
            element={<SoonPage title="Календар" color="butter" text="Канікули, свята й перенесення уроків — у модулі «Календар навчального року»." />}
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
