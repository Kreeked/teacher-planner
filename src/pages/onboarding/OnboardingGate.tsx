import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/context'
import { useCollection } from '../../data/db'
import { discardDraft, hasDraft, startDraft, stopDraft } from '../../data/draft'
import { ask } from '../../lib/confirm'
import { clearOnboarding, getOnboardingStep } from '../../lib/onboarding'
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
  // Рік уже з'явився в базі: «finished» свою роль виконало. Інакше після видалення останнього року
  // застосунок лишався б на порожньому екрані замість вітання.
  if (finished && years.length > 0) setFinished(false)
  // Видалили останній рік: після нового налаштування користувач потрапляє на стартову сторінку, а не туди, де був.
  const hadYears = useRef(false)
  useEffect(() => {
    if (loading) return
    if (years.length > 0) hadYears.current = true
    else if (hadYears.current) {
      hadYears.current = false
      window.location.hash = '#/'
    }
  }, [loading, years.length])

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
  if ((years.length === 0 && !finished) || unfinished) {
    const begin = () => {
      startDraft(user!.uid)
      setStarted(true)
    }
    return (
      <Welcome
        resumeAt={unfinished ? (getOnboardingStep(user!.uid) ?? 0) : null}
        onStart={begin}
        onRestart={async () => {
          if (!(await ask('Усе, що ти ввів на цьому пристрої, буде видалено.', { title: 'Почати налаштування з початку?', ok: 'Почати з початку' }))) return
          discardDraft(user!.uid)
          clearOnboarding(user!.uid)
          begin()
        }}
      />
    )
  }
  return children
}
