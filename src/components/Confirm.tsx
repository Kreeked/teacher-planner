import { useEffect, useState } from 'react'
import { registerConfirm, type Ask } from '../lib/confirm'
import { Dialog } from './Dialog'

/** Місце, де показується питання; стоїть один раз у макеті застосунку. */
export function ConfirmHost() {
  const [current, setCurrent] = useState<Ask | null>(null)

  useEffect(() => registerConfirm(setCurrent), [])

  if (!current) return null
  const answer = (yes: boolean) => {
    current.resolve(yes)
    setCurrent(null)
  }

  return (
    <Dialog
      title="Підтвердження"
      className="confirm-dialog"
      onClose={() => answer(false)}
      footer={
        <>
          <button className="btn ghost" onClick={() => answer(false)}>
            Скасувати
          </button>
          <button className={current.danger ? 'btn danger-fill' : 'btn'} autoFocus onClick={() => answer(true)}>
            {current.ok}
          </button>
        </>
      }
    >
      <p className="confirm-text">{current.text}</p>
    </Dialog>
  )
}
