import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

const ICONS = { crit: CircleAlert, warn: TriangleAlert, hint: Info }

/**
 * Повідомлення про екран чи блок у цілому; колір каже про вагу: червона — критична (дію відхилено),
 * оранжева — попередження (не блокує), синя — підказка. Про окреме поле тут не пишемо.
 */
export function Alert({ kind, children }: { kind: keyof typeof ICONS; children: ReactNode }) {
  const Icon = ICONS[kind]
  return (
    <p className={`alert ${kind}`} role={kind === 'crit' ? 'alert' : 'status'}>
      <Icon size={16} strokeWidth={2} aria-hidden />
      {children}
    </p>
  )
}
