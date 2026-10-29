import { useState } from 'react'

type Props = {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  label: string
  className?: string
  multiline?: boolean
  autoFocus?: boolean
  // Однорядкове поле завширшки з текст (назва теми, щоб години стояли одразу за нею).
  fitContent?: boolean
}

/** Текст, що редагується прямо в клітинці й зберігається, коли поле втрачає фокус. */
export function InlineText({ value, onSave, placeholder, label, className, multiline, autoFocus, fitContent }: Props) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setDraft(value)
  }

  function commit() {
    const v = draft.trim()
    if (v !== value) onSave(v)
  }

  const common = {
    className: `cell ${className ?? ''}`,
    'aria-label': label,
    placeholder,
    value: draft,
    onBlur: commit,
    autoFocus,
  }

  if (multiline)
    return (
      <textarea
        {...common}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        // Висота рядка підлаштовується під текст.
        ref={(el) => {
          if (el) {
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
          }
        }}
      />
    )
  return (
    <input
      {...common}
      style={fitContent ? { width: `${Math.max(10, draft.length + 3)}ch` } : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
