import { HashRouter, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './auth/context'
import { hideSplash } from './lib/splash'
import { AppLayout } from './layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
export default function App() {
  const { user, loading } = useAuth()

  // Без входу заставку знімаємо одразу; із входом її знімає перший екран (див. TodayPage, AppLayout).
  useEffect(() => {
    if (!loading && !user) hideSplash()
  }, [loading, user])

  if (loading) return <div className="splash" aria-busy="true" />
  if (!user) return <LoginPage />

  return (
    // HashRouter: адреси виду …/#/ktp працюють на будь-якому статичному хостингу без налаштувань.
    <HashRouter>
      <Routes>
        <Route path="*" element={<AppLayout />} />
      </Routes>
    </HashRouter>
  )
}
