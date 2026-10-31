import { ArrowRight } from 'lucide-react'
import { useEffect } from 'react'
import { useAuth } from '../../auth/context'
import { Logo } from '../../components/Logo'
import { hideSplash } from '../../lib/splash'

const ICON = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

const FEATURES = [
  {
    color: 'var(--mint)',
    title: 'КТП',
    text: 'Теми й уроки за семестрами. Готове планування імпортується з Word.',
    icon: (
      <svg {...ICON}>
        <path d="M3 5.5C5.5 4.5 9 4.6 12 6.5c3-1.9 6.5-2 9-1v13c-2.5-1-6-.9-9 1-3-1.9-6.5-2-9-1z" />
        <path d="M12 6.5v13" />
      </svg>
    ),
  },
  {
    color: 'var(--butter)',
    title: 'Розклад і «Сьогодні»',
    text: 'Уроки дня за розкладом і датами КТП: що, у якому класі й коли.',
    icon: (
      <svg {...ICON}>
        <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
        <path d="M8 2.5v4M16 2.5v4M3 10h18" />
      </svg>
    ),
  },
  {
    color: 'var(--lilac)',
    title: 'Матеріали до уроків',
    text: 'Презентації, картки й файли до кожного уроку, доступні навіть без інтернету.',
    icon: (
      <svg {...ICON}>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
]

/** Перший екран порожнього акаунта: що це за застосунок і кнопка створення першого навчального року. */
export function Welcome({ resume, onStart }: { resume: boolean; onStart: () => void }) {
  const { signOut } = useAuth()
  useEffect(hideSplash, [])

  return (
    <div className="wl">
      <div className="wl-top">
        <span className="logo" aria-label="Планер для вчителя" role="img">
          <Logo />
        </span>
        <button type="button" className="wl-exit" onClick={() => signOut()}>
          Вийти
        </button>
      </div>

      <div className="wl-body">
        <main className="wl-main">
          <header className="wl-head">
            <p>Ласкаво просимо</p>
            <h1>Усе для уроків в одному місці</h1>
            <p className="wl-lead">
              Планер збирає календарно-тематичне планування, розклад і матеріали до уроків. Працює на комп’ютері й телефоні, навіть без інтернету.
            </p>
          </header>

          <ul className="wl-cards">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="wl-tile" style={{ background: f.color }}>
                  {f.icon}
                </span>
                <div>
                  <b>{f.title}</b>
                  <span>{f.text}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="wl-start">
            <button type="button" className="btn wl-cta" onClick={onStart}>
              {resume ? 'Продовжити створення навчального року' : 'Створити перший навчальний рік'} <ArrowRight size={16} strokeWidth={2} />
            </button>
            <p>Налаштування року займе кілька хвилин: 6 кроків від семестрів до розкладу.</p>
          </div>
        </main>
      </div>
    </div>
  )
}
