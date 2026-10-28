import { Check, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { createDoc, updateFields } from '../../data/db'
import { sortOutcomes } from '../../data/outcomes'
import type { LearningOutcome, Lesson } from '../../data/types'

type Props = { lesson: Lesson; outcomes: LearningOutcome[]; usage: Map<string, number[]>; onClose: () => void }

/** Вибір ОРН для уроку з довідника курсу (і швидке додавання нового). */
export function OutcomePicker({ lesson, outcomes, usage, onClose }: Props) {
  const [query, setQuery] = useState('')
  const selected = lesson.outcome_ids ?? []
  const q = query.trim().toLowerCase()
  const list = sortOutcomes(outcomes).filter((o) => !q || o.text.toLowerCase().includes(q))

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    updateFields('lessons', lesson.id, { outcome_ids: next })
  }

  function addNew() {
    const text = query.trim()
    if (!text) return
    const id = createDoc('learning_outcomes', { course_id: lesson.course_id, text, position: outcomes.length })
    updateFields('lessons', lesson.id, { outcome_ids: [...selected, id] })
    setQuery('')
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Очікувані результати навчання" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <div className="grow">
            <b>ОРН до уроку {lesson.number}</b>
            <span>{lesson.title || 'без теми'}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрити">
            <X size={16} />
          </button>
        </div>
        <label className="search-field">
          <Search size={14} />
          <input
            autoFocus
            placeholder="Пошук або новий ОРН"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && list.length === 0 && addNew()}
          />
        </label>
        <div className="pick-list">
          {list.map((o) => {
            const on = selected.includes(o.id)
            const used = usage.get(o.id)?.filter((n) => n !== lesson.number)
            return (
              <button key={o.id} className={on ? 'pick on' : 'pick'} onClick={() => toggle(o.id)} aria-pressed={on}>
                <span className="box">{on && <Check size={12} />}</span>
                <span className="grow">{o.text}</span>
                {used && used.length > 0 && <span className="used num">ур. {used.join(', ')}</span>}
              </button>
            )
          })}
          {list.length === 0 && !q && <p className="muted">У довіднику ще немає ОРН. Напиши перший у полі вище.</p>}
        </div>
        {q && (
          <button className="btn ghost" onClick={addNew}>
            <Plus size={15} /> Додати новий ОРН «{query.trim()}»
          </button>
        )}
      </div>
    </div>
  )
}
