import { ArrowLeft, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InlineText } from '../../components/InlineText'
import { commit, createDoc, newBatch, ref, updateFields, useCollection } from '../../data/db'
import { courseTitle } from '../../data/ktp'
import { coverage, outcomeUsage, parseOutcomeList, sortOutcomes } from '../../data/outcomes'
import type { LearningOutcome } from '../../data/types'

export function OutcomesPage() {
  const { courseId = '' } = useParams()
  const byCourse = { field: 'course_id', value: courseId }
  const { items: courses } = useCollection('courses')
  const { items: outcomes } = useCollection('learning_outcomes', byCourse)
  const { items: lessons } = useCollection('lessons', byCourse)
  const [paste, setPaste] = useState('')
  const [onlyUncovered, setOnlyUncovered] = useState(false)

  const course = courses.find((c) => c.id === courseId)
  const usage = outcomeUsage(lessons)
  const stats = coverage(outcomes, lessons)
  const parsed = parseOutcomeList(paste, outcomes.map((o) => o.text))
  const sorted = sortOutcomes(outcomes)
  const shown = onlyUncovered ? sorted.filter((o) => !usage.has(o.id)) : sorted

  function addPasted() {
    const batch = newBatch()
    parsed.forEach((text, i) =>
      createDoc('learning_outcomes', { course_id: courseId, text, position: outcomes.length + i }, batch),
    )
    commit(batch)
    setPaste('')
  }

  function remove(o: LearningOutcome) {
    const used = usage.get(o.id)
    if (!confirm(used ? `Цей ОРН вибрано в уроках ${used.join(', ')}. Видалити його звідусіль?` : 'Видалити ОРН?'))
      return
    const batch = newBatch()
    batch.delete(ref('learning_outcomes', o.id))
    for (const l of lessons)
      if (l.outcome_ids?.includes(o.id))
        updateFields('lessons', l.id, { outcome_ids: l.outcome_ids.filter((x) => x !== o.id) }, batch)
    commit(batch)
  }

  return (
    <div className="page">
      <main className="main">
        <Link to={`/ktp/${courseId}`} className="back">
          <ArrowLeft size={14} /> {course ? courseTitle(course) : 'КТП'}
        </Link>
        <h1>Очікувані результати навчання</h1>

        <div className="chips">
          <button className={onlyUncovered ? 'chip plain' : 'chip plain on'} onClick={() => setOnlyUncovered(false)}>
            Усі · {stats.total}
          </button>
          <button className={onlyUncovered ? 'chip plain on' : 'chip plain'} onClick={() => setOnlyUncovered(true)}>
            Непокриті · {stats.total - stats.covered}
          </button>
        </div>

        <section className="panel outcomes">
          {shown.length === 0 && (
            <p className="muted">
              {onlyUncovered ? 'Усі ОРН уже прив’язані до уроків.' : 'Довідник порожній. Встав ОРН з навчальної програми нижче.'}
            </p>
          )}
          {shown.map((o) => {
            const used = usage.get(o.id)
            return (
              <div key={o.id} className="outcome-row">
                <span className="no num">{sorted.indexOf(o) + 1}</span>
                <InlineText
                  multiline
                  label="Текст ОРН"
                  value={o.text}
                  onSave={(text) => text && updateFields('learning_outcomes', o.id, { text })}
                />
                {used ? (
                  <span className="badge num">ур. {used.join(', ')}</span>
                ) : (
                  <span className="badge warn-badge">не використано</span>
                )}
                <button className="icon-btn del" onClick={() => remove(o)} aria-label="Видалити ОРН">
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </section>

        <section className="panel form">
          <h3>Вставити списком</h3>
          <p className="muted">
            Скопіюй ОРН з навчальної програми: кожен з нового рядка. Нумерацію й маркери списку застосунок прибере сам, а
            повтори пропустить.
          </p>
          <textarea
            className="field paste"
            rows={6}
            placeholder={'пояснює поняття алгоритму\nнаводить приклади алгоритмів з повсякдення'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button className="btn" disabled={parsed.length === 0} onClick={addPasted}>
            Додати {parsed.length || ''}
          </button>
        </section>
      </main>
    </div>
  )
}
