import { useEffect, useState } from 'react'
import { useAuth } from '../auth/context'
import { Alert } from '../components/Alert'
import { Logo } from '../components/Logo'
import { preloadDrive } from '../lib/drive'

/** Приклад уроків дня для ілюстрації: не дані користувача. */
const LESSONS = [
  { n: 1, title: '8-А · Інформатика', topic: 'Алгоритми та їхні властивості', time: '08:30', bg: 'var(--mint)', ink: '#3f4a47' },
  { n: 2, title: '9-Б · Інформатика', topic: 'Практична робота', time: '09:25', bg: 'var(--butter)', ink: '#55501f' },
  { n: 4, title: '11-А · Інформатика', topic: 'Бази даних', time: '11:25', bg: 'var(--peri)', ink: '#363c63' },
]

export function LoginPage() {
  const { signIn } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Скрипт Google вантажимо наперед: вікно входу має відкритися в тому ж натисканні, інакше браузер його заблокує.
  useEffect(preloadDrive, [])

  async function handleClick() {
    setError('')
    setBusy(true)
    try {
      await signIn()
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        const blocked = e instanceof Error && /заблокував|popup-blocked/i.test(`${e.message} ${code ?? ''}`)
        setError(
          !navigator.onLine
            ? 'Для першого входу потрібен інтернет.'
            : blocked
              ? 'Браузер заблокував вікно Google. Дозволь спливні вікна для цього сайту (на iPhone: Налаштування → Safari → «Блокувати спливні вікна») і натисни ще раз.'
              : `Не вдалося увійти. Натисни ще раз.${code ? ` (${code})` : ''}`,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <section className="login-main">
        <div className="login-brand">
          <Logo size={32} />
          Планер для вчителя
        </div>

        <div className="login-copy">
          <h1>Усе для уроків в одному місці</h1>
          <p>КТП, розклад і матеріали до уроків. Працює на комп’ютері й телефоні, навіть без інтернету.</p>
          <div className="login-actions">
            {error && <Alert kind="crit">{error}</Alert>}
            <button type="button" className="login-btn" onClick={handleClick} disabled={busy}>
              <span className="login-g">
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
              </span>
              {busy ? 'Входимо…' : 'Увійти через Google'}
            </button>
          </div>
        </div>

        <p className="login-note">Дані зберігаються в твоєму акаунті Google і доступні лише тобі.</p>
      </section>

      <section className="login-art" aria-hidden>
        <div className="login-today">
          <div className="login-today-head">
            <b>Сьогодні</b>
            <span>вівторок, 3 вересня</span>
          </div>
          {LESSONS.map((l) => (
            <div key={l.n} className="login-lesson" style={{ background: l.bg, color: l.ink }}>
              <span className="login-n">{l.n}</span>
              <div>
                <b>{l.title}</b>
                <span>{l.topic}</span>
              </div>
              <time>{l.time}</time>
            </div>
          ))}
          <div className="login-chips">
            <span>КТП</span>
            <span>Розклад</span>
            <span>Матеріали</span>
          </div>
        </div>
      </section>
    </div>
  )
}
