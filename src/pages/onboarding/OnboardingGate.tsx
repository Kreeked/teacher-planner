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
  // Налаштування йде: або щойно натиснули «Створити», або рік створено, але кроки не пройдено до кінця.
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)

  if (loading) return <div className="splash" aria-busy="true" />

  const resuming = !finished && years.length > 0 && getOnboardingStep(user!.uid) !== null
  if (started || resuming)
    return (
      <Wizard
        onExit={() => setStarted(false)}
        onDone={() => {
          setStarted(false)
          setFinished(true)
        }}
      />
    )
  if (years.length === 0) return <Welcome onStart={() => setStarted(true)} />
  return children
}
