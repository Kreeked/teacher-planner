import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/context'
import { useCollection } from '../../data/db'
import { hasDraft, startDraft, stopDraft } from '../../data/draft'
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
  useEffect(() => stopDraft, [])

  if (loading) return <div className="splash" aria-busy="true" />

  // Налаштування почато, але не доведено до кінця: у базі нічого немає, а чернетка лежить на цьому пристрої.
  const unfinished = !finished && hasDraft(user!.uid)
  if (started)
    return (
      <Wizard
        onExit={() => {
          stopDraft()
          setStarted(false)
        }}
        onDone={() => {
          setStarted(false)
          setFinished(true)
        }}
      />
    )
  if ((years.length === 0 && !finished) || unfinished) return <Welcome resume={unfinished} onStart={() => {
          startDraft(user!.uid)
          setStarted(true)
        }} />
  return children
}
