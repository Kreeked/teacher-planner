import { useEffect, useState } from 'react'
import { registerConfirm, type Ask } from '../lib/confirm'
import { Dialog } from './Dialog'

/** Місце, де показується питання; стоїть один раз у макеті застосунку. */
export function ConfirmHost() {
  const [current, setCurrent] = useState<Ask | null>(null)
  const [typed, setTyped] = useState('')

  useEffect(
    () =>
      registerConfirm((a) => {
        setTyped('')
        setCurrent(a)
      }),
    [],
  )

  if (!current) return null
  const answer = (yes: boolean) => {
    current.resolve(yes)
    setCurrent(null)
  }
  // Незворотне видалення вимагає вписати слово.
  const locked = !!current.word && typed.trim().toLowerCase() !== current.word.toLowerCase()

  return (
    <Dialog
      title={current.title ?? 'Підтвердження'}
      className="confirm-dialog"
      onClose={() => answer(false)}
      footer={
        <>
          <button className="btn ghost" onClick={() => answer(false)}>
            {current.cancel ?? 'Скасувати'}
          </button>
          <button
            className={current.danger ? 'btn danger-fill' : 'btn'}
            autoFocus={!current.word}
            disabled={locked}
            onClick={() => answer(true)}
          >
            {current.ok}
          </button>
        </>
      }
    >
      <p className="confirm-text">{current.text}</p>
      {current.word && (
        <form
          className="confirm-word"
          onSubmit={(e) => {
            e.preventDefault()
            if (!locked) answer(true)
          }}
        >
          <label>
            Щоб підтвердити, впиши «{current.word}»
            <input
              className="field"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        </form>
      )}
    </Dialog>
  )
}
