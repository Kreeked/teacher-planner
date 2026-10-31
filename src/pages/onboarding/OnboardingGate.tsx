import { useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/context'
import { useCollection } from '../../data/db'
import { getOnboardingStep } from '../../lib/onboarding'
import { Welcome } from './Welcome'
import { Wizard } from './Wizard'

/**
 * Порожній акаунт (без жодного навчального року) бачить лише вітання й початкове налаштування.
 * Застосунок відкривається, коли рік створено і налаштування пройдено.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { items: years, loading } = useCollection('academic_years')
  // «Створити» / «Продовжити» натиснуто: йде налаштування.
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)

  if (loading) return <div className="splash" aria-busy="true" />

  // Рік уже почато, але не доведено до кінця: після виходу чи нової вкладки знову починаємо з вітання, дані збережено.
  const unfinished = !finished && years.length > 0 && getOnboardingStep(user!.uid) !== null
  if (started)
    return (
      <Wizard
        onExit={() => setStarted(false)}
        onDone={() => {
          setStarted(false)
          setFinished(true)
        }}
      />
    )
  if (years.length === 0 || unfinished) return <Welcome resume={unfinished} onStart={() => setStarted(true)} />
  return children
}
