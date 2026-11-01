import { ArrowRight, Check } from 'lucide-react'
import { useEffect } from 'react'
import { useAuth } from '../../auth/context'
import { Logo } from '../../components/Logo'
import { STEPS, type StepId } from '../../data/onboarding'
import { hideSplash } from '../../lib/splash'

/** Що робиться на кроці і якого кольору його позначка (за парами кроків: календар, класи з предметами, дзвінки з розкладом). */
const ABOUT: Record<StepId, { text: string; color: string }> = {
  year: { text: 'назва й межі навчального року', color: 'var(--mint)' },
  semesters: { text: 'початок і кінець кожного', color: 'var(--mint)' },
  vacations: { text: 'осінні, зимові й весняні', color: 'var(--mint)' },
  classes: { text: 'з ким ти працюєш', color: 'var(--butter)' },
  subjects: { text: 'порожні КТП для кожного', color: 'var(--butter)' },
  bells: { text: 'час уроків і перерв', color: 'var(--peri)' },
  schedule: { text: 'класи за днями тижня', color: 'var(--peri)' },
}

type Props = {
  /** Крок, на якому зупинився користувач; порожньо, якщо налаштування ще не починалось. */
  resumeAt: number | null
  onStart: () => void
  onRestart: () => void
}

/** Перший екран порожнього акаунта: що буде налаштовано і кнопка створення (або продовження) першого навчального року. */
export function Welcome({ resumeAt, onStart, onRestart }: Props) {
  const { user, signOut } = useAuth()
  useEffect(hideSplash, [])
  const resume = resumeAt !== null

  return (
    <div className="wl">
      <div className="wl-body">
        <main className="ob-main">
          <header className="ob-head">
            <span className="logo" aria-label="Планер для вчителя" role="img">
              <Logo size={40} />
            </span>
            <p>{resume ? 'Налаштування не завершено' : 'Ласкаво просимо'}</p>
            <h1>
              {resume ? (
                'Продовжимо створення року'
              ) : (
                <>
                  Створіть перший
                  <br />
                  навчальний рік
                </>
              )}
            </h1>
            <p className="ob-lead">
              {resume
                ? `Усе введене збережено на цьому пристрої. Ти зупинився на кроці «${STEPS[Math.min(resumeAt, STEPS.length - 1)].title}».`
                : 'Сім коротких кроків, і планер готовий до роботи. До кінця налаштування нічого не зберігається, тож можна передумати.'}
            </p>
          </header>

          <section className="ob-block wl-steps" aria-label="Кроки налаштування">
            <ul>
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <span className="wl-chip" style={{ background: ABOUT[s.id].color }}>
                    {resume && i < resumeAt ? <Check size={16} strokeWidth={2.4} aria-label="Готово" /> : i + 1}
                  </span>
                  <b>{s.title}</b>
                  <span>{ABOUT[s.id].text}</span>
                </li>
              ))}
            </ul>
          </section>

          <nav className="ob-nav" aria-label="Дії">
            <button type="button" className="ob-back wl-plain" onClick={() => signOut()}>
              Вийти
            </button>
            <span className="wl-go">
              {resume && (
                <button type="button" className="ob-back wl-plain wl-ink" onClick={onRestart}>
                  Почати з початку
                </button>
              )}
              <button type="button" className="ob-next" onClick={onStart}>
                {resume ? 'Продовжити створення' : 'Створити перший навчальний рік'} <ArrowRight size={14} strokeWidth={2} aria-hidden />
              </button>
            </span>
          </nav>
          {user?.email && <p className="wl-who">Ти увійшов як {user.email}</p>}
        </main>
      </div>
    </div>
  )
}
