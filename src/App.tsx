import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/context'
import { AppLayout } from './layout/AppLayout'
import { CoursePage } from './pages/ktp/CoursePage'
import { KtpPage } from './pages/ktp/KtpPage'
import { LoginPage } from './pages/LoginPage'
import { SchedulePage } from './pages/schedule/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'
import { CourseTests } from './pages/tests/CourseTests'
import { TestPage } from './pages/tests/TestPage'
import { TodayPage } from './pages/TodayPage'
import { YearPage } from './pages/year/YearPage'

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
          <Route path="ktp" element={<KtpPage />} />
          <Route path="ktp/year" element={<YearPage />} />
          <Route path="ktp/:courseId" element={<CoursePage />} />
          <Route path="ktp/:courseId/tests" element={<CourseTests />} />
          <Route path="tests/:testId" element={<TestPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
