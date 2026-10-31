import { ArrowRight, BookOpen, CalendarDays, FolderOpen } from 'lucide-react'
import { useEffect } from 'react'
import { useAuth } from '../../auth/context'
import { Logo } from '../../components/Logo'
import { hideSplash } from '../../lib/splash'
import { STEPS } from '../../data/onboarding'

const FEATURES = [
  { icon: BookOpen, color: 'var(--mint)', title: 'КТП', text: 'Теми й уроки за семестрами, імпорт готового планування з Word.' },
  { icon: CalendarDays, color: 'var(--butter)', title: 'Розклад і «Сьогодні»', text: 'Уроки дня за розкладом і датами КТП: що, у якому класі й коли.' },
  { icon: FolderOpen, color: 'var(--lilac)', title: 'Матеріали до уроків', text: 'Презентації, картки й файли до кожного уроку, доступні навіть без інтернету.' },
]

/** Перший екран порожнього акаунта: що це за застосунок і кнопка створення першого навчального року. */
export function Welcome({ onStart }: { onStart: () => void }) {
  const { user, signOut } = useAuth()
  useEffect(hideSplash, [])

  return (
    <div className="ob">
      <header className="ob-top">
        <span className="ob-brand">
          <span className="logo" aria-hidden>
            <Logo />
          </span>
          Планер для вчителя
        </span>
        <button type="button" className="btn ghost small" onClick={() => signOut()}>
          Вийти
        </button>
      </header>

      <main className="ob-main">
        <section className="ob-card ob-welcome" aria-labelledby="ob-welcome">
          <p className="ob-kicker">Ласкаво просимо{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</p>
          <h1 id="ob-welcome">Усе для уроків в одному місці</h1>
          <p className="ob-lead">
            Планер збирає календарно-тематичне планування, розклад і матеріали до уроків. Працює на комп’ютері й телефоні, навіть без інтернету.
          </p>

          <ul className="ob-features">
            {FEATURES.map(({ icon: Icon, color, title, text }) => (
              <li key={title}>
                <span className="ob-tile" style={{ background: color }}>
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <div>
                  <b>{title}</b>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="ob-start">
            <p>
              Спершу створимо навчальний рік і налаштуємо його за {STEPS.length} кроками: семестри, класи, предмети, дзвінки й розклад. Це кілька хвилин.
            </p>
            <button type="button" className="btn" onClick={onStart}>
              Створити перший навчальний рік <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
